# План реализации: Рекорд — хранилище и показ `HI`

Лучший счёт сохраняется в `localStorage` (ключ `galaxy.highScore`) и показывается в верхней
панели колонкой `HI` между `SCORE` и `LEVEL`; пока счёт выше рекорда на старте игры, значение
`HI` жёлтое. Хранилище — обёртка в движке, которая никогда не бросает; логика рекорда — в
игре (`HighScoreStore`); `Battle` о рекорде не знает. Панель остаётся прежней по Y и виду
(без плиты), раскладка по X — окончательная (В1).

Рамка — `analyze.md` этой задачи и `second-brain/features/009-high-score-ship-panel/design.md`
(пункт 1 нарезки, «Интерфейсы», «Тестирование»). Код — база `201044f`.

Порядок шагов выбран так, чтобы после каждого `npm run typecheck` оставался зелёным, кроме
шага 4 → 5 (смена сигнатуры `hudView` чинится в том же шаге в сцене и тестах).

## 1. Хранилище в движке

**Файл (создать):** `src/engine/storage.ts`

Движок не знает, что хранится. Отступление от дизайна (с причиной): параметр `getBacking`
типизирован как `() => Pick<Storage, 'getItem' | 'setItem'>`, а не `() => Storage` —
`window.localStorage` подходит без изменений, а фейк в тестах не нужно приводить через
`as unknown as Storage`. Интерфейс для вызывающих не меняется.

```typescript
/** Minimal string key-value storage; implementations never throw. */
export interface KeyValueStorage {
  /** null when missing or unreadable. */
  getItem(key: string): string | null;
  /** Silently ignored when the backing store refuses (quota, security). */
  setItem(key: string, value: string): void;
}

/** The part of the DOM Storage that safeStorage uses. */
export type StorageBacking = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Wraps a browser Storage. getBacking is called on every access inside try/catch: merely
 * reading window.localStorage may throw (SecurityError). Any exception = missing value /
 * ignored write.
 */
export function safeStorage(getBacking: () => StorageBacking): KeyValueStorage {
  return {
    getItem(key) {
      try {
        return getBacking().getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        getBacking().setItem(key, value);
      } catch {
        // quota exceeded or storage disabled: the value lives only in the caller's memory
      }
    },
  };
}

/** In-memory storage for tests and as a fallback. */
export function memoryStorage(initial: Readonly<Record<string, string>> = {}): KeyValueStorage {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}
```

## 2. Рекорд в игре

**Файл (создать):** `src/game/high-score.ts`

Не трогает `window`; импортирует из движка только тип.

```typescript
import type { KeyValueStorage } from '../engine/storage';

export const HIGH_SCORE_KEY = 'galaxy.highScore';

/** ASCII decimal digits only (no sign, dot, exponent, spaces). */
const DIGITS = /^\d+$/;

/** Decimal digits only, safe integer; anything else (null, sign, dot, exponent, spaces) -> 0. */
export function parseHighScore(raw: string | null): number {
  if (raw === null || !DIGITS.test(raw)) return 0;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : 0;
}

/**
 * The best score of the session, cached in memory and mirrored to the storage. best only
 * grows: a broken storage keeps the record in memory until the page reloads; garbage in the
 * storage reads as 0 and is overwritten by the first record.
 */
export class HighScoreStore {
  private value: number;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key: string = HIGH_SCORE_KEY,
  ) {
    this.value = this.stored();
  }

  get best(): number {
    return this.value;
  }

  /** Pulls a higher record written meanwhile (another tab); never lowers best. */
  refresh(): void {
    this.value = Math.max(this.value, this.stored());
  }

  /**
   * score > best: best = max(score, stored now), writes that same number, returns true.
   * Otherwise false, no read and no write. Expects an integer >= 0.
   */
  submit(score: number): boolean {
    if (score <= this.value) return false;
    const next = Math.max(score, this.stored());
    this.storage.setItem(this.key, String(next));
    this.value = next;
    return true;
  }

  private stored(): number {
    return parseHighScore(this.storage.getItem(this.key));
  }
}
```

Заметка: `"9007199254740993"` → `Number` даёт `9007199254740992`, `isSafeInteger` — `false` → 0;
`"9007199254740991"` (`MAX_SAFE_INTEGER`) — проходит.

## 3. Цвет рекорда

**Файл (изменить):** `src/game/art.ts` — рядом с `HUD_LABEL_COLOR` / `HUD_VALUE_COLOR`.

