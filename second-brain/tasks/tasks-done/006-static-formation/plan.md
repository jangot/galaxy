# План реализации: Статичный строй врагов

Пункт 2 нарезки фичи 002. На игровом экране появляется неподвижный строй уровня 1:
ряд `striker` ×8 и два ряда `drone` ×10, наверху с y = 32, по центру экрана. Вводятся
таблица уровней и парсер раскладки (`levels.ts`), геометрия строя (`formation.ts`),
спрайты врагов (`enemy-art.ts`), сущность врага (`enemy.ts`), волна (`wave.ts`),
отдельный `Rng` боя (`Battle(rng, opts?)`) и тестовая таблица `ONE_CORNER_ENEMY`.
Попаданий, покачивания и вылетов нет, выстрел игрока пролетает сквозь врагов.

Код: ветка `feature/002-enemies-and-levels`, коммит `20da398` + незакоммиченная задача
005 в рабочем дереве (`battle.ts`, `battle-render.ts`, `canvas-test-utils.ts`).

## Решения по техническим вопросам из analyze.md

Все четыре вопроса решены архитектором (`discussion.md`, раздел «Реализация: задача
006-static-formation»). Строка 006 таблицы «Появление API» в `design.md` обновлена.

1. `Wave(config, _rng)`, `Wave.update(_dt)`. `Enemy.update()` без параметров, возвращает
   `void`, пересчитывает `x/y` из `formation.slotX/slotY`. `Wave.update` вызывает его
   для каждого врага. В 007 добавится `formation.update(dt)` перед циклом.
2. `PlayScene`: поле `readonly battle: Battle` без инициализатора, создаётся в теле
   конструктора. Порядок: сначала `starfield ?? new Starfield(…, rng)`, потом seed боя
   `createRng(Math.floor(rng() * 2 ** 32))`. Сигнатура `PlayScene(rng, starfield?)`.
3. `battle-render.test.ts` переходит на `ONE_CORNER_ENEMY`. Массив вызовов по-прежнему
   сравнивается целиком. Порядок: выстрел → пиксели `drone` в слоте (0, 0) по
   `Math.floor` → корабль. Хелпер ожидаемых вызовов — по образцу `shipCalls`.
4. `SWAY_RANGE` вводится в 007. `FORMATION_MAX_COLS` живёт в `levels.ts`, `formation.ts`
   его **не** импортирует; импортирует только `formation.test.ts`. `Formation(cols, rows)`
   без `swaySpeed`.

Ещё два мелких решения в рамках дизайна:

- **`Battle.wave` — `readonly`-поле, не геттер.** Analyze это допускает: в 006 волна не
  меняется. В 008 поле становится `private` с `get wave()`. Для потребителей
  (`battle.wave`) это прозрачно.
- **`baseX` у `Formation` — `private`.** В «Интерфейсах» его нет. Тест читает `baseX`
  через `slotX(0, CELL_WIDTH)`: смещение центровки в ячейке тогда равно 0.

## 1. Таблица уровней и парсер раскладки

**Файл (создать):** `src/game/levels.ts`

Лист графа импортов: в 006 не импортирует ничего (`config` понадобится позже, вместе с
`isAllowedSpeed` в 007).

