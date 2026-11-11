# Анализ: Сбивание врагов и уровни

Код: ветка `feature/002-enemies-and-levels`, база `20da398` + незакоммиченные задачи
005–007 в рабочем дереве (`npm test` — 157 тестов зелёные, `typecheck` чистый).

## Общее описание функциональности

Первая задача фичи 002, где в игре появляется геймплей: выстрел игрока сбивает врага
(в строю — пикирования ещё нет). Сбитый враг на месте проигрывает короткий взрыв
(2 кадра, 16 тиков) и исчезает; выстрел игрока исчезает в тике попадания, и сразу
можно стрелять снова. Когда уничтожен (и доиграл взрыв) последний враг, бой переходит
в паузу 1,5 с (без надписи), затем появляется строй следующего уровня. Уровней в
таблице два (различаются раскладкой), после конца таблицы повторяется последний (В7).
Для проверки глазами — `?level=N` в dev-сборке.

Ощущение: игрок подводит корабль под врага, стреляет — враг вспыхивает и пропадает;
строй продолжает качаться без него (покачивание — по полной ширине раскладки, размах
не меняется). Последний враг — короткая тишина, новый строй.

## Модели данных и состояние

**Enemy** (расширение `src/game/enemy.ts`):

| Состояние   | Позиция                              | Коллизии | Рендер                                   | Переход                                   |
| ----------- | ------------------------------------ | -------- | ---------------------------------------- | ----------------------------------------- |
| `formation` | каждый `update` — из слота           | да       | спрайт вида                              | `kill()` → `exploding` (`stateTicks = 0`) |
| `exploding` | стоит на месте (слот не отслеживает) | нет      | кадр взрыва по `stateTicks`, центрирован | `stateTicks === EXPLOSION_TICKS` → `dead` |
| `dead`      | не меняется                          | нет      | не рисуется                              | —                                         |

- `stateTicks` — «Правило тиков переходов»: `0` в тике входа (`kill()`), `+1` в начале
  каждого `update`, затем проверка таймера, затем поведение нового состояния. В
  `exploding` видны значения `0 … 15`; в `update`, где счётчик стал 16, враг уже `dead`.
- `isAlive` = `formation` (в 008; позже `| diving | returning`).
- `kill()` — из живого состояния; вне живого игнорируется.
- `EnemyState` расширяется до `'formation' | 'exploding' | 'dead'`.
- `Enemy.update()` остаётся без параметров (таймеры в тиках, `dt` не нужен; `dt`/`env`
  появятся в 009 — так в таблице «Появление API», строка 009).
- Массив врагов не перестраивается: `dead` остаётся в `wave.enemies`.

**Константы взрыва** (стартовые, визуальные — утверждает владелец):

| Константа               | Где            | Значение                                               |
| ----------------------- | -------------- | ------------------------------------------------------ |
| `EXPLOSION_FRAMES`      | `enemy-art.ts` | 2 спрайта, ширина нечётная, ≤ 13 × 10                  |
| `EXPLOSION_FRAME_TICKS` | `enemy.ts`     | 8                                                      |
| `EXPLOSION_TICKS`       | `enemy.ts`     | `EXPLOSION_FRAMES.length * EXPLOSION_FRAME_TICKS` = 16 |

Кадр: `EXPLOSION_FRAMES[Math.floor(stateTicks / EXPLOSION_FRAME_TICKS)]`. Позиция:
`Math.floor(x) + Math.floor((width - frame.width) / 2)`, аналогично по `y`
(`noUncheckedIndexedAccess` — индекс массива даёт `Sprite | undefined`, рендер должен
это обработать).

**Player** (`src/game/player.ts`): + `removeShot()` — `activeShot = null`; слот огня
свободен уже в следующем тике (огонь в `Player.update` идёт до коллизий, поэтому в тике
попадания новый выстрел не появится).

**Wave** (`src/game/wave.ts`): + `get isCleared` — все враги `dead` (не `exploding`).

**Battle** (`src/game/battle.ts`):

