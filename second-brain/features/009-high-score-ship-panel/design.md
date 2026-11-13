# Дизайн: Рекорд и панель корабля

**Статус:** согласовано · **Раунд:** 3

Опирается на фичи 004 (HUD: зоны, шрифт, `HUD_HEIGHT = 24`), 005 (счёт, game over, рестарт
через заставку) и 008 (шкала щита, значки улучшений). Код: `src/game/hud.ts`,
`hud-render.ts`, `art.ts`, `bonus-art.ts`, `scenes/play-scene.ts`, `scenes/title-scene.ts`,
`main.ts`, `dev-snapshot.ts`. Решения владельца В1–В9 получены — см. «Решения владельца»;
ответы на отзывы разработчика — `discussion.md`, «Раунд 2» и «Раунд 3».

## Цель и сценарии

Два изменения верхней панели:

1. **Рекорд** — лучший счёт хранится в `localStorage` и переживает перезагрузку страницы.
   Показывается рядом со `SCORE` под подписью `HI`.
2. **Панель корабля** — вместо подписей поверх звёзд: непрозрачная плита-корпус с рамкой,
   значения — в чёрных «окнах» приборов, улучшения — лампы. Состав данных тот же
   (счёт, рекорд, уровень, шкала щита, значки улучшений) — меняется только вид.

### Что видит игрок

1. **Первый запуск** (в хранилище пусто): рядом со `SCORE 000000` — `HI 000000`. Первое
   же сбитое очко — уже новый рекорд (побит рекорд 0): `HI` растёт вместе со счётом и
   меняет цвет до конца первой игры. Это задумано (`discussion.md`, раунд 2, вопрос 1).
2. **Игра идёт, рекорд не побит:** `HI` показывает сохранённый рекорд, не меняется.
3. **Счёт превысил рекорд:** с этого тика `HI` равен счёту и растёт вместе с ним; значение
   `HI` меняет цвет на `HUD_RECORD_COLOR` и остаётся таким до конца игры, без мигания
   (В4). Рекорд записывается в хранилище сразу при каждом росте (В3).
4. **Game over → заставка → новая игра:** `HI` — новый рекорд, обычного цвета, `SCORE`
   снова `000000`.
5. **Перезагрузка страницы / новая вкладка:** `HI` — тот же рекорд.
6. **Панель:** во всю ширину экрана, высота прежняя — 24 px, поле не сдвигается (В6).
   Плита закрывает звёзды под собой; враги, возвращающиеся сверху, и астероид «выезжают»
   из-под нижнего края панели. Улучшения — две лампы: не полученное — погасшая капсула с
   буквой, полученное — горящая (обычный значок) (В7).
7. **Заставка** рекорд не показывает (В9).

### Крайние случаи

- **Хранилище недоступно** (приватный режим, запрет cookie, `SecurityError` при доступе к
  `window.localStorage`, переполнение квоты при записи): игра не падает. Рекорд живёт в
  памяти до перезагрузки страницы (между играми одной сессии сохраняется — кэш в
  `HighScoreStore`), после перезагрузки — снова 0.
- **Мусор в хранилище** (`"abc"`, `"-5"`, `"1.5"`, `"1e3"`, `" 42"`, пусто, больше
  `Number.MAX_SAFE_INTEGER`): читается как 0. Значение в хранилище не стирается — оно
  перезапишется первым же рекордом.
- **Ничья** (счёт равен рекорду): не новый рекорд, цвет `HI` не меняется, записи нет.
- **Счёт 0:** не новый рекорд даже на первом запуске (`0 > 0` — ложь).
- **Очки после гибели** (выстрел долетел в `down`, фича 008): входят в счёт — входят и в
  рекорд. В фазе `over` коллизий нет, очков больше не прибавляется.
- **Две вкладки:** запись берёт `max(значение в хранилище сейчас, новый рекорд)` —
  вкладка с меньшим счётом не затирает чужой больший рекорд, и `best` в памяти становится
  тем же числом (показ `HI` не ниже записанного). Синхронизации показа между вкладками
  нет (событие `storage` не слушаем): вторая вкладка увидит чужой рекорд со следующей
  игры (`refresh()`) или при первом своём росте (`submit` берёт `max`).
- **Счёт больше 999999:** `formatScore` выводит число целиком (как сейчас для `SCORE`);
  7 цифр вылезут за окно. Так же, как у `SCORE`, — не решаем в этой фиче (достижимость —
  сотни уровней).
- **Dev-параметры** (`?level=5`, `?shield=5`): рекорд, набранный с ними, записывается как
  обычный. Dev-сборка на `localhost` — своё хранилище, прод на другом origin — своё.
  Сбросить рекорд в dev — `localStorage.removeItem('galaxy.highScore')` (запишется в
  `dev-hooks.md`). Команды сброса для игрока нет (В9).