```typescript
/** Enemy kinds. 'raider' arrives in task 013. */
export type EnemyKind = 'drone' | 'striker';
/** Layout chars: 'D' drone, 'S' striker, '.' empty cell. */
export type LayoutChar = 'D' | 'S' | '.';

/** One row of the level table. More fields arrive with the tasks that use them. */
export interface LevelConfig {
  /** Rows top to bottom; 'D' drone, 'S' striker, '.' empty. */
  readonly layout: readonly string[];
}

export interface Slot {
  readonly row: number;
  readonly col: number;
  readonly kind: EnemyKind;
}

export interface Layout {
  readonly rows: number;
  readonly cols: number;
  /** Row-major: top to bottom, left to right within a row. Wave order follows it. */
  readonly slots: readonly Slot[];
}

/** Widest layout the formation geometry is designed for. */
export const FORMATION_MAX_COLS = 11;

const EMPTY: LayoutChar = '.';
const KIND_BY_CHAR: Readonly<Record<Exclude<LayoutChar, '.'>, EnemyKind>> = {
  D: 'drone',
  S: 'striker',
};

/** Default level table. All layouts are 10 columns wide (see design, exact rows). */
export const LEVELS: readonly LevelConfig[] = [
  { layout: ['.SSSSSSSS.', 'DDDDDDDDDD', 'DDDDDDDDDD'] },
];

/**
 * 1-based; past the end of the table returns the last level.
 * Throws if !Number.isInteger(level) || level < 1, or if the table is empty.
 */
export function levelConfig(level: number, levels: readonly LevelConfig[] = LEVELS): LevelConfig {
  if (!Number.isInteger(level) || level < 1) {
    throw new Error(`Level must be an integer >= 1, got ${level}`);
  }
  const config = levels[Math.min(level, levels.length) - 1];
  if (config === undefined) throw new Error('Level table is empty');
  return config;
}

/**
 * Parses a layout into slots.
 * Throws on: no rows, ragged rows, unknown char, width > FORMATION_MAX_COLS, no enemies.
 */
export function parseLayout(layout: readonly string[]): Layout {
  const first = layout[0];
  if (first === undefined) throw new Error('Layout has no rows');
  const cols = first.length;
  if (cols > FORMATION_MAX_COLS) {
    throw new Error(`Layout is ${cols} columns wide, max is ${FORMATION_MAX_COLS}`);
  }
  const slots: Slot[] = [];
  layout.forEach((line, row) => {
    if (line.length !== cols) {
      throw new Error(`Layout row ${row} has length ${line.length}, expected ${cols}`);
    }
    [...line].forEach((ch, col) => {
      if (ch === EMPTY) return;
      const kind = Object.hasOwn(KIND_BY_CHAR, ch)
        ? KIND_BY_CHAR[ch as keyof typeof KIND_BY_CHAR]
        : undefined;
      if (kind === undefined) {
        throw new Error(`Unknown layout char '${ch}' at row ${row}, col ${col}`);
      }
      slots.push({ row, col, kind });
    });
  });
  if (slots.length === 0) throw new Error('Layout has no enemies');
  return { rows: layout.length, cols, slots };
}
```

Пояснения:

- `noUncheckedIndexedAccess`: `layout[0]` и `levels[i]` имеют тип `T | undefined`.
  Проверка на `undefined` и даёт ошибки «нет строк» и «пустая таблица». При пустой
  таблице индекс `Math.min(level, 0) - 1 = -1`, получаем `undefined` и бросаем.
- Строка нулевой ширины (`['']`) не даёт ни одного врага и бросает «no enemies».
  Отдельная проверка не нужна.
- `Object.hasOwn` — как в `parseSprite`. Без него `'constructor'` и подобные ключи
  прототипа прошли бы как символы (для строк длины 1 это невозможно, но правило то же).
- `R` до 013 — неизвестный символ, бросает.

## 2. Тестовая таблица уровней

**Файл (создать):** `src/game/test-levels.ts`

```typescript
import type { LevelConfig } from './levels';

/**
 * Test-only level tables. Import from *.test.ts only.
 *
 * ONE_CORNER_ENEMY: a single drone in the top-left cell of a full-width
 * (FORMATION_MAX_COLS) layout, so baseX = 40 and the enemy sits at x = 42,
 * far from the ship's shot column (x = 127). A one-column layout would be
 * centered right above the ship.
 * Passive fields (swaySpeed, dive timers, shots) are added by the tasks that introduce them.
 */
export const ONE_CORNER_ENEMY: readonly LevelConfig[] = [{ layout: ['D..........'] }];
```

`TWO_LEVELS` — в 008.

## 3. Геометрия строя

**Файл (создать):** `src/game/formation.ts`

Импортирует только `config` (`SCREEN_WIDTH`). `levels` не импортирует.

```typescript
import { SCREEN_WIDTH } from '../config';

/** Formation grid cell, decision В9. Sprites up to 13×10 fit with a gap. */
export const CELL_WIDTH = 16;
export const CELL_HEIGHT = 12;
/** Top edge of the formation; the strip above is reserved for the HUD. */
export const FORMATION_TOP = 32;

/**
 * Formation geometry: a grid of cells centered horizontally on screen.
 * Static for now; sway (offset, update) arrives in task 007.
 */
export class Formation {
  private readonly baseX: number;

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.baseX = Math.floor((SCREEN_WIDTH - cols * CELL_WIDTH) / 2);
  }

  /** Left edge of a sprite of the given width, centered in its column's cell. */
  slotX(col: number, width: number): number {
    return this.baseX + col * CELL_WIDTH + Math.floor((CELL_WIDTH - width) / 2);
  }

  /** Top edge of a sprite of the given height, centered in its row's cell. */
  slotY(row: number, height: number): number {
    return FORMATION_TOP + row * CELL_HEIGHT + Math.floor((CELL_HEIGHT - height) / 2);
  }
}
```

