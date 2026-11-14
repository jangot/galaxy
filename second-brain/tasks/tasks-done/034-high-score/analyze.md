# Анализ: Рекорд — хранилище и показ `HI`

Рамка — согласованный `second-brain/features/009-high-score-ship-panel/design.md` (раунд 3,
пункт 1 нарезки) и решения владельца В1–В9 (README фичи, `discussion.md`). Анализ уточняет
дизайн по коду (база — `201044f`, ветка `feature/009-high-score-ship-panel`), а не
перепроектирует его.

## Общее описание функциональности

Лучший счёт (рекорд) переживает перезагрузку страницы: хранится в `localStorage` под
ключом `galaxy.highScore` и показывается в верхней панели колонкой `HI` между `SCORE` и
`LEVEL`.

Что видит игрок:

- **Первый запуск** (хранилище пусто): `SCORE 000000`, `HI 000000`. С первого же очка
  счёт обгоняет рекорд 0: `HI` растёт вместе со счётом и до конца игры рисуется цветом
  `HUD_RECORD_COLOR` (жёлтый). При счёте 0 подсветки нет.
- **Рекорд не побит:** `HI` показывает сохранённый рекорд, цвет обычный (`HUD_VALUE_COLOR`).
- **Обгон:** с тика, когда `score > рекорд на старте игры`, `HI = score`, значение
  желтеет и остаётся жёлтым до конца игры, без мигания (В4). Ничья — не рекорд.
- **Запись** — сразу при каждом росте рекорда (В3), в т. ч. в недоигранной игре
  (закрыл вкладку посреди боя — рекорд уже записан).
- **Game over → заставка → новая игра:** `HI` — новый рекорд обычным цветом.
- **Перезагрузка / новая вкладка:** тот же рекорд. Вторая вкладка подхватит чужой больший
  рекорд в начале своей игры (`refresh()`) или при первом своём росте (`submit` берёт max).
- **Хранилище недоступно** (приватный режим, `SecurityError` при обращении к
  `window.localStorage`, квота): игра работает, рекорд живёт в памяти между играми сессии,
  после перезагрузки — 0.
- **Заставка** рекорд не показывает, сброса рекорда для игрока нет (В9).

Раскладка панели по X — уже окончательная (В1): `SCORE` 8…55 · `HI` 64…111 · `LEVEL`
120…159 (на 12 px правее центра) · улучшения 168…185 · щит 200…247. По Y и по виду панель
остаётся прежней (без плиты, подписи y = 4, значения y = 14) — плита и окна будут в 035.

## Модели данных и состояние

### `KeyValueStorage` (движок, `src/engine/storage.ts`, новый)

| Элемент                      | Смысл                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `getItem(key): string\|null` | `null` — нет значения или не прочиталось                                                                                                  |
| `setItem(key, value): void`  | отказ хранилища молча игнорируется                                                                                                        |
| `safeStorage(getBacking)`    | обёртка над браузерным `Storage`; `getBacking()` вызывается внутри `try/catch` (бросить может уже само обращение к `window.localStorage`) |
| `memoryStorage(initial?)`    | хранилище в памяти — для тестов и как умолчание сцен                                                                                      |

Состояния нет (кроме `Map` в `memoryStorage`). Движок не знает, что хранится.

### `HighScoreStore` (игра, `src/game/high-score.ts`, новый)

