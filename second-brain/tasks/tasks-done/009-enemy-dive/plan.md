# План реализации: Пикирование: вылет и возврат

Враги начинают вылетать из строя: директор атак раз в интервал выбирает крайнего врага
ряда, тот «отклеивается» по короткой дуге (`PEEL_SEGMENTS`), пикирует прямо вниз со
скоростью уровня, уходит за низ, появляется над своим слотом и опускается в него.
Пока без прицеливания (010), тарана (011) и стрельбы (012); сбить врага можно в любой
фазе полёта. Добавляется уровень 3 и четыре поля `LevelConfig`.

Код: ветка `feature/002-enemies-and-levels`, база `20da398` + задачи 005–008 в рабочем
дереве (`npm test` — 213 зелёных). Рамка — `design.md` фичи 002 (пункт 5 нарезки,
«Уточнения для реализации», строка 009 таблицы «Появление API по задачам») и
`analyze.md` этой задачи.

Порядок шагов выбран так, чтобы `typecheck` можно было прогонять после шагов 1–4
(новые обязательные поля `LevelConfig` и сигнатура `Enemy.update` ломают компиляцию
тестов, пока не пройдены шаги 1–4 и 6).

## 1. `LevelConfig`: новые поля и уровень 3

**Файл (изменить):** `src/game/levels.ts`

- В `LevelConfig` — четыре обязательных поля (единицы — в JSDoc; суффикс `Ticks` —
  ADR 003):

```typescript
export interface LevelConfig {
  readonly layout: readonly string[];
  readonly swaySpeed: number;
  /** Dive (descend) speed, px/s; must be a whole number of px/tick (ADR 002). */
  readonly diveSpeed: number;
  /** Ticks from the wave's start until the first dive (whole ticks, ADR 003). */
  readonly firstDiveDelayTicks: number;
  /** Ticks between dive launches. */
  readonly diveIntervalTicks: number;
  /** Max sorties out of the formation at the same time. */
  readonly maxSorties: number;
}
```

- Обновить комментарий над интерфейсом («More fields arrive…» оставить — дальше 012/013).
- `LEVELS` — три строки по «Уточнениям» (стрельба уровня 3 — в 012):

```typescript
/** Default level table. All layouts are 10 columns wide (see design, exact rows). */
export const LEVELS: readonly LevelConfig[] = [
  {
    layout: ['.SSSSSSSS.', 'DDDDDDDDDD', 'DDDDDDDDDD'],
    swaySpeed: 15,
    diveSpeed: 60,
    firstDiveDelayTicks: 180,
    diveIntervalTicks: 180,
    maxSorties: 1,
  },
  {
    layout: ['.SSSSSSSS.', 'SSSSSSSSSS', 'DDDDDDDDDD', 'DDDDDDDDDD'],
    swaySpeed: 15,
    diveSpeed: 120,
    firstDiveDelayTicks: 150,
    diveIntervalTicks: 150,
    maxSorties: 2,
  },
  {
    layout: ['.SSSSSSSS.', 'SSSSSSSSSS', 'DDDDDDDDDD', 'DDDDDDDDDD'],
    swaySpeed: 30,
    diveSpeed: 120,
    firstDiveDelayTicks: 120,
    diveIntervalTicks: 120,
    maxSorties: 2,
  },
];
```

`levels.ts` по-прежнему импортирует только `config` — инварианты, которым нужны
`enemy`/`shot`, живут в `levels.test.ts` (шаг 7), цикла импортов нет.

## 2. Тестовые таблицы: пассивные значения и хелпер

**Файл (изменить):** `src/game/test-levels.ts`

Новые поля обязательные, а литералы `LevelConfig` есть в четырёх тестовых файлах
(`levels.test.ts` ×2, `wave.test.ts` ×3, `collisions.test.ts` ×1) и будут прибавляться
в 012/013. Чтобы новые поля дописывались в одном месте, завести здесь хелпер
пассивного уровня (решение плана; `analyze.md` оставил его на усмотрение). Модуль по-
прежнему только для тестов и импортирует только тип `LevelConfig`.

```typescript
import type { LevelConfig } from './levels';

/** Passive values of the fields added by tasks 007-013: no dives in scene/battle tests. */
const PASSIVE: Omit<LevelConfig, 'layout'> = {
  swaySpeed: 15,
  diveSpeed: 60,
  firstDiveDelayTicks: 1_000_000,
  diveIntervalTicks: 1_000_000,
  maxSorties: 1,
};

/** A passive level with the given layout; `overrides` turn single fields on for a test. */
export function passiveLevel(
  layout: readonly string[],
  overrides: Partial<Omit<LevelConfig, 'layout'>> = {},
): LevelConfig {
  return { layout, ...PASSIVE, ...overrides };
}

export const ONE_CORNER_ENEMY: readonly LevelConfig[] = [passiveLevel(['D..........'])];

export const TWO_LEVELS: readonly LevelConfig[] = [
  passiveLevel(['D..........']),
  passiveLevel(['D.........D']),
];
```