Parameter properties (`readonly cols`) уже используются в коде (`Starfield`, `Ship`).
`verbatimModuleSyntax`/`isolatedModules` им не мешают.

## 4. Спрайты врагов

**Файл (создать):** `src/game/enemy-art.ts`

Оформление по образцу `art.ts`. Спрайты стартовые: оригинальные, симметричные,
нечётной ширины, не больше 13 × 10. Цвета не совпадают с цветами корабля (`#ffd36b`,
`#b884ff`, `#ff5a3c`) и с белым выстрелом. Владелец утверждает их глазами. Правки
формы и цвета при приёмке — только в этом файле: тесты привязаны к инвариантам, а не к
пикселям.

```typescript
import { parseSprite, type Sprite } from './sprite';

/** Drone, 11×8: green bug-like body with antennae and legs. Bottom rows of the formation. */
export const DRONE_SPRITE: Sprite = parseSprite(
  [
    '...TT.TT...',
    '....GGG....',
    '..GGGGGGG..',
    '.GGWGGGWGG.',
    'GGGGGGGGGGG',
    '.T.GGGGG.T.',
    'T..T...T..T',
    '...T...T...',
  ],
  {
    G: '#4fd16a', // body
    T: '#2a9e8f', // antennae, legs
    W: '#e8fff0', // eyes
  },
);

/** Striker, 13×9: blue arrowhead pointing down with magenta wingtips. Middle rows. */
export const STRIKER_SPRITE: Sprite = parseSprite(
  [
    'M...........M',
    'MB.........BM',
    '.BB...B...BB.',
    '..BBBBBBBBB..',
    '...BBWBWBB...',
    '....BBBBB....',
    '.....BBB.....',
    '......M......',
    '.....M.M.....',
  ],
  {
    B: '#4a8cff', // hull
    M: '#ff4fa3', // wingtips, tail
    W: '#ffffff', // eyes
  },
);
```

Длины строк проверены: drone — 11 × 8, striker — 13 × 9. Ошибка формата роняет импорт
модуля, её поймает любой тест, импортирующий `enemy`. Ячейку 16 × 12 оба вида
занимают так: drone со смещением (2, 2), striker — (1, 1).

## 5. Сущность врага

**Файл (создать):** `src/game/enemy.ts`

Импорты по графу дизайна: `formation` (type), `levels` (type), `enemy-art`, `sprite`
(type).

```typescript
import { DRONE_SPRITE, STRIKER_SPRITE } from './enemy-art';
import type { Formation } from './formation';
import type { EnemyKind, Slot } from './levels';
import type { Sprite } from './sprite';

/** Per-kind data. Aim mode arrives in task 010. */
export interface EnemyKindSpec {
  readonly sprite: Sprite;
}

export const ENEMY_KINDS: Readonly<Record<EnemyKind, EnemyKindSpec>> = {
  drone: { sprite: DRONE_SPRITE },
  striker: { sprite: STRIKER_SPRITE },
};

/** Enemy states. Only 'formation' for now; exploding/dead arrive in 008, diving/returning in 009. */
export type EnemyState = 'formation';

/**
 * One enemy of a wave. Position is the top-left corner in logical pixels.
 * Size comes from the kind's sprite, so the hitbox matches the picture.
 * In 'formation' the position is recomputed from the slot on every update.
 */
export class Enemy {
  readonly kind: EnemyKind;
  readonly width: number;
  readonly height: number;
  x: number;
  y: number;
  private currentState: EnemyState = 'formation';

  constructor(
    readonly slot: Slot,
    private readonly formation: Formation,
  ) {
    this.kind = slot.kind;
    const { sprite } = ENEMY_KINDS[slot.kind];
    this.width = sprite.width;
    this.height = sprite.height;
    this.x = formation.slotX(slot.col, this.width);
    this.y = formation.slotY(slot.row, this.height);
  }

  get state(): EnemyState {
    return this.currentState;
  }

  /** Follows the slot. Gains dt/env and a fire flag in later tasks. */
  update(): void {
    this.x = this.formation.slotX(this.slot.col, this.width);
    this.y = this.formation.slotY(this.slot.row, this.height);
  }
}
```

