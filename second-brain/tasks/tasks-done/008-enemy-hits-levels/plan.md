# План реализации: Сбивание врагов и уровни

Выстрел игрока сбивает врага в строю: враг на месте проигрывает взрыв (2 кадра по 8
тиков) и становится `dead`, выстрел снимается в тике попадания. Когда последний враг
доиграл взрыв, `Battle` уходит в фазу `cleared` на `LEVEL_PAUSE_TICKS = 90` тиков и
затем создаёт волну следующего уровня (за концом таблицы — последний). Стартовый уровень
пробрасывается `TitleScene → PlayScene → Battle`; в dev-сборке — из `?level=N`.

Источник правил: `design.md` фичи 002 — «Enemy — автомат состояний», «Правило тиков
переходов», «Battle — фазы», «Поток тика», «Интерфейсы», «Уточнения для реализации»
(строки `LEVELS`, тестовые таблицы, взрыв, «самый нижний», коллизии по `floor`),
строка 008 в «Появление API по задачам»; `analyze.md` задачи.

Порядок шагов — снизу вверх по графу импортов: каждый шаг компилируется и тестируется
сам по себе.

## 1. Кадры взрыва

**Файл (изменить):** `src/game/enemy-art.ts`

Добавить `EXPLOSION_FRAMES` — 2 спрайта, ширина нечётная, не больше 13 × 10 (инвариант
проверяется тестом в шаге 2). Кадр 0 — плотная вспышка 11 × 9 (размер `drone`), кадр 1 —
разлетающиеся осколки 13 × 9. Цвета — тёплые (жёлто-оранжево-красные), не совпадают с
цветами врагов. Вид — стартовый, **утверждает владелец глазами** (см. «Открытые вопросы»).

```typescript
const EXPLOSION_PALETTE = {
  W: '#ffffff', // hot core
  Y: '#ffe14f', // flash
  O: '#ff8a2a', // fire
  R: '#ff3b3b', // embers
} as const;

/**
 * Enemy explosion, 2 frames: a tight flash, then scattered debris.
 * Odd widths, at most 13×10; the renderer centers a frame in the enemy's rectangle.
 */
export const EXPLOSION_FRAMES: readonly Sprite[] = [
  parseSprite(
    [
      '.....Y.....',
      '..Y..Y..Y..',
      '...Y.O.Y...',
      '....OWO....',
      'YYOOWWWOOYY',
      '....OWO....',
      '...Y.O.Y...',
      '..Y..Y..Y..',
      '.....Y.....',
    ],
    EXPLOSION_PALETTE,
  ),
  parseSprite(
    [
      'R.....O.....R',
      '..O.......O..',
      '....R...R....',
      '.O....Y....O.',
      'O...Y...Y...O',
      '.O....Y....O.',
      '....R...R....',
      '..O.......O..',
      'R.....O.....R',
    ],
    EXPLOSION_PALETTE,
  ),
];
```

## 2. Автомат врага: `exploding` / `dead`

**Файл (изменить):** `src/game/enemy.ts`

- `EnemyState = 'formation' | 'exploding' | 'dead'` (комментарий: `diving`/`returning`
  — в 009).
- Константы: `EXPLOSION_FRAME_TICKS = 8`,
  `EXPLOSION_TICKS = EXPLOSION_FRAMES.length * EXPLOSION_FRAME_TICKS` (= 16). Импорт
  `EXPLOSION_FRAMES` — из `./enemy-art` (ребро `enemy → enemy-art` уже есть).
- `stateTicks` (getter над приватным счётчиком), `isAlive` (`state === 'formation'`),
  `kill()`.
- `update()` остаётся без параметров (`dt`/`env` — в 009) и возвращает `void`.
- «Правило тиков переходов»: `kill()` ставит `stateTicks = 0`; `update` сначала `++`,
  затем проверка таймера, затем поведение нового состояния. `dead` не обновляется вовсе
  (ранний `return`).