Значение `#ffe14f` — принято по рекомендации анализа (открытый вопрос 1): тот же NES-жёлтый,
что щит уровня 2; окончательно — на приёмке глазами.

```typescript
/**
 * HUD HI value while this game beats the record (feature 009 В4). First pass: the same
 * NES yellow as shield level 2; approved at acceptance.
 */
export const HUD_RECORD_COLOR = '#ffe14f';
```

## 4. Модель HUD: поля рекорда, зона `HI`, сдвиг колонок

**Файл (изменить):** `src/game/hud.ts`

1. `HudView` + два поля:

   ```typescript
   export interface HudView {
     readonly level: number;
     readonly score: number;
     /** Shown record: max(record.best, score). */
     readonly highScore: number;
     /** score > the record at the start of this game; colors the HI value (В4). */
     readonly newRecord: boolean;
     /** Shield level 0..MAX_SHIELD, drawn as the shield gauge. */
     readonly shield: number;
     /** Enabled power-ups; each one lights its own fixed slot until the game ends. */
     readonly powerUps: PowerUps;
   }

   /** What the HUD needs to know about the record; PlayScene.hudRecord() builds it. */
   export interface HudRecord {
     /** The session's best score (HighScoreStore.best). */
     readonly best: number;
     /** The record when this game started; beating it makes newRecord. */
     readonly atStart: number;
   }
   ```

2. Подпись и зона `HI` (после `SCORE_ZONE`); `hud.ts` **не** импортирует `high-score.ts`:

   ```typescript
   export const HI_LABEL = 'HI';

   /** x = 64...111: right of SCORE with an 8 px gap; label or SCORE_DIGITS digits, like SCORE. */
   export const HI_ZONE: HudZone = {
     x: 64,
     y: HUD_LABEL_Y,
     width: Math.max(textWidth(HI_LABEL), SCORE_DIGITS * CHAR_ADVANCE),
     height: TEXT_ZONE_HEIGHT,
   };
   ```

3. `LEVEL_ZONE`: `x` — литерал `120` вместо центра экрана; комментарий
   `/** x = 120...159: right of HI with an 8 px gap (12 px right of the screen center, В1). */`.
   `LEVEL_ZONE_WIDTH` и `levelValueX` не меняются (центровка номера под подписью сохраняется).

4. `POWER_UPS_ZONE.x`: `156` → `168`; комментарий —
   `x = 168...185, y = 14...21: value row between the level (ends at 159) and the shield gauge (starts at 200).`
   `POWER_UP_SLOT_X` выводится из зоны сам (168 / 178).

5. `HUD_ZONES`: `[SCORE_ZONE, HI_ZONE, LEVEL_ZONE, SHIELD_ZONE, POWER_UPS_ZONE]`.

6. `hudView` — второй аргумент обязательный:

   ```typescript
   /**
    * Builds the HUD snapshot from the battle and the record: level, score, record, shield and
    * power-ups. highScore takes max with the score, so the view is right before the first
    * submit too. record is required: forgetting it in PlayScene is a type error.
    */
   export function hudView(battle: Battle, record: HudRecord): HudView {
     return {
       level: battle.level,
       score: battle.score,
       highScore: Math.max(record.best, battle.score),
       newRecord: battle.score > record.atStart,
       shield: battle.player.shield,
       powerUps: battle.player.powerUps,
     };
   }
   ```

`SCREEN_WIDTH` в `hud.ts` остаётся нужен (`SHIELD_ZONE`). Раскладка: `SCORE` 8…55 · `HI`
64…111 · `LEVEL` 120…159 · улучшения 168…185 · щит 200…247.

## 5. Рендер HUD: секция `HI`

**Файл (изменить):** `src/game/hud-render.ts`

- импорт `HUD_RECORD_COLOR` из `./art`, `HI_LABEL`, `HI_ZONE` из `./hud`;
- у `drawLabeled` — параметр цвета значения с умолчанием (остальные секции не меняются):

  ```typescript
  /** Label on the label row at the zone's left edge, value under it at valueX. */
  function drawLabeled(
    ctx: CanvasRenderingContext2D,
    zone: HudZone,
    label: string,
    value: string,
    valueX: number,
    valueColor: string = HUD_VALUE_COLOR,
  ): void {
    drawText(ctx, label, zone.x, HUD_LABEL_Y, HUD_LABEL_COLOR);
    drawText(ctx, value, valueX, HUD_VALUE_Y, valueColor);
  }

  /** Record is left-aligned under HI like the score; HUD_RECORD_COLOR while beaten, no blinking. */
  function drawHighScore(
    ctx: CanvasRenderingContext2D,
    highScore: number,
    newRecord: boolean,
  ): void {
    const color = newRecord ? HUD_RECORD_COLOR : HUD_VALUE_COLOR;
    drawLabeled(ctx, HI_ZONE, HI_LABEL, formatScore(highScore), HI_ZONE.x, color);
  }
  ```