- **Детерминизм:** рекорд не влияет на бой (`Battle` о нём не знает), `rng` не тратится —
  поведение боя с тем же seed не меняется. Показ `HI` зависит от внешнего состояния
  (хранилища) — это вид, не логика; в тестах хранилище подменяется памятью.
- **Непрозрачная панель и объекты под ней** (y < 24): верх взрыва врага на апексе дуги
  вылета — y = 29 (`hud.test.ts`), зазор до панели 5 px (y = 24…28) — не перекрывается.
  Возвращающиеся враги (`y = -height`) и астероид (`y = -12`) проходят под панелью — это
  ожидаемо. Выстрел игрока может сбить астероид, пока тот ещё под панелью: взрыв не
  виден, капсула выпадает из-под края панели — принято как есть (В8).

## Модули и файлы

| Модуль / файл                            | Ответственность                                                                                                                                                                                                   | Новый / изменяемый |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `src/engine/storage.ts`                  | `KeyValueStorage` — минимальный интерфейс строкового хранилища; `safeStorage(getBacking)` — обёртка над браузерным `Storage`, глотающая исключения доступа/чтения/записи; `memoryStorage()` для тестов            | новый              |
| `src/game/high-score.ts`                 | ключ `HIGH_SCORE_KEY`, разбор `parseHighScore`, `HighScoreStore` (кэш рекорда в памяти + запись в хранилище)                                                                                                      | новый              |
| `src/game/hud.ts`                        | `HudView` + `highScore`, `newRecord`; `HudRecord`; `hudView(battle, record)`; новая раскладка (`HI_ZONE`, сдвиг `LEVEL_ZONE`, `POWER_UPS_ZONE`); `valueRow`, геометрия плиты и окон (`PANEL_ZONE`, `HUD_WINDOWS`) | изменяемый         |
| `src/game/hud-render.ts`                 | экспортируемый `drawPanel` (плита, кромка, скос, окна, заклёпки) первым в `drawHud`; `drawHighScore`; лампы улучшений (погасшие/горящие)                                                                          | изменяемый         |
| `src/game/art.ts`                        | цвета панели (`PANEL_*_COLOR`), цвет нового рекорда `HUD_RECORD_COLOR`; по-прежнему импортирует только `sprite.ts`                                                                                                | изменяемый         |
| `src/game/bonus-art.ts`                  | спрайты погасших ламп `CAPSULE_OFF_SPRITES: Record<PowerUpKind, Sprite>` — та же форма капсулы с буквой в тёмной палитре                                                                                          | изменяемый         |
| `src/game/scenes/play-scene.ts`          | принимает `HighScoreStore` (`readonly records`); после `battle.update` — `records.submit(battle.score)`; запоминает `recordAtStart`; `hudRecord()` для `render` и снимка                                          | изменяемый         |
| `src/game/scenes/title-scene.ts`         | принимает `HighScoreStore` и передаёт его в `PlayScene` и в фабрику `exit`                                                                                                                                        | изменяемый         |
| `src/main.ts`                            | `new HighScoreStore(safeStorage(() => window.localStorage))`, передаёт в `TitleScene`                                                                                                                             | изменяемый         |
| `src/game/dev-snapshot.ts`               | `GalaxySnapshot.highScore: { best, newRecord } \| null` (`null` на заставке), строится через `hudView(scene.battle, scene.hudRecord())`                                                                           | изменяемый         |
| тесты рядом с модулями                   | см. «Тестирование»                                                                                                                                                                                                | новые/изменяемые   |
| `second-brain/game-design.md`            | раздел «Экран» (HUD: рекорд, панель), убрать «Хранение рекорда — `localStorage`?» из открытых вопросов, «Рекорд — позже» в разделе «Щит»                                                                          | в задачах          |
| `second-brain/architecture/overview.md`  | `storage.ts` в движке, `high-score.ts`, новые параметры сцен                                                                                                                                                      | в задачах          |
| `second-brain/architecture/dev-hooks.md` | поле `highScore` в `state()`; ключ хранилища и как сбросить рекорд                                                                                                                                                | в задачах          |

### Почему хранилище разделено на движок и игру

`localStorage` — побочный эффект платформы, как клавиатура (`input.ts`) и канвас
(`screen.ts`). Обёртка `safeStorage` не знает, что хранится, — это движок: «строка по
ключу, никогда не бросает». Что хранится и как разбирается — игра (`high-score.ts`).
Логика рекорда тестируется на `memoryStorage()` без `window` и без моков глобалов
(Vitest работает в node, без jsdom). `getBacking` — функция, потому что исключение может
бросить уже само обращение к `window.localStorage` (Safari/Firefox при запрете хранилища).