```typescript
/** Visual, starting values (owner approves the look). One explosion frame lasts this many ticks. */
export const EXPLOSION_FRAME_TICKS = 8;
/** Whole explosion, ticks: 16. Later must stay < DOWN_TICKS (task 011). */
export const EXPLOSION_TICKS = EXPLOSION_FRAMES.length * EXPLOSION_FRAME_TICKS;

/** Enemy states. diving/returning arrive in task 009. */
export type EnemyState = 'formation' | 'exploding' | 'dead';

export class Enemy {
  // ...existing fields...
  private currentState: EnemyState = 'formation';
  private ticksInState = 0;

  /** Ticks since entering the current state: 0 on the entry tick, +1 at the start of each update. */
  get stateTicks(): number {
    return this.ticksInState;
  }

  /** Can be hit. Later also diving/returning. */
  get isAlive(): boolean {
    return this.currentState === 'formation';
  }

  /** Any alive state -> 'exploding'; ignored otherwise. The enemy stays where it is. */
  kill(): void {
    if (!this.isAlive) return;
    this.enter('exploding');
  }

  /**
   * Tick rule: count the tick, apply the timer transition, then act in the (new) state.
   * formation: follow the slot. exploding: stand still, become dead after EXPLOSION_TICKS.
   * dead: nothing.
   */
  update(): void {
    if (this.currentState === 'dead') return;
    this.ticksInState++;
    if (this.currentState === 'exploding') {
      if (this.ticksInState >= EXPLOSION_TICKS) this.enter('dead');
      return;
    }
    this.x = this.formation.slotX(this.slot.col, this.width);
    this.y = this.formation.slotY(this.slot.row, this.height);
  }

  private enter(state: EnemyState): void {
    this.currentState = state;
    this.ticksInState = 0;
  }
}
```

Тайминг (для тестов): `kill()` в тике `T` → видимые `stateTicks` в `exploding` —
`0 … 15` (тики `T … T+15`); в `update` тика `T+16` враг `dead`.

Обновить doc-комментарий класса (состояния и что `x/y` в `exploding` не меняются).

## 3. `Wave.isCleared`

**Файл (изменить):** `src/game/wave.ts`

```typescript
/** True when every enemy is dead (explosions finished), not just hit. */
get isCleared(): boolean {
  return this.enemies.every((e) => e.state === 'dead');
}
```

`update` не меняется (ветвление по состоянию — внутри `Enemy`).

## 4. `Player.removeShot`

**Файл (изменить):** `src/game/player.ts`

```typescript
/** Drops the shot in flight (it hit something). Fire is available from the next update. */
removeShot(): void {
  this.activeShot = null;
}
```

Обновить комментарий автомата выстрела: `InFlight --hit--> Ready`. Порядок
`Player.update` не меняется: огонь идёт до коллизий, поэтому в тике попадания нового
выстрела не будет — слот свободен со следующего тика.

## 5. Коллизии (правило 1)

**Файл (создать):** `src/game/collisions.ts`

`Shot` не имеет `width/height` — прямоугольник собирается из `SHOT_WIDTH/SHOT_HEIGHT`
(`shot.ts` не трогаем). `Enemy` структурно совместим с `Rect`. Правила 2–3 (вражеские
выстрелы, таран) — в 012/011, здесь их нет.

```typescript
import type { Enemy } from './enemy';
import type { Player } from './player';
import { SHOT_HEIGHT, SHOT_WIDTH } from './shot';
import type { Wave } from './wave';

/** Axis-aligned rectangle, top-left corner + size, logical pixels. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Strict AABB on the pixel grid: positions are floored (as the renderer does), sizes are whole.
 * Touching edges do not overlap.
 */
export function overlaps(a: Rect, b: Rect): boolean {
  const ax = Math.floor(a.x);
  const ay = Math.floor(a.y);
  const bx = Math.floor(b.x);
  const by = Math.floor(b.y);
  return ax < bx + b.width && bx < ax + a.width && ay < by + b.height && by < ay + a.height;
}

/**
 * Runs after everything has moved this tick.
 * Rule 1: the player's shot kills one alive enemy it overlaps - the lowest one
 * (largest y + height; on a tie the smaller index in wave.enemies) - and is removed.
 * Rules 2-3 (enemy shots, ramming) arrive in tasks 012 and 011.
 */
export function resolveCollisions(player: Player, wave: Wave): void {
  const { shot } = player;
  if (!shot) return;
  const shotRect: Rect = { x: shot.x, y: shot.y, width: SHOT_WIDTH, height: SHOT_HEIGHT };
  let target: Enemy | null = null;
  for (const enemy of wave.enemies) {
    if (!enemy.isAlive || !overlaps(shotRect, enemy)) continue;
    // Strict '>' keeps the earlier enemy on a tie.
    if (target === null || enemy.y + enemy.height > target.y + target.height) target = enemy;
  }
  if (target) {
    target.kill();
    player.removeShot();
  }
}
```

