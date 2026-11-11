# Анализ: Экран Game Over и рестарт

Рамка — согласованный `second-brain/features/005-lives-score-game-over/design.md`
(раунд 3), пункт 2 нарезки. Анализ уточняет его по коду рабочего дерева (задача 020
реализована, не закоммичена), не перепроектирует.

## Общее описание функциональности

После задачи 020 бой уже доходит до терминальной фазы `over`: через
`GAME_OVER_DELAY_TICKS = DOWN_TICKS` (60 тиков, 1 с) после гибели последнего корабля
враги продолжают летать (цели нет), коллизий нет, `phaseTicks` растёт с 0. Но на экране
ничего не меняется, и выйти из игры нельзя.

Задача добавляет:

1. **Надпись поверх поля и панели** в фазе `over`: `GAME OVER` (красный,
   `HUD_LABEL_COLOR`) и под ней мигающее `PRESS ENTER` (белый, `HUD_VALUE_COLOR`),
   пиксельным шрифтом фичи 004, обе строки по центру экрана по X. Враги, их взрывы и
   звёзды за надписью продолжают двигаться. Чёрная подложка под строками заложена, но
   выключена константой `GAME_OVER_BACKDROP = false` — решение на приёмке глазами.
2. **Рестарт:** в фазе `over` Enter возвращает на титульный экран; звёзды продолжаются
   тем же экземпляром `Starfield`, без скачка. С титула обычный Enter запускает новую
   игру: 3 жизни, уровень `startLevel`.

После задачи игра проходит полный цикл «старт → проигрыш → старт».

## Модели данных и состояние

Новых сущностей с состоянием нет: Game Over — фаза `Battle` внутри `PlayScene`, а не
отдельная сцена (design.md, «Сцена», «Альтернативы»).

Уже есть в коде (задача 020):

| Что                                         | Где                     | Значение / смысл                                                     |
| ------------------------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `BattlePhase`                               | `src/game/battle.ts:13` | `'playing' \| 'cleared' \| 'over'`; `over` терминальна               |
| `GAME_OVER_DELAY_TICKS`                     | `src/game/battle.ts:17` | `= DOWN_TICKS` = 60                                                  |
| `Battle.phaseTicks`                         | `src/game/battle.ts:69` | 0 после `update` с переходом в фазу, +1 за каждый следующий `update` |
| `Player.lives`, `isLost`, `START_LIVES = 3` | `src/game/player.ts`    | жизни списываются в `hit()`                                          |
| `BattleOptions.lives`                       | `src/game/battle.ts:25` | старт жизней, тесты могут дать 1                                     |

Новые константы (`src/game/game-over-render.ts`, интерфейс — design.md, «Интерфейсы»):

| Константа                 | Значение                       | Комментарий                                                                                              |
| ------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `GAME_OVER_TEXT`          | `'GAME OVER'`                  | 9 символов → `textWidth` 72 px                                                                           |
| `PRESS_ENTER_TEXT`        | `'PRESS ENTER'`                | 11 символов → 88 px                                                                                      |
| `GAME_OVER_Y`             | на усмотрение, предложение 112 | «около середины игрового поля»: поле — y 24…239, середина ≈ 132; строй начинается с `FORMATION_TOP = 32` |
| `PRESS_ENTER_Y`           | `GAME_OVER_Y + 16` (128)       | «на 2 строки шрифта ниже» (`CHAR_ADVANCE`/ячейка 8 px × 2)                                               |
| `PRESS_ENTER_BLINK_TICKS` | 30                             | как у титула (`title-scene.ts`: `Math.floor(ticks / 30) % 2`)                                            |
| `GAME_OVER_BACKDROP`      | `false`                        | включается одной константой                                                                              |
| `GAME_OVER_BACKDROP_PAD`  | 2                              | поле подложки с каждой стороны строки                                                                    |

Функции: `centeredX(text)` = `floor((SCREEN_WIDTH − textWidth(text)) / 2)` (`GAME OVER` →
92, `PRESS ENTER` → 84; `textWidth` включает хвостовой 1 px ячейки — по дизайну так и
надо), `isPromptVisible(phaseTicks)` — видно на 0…29, скрыто на 30…59, видно на 60…,
`drawGameOver(ctx, phaseTicks, backdrop = GAME_OVER_BACKDROP)`.

