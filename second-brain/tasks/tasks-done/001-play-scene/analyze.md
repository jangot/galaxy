# Анализ: Игровая сцена и переход с титула

Код: ветка `main`, коммит `deb1a83`. Рамка — согласованный
`second-brain/features/001-player-ship/design.md` (раунд 2), пункт 1 нарезки.

## Общее описание функциональности

Первый шаг фичи «Корабль игрока». На титульном экране (`GALAXY`, мигающее
`PRESS ENTER`) нажатие Enter переводит игру в новую сцену `PlayScene`. Пока это пустой
игровой экран: чёрный фон и тот же звёздный фон, без надписей и без корабля (корабль —
задача 002). Звёзды при переходе **не перещёлкиваются**: `PlayScene` получает тот же
экземпляр `Starfield`, что был на титуле, поэтому позиции звёзд и фаза мигания
продолжаются с того же места — пропадают только надписи.

Возврата на титул нет (вне рамок фичи, появится с Game Over).

Вторая часть — тестовая инфраструктура: хелпер `step()`, который прогоняет тики сцены
ровно как `main.ts` (`update` → смена сцены, если вернулась → `input.endTick()`). На нём
строятся тесты сцен во всех задачах фичи (002–004).

## Модели данных и состояние

Новых игровых сущностей, констант и чисел нет — только сцены.

| Сцена        | Состояние                                                   | Переходы                                                             |
| ------------ | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `TitleScene` | `rng` (теперь хранится), `starfield`, `ticks` (для мигания) | `input.pressed('start')` → `new PlayScene(this.rng, this.starfield)` |
| `PlayScene`  | `starfield` (переданный или новый из `rng`)                 | нет (всегда возвращает `void`)                                       |

Тайминг перехода: тик, в котором нажат Enter, `TitleScene` ещё целиком отрабатывает
(`ticks++`, `starfield.update(dt)`) и только в конце возвращает `PlayScene`. `main.ts`
подменяет сцену и вызывает `endTick()` — `pressed('start')` гаснет; первый `update`
`PlayScene` — в следующем тике. Двойного обновления звёзд в одном тике нет, пропуска
тоже — значит, нет и визуального скачка.

`Input.pressed()` — edge: срабатывает только в тике нажатия; autorepeat (`e.repeat`)
повторно не взводит (`src/engine/input.ts:41-44`). Удержание Enter не влияет ни на что
после перехода (в `PlayScene` `start` не читается).

## Связанные модули и сущности

| Модуль / сущность | Назначение                                                               | Файлы                                         |
| ----------------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| `Scene`           | интерфейс сцены; `update(): Scene \| void` — возврат сцены = переход     | `src/engine/scene.ts`                         |
| Игровой цикл      | `update` → смена сцены → `endTick()`; `render` раз в кадр                | `src/main.ts:19-29`, `src/engine/loop.ts`     |
| `Input`           | `press()`/`pressed()`/`endTick()`; `start` = Enter                       | `src/engine/input.ts`                         |
| `Rng`             | сидируемый PRNG, `createRng(seed)`                                       | `src/engine/rng.ts`                           |
| `Starfield`       | фон: `update(dt)` (сдвиг, свой счётчик тиков для мигания), `render(ctx)` | `src/game/starfield.ts`                       |
| `TitleScene`      | титульная заглушка; станет источником перехода                           | `src/game/scenes/title-scene.ts`              |
| `PlayScene`       | новая игровая сцена                                                      | `src/game/scenes/play-scene.ts` (новый)       |
| `step()`          | тестовый хелпер цикла                                                    | `src/game/scenes/scene-test-utils.ts` (новый) |
| Константы экрана  | `SCREEN_WIDTH/HEIGHT`, `TICK_SECONDS`                                    | `src/config.ts`                               |

## Точки встраивания

- **Сцены:** переход — через возврат новой сцены из `TitleScene.update` (механизм уже
  поддержан интерфейсом `Scene` и циклом в `main.ts`). `main.ts` не меняется — первой
  сценой остаётся `TitleScene`.
- **Цикл обновления:** `PlayScene.update(dt, _input)` — только `starfield.update(dt)`.
  `input` в этой задаче не читается (параметр с префиксом `_`, иначе
  `noUnusedParameters` / `no-unused-vars`); станет `input` в задаче 003.
- **Отрисовка:** `PlayScene.render(ctx)` — чёрная заливка `0,0,SCREEN_WIDTH,SCREEN_HEIGHT`
  и `starfield.render(ctx)` (как первые два слоя `TitleScene.render`, без текста).
- **Ввод:** только `pressed('start')` в `TitleScene`; биндинг Enter уже есть.
- **HUD:** нет.

## Файлы и места в коде