Граф: `collisions → shot`; `Enemy`, `Player`, `Wave` — `import type`. Циклов нет
(`battle → collisions`, обратного ребра нет).

## 6. Таблица уровней и тестовые таблицы

**Файл (изменить):** `src/game/levels.ts`

- В `LEVELS` — строка уровня 2 (точные строки из «Уточнений»):

```typescript
export const LEVELS: readonly LevelConfig[] = [
  { layout: ['.SSSSSSSS.', 'DDDDDDDDDD', 'DDDDDDDDDD'], swaySpeed: 15 },
  { layout: ['.SSSSSSSS.', 'SSSSSSSSSS', 'DDDDDDDDDD', 'DDDDDDDDDD'], swaySpeed: 15 },
];
```

- Разбор `?level` — чистая функция здесь же (решение по открытому вопросу 3 анализа:
  `main.ts` остаётся без логики, правило покрыто тестом; место — `levels.ts`, потому что
  правило «целое ≥ 1» — то же, что у `levelConfig`). Строгий формат: только десятичные
  цифры, иначе 1 (`'abc'`, `''`, `'0'`, `'1.5'`, `'-2'`, `'1e3'`, `' 2'`, `null`).

```typescript
/**
 * Parses the dev-only `?level=N` value. Returns N for a plain decimal integer >= 1,
 * otherwise 1. A level past the end of the table is fine: levelConfig repeats the last one.
 */
export function parseStartLevel(value: string | null): number {
  if (value === null || !/^\d+$/.test(value)) return 1;
  const level = Number(value);
  return Number.isSafeInteger(level) && level >= 1 ? level : 1;
}
```

**Файл (изменить):** `src/game/test-levels.ts`

```typescript
/**
 * TWO_LEVELS: two distinct passive levels for level-change tests. Level 1 - one drone in the
 * top-left cell, level 2 - two drones in the corners of a full-width (11) layout; both far from
 * the ship's shot column (x = 127). Level 3+ repeats level 2.
 */
export const TWO_LEVELS: readonly LevelConfig[] = [
  { layout: ['D..........'], swaySpeed: 15 },
  { layout: ['D.........D'], swaySpeed: 15 },
];
```

Левый враг уровня 2 стоит в `x = 42`, правый — в `x = 40 + 10 * 16 + 2 = 202` (± покачивание
16): столбец выстрела `127` не задет. Комментарий модуля дополнить упоминанием
`TWO_LEVELS`.

## 7. Фазы и уровни `Battle`

**Файл (изменить):** `src/game/battle.ts`

- `BattlePhase`, `LEVEL_PAUSE_TICKS = 90` (В8), `BattleOptions.startLevel?`.
- `wave` — геттер над приватным изменяемым полем; `level`, `phase` — геттеры.
- `rng` и `levels` хранятся в полях (нужны при смене уровня). `levels` может быть
  `undefined` — дефолт `LEVELS` применяет `levelConfig` (параметр по умолчанию
  срабатывает на `undefined`).
- Порядок тика — «Поток тика» дизайна: игрок → волна → коллизии (только `playing`) →
  фазы. В `cleared` игрок двигается и стреляет как обычно, волна (только `dead`) —
  лишь покачивает строй.
- Тики перехода: вход в `cleared` в шаге 4 тика `T` (`phaseTicks = 0`); в шаге 4 каждого
  следующего тика `phaseTicks++`; при `phaseTicks === LEVEL_PAUSE_TICKS` — `level++`,
  новая `Wave` (рисуется в этом тике в начальных позициях, первый `update` — в
  следующем), фаза `playing`. `wave.clearShots()` при входе в `cleared` — задача 012.