- Комментарии над `ONE_CORNER_ENEMY`/`TWO_LEVELS` сохранить; фразу «Passive fields
  (dive timers, shots) are added by the tasks that introduce them» заменить на
  «All levels here are passive (see PASSIVE): the first dive is 1_000_000 ticks away».
- Порядок ключей объекта не важен: `battle-render.test.ts` сравнивает вызовы
  `fillRect`, а не конфиг.

## 3. `Enemy`: состояния `diving`/`returning`

**Файл (изменить):** `src/game/enemy.ts`

Новые импорты: `import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../config';`.

Типы и константы (по «Интерфейсам» дизайна, урезанные по таблице «Появление API»):

```typescript
/** Enemy states. */
export type EnemyState = 'formation' | 'diving' | 'returning' | 'exploding' | 'dead';

/** Horizontal steering speed, px/s (1 px/tick). In 009 used only as the X step of 'returning'. */
export const STEER_SPEED = 60;
/** Downward speed of 'returning', px/s (1 px/tick). */
export const RETURN_SPEED = 60;

/** One leg of the peel-off arc. Units are whole px PER TICK (no dt); vx is for side = +1. */
export interface PeelSegment {
  readonly ticks: number;
  readonly vx: number;
  readonly vy: number;
}
/**
 * Peel-off arc, side = +1 (mirrored for -1): up-and-out, sideways, then down-and-out.
 * Visual, starting values (owner approves). Limits: whole ticks >= 1, whole vx/vy, first vy < 0,
 * last vy > 0, vx >= 0, max vy <= 3 (tunneling invariant). Exported for those tests.
 */
export const PEEL_SEGMENTS: readonly PeelSegment[] = [
  { ticks: 4, vx: 1, vy: -1 },
  { ticks: 4, vx: 1, vy: 0 },
  { ticks: 6, vx: 1, vy: 1 },
];
/** Peel length, ticks (14). */
const PEEL_TICKS = PEEL_SEGMENTS.reduce((sum, s) => sum + s.ticks, 0);

/** Who launches a dive and which way it peels off. `shots` (012) and `aimOffsetX` (013) come later. */
export interface DiveOrder {
  readonly sortieId: number;
  readonly side: -1 | 1;
}

/** Per-tick input from the wave. The formation is not here: the enemy keeps its own. `targetX` - 010. */
export interface EnemyEnv {
  /** Descend speed, px/s. */
  readonly diveSpeed: number;
}
```

Поля и методы класса:

```typescript
private currentSortieId = 0;
private side: -1 | 1 = 1;

/** Sortie the enemy is out on; null when not out (also after being shot in flight). */
get sortieId(): number | null {
  return this.isOut ? this.currentSortieId : null;
}

/** Can be hit: in the formation or in flight. */
get isAlive(): boolean {
  return this.isOut || this.currentState === 'formation';
}

/** Out of the formation: counts against maxSorties. */
get isOut(): boolean {
  return this.currentState === 'diving' || this.currentState === 'returning';
}

/** Only from 'formation'; ignored otherwise. The first peel step happens on the next update. */
startDive(order: DiveOrder): void {
  if (this.currentState !== 'formation') return;
  this.currentSortieId = order.sortieId;
  this.side = order.side;
  this.enter('diving');
}
```

`sortieId` выводится из состояния (геттер), а не обнуляется вручную: после `kill()`
в полёте и после возврата в `formation` он `null` автоматически — нет места, где
забыть сброс.

`update(dt, env)` (сигнатура по дизайну; `void` до 012). Правило тиков: `++`, таймер,
поведение. Фаза `diving` выводится из `stateTicks` (`stateTicks <= PEEL_TICKS` — peel),
отдельного счётчика нет:

