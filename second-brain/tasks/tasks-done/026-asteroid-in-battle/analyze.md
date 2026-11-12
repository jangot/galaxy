# Анализ: Астероид в бою

Рамка — согласованный `second-brain/features/006-asteroid-bonuses/design.md` (пункт 2б
нарезки, «Поток тика», «Рендер», «Интерфейсы», «Тестирование») и `discussion.md`
(раунд 3, реализация 025). Анализ уточняет дизайн по реальному коду рабочего дерева
(задачи 024 и 025 реализованы, не закоммичены; `npm test` — 834 зелёных).

## Общее описание функциональности

Модель астероида (`Asteroid`, `BonusField`, задача 025) уже есть, но ни к чему не
подключена. Задача — встроить её в бой:

- раз за уровень, на случайном тике фазы `playing` (300…900 тиков, 5–15 с), над верхним
  краем появляется астероид 12×12 и падает наискосок (1 px/тик вниз, ½ px/тик вбок);
- выстрел игрока, задевший летящий астероид, снимается, астероид взрывается (тот же
  взрыв, что у врагов), к счёту — `asteroidPoints(level)` (100 на 1-м уровне, 140 на 5-м);
- враги в приоритете: выстрел, который в этом тике уже убил врага, астероида не видит;
- астероид ни с чем, кроме выстрелов игрока, не взаимодействует: корабль, враги и
  вражеские выстрелы проходят сквозь него; рисуется самым задним слоем боя (над
  звёздами, под всеми выстрелами, врагами и кораблём);
- летящий астероид переживает смену уровня, в `cleared` его можно сбить (очки идут), в
  `over` коллизий нет — долетает;
- капсулы пока нет: `collected` всегда `null` (задача 027).

В игре: в каждом уровне через 5–15 с сверху у одного из углов выплывает астероид и
идёт по диагонали вниз; его можно сбить и получить очки.

## Модели данных и состояние

Новое состояние — только в `Battle` и `PlayScene`; модели уже готовы.

| Что                                         | Где                                   | Значение / смысл                                                                       |
| ------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| `BonusOptions { rng }`                      | `battle.ts` (новый интерфейс)         | Свой генератор поля бонусов; окно появления — всегда умолчание `ASTEROID_SPAWN_WINDOW` |
| `BattleOptions.bonuses?`                    | `battle.ts`                           | Нет — бонусов нет совсем (`battle.bonuses === null`), старые тесты не меняются         |
| `Battle.bonuses: BonusField \| null`        | `battle.ts` (геттер)                  | Для рендера и тестов                                                                   |
| `BonusEvents { asteroidBroken, collected }` | `collisions.ts` (новый интерфейс)     | `collected: BonusKind \| null`, в 026 всегда `null`                                    |
| `BONUS_SEED_SALT = 0x9e3779b9`              | `play-scene.ts` (модульная константа) | seed бонусов = `(battleSeed ^ SALT) >>> 0`                                             |
| `ASTEROID_SPRITE` 12×12                     | `bonus-art.ts` (новый)                | Хитбокс = картинка = `ASTEROID_SIZE`                                                   |

Готовое из 025 (проверено по коду):

- `Asteroid` (`src/game/asteroid.ts`): публичные `x`, `y` (мутируемые — тесты могут
  ставить астероид куда нужно, как `ramShip` ставит врага), `width = height = 12`,
  `dir`, `bonus`, `state: 'flying' | 'exploding' | 'gone'`, `stateTicks`, `hit()` (только
  из `flying` → `exploding`, `true`). Объект подходит под `Rect` из `collisions.ts`.
- `BonusField` (`src/game/bonus-field.ts`): `asteroid`, `spawnTick`, `levelTicks`,
  `startLevel()` (один вызов `rng`), `update(dt, spawning)` (сначала двигает и убирает
  `gone`, затем при `spawning` — `levelTicks++` и появление; новый не движется в тике
  появления), `hitAsteroid()` (сейчас только `asteroid.hit()`, капсулы нет). Геттера
  `capsule` нет — появится в 027.
- `asteroidPoints(level)` (`src/game/score.ts`) — через `levelPoints`, бросает на плохом
  уровне.
- Порядок `rng` поля: `startLevel` — тик; появление — `dir` (`rng() < 0.5 ? -1 : 1`),
  `offset`, `bonus`. Заглушка `() => 0` даёт тик 300, `dir = -1`, `offset = 0`
  (x = 244), `bonus = BONUS_KINDS[0]`.

Тайминг относительно фаз `Battle`: `startLevel()` вызывается в конструкторе и в конце
тика перехода `cleared → playing` (в `updatePhase`, после `createWave`). Первый
следующий `update` поля с `spawning = true` даёт `levelTicks = 1`, т. е. астероид
появляется в `battle.update` номер `spawnTick` от начала уровня. `spawning` = фаза **на
начало** тика (`phase === 'playing'` до `updatePhase`), поэтому тик, в котором
`playing → cleared`, ещё считается, а тик перехода `cleared → playing` — нет.