```typescript
import type { Rng } from '../engine/rng';
import { resolveCollisions } from './collisions';
import type { LevelConfig } from './levels';
import { levelConfig } from './levels';
import type { PlayerIntent } from './player';
import { Player } from './player';
import { Wave } from './wave';

export type BattlePhase = 'playing' | 'cleared';
/** Pause between a cleared wave and the next one, ticks (owner decision В8: 1.5 s, no caption). */
export const LEVEL_PAUSE_TICKS = 90;

export interface BattleOptions {
  /** 1-based level to start from; defaults to 1. Must be an integer >= 1 (levelConfig throws). */
  readonly startLevel?: number;
  /** Level table; defaults to LEVELS. Tests inject small tables from test-levels.ts. */
  readonly levels?: readonly LevelConfig[];
}

export class Battle {
  readonly player = new Player();
  private currentWave: Wave;
  private currentLevel: number;
  private currentPhase: BattlePhase = 'playing';
  private phaseTicks = 0;
  private readonly levels: readonly LevelConfig[] | undefined;

  constructor(
    private readonly rng: Rng,
    opts: BattleOptions = {},
  ) {
    this.levels = opts.levels;
    this.currentLevel = opts.startLevel ?? 1;
    this.currentWave = this.createWave();
  }

  get level(): number {
    return this.currentLevel;
  }
  get wave(): Wave {
    return this.currentWave;
  }
  get phase(): BattlePhase {
    return this.currentPhase;
  }

  /** Tick order: player -> wave -> collisions (playing only) -> phase. */
  update(dt: number, intent: PlayerIntent): void {
    this.player.update(dt, intent);
    this.currentWave.update(dt);
    if (this.currentPhase === 'playing') resolveCollisions(this.player, this.currentWave);
    this.updatePhase();
  }

  /**
   * playing -> cleared once every enemy is dead (phaseTicks = 0 on that tick);
   * cleared -> playing with the next level's wave when phaseTicks reaches LEVEL_PAUSE_TICKS.
   * The new wave is drawn this tick at its start positions and first updated next tick.
   */
  private updatePhase(): void {
    if (this.currentPhase === 'playing') {
      if (this.currentWave.isCleared) {
        this.currentPhase = 'cleared';
        this.phaseTicks = 0;
      }
      return;
    }
    this.phaseTicks++;
    if (this.phaseTicks === LEVEL_PAUSE_TICKS) {
      this.currentLevel++;
      this.currentWave = this.createWave();
      this.currentPhase = 'playing';
    }
  }

  private createWave(): Wave {
    return new Wave(levelConfig(this.currentLevel, this.levels), this.rng);
  }
}
```

Doc-комментарий класса обновить (фазы, уровень). Внешний код читает `battle.wave` —
геттер совместим (`battle-render.ts`, тесты).

Тайминг (для тестов): попадание в шаге 3 тика `T` → `dead` в `update` тика `T+16` →
`cleared` в шаге 4 тика `T+16` → новая волна в тике `T+16+90`.

## 8. Отрисовка взрыва

**Файл (изменить):** `src/game/battle-render.ts`

Цикл врагов ветвится по состоянию: `dead` — пропуск; `exploding` — кадр по
`stateTicks`, центрированный в прямоугольнике врага; иначе — спрайт вида. Порядок слоёв
не меняется (выстрел → враги → корабль). `noUncheckedIndexedAccess`: индекс кадра даёт
`Sprite | undefined` — при `undefined` ничего не рисуем (по автомату не случается:
`stateTicks ≤ 15`).

```typescript
import { ENEMY_KINDS, EXPLOSION_FRAME_TICKS, type Enemy } from './enemy';
import { EXPLOSION_FRAMES } from './enemy-art';
// ...

for (const enemy of battle.wave.enemies) drawEnemy(ctx, enemy);

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy): void {
  if (enemy.state === 'dead') return;
  const x = Math.floor(enemy.x);
  const y = Math.floor(enemy.y);
  if (enemy.state === 'exploding') {
    const frame = EXPLOSION_FRAMES[Math.floor(enemy.stateTicks / EXPLOSION_FRAME_TICKS)];
    if (!frame) return;
    // Centered in the enemy's rectangle; may stick out by a pixel for a narrower enemy.
    drawSprite(
      ctx,
      frame,
      x + Math.floor((enemy.width - frame.width) / 2),
      y + Math.floor((enemy.height - frame.height) / 2),
    );
    return;
  }
  drawSprite(ctx, ENEMY_KINDS[enemy.kind].sprite, x, y);
}
```

`Enemy` — через `import type` (inline `type Enemy` в одном импорте допустим с
`verbatimModuleSyntax`; если линтер требует отдельную строку — `import type { Enemy }`).
Импорт `EXPLOSION_FRAME_TICKS` из `enemy.ts` — по анализу (в дизайне указан
`EXPLOSION_TICKS`, поправит архитектор — см. «Открытые вопросы»).

## 9. Сцены: проброс опций и стартового уровня

**Файл (изменить):** `src/game/scenes/play-scene.ts`

```typescript
import type { BattleOptions } from '../battle';
import { Battle } from '../battle';

/** Pass the title's starfield to keep the stars continuous; opts go to the Battle as is. */
constructor(rng: Rng, starfield?: Starfield, opts?: BattleOptions) {
  // Stars first, then the battle seed: the star layout for a given seed stays as before.
  this.starfield = starfield ?? new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, rng);
  this.battle = new Battle(createRng(Math.floor(rng() * 2 ** 32)), opts);
}
```