- `drawHud`: `drawScore` → **`drawHighScore(ctx, view.highScore, view.newRecord)`** →
  `drawLevel` → `drawShield` → `drawPowerUps`; JSDoc — «score, record (HI), level, shield
  gauge, power-ups sections».

## 6. Игровая сцена

**Файл (изменить):** `src/game/scenes/play-scene.ts`

```typescript
import { memoryStorage } from '../../engine/storage';
import { HighScoreStore } from '../high-score';
import type { HudRecord } from '../hud';
import { hudView } from '../hud';
// ...

export class PlayScene implements Scene {
  /** Exposed for tests. */
  readonly battle: Battle;
  /** Exposed for tests. */
  readonly starfield: Starfield;
  /** Exposed for tests: the same store must travel to the next game through exit. */
  readonly records: HighScoreStore;
  /** records.best after refresh() in the constructor: beating it makes a new record. */
  private readonly recordAtStart: number;

  /**
   * ... (existing text) records: the session's record store, shared by the title and every
   * game; without it - a fresh in-memory one (tests).
   */
  constructor(
    rng: Rng,
    starfield?: Starfield,
    opts?: BattleOptions,
    private readonly exit?: () => Scene,
    records?: HighScoreStore,
  ) {
    // ... stars, battle seed, battle — unchanged ...
    // The record spends no rng: stars and the battle stay as they were for a given seed.
    this.records = records ?? new HighScoreStore(memoryStorage());
    this.records.refresh(); // a higher record from another tab counts from this game on
    this.recordAtStart = this.records.best;
  }

  update(dt: number, input: Input): Scene | void {
    this.starfield.update(dt);
    this.battle.update(dt, readIntent(input));
    // Written at once on every rise (В3), before a possible exit in this same tick.
    this.records.submit(this.battle.score);
    // After the battle tick: Enter on the very tick of entering over already counts.
    if (this.battle.phase === 'over' && input.pressed('start') && this.exit) {
      return this.exit();
    }
  }

  /** The record as the HUD sees it; used by render and the dev snapshot. */
  hudRecord(): HudRecord {
    return { best: this.records.best, atStart: this.recordAtStart };
  }

  render(ctx: CanvasRenderingContext2D): void {
    // ... unchanged ...
    drawHud(ctx, hudView(this.battle, this.hudRecord())); // no background: text over the battle
    // ...
  }
}
```

## 7. Заставка

**Файл (изменить):** `src/game/scenes/title-scene.ts`

```typescript
import { memoryStorage } from '../../engine/storage';
import { HighScoreStore } from '../high-score';

export class TitleScene implements Scene {
  /** Exposed for tests. */
  readonly starfield: Starfield;
  /** Exposed for tests: the same store must reach PlayScene and the next TitleScene. */
  readonly records: HighScoreStore;
  private ticks = 0;

  constructor(
    private readonly rng: Rng,
    private readonly start: GameStart = {},
    starfield?: Starfield,
    /** The session's record store (main.ts); undefined = a fresh in-memory one (tests). */
    records?: HighScoreStore,
  ) {
    this.starfield = starfield ?? new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, rng);
    this.records = records ?? new HighScoreStore(memoryStorage());
  }

  update(dt: number, input: Input): Scene | void {
    // ...
    if (input.pressed('start')) {
      const exit = (): Scene => new TitleScene(this.rng, this.start, this.starfield, this.records);
      return new PlayScene(this.rng, this.starfield, { ...this.start }, exit, this.records);
    }
  }
  // render — без изменений: рекорд на заставке не показывается (В9).
}
```

## 8. Точка входа

**Файл (изменить):** `src/main.ts`

```typescript
import { safeStorage } from './engine/storage';
import { HighScoreStore } from './game/high-score';
// ...
const rng = createRng(params.seed ?? Date.now());
/** One record store for the session: survives restarts; localStorage keeps it across reloads. */
const records = new HighScoreStore(safeStorage(() => window.localStorage));
let scene: Scene = new TitleScene(
  rng,
  { startLevel: params.startLevel, shield: params.shield },
  undefined,
  records,
);
```