### Где живёт рекорд

`HighScoreStore` создаётся **один раз в `main.ts`** и живёт всю сессию, передаваясь
`TitleScene → PlayScene → exit → TitleScene`, как `rng` и `starfield`. Так:

- кэш в памяти переживает рестарт игры, даже если хранилище сломано;
- `Battle` остаётся чистой симуляцией боя и про рекорд не знает (рекорд — мета-уровень
  над одной игрой, ему место в сцене);
- `PlayScene` — единственное место, где счёт боя встречается с рекордом.

## Сущности и состояния

### `HighScoreStore`

Данные: `best: number` (целое ≥ 0) — лучший известный счёт; ссылка на `KeyValueStorage`.

| Операция        | Что делает                                                                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| конструктор     | `best = parseHighScore(storage.getItem(key))`                                                                                                                                                                     |
| `refresh()`     | `best = max(best, parseHighScore(storage.getItem(key)))` — подхват рекорда другой вкладки; зовёт `PlayScene` при создании (начало игры). Не уменьшает `best` (сломанное/очищенное хранилище не «забывает» рекорд) |
| `submit(score)` | если `score > best`: `next = max(score, parseHighScore(сохранённое сейчас))`, запись `String(next)`, `best = next`; возвращает `true`. Иначе — `false`, без чтения и записи                                       |

Автомата нет: одно число, растущее монотонно.

Политика записи (В3 = а, **сразу**): `PlayScene` вызывает `submit` каждый тик. `submit`
пишет только при росте, т. е. запись идёт лишь пока игрок бьёт рекорд — не чаще одного
раза за тик, практически — раз на сбитого врага. `setItem` синхронный и дешёвый на таких
объёмах. Подписки на `pagehide`/`beforeunload` нет — к моменту закрытия вкладки рекорд
уже записан.

### Новый рекорд в игре

`PlayScene` в конструкторе (после `records.refresh()`) запоминает
`recordAtStart = records.best`. Признак `newRecord = battle.score > recordAtStart`.
Состояние не нужно: признак — чистая функция двух чисел, монотонен (счёт не убывает),
поэтому цвет `HI` держится до конца игры без отдельного флага (В4). На первом запуске
`recordAtStart = 0` — подсветка с первого очка; особого случая нет (см. «Сценарии», п. 1).

### Панель

Статична: плита, кромка, скос, окна, заклёпки — константы геометрии в `hud.ts` и цвета в
`art.ts`. Анимации нет (В4 — без мигания). Состояния нет. Лампы — функция
`view.powerUps`: для каждого слота горящий (`CAPSULE_SPRITES`) или погасший
(`CAPSULE_OFF_SPRITES`) спрайт.

## Поток тика

`PlayScene.update(dt, input)`:

1. `starfield.update(dt)`
2. `battle.update(dt, readIntent(input))` — без изменений.
3. **новое:** `records.submit(battle.score)`.
4. проверка `over` + Enter → `exit()` — без изменений (рекорд к этому моменту уже записан:
   шаг 3 идёт до шага 4 в том же тике).

`PlayScene.render(ctx)`:

1. чёрный фон, звёзды, `drawBattle` — без изменений.
2. `drawHud(ctx, hudView(battle, this.hudRecord()))`:
   1. `drawPanel` — плита (первый `fillRect` закрывает y = 0…`HUD_HEIGHT − 1` целиком),
      кромка, скос, окна, заклёпки;
   2. секции поверх: `SCORE`, `HI`, `LEVEL`, лампы улучшений, шкала щита.
3. `drawGameOver` — поверх всего, без изменений (он ниже панели, y = 112…).

`TitleScene` рекорд не показывает (В9) — только передаёт `records` дальше.

## Интерфейсы

```ts
// src/engine/storage.ts
/** Minimal string key-value storage; implementations never throw. */
export interface KeyValueStorage {
  /** null when missing or unreadable. */
  getItem(key: string): string | null;
  /** Silently ignored when the backing store refuses (quota, security). */
  setItem(key: string, value: string): void;
}

/**
 * Wraps a browser Storage. getBacking is called lazily inside try/catch: merely reading
 * window.localStorage may throw. Any exception = missing value / ignored write.
 */
export function safeStorage(getBacking: () => Storage): KeyValueStorage;

/** In-memory storage for tests and as a fallback. */
export function memoryStorage(initial?: Readonly<Record<string, string>>): KeyValueStorage;
```