Подложка (если включена): чёрный `fillRect` под каждой строкой — ширина `textWidth`,
высота `GLYPH_HEIGHT` (7), плюс `GAME_OVER_BACKDROP_PAD` с каждой стороны; рисуется
**до** текста строки; под `PRESS ENTER` — постоянно, даже когда текст скрыт миганием.

Мигание считается от `battle.phaseTicks`, а не от собственного счётчика сцены: в тик
перехода в `over` `phaseTicks = 0`, и `render` после этого `update` уже показывает
`PRESS ENTER` («shown on phaseTicks = 0»).

## Связанные модули и сущности

| Модуль / сущность | Назначение                                                                   | Файлы                                                                  |
| ----------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `Battle`          | фаза `over`, `phaseTicks` (задача 020, не меняется)                          | `src/game/battle.ts`                                                   |
| `Player`          | `lives`, `isLost`, `canBeHit`, `hit()` — нужны тесту полного цикла           | `src/game/player.ts`                                                   |
| Пиксельный шрифт  | `drawText`, `textWidth`, `GLYPH_HEIGHT`, `CHAR_ADVANCE`; есть `A–Z` и пробел | `src/game/font.ts`, `src/game/font-art.ts`                             |
| Цвета панели      | `HUD_LABEL_COLOR` (`#ff5a3c`), `HUD_VALUE_COLOR` (`#ffffff`)                 | `src/game/art.ts`                                                      |
| `HUD_HEIGHT`      | нижняя граница панели (24) — надпись должна быть ниже                        | `src/game/hud.ts:29`                                                   |
| `PlayScene`       | игровая сцена: звёзды → бой → панель                                         | `src/game/scenes/play-scene.ts`                                        |
| `TitleScene`      | титул-заглушка, создаёт `PlayScene`                                          | `src/game/scenes/title-scene.ts`                                       |
| `Starfield`       | фон; держит свой `rng` и тик мигания                                         | `src/game/starfield.ts`                                                |
| `Scene`, `Input`  | интерфейс сцены (возврат следующей сцены), `pressed('start')`                | `src/engine/scene.ts`, `src/engine/input.ts` (не меняются)             |
| Тестовые хелперы  | `recorder()` (fillRect + fillStyle по порядку), `step()` (как `main.ts`)     | `src/game/canvas-test-utils.ts`, `src/game/scenes/scene-test-utils.ts` |

## Точки встраивания

- **`PlayScene.update`** (`play-scene.ts:29-32`): сейчас возвращает `void`. После
  `starfield.update` и `battle.update` — если `battle.phase === 'over'`,
  `input.pressed('start')` и фабрика `exit` задана → вернуть `exit()`. Тип возврата →
  `Scene | void`. Проверка идёт после `battle.update`, поэтому Enter в тик перехода в
  `over` уже срабатывает (так решено дизайном).
- **`PlayScene.render`** (`play-scene.ts:34-40`): последним слоем, после `drawHud`, —
  `drawGameOver(ctx, battle.phaseTicks)` только в фазе `over`.
- **Конструктор `PlayScene`**: 4-й необязательный параметр `exit?: () => Scene`;
  `starfield` из `private readonly` → публичный `readonly` («Exposed for tests»).
  Существующие вызовы `new PlayScene(rng, undefined, opts)` и `new PlayScene(rng)` в
  тестах остаются совместимыми. Порядок потребления `rng` (сначала звёзды, потом seed
  боя) не меняется.
- **Конструктор `TitleScene`**: 3-й необязательный параметр `starfield`;
  `this.starfield = starfield ?? new Starfield(...)`. Если звёзды переданы, `rng` в
  конструкторе не тратится. `starfield` → публичный `readonly`.
- **`TitleScene.update`**: в `new PlayScene(...)` 4-м аргументом — фабрика
  `() => new TitleScene(this.rng, this.startLevel, this.starfield)`. Так `play-scene` не
  импортирует `title-scene`: цикла модулей нет (сейчас `title-scene → play-scene`).
  Новый `TitleScene` начинает свой `ticks` с 0 — мигание титульного `PRESS ENTER`
  начинается с «видно», это ожидаемо.