```typescript
update(dt: number, env: EnemyEnv): void {
  if (this.currentState === 'dead') return;
  this.ticksInState++;
  switch (this.currentState) {
    case 'exploding':
      if (this.ticksInState >= EXPLOSION_TICKS) this.enter('dead');
      return;
    case 'formation':
      this.x = this.slotX();
      this.y = this.slotY();
      return;
    case 'diving':
      this.updateDiving(dt, env);
      return;
    case 'returning':
      this.updateReturning(dt);
      return;
  }
}

/** Ticks 1..PEEL_TICKS: peel segment by stateTicks; then descend straight down (aim - 010). */
private updateDiving(dt: number, env: EnemyEnv): void {
  if (this.ticksInState <= PEEL_TICKS) {
    const segment = peelSegmentAt(this.ticksInState);
    this.x += segment.vx * this.side;
    this.y += segment.vy;
  } else {
    this.y += env.diveSpeed * dt;
  }
  this.x = clamp(this.x, 0, SCREEN_WIDTH - this.width);
  if (this.y >= SCREEN_HEIGHT) {
    // Gone past the bottom: reappear right above the current slot.
    this.enter('returning');
    this.x = this.slotX();
    this.y = -this.height;
  }
}

/**
 * Moves towards the current slot by one step per axis, never below slotY
 * (otherwise an enemy that reached slotY first would sink off screen forever).
 * Within one step on both axes - snaps into the slot and rejoins the formation.
 */
private updateReturning(dt: number): void {
  const slotX = this.slotX();
  const slotY = this.slotY();
  const stepX = STEER_SPEED * dt;
  const stepY = RETURN_SPEED * dt;
  if (Math.abs(slotX - this.x) <= stepX && slotY - this.y <= stepY) {
    this.x = slotX;
    this.y = slotY;
    this.enter('formation');
    return;
  }
  this.y = Math.min(this.y + stepY, slotY);
  this.x += clamp(slotX - this.x, -stepX, stepX);
}

private slotX(): number {
  return this.formation.slotX(this.slot.col, this.width);
}

private slotY(): number {
  return this.formation.slotY(this.slot.row, this.height);
}
```

Модульные хелперы (не экспортируются):

```typescript
/** Segment for peel tick 1..PEEL_TICKS. */
function peelSegmentAt(tick: number): PeelSegment {
  let end = 0;
  for (const segment of PEEL_SEGMENTS) {
    end += segment.ticks;
    if (tick <= end) return segment;
  }
  throw new Error(`Peel tick ${tick} is past the arc (${PEEL_TICKS})`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
```

Прочее:

- `kill()` не меняется: `isAlive` теперь включает полёт, поэтому `kill()` из `diving`/
  `returning` → `exploding` (враг остаётся на месте попадания).
- Конструктор использует `slotX()/slotY()` вместо прямых вызовов `formation.*`
  (поведение то же).
- Обновить JSDoc класса: автомат
  `formation --startDive--> diving (peel -> descend) --y >= SCREEN_HEIGHT--> returning --in slot--> formation`,
  `alive --kill--> exploding --EXPLOSION_TICKS--> dead`; «x stays fractional: it starts
  from the swaying slot and moves by whole px (ADR 002/003)».
- Порядок `stateTicks` по «Тикам фаз»: `startDive` в тике `N` (`stateTicks = 0`, позиция
  — слот тика `N`); тики `N+1 … N+14` — peel; `N+15` — первый тик descend.
- В `returning` при `swaySpeed ≤ 30` (`< STEER_SPEED`) враг, поставленный над слотом,
  догоняет слот по X каждый тик (сдвиг слота ≤ 1/2 px < шага 1 px), сходимость точная —
  все числа двоичные дроби.

## 4. `AttackDirector` и `selectSortie`

**Файл (создать):** `src/game/attack-director.ts`

Импорты: `randomInt` и `type Rng` из `../engine/rng`, `type { DiveOrder, Enemy }` из
`./enemy`, `type { LevelConfig }` из `./levels`. Параметра `config` у `selectSortie`
в 009 нет (появится в 012 ради числа выстрелов).