```ts
// src/game/high-score.ts
export const HIGH_SCORE_KEY = 'galaxy.highScore';

/** Decimal digits only, safe integer; anything else (null, sign, dot, exponent, spaces) -> 0. */
export function parseHighScore(raw: string | null): number;

/** The best score of the session, cached in memory and mirrored to the storage. */
export class HighScoreStore {
  constructor(storage: KeyValueStorage, key?: string);
  get best(): number;
  /** Pulls a higher record written meanwhile (another tab); never lowers best. */
  refresh(): void;
  /**
   * score > best: best = max(score, stored now), writes that same number, returns true.
   * Otherwise false, no read and no write. Expects an integer >= 0.
   */
  submit(score: number): boolean;
}
```

```ts
// src/game/hud.ts (изменения)
export interface HudView {
  readonly level: number;
  readonly score: number;
  /** Shown record: max(record.best, score). */
  readonly highScore: number;
  /** score > the record at the start of this game; colors the HI value (В4). */
  readonly newRecord: boolean;
  readonly shield: number;
  readonly powerUps: PowerUps;
}

/** What the HUD needs to know about the record; PlayScene.hudRecord() builds it. */
export interface HudRecord {
  readonly best: number;
  readonly atStart: number;
}

/** record is required: forgetting it in PlayScene must be a type error. */
export function hudView(battle: Battle, record: HudRecord): HudView;

export const HI_LABEL = 'HI';
export const HI_ZONE: HudZone; // x = 64...111, label + value, like SCORE_ZONE
export const HUD_ZONES: readonly HudZone[]; // + HI_ZONE

/** The value row of a section zone: same x/width, y = HUD_VALUE_Y, height = HUD_ICON_SIZE. */
export function valueRow(zone: HudZone): HudZone;

/** Panel plate = the whole HUD strip. */
export const PANEL_ZONE: HudZone; // 0, 0, SCREEN_WIDTH, HUD_HEIGHT
/** Window margin around a value row, px. */
export const HUD_WINDOW_PAD = 1;
/** Dark instrument windows: valueRow(zone) grown by HUD_WINDOW_PAD, one per HUD_ZONES entry. */
export const HUD_WINDOWS: readonly HudZone[];
```

`max` в `highScore` при политике «сразу» почти всегда избыточен (`submit` уже поднял
`best`), но делает `hudView` верным при любом порядке вызовов (кадр до первого `update`,
тесты с произвольным `HudRecord`) — оставлен.

```ts
// src/game/hud-render.ts
/** Plate, top edge, bottom bevel, windows, rivets. Exported for the HUD render tests. */
export function drawPanel(ctx: CanvasRenderingContext2D): void;
```

```ts
// src/game/scenes/play-scene.ts
export class PlayScene implements Scene {
  /** Exposed for tests. */
  readonly battle: Battle;
  /** Exposed for tests. */
  readonly starfield: Starfield;
  /** Exposed for tests: the same store must travel to the next game through exit. */
  readonly records: HighScoreStore;
  private readonly recordAtStart: number;

  constructor(
    rng: Rng,
    starfield?: Starfield,
    opts?: BattleOptions,
    exit?: () => Scene,
    records?: HighScoreStore,
  );

  /** { best: records.best, atStart: recordAtStart }; used by render and the dev snapshot. */
  hudRecord(): HudRecord;
}

// src/game/scenes/title-scene.ts
export class TitleScene implements Scene {
  /** Exposed for tests. */
  readonly starfield: Starfield;
  /** Exposed for tests: the same store must reach PlayScene and the next TitleScene. */
  readonly records: HighScoreStore;

  constructor(rng: Rng, start?: GameStart, starfield?: Starfield, records?: HighScoreStore);
}
```

`records` по умолчанию — `new HighScoreStore(memoryStorage())`: 35 существующих вызовов
конструкторов в `src/` не меняются. Риск «забыли передать в `main.ts`» закрывает приёмка
(рекорд после перезагрузки) — в unit-тестах `main.ts` не покрыт.

```ts
// src/game/dev-snapshot.ts
export interface GalaxySnapshot {
  // ...
  /** null on the title. Built via hudView(scene.battle, scene.hudRecord()): equals the screen. */
  readonly highScore: { readonly best: number; readonly newRecord: boolean } | null;
}
```

`best` в снимке — показанное значение `HI` (`HudView.highScore`).

### Раскладка (В1 = а, В6 = а)

Сетка 8 px, экран 32 клетки. Значения и подписи сдвигаются вверх, чтобы окна и нижний
скос плиты уместились в 24 px:

| y     | что                                                                        |
| ----- | -------------------------------------------------------------------------- |
| 0     | верхняя кромка плиты (светлая линия)                                       |
| 3…9   | подписи (`HUD_LABEL_Y = 3`, было 4)                                        |
| 11…20 | окна приборов (`HUD_VALUE_Y − HUD_WINDOW_PAD`, высота `HUD_ICON_SIZE + 2`) |
| 12…18 | цифры (`HUD_VALUE_Y = 12`, было 14); значки 12…19; сегменты щита 14…17     |
| 22…23 | нижний скос плиты (2 px, тёмный)                                           |

По X (окно = `valueRow(зона)` ± `HUD_WINDOW_PAD`):

| секция    | зона x  | окно x  | примечание                                  |
| --------- | ------- | ------- | ------------------------------------------- |
| `SCORE`   | 8…55    | 7…56    | без изменений                               |
| `HI`      | 64…111  | 63…112  | новая, 6 цифр, по левому краю (как `SCORE`) |
| `LEVEL`   | 120…159 | 119…160 | сдвиг с 108 — правее центра на 12 px (В1)   |
| улучшения | 168…185 | 167…186 | две лампы, сдвиг с 156                      |
| щит       | 200…247 | 199…248 | без изменений по X                          |

Зазоры между окнами ≥ 6 px; `LEVEL` 120…159 вмещает до 5 цифр (`levelValueX` считается от
`LEVEL_ZONE.x`). Левая и правая кромки плиты — x = 0 и x = 255. Заклёпки — по 1 px в
углах плиты.

```
x: 0      8               64              120         168     200          255
   +==========================================================================+
   | . SCORE           HI                LEVEL                               . |
   |  [000000 ]       [012340 ]         [  3   ]   [S][D]   [## ## ## __ __]   |
   |__________________________________________________________________________|
   \::::::::::::::::::::::::::: нижний скос :::::::::::::::::::::::::::::::::::/
```

Конкретные цвета плиты, кромки, скоса, окна, погасшей лампы и `HUD_RECORD_COLOR` (В4
предлагал «например, жёлтый») — подбираются в палитре `art.ts` (`HUD_RECORD_COLOR` — в
034, остальные — в 035), ограничение —
попарная различимость (см. «Тестирование»), итог — приёмка глазами.

## Тестирование

**Unit (Vitest, без canvas):**

- `engine/storage.test.ts`: `memoryStorage` — get/set, `initial`; `safeStorage` — пишет и
  читает через фейковый `Storage`; бросающий `getBacking` → `getItem` = `null`, `setItem`
  без исключения; бросающие `getItem`/`setItem` фейка → то же.
- `game/high-score.test.ts`: `parseHighScore` — таблица (`null`, `""`, `"0"`, `"42"`,
  `"007"` → 7, `"-5"`, `"1.5"`, `"1e3"`, `" 42"`, `"abc"`, `"9007199254740993"` → 0…);
  `HighScoreStore`: старт из хранилища; `submit` больше / равно / меньше (запись только при
  росте — счётчик `setItem` у обёрнутого `memoryStorage`); «чужое» большее значение в
  хранилище → пишется `max`, **и `best` равен записанному**, `submit` вернул `true`;
  `refresh` поднимает, но не опускает; сломанное хранилище — рекорд в памяти.
- `hud.test.ts`: константа `NO_RECORD: HudRecord = { best: 0, atStart: 0 }` для
  существующих вызовов; `hudView` — `highScore = max(best, score)`, `newRecord` строго `>`
  `atStart` (включая `atStart = 0`, `score = 0` → `false`); `HI_ZONE` в `HUD_ZONES`; зоны
  попарно не пересекаются (существующий тест); `valueRow`; окна: по одному на зону,
  каждое внутри `PANEL_ZONE`, попарно не пересекаются, **содержит `valueRow` своей зоны**;
  окна не заходят на строку подписей (низ подписи < верх окна) и на скос; `HUD_HEIGHT ≤ 28`
  (существующий).
- `hud-render.test.ts` (через `canvas-test-utils`): `drawPanel` — все `fillRect` внутри
  `PANEL_ZONE`, первый вызов закрывает всю полосу; в `drawHud` первые
  `draw(drawPanel).length` вызовов — плита, к остальным — прежнее правило зон; смена
  `highScore` меняет пиксели только в `HI_ZONE`; `newRecord` меняет `fillStyle` значения
  `HI` на `HUD_RECORD_COLOR`; лампы: выключенное улучшение рисует погасший спрайт в своём
  слоте, смена `powerUps` меняет только `POWER_UPS_ZONE`.
- `bonus-art.test.ts`: `CAPSULE_OFF_SPRITES` — для каждого `PowerUpKind`, размер как у
  горящего (8×8, ≤ `HUD_ICON_SIZE`). Цвета погасшей лампы — множество не-`null` из
  `CAPSULE_OFF_SPRITES[kind].pixels` (у `Sprite` нет поля палитры): не содержит цвет окна
  (`#000`, иначе лампа сольётся с окном) и не пересекается с цветами горящего
  `CAPSULE_SPRITES[kind]` (иначе лампа не выглядит погасшей).
