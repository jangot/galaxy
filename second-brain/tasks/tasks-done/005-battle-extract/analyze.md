# Анализ: Выделение Battle и battle-render

Код: ветка `feature/002-enemies-and-levels`, коммит `20da398` (фича 001 влита).
Базовая линия: `npm test` — 9 файлов, 76 тестов, все зелёные.

## Общее описание функциональности

Подготовительный рефакторинг фичи 002 (пункт 1 нарезки `design.md`), **без изменения
поведения**. Сейчас `PlayScene` сама владеет `Player` и сама рисует корабль и выстрел.
Задача разводит три ответственности:

- `Battle` (`src/game/battle.ts`) — агрегат боя без ввода и canvas. Пока внутри только
  `Player`; дальше (задачи 006+) в него лягут волна, уровни, фазы, коллизии.
- `drawBattle` (`src/game/battle-render.ts`) — вся отрисовка игровых сущностей; пока —
  выстрел игрока и корабль, перенос кода из `PlayScene.render`.
- `PlayScene` становится тонкой: звёзды + `battle.update(dt, readIntent(input))` +
  заливка/звёзды/`drawBattle`.

Плюс тестовый хелпер `src/game/canvas-test-utils.ts` с общим `recorder()` (фейковый ctx),
вынесенным из `sprite.test.ts`, — его будут использовать `sprite.test.ts` и новый
`battle-render.test.ts`.

В игре ничего не меняется: тот же экран, корабль движется и стреляет как в 001.

## Модели данных и состояние

Новых игровых состояний и чисел нет. Всё — из 001:

| Что                                       | Значение                                                                         | Где                 |
| ----------------------------------------- | -------------------------------------------------------------------------------- | ------------------- |
| `Battle.player`                           | `readonly`, `new Player()` (корабль по центру, `SHIP_Y = 208`)                   | `battle.ts` (новый) |
| `Battle` конструктор                      | без аргументов (`rng` и `BattleOptions` — в 006/008, иначе `noUnusedParameters`) | `battle.ts`         |
| `Battle.update(dt, intent: PlayerIntent)` | только `player.update(dt, intent)`                                               | `battle.ts`         |
| Шаг корабля                               | `SHIP_SPEED = 120` px/с = 2 px/тик                                               | `ship.ts`           |
| Выстрел                                   | `1×4`, `SHOT_SPEED = 240` px/с = 4 px/тик, цвет `SHOT_COLOR`                     | `shot.ts`, `art.ts` |
| Корабль                                   | `SHIP_SPRITE` 15×16                                                              | `art.ts`            |

Итоговая сигнатура по дизайну — `constructor(rng: Rng, opts?: BattleOptions)`; в этой
задаче — `constructor()` (таблица «Появление API по задачам», строка 005).

## Связанные модули и сущности

| Модуль/сущность                        | Назначение                                             | Файлы                                 |
| -------------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| `Player`, `PlayerIntent`, `readIntent` | агрегат «корабль + один выстрел», чтение клавиатуры    | `src/game/player.ts`                  |
| `Ship`                                 | движение, `spawnShot()`, константы размеров            | `src/game/ship.ts`                    |
| `Shot`                                 | полёт вверх, `SHOT_WIDTH/HEIGHT`                       | `src/game/shot.ts`                    |
| `SHIP_SPRITE`, `SHOT_COLOR`            | арт                                                    | `src/game/art.ts`                     |
| `drawSprite`                           | `fillRect` 1×1 на непрозрачный пиксель, ждёт целые x/y | `src/game/sprite.ts`                  |
| `Starfield`                            | фон; остаётся в сцене                                  | `src/game/starfield.ts`               |
| `PlayScene`                            | игровая сцена                                          | `src/game/scenes/play-scene.ts`       |
| `TitleScene`                           | создаёт `PlayScene(rng, starfield)` — не меняется      | `src/game/scenes/title-scene.ts`      |
| `step()`                               | тестовый прогон тиков как в `main.ts`                  | `src/game/scenes/scene-test-utils.ts` |
| `Scene`                                | интерфейс сцены — не меняется                          | `src/engine/scene.ts`                 |