- **Ввод:** `main.ts` вызывает `input.endTick()` после каждого `update` (и `step()` в
  тестах — тоже), поэтому Enter, вернувший на титул, новый `TitleScene` не видит — новой
  игры сразу не будет. `src/engine/` и `main.ts` не меняются.
- **HUD:** не меняется; надпись рисуется поверх него и ниже `HUD_HEIGHT`, не пересекаясь
  с зонами панели.

## Файлы и места в коде

| Файл                                                          | Что содержит                                                                                                                     | Что изменить / создать                                                                                                                                                                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/game/game-over-render.ts`                                | —                                                                                                                                | **создать**: константы текста, раскладки, мигания, подложки; `centeredX`, `isPromptVisible`, `drawGameOver`                                                                                                                         |
| `src/game/game-over-render.test.ts`                           | —                                                                                                                                | **создать**: тесты рендера через `recorder()`                                                                                                                                                                                       |
| `src/game/scenes/play-scene.ts`                               | сцена боя                                                                                                                        | параметр `exit`, публичный `readonly starfield`, `update(): Scene \| void` с выходом в `over`, `drawGameOver` в `render`                                                                                                            |
| `src/game/scenes/play-scene.test.ts`                          | тесты ввода/стрельбы/опций                                                                                                       | добавить: выход по `start` в `over`; `start` вне `over` ничего не возвращает; без `exit` в `over` ничего не возвращает                                                                                                              |
| `src/game/scenes/title-scene.ts`                              | титул-заглушка                                                                                                                   | параметр `starfield`, публичный `readonly starfield`, фабрика выхода в `PlayScene`                                                                                                                                                  |
| `src/game/scenes/title-scene.test.ts`                         | 5 тестов перехода на `PlayScene`                                                                                                 | добавить: переданный `starfield` уходит в `PlayScene.starfield`; полный цикл                                                                                                                                                        |
| `second-brain/game-design.md`                                 | «Поражение игрока», стр. 45-51 («надпись Game Over — задача 021»)                                                                | дописать: надпись `GAME OVER` + мигающее `PRESS ENTER` поверх летающих врагов, Enter → титул, звёзды без скачка, новая игра с 3 жизнями                                                                                             |
| `second-brain/architecture/overview.md`                       | стр. 26-28 (`TitleScene(rng, startLevel?)`), 258-265 (`PlayScene`), 270-271 (граф импортов), 255-257 (пользователи `recorder()`) | описать `game-over-render.ts`, новые сигнатуры сцен, фабрику `exit`, слой надписи, `play-scene → game-over-render`, `game-over-render → {config, art, font, hud}`; добавить `game-over-render.test.ts` к пользователям `recorder()` |
| `second-brain/tasks/tasks/021-game-over-screen/acceptance.md` | —                                                                                                                                | **создать** на стадии do: пункты приёмки глазами (см. ниже)                                                                                                                                                                         |

Зависимости нового модуля: `config` (`SCREEN_WIDTH`), `art` (цвета), `font`
(`drawText`, `textWidth`, `GLYPH_HEIGHT`), `hud` (`HUD_HEIGHT` — нужен как минимум в
тесте). Все уже существуют. `README.md` в папках `src/` нет.

## Тестируемость

Покрывается unit-тестами (без canvas, кроме `recorder()`):

- **`game-over-render.test.ts`:** `centeredX` для обоих текстов равен формуле и целый;
  обе строки (с полем подложки) внутри экрана по X и Y и ниже `HUD_HEIGHT`, строки не
  перекрываются; `isPromptVisible` — `true` на 0, `false` на 30, `true` на 60 (и
  границы 29/59); `drawGameOver` с `backdrop = false`: каждый `fillRect` внутри
  прямоугольника одной из строк, цвета — `HUD_LABEL_COLOR` / `HUD_VALUE_COLOR`, черного
  нет; на скрытом тике (30) — только пиксели `GAME OVER`; с `backdrop = true`: чёрные
  прямоугольники расширены на `GAME_OVER_BACKDROP_PAD`, идут до текста своей строки,
  подложка под `PRESS ENTER` есть и на скрытом тике; умолчание параметра равно
  `GAME_OVER_BACKDROP`.
- **`play-scene.test.ts`:** быстрый Game Over — `BattleOptions.lives = 1`,
  `scene.battle.player.hit()`, `step` 60 тиков → `phase === 'over'`; затем `start` →
  `update` возвращает сцену из `exit` (фабрика-шпион); до `over` `start` возвращает
  `undefined` (сцена остаётся той же); без `exit` в `over` ничего не возвращается.
  Важно: `pressed` срабатывает только в тик нажатия — для повторного нажатия в тесте
  нужно `release('start')` + `press('start')`.
- **`title-scene.test.ts`:** переданный `starfield` — тот же экземпляр в
  `TitleScene.starfield` и `PlayScene.starfield`; полный цикл на уровне 1 с тремя
  жизнями: `start` → `PlayScene` → в цикле (предел 600 тиков) `player.hit()`, когда
  `canBeHit`, и `step`, пока не `over` (по дизайну ≈ 420 тиков: 2 × (60 + 120) + 60)
  → `start` → `TitleScene` с тем же `starfield` → `start` → новая `PlayScene` с тем же
  `starfield`, `player.lives === START_LIVES`, `phase === 'playing'`. Без проверки
  `battle.score === 0` — она добавляется в 022. Детерминизм: `createRng(1)`; враги
  уровня 1 могут сбить корабль сами — это не мешает тесту, он ждёт фазу, а не число
  своих `hit()`.
- Существующие тесты сцен не меняются (новые параметры необязательные).

Только глазами (`acceptance.md`): читаемость надписи поверх врагов, взрывов и звёзд без
подложки; ритм мигания; положение по Y; рестарт и звёзды без скачка при Enter.

## Зависимости и ограничения

- Зависит от 020 — реализована в рабочем дереве (`npm test`: 22 файла, 657 тестов,
  зелёные). С 022 (счёт) независима.
- Разрешение 256×240, координаты целые: `centeredX` через `Math.floor`, Y — целые
  константы; `drawText` ожидает целые x/y.
- Производительность: `drawText` — `fillRect` 1×1 на пиксель маски, 20 символов —
  порядка нескольких сотен вызовов за кадр, сопоставимо с панелью; не проблема.
- `src/engine/` не меняется; граница engine/game соблюдена. Цикл модулей не возникает
  за счёт фабрики `exit` (её создаёт `TitleScene`).
- Риск: титульный экран рисует `PRESS ENTER` системным шрифтом (`fillText`), а Game
  Over — пиксельным; визуально стили разные. По дизайну титул не трогаем — это отдельная
  задача меню.
- Риск: Enter в тик перехода в `over` сразу уводит на титул — по дизайну приемлемо
  (Enter — отдельная клавиша от стрельбы), блокировки ввода нет.

## Открытые вопросы

- **Подложка под `GAME OVER`** — решается на приёмке глазами владельцем
  (`acceptance.md`): если надпись плохо читается поверх врагов/звёзд — включить
  `GAME_OVER_BACKDROP`. Не блокирует реализацию.
- Точные `GAME_OVER_Y` / `PRESS_ENTER_Y` — по дизайну на усмотрение разработчика
  (предложение 112 / 128), проверяются тестом границ и глазами. Не вопрос владельцу.

Вопросов, блокирующих план, нет. Выносить в отдельные задачи нечего.

## Ссылки на документацию

- CLAUDE.md
- second-brain/game-design.md («Поражение игрока»)
- second-brain/architecture/overview.md (сцены, граф импортов, `canvas-test-utils`)
- second-brain/features/005-lives-score-game-over/design.md («Сцена», «Поток тика»,
  «Интерфейсы», «Тестирование», «Нарезка на задачи», п. 2)
- second-brain/features/005-lives-score-game-over/dev-review-2.md (подложка, тест
  полного цикла)
- second-brain/tasks/tasks-done/020-lives-and-game-over-logic/ (фаза `over`, `phaseTicks`)