## Связанные модули и сущности

| Модуль / сущность                   | Назначение                                                                                    | Файлы                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `Battle`                            | Агрегат боя: игрок, волна, фазы, счёт; сюда подключается поле бонусов                         | `src/game/battle.ts`                                    |
| `BonusField`, `Asteroid`            | Модель астероида (готова в 025)                                                               | `src/game/bonus-field.ts`, `src/game/asteroid.ts`       |
| Коллизии                            | `overlaps`, `resolveCollisions` (правило 1 по `player.shots`); новая `resolveBonusCollisions` | `src/game/collisions.ts`                                |
| `Player.shots` / `removeShot(shot)` | Массив заменяется при удалении — цикл по `shots` с удалением безопасен (024)                  | `src/game/player.ts`                                    |
| Очки                                | `asteroidPoints`, `addScore` (единственная точка изменения счёта, пороги доп. жизни)          | `src/game/score.ts`, `src/game/battle.ts`               |
| Рендер боя                          | `drawBattle`, `drawExplosion` (private), `drawSprite`                                         | `src/game/battle-render.ts`, `src/game/sprite.ts`       |
| Арт                                 | `parseSprite`; палитры и спрайты (образец — `enemy-art.ts`, `art.ts`)                         | `src/game/bonus-art.ts` (новый)                         |
| Сцена                               | Создаёт `Starfield` и `Battle` из `rng` сцены                                                 | `src/game/scenes/play-scene.ts`                         |
| ADR 003                             | Медленные скорости ½ px/тик                                                                   | `second-brain/decisions/003-slow-speeds-tick-timers.md` |

## Точки встраивания

1. **`Battle` конструктор:** при `opts.bonuses` — `new BonusField(opts.bonuses.rng)` и
   сразу `startLevel()`; иначе `null`. Вызов только `rng` бонусов — `rng` боя (волна,
   директор атак) не затронут.
2. **`Battle.update`, порядок тика (дизайн, «Поток тика»):**
   1. `player.update`; 2) `wave.update`; 3) `bonuses?.update(dt, phase === 'playing')`;
   2. только `playing` — `resolveCollisions` → очки за убийства; 5) `playing` или
      `cleared` и есть поле — `resolveBonusCollisions(player, bonuses)` →
      `asteroidBroken` → `addScore(asteroidPoints(level))`; `collected` пока игнорируется
      (всегда `null`); 6) `updatePhase`.
      Фаза для шагов 3–5 — на начало тика (как сейчас у шага 4).
3. **`Battle.updatePhase`:** на переходе `cleared → playing` после `createWave()` —
   `bonuses?.startLevel()`.
4. **`resolveBonusCollisions` (`collisions.ts`):** при астероиде в `flying` — первый по
   порядку `player.shots` выстрел, пересекающий его (`overlaps`, хитбокс выстрела как в
   правиле 1), снимается `player.removeShot`, вызывается `field.hitAsteroid()`; не
   больше одного попадания за тик (после `hit()` астероид `exploding`, второй выстрел
   пролетает). Корабль не проверяется (капсулы нет). `BonusField` — `import type`,
   `BonusKind` — `import type`; цикла импортов нет (`bonus-field` не импортирует
   `collisions`).
5. **`drawBattle`:** первым слоем — астероид `battle.bonuses?.asteroid`: `flying` —
   `drawSprite(ASTEROID_SPRITE, floor(x), floor(y))`; `exploding` — `drawExplosion`
   по `stateTicks` в его прямоугольнике (кадр 11 px шириной центрируется в 12 — влезает);
   `gone` поле уже убрало (но ветку «ничего» стоит держать). Дальше — как сейчас.
6. **`PlayScene` конструктор:** `battleSeed = Math.floor(rng() * 2 ** 32)` (тот же
   единственный вызов `rng` сцены после звёзд), `new Battle(createRng(battleSeed),
{ ...opts, bonuses: opts?.bonuses ?? { rng: createRng((battleSeed ^ BONUS_SEED_SALT) >>> 0) } })`.
   `TitleScene` создаёт `PlayScene` через этот же конструктор — бонусы в игре
   включаются автоматически.
7. **HUD, ввод, `game-over-render`, `engine/`** — не меняются.

## Файлы и места в коде