- `play-scene.test.ts`: с `memoryStorage` — рекорд растёт вместе со счётом и пишется в
  хранилище; после `exit()` новая игра видит рекорд (тот же `records`); `recordAtStart`
  берётся после `refresh`; `hudRecord()` отдаёт `best`/`atStart`; бой с тем же seed даёт
  тот же снимок с рекордом и без (рекорд не трогает `rng`/бой).
- `title-scene.test.ts`: `records` проходит в `PlayScene` и через `exit` в следующую
  `TitleScene` (сравнение по ссылке через `scene.records`).
- `art.test.ts`: попарная различимость `PANEL_*_COLOR`, `SHIELD_GAUGE_EMPTY_COLOR` и
  `#000` (окно); `HUD_RECORD_COLOR` ≠ `HUD_VALUE_COLOR`; новые цвета отличаются от
  `HUD_LABEL_COLOR`/`HUD_VALUE_COLOR`. Цвета лампы проверяются в `bonus-art.test.ts` (выше):
  они объявлены в `bonus-art.ts`, а `art.ts` импортирует только `sprite.ts`.
- `dev-snapshot.test.ts`: `highScore` в `play`/`over` совпадает с `hudView(battle,
hudRecord())`, `null` на заставке.

**Существующие тесты, ожидания которых меняются** (правятся ожидания, проверки не
ослабляются):

| тест                                                                         | задача | что меняется                                                                                                                  |
| ---------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `hud.test.ts:56` — `toEqual` на `HudView`                                    | 034    | новые поля `highScore`, `newRecord`; 8 вызовов `hudView(battle)` → `NO_RECORD`                                                |
| `hud-render.test.ts:36` (`BASE`), `:98` (`max`), `:210` — литералы `HudView` | 034    | добавить `highScore`, `newRecord` — иначе не пройдёт typecheck                                                                |
| `hud-render.test.ts:127-135` — «places the text and the gauge exactly»       | 034    | добавляется `HI`, `LEVEL` и лампы по новым X                                                                                  |
| `dev-snapshot.test.ts:39` — `toEqual` заставки                               | 034    | поле `highScore: null`                                                                                                        |
| `hud-render.test.ts:99-111` — «только в полосе и зонах»                      | 035    | плита отрезается по `draw(drawPanel).length`, к остатку — прежнее правило                                                     |
| `hud-render.test.ts:114-125` — «a change touches only its own zone»          | 035    | лампа меняет спрайт в своём слоте — остаётся в `POWER_UPS_ZONE`; вызовы плиты отрезаются                                      |
| `hud-render.test.ts:127-135` — «places the text and the gauge exactly»       | 035    | Y подписей 4 → 3, значений 14 → 12; плюс вызовы плиты и погасших ламп                                                         |
| `hud-render.test.ts:162-178` — точные пиксели шкалы щита                     | 035    | `y = 16` → `14` (`[200, 16, 8, 4]…` → `[200, 14, 8, 4]…`)                                                                     |
| `hud-render.test.ts:180-199` — «uses label, value and gauge colors»          | 035    | фильтр по диапазону Y заденет плиту (кромки, заклёпки в y = 3…9): сперва отрезать `draw(drawPanel).length`, затем фильтровать |
| `hud-render.test.ts:213-215` — «draws nothing in the power-ups zone…»        | 035    | переворачивается: без улучшений в зоне — `CAPSULE_OFF_SPRITES` в обоих слотах (В7)                                            |
| `hud-render.test.ts:217-225` — «draws only the enabled power-ups»            | 035    | эталон `iconCalls` (`:75-82`) включает погасшие спрайты выключенных слотов                                                    |
| `hud.test.ts:145-149` — `SHIELD_ZONE` `toEqual` (`:148`)                     | 035    | `y: 14` → `12`                                                                                                                |
| `hud.test.ts:205-208` — `SHIELD_SEGMENT_Y` `toBe(16)`                        | 035    | → `14` (при `HUD_VALUE_Y = 12`)                                                                                               |

Правило для 035: **во всех** тестах `hud-render.test.ts`, фильтрующих вызовы `drawHud` по
координатам или цвету, сначала отрезаются первые `draw(drawPanel).length` вызовов (плита),
как в `:99-111`. Тест «keeps the doubleShot icon in place» (`:227-233`) с погасшими лампами
проходит без правок (проверено разработчиком). Номера строк — по коммиту `733c43a`; после
034 они сдвинутся, ориентир — названия тестов.