**Файл (изменить):** `src/game/scenes/title-scene.ts`

```typescript
constructor(
  private readonly rng: Rng,
  /** Level the game starts from; undefined = 1. Dev builds pass ?level=N. */
  private readonly startLevel?: number,
) { ... }

if (input.pressed('start')) {
  return new PlayScene(this.rng, this.starfield, { startLevel: this.startLevel });
}
```

`exactOptionalPropertyTypes` выключен — `{ startLevel: undefined }` допустим, `Battle`
берёт `?? 1`.

## 10. Точка входа: `?level=N` в dev

**Файл (изменить):** `src/main.ts`

```typescript
import { parseStartLevel } from './game/levels';

const rng = createRng(Date.now());
// Dev only: ?level=N starts from level N (anything but an integer >= 1 means level 1).
const startLevel = import.meta.env.DEV
  ? parseStartLevel(new URLSearchParams(window.location.search).get('level'))
  : undefined;
let scene: Scene = new TitleScene(rng, startLevel);
```

В прод-сборке `import.meta.env.DEV === false` — ветка вырезается, `startLevel =
undefined` → уровень 1. Санитизация обязательна: `levelConfig` бросает на не целом.

## 11. Тесты

Все — Vitest, environment `node`, рядом с кодом. Числа ниже выведены из констант кода
(ячейка 16 × 12, `FORMATION_TOP = 32`, выстрел 4 px/тик от `y = 204`, покачивание
0,25 px/тик); в тестах — через импортированные константы, где это не затуманивает
сценарий.

**`src/game/enemy.test.ts`** (дополнить):

- `isAlive` в `formation` — `true`; `kill()` → `state === 'exploding'`,
  `stateTicks === 0`, `isAlive === false`.
- В `exploding` стоит на месте: после `kill()` сдвинуть строй (`formation.update` × 8)
  и вызвать `enemy.update()` — `x/y` не изменились.
- Ровно через `EXPLOSION_TICKS`: после `EXPLOSION_TICKS - 1` вызовов `update()` —
  `exploding`, `stateTicks === EXPLOSION_TICKS - 1`; следующий `update()` — `dead`.
- Повторный `kill()` в `exploding` не сбрасывает `stateTicks` (после 3 `update` —
  `kill()` — `stateTicks === 3`); `kill()` в `dead` — остаётся `dead`.
- `dead`: `update()` не двигает (после `formation.update` позиция та же).
- `stateTicks` в `formation` растёт на 1 за `update` (старт 0).
- Инвариант кадров (`describe('EXPLOSION_FRAMES')`): `length === 2`; каждый кадр —
  нечётная ширина, `width ≤ 13`, `height ≤ 10`; кадры различаются;
  `EXPLOSION_TICKS === EXPLOSION_FRAMES.length * EXPLOSION_FRAME_TICKS` и `=== 16`.

**`src/game/wave.test.ts`** (дополнить, `describe('isCleared')`):

- Новая волна — `false`.
- Все `kill()` → `false` (взрывы идут); после `EXPLOSION_TICKS` вызовов
  `wave.update(TICK_SECONDS)` — `true`.
- Один враг оставлен живым — после тех же тиков `false`.

**`src/game/player.test.ts`** (дополнить):

- `removeShot()` снимает выстрел (`shot === null`); следующий `update(FIRE)` создаёт
  новый выстрел у носа (`muzzleOf`), не тот же объект.
- `removeShot()` без выстрела — ничего не ломает (`shot === null`).

**`src/game/collisions.test.ts`** (создать):

`overlaps`:

- пересечение на 1 px — `true`; касание по X (`{x:0,w:4}` и `{x:4,w:4}`) и по Y — `false`;
- `floor` дробных координат: `a = {x: 3.75, y: 0, w: 1, h: 1}`, `b = {x: 4, y: 0, w: 4, h: 4}`
  — `false` (без `floor` было бы `true`); `a.x = 4.5` — `true`; дробное у `b`:
  `b = {x: 0.75, w: 4}`, `a = {x: 4, w: 1}` — `false`.

`resolveCollisions` (волна из маленьких конфигов, координаты врагов выставляются прямо;
игрок по умолчанию — корабль в `x = 120`, выстрел в столбце `x = 127` после
`player.update(TICK_SECONDS, FIRE)`, затем `shot.y` ставится прямо):