Риск «забыли передать» тесты не ловят (умолчание в сценах) — закрывается приёмкой «рекорд
после перезагрузки».

## 9. Dev-снимок

**Файл (изменить):** `src/game/dev-snapshot.ts`

```typescript
import { hudView } from './hud';

export interface GalaxySnapshot {
  // ... tick, paused, scene, battle ...
  /**
   * null on the title. Built via hudView(scene.battle, scene.hudRecord()): equals the screen.
   * best = the HI value shown, newRecord = HI drawn in HUD_RECORD_COLOR.
   */
  readonly highScore: { readonly best: number; readonly newRecord: boolean } | null;
}

export function snapshotScene(scene: Scene, meta: { ... }): GalaxySnapshot {
  const base = { tick: meta.tick, paused: meta.paused };
  if (scene instanceof PlayScene) {
    const battle = snapshotBattle(scene.battle);
    const view = hudView(scene.battle, scene.hudRecord());
    return {
      ...base,
      scene: battle.phase === 'over' ? 'over' : 'play',
      battle,
      highScore: { best: view.highScore, newRecord: view.newRecord },
    };
  }
  return {
    ...base,
    scene: scene instanceof TitleScene ? 'title' : 'unknown',
    battle: null,
    highScore: null,
  };
}
```

`dev-hooks.ts` не меняется (отдаёт `GalaxySnapshot` целиком).

## 10. Тесты

Все — Vitest, environment `node` (без jsdom, глобалы не мокаются). Существующие проверки не
ослабляются — правятся только ожидания.

### 10.1 `src/engine/storage.test.ts` (создать)

- `memoryStorage`: пусто → `getItem` = `null`; `setItem` → `getItem` возвращает значение;
  перезапись; `initial` виден сразу; два экземпляра не делят данные; изменение объекта
  `initial` после создания не влияет.
- `safeStorage` с фейком (`Map` + `getItem`/`setItem`, тип `StorageBacking`): пишет и читает
  через фейк; отсутствующий ключ → `null`.
- бросающий `getBacking` (`() => { throw new Error('SecurityError'); }`): создание
  `safeStorage` не бросает и не зовёт `getBacking`; `getItem` → `null`; `setItem` не бросает.
- фейк с бросающими `getItem`/`setItem` → `getItem` = `null`, `setItem` без исключения.

### 10.2 `src/game/high-score.test.ts` (создать)

Хелпер `countingStorage(initial?)` — `memoryStorage`, обёрнутый счётчиками `getItem`/`setItem`.

- `parseHighScore` — `it.each`: `null`→0, `""`→0, `"0"`→0, `"42"`→42, `"007"`→7, `"-5"`→0,
  `"1.5"`→0, `"1e3"`→0, `" 42"`→0, `"42 "`→0, `"abc"`→0, `"9007199254740991"`→
  `Number.MAX_SAFE_INTEGER`, `"9007199254740993"`→0.
- конструктор: `best` из хранилища (`'500'` → 500); пусто → 0; мусор → 0; ключ по умолчанию —
  `HIGH_SCORE_KEY` (`'galaxy.highScore'`); свой `key` читается/пишется под ним.
- `submit`: больше → `true`, `best` = счёт, в хранилище `String(score)`, ровно 1 `setItem`;
  равно и меньше → `false`, ни одного `getItem`/`setItem` после конструктора, `best` прежний.
- «другая вкладка»: стор с `best = 100`, в хранилище прямо записано `'900'`; `submit(200)` →
  `true`, в хранилище `'900'`, `best` = 900 (= записанному); следующий `submit(500)` → `false`.
- `refresh`: в хранилище записали большее → `best` поднялся; меньшее/мусор → `best` не
  опустился.
- сломанное хранилище (`safeStorage(() => { throw ... })`): `best` = 0, `submit(300)` →
  `true`, `best` = 300; `refresh()` не опускает до 0; `submit(200)` → `false`.

### 10.3 `src/game/hud.test.ts` (изменить)

- константа `const NO_RECORD: HudRecord = { best: 0, atStart: 0 };` (`import type { HudRecord }`)
  — во все 8 существующих вызовов `hudView(battle)` → `hudView(battle, NO_RECORD)`;