| Поле / API                 | Сейчас                             | Станет                                                |
| -------------------------- | ---------------------------------- | ----------------------------------------------------- |
| `wave`                     | `readonly wave: Wave` (поле)       | `get wave(): Wave` (приватное изменяемое поле)        |
| `level`                    | нет                                | `get level(): number`, старт = `startLevel ?? 1`      |
| `phase`                    | нет                                | `get phase(): BattlePhase` (`'playing' \| 'cleared'`) |
| `phaseTicks`               | нет                                | приватный счётчик паузы                               |
| `LEVEL_PAUSE_TICKS`        | нет                                | `90` (В8, 1,5 с)                                      |
| `BattleOptions.startLevel` | нет                                | `startLevel?: number` (по умолчанию 1)                |
| `levels`                   | используется только в конструкторе | нужен и при переходе — хранить в поле                 |
| `rng`                      | только в конструктор `Wave`        | нужен и при переходе — хранить в поле                 |

Переходы фаз (шаг 4 тика): `playing` и `wave.isCleared` → `cleared`, `phaseTicks = 0`;
в каждом следующем тике `phaseTicks++`; при `phaseTicks === LEVEL_PAUSE_TICKS` —
`level++`, `wave = new Wave(levelConfig(level, levels), rng)`, фаза `playing`. Новая
волна рисуется в этом же тике в начальных позициях, первый `update` — в следующем.

Тайминг от попадания до новой волны: попадание в шаге 3 тика `T` → `exploding`; в
`update` тика `T+16` враг `dead`; в шаге 4 тика `T+16` → `cleared`; новая волна — в
тике `T+16+90`.

**LevelConfig / LEVELS** (`src/game/levels.ts`): полей не добавляется (`layout`,
`swaySpeed`). Строка уровня 2 по «Уточнениям для реализации»:
`['.SSSSSSSS.', 'SSSSSSSSSS', 'DDDDDDDDDD', 'DDDDDDDDDD']`, `swaySpeed = 15`
(38 врагов, 4 ряда, ширина 10 — проходит существующий тест `LEVELS` «cols = 10»).

**test-levels.ts**: + `TWO_LEVELS` — уровень 1 — один враг, уровень 2 — два, раскладки
разные, `swaySpeed = 15`; враги далеко от столбца выстрела `x = 127` (как у
`ONE_CORNER_ENEMY`). Конкретные раскладки — на усмотрение плана (напр.
`['D..........']` и `['D.........D']`).

## Связанные модули и сущности

| Модуль / сущность        | Назначение                                            | Файлы                                             |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------------- |
| `Enemy`, `ENEMY_KINDS`   | автомат врага, размеры из спрайта                     | `src/game/enemy.ts`                               |
| Арт врагов               | спрайты `drone`/`striker`, + кадры взрыва             | `src/game/enemy-art.ts`                           |
| `Wave`                   | враги уровня, строй; + `isCleared`                    | `src/game/wave.ts`                                |
| `Formation`              | слоты, покачивание (не меняется)                      | `src/game/formation.ts`                           |
| `Player`, `Shot`, `Ship` | корабль и выстрел; + `removeShot`                     | `src/game/player.ts`, `shot.ts`, `ship.ts`        |
| коллизии (новое)         | `Rect`, `overlaps`, `resolveCollisions` (правило 1)   | `src/game/collisions.ts`                          |
| `Battle`                 | агрегат боя; + фазы, уровень, `startLevel`, коллизии  | `src/game/battle.ts`                              |
| `drawBattle`             | отрисовка; + взрыв вместо спрайта, `dead` не рисуется | `src/game/battle-render.ts`                       |
| `LEVELS`, `levelConfig`  | таблица уровней; + уровень 2                          | `src/game/levels.ts`                              |
| тестовые таблицы         | `ONE_CORNER_ENEMY`, + `TWO_LEVELS`                    | `src/game/test-levels.ts`                         |
| сцены                    | проброс `BattleOptions` / `startLevel`                | `src/game/scenes/play-scene.ts`, `title-scene.ts` |
| точка входа              | `?level=N` в dev                                      | `src/main.ts`                                     |

## Точки встраивания

- **Цикл боя** — `Battle.update(dt, intent)` (`src/game/battle.ts:27`): сейчас
  «игрок → волна». Добавляются шаг 3 (`resolveCollisions(player, wave)` только в фазе
  `playing`) и шаг 4 (фазы). В фазе `cleared` игрок и волна обновляются как обычно
  (волна из `dead` врагов — только покачивание строя), коллизий нет.
- **Волна** — `Wave.update(dt)` (`src/game/wave.ts:27`) без изменений по порядку:
  `formation.update` → `enemy.update()` всех; ветвление по состоянию — внутри `Enemy`.