**Глазами (acceptance, через `/qa` и владельцем):**

- 034: `HI` рядом со `SCORE`, растёт при обгоне и меняет цвет, переживает перезагрузку и
  рестарт; в приватном окне игра работает, рекорд — до перезагрузки. `LEVEL` правее
  центра — это окончательная раскладка, плита появится в 035 (оговорить в
  `acceptance.md`).
- 035: вид плиты, кромки, скоса, окон, ламп, цвета — в духе NES, читаемость цифр;
  враги/астероид выезжают из-под панели без артефактов; взрыв на апексе дуги не задевает
  панель.

## Альтернативы

- **Рекорд внутри `Battle`** (опция `highScore` в `BattleOptions`). Отвергнуто: бой — одна
  игра, рекорд — между играми; `Battle` начал бы зависеть от хранилища или требовать
  синхронизацию наружу. В сцене это одна строка после `battle.update`.
- **Прямой вызов `localStorage` в `high-score.ts`.** Отвергнуто: тесты потребовали бы
  мокать глобал `window`/`localStorage` в node-окружении Vitest; исключения доступа пришлось
  бы ловить в игровом коде.
- **Весь код хранилища в `src/game/`.** Рабочий вариант, но обёртка «никогда не бросает» —
  платформа, не игра; движок для этого и есть (рядом `input.ts`, `screen.ts`). Модуль
  маленький — лишней абстракции нет.
- **JSON-объект в хранилище** (`{ version, highScore }`) — задел под таблицу рекордов.
  Отвергнуто: таблица — вне рамок; одно число проще разбирать и проверять. Если появится
  таблица — новый ключ, старый читается как миграция.
- **Слушать событие `storage`** для живой синхронизации вкладок. Отвергнуто: редкий
  случай, лишний подписчик на `window`; `refresh()` в начале игры и `max` при записи
  закрывают потерю данных.
- **Открыть `recordAtStart` полем вместо `hudRecord()`.** Отвергнуто: снимок и `render`
  собирали бы `HudRecord` каждый сам — две точки, которые могут разойтись; метод даёт
  одну.
- **Необязательный `record` в `hudView`.** Отвергнуто: легко забыть в `PlayScene`; в
  тестах — константа `NO_RECORD`.
- **Окна `HUD_WINDOWS` числами.** Отвергнуто: выводятся из зон через `valueRow` —
  сдвиг зоны двигает окно автоматически.
- **Пререндер плиты в offscreen-canvas.** Отвергнуто: плита — пара десятков `fillRect` за
  кадр, оптимизация не нужна, а offscreen усложняет тест-заглушку канваса (`recorder()`
  умеет только `fillRect`/`fillStyle`).
- **Отдельный модуль `panel.ts` / `panel-render.ts`.** Отвергнуто: панель — фон самой
  HUD; геометрия окон выводится из зон секций (`hud.ts`), разнос по файлам разорвал бы
  одну точку правды. Если `hud-render.ts` разрастётся — выделить при реализации.
- **Раскладки В1 б («стопка» `1P`/`HI` слева) и в (`HI` по центру, `LEVEL` к щиту).**
  Отклонены владельцем: два стиля подписей / два окна друг над другом в 24 px; в ломает
  «`LEVEL` по центру» сильнее.
- **Временное место `HI` в 034 без сдвига `LEVEL`.** Невозможно: между `SCORE` и `LEVEL`
  52 px при 48 px значения — без зазора; и потребовало бы переделки в 035.
- **Сдвиг игрового поля под высокую панель** (В6 в). Отклонено: трогает `FORMATION_TOP`,
  дуги вылета, высоту пике до корабля — баланс фич 002/003.

## Решения владельца

| Вопрос                       | Решение                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| В1. Раскладка `HI`           | а — колонками: `SCORE` · `HI` · `LEVEL` · улучшения · щит; `LEVEL` на 12 px правее центра                                                                    |
| В2. Подпись                  | а — `HI`                                                                                                                                                     |
| В3. Когда писать рекорд      | а — сразу при каждом росте; рекорд прерванной игры засчитывается                                                                                             |
| В4. Индикация нового рекорда | б — значение `HI` меняет цвет с момента обгона до конца игры, без мигания; строки `NEW RECORD` нет                                                           |
| В5. Корпус панели            | а — непрозрачная плита во всю ширину, светлая верхняя кромка, тёмный нижний скос, заклёпки, чёрные окна приборов                                             |
| В6. Высота панели            | а — 24 px, поле не сдвигается; зазор до взрыва на апексе — 5 px                                                                                              |
| В7. Лампы улучшений          | б — не полученное — погасшая капсула с буквой (тёмная палитра), полученное — обычный значок                                                                  |
| В8. Астероид под панелью     | а — как есть: может быть сбит под плитой, капсула выпадает из-под края                                                                                       |
| В9. Рекорд вне боя           | `HI` на заставке не показываем, команды сброса нет. **Владелец явно не отвечал** — принята рекомендация архитектора; при желании владелец может пересмотреть |