- `toEqual` в «shows the battle level…» (`:56`) + `highScore: 0, newRecord: false`;
- вынести набор 30 очков из «follows the battle score» в хелпер `battleWith30()` (тот же код),
  новые кейсы `describe('hudView record')`:
  - счёт 0, `NO_RECORD` → `highScore` 0, `newRecord` `false` (ничья 0 = 0 — не рекорд);
  - счёт 0, `{ best: 500, atStart: 500 }` → `highScore` 500, `newRecord` `false`;
  - счёт 30, `NO_RECORD` → `highScore` 30, `newRecord` `true` (первая игра — с первого очка);
  - счёт 30, `{ best: 30, atStart: 30 }` → `newRecord` `false` (ничья);
  - счёт 30, `{ best: 10, atStart: 10 }` → `highScore` 30 (max, даже до `submit`), `newRecord` `true`;
  - счёт 30, `{ best: 900, atStart: 10 }` (чужой рекорд из другой вкладки) → `highScore` 900,
    `newRecord` `true` — ожидаемое поведение по дизайну (`discussion.md`, раунд 2, п. 2);
- раскладка: `it('includes the HI zone')` — `HUD_ZONES` содержит `HI_ZONE`;
  `it('lays out the columns left to right (В1)')` — `SCORE_ZONE.x` 8,
  `HI_ZONE` `toEqual({ x: 64, y: 4, width: 48, height: 17 })`, `LEVEL_ZONE.x` 120,
  `POWER_UPS_ZONE.x` 168, `POWER_UP_SLOT_X` `{ fastShot: 168, doubleShot: 178 }`,
  `SHIELD_ZONE.x` 200; соседние колонки с зазором ≥ 8 px (по порядку `HUD_ZONES` по `x`);
  непересечение — существующий тест (теперь с `HI_ZONE`);
- вместимость: `it('fits the HI label and six digits')`; в `it.each` «%s zone spans both text
  rows» (`:174-180`) добавить `['hi', HI_ZONE]`.

### 10.4 `src/game/hud-render.test.ts` (изменить)

- литералы `HudView`: `BASE` (`:36`) + `highScore: 0, newRecord: false`; `max` (`:98`) +
  `highScore: 999999, newRecord: true`; `:210` + `highScore: 4567, newRecord: true`;
- «a change touches only its own zone» (`:114-125`) + строки
  `['highScore', { ...BASE, highScore: 123 }, HI_ZONE]` и
  `['newRecord', { ...BASE, newRecord: true }, HI_ZONE]`;
- «places the text and the gauge exactly» (`:127-135`): после двух строк `SCORE` вставить
  `textCalls(HI_LABEL, HI_ZONE.x, HUD_LABEL_Y, HUD_LABEL_COLOR)`,
  `textCalls(formatScore(0), HI_ZONE.x, HUD_VALUE_Y, HUD_VALUE_COLOR)`; `LEVEL` — по
  `LEVEL_ZONE.x` (теперь 120) — без правки текста теста;
- «uses label, value and gauge colors» (`:180-199`): в фильтр `valueText` добавить
  `inZone(c, HI_ZONE)` (у `BASE` `newRecord: false` → `HUD_VALUE_COLOR`);
- «draws the labels the same for any values» (`:201-211`): в фильтр добавить `HI_ZONE`
  (подпись `HI` не меняет цвет при `newRecord: true`);
- новые:
  - `it('draws the beaten record in HUD_RECORD_COLOR, the label unchanged')`:
    `draw({ ...BASE, highScore: 42, newRecord: true }).filter(inZone HI_ZONE)` `toEqual`
    `[...textCalls(HI_LABEL, HI_ZONE.x, HUD_LABEL_Y, HUD_LABEL_COLOR), ...textCalls(formatScore(42), HI_ZONE.x, HUD_VALUE_Y, HUD_RECORD_COLOR)]`;
  - `it('keeps the score value color when the record is beaten')`: вызовы в `SCORE_ZONE` на
    строке значений — только `HUD_VALUE_COLOR`;
  - `it('draws the record value in HUD_VALUE_COLOR when not beaten')`: значение `HI` при
    `highScore: 500, newRecord: false` — `textCalls(formatScore(500), HI_ZONE.x, HUD_VALUE_Y, HUD_VALUE_COLOR)`.

### 10.5 `src/game/art.test.ts` (изменить)

`describe('HUD colors')`: `HUD_RECORD_COLOR` ≠ `HUD_VALUE_COLOR` и ≠ `HUD_LABEL_COLOR`.

### 10.6 `src/game/scenes/play-scene.test.ts` (изменить)