| Файл                                           | Что содержит сейчас                                                                         | Что изменить / создать                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/game/scenes/title-scene.ts`               | `constructor(rng: Rng)` — `rng` не хранится (стр. 12); `update(dt, _input): void` (стр. 16) | `constructor(private readonly rng: Rng)` (parameter property, как в `Input`/`Starfield`); `_input` → `input`; тип возврата `Scene \| void`; в конце `update` — возврат `new PlayScene(this.rng, this.starfield)` по `input.pressed('start')`. `starfield` остаётся `private readonly`, создаётся в теле конструктора. Импорт `PlayScene` — значением (не `import type`). Комментарий класса («Real menu comes in a separate task») можно оставить. |
| `src/game/scenes/play-scene.ts`                | —                                                                                           | новый: `PlayScene implements Scene`; `constructor(rng: Rng, starfield?: Starfield)` — без переданного создаёт `new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, rng)` (параметр опционален для тестов, по `design.md`); `update`, `render`. Поле `player` — **не** в этой задаче (задача 003).                                                                                                                                                           |
| `src/game/scenes/scene-test-utils.ts`          | —                                                                                           | новый: `step(scene: Scene, input: Input, n = 1): Scene` — `n` раз: `next = scene.update(TICK_SECONDS, input); if (next) scene = next; input.endTick()`; возвращает текущую сцену. Импорты `Scene`/`Input` — `import type`. Комментарий — на английском, что модуль только для тестов.                                                                                                                                                              |
| `src/game/scenes/title-scene.test.ts`          | —                                                                                           | новый: два теста через `step()` (см. «Тестируемость»).                                                                                                                                                                                                                                                                                                                                                                                             |
| `second-brain/architecture/overview.md`        | раздел «Игра»: `starfield.ts`, `title-scene.ts` (заглушка)                                  | дописать `scenes/play-scene.ts`, переход `TitleScene → PlayScene` по `start` с передачей `rng` и `Starfield`, `scenes/scene-test-utils.ts` (`step()`), граф импортов с прямыми зависимостями `play-scene` (замечание `dev-review-2.md`).                                                                                                                                                                                                           |
| `src/main.ts`, `src/engine/*`, `src/config.ts` | —                                                                                           | не меняются.                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Граф импортов после задачи: `title-scene → {play-scene, starfield}`,
`play-scene → starfield`; `scene-test-utils → (type) {scene, input}` + `config`.
Циклов нет: `play-scene` не импортирует `title-scene`. Полный граф фичи из
`design.md` (`play-scene → player → ship → {art, shot}`, `play-scene → {starfield, art,
sprite, shot}`) достраивается в задачах 002–004; в `overview.md` этой задачи — только
то, что реально есть в коде после неё.

## Тестируемость

Unit (Vitest, environment `node`, без canvas — `Starfield` в конструкторе canvas не
трогает, `TitleScene`/`PlayScene` создаются в Node без проблем):

- `title-scene.test.ts` (критерий готовности):
  - без нажатия: `step(title, input)` возвращает тот же объект `title` (`toBe`);
  - `input.press('start')` → `step(title, input)` → `toBeInstanceOf(PlayScene)`.
  - Seed — фиксированный (`createRng(1)` и т.п.), `Input` — `new Input()` без `attach`.
- `step()` отдельно не тестируется — он покрыт тестами сцен (так в `design.md`).
- Опционально, без расширения рамок: `pressed('start')` после `step()` гаснет (проверка
  того, что `step` вызывает `endTick`) — можно добавить в тот же файл одной проверкой;
  не обязательно.

Только глазами (`npm run dev`):

- Enter на титуле → экран со звёздами, надписей нет.
- Звёзды не прыгают и не меняют раскладку при переходе; мигание продолжается плавно.
- Повторный Enter на игровом экране ничего не делает.

«Звёзды не прыгают» unit-тестом в этой задаче не закрепляется: `starfield` в
`TitleScene` приватный, а `play-scene.test.ts` по `design.md` появляется в задаче 003.
Гарантию даёт сама передача экземпляра — это видно в коде и проверяется глазами.

## Зависимости и ограничения

- Зависимостей от других задач нет; задачи 002–004 зависят от этой (`PlayScene`,
  `step()`).
- `verbatimModuleSyntax` + `consistent-type-imports`: `PlayScene` и `Starfield`
  импортируются значением (используются как конструкторы), `Rng`/`Input`/`Scene` —
  `import type`. В `scene-test-utils.ts` `TICK_SECONDS` — значением из `config`.
- `noUnusedParameters`: `PlayScene.update` — параметр `_input`; `rng` в конструкторе
  `PlayScene` используется в дефолтном создании `Starfield`, предупреждения не будет.
- Возврат `Scene | void` уже используется в интерфейсе `Scene` — линтер (`recommended`)
  его допускает.
- `scene-test-utils.ts` не попадает под `include: ['src/**/*.test.ts']`
  (`vite.config.ts`), но входит в `tsconfig` `include: ["src"]` и в `eslint .` — должен
  проходить typecheck и lint как обычный код; из `main.ts` не импортируется — в бандл не
  попадает (проверено в `dev-review-2.md`).
- Производительность — не фактор (та же отрисовка, что на титуле, без текста).
- Риск: если тест сцены вызовет `scene.update` напрямую, минуя `step()`, `pressed()` не
  будет гаснуть — в этой задаче на результат не влияет, но правило «сцены — только через
  `step()`» стоит соблюдать с самого начала (`design.md`, «Тестирование»).

## Открытые вопросы

нет. Расхождений `design.md` с кодом не найдено: всё нужное (`Scene.update(): Scene |
void`, смена сцены в `main.ts`, `Input.press`/`endTick`, `Starfield` с внешним `rng`)
уже есть; игровых чисел задача не вводит.

## Ссылки на документацию

- `CLAUDE.md`
- `second-brain/game-design.md`
- `second-brain/architecture/overview.md`
- `second-brain/decisions/002-integer-speeds.md` (в этой задаче не применяется — скоростей нет)
- `second-brain/features/001-player-ship/design.md` — «Модули и файлы», «Сцены», «Поток тика», «Интерфейсы», «Тестирование», «Нарезка» п. 1
- `second-brain/features/001-player-ship/dev-review-2.md` — рекомендация про граф импортов
- `second-brain/features/001-player-ship/discussion.md` — рек. 3 (`step()`), рек. 5 (`TitleScene`)
- `second-brain/tasks/tasks/001-play-scene/description.md`