| Файл                                                    | Что содержит                                                                  | Что изменить / создать                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/game/bonus-art.ts`                                 | —                                                                             | **Новый:** `ASTEROID_SPRITE` 12×12 (`parseSprite`, своя палитра — каменный/серо-коричневый, оригинальный рисунок)                                                                                                                                              |
| `src/game/bonus-art.test.ts`                            | —                                                                             | **Новый:** спрайт разбирается, 12×12, `= ASTEROID_SIZE`                                                                                                                                                                                                        |
| `src/game/asteroid.ts`                                  | Комментарий `ASTEROID_SIZE` «(that test comes with the sprite, task 026)»     | Поправить комментарий (тест теперь есть)                                                                                                                                                                                                                       |
| `src/game/collisions.ts`                                | `resolveCollisions`, `overlaps`                                               | `BonusEvents`, `resolveBonusCollisions(player, field)`; док-комментарий (порядок, приоритет врагов, ≤ 1 попадания)                                                                                                                                             |
| `src/game/collisions.test.ts`                           | Тесты правил 1–3                                                              | Тесты `resolveBonusCollisions` (см. «Тестируемость»)                                                                                                                                                                                                           |
| `src/game/battle.ts`                                    | `BattleOptions`, `Battle`, `update`, `updatePhase`, док `score`               | `BonusOptions`, `BattleOptions.bonuses`, поле/геттер `bonuses`, шаги 3 и 5, `startLevel` в конструкторе и `updatePhase`; комментарии: класс-док, `score` («grows only by kills during 'playing'» → ещё астероид, в т. ч. в `cleared`), порядок тика в `update` |
| `src/game/battle.test.ts`                               | Тесты боя без бонусов                                                         | Новый `describe` с бонусами; существующие не трогать                                                                                                                                                                                                           |
| `src/game/battle-render.ts`                             | `drawBattle`, `drawExplosion`                                                 | Астероид первым слоем; док «back to front»                                                                                                                                                                                                                     |
| `src/game/battle-render.test.ts`                        | Рекордер `fillRect`                                                           | Спрайт / взрыв / ничего; астероид раньше всех выстрелов, врагов, корабля                                                                                                                                                                                       |
| `src/game/scenes/play-scene.ts`                         | Создание `Starfield` и `Battle`                                               | Производный seed бонусов, `BONUS_SEED_SALT`, `opts?.bonuses ??`; док конструктора («opts go to the Battle as is» больше не так)                                                                                                                                |
| `src/game/scenes/play-scene.test.ts`                    | Тесты сцены                                                                   | Бой получает `bonuses`; заглушка не затирается; «как до фичи»                                                                                                                                                                                                  |
| `second-brain/decisions/003-slow-speeds-tick-timers.md` | ADR 003                                                                       | Строка «Применение: снос астероида (фича 006)»; ADR 004 не трогать                                                                                                                                                                                             |
| `second-brain/architecture/overview.md`                 | Описание `battle`, `collisions`, `battle-render`, `play-scene`, граф импортов | См. «Открытые вопросы», В1                                                                                                                                                                                                                                     |

## Тестируемость

Всё, кроме вида спрайта, покрывается юнит-тестами без canvas.

- **`collisions.test.ts`** (`resolveBonusCollisions`, поле на заглушке `rng` с
  выпущенным астероидом, позиция ставится напрямую): выстрел, пересекающий летящий
  астероид, снимается, `asteroidBroken = true`, астероид `exploding`; `collected ===