Замечания:

- `currentState` нигде не переприсваивается, но читается в геттере. `tsc` (TS6138)
  считает поле используемым, а `prefer-readonly` в конфиге ESLint не включён. Поле
  оставлено изменяемым: в 008 оно начнёт меняться.
- Если `tsc`/ESLint всё же заругается, допустимый запасной вариант —
  `private readonly currentState`, `readonly` снимается в 008.
- Поля спрайта у `Enemy` нет: рендер берёт `ENEMY_KINDS[enemy.kind].sprite` (дизайн).

## 6. Волна

**Файл (создать):** `src/game/wave.ts`

```typescript
import type { Rng } from '../engine/rng';
import { Enemy } from './enemy';
import { Formation } from './formation';
import type { LevelConfig } from './levels';
import { parseLayout } from './levels';

/**
 * One level's worth of enemies: built from a LevelConfig, thrown away as a whole on level change.
 * For now: a static formation. Sway (007), attack director (009) and enemy shots (012) join later.
 */
export class Wave {
  readonly formation: Formation;
  /** Same order as the layout slots: row-major, top to bottom, left to right. */
  readonly enemies: readonly Enemy[];

  /** The rng drives the attack director from task 009. */
  constructor(
    readonly config: LevelConfig,
    _rng: Rng,
  ) {
    const layout = parseLayout(config.layout);
    this.formation = new Formation(layout.cols, layout.rows);
    this.enemies = layout.slots.map((slot) => new Enemy(slot, this.formation));
  }

  /** dt drives the formation sway from task 007. */
  update(_dt: number): void {
    for (const enemy of this.enemies) enemy.update();
  }
}
```

`_rng` и `_dt` с префиксом проходят `noUnusedParameters` и ESLint
(`argsIgnorePattern: '^_'`). У `_rng` нет модификатора доступа, поэтому это обычный
параметр, а не parameter property. В 007 `_dt` переименуется в `dt`, в 009 `_rng` — в
`rng`.

## 7. Отдельный `Rng` и волна в `Battle`

**Файл (изменить):** `src/game/battle.ts`

```typescript
import type { Rng } from '../engine/rng';
import type { LevelConfig } from './levels';
import { levelConfig } from './levels';
import type { PlayerIntent } from './player';
import { Player } from './player';
import { Wave } from './wave';

export interface BattleOptions {
  /** Level table; defaults to LEVELS. Tests inject small tables from test-levels.ts. */
  readonly levels?: readonly LevelConfig[];
}

/**
 * Battle aggregate: everything that happens on the play field, without input or canvas.
 * Holds the player and the current enemy wave; levels, phases and collisions join later.
 * The rng is the battle's own generator, separate from the scene's (starfield) one.
 */
export class Battle {
  readonly player = new Player();
  readonly wave: Wave;

  constructor(rng: Rng, opts: BattleOptions = {}) {
    this.wave = new Wave(levelConfig(1, opts.levels), rng);
  }

  /** Tick order: player -> wave. Collisions and phases arrive in 008. */
  update(dt: number, intent: PlayerIntent): void {
    this.player.update(dt, intent);
    this.wave.update(dt);
  }
}
```

`levelConfig(1, undefined)` берёт параметр по умолчанию `LEVELS`, импортировать
`LEVELS` в `battle.ts` не нужно. `startLevel` — в 008.

## 8. Слой врагов в рендере

**Файл (изменить):** `src/game/battle-render.ts`

Враги рисуются между выстрелом игрока и кораблём, в порядке `wave.enemies`.