- нет выстрела — враги остаются `formation`, ошибок нет;
- выстрел мимо — выстрел на месте, враги живы;
- попадание: `{ layout: ['D'] }` (один столбец, враг `x = 122 … 132`, `y = 34 … 42`),
  `shot.y = 38` → враг `exploding`, `player.shot === null`;
- касание краями (`shot.y = 42`, низ врага) — не попадание;
- самый нижний: `{ layout: ['DD'] }`, обоим `x = 122`, `enemies[0].y = 100`,
  `enemies[1].y = 101`, `shot.y = 104` — убит `enemies[1]`, `enemies[0]` жив;
  то же наоборот (`enemies[0].y = 101`) — убит `enemies[0]` (выбор по `y + height`,
  не по индексу);
- равенство `y + height` — убит меньший индекс (`enemies[0]`), второй жив;
- убивает ровно одного: два пересекающихся — после вызова ровно один `exploding`;
- `exploding`/`dead` не задеваются: единственный враг под выстрелом `kill()`-нут заранее
  → выстрел остаётся, `stateTicks` врага не сброшен; с двумя врагами, где нижний уже
  `exploding`, — убит верхний живой.

**`src/game/levels.test.ts`** (дополнить):

- `level 2 has the agreed layout`: точные строки и `swaySpeed === 15`; 38 врагов
  (`parseLayout(...).slots.length`). `it.each` по `LEVELS` подхватит строку сам.
- `parseStartLevel`: `'1' → 1`, `'2' → 2`, `'99' → 99`; `null`, `''`, `'0'`, `'1.5'`,
  `'abc'`, `'-2'`, `'1e3'`, `' 2'`, `'99999999999999999999'` → 1 (`it.each`).

**`src/game/battle.test.ts`** (дополнить; таблицы из `test-levels.ts`):

Хелпер `clearWave(battle)`: `kill()` всем врагам, затем
`EXPLOSION_TICKS + LEVEL_PAUSE_TICKS` вызовов `update(TICK_SECONDS, IDLE)`.

- Старт: `level === 1`, `phase === 'playing'`.
- `startLevel`: `{ levels: TWO_LEVELS, startLevel: 2 }` → `level === 2`,
  `wave.config === TWO_LEVELS[1]`; `startLevel: 5` → `level === 5`, конфиг — последняя
  строка.
- Вход в `cleared`: на `TWO_LEVELS` `kill()` единственного врага; после
  `EXPLOSION_TICKS - 1` апдейтов — `playing`; следующий — `cleared`, `level === 1`.
- Переход ровно через `LEVEL_PAUSE_TICKS`: после ещё `LEVEL_PAUSE_TICKS - 1` апдейтов —
  `cleared`, `level === 1`, волна та же (`toBe` старой); следующий апдейт — `playing`,
  `level === 2`, `wave.config === TWO_LEVELS[1]`, 2 врага, все `formation`, позиции —
  начальные (`formation.offset === 0`, `x === formation.slotX(col, width)`); ещё один
  апдейт — `offset === 0.25` (первый `update` новой волны — в следующем тике).
- Уровень 3 повторяет последнюю строку: `clearWave` дважды → `level === 3`,
  `wave.config === TWO_LEVELS[1]`, новый объект волны.
- В `cleared` игрок двигается и стреляет: после входа в `cleared` апдейт с
  `{ move: 1, fire: true }` — корабль сдвинулся, выстрел есть и летит в следующих тиках.
- Попадание через `Battle.update` (`ONE_CORNER_ENEMY`): `player.ship.x = 40` (выстрел в
  `x = 47`); `update(FIRE)` — выстрел создан; `shot.y = 42` (касается низа врага); в
  следующем `update(FIRE)` (новое нажатие проигнорировано — выстрел в полёте) выстрел
  на `y = 38` пересекает врага (`x = 42 … 52` при `offset = 0.5`) → `player.shot === null`,
  враг `exploding` со `stateTicks === 0`; ещё один `update(FIRE)` — новый выстрел
  создан (слот свободен со следующего тика).
- Существующие тесты не меняются (`battle.wave` — геттер).

**`src/game/battle-render.test.ts`** (дополнить; существующие не меняются):