| Поле / операция       | Поведение                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HIGH_SCORE_KEY`      | `'galaxy.highScore'`                                                                                                                                |
| `parseHighScore(raw)` | только десятичные цифры (`/^\d+$/`) и `≤ Number.MAX_SAFE_INTEGER`, иначе 0 (`null`, `""`, `-5`, `1.5`, `1e3`, ` 42`, `abc`)                         |
| конструктор           | `best = parseHighScore(storage.getItem(key))`                                                                                                       |
| `get best()`          | лучший известный счёт сессии, целое ≥ 0, только растёт                                                                                              |
| `refresh()`           | `best = max(best, сохранённое)` — не понижает                                                                                                       |
| `submit(score)`       | при `score > best`: `next = max(score, сохранённое сейчас)`, `setItem(key, String(next))`, `best = next`, `true`; иначе `false` без чтения и записи |

Автомата нет: одно монотонно растущее число. Мусор в хранилище не стирается — перезапишется
первым рекордом.

### Состояние в сценах

| Где          | Поле                               | Смысл                                                                  |
| ------------ | ---------------------------------- | ---------------------------------------------------------------------- |
| `PlayScene`  | `readonly records: HighScoreStore` | общий на сессию; открыт для тестов                                     |
| `PlayScene`  | `private readonly recordAtStart`   | `records.best` после `records.refresh()` в конструкторе                |
| `PlayScene`  | `hudRecord(): HudRecord`           | `{ best: records.best, atStart: recordAtStart }` — для render и снимка |
| `TitleScene` | `readonly records: HighScoreStore` | передаётся в `PlayScene` и в фабрику `exit`                            |

Признак нового рекорда — не состояние, а чистая функция: `newRecord = score > atStart`
(счёт монотонен → цвет держится до конца игры без флага).

### `HudView` / `HudRecord` (`src/game/hud.ts`)

| Поле                      | Значение                                                               |
| ------------------------- | ---------------------------------------------------------------------- |
| `HudView.highScore`       | `max(record.best, battle.score)`                                       |
| `HudView.newRecord`       | `battle.score > record.atStart` (строго; `0 > 0` — ложь)               |
| `HudRecord`               | `{ readonly best: number; readonly atStart: number }`                  |
| `hudView(battle, record)` | второй аргумент **обязательный** (забыть в `PlayScene` — ошибка типов) |

### Константы

| Константа          | Где      | Значение                                                                                                                 |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `HI_LABEL`         | `hud.ts` | `'HI'` (глифы `H`, `I` в `font-art.ts` есть)                                                                             |
| `HI_ZONE`          | `hud.ts` | `{ x: 64, y: HUD_LABEL_Y, width: 48, height: TEXT_ZONE_HEIGHT }` — как `SCORE_ZONE` (ширина = max(подпись, 6 цифр) = 48) |
| `LEVEL_ZONE.x`     | `hud.ts` | 108 → **120** (сейчас вычисляется как центр экрана, `hud.ts:63-68`)                                                      |
| `POWER_UPS_ZONE.x` | `hud.ts` | 156 → **168** (сейчас литерал, `hud.ts:94-99`); `POWER_UP_SLOT_X` выводится из него: 168 / 178                           |
| `HUD_ZONES`        | `hud.ts` | + `HI_ZONE`                                                                                                              |
| `HUD_RECORD_COLOR` | `art.ts` | жёлтый; ≠ `HUD_VALUE_COLOR` (тест), желательно ≠ `HUD_LABEL_COLOR`                                                       |
| значение `HI`      | рендер   | `formatScore(highScore)` — 6 цифр с ведущими нулями, по левому краю зоны (как `SCORE`)                                   |

Проверка раскладки по X: `SCORE` 8…55, `HI` 64…111, `LEVEL` 120…159, улучшения 168…185,
щит 200…247 — зоны не пересекаются, зазоры ≥ 8 px, всё в 0…255. `levelValueX` считается от
`LEVEL_ZONE.x` (`hud.ts:139-141`) — центровка номера под подписью сохраняется автоматически.

## Связанные модули и сущности

| Модуль / сущность  | Назначение                                                | Файлы                                                         |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------- |
| Хранилище (движок) | строка по ключу, никогда не бросает                       | `src/engine/storage.ts` (новый)                               |
| Рекорд (игра)      | разбор, кэш, запись при росте                             | `src/game/high-score.ts` (новый)                              |
| Модель HUD         | `HudView`, зоны, `hudView`, форматирование                | `src/game/hud.ts`                                             |
| Рендер HUD         | секции поверх поля, каждая в своей зоне                   | `src/game/hud-render.ts`                                      |
| Палитра            | цвета HUD                                                 | `src/game/art.ts`                                             |
| Игровая сцена      | бой + HUD; единственное место встречи счёта и рекорда     | `src/game/scenes/play-scene.ts`                               |
| Заставка           | старт игры, фабрика `exit`                                | `src/game/scenes/title-scene.ts`                              |
| Точка входа        | создаёт сессионные объекты (`rng`, первая сцена)          | `src/main.ts`                                                 |
| Dev-снимок         | `window.__galaxy.state()`                                 | `src/game/dev-snapshot.ts`                                    |
| `Battle`           | счёт `battle.score`; о рекорде **не знает** и не меняется | `src/game/battle.ts` (без изменений)                          |
| Тестовые утилиты   | `recorder()` (fillRect + fillStyle), `step()`             | `src/game/canvas-test-utils.ts`, `scenes/scene-test-utils.ts` |

## Точки встраивания

1. **`main.ts`** — рядом с `rng` (`main.ts:19-20`) создать
   `new HighScoreStore(safeStorage(() => window.localStorage))` и передать в
   `new TitleScene(rng, start, undefined, records)` (четвёртый параметр после `starfield`).
2. **`TitleScene`** (`title-scene.ts:18-35`) — новый необязательный параметр `records`
   (по умолчанию `new HighScoreStore(memoryStorage())`), поле `readonly records`; в
   `update` по Enter: `exit = () => new TitleScene(this.rng, this.start, this.starfield,
this.records)` и `new PlayScene(this.rng, this.starfield, { ...this.start }, exit,
this.records)`.
3. **`PlayScene`** (`play-scene.ts:29-63`) — пятый необязательный параметр `records`
   (умолчание — `memoryStorage`); в конструкторе `records.refresh()`, затем
   `recordAtStart = records.best`. Порядок с `rng` не трогается: рекорд `rng` не тратит —
   звёзды и seed боя остаются как есть (на это есть тесты `play-scene.test.ts:285-310`).
   В `update`: после `battle.update(...)` (`:49`) и **до** проверки `over` + Enter (`:51`) —
   `records.submit(battle.score)`. В `render` (`:61`) — `hudView(this.battle,
this.hudRecord())`; комментарий «no background» пока остаётся верным.
4. **`hud.ts`** — `HudView` + 2 поля, `HudRecord`, `hudView(battle, record)`, `HI_LABEL`,
   `HI_ZONE`, сдвиги `LEVEL_ZONE` / `POWER_UPS_ZONE`, `HUD_ZONES` + `HI_ZONE`; комментарии с
   координатами (`:62`, `:90-93`, `:107`) обновить. `hud.ts` не импортирует `high-score.ts` —
   `HudRecord` объявлен в `hud.ts`, собирается в `PlayScene`.
5. **`hud-render.ts`** — `drawHighScore(ctx, highScore, newRecord)` между `drawScore` и
   `drawLevel` в `drawHud` (`:32-37`): подпись `HI` цветом `HUD_LABEL_COLOR` на `HUD_LABEL_Y`,
   значение `formatScore(highScore)` на `HUD_VALUE_Y` цветом `newRecord ? HUD_RECORD_COLOR :