```typescript
import { SHIP_SPRITE, SHOT_COLOR } from './art';
import type { Battle } from './battle';
import { ENEMY_KINDS } from './enemy';
import { SHOT_HEIGHT, SHOT_WIDTH } from './shot';
import { drawSprite } from './sprite';

/** Draws the battle entities, back to front: player shot, enemies, ship. No background. */
export function drawBattle(ctx: CanvasRenderingContext2D, battle: Battle): void {
  const { ship, shot } = battle.player;
  if (shot) {
    ctx.fillStyle = SHOT_COLOR;
    ctx.fillRect(Math.floor(shot.x), Math.floor(shot.y), SHOT_WIDTH, SHOT_HEIGHT);
  }
  for (const enemy of battle.wave.enemies) {
    drawSprite(ctx, ENEMY_KINDS[enemy.kind].sprite, Math.floor(enemy.x), Math.floor(enemy.y));
  }
  drawSprite(ctx, SHIP_SPRITE, Math.floor(ship.x), Math.floor(ship.y));
}
```

## 9. Отдельный `Rng` боя в сцене

**Файл (изменить):** `src/game/scenes/play-scene.ts`

```typescript
import { createRng, type Rng } from '../../engine/rng';
// ...
export class PlayScene implements Scene {
  /** Exposed for tests. */
  readonly battle: Battle;
  private readonly starfield: Starfield;

  /** Pass the title's starfield to keep the stars continuous across the switch. */
  constructor(rng: Rng, starfield?: Starfield) {
    // Stars first, then the battle seed: the star layout for a given seed stays as before.
    this.starfield = starfield ?? new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, rng);
    // The battle gets its own generator so background changes never shift enemy behavior.
    this.battle = new Battle(createRng(Math.floor(rng() * 2 ** 32)));
  }
  // update / render — unchanged
}
```

Импорт `Rng` сейчас — `import type { Rng }`. Он заменяется на
`import { createRng, type Rng }` (inline `type` разрешён правилом
`consistent-type-imports`, так уже импортирован `Sprite` в `art.ts`). Можно и двумя
строками: `import type { Rng }` + `import { createRng }`.

`main.ts`, `TitleScene`, цикл и ввод не меняются: `TitleScene` уже передаёт
`(rng, starfield)`.

## 10. Тесты

Все — Vitest, environment `node`, рядом с кодом.

### 10.1 `src/game/levels.test.ts` (создать)

- `parseLayout(['.S.', 'D.D'])` → `rows = 2`, `cols = 3`, `slots` в точности
  `[{row:0,col:1,kind:'striker'}, {row:1,col:0,kind:'drone'}, {row:1,col:2,kind:'drone'}]`
  (`toEqual`). Тест покрывает виды, пропуск `.` и порядок row-major.
- Ширина ровно `FORMATION_MAX_COLS` (`'D'.padEnd(11, '.')`) разбирается, `cols = 11`.
- Ошибки (`toThrow`):
  - `[]`;
  - `['DD', 'D']` (строки разной длины);
  - `['DX']`, `['DR']` (`R` до 013 неизвестен);
  - строка шириной 12 (`'D'.repeat(12)`);
  - `['...', '...']` (ни одного врага);
  - `['']`.
- `levelConfig`:
  - `levelConfig(1)` → `toBe(LEVELS[0])`;
  - `levelConfig(LEVELS.length + 5)` → последняя строка;
  - `it.each([0, -1, 1.5, NaN, Infinity])` → бросает;
  - `levelConfig(1, [])` → бросает;
  - внедрённая таблица из двух строк `a`, `b`: `1 → a`, `2 → b`, `3 → b`.
- `it.each(LEVELS.map((c, i) => [i + 1, c]))('level %i layout is valid')`: `parseLayout`
  не бросает, `cols === 10`.
- Уровень 1 (решение «Уточнений»): `LEVELS[0].layout` `toEqual`
  `['.SSSSSSSS.', 'DDDDDDDDDD', 'DDDDDDDDDD']`.

### 10.2 `src/game/formation.test.ts` (создать)

Импортирует `FORMATION_MAX_COLS` из `./levels` (только тест), `SCREEN_WIDTH` из
`../config`.

- `baseX` центрирует строй (через `slotX(0, CELL_WIDTH)`): `cols = 10` → 48,
  `cols = 11` → 40.
- `slotX` центрирует спрайт в ячейке:
  - `new Formation(10, 3).slotX(0, 11) === 50`;
  - `slotX(0, 13) === 49`;
  - `slotX(3, 11) === 48 + 3 * 16 + 2`.