null`; без астероида / астероид `exploding` — ничего, выстрел летит; два выстрела
  поверх — снимается только первый по порядку; **враг в приоритете**: `resolveCollisions`
  затем `resolveBonusCollisions` в одном тике, выстрел над врагом и астероидом — убит
  враг, астероид цел; **корабль, пересекающий астероид, не сбит** (`player.state`
  остаётся `active`, жизни те же).
- **`battle.test.ts`** (новый `describe`, `bonuses: { rng: stub }`): без `bonuses` —
  `battle.bonuses === null`; с ним — `spawnTick` вытянут в конструкторе и на новом
  уровне (`clearWave`); астероид появляется на тике `spawnTick` (заглушка `0` → тик 300,
  прогон пассивного уровня `ONE_CORNER_ENEMY` дешёвый); попадание через `update` даёт
  ровно `asteroidPoints(level)`; враг в приоритете при общем тике; астероид поверх
  корабля — корабль цел; не появляется в `cleared` (счётчик стоит); летящий переживает
  смену уровня и сбивается в `cleared` с очками; в `over` попадания нет; очки за
  астероид пересекают 5000 → доп. жизнь (через `addScore`). Число вызовов `rng` боя не
  меняется (тот же выбор вылетов, что без бонусов — можно сравнить с боем без `bonuses`).
- **`battle-render.test.ts`**: `flying` — вызовы спрайта по `floor(x/y)`; `exploding` —
  кадр взрыва по центру; без поля / без астероида — вызовов нет; порядок — вызовы
  астероида раньше вражеских выстрелов, выстрелов игрока, врагов и корабля.
- **`bonus-art.test.ts`**: `ASTEROID_SPRITE` 12×12 и `= ASTEROID_SIZE`.
- **`play-scene.test.ts`**: `scene.battle.bonuses` не `null`; переданный
  `opts.bonuses` с заглушкой `rng` не затирается — астероид появляется ровно на 300-м
  тике (`dir`, `x`, `bonus` из заглушки); **«как до фичи»**: из того же seed собрать
  эталон по старой схеме (`Starfield` из `createRng(seed)`, затем
  `createRng(floor(ref() * 2**32))` для `Battle` без бонусов), прогнать N тиков и
  сравнить звёзды (`starfield.stars`, включая перезапуски — прогон достаточно длинный),
  позиции/состояния врагов волны; после конструктора следующий `rng()` сцены равен
  следующему `ref()` (сцена сделала ровно те же вызовы).
- Существующие тесты: ни один тест сцены/титула не стреляет дольше 300 тиков
  (максимум — 200 тиков движения, ~420 тиков `loseGame` без стрельбы), поэтому
  появившийся в сцене астероид их не задевает: он безопасен кораблю. Тесты `Battle`
  без `bonuses` не меняются.
- **Глазами** (без отдельной приёмки): раз за уровень падает наискосок, сбивается,
  даёт очки, проходит сквозь корабль, выстрелы видны поверх; вид спрайта.

## Зависимости и ограничения

- Зависит от 025 (модель) и 024 (`Player.shots`, замена массива в `removeShot`) — оба в
  рабочем дереве, не закоммичены.
- Фиксированный шаг (ADR 003): X астероида дробная (шаг ½), `overlaps` и рендер
  округляют вниз — дробные координаты уже поддержаны.
- Производительность: один объект и не больше двух выстрелов — несущественно.
- Детерминизм: поле бонусов — только свой `rng`; `rng` боя и `rng` сцены не получают
  ни одного нового вызова — для данного seed сцены звёзды и вылеты те же.
- Новый эффект: очки (и, через `addScore`, доп. жизнь за порог) теперь могут
  начисляться в `cleared`; правило «доп. жизнь, пока последний корабль `down`, отменяет
  конец игры» срабатывает и в этом случае — это следствие существующего правила, не
  новое поведение (нужно лишь отразить в комментарии `score`/`addScore`).
- `XOR` в JS работает над int32 — без `>>> 0` seed бывает отрицательным; `createRng`
  всё равно делает `>>> 0`, но по дизайну приведение явное.
- Риск: астероид пересекает HUD сверху — HUD рисуется после боя, так и задумано.

## Открытые вопросы

Вопросы к архитектору (числа и поведение игры не затрагивают, к владельцу — ничего):

- **В1. `architecture/overview.md` в 026 или в 027.** Дизайн и `discussion.md`
  (реализация 025, п. 4) относят описание новых модулей к 027 («до 026 модули ни к чему
  не подключены»). Но 026 меняет уже описанные в overview `battle.ts`
  (`BattleOptions { startLevel?, levels?, lives? }`, строки 239–247), `battle-render.ts`
  (254), `play-scene.ts` (289–298, «opts передаются в `Battle` как есть», схема seed),
  `collisions.ts` (199) и граф импортов (305–311) — после 026 они будут расходиться с
  кодом до 027. Варианты:
  (а) **рекомендую** — в 026 поправить только строки этих четырёх модулей и граф
  импортов (`bonuses`, порядок тика, `resolveBonusCollisions`, слой астероида, seed
  бонусов), описание `asteroid.ts`/`bonus-field.ts`/`bonus-art.ts` целиком — по-прежнему
  в 027 (то же правило «документ совпадает с кодом в той же задаче», что в п. 4);
  (б) всё в 027, как в нарезке.
- **Подтверждено, вопроса нет:** `BonusOptions` — только `{ rng }` (как в «Интерфейсах»),
  окно появления через бой не пробрасывается: тестам боя хватает заглушки `rng = 0`
  (тик 300 на пассивном уровне) и прямой установки `asteroid.x/y`. Упоминание в
  `discussion.md` (025, п. 1) «тесты боя смогут подать поле с окном 1…1» в интерфейс не
  вошло — расширять не будем.

Отдельных задач выносить не нужно.

## Ссылки на документацию

- `CLAUDE.md`
- `second-brain/game-design.md`
- `second-brain/features/006-asteroid-bonuses/design.md` (2б, «Поток тика», «Рендер», «Интерфейсы», «Тестирование»)
- `second-brain/features/006-asteroid-bonuses/discussion.md` (раунд 3, реализация 025)
- `second-brain/architecture/overview.md`
- `second-brain/decisions/002-integer-speeds.md`, `003-slow-speeds-tick-timers.md`, `004-half-pixel-dive.md`
- `second-brain/tasks/tasks-done/024-multi-shot/`, `second-brain/tasks/tasks-done/025-asteroid-model/`