- **Коллизии** — новый `collisions.ts`, правило 1: выстрел игрока × живые враги →
  среди пересекающихся самый нижний (наибольший `y + height`, при равенстве — меньший
  индекс в `wave.enemies`) `kill()`, `player.removeShot()`. `overlaps` — строгий AABB
  по `Math.floor(x)`, `Math.floor(y)` (касание краями — не пересечение). У `Shot` нет
  полей `width/height` — прямоугольник выстрела собирается из `SHOT_WIDTH/SHOT_HEIGHT`
  (`shot.ts` не трогаем). `Enemy` структурно совместим с `Rect`.
- **Рендер** — `drawBattle` (`src/game/battle-render.ts:14`): цикл врагов ветвится по
  состоянию: живой — спрайт вида; `exploding` — кадр взрыва; `dead` — пропуск. Порядок
  слоёв не меняется (выстрел → враги → корабль).
- **Сцены** — `PlayScene(rng, starfield?, opts?)` (`src/game/scenes/play-scene.ts:17`)
  пробрасывает `opts` в `new Battle(createRng(...), opts)`; порядок «звёзды → seed боя»
  сохраняется. `TitleScene(rng, startLevel?)` (`title-scene.ts:13`) создаёт
  `new PlayScene(this.rng, this.starfield, { startLevel })`.
- **Ввод/URL** — `src/main.ts:17`: только при `import.meta.env.DEV` читать `level` из
  `location.search`; не целое ≥ 1 (в т.ч. пусто, `0`, `1.5`, `abc`) → 1;
  `new TitleScene(rng, startLevel)`. `import.meta.env` типизирован (`tsconfig` —
  `types: ["vite/client"]`); в прод-сборке ветка вырезается.
- **HUD** — нет (надписи «LEVEL N» нет, В8).

## Файлы и места в коде