HUD_VALUE_COLOR`. Нынешний `drawLabeled` (`:40-49`) жёстко красит значение в
   `HUD_VALUE_COLOR` — понадобится параметр цвета значения (или отдельный вызов `drawText`).
   Обновить JSDoc `drawHud` (перечень секций).
6. **`art.ts`** — `HUD_RECORD_COLOR` рядом с `HUD_LABEL_COLOR` / `HUD_VALUE_COLOR`
   (`art.ts:68-71`).
7. **`dev-snapshot.ts`** — `GalaxySnapshot.highScore: { best, newRecord } | null`; в
   `snapshotScene` (`:141-151`) для `PlayScene`: `const view = hudView(scene.battle,
scene.hudRecord())` → `{ best: view.highScore, newRecord: view.newRecord }`; для заставки и
   `unknown` — `null`. `dev-snapshot` начнёт импортировать `hud.ts` (значение, не тип).
8. **Ввод, цикл, `Battle`** — без изменений.

## Файлы и места в коде

| Файл                                                    | Что содержит сейчас                                                                            | Что сделать                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/engine/storage.ts`                                 | —                                                                                              | создать: `KeyValueStorage`, `safeStorage`, `memoryStorage`                                                                                                                                                                                                                                                                                                                              |
| `src/engine/storage.test.ts`                            | —                                                                                              | создать: `memoryStorage` get/set/`initial`; `safeStorage` с фейковым `Storage`; бросающий `getBacking` → `getItem` = `null`, `setItem` не бросает; бросающие `getItem`/`setItem` фейка → то же                                                                                                                                                                                          |
| `src/game/high-score.ts`                                | —                                                                                              | создать: `HIGH_SCORE_KEY`, `parseHighScore`, `HighScoreStore`                                                                                                                                                                                                                                                                                                                           |
| `src/game/high-score.test.ts`                           | —                                                                                              | создать: таблица `parseHighScore`; старт из хранилища; `submit` больше/равно/меньше со счётчиком `setItem`; чужое большее значение → запись max и `best` = записанному, `true`; `refresh` поднимает, не опускает; сломанное хранилище → рекорд в памяти                                                                                                                                 |
| `src/game/hud.ts`                                       | `HudView` (`:8-15`), зоны (`:53-108`), `hudView` (`:114-121`)                                  | см. «Точки встраивания», п. 4                                                                                                                                                                                                                                                                                                                                                           |
| `src/game/hud.test.ts`                                  | 8 вызовов `hudView(battle)` (`:56-95`), `toEqual` на `HudView` (`:56`), раскладка, вместимость | `NO_RECORD: HudRecord = { best: 0, atStart: 0 }` во все вызовы; `toEqual` + `highScore: 0`, `newRecord: false`; новые: `highScore = max`, `newRecord` строго `>` (в т. ч. `atStart = 0`, `score = 0`); `HI_ZONE` в `HUD_ZONES`; `HI_ZONE` вмещает подпись и 6 цифр и покрывает обе строки (добавить в `it.each` `:174-180` и «fits the score label…»); при желании — точные X зон по В1 |
| `src/game/hud-render.ts`                                | `drawHud`, `drawLabeled`, секции                                                               | см. «Точки встраивания», п. 5                                                                                                                                                                                                                                                                                                                                                           |
| `src/game/hud-render.test.ts`                           | `BASE` (`:36`), литерал `max` (`:98`), литерал `:210`; эталон «places the text…» (`:127-135`)  | литералы `HudView` + `highScore`/`newRecord` (иначе typecheck); эталон + подпись и значение `HI` между `SCORE` и `LEVEL`; в «a change touches only its own zone» (`:114-125`) — строки `highScore` и `newRecord` → `HI_ZONE`; новый: `newRecord` меняет `fillStyle` значения `HI` на `HUD_RECORD_COLOR`, подпись — нет                                                                  |
| `src/game/art.ts`                                       | `HUD_LABEL_COLOR`, `HUD_VALUE_COLOR` (`:68-71`)                                                | `HUD_RECORD_COLOR`                                                                                                                                                                                                                                                                                                                                                                      |
| `src/game/art.test.ts`                                  | тесты цветов щита                                                                              | `HUD_RECORD_COLOR` ≠ `HUD_VALUE_COLOR` (и ≠ `HUD_LABEL_COLOR`)                                                                                                                                                                                                                                                                                                                          |
| `src/game/scenes/play-scene.ts`                         | конструктор `(rng, starfield?, opts?, exit?)`                                                  | см. «Точки встраивания», п. 3                                                                                                                                                                                                                                                                                                                                                           |
| `src/game/scenes/play-scene.test.ts`                    | движение, стрельба, game over, бонусы и rng                                                    | рекорд растёт со счётом и пишется в `memoryStorage`; `recordAtStart` после `refresh` (запись в хранилище до создания сцены); `hudRecord()`; детерминизм боя с рекордом и без                                                                                                                                                                                                            |
| `src/game/scenes/title-scene.ts`                        | конструктор `(rng, start?, starfield?)`                                                        | см. «Точки встраивания», п. 2                                                                                                                                                                                                                                                                                                                                                           |
| `src/game/scenes/title-scene.test.ts`                   | хелперы `startGame`/`loseGame`/`backToTitle` (`:12-37`)                                        | `records` по ссылке: заставка → `PlayScene` → `exit` → следующая `TitleScene`; рекорд прошлой игры виден в `hudRecord().atStart` следующей                                                                                                                                                                                                                                              |
| `src/main.ts`                                           | `rng`, первая `TitleScene` (`:19-20`)                                                          | создать `HighScoreStore(safeStorage(() => window.localStorage))`, передать в `TitleScene`                                                                                                                                                                                                                                                                                               |
| `src/game/dev-snapshot.ts`                              | `GalaxySnapshot`, `snapshotScene`                                                              | поле `highScore`                                                                                                                                                                                                                                                                                                                                                                        |
| `src/game/dev-snapshot.test.ts`                         | `toEqual` заставки (`:39`)                                                                     | + `highScore: null`; `play`/`over` — `highScore` совпадает с `hudView(battle, hudRecord())`                                                                                                                                                                                                                                                                                             |
| `second-brain/architecture/overview.md`                 | разделы «Движок», «Игра», модель HUD (`:355-376`), граф импортов (`:409-430`)                  | `storage.ts`, `high-score.ts`, параметры сцен, `HudView`/`hudView`, новые зоны и X, импорты (`play-scene`, `title-scene`, `dev-snapshot`, `main`)                                                                                                                                                                                                                                       |
| `second-brain/architecture/dev-hooks.md`                | «Снимок `state()`» (`:52-75`), «Рецепты»                                                       | поле `highScore`; ключ `galaxy.highScore`; как сбросить рекорд (см. «Открытые вопросы», п. 2)                                                                                                                                                                                                                                                                                           |
| `second-brain/tasks/tasks/034-high-score/acceptance.md` | —                                                                                              | при приёмке: оговорка «`LEVEL` правее центра — окончательная раскладка, плита в 035»                                                                                                                                                                                                                                                                                                    |