```typescript
import type { Rng } from '../engine/rng';
import { randomInt } from '../engine/rng';
import type { DiveOrder, Enemy } from './enemy';
import type { LevelConfig } from './levels';

/** Who flies out and with which orders; members[i] gets orders[i]. */
export interface Sortie {
  readonly members: readonly Enemy[];
  readonly orders: readonly DiveOrder[];
}

interface Candidate {
  readonly enemy: Enemy;
  readonly side: -1 | 1;
}

/**
 * Pure. Candidates: for each row (top to bottom) the leftmost (side -1), then the rightmost
 * (side +1) enemy still in 'formation', so a diver never flies through its neighbours.
 * A row with a single such enemy gives one candidate; it peels to its half of the formation
 * (exact middle -> right). Uniform pick via rng; null (rng untouched) when nobody can go.
 * Raider groups - task 013.
 */
export function selectSortie(
  enemies: readonly Enemy[],
  cols: number,
  sortieId: number,
  rng: Rng,
): Sortie | null {
  const candidates = edgeCandidates(enemies, cols);
  if (candidates.length === 0) return null;
  const pick = candidates[randomInt(rng, 0, candidates.length)]!;
  return { members: [pick.enemy], orders: [{ sortieId, side: pick.side }] };
}

function edgeCandidates(enemies: readonly Enemy[], cols: number): Candidate[] {
  // Indexed by row; independent of the order of `enemies`.
  const rows: { left: Enemy; right: Enemy }[] = [];
  for (const enemy of enemies) {
    if (enemy.state !== 'formation') continue;
    const edges = rows[enemy.slot.row];
    if (!edges) {
      rows[enemy.slot.row] = { left: enemy, right: enemy };
    } else if (enemy.slot.col < edges.left.slot.col) {
      edges.left = enemy;
    } else if (enemy.slot.col > edges.right.slot.col) {
      edges.right = enemy;
    }
  }
  const candidates: Candidate[] = [];
  rows.forEach(({ left, right }) => {
    // forEach skips the holes of rows with nobody in formation.
    if (left === right) {
      candidates.push({ enemy: left, side: 2 * left.slot.col + 1 < cols ? -1 : 1 });
    } else {
      candidates.push({ enemy: left, side: -1 }, { enemy: right, side: 1 });
    }
  });
  return candidates;
}

/** Number of distinct sorties out of the formation right now. */
function activeSorties(enemies: readonly Enemy[]): number {
  const ids = new Set<number>();
  for (const enemy of enemies) if (enemy.sortieId !== null) ids.add(enemy.sortieId);
  return ids.size;
}

/**
 * When dives start. timer counts whole ticks down from firstDiveDelayTicks; at 0 a sortie is
 * launched if fewer than maxSorties are out and someone can go, then timer = diveIntervalTicks.
 * Otherwise it waits at 0 and launches on the first tick it can. At most one sortie per tick.
 */
export class AttackDirector {
  private timer: number;
  private nextSortieId = 1;

  constructor(private readonly config: LevelConfig) {
    this.timer = config.firstDiveDelayTicks;
  }

  /** Runs after the enemies have moved this tick: a launched enemy stands in this tick's slot. */
  update(enemies: readonly Enemy[], cols: number, rng: Rng): void {
    if (this.timer > 0) this.timer--;
    if (this.timer > 0) return;
    if (activeSorties(enemies) >= this.config.maxSorties) return;
    const sortie = selectSortie(enemies, cols, this.nextSortieId, rng);
    if (!sortie) return;
    sortie.members.forEach((member, i) => member.startDive(sortie.orders[i]!));
    this.nextSortieId++;
    this.timer = this.config.diveIntervalTicks;
  }
}
```

Замечания:

- `rng` вызывается ровно один раз на запуск вылета и ни разу, когда вылета нет
  (пустой список, лимит, таймер) — последовательность выборов зависит только от seed и
  хода игры.
- Отсчёт: `firstDiveDelayTicks = 180` → вылет в 180-м `update` (3,0 с), первый шаг peel —
  в 181-м; следующий — через `diveIntervalTicks` вызовов.
- `activeSorties` через `sortieId !== null` (= `isOut`): сбитый в полёте враг сразу
  освобождает место в лимите.
- `!` при индексации — как в существующих тестах (`noUncheckedIndexedAccess`; индекс
  заведомо в диапазоне). ESLint `recommended` не запрещает non-null assertion.

## 5. `Wave`: директор и порядок тика

**Файл (изменить):** `src/game/wave.ts`

```typescript
import type { Rng } from '../engine/rng';
import { AttackDirector } from './attack-director';
import type { EnemyEnv } from './enemy';
import { Enemy } from './enemy';
// ...

export class Wave {
  readonly formation: Formation;
  readonly enemies: readonly Enemy[];
  private readonly director: AttackDirector;
  /** Immutable per level: built once, not per enemy per tick. */
  private readonly env: EnemyEnv;

  /** The rng is the battle's: it picks who dives. */
  constructor(
    readonly config: LevelConfig,
    private readonly rng: Rng,
  ) {
    const layout = parseLayout(config.layout);
    this.formation = new Formation(layout.cols, layout.rows, config.swaySpeed);
    this.enemies = layout.slots.map((slot) => new Enemy(slot, this.formation));
    this.director = new AttackDirector(config);
    this.env = { diveSpeed: config.diveSpeed };
  }

  /**
   * Tick order: formation sway -> every enemy (reads this tick's slots) -> attack director
   * (a newly launched enemy stands in this tick's slot and takes its first peel step next tick).
   */
  update(dt: number): void {
    this.formation.update(dt);
    for (const enemy of this.enemies) enemy.update(dt, this.env);
    this.director.update(this.enemies, this.formation.cols, this.rng);
  }
}
```

- JSDoc класса: «Attack director (009) and enemy shots (012) join later» →
  «Enemy shots join in task 012».
- `Battle`, `collisions.ts`, `battle-render.ts`, сцены — **не меняются** (проверено:
  рендер ветвится только по `dead`/`exploding`, остальное рисует спрайтом; коллизии
  берут `isAlive`). В `collisions.ts` по желанию уточнить JSDoc правила 1: «alive
  enemy (in formation or in flight)».