| Файл                                    | Что содержит                                       | Что изменить / создать                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/game/collisions.ts`                | —                                                  | **создать**: `Rect`, `overlaps`, `resolveCollisions(player, wave)` — только правило 1                                                                                                                                                                                                                                                                       |
| `src/game/collisions.test.ts`           | —                                                  | **создать**: касание краями, пересечение по `floor` дробных координат, убивает ровно одного — самого нижнего, при равенстве — меньший индекс, `exploding`/`dead` не задеваются, выстрел снят, нет выстрела — ничего                                                                                                                                         |
| `src/game/enemy.ts`                     | `ENEMY_KINDS`, `EnemyState = 'formation'`, `Enemy` | `EnemyState` + `exploding`/`dead`; `kill()`, `stateTicks`, `isAlive`; `EXPLOSION_FRAME_TICKS`, `EXPLOSION_TICKS`; ветки в `update()`                                                                                                                                                                                                                        |
| `src/game/enemy.test.ts`                | старт в слоте, следование покачиванию, спрайты     | + `kill` → `exploding` → `dead` ровно через `EXPLOSION_TICKS`, стоит на месте в `exploding`, повторный `kill` игнорируется, `isAlive`, `stateTicks`; инвариант кадров взрыва (нечётная ширина, ≤ 13 × 10)                                                                                                                                                   |
| `src/game/enemy-art.ts`                 | `DRONE_SPRITE`, `STRIKER_SPRITE`                   | + `EXPLOSION_FRAMES` (2 кадра)                                                                                                                                                                                                                                                                                                                              |
| `src/game/wave.ts`                      | `Wave`                                             | + `get isCleared`                                                                                                                                                                                                                                                                                                                                           |
| `src/game/wave.test.ts`                 | раскладка, покачивание                             | + `isCleared`: `false` при живых и при `exploding`, `true` когда все `dead`                                                                                                                                                                                                                                                                                 |
| `src/game/player.ts`                    | `Player`                                           | + `removeShot()`                                                                                                                                                                                                                                                                                                                                            |
| `src/game/player.test.ts`               | автомат выстрела                                   | + `removeShot` освобождает слот (огонь в следующем `update` создаёт новый выстрел)                                                                                                                                                                                                                                                                          |
| `src/game/battle.ts`                    | `Battle(rng, { levels })`, `readonly wave`         | `BattlePhase`, `LEVEL_PAUSE_TICKS`, `startLevel`, `level`, `phase`, `wave` → getter, хранение `rng`/`levels`, шаги 3–4 тика                                                                                                                                                                                                                                 |
| `src/game/battle.test.ts`               | волна из таблицы, движение                         | + фаза `cleared` после гибели последнего (через `kill()` и прогон взрыва); на `TWO_LEVELS` ровно через `LEVEL_PAUSE_TICKS` — уровень 2 и волна второй строки в начальных позициях, первый `update` — в следующем тике; уровень 3 — снова строка 2; `startLevel`; попадание через `Battle.update` (выстрел снят, враг `exploding`); коллизий нет в `cleared` |
| `src/game/battle-render.ts`             | `drawBattle`                                       | ветки `exploding` (кадр, центрирование) и `dead`                                                                                                                                                                                                                                                                                                            |
| `src/game/battle-render.test.ts`        | полные списки вызовов на `ONE_CORNER_ENEMY`        | + `exploding` — кадр взрыва (оба кадра, центрирование), `dead` — не рисуется; существующие тесты не меняются                                                                                                                                                                                                                                                |
| `src/game/levels.ts`                    | `LEVELS` (1 строка)                                | + строка уровня 2                                                                                                                                                                                                                                                                                                                                           |
| `src/game/levels.test.ts`               | `LEVELS` построчно, уровень 1                      | + «level 2 has the agreed layout»; `it.each` по строкам подхватит её сам                                                                                                                                                                                                                                                                                    |
| `src/game/test-levels.ts`               | `ONE_CORNER_ENEMY`                                 | + `TWO_LEVELS`                                                                                                                                                                                                                                                                                                                                              |
| `src/game/scenes/play-scene.ts`         | `PlayScene(rng, starfield?)`                       | третий параметр `opts?: BattleOptions` → `Battle`                                                                                                                                                                                                                                                                                                           |
| `src/game/scenes/play-scene.test.ts`    | тесты корабля на `LEVELS`                          | тесты корабля/выстрела → `new PlayScene(createRng(1), undefined, { levels: ONE_CORNER_ENEMY })`; «builds the level 1 wave» остаётся на `LEVELS`; + сквозной «сбил врага» (корабль под врагом в углу, огонь, через N тиков враг `exploding`, выстрел снят)                                                                                                   |
| `src/game/scenes/title-scene.ts`        | `TitleScene(rng)`                                  | `startLevel?` → `PlayScene`                                                                                                                                                                                                                                                                                                                                 |
| `src/game/scenes/title-scene.test.ts`   | переход по `start`                                 | + `startLevel` доходит до `battle.level`                                                                                                                                                                                                                                                                                                                    |
| `src/main.ts`                           | создание `TitleScene(rng)`                         | dev-разбор `?level=N`                                                                                                                                                                                                                                                                                                                                       |
| `second-brain/architecture/overview.md` | описание модулей и граф                            | + `collisions.ts`, изменения `enemy`/`wave`/`player`/`battle`/`battle-render`/сцен/`main`, граф импортов                                                                                                                                                                                                                                                    |

Граф импортов после задачи: `battle → {player, wave, levels, collisions}`;
`collisions → shot` (`Player`, `Wave`, `Enemy` — `import type`);
`battle-render → {art, enemy (ENEMY_KINDS, EXPLOSION_FRAME_TICKS), enemy-art
(EXPLOSION_FRAMES), sprite, shot}`; `enemy → enemy-art` (уже есть — `EXPLOSION_TICKS`
выводится из `EXPLOSION_FRAMES.length`); `title-scene → play-scene` (без изменений).
Циклов нет.

## Тестируемость

Полностью unit-тестами (детерминизм — счётчики в тиках, позиции прямой установкой,
`Rng` в 008 не используется):

- `overlaps`, правило «самый нижний», игнор `exploding`/`dead` — на сущностях с
  координатами, выставленными напрямую (`enemy.x/y`, `shot.y` — публичные поля;
  `ship.x` тоже).
- Автомат `Enemy`: `kill()` + N вызовов `update()`.
- `Wave.isCleared`, `Player.removeShot`.
- `Battle`: фазы и точный тик перехода на `TWO_LEVELS` (враги убиваются `kill()`
  напрямую, затем `update` с `IDLE`); `startLevel`; волна за концом таблицы.
- Рендер — `recorder()` из `canvas-test-utils.ts` (полное сравнение вызовов, как в
  текущих тестах).
- Сквозной тест сцены через `step()`: корабль ставится под врага (`ship.x` напрямую
  или движением), враг `ONE_CORNER_ENEMY` в `x = 42 + offset`, `y = 34`, высота 8;
  выстрел 4 px/тик от `y = 204`; покачивание 0,25 px/тик сдвигает врага примерно на
  10 px за время полёта — расчёт тика и позиции корабля — в плане.

Только глазами: вид взрыва (**утверждает владелец**), читаемость паузы и появления
нового строя, `?level=2` в `npm run dev`. `main.ts` тестами не покрыт (DOM) — разбор
`?level` проверяется глазами: `?level=2`, `?level=abc`, `?level=0`, `?level=99`.

## Зависимости и ограничения

- Зависит от 007 (покачивание) — реализовано в рабочем дереве.
- Фиксированный шаг 60 тиков; все таймеры — целые тики (ADR 003).
- Туннелирования в 008 нет: враги по Y неподвижны, выстрел 4 px/тик < `SHOT_HEIGHT` +
  высота врага (≥ 8). Инвариант по `maxDown` — задача 009, не здесь.
- Инвариант `EXPLOSION_TICKS < DOWN_TICKS` — с задачи 011 (`DOWN_TICKS` ещё нет).
- `wave.clearShots()` при входе в `cleared` — задача 012 (вражеских выстрелов нет).
- `exactOptionalPropertyTypes` выключен — `{ startLevel: undefined }` из `TitleScene`
  допустим; в `Battle` — `opts.startLevel ?? 1`. `levelConfig` бросает на не целом —
  санитизация `?level` в `main.ts` обязательна (иначе исключение при старте игры).
- `Battle.wave` перестаёт быть `readonly`-полем — внешний код (`battle-render`, тесты)
  читает `battle.wave`, геттер совместим.
- Существующие тесты `play-scene.test.ts` на `LEVELS` с началом попаданий станут
  хрупкими (зависят от покачивания и раскладки) — поэтому перевод на
  `ONE_CORNER_ENEMY`; передача опций требует явного `undefined` вторым аргументом.
- Производительность: проверка коллизий — до 38 врагов × 1 выстрел за тик, ничтожно.

## Открытые вопросы

Блокирующих нет; вопросов к владельцу до реализации нет — все числа (16 тиков взрыва,
90 тиков паузы, раскладки уровней 1–2) заданы в дизайне.

1. **Приёмка взрыва владельцем — после реализации** (критерий готовности): спрайты
   `EXPLOSION_FRAMES` и цвета подбирает разработчик, владелец утверждает глазами.
2. **Расхождение в дизайне (для архитектора, на реализацию не влияет).** Граф импортов
   в `design.md` указывает `battle-render → enemy (ENEMY_KINDS, EXPLOSION_TICKS)`; для
   выбора кадра рендеру нужны `EXPLOSION_FRAME_TICKS` (из `enemy.ts`) и
   `EXPLOSION_FRAMES` (из `enemy-art.ts`, ребро `battle-render → enemy-art` в дизайне
   есть). Анализ следует «Уточнениям» (формула кадра по `EXPLOSION_FRAME_TICKS`).
3. **Разбор `?level` — в `main.ts` без теста или чистой функцией с тестом** (решает
   план, к владельцу не выносится): дизайн помещает разбор в `main.ts`; логика —
   одна строка, достаточно проверки глазами.

## Ссылки на документацию

- `CLAUDE.md`
- `second-brain/game-design.md`
- `second-brain/architecture/overview.md`
- `second-brain/decisions/002-integer-speeds.md`, `003-slow-speeds-tick-timers.md`
- `second-brain/features/002-enemies-and-levels/design.md` — «Сущности и состояния»
  (Enemy, Battle — фазы, «Правило тиков переходов»), «Поток тика», «Интерфейсы»,
  «Уточнения для реализации» (точные строки `LEVELS`, тестовые таблицы, взрыв, «самый
  нижний», коллизии по `floor`, «Появление API по задачам» — строка 008), нарезка п. 4
- `second-brain/features/002-enemies-and-levels/discussion.md` — раунд 2 (блокер 2,
  рек. 4, 7), раунд 3 (рек. 3)
- `second-brain/tasks/tasks/008-enemy-hits-levels/description.md`