`game-design.md` уже обновлён (разделы «Экран», «Рекорд») — не трогать.

Вызовов `new PlayScene` / `new TitleScene` в `src/` — 35; благодаря умолчанию `records` они
не меняются.

## Тестируемость

Покрывается unit-тестами (Vitest в `node`, `vite.config.ts:6`, без jsdom — поэтому
хранилище подменяется `memoryStorage()`, глобалы не мокаются):

- `safeStorage` — фейковый объект с `getItem`/`setItem` (в т. ч. бросающими) и бросающий
  `getBacking`. Тип параметра — DOM `Storage` (`lib: DOM` в `tsconfig.json`), фейк
  придётся привести к нему или реализовать все члены — мелочь для плана.
- `parseHighScore` — табличный тест; `HighScoreStore` — поверх `memoryStorage`, обёрнутого
  счётчиком `setItem`; «другая вкладка» моделируется прямой записью в то же хранилище.
- `hudView` — чистая функция от `Battle` и `HudRecord`; счёт задаётся через существующие
  тестовые утилиты `hud.test.ts` (`onlyShot`, `TWO_LEVELS`).
- Рендер — через `recorder()`: расположение и цвет пикселей `HI`, «смена поля трогает
  только свою зону».
- Сцены — через `step()` и публичные `battle`/`records`/`hudRecord()`; набор очков — как в
  существующем тесте «shoots down an enemy» (`play-scene.test.ts:172`). Детерминизм: два
  прогона с одним seed, с непустым и пустым хранилищем — одинаковый `snapshotBattle`.