## Точки встраивания

- **Цикл обновления:** `PlayScene.update` — `starfield.update(dt)` →
  `battle.update(dt, readIntent(input))` (порядок как сейчас; «Поток тика» дизайна).
  `readIntent` остаётся в сцене — единственное место чтения клавиатуры игроком;
  `Battle` ввод не знает.
- **Отрисовка:** `PlayScene.render` — заливка `#000` → `starfield.render(ctx)` →
  `drawBattle(ctx, this.battle)`. Внутри `drawBattle` порядок слоёв как в 001: выстрел
  (если есть) → корабль; координаты через `Math.floor` (так сейчас в сцене; `drawSprite`
  ждёт целые). Заливка и звёзды в `drawBattle` не входят.
- **Ввод, HUD, `main.ts`, `TitleScene`, движок** — не трогаются.
- **Тестовый доступ:** `PlayScene.readonly battle` (заменяет `readonly player`);
  тесты сцены идут через `scene.battle.player`.

## Файлы и места в коде

| Файл                                                                                                           | Что содержит                             | Что нужно изменить/создать                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/game/battle.ts`                                                                                           | —                                        | **новый**: класс `Battle` (`readonly player`, `update(dt, intent)`); импорт `Player` значением, `PlayerIntent` — `import type`                                                                   |
| `src/game/battle-render.ts`                                                                                    | —                                        | **новый**: `drawBattle(ctx, battle)` — перенос тела отрисовки выстрела и корабля из `play-scene.ts:31-37`; `Battle` — `import type`; импорты `art`, `sprite`, `shot`                             |
| `src/game/battle-render.test.ts`                                                                               | —                                        | **новый**: на `recorder()` — корабль и выстрел рисуются                                                                                                                                          |
| `src/game/canvas-test-utils.ts`                                                                                | —                                        | **новый**, test-only: `FillCall`, `recorder()` — перенос из `sprite.test.ts:4-21` (интерфейс `Call` → экспортируемый `FillCall`, как в «Интерфейсы» дизайна)                                     |
| `src/game/sprite.test.ts`                                                                                      | локальные `Call` и `recorder()`          | удалить локальные, импортировать `recorder` из `./canvas-test-utils`; тесты не меняются                                                                                                          |
| `src/game/scenes/play-scene.ts`                                                                                | владеет `Player`, рисует корабль/выстрел | `readonly battle = new Battle()` вместо `player`; `update` → `battle.update`; `render` → заливка, звёзды, `drawBattle`. Уходят импорты `art`, `sprite`, `shot`, `Player` (остаётся `readIntent`) |
| `src/game/scenes/play-scene.test.ts`                                                                           | 10 тестов через `scene.player`           | `scene.player` → `scene.battle.player`; логика и ожидания те же (первый тест можно дополнить проверкой `scene.battle` — `Battle`)                                                                |
| `second-brain/architecture/overview.md`                                                                        | описание модулей 001 и граф импортов     | дописать `battle`, `battle-render`, `canvas-test-utils`; переписать пункт `play-scene` (теперь `battle` + `drawBattle`, слои: заливка → звёзды → `drawBattle`); обновить граф импортов           |
| `src/game/player.ts`, `ship.ts`, `shot.ts`, `art.ts`, `sprite.ts`, `title-scene.ts`, `main.ts`, `src/engine/*` | —                                        | не меняются                                                                                                                                                                                      |

Граф импортов после задачи (подмножество итогового графа дизайна):
`play-scene → {starfield, battle, battle-render, player}` (`Rng`, `Input`, `Scene` — type),
`battle → player` (`PlayerIntent` — type), `battle-render → {art, sprite, shot}`
(`Battle` — type), `canvas-test-utils` — без импортов, только из `*.test.ts`. Циклов нет.
`player(type)` в `battle-render` из итогового графа дизайна сейчас не нужен — появится с
состояниями корабля (011); добавлять неиспользуемый импорт нельзя (линтер).

README в `src/game/` и `src/game/scenes/` нет.

## Тестируемость

- **Регрессия 001** — существующие тесты: `player.test.ts`, `ship.test.ts`,
  `shot.test.ts` не меняются; `play-scene.test.ts` — только путь доступа; `title-scene.test.ts`
  (проверяет `instanceof PlayScene`) — без изменений; `sprite.test.ts` — с общим
  `recorder()`, все 4 теста `drawSprite` должны пройти без правок ожиданий.
- **`battle-render.test.ts`** (environment `node`, без canvas; `recorder()` пишет только
  `fillRect` с текущим `fillStyle`):
  - без выстрела — ровно вызовы спрайта корабля: число вызовов = число непрозрачных
    пикселей `SHIP_SPRITE`, первый вызов — в `(floor(ship.x) + col, SHIP_Y + row)`
    первого непрозрачного пикселя (или bounding box вызовов = `15×16` от позиции корабля);
  - с выстрелом (через `player.update` с `fire: true` или прямой установкой) — есть вызов
    `{ fillStyle: SHOT_COLOR, x: shot.x, y: floor(shot.y), w: SHOT_WIDTH, h: SHOT_HEIGHT }`,
    и он идёт **до** вызовов корабля (порядок слоёв);
  - корабль сдвинут — вызовы смещаются вместе с ним.
- **`Battle`** — опционально маленький `battle.test.ts`: `update` с `{ move: 1, fire: true }`
  двигает корабль на шаг и создаёт выстрел (делегирование `Player`). Описание задачи его
  не требует (по дизайну `battle.test.ts` — про фазы и уровни, задача 008); решение — на
  стадии plan.
- **Только глазами:** экран игры не изменился (корабль, выстрел, звёзды, переход с титула).

## Зависимости и ограничения

- Зависит только от фичи 001 (в main).
- `tsconfig`: `noUnusedLocals`/`noUnusedParameters`, `verbatimModuleSyntax` — отсюда
  `constructor()` без `rng` и `import type` для `Battle`/`PlayerIntent`/`Rng`; линтер —
  `consistent-type-imports`.
- `canvas-test-utils.ts` — не `*.test.ts`: попадает в `tsc` (include `src`) и в ESLint,
  но не в Vitest-прогон и не в бандл (`main.ts` его не импортирует). Должен проходить
  `typecheck`/`lint`/`format:check` как обычный модуль. Тип `CanvasRenderingContext2D` —
  из `lib: DOM`, доступен.
- Производительность и детерминизм не меняются: та же логика, тот же порядок вызовов.
- Риск — только регрессия (порядок слоёв, `Math.floor`); ловится тестами 001 и новым
  `battle-render.test.ts`.

## Открытые вопросы

Нет. Дизайн для этой задачи согласован и по коду реализуем без расхождений.
Технические мелочи, решаемые на стадии plan без владельца:

- нужен ли минимальный `battle.test.ts` уже в этой задаче (см. «Тестируемость»);
- конкретная форма проверок в `battle-render.test.ts` (точное совпадение массива вызовов
  или подсчёт + первый/граничные вызовы).

## Ссылки на документацию

- CLAUDE.md
- second-brain/game-design.md
- second-brain/architecture/overview.md
- second-brain/decisions/002-integer-speeds.md
- second-brain/features/002-enemies-and-levels/design.md — «Модули и файлы», «Поток тика»,
  «Интерфейсы», «Появление API по задачам» (строка 005), «Нарезка на задачи» п. 1
- second-brain/features/002-enemies-and-levels/discussion.md — п. 8 (общий `recorder()`),
  п. 5 раунда 3 (`new Battle()` без `rng`)