Хелпер (по образцу «shoots down an enemy», `:172`): `scoringScene(records?)` —
`new PlayScene(createRng(1), undefined, { levels: ONE_CORNER_ENEMY }, undefined, records)`,
`ship.x = 50`, `press('fire')`, `step(…, 42)` → враг `exploding`, `battle.score > 0`.
Новый `describe('PlayScene record')`:

- без `records` — свой стор в памяти: `best` 0, у двух сцен `records` разные объекты;
- старт с сохранённым: хранилище `{ [HIGH_SCORE_KEY]: '500' }` → `hudRecord()` =
  `{ best: 500, atStart: 500 }`;
- `recordAtStart` после `refresh`: стор создан над пустым хранилищем, затем в хранилище
  записано `'700'` (другая вкладка), затем сцена → `hudRecord().atStart` = 700;
- обгон пишется сразу: пустое хранилище, `scoringScene` → `storage.getItem(HIGH_SCORE_KEY)` =
  `String(score)`, `records.best` = score, `hudRecord()` = `{ best: score, atStart: 0 }`,
  `hudView(battle, hudRecord()).newRecord` = `true`;
- рекорд выше счёта не трогается: хранилище `'999999'` → после `scoringScene` в хранилище
  `'999999'`, `newRecord` `false`, `highScore` 999999;
- `rng` не тратится: вариант теста «makes exactly the scene rng calls…» (`:285`) с
  `records` над хранилищем `'500'` — следующий `rng()` совпадает с эталоном;
- бой не зависит от рекорда: две сцены seed 1 (`records` над `'999999'` и без), одинаковые
  тики с огнём (≈ 300) → `snapshotBattle(a.battle)` `toEqual` `snapshotBattle(b.battle)`
  (`snapshotBattle` из `../dev-snapshot`);
- `render` использует рекорд: в `recorder()` после `render` есть вызовы `HUD_RECORD_COLOR` в
  `HI_ZONE` у сцены после обгона и нет — у сцены без очков.

### 10.7 `src/game/scenes/title-scene.test.ts` (изменить)

- `it('hands one record store through the whole cycle')`: `records = new HighScoreStore(memoryStorage())`,
  `title = new TitleScene(createRng(1), undefined, undefined, records)` → `title.records` `toBe`
  `records`; `game = startGame(...)` → `game.records` `toBe` `records`; `loseGame`;
  `back = backToTitle(...)` → `back.records` `toBe` `records`; `startGame(back)` → `.records`
  `toBe` `records`;
- `it('starts the next game from the record of the previous one')`: в игре
  `game.records.submit(1234)` (тот же стор, в который пишет `PlayScene`; сама запись по
  счёту покрыта в 10.6), `loseGame`, `backToTitle`, `startGame` → `next.hudRecord()` =
  `{ best: 1234, atStart: 1234 }`, `hudView(next.battle, next.hudRecord()).newRecord` `false`;
- без `records` у заставки — свой стор, и он же уходит в игру (`startGame(title).records`
  `toBe` `title.records`).

### 10.8 `src/game/dev-snapshot.test.ts` (изменить)

- «describes the title» (`:39`): `toEqual` + `highScore: null`;
- `unknown`-сцена (если есть кейс) — `highScore: null`;
- свежая игра: `highScore` = `{ best: 0, newRecord: false }`;
- игра с сохранённым рекордом `'500'` (`PlayScene(..., records)`): `{ best: 500, newRecord: false }`;
- `play` после обгона и `over`: `snap(scene).highScore` `toEqual`
  `{ best: view.highScore, newRecord: view.newRecord }` при `view = hudView(scene.battle, scene.hudRecord())`;
- «is plain JSON» — проходит как есть (поле — примитивы / `null`).

## 11. Ручная проверка

`npm run dev`, затем в браузере (для `acceptance.md` и `/qa`):

1. Чистое хранилище (`localStorage.removeItem('galaxy.highScore')` + перезагрузка): в игре
   `SCORE 000000`, `HI 000000` белым. Сбить врага → `HI` = счёт и жёлтый; растёт со счётом,
   не мигает.
2. Game over → Enter → заставка (рекорда на ней нет) → Enter: `SCORE 000000`, `HI` — рекорд
   прошлой игры, белым. Набрать меньше — `HI` не меняется; ровно столько же — белый; больше —
   жёлтый.
3. Перезагрузка страницы посреди игры после обгона → новая игра показывает рекорд (запись
   «сразу», В3). В DevTools → Application → Local Storage: `galaxy.highScore` = рекорд.