- `exploding`, кадр 0: `kill()` врага `ONE_CORNER_ENEMY` → вызовы =
  `spriteCalls(EXPLOSION_FRAMES[0], floor(x) + floor((w - fw) / 2), floor(y) + floor((h - fh) / 2))`
  - корабль. Ожидаемые координаты считаются в тесте по формуле из констант и
    дополнительно сверяются с числом для читаемости (кадр 11 × 9 у врага 11 × 8 в `(42, 34)`
    → `(42, 33)`).
- `exploding`, кадр 1: после `EXPLOSION_FRAME_TICKS` апдейтов `battle.update(IDLE)` —
  кадр 1 (13 × 9 → `(41, 33)`), позиция та же, что при `kill()`.
- Последний тик взрыва (`stateTicks === EXPLOSION_TICKS - 1`) — ещё кадр 1.
- `dead`: после `EXPLOSION_TICKS` апдейтов — только вызовы корабля.

**`src/game/scenes/play-scene.test.ts`** (изменить):

- Все тесты корабля/выстрела → `new PlayScene(createRng(1), undefined, { levels: ONE_CORNER_ENEMY })`
  (хелпер `newScene()` в файле). `builds the level 1 wave` остаётся на `LEVELS` (28).
- `passes battle options`: `{ levels: TWO_LEVELS, startLevel: 2 }` → `battle.level === 2`,
  2 врага.
- Сквозной `shoots down an enemy`: `ship.x = 50` (выстрел в `x = 57`), `fire` нажат
  перед первым тиком. Выстрел создаётся в тике 1 на `y = 204` и в тике `k` стоит на
  `y = 204 - 4(k - 1)`; враг — `y = 34 … 42`. Тик 41: `y = 44` — мимо; тик 42: `y = 40`
  — попадание. Строй к тику 42 сдвинут на `42 × 0,25 = 10,5` → враг `x = 52 … 62`,
  столбец 57 — по центру. Проверки: после `step(scene, input, 41)` — выстрел есть, враг
  `formation`; после ещё `step(..., 1)` — `player.shot === null`, враг `exploding`.
  Вывод чисел — комментарием в тесте.

**`src/game/scenes/title-scene.test.ts`** (дополнить):

- `new TitleScene(createRng(1), 2)` + `start` → `PlayScene` с `battle.level === 2`.
- Без `startLevel` → `battle.level === 1`.

## 12. Ручная проверка

`npm run dev`, Enter на титуле:

- Подвести корабль под врага, выстрелить — враг вспыхивает (2 кадра, ~0,27 с) и
  пропадает; выстрел исчезает в момент попадания; можно сразу стрелять снова. Строй
  качается без сбитых, размах не меняется.
- Выстрел, прошедший между врагами / мимо, — улетает вверх как раньше; один выстрел
  сбивает ровно одного (нижнего в столбце).
- Сбить всех — короткая пауза (~1,5 с, без надписи), затем строй уровня 2 (4 ряда,
  второй ряд — 10 `striker`). После уровня 2 — снова строй уровня 2.
- `?level=2` — сразу 4 ряда; `?level=99` — тоже уровень 2; `?level=abc`, `?level=0`,
  `?level=1.5`, без параметра — уровень 1, без ошибок в консоли.
- **Владелец утверждает вид взрыва** (спрайты `EXPLOSION_FRAMES`, длительность кадра).

## 13. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md` (на русском)

- `enemy-art.ts`: + `EXPLOSION_FRAMES` (2 кадра, 11 × 9 и 13 × 9).
- `enemy.ts`: состояния `formation | exploding | dead`, `kill()`, `stateTicks`
  («Правило тиков переходов»), `isAlive`, `EXPLOSION_FRAME_TICKS = 8`,
  `EXPLOSION_TICKS = 16`; в `exploding` стоит на месте, `dead` не обновляется.
- `wave.ts`: + `isCleared` (все `dead`).
- `player.ts`: + `removeShot()`, автомат выстрела `InFlight --hit--> Ready`.
- **новый** `collisions.ts`: `Rect`, `overlaps` (строгий AABB по `floor`),
  `resolveCollisions` — правило 1 (самый нижний, при равенстве — меньший индекс).
- `levels.ts`: `LEVELS` — уровни 1–2; + `parseStartLevel`.
- `test-levels.ts`: + `TWO_LEVELS`.
- `battle.ts`: `BattlePhase`, `LEVEL_PAUSE_TICKS = 90`, `BattleOptions { startLevel?, levels? }`,
  геттеры `level`/`wave`/`phase`; порядок тика игрок → волна → коллизии (`playing`) →
  фазы; переход уровня.