- `slotY`: `slotY(0, 8) === 34`, `slotY(2, 9) === 32 + 24 + 1`.
- `cols`/`rows` сохраняются.
- Инвариант: строй максимальной ширины внутри экрана —
  `f = new Formation(FORMATION_MAX_COLS, 1)`: `f.slotX(0, CELL_WIDTH) >= 0` и
  `f.slotX(FORMATION_MAX_COLS - 1, CELL_WIDTH) + CELL_WIDTH <= SCREEN_WIDTH`.
  Проверка при `±SWAY_RANGE` — в 007.

### 10.3 `src/game/enemy.test.ts` (создать)

- Для каждого вида (`it.each(['drone', 'striker'] as const)`) на `new Formation(10, 3)`
  и слоте `{ row: 1, col: 4, kind }`:
  - `width`/`height` = размеры `ENEMY_KINDS[kind].sprite`;
  - `kind` и `slot` сохранены;
  - `x === formation.slotX(4, width)`, `y === formation.slotY(1, height)`;
  - `state === 'formation'`.
- `update()` возвращает врага в слот: сдвинуть `enemy.x += 5`, `enemy.y -= 3`, вызвать
  `update()` и проверить, что позиция снова равна слоту.
- Инвариант спрайтов (`it.each(Object.entries(ENEMY_KINDS))`): `width % 2 === 1`,
  `width <= 13`, `height <= 10`, `width <= CELL_WIDTH`, `height <= CELL_HEIGHT`.
- Виды различимы: `DRONE_SPRITE !== STRIKER_SPRITE`, пиксели не равны (`not.toEqual`).

### 10.4 `src/game/wave.test.ts` (создать)

Конфиги задаются литералами `{ layout: [...] }`, `rng` — `createRng(1)`.

- `LEVELS[0]`: 28 врагов; 8 `striker` в ряду 0, по 10 `drone` в рядах 1 и 2.
- `{ layout: ['.S.', 'D.D'] }`:
  - `enemies.map(e => [e.slot.row, e.slot.col, e.kind])` совпадает с порядком слотов;
  - `formation.cols === 3`, `formation.rows === 2`;
  - позиции каждого врага = `wave.formation.slotX/slotY` его слота.
- `wave.config` — тот же объект (`toBe`).
- `update(TICK_SECONDS)` 60 раз: позиции не меняются (строй статичен), не бросает.
- Bad layout (`{ layout: ['X'] }`) → конструктор бросает (ошибка `parseLayout` не
  глотается).

### 10.5 `src/game/battle.test.ts` (создать)

- `new Battle(createRng(1), { levels: ONE_CORNER_ENEMY })`:
  - `wave.config === ONE_CORNER_ENEMY[0]`;
  - ровно один враг, `kind === 'drone'`, `slot` `{ row: 0, col: 0 }`;
  - `x === 42`, `y === 34` (`baseX = 40` + центровка 11 × 8 в ячейке). Так закреплено,
    что враг далеко от столбца выстрела 127.
- `new Battle(createRng(1))` без `opts`: `wave.config === LEVELS[0]`, 28 врагов.
- `update(TICK_SECONDS, { move: 1, fire: false })`: корабль сдвинулся на
  `SHIP_SPEED * TICK_SECONDS`, позиции врагов не изменились (регрессия + шаг
  `wave.update`).
- `update` с `fire: true`: `player.shot` не `null` (делегирование `Player` цело).

### 10.6 `src/game/battle-render.test.ts` (изменить)

- Хелпер обобщается: `spriteCalls(sprite, x, y)` строит вызовы из `sprite.pixels`
  (тот же обход, что сейчас в `shipCalls`). `shipCalls(x, y) = spriteCalls(SHIP_SPRITE, x, y)`.
  Новый `enemyCalls(battle)` — `flatMap` по `battle.wave.enemies`:
  `spriteCalls(ENEMY_KINDS[e.kind].sprite, Math.floor(e.x), Math.floor(e.y))`.
- Фабрика `newBattle()` = `new Battle(createRng(1), { levels: ONE_CORNER_ENEMY })`;
  все четыре существующих теста переходят на неё.
- Ожидаемые массивы:
  - без выстрела: `[...enemyCalls(battle), ...shipCalls(...)]`;
  - с выстрелом: `[shotCall, ...enemyCalls(battle), ...shipCalls(...)]`.
    Названия тестов меняются по смыслу: «draws the enemies, then the ship, when there is
    no shot», «draws the shot first, then the enemies, then the ship».