## Открытые вопросы к владельцу

Нет. (В9 закрыт рекомендацией без явного ответа — см. «Решения владельца».)

## Нарезка на задачи

Номера — следующие свободные (последняя завершённая — 033).

1. **034 — рекорд: хранилище и показ `HI`** (логика + текущий стиль панели).
   `engine/storage.ts` + тесты; `game/high-score.ts` + тесты (`submit` с `best = max`);
   `HudView.highScore`/`newRecord`, `HudRecord`, `hudView(battle, record)`; `HI_ZONE`,
   сдвиг `LEVEL_ZONE` (120) и `POWER_UPS_ZONE` (168) по X; `drawHighScore` с
   `HUD_RECORD_COLOR` (+ цвет в `art.ts` и `art.test`); `PlayScene` (`records`,
   `recordAtStart`, `submit` после `battle.update`, `hudRecord()`), `TitleScene`, `main.ts`;
   `dev-snapshot.highScore` через `hudRecord()`; правка ожиданий существующих тестов
   (строки 034 в таблице «Тестирования», включая литералы `HudView` в `hud-render.test.ts`);
   `TitleScene.records` открыт для тестов. Панель пока без плиты — прежний вид, координаты
   Y прежние.
   Проверка: тесты + перезагрузка страницы + приватное окно; `acceptance.md` оговаривает
   смещённый `LEVEL`. Документы: `game-design.md` (рекорд), `overview.md`, `dev-hooks.md`.
2. **035 — панель корабля.** `HUD_LABEL_Y = 3`, `HUD_VALUE_Y = 12`; `valueRow`,
   `HUD_WINDOW_PAD`, `HUD_WINDOWS`, `PANEL_ZONE`; цвета панели в `art.ts` + попарная
   различимость в `art.test`; `CAPSULE_OFF_SPRITES` в `bonus-art.ts`; экспортируемый
   `drawPanel` первым в `drawHud`; погасшие/горящие лампы; правка ожиданий существующих
   тестов (строки 035, включая отрезку плиты во всех фильтрующих тестах); цвета ламп —
   в `bonus-art.test`. Зависит от 034 (окна строятся вокруг всех зон, включая `HI`).
   Проверка глазами: вид панели, читаемость, объекты выезжают из-под панели (В8).
   Документы: `game-design.md` (раздел «Экран»: панель), `overview.md`.

Почему так: 034 — логика с побочным эффектом и проводка через сцены, проверяемая
тестами и перезагрузкой страницы; 035 — чистый вид, проверяемый глазами. Разделение даёт
владельцу оценить рекорд отдельно от вкусовой приёмки панели. Обратный порядок
потребовал бы переделывать окна, когда появится `HI`.

## История

- **Раунд 1:** первая версия. Рекорд — `HighScoreStore` в сцене поверх безопасной обёртки
  хранилища в движке; панель — непрозрачная плита с окнами в прежних 24 px. 9 вопросов к
  владельцу (В1–В9), 2 задачи (034, 035).
- **Раунд 2:** внесены решения владельца В1–В9 (все по рекомендациям; В9 — без явного
  ответа, принята рекомендация). По отзыву разработчика (7 рекомендаций, все приняты):
  `PlayScene.hudRecord()` + `readonly records` для снимка; `submit` ставит `best = max(score,
stored)`; `valueRow` и `HUD_WINDOWS`, выведенные из зон; таблица меняющихся тестов;
  попарная различимость цветов панели; исправлен зазор (5 px, верх взрыва y = 29);
  `NO_RECORD` в тестах. Ответы на 2 вопроса разработчика: подсветка на первом запуске —
  задумано; сдвиг `LEVEL` по X остаётся в 034. Открытых вопросов нет.
- **Раунд 3:** по отзыву разработчика (`dev-review-2.md`, 0 блокеров, 3 рекомендации — все
  приняты): `TitleScene` объявляет `readonly records` в интерфейсе; таблица меняющихся
  тестов исправлена (номера строк) и дополнена (литералы `HudView` в 034; `SHIELD_SEGMENT_Y`,
  пиксели шкалы, тесты пустой/частичной зоны улучшений и отрезка плиты во всех
  фильтрующих тестах в 035); проверка цветов погасшей лампы перенесена в
  `bonus-art.test.ts` и берёт цвета из `pixels`. Статус — согласовано.