## 6. Механическая правка существующих тестов

**Файлы (изменить):** `src/game/enemy.test.ts`, `src/game/collisions.test.ts`,
`src/game/wave.test.ts`, `src/game/levels.test.ts`

- `enemy.test.ts`: все `enemy.update()` → `enemy.update(TICK_SECONDS, ENV)`, где
  `const ENV: EnemyEnv = { diveSpeed: 60 };` (`import type { EnemyEnv }`).
- `collisions.test.ts`: хелпер `wave(layout)` → `new Wave(passiveLevel(layout), createRng(1))`
  (убрать `import type { LevelConfig }`, если больше не нужен); `enemy.update()`
  (стр. 130) → `enemy.update(TICK_SECONDS, { diveSpeed: 60 })`.
- `wave.test.ts`: литералы `{ layout, swaySpeed: 15 }` (3 шт.) → `passiveLevel(layout)`;
  тест «keeps the config object» — `const config = passiveLevel(['D'])`.
- `levels.test.ts`: в «uses an injected table» `a`/`b` → `passiveLevel(['D'])`,
  `passiveLevel(['S'])`. Тест «level 1/2 has the agreed layout» заменяется точными
  строками (шаг 7).
- `battle.test.ts`, `battle-render.test.ts`, `scenes/play-scene.test.ts` — без правок:
  на `LEVELS` они гоняют 0–1 тик, длинные прогоны — на пассивных таблицах. Тест
  «moves the player and sways the wave» (1 тик, `LEVELS[0]`) не задевается — первый
  вылет на 180-м тике.

После шагов 1–6 — `npm run typecheck` и `npm test` зелёные (до новых тестов).

## 7. Тесты

Все — Vitest, environment `node`, без canvas. Позиции сравниваются `toBe` (все числа —
двоичные дроби).

### 7.1 `src/game/enemy.test.ts` (дописать, `describe('Enemy dive')`)

Хелпер: `newEnemy()` уже есть (10 столбцов, `row 1, col 4`, `drone`); добавить
`const P = PEEL_SEGMENTS.reduce((s, x) => s + x.ticks, 0)` и
`step(enemy, n, env = ENV)` — `n` раз `enemy.update(TICK_SECONDS, env)`. Строй в
этих тестах не качается (никто не зовёт `formation.update`), кроме оговорённых.

Сценарии:

- `startDive` из `formation` → `state === 'diving'`, `stateTicks === 0`, `isOut`,
  `isAlive`, `sortieId === 7`; позиция в тике вызова не меняется.
- Первый шаг — в следующем `update`: после 1 `update` при `side = +1` — `x0 + 1`,
  `y0 - 1` (первый сегмент).
- Peel за `P` тиков проходит ровно сумму: `x0 + side · Σ(vx·ticks)`, `y0 + Σ(vy·ticks)`
  — `it.each([-1, 1])`; ожидания вычисляются из `PEEL_SEGMENTS`, а не литералами
  (дуга подстраивается владельцем). Плюс точечная проверка стартовых чисел: `P === 14`.
- Зажим X в peel: после `startDive` прямо поставить `enemy.x = 3` и `side = -1` →
  после `P` тиков `x === 0`; `enemy.x = SCREEN_WIDTH - enemy.width - 3`, `side = +1` →
  `x === SCREEN_WIDTH - enemy.width`. Ни в одном тике `x` не выходит за
  `[0, SCREEN_WIDTH - width]`.
- Крайний враг реального строя: `Formation(10, 3, 15)`, `col 0`, строй прокачан до
  `-SWAY_RANGE` (~198 тиков `formation.update`), `side = -1` — за весь peel `x >= 0`.
- Descend: тик `P + 1` — `y` растёт ровно на `diveSpeed · dt` (проверить для
  `{ diveSpeed: 60 }` и `{ diveSpeed: 120 }` — 1 и 2 px), `x` не меняется.
- Уход за низ: поставить в descend `y = SCREEN_HEIGHT - 1` → после `update` —
  `returning`, `stateTicks === 0`, `y === -height`, `x === formation.slotX(col, width)`,
  `isOut`, `sortieId` сохранён. При `y = SCREEN_HEIGHT - 2` и скорости 1 px — ещё
  `diving` (граница `>=`).
- Возврат в слот: из `returning` за `slotY + height` тиков — `formation`,
  `x/y` ровно слот, `sortieId === null`, `isOut === false`, `stateTicks === 0`; на
  следующем тике снова следует за слотом (после `formation.update` — `x === slotX`).