- Новый тест «floors fractional enemy coordinates»: после `newBattle()` выставить
  `enemy.x = 42.75`, `enemy.y = 34.5` (позицию перезапишет только `update`, поэтому
  `drawBattle` вызывается без `update`). Ожидается
  `[...spriteCalls(DRONE_SPRITE, 42, 34), ...shipCalls(...)]` — явные числа, а не
  `enemyCalls`, чтобы тест не повторял формулу рендера.
- Новый тест «draws every enemy of the default wave»: `new Battle(createRng(1))`. Число
  вызовов = сумма непрозрачных пикселей спрайтов 28 врагов + пиксели корабля. Тест
  ловит пропуск врагов при полном строе.

### 10.7 `src/game/scenes/play-scene.test.ts` (изменить)

Существующие 10 тестов остаются на `LEVELS` (переход на `ONE_CORNER_ENEMY` — в 008),
коллизий нет, поэтому они не ломаются. Добавить:

- «builds the level 1 wave»: `new PlayScene(createRng(1)).battle.wave.enemies.length === 28`.

Тест на порядок «сначала звёзды, потом seed» не добавляется. Поле `starfield` —
`private`, а `Rng` боя до 009 не даёт наблюдаемого эффекта. Порядок закреплён кодом и
комментарием (решение архитектора п. 2: ни один тест от порядка не зависит).

### 10.8 Прогон

`npm test` (было 80, все зелёные), `npm run typecheck`, `npm run lint`,
`npm run format:check` (при необходимости `npm run format`), `npm run build`.

## 11. Ручная проверка

`npm run dev` → титул → Enter:

- наверху три ряда врагов: верхний — 8 синих `striker` (с x = 64 по ячейкам), ниже два
  ряда по 10 зелёных `drone`; строй по центру (x 48–208), верх ячеек на y = 32, низ
  строя — около y = 68;
- враги не двигаются;
- два вида хорошо различимы, на звёздах читаются, по цвету не путаются с кораблём;
- корабль ходит влево-вправо и стреляет как раньше; выстрел пролетает сквозь строй;
- в консоли нет ошибок.

Показать владельцу спрайты `drone` и `striker` на утверждение (критерий готовности).
Правки — только в `enemy-art.ts`.

## 12. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md` (на русском). В `src/game/`
README нет.

- Новые пункты в «Игра»:
  - `levels.ts` — `EnemyKind`, `LayoutChar`, `LevelConfig { layout }`, `Slot`, `Layout`
    (слоты row-major), `FORMATION_MAX_COLS = 11`, `LEVELS` (уровень 1), `levelConfig`
    (целое ≥ 1, за концом — последний, пустая таблица — ошибка), `parseLayout` (ошибки
    формата).
  - `formation.ts` — ячейка 16 × 12, `FORMATION_TOP = 32`, центровка строя и спрайта в
    ячейке; покачивания пока нет.
  - `enemy-art.ts` — `DRONE_SPRITE` 11 × 8, `STRIKER_SPRITE` 13 × 9.
  - `enemy.ts` — `ENEMY_KINDS`, `Enemy` (размер из спрайта, позиция = слот,
    `update()` пересчитывает из слота, состояние только `formation`).
  - `wave.ts` — `Wave(config, rng)`: раскладка → `Formation` → враги в порядке слотов;
    `update(dt)` — `enemy.update()` каждого.
  - `test-levels.ts` — только для тестов, `ONE_CORNER_ENEMY`.
- Строка `battle.ts`: «Конструктор без аргументов» заменить на `Battle(rng, opts?)`,
  `BattleOptions { levels? }`, `readonly wave`, тик игрок → волна.
- Строка `battle-render.ts`: слои выстрел → враги → корабль.
- Строка `scenes/play-scene.ts`: `Battle` создаётся в конструкторе с отдельным `Rng`
  (сначала звёзды, потом seed).
- Строка `canvas-test-utils.ts`: без изменений (её используют те же два теста).
- Граф импортов:
  - `play-scene → {starfield, battle, battle-render, player, engine/rng}`;
  - `battle → {player, wave, levels}` (`Rng`, `LevelConfig`, `PlayerIntent` — type);
  - `battle-render → {art, enemy, sprite, shot}`;
  - `wave → {enemy, formation, levels}` (`Rng` — type);
  - `enemy → enemy-art` (`Formation`, `EnemyKind`, `Slot`, `Sprite` — type);
  - `formation → config`, `enemy-art → sprite`, `levels` — без импортов;
  - `test-levels` — только из `*.test.ts`.