4. Приватное окно / запрет cookies и данных сайта: игра запускается и играется, рекорд
   держится между играми, после перезагрузки — 0. В консоли нет ошибок.
5. Раскладка: `SCORE` · `HI` · `LEVEL` · улучшения · щит колонками, ничего не налезает.
   **`LEVEL` стоит на 12 px правее центра — это окончательная раскладка (В1); плита и окна
   приборов появятся в задаче 035.** Эту оговорку обязательно внести в `acceptance.md`.
6. Цвет `HUD_RECORD_COLOR = #ffe14f` — утвердить глазами: отличим от белых цифр и
   красно-оранжевых подписей; не путается со жёлтой шкалой щита (щит 2 того же цвета) —
   если путается, сменить значение в `art.ts`.
7. Две вкладки: рекорд, поставленный во второй, первая подхватит в начале своей следующей
   игры или при первом своём росте; если посреди игры `HI` показал чужой больший рекорд
   жёлтым — это ожидаемо по дизайну.

`acceptance.md` создаёт оркестратор по этому разделу (пп. 5 и 6 — что утвердить владельцу).

## 12. Обновление документации

**`second-brain/architecture/overview.md`** (на русском):

- «Движок»: пункт `storage.ts` — `KeyValueStorage { getItem → string | null, setItem }`
  (никогда не бросает), `safeStorage(getBacking)` (обращение к хранилищу на каждый вызов
  внутри `try/catch`, ошибка = нет значения / запись проигнорирована), `memoryStorage(initial?)`.
- «Игра»: пункт `high-score.ts` — `HIGH_SCORE_KEY = 'galaxy.highScore'`, `parseHighScore`
  (только цифры, безопасное целое, иначе 0), `HighScoreStore(storage, key?)`: `best` только
  растёт, `refresh()` не понижает, `submit(score)` пишет `max(score, сохранённое)` только при
  росте.
- `scenes/title-scene.ts`: сигнатура `TitleScene(rng, start?, starfield?, records?)`,
  `readonly records`, передаёт `records` в `PlayScene` и в фабрику `exit`.
- `scenes/play-scene.ts`: `PlayScene(rng, starfield?, opts?, exit?, records?)`,
  `readonly records`, `recordAtStart` после `refresh()`, `update`: … → `battle.update` →
  `records.submit(battle.score)` → проверка `over` + Enter; `hudRecord()`; слой
  `drawHud(hudView(battle, hudRecord()))`; рекорд не тратит `rng`.
- `main.ts`: `HighScoreStore(safeStorage(() => window.localStorage))`, четвёртый аргумент
  `TitleScene`.
- `hud.ts`: `HudView { level, score, highScore, newRecord, shield, powerUps }`, `HudRecord`,
  `hudView(battle, record)` (`highScore = max(best, score)`, `newRecord = score > atStart`),
  `HI_LABEL`, `HI_ZONE` (64, 4, 48×17), `LEVEL_ZONE` (120, 4, 40×17), `POWER_UPS_ZONE`
  (168, 14, 18×8), слоты 168 / 178.
- `hud-render.ts`: порядок секций счёт → рекорд → уровень → щит → улучшения; значение `HI` —
  `HUD_RECORD_COLOR` при `newRecord`, иначе `HUD_VALUE_COLOR`.
- `dev-snapshot`: поле `highScore`.
- Граф импортов: `title-scene → {config, engine/storage, high-score, starfield, play-scene}`;
  `play-scene → {…, engine/storage, high-score, hud}` (+ `HudRecord` — type);
  `high-score` (`KeyValueStorage` — type); `hud-render` — без новых модулей;
  `main → {…, engine/storage, game/high-score}`; `dev-snapshot → {hud, scenes/play-scene,
scenes/title-scene}`; `engine/storage` — без импортов. Циклов нет.

**`second-brain/architecture/dev-hooks.md`** (на русском):

- «Снимок `state()`»: `highScore` — `null` на титуле, иначе `{ best, newRecord }`: `best` —
  показанное значение `HI` (`max(рекорд, счёт)`), `newRecord` — счёт больше рекорда на
  старте этой игры (`HI` жёлтый).