- Возврат при уехавшем по X слоте: в `returning` прямо поставить `x = slotX - 30`,
  `y = slotY - 5` → через 5 тиков `y === slotY` и дальше не растёт (проверять каждый тик
  `y <= slotY`), `x` приближается на 1 px/тик, через 30 тиков — `formation`, ровно в
  слоте. Вариант с качающимся строем (`Formation(10, 3, 30)`, на каждом тике
  `formation.update` до `enemy.update`) — тоже заканчивается в `formation`.
- Полный вылет на неподвижном строе: от `startDive` до `formation` — конечное число
  тиков (оценка для `drone` ряда 1 при 1 px/тик ≈ 14 + 192 + 54), в конце — слот.
- `kill()` в `diving` (peel и descend) и в `returning` → `exploding` на месте
  попадания, `sortieId === null`, `isOut === false`, `isAlive === false`; через
  `EXPLOSION_TICKS` — `dead`.
- `startDive` вне `formation` игнорируется: в `diving` (`sortieId` и `stateTicks` не
  меняются), `returning`, `exploding`, `dead`.
- Ограничения `PEEL_SEGMENTS`: каждый `ticks` — целое ≥ 1, `vx`/`vy` — целые, первый
  `vy < 0`, последний `vy > 0`, все `vx >= 0`, `max vy <= 3`.

### 7.2 `src/game/attack-director.test.ts` (создать)

Хелпер: `enemiesOf(layout)` — `new Wave(passiveLevel(layout), createRng(1))` → `enemies`
и `formation.cols` (пассивный уровень: внутренний директор волны не сработает). Директор
под тестом создаётся отдельно, `director.update(enemies, cols, rng)` вызывается без
`enemy.update` — вылетевшие остаются `diving`, пока тест сам их не убьёт. Подменный
`rng`: `const fixed = (v: number): Rng => () => v`.

`selectSortie`:

- Порядок кандидатов: раскладка `['DDD', '.D.', 'DD.']` (`cols = 3`); перебор
  `k = 0 … n-1` с `rng = fixed((k + 0.5) / n)` даёт по порядку: `(0,0,-1)`, `(0,2,+1)`,
  `(1,1,+1)` (ровно посередине — вправо), `(2,0,-1)`, `(2,1,+1)`; при `n = 5`
  `fixed(0.999999)` — последний.
- Одиночка левее середины — `side = -1` (`['D..']`), правее — `+1` (`['..D']`).
- Крайние — только в `formation`: после `startDive` левого в `['DDD']` кандидаты —
  средний (`-1`) и правый (`+1`); после `kill()` правого — его сосед становится правым.
  Взорванный/мёртвый — не кандидат.
- Ни одного в `formation` → `null`, и `rng` не вызывается (счётчик вызовов в подменном
  `rng`).
- `Sortie`: один участник, `orders[0].sortieId === переданный`.

`AttackDirector`:

- Таймер: `passiveLevel(['DDDD'], { firstDiveDelayTicks: 5, diveIntervalTicks: 3,
maxSorties: 4 })` — после 4 `update` никто не `isOut`, после 5-го — ровно один; затем
  следующий — ровно на 8-м, 11-м.
- `sortieId` растут: у второго вылетевшего `sortieId` на 1 больше первого.
- Лимит: `maxSorties: 1`, `firstDiveDelayTicks: 1`, `diveIntervalTicks: 1` — после
  10 `update` ровно один `isOut`; `kill()` вылетевшего → в следующем же `update` —
  новый вылет (таймер ждал на 0). Аналогично `maxSorties: 2` — не больше двух
  различных `sortieId` среди `isOut`.
- Освобождение возвратом: прогнать через `Wave` с `passiveLevel(['D.D'], {
firstDiveDelayTicks: 1, diveIntervalTicks: 1, maxSorties: 1 })` до возврата первого
  (`state === 'formation'` снова) — в том же `wave.update` второй уже `diving` (или тот
  же, если выбран снова — проверять «ровно один `isOut` в каждом тике после первого»).
- Все в полёте → ждёт без вызова `rng`.
- Детерминизм: два директора на одинаковых раскладках с `createRng(42)` — одинаковая
  последовательность `(row, col)` вылетающих за N вылетов (вылетевших убивать, чтобы
  освобождать лимит). Разные фиксированные seed (подобрать при реализации пару, у
  которой последовательности различаются, напр. 1 и 2; зафиксировать в тесте) —
  разная.

### 7.3 `src/game/wave.test.ts` (дописать)

- Порядок «директор после врагов»: `passiveLevel(['D'], { firstDiveDelayTicks: 1 })`
  — после первого `wave.update` враг `diving`, `stateTicks === 0`, позиция ровно
  `formation.slotX/slotY` этого тика (строй уже сдвинут на 1/4 px).