- `battle-render.ts`: ветки `exploding` (кадр по `stateTicks`, центрирование) и `dead`.
- `play-scene.ts`: `PlayScene(rng, starfield?, opts?)`; `title-scene.ts`:
  `TitleScene(rng, startLevel?)`; точка входа — dev-разбор `?level=N`.
- Граф импортов: `battle → {player, wave, levels, collisions}`, `collisions → shot`
  (`Player`, `Wave`, `Enemy` — type), `battle-render → {art, enemy, enemy-art, sprite, shot}`,
  `main → {…, game/levels}`.

README в `src/` нет — не создаются. `game-design.md` уровни/взрывы не описывает —
не меняется. Запись фичи в `second-brain/features/` не трогать.

## Сводка по файлам

| Действие | Файл                                    |
| -------- | --------------------------------------- |
| Изменить | `src/game/enemy-art.ts`                 |
| Изменить | `src/game/enemy.ts`                     |
| Изменить | `src/game/enemy.test.ts`                |
| Изменить | `src/game/wave.ts`                      |
| Изменить | `src/game/wave.test.ts`                 |
| Изменить | `src/game/player.ts`                    |
| Изменить | `src/game/player.test.ts`               |
| Создать  | `src/game/collisions.ts`                |
| Создать  | `src/game/collisions.test.ts`           |
| Изменить | `src/game/levels.ts`                    |
| Изменить | `src/game/levels.test.ts`               |
| Изменить | `src/game/test-levels.ts`               |
| Изменить | `src/game/battle.ts`                    |
| Изменить | `src/game/battle.test.ts`               |
| Изменить | `src/game/battle-render.ts`             |
| Изменить | `src/game/battle-render.test.ts`        |
| Изменить | `src/game/scenes/play-scene.ts`         |
| Изменить | `src/game/scenes/play-scene.test.ts`    |
| Изменить | `src/game/scenes/title-scene.ts`        |
| Изменить | `src/game/scenes/title-scene.test.ts`   |
| Изменить | `src/main.ts`                           |
| Изменить | `second-brain/architecture/overview.md` |

Финальная проверка: `npm run format:check`, `lint`, `typecheck`, `test`, `build`.

## Архитектура и паттерны

- Граница engine/game не меняется: всё новое — в `src/game/`; `main.ts` только читает
  URL и передаёт число.
- Логика отдельно от рендера: автомат врага, коллизии и фазы — без canvas; рендер лишь
  выбирает кадр по `stateTicks` (ничего не считает сам).
- Детерминизм: таймеры — целые тики (ADR 003), счётчики `+1` за `update` по «Правилу
  тиков переходов»; `Rng` в 008 не используется (хранится в `Battle` для новых волн).
- Коллизии после движения всех, на пиксельной сетке (`Math.floor`) — проверяется ровно
  то, что нарисовано.
- Массив врагов не перестраивается (`dead` остаётся) — стабильный порядок.
- API появляется задачей, которая его использует: `Enemy.update()` без `dt`, без
  `diving`/`returning`, без `clearShots` (009/012).
- `import type` для типов; тестовые таблицы — только из `*.test.ts`.

## Открытые вопросы

Блокирующих нет.

1. **Вид взрыва — приёмка владельцем после реализации** (критерий готовности задачи).
   Кадры и цвета в шаге 1 — стартовые; правка — только данные `EXPLOSION_FRAMES`
   (размеры в пределах инварианта) и `EXPLOSION_FRAME_TICKS`.
2. **Импорт `EXPLOSION_FRAME_TICKS` в `battle-render.ts`** — так и делаем; граф импортов
   в `design.md` (`EXPLOSION_TICKS`) поправит архитектор, на реализацию не влияет.
3. **Разбор `?level` — решено:** чистая `parseStartLevel` в `levels.ts` с тестом,
   `main.ts` без логики (отступление от дизайна «разбор в `main.ts`» — ради теста; для
   архитектора — отразить в дизайне).

## Ссылки

- `second-brain/tasks/tasks/008-enemy-hits-levels/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/002-enemies-and-levels/design.md` — «Enemy — автомат
  состояний», «Правило тиков переходов», «Battle — фазы», «Поток тика», «Интерфейсы»,
  «Уточнения для реализации», «Появление API по задачам» (строка 008), нарезка п. 4
- `second-brain/architecture/overview.md`
- `second-brain/decisions/002-integer-speeds.md`, `003-slow-speeds-tick-timers.md`