`game-design.md`, ADR — не меняются (числа и решения те же, что в дизайне).

## Сводка по файлам

| Действие | Файл                                    |
| -------- | --------------------------------------- |
| Создать  | `src/game/levels.ts`                    |
| Создать  | `src/game/levels.test.ts`               |
| Создать  | `src/game/test-levels.ts`               |
| Создать  | `src/game/formation.ts`                 |
| Создать  | `src/game/formation.test.ts`            |
| Создать  | `src/game/enemy-art.ts`                 |
| Создать  | `src/game/enemy.ts`                     |
| Создать  | `src/game/enemy.test.ts`                |
| Создать  | `src/game/wave.ts`                      |
| Создать  | `src/game/wave.test.ts`                 |
| Создать  | `src/game/battle.test.ts`               |
| Изменить | `src/game/battle.ts`                    |
| Изменить | `src/game/battle-render.ts`             |
| Изменить | `src/game/battle-render.test.ts`        |
| Изменить | `src/game/scenes/play-scene.ts`         |
| Изменить | `src/game/scenes/play-scene.test.ts`    |
| Изменить | `second-brain/architecture/overview.md` |

Не меняются: `src/engine/*`, `main.ts`, `title-scene.ts`, `art.ts`, `ship.ts`,
`shot.ts`, `player.ts`, `sprite.ts`.

## Архитектура и паттерны

- **Граница engine/game:** движок не трогается. `Rng`/`createRng` используются как
  есть.
- **Детерминизм:** у боя свой `Rng` с seed из `rng` сцены, фон на бой не влияет. Время
  входит только через `dt` (в 006 не используется, `_dt`).
- **Логика отдельно от рендера:** `levels`/`formation`/`enemy`/`wave`/`battle` не знают
  `ctx`. Рисует только `battle-render`, спрайт берётся из `ENEMY_KINDS` по виду.
- **Хитбокс = спрайт:** `Enemy.width/height` выводятся из спрайта вида (как
  `SHIP_WIDTH`).
- **Ошибки данных — исключения:** `parseLayout`/`levelConfig` бросают (как
  `parseSprite`). Строки `LEVELS` проверяет тест «для каждой строки».
- **Появление API по задачам:** только подмножество 006, без мёртвых констант
  (`SWAY_RANGE`, `isAllowedSpeed`, поля `LevelConfig` — в своих задачах). Итоговые
  параметры, ещё не нужные коду, идут с `_`.
- **`import type`** для `Rng`, `LevelConfig`, `Slot`, `EnemyKind`, `Formation` (в
  `enemy`), `Sprite`, `Battle`.
- **Производительность:** 28 врагов × ≤ 130 пикселей ≈ 3 600 `fillRect` за кадр — в
  пределах оценки дизайна.

## Открытые вопросы

- **Утверждение спрайтов `drone` и `striker` владельцем** — после реализации, глазами
  (критерий готовности задачи). Реализацию не блокирует: стартовые спрайты — в шаге 4,
  правки при приёмке — только `enemy-art.ts`.

Технических вопросов нет: пп. 1–4 analyze.md решены архитектором (см. «Решения» в
начале плана).

## Ссылки

- `second-brain/tasks/tasks/006-static-formation/analyze.md`
- `second-brain/tasks/tasks/006-static-formation/description.md`
- `CLAUDE.md`
- `second-brain/architecture/overview.md`
- `second-brain/decisions/002-integer-speeds.md`
- `second-brain/features/002-enemies-and-levels/design.md` — «Модули и файлы»,
  «Сущности и состояния», «Интерфейсы», «Тестирование», «Уточнения для реализации»
  (точные строки `LEVELS`, `test-levels.ts`, «Появление API по задачам», строка 006)
- `second-brain/features/002-enemies-and-levels/discussion.md` — «Реализация: задача
  006-static-formation»
- `second-brain/tasks/tasks-done/005-battle-extract/plan.md` — образец хелпера
  `shipCalls` и подхода к тестам рендера