- Первый вылет на `LEVELS[0]`: после 179 `update` — ни одного `isOut`, после 180-го —
  ровно один.
- Детерминизм: две волны `LEVELS[1]` с `createRng(7)` после 600 тиков совпадают по
  `x`, `y`, `state`, `sortieId` всех врагов; и за эти тики был хотя бы один возврат
  (проверить, что в какой-то момент враг был `returning`) — тест не проходит
  вхолостую.

### 7.4 `src/game/levels.test.ts` (дописать)

Новые импорты: `TICK_SECONDS` из `../config`; `ENEMY_KINDS`, `PEEL_SEGMENTS`,
`RETURN_SPEED`, `STEER_SPEED` из `./enemy`; `SHOT_HEIGHT`, `SHOT_SPEED` из `./shot`
(только из теста — цикла в сборке нет).

- Точные строки: `expect(LEVELS).toEqual([...три объекта из шага 1...])`, `LEVELS.length
=== 3`; уровень 3 — раскладка уровня 2 (38 слотов). Заменяет тесты «level 1/2 has the
  agreed layout».
- Для каждой строки `LEVELS` (`it.each`, расширение существующего «level %i layout is
  valid»):
  - `isAllowedSpeed(diveSpeed)` и `Number.isInteger(diveSpeed * TICK_SECONDS)` (целые
    px/тик, ADR 002);
  - `firstDiveDelayTicks`, `diveIntervalTicks`, `maxSorties` — `Number.isInteger`, `>= 1`;
  - `swaySpeed < STEER_SPEED` (инвариант возврата);
  - туннелирование: `SHOT_SPEED * TICK_SECONDS + maxDown < SHOT_HEIGHT + minEnemyHeight`,
    где `maxDown = Math.max(diveSpeed * TICK_SECONDS, ...PEEL_SEGMENTS.map(s => s.vy),
RETURN_SPEED * TICK_SECONDS)`, `minEnemyHeight = Math.min(...Object.values(ENEMY_KINDS)
.map(k => k.sprite.height))` (сейчас `4 + 2 < 4 + 8`).

### 7.5 `src/game/collisions.test.ts` (дописать)

- Выстрел игрока сбивает врага в `diving`: `wave(['D'])`, `startDive({ sortieId: 1,
side: 1 })`, поставить `x = 122`, `y = 100`, `playerWithShot(104)` →
  `resolveCollisions` → `exploding`, выстрел снят, `sortieId === null`.
- То же для `returning` (довести врага до `returning` прямой установкой `y` в descend
  и одним `update`, затем поставить позицию в столбец выстрела).

## 8. Ручная проверка

`npm run dev`, Enter на титуле:

- Уровень 1: через ~3 с крайний враг (то левый, то правый, из любого ряда) коротко
  подпрыгивает наружу, уходит вниз по дуге и пикирует прямо вниз 1 px/тик; проходит
  под кораблём (корабль рисуется поверх), исчезает за низом, появляется над своим
  местом и опускается в покачивающийся строй без рывка. Одновременно в полёте — один.
- Сбить врага в каждой фазе: на дуге, в пике, при возврате — взрыв на месте попадания,
  следующий вылет не задерживается.
- Когда фланг ряда выбит/улетел — вылетает следующий по краю, никто не пролетает сквозь
  соседа.
- `?level=2` — пике вдвое быстрее, до двух в полёте; `?level=3` — строй качается
  вдвое быстрее, вылеты чаще; враги всё равно возвращаются в слоты.
- Последний враг циклит «пике → возврат», пока его не собьют; после — пауза и следующий
  уровень (как в 008).
- **Владелец утверждает дугу вылета** (`PEEL_SEGMENTS`); при подстройке —
  менять только числа в `enemy.ts`, тесты считают ожидания из массива.

## 9. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md` (на русском)

- `levels.ts`: `LevelConfig` — плюс `diveSpeed` (px/с, целые px/тик),
  `firstDiveDelayTicks`, `diveIntervalTicks`, `maxSorties`; `LEVELS` — три уровня
  (числа по «Уточнениям»; уровень 3 — раскладка 2, `swaySpeed = 30`).
- `enemy.ts`: состояния `formation | diving | returning | exploding | dead`;
  `startDive(DiveOrder { sortieId, side })` только из `formation`; `diving` = peel
  (`PEEL_SEGMENTS`, px/тик, зеркалится по `side`, фаза по `stateTicks`) → descend
  (`diveSpeed`), зажим X; уход за низ → `returning` над слотом (`y = -height`), шаг 1 px
  по осям (`STEER_SPEED`, `RETURN_SPEED`), не ниже `slotY`, в слоте → `formation`;
  `isAlive` = строй + полёт, `isOut` = полёт, `sortieId` — `null` вне полёта;
  `update(dt, env)`, `EnemyEnv { diveSpeed }`; импортирует `config`.