- `dev-snapshot` — `highScore` равен `hudView(scene.battle, scene.hudRecord())`.

Только глазами (acceptance / `/qa`): что `HI` стоит рядом со `SCORE` и читается, жёлтый
цвет различим; рекорд переживает перезагрузку и рестарт; в приватном окне / при
запрещённом хранилище игра работает. `main.ts` (проводка реального `localStorage`) unit-
тестами не покрыт — закрывается приёмкой «рекорд после перезагрузки».

## Зависимости и ограничения

- Фичи 004/005/008 и задачи 031–033 завершены; внешних зависимостей нет. 035 зависит от 034.
- Граница движок/игра: `storage.ts` не знает о рекорде; `high-score.ts` не трогает
  `window`. Линтер границу не проверяет (в `eslint.config.js` правил импорта нет) — следить
  вручную.
- Детерминизм: рекорд не участвует в бою и не тратит `rng`; `Battle` не меняется. Внешнее
  состояние (хранилище) влияет только на вид `HI`.
- Производительность: `submit` каждый тик — одно сравнение; `getItem`/`setItem` только при
  росте рекорда (≈ раз на сбитого врага), синхронно и дёшево.
- Ширина: `HI` при счёте > 999999 выводится целиком (7 цифр) и вылезет за 48 px зоны — так
  же, как `SCORE` сейчас; дизайн это осознанно не решает (сотни уровней).