- новый раздел/рецепт «Рекорд»: хранится в `localStorage` под ключом `galaxy.highScore`
  (десятичная строка); **сброс — `localStorage.removeItem('galaxy.highScore')` и
  перезагрузка страницы** (рекорд кэшируется в памяти, `refresh()` его не понижает, без
  перезагрузки сброс не виден); задать рекорд — `localStorage.setItem('galaxy.highScore', '5000')`
  - перезагрузка (или до начала следующей игры — подхватит `refresh()`, если больше текущего);
    рекорд из другой вкладки подхватывается в начале игры или при первом росте, `HI` может
    показать чужой больший рекорд жёлтым — ожидаемо.

`game-design.md` уже обновлён — не трогать. Запись фичи в `second-brain/features/` не трогать.
README в `src/engine/` и `src/game/` нет.

## Сводка по файлам

| Действие      | Файл                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Создать       | `src/engine/storage.ts`                                                                                                   |
| Создать       | `src/engine/storage.test.ts`                                                                                              |
| Создать       | `src/game/high-score.ts`                                                                                                  |
| Создать       | `src/game/high-score.test.ts`                                                                                             |
| Изменить      | `src/game/art.ts`                                                                                                         |
| Изменить      | `src/game/art.test.ts`                                                                                                    |
| Изменить      | `src/game/hud.ts`                                                                                                         |
| Изменить      | `src/game/hud.test.ts`                                                                                                    |
| Изменить      | `src/game/hud-render.ts`                                                                                                  |
| Изменить      | `src/game/hud-render.test.ts`                                                                                             |
| Изменить      | `src/game/scenes/play-scene.ts`                                                                                           |
| Изменить      | `src/game/scenes/play-scene.test.ts`                                                                                      |
| Изменить      | `src/game/scenes/title-scene.ts`                                                                                          |
| Изменить      | `src/game/scenes/title-scene.test.ts`                                                                                     |
| Изменить      | `src/main.ts`                                                                                                             |
| Изменить      | `src/game/dev-snapshot.ts`                                                                                                |
| Изменить      | `src/game/dev-snapshot.test.ts`                                                                                           |
| Изменить      | `second-brain/architecture/overview.md`                                                                                   |
| Изменить      | `second-brain/architecture/dev-hooks.md`                                                                                  |
| Без изменений | `src/game/battle.ts`, `src/game/dev-hooks.ts`, `src/engine/input.ts`, `src/engine/loop.ts`, `second-brain/game-design.md` |

Проверки перед сдачей: `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build`.

## Архитектура и паттерны

- Граница движок/игра: `engine/storage.ts` не знает о рекорде; `game/high-score.ts` не
  трогает `window`; реальный `localStorage` подключается только в `main.ts`. Линтер границу не
  проверяет — следить при ревью.
- Детерминизм: рекорд не участвует в бою и не тратит `rng`; `Battle` не меняется; внешнее
  состояние (хранилище) влияет только на вид `HI`. Тесты подменяют хранилище `memoryStorage()`.
- Логика отдельно от рендера: `hudView` — чистая функция от `Battle` и `HudRecord`;
  `newRecord` — не флаг, а `score > atStart` (счёт монотонен → цвет держится до конца игры).
- Секция HUD = поле `HudView` + зона в `HUD_ZONES` + `drawX` (правило `overview.md`).
- `import type` для `KeyValueStorage`, `HudRecord`; второй аргумент `hudView` обязательный —
  забыть рекорд в сцене = ошибка типов.
- Производительность: `submit` каждый тик — одно сравнение; `getItem`/`setItem` — только при
  росте рекорда.

## Открытые вопросы

Решены по рекомендациям анализа (переданы в промпте запуска):

1. `HUD_RECORD_COLOR = '#ffe14f'` — первый проход; окончательно — на приёмке глазами
   (ручная проверка п. 6).
2. Сброс рекорда в dev — `removeItem` + перезагрузка; явно описывается в `dev-hooks.md`.
3. Чужой больший рекорд из другой вкладки посреди игры показывается жёлтым — ожидаемое
   поведение по дизайну (`discussion.md`, раунд 2, п. 2); закреплено тестом в 10.3.

Отступление от дизайна: тип параметра `safeStorage` — `() => Pick<Storage, 'getItem' |
'setItem'>` вместо `() => Storage` (шаг 1, причина — тестовый фейк без приведения типов).

Частей для отдельной задачи нет.

## Ссылки

- `second-brain/tasks/tasks/034-high-score/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/009-high-score-ship-panel/design.md` — пункт 1 нарезки,
  «Интерфейсы», «Тестирование»
- `second-brain/features/009-high-score-ship-panel/discussion.md` — раунды 2–3
- `second-brain/architecture/overview.md`, `second-brain/architecture/dev-hooks.md`