- Новый пункт `attack-director.ts`: `selectSortie(enemies, cols, sortieId, rng)` (крайние
  в `formation` по рядам, одиночка — по половине строя, `randomInt`; `null` без вызова
  `rng`), `AttackDirector(config)` — таймер в тиках, лимит `maxSorties`, ожидание на 0.
- `wave.ts`: хранит `rng`, порядок тика «строй → враги → директор», `env` один на уровень;
  убрать «`rng` пока не используется».
- `collisions.ts`: правило 1 действует и на врагов в полёте (через `isAlive`).
- `test-levels.ts`: `passiveLevel(layout, overrides?)` и пассивные значения.
- Граф импортов: `wave → {attack-director, enemy, formation, levels}` (`Rng`,
  `EnemyEnv` — type); `attack-director → engine/rng` (`Rng`, `DiveOrder`, `Enemy`,
  `LevelConfig` — type); `enemy → {config, enemy-art}`. Циклов нет.

`game-design.md` и запись фичи не трогаем (запись фичи — вне задачи; механики в
`game-design.md` описаны как план и не противоречат).

## Сводка по файлам

| Действие | Файл                                                |
| -------- | --------------------------------------------------- |
| Изменить | `src/game/levels.ts`                                |
| Изменить | `src/game/test-levels.ts`                           |
| Изменить | `src/game/enemy.ts`                                 |
| Создать  | `src/game/attack-director.ts`                       |
| Изменить | `src/game/wave.ts`                                  |
| Изменить | `src/game/enemy.test.ts`                            |
| Создать  | `src/game/attack-director.test.ts`                  |
| Изменить | `src/game/wave.test.ts`                             |
| Изменить | `src/game/levels.test.ts`                           |
| Изменить | `src/game/collisions.test.ts`                       |
| Изменить | `src/game/collisions.ts` (только JSDoc, по желанию) |
| Изменить | `second-brain/architecture/overview.md`             |

Без изменений: `battle.ts`, `battle-render.ts`, `formation.ts`, `shot.ts`,
`engine/rng.ts`, сцены, `main.ts`, `battle.test.ts`, `battle-render.test.ts`,
`scenes/*.test.ts`.

Финальная проверка: `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build`.

## Архитектура и паттерны

- Граница engine/game: из движка — только `Rng`/`randomInt`; движок не меняется.
- Детерминизм: выбор вылета — только `randomInt(rng, …)` с `rng` боя (переданным в
  `Wave`); `rng` не тратится, когда вылета нет; порядок кандидатов фиксирован (ряды
  сверху вниз, левый → правый) и не зависит от порядка массива.
- Время: скорости — px/с × `dt` (целые px/тик, ADR 002), `PEEL_SEGMENTS` — явно px/тик;
  таймеры директора — целые тики, уменьшаются на 1 за `update` (ADR 003).
- «Правило тиков переходов»: вход в состояние — `stateTicks = 0`; `update` — `++`, таймер,
  поведение; фаза `diving` выводится из `stateTicks`.
- Логика без рендера: рендер и `Battle` не меняются, всё покрыто тестами на `node`.
- Единый источник состояния: `sortieId`/`isOut`/`isAlive` — геттеры от состояния;
  строй — через конструктор врага, в `EnemyEnv` его нет.
- API ровно по таблице «Появление API» (без `config` у `selectSortie`, `shots`,
  `aimOffsetX`, `targetX`, `boolean` из `update`) — иначе `noUnusedParameters`.
- `import type` для типов; производительность — один проход по ≤ 38 врагам за тик.

## Открытые вопросы

- **Утверждение дуги вылета владельцем** — после реализации, глазами (`PEEL_SEGMENTS`
  — стартовое предложение из «Уточнений»). Не блокирует план и реализацию; подстройка
  — только числа в массиве (тесты считают ожидания из него).
- Хелпер `passiveLevel` в `test-levels.ts` — решение плана (не в дизайне); если ревью
  против — откатиться к литералам с пятью полями в каждом тесте.
- Отдельных задач выносить не нужно.

## Ссылки

- `second-brain/tasks/tasks/009-enemy-dive/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/002-enemies-and-levels/design.md` — «Сущности и состояния»
  (Enemy, AttackDirector), «Поток тика», «Интерфейсы», «Уточнения для реализации»,
  «Появление API по задачам» (строка 009), пункт 5 нарезки
- `second-brain/features/002-enemies-and-levels/discussion.md`
- `second-brain/decisions/002-integer-speeds.md`,
  `second-brain/decisions/003-slow-speeds-tick-timers.md`
- `second-brain/architecture/overview.md`