- Раскладка: `LEVEL` больше не по центру экрана — это решение В1, промежуточный вид до 035
  (оговорить в `acceptance.md`).
- Номера строк в таблице «Тестирования» дизайна сверены с текущим кодом (`733c43a` по
  содержимому совпадает с `201044f`) — актуальны.
- Риск: забыть передать `records` в `main.ts` — тесты не заметят (умолчание в сценах);
  ловится приёмкой.

## Открытые вопросы

Вопросов, блокирующих задачу, нет — всё решено дизайном и В1–В9. Уточнения для плана
(решаются без владельца):

1. **Значение `HUD_RECORD_COLOR`.** Дизайн и описание задают «жёлтый», конкретное число —
   на приёмке глазами. В палитре уже есть `#ffe14f` (щит уровня 2, он же `START_SHIELD` —
   жёлтая шкала в начале игры) и `#ffd36b` (корпус корабля). Предложение для плана:
   `#ffe14f` — тот же NES-жёлтый; если на приёмке спутается со шкалой щита — сменить.
2. **Сброс рекорда в dev (`dev-hooks.md`).** `HighScoreStore` держит рекорд в памяти и
   `refresh()` его не понижает, поэтому `localStorage.removeItem('galaxy.highScore')`
   сбрасывает рекорд только **вместе с перезагрузкой страницы**. В рецепте `dev-hooks.md`
   это нужно написать явно: «`removeItem` → перезагрузка».
3. **`newRecord` при чужом рекорде из другой вкладки.** Если посреди игры `submit` поднял
   `best` до чужого большего значения, `HI` покажет чужой рекорд, но будет жёлтым
   (`score > atStart` уже истинно). Дизайн это проверил и принял («показывает честно»,
   `discussion.md`, раунд 2, п. 2) — фиксирую как ожидаемое, не баг.

Частей, которые стоит вынести в отдельную задачу, нет.

## Ссылки на документацию

- `CLAUDE.md`
- `second-brain/game-design.md` — «Экран» (HUD), «Рекорд»
- `second-brain/features/009-high-score-ship-panel/design.md` — рамка (пункт 1 нарезки,
  «Интерфейсы», «Тестирование», таблица меняющихся тестов)
- `second-brain/features/009-high-score-ship-panel/README.md` — решения В1–В9
- `second-brain/features/009-high-score-ship-panel/discussion.md` — раунды 2–3
- `second-brain/architecture/overview.md`
- `second-brain/architecture/dev-hooks.md`
- `second-brain/tasks/tasks-done/033-hud-shield-gauge/` — предыдущая правка HUD
