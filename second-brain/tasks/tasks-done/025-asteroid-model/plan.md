# План реализации: Модель астероида

Логика астероида (`asteroid.ts`) и агрегата «поле бонусов» (`bonus-field.ts`) плюс
очки за астероид (`score.ts`), **без встраивания в бой**: `Battle`, сцены, рендер, HUD,
коллизии не меняются. Всё проверяется unit-тестами. Рамка — `design.md` фичи 006,
пункт 2а нарезки, с решениями архитектора по вопросам analyze (`discussion.md`,
«Реализация: задача 025-asteroid-model»).

Код: рабочее дерево поверх `b9f6535` (024 реализована, не закоммичена; `bonus.ts` есть).

## 1. Очки: `levelPoints` и `asteroidPoints`

**Файл (изменить):** `src/game/score.ts`

Формулу и проверку уровня перенести из `killPoints` в `levelPoints`; текст `RangeError`
сохранить дословно. `killPoints` — через `levelPoints`, результат прежний. Док-комментарий
формулы переезжает на `levelPoints`, у `killPoints` — короткий.

```typescript
/**
 * Base points scaled by +10% per level above 1, rounded half up to a multiple of 10, no cap
 * (owner decision В2). Integer-only: floor((base * (9 + level) + 50) / 100) * 10, so there is
 * no float trap like 30 * 1.4 = 41.999...
 * Throws RangeError on a level that is not an integer >= 1.
 */
export function levelPoints(base: number, level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`Level must be an integer >= 1, got ${level}`);
  }
  return Math.floor((base * (9 + level) + 50) / 100) * 10;
}

/** Points for one kill: ENEMY_POINTS of the kind (formation / in flight) through levelPoints. */
export function killPoints(kill: Kill, level: number): number {
  const points = ENEMY_POINTS[kill.kind];
  return levelPoints(kill.inFlight ? points.flying : points.formation, level);
}

/** Base points for breaking an asteroid (owner decision В7 of feature 006). */
export const ASTEROID_POINTS = 100;

/** Asteroid points with the same level bonus as enemies: 100 on level 1, 140 on level 5. */
export function asteroidPoints(level: number): number {
  return levelPoints(ASTEROID_POINTS, level);
}
```

`BONUS_FALLBACK_POINTS` здесь **не** добавлять — задача 027.

## 2. Астероид

**Файл (создать):** `src/game/asteroid.ts`

Импорты: `SCREEN_HEIGHT`, `SCREEN_WIDTH` из `../config`; `import type { BonusKind }` из
`./bonus`; `EXPLOSION_TICKS` из `./enemy` (цикла нет — `enemy.ts` новые файлы не
импортирует).

```typescript
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../config';
import type { BonusKind } from './bonus';
import { EXPLOSION_TICKS } from './enemy';

export type AsteroidState = 'flying' | 'exploding' | 'gone';

/** Hitbox side, px. Equals the sprite size (that test comes with the sprite, task 026). */
export const ASTEROID_SIZE = 12;
/** Downward speed, px/s: 1 px/tick (ADR 002). */
export const ASTEROID_FALL_SPEED = 60;
/** Sideways speed, px/s: 1/2 px/tick (ADR 003, exact binary fraction). */
export const ASTEROID_DRIFT_SPEED = 30;
/** Sideways travel over the whole fall, px: (SCREEN_HEIGHT + size) * drift / fall = 126. */
export const ASTEROID_DRIFT_TOTAL =
  ((SCREEN_HEIGHT + ASTEROID_SIZE) * ASTEROID_DRIFT_SPEED) / ASTEROID_FALL_SPEED;
/** Largest start offset from the side it starts at, px: keeps the whole fall on screen (118). */
export const ASTEROID_SPAWN_OFFSET_MAX = SCREEN_WIDTH - ASTEROID_SIZE - ASTEROID_DRIFT_TOTAL;

/**
 * A bonus target: falls diagonally from above a top corner, breaks on one hit (В3).
 * flying --hit()--> exploding --EXPLOSION_TICKS--> gone; flying --y >= SCREEN_HEIGHT--> gone.
 * Does not move on the tick it is created (the field creates it after moving its objects).
 */
export class Asteroid {
  readonly width = ASTEROID_SIZE;
  readonly height = ASTEROID_SIZE;
  x: number;
  y: number;
  private currentState: AsteroidState = 'flying';
  private ticksInState = 0;

  /** dir: sideways drift (1 - right, starts at the left side); offset in [0, ASTEROID_SPAWN_OFFSET_MAX] from that side. */
  constructor(
    readonly dir: -1 | 1,
    offset: number,
    readonly bonus: BonusKind,
  ) {
    this.x = dir === 1 ? offset : SCREEN_WIDTH - this.width - offset;
    this.y = -this.height;
  }

  get state(): AsteroidState {
    return this.currentState;
  }

  /** Ticks since entering the current state: 0 on the entry tick, +1 at the start of each update. */
  get stateTicks(): number {
    return this.ticksInState;
  }

  /** Tick rule as Enemy: count the tick, apply the timer, then act. gone: nothing. */
  update(dt: number): void {
    if (this.currentState === 'gone') return;
    this.ticksInState++;
    if (this.currentState === 'exploding') {
      if (this.ticksInState >= EXPLOSION_TICKS) this.enter('gone');
      return;
    }
    this.x += this.dir * ASTEROID_DRIFT_SPEED * dt;
    this.y += ASTEROID_FALL_SPEED * dt;
    if (this.y >= SCREEN_HEIGHT) this.enter('gone');
  }

  /** Only while flying: -> exploding in place, true; otherwise false, no effect. */
  hit(): boolean {
    if (this.currentState !== 'flying') return false;
    this.enter('exploding');
    return true;
  }

  private enter(state: AsteroidState): void {
    this.currentState = state;
    this.ticksInState = 0;
  }
}
```

Замечания:

- `width`/`height` — инициализаторы полей, не зависят от параметров; инициализируются до
  тела конструктора, поэтому `this.width` в теле валиден.
- Проверки `offset` на диапазон в дизайне нет — не добавлять.
- Полёт: старт `y = -12`, `y >= 240` на 252-м `update` → `gone`.

## 3. Поле бонусов

**Файл (создать):** `src/game/bonus-field.ts`

Импорты: `import type { Rng }` и `randomInt` из `../engine/rng`; `Asteroid`,
`ASTEROID_SPAWN_OFFSET_MAX` из `./asteroid`; `BONUS_KINDS` из `./bonus`.
Капсулы и `takeCapsule` нет (027).

```typescript
import type { Rng } from '../engine/rng';
import { randomInt } from '../engine/rng';
import { Asteroid, ASTEROID_SPAWN_OFFSET_MAX } from './asteroid';
import { BONUS_KINDS } from './bonus';

/** Earliest spawn tick, in 'playing' ticks of the level (5 s, В9). */
export const ASTEROID_SPAWN_MIN_TICKS = 300;
/** Latest spawn tick, inclusive (15 s, В9). */
export const ASTEROID_SPAWN_MAX_TICKS = 900;

/** Inclusive window of the spawn tick, in 'playing' ticks of the level. */
export interface SpawnWindow {
  readonly minTicks: number;
  readonly maxTicks: number;
}

/** 300...900 ticks (В9). The game always uses this one. */
export const ASTEROID_SPAWN_WINDOW: SpawnWindow = {
  minTicks: ASTEROID_SPAWN_MIN_TICKS,
  maxTicks: ASTEROID_SPAWN_MAX_TICKS,
};

/**
 * What bonus things are on the field: one asteroid per level at a random 'playing' tick.
 * Own rng; call order is fixed: startLevel - 1 call (spawn tick); spawn - dir, offset, bonus.
 */
export class BonusField {
  private current: Asteroid | null = null;
  private tick: number | null = null;
  private ticks = 0;

  /** spawnWindow defaults to ASTEROID_SPAWN_WINDOW; tests inject short ones. RangeError unless integers 1 <= min <= max. */
  constructor(
    private readonly rng: Rng,
    private readonly spawnWindow: SpawnWindow = ASTEROID_SPAWN_WINDOW,
  ) {
    const { minTicks, maxTicks } = spawnWindow;
    if (
      !Number.isInteger(minTicks) ||
      !Number.isInteger(maxTicks) ||
      minTicks < 1 ||
      minTicks > maxTicks
    ) {
      throw new RangeError(
        `Spawn window must be integers 1 <= min <= max, got ${minTicks}..${maxTicks}`,
      );
    }
  }

  get asteroid(): Asteroid | null {
    return this.current;
  }

  /** This level's spawn tick; null once spawned or before the first startLevel. For tests. */
  get spawnTick(): number | null {
    return this.tick;
  }

  /** Ticks of 'playing' counted in the current level. For tests. */
  get levelTicks(): number {
    return this.ticks;
  }

  /** A new level begins: draws its spawn tick; an unspawned asteroid of the last level is lost. A flying one stays. */
  startLevel(): void {
    this.ticks = 0;
    this.tick = randomInt(this.rng, this.spawnWindow.minTicks, this.spawnWindow.maxTicks + 1);
  }

  /**
   * Moves what is on the field and drops what is gone; then, only if spawning, counts the
   * level tick and spawns. A busy field delays the spawn (spawnTick kept, checked every
   * spawning update); since gone is dropped first, the new asteroid may appear in the very
   * update the old one leaves. The new asteroid does not move on its spawn tick.
   */
  update(dt: number, spawning: boolean): void {
    if (this.current) {
      this.current.update(dt);
      if (this.current.state === 'gone') this.current = null;
    }
    if (!spawning) return;
    this.ticks++;
    if (this.tick !== null && this.ticks >= this.tick && this.current === null) {
      this.current = this.spawn();
      this.tick = null;
    }
  }

  /** Hits the flying asteroid. True when it breaks; no asteroid / not flying - false. (Capsule - task 027.) */
  hitAsteroid(): boolean {
    return this.current?.hit() ?? false;
  }

  /** rng order: dir, offset, bonus. */
  private spawn(): Asteroid {
    const dir = this.rng() < 0.5 ? -1 : 1;
    const offset = randomInt(this.rng, 0, ASTEROID_SPAWN_OFFSET_MAX + 1);
    const bonus = BONUS_KINDS[randomInt(this.rng, 0, BONUS_KINDS.length)]!;
    return new Asteroid(dir, offset, bonus);
  }
}
```

Имена приватных полей (`current`, `tick`, `ticks`) — на усмотрение `/do`, лишь бы не
конфликтовали с геттерами. Длинные строки — Prettier переформатирует (`npm run format`).
`!` при индексации — из-за `noUncheckedIndexedAccess` (как `PEEL_SEGMENTS[...]!` в
`enemy.ts`).

## 4. Тесты

Все — Vitest, environment `node`, `dt = TICK_SECONDS`.

### 4.1 `src/game/score.test.ts` (изменить)

Существующие `describe('killPoints')` и `extra lives` **не трогать**. Добавить:

- `levelPoints`: таблица контрольных значений, совпадающих с таблицей `killPoints`
  (напр. `[30, 2, 30]`, `[30, 6, 50]`, `[60, 11, 120]`, `[50, 14, 120]`, `[100, 5, 140]`);
  уровень 1 возвращает базу (для всех баз из `ENEMY_POINTS` и `ASTEROID_POINTS`);
  `RangeError` на `0` и `1.5`.
- `levelPoints` и `killPoints` согласованы: для каждого вида/`inFlight`/уровня 1…30
  `killPoints(kill, l) === levelPoints(ENEMY_POINTS[kind].formation|flying, l)`.
- `ASTEROID_POINTS === 100`; `asteroidPoints(1) === 100`, `asteroidPoints(5) === 140`;
  кратно 10 и не убывает на 1…30; `RangeError` на `0`.

### 4.2 `src/game/asteroid.test.ts` (создать)

Хелпер `run(a, n)` — `n` раз `a.update(TICK_SECONDS)`.

- **Старт:** `new Asteroid(1, 0, 'life')` → `x = 0`, `y = -ASTEROID_SIZE`;
  `new Asteroid(1, 37, …)` → `x = 37`; `new Asteroid(-1, 0, …)` →
  `x = SCREEN_WIDTH - ASTEROID_SIZE`; `(-1, 37)` → `x = SCREEN_WIDTH - 12 - 37`;
  `width = height = ASTEROID_SIZE`; `state = 'flying'`, `stateTicks = 0`; `bonus`, `dir`
  сохранены.
- **Шаг:** один `update` — `x` на `+0.5` / `-0.5` по `dir`, `y` на `+1`; `stateTicks = 1`.
- **Скорости по правилу:** `isAllowedSpeed(ASTEROID_FALL_SPEED)` и
  `isAllowedSpeed(ASTEROID_DRIFT_SPEED)` — `true`.
- **Константы:** `ASTEROID_DRIFT_TOTAL === 126`, `ASTEROID_SPAWN_OFFSET_MAX === 118`, оба
  целые; и равны выражениям
  `(SCREEN_HEIGHT + ASTEROID_SIZE) * ASTEROID_DRIFT_SPEED / ASTEROID_FALL_SPEED` и
  `SCREEN_WIDTH - ASTEROID_SIZE - ASTEROID_DRIFT_TOTAL`.
- **Инвариант «весь полёт на экране»** (`it.each` по `dir ∈ {-1, 1}` ×
  `offset ∈ {0, ASTEROID_SPAWN_OFFSET_MAX}`): до `gone` после каждого `update`
  `0 <= x` и `x + width <= SCREEN_WIDTH` (проверять и в старте); для `(1, 118)` в
  последнем тике `x + width === SCREEN_WIDTH`, для `(-1, 118)` — `x === 0`.
- **Уход за низ:** число `update` до `gone` — ровно
  `SCREEN_HEIGHT + ASTEROID_SIZE` (252, выражение от констант): после 251 — `flying`,
  после 252-го — `gone`, `stateTicks = 0`.
- **Попадание:** через несколько тиков `hit()` → `true`, `state = 'exploding'`,
  `stateTicks = 0`; последующие `update` позицию не меняют; после `EXPLOSION_TICKS - 1`
  — ещё `exploding`, после `EXPLOSION_TICKS` — `gone`.
- **`hit()` вне `flying`:** в `exploding` и `gone` → `false`, состояние и `stateTicks` не
  меняются.
- **`gone` терминально:** `update` в `gone` не меняет `x`, `y`, `stateTicks`.
- **Инвариант пробоя:** `FAST_SHOT_SPEED * TICK_SECONDS + ASTEROID_FALL_SPEED *
TICK_SECONDS < SHOT_HEIGHT + ASTEROID_SIZE` (7 < 16) — от констант `shot.ts`.

Тест «`ASTEROID_SIZE` = размер спрайта» — **не здесь**, в 026.

### 4.3 `src/game/bonus-field.test.ts` (создать)

Заглушки `rng` (локально в файле):

```typescript
/** Returns the values in order, then throws: catches an unexpected extra call. */
function queued(...values: number[]): { rng: Rng; calls: () => number } {
  let calls = 0;
  return {
    rng: () => {
      const v = values[calls++];
      if (v === undefined) throw new Error(`unexpected rng call #${calls}`);
      return v;
    },
    calls: () => calls,
  };
}
/** Constant value, counts calls (as `counting` in attack-director.test.ts). */
function counting(v = 0.5): { rng: Rng; calls: () => number } {
  /* ... */
}
const ALMOST_ONE = 1 - 2 ** -53;
const step = (f: BonusField, spawning = true, n = 1) => {
  for (let i = 0; i < n; i++) f.update(TICK_SECONDS, spawning);
};
```

(Хелпер `step` с умолчанием — только в тесте; у `update` умолчания нет.)

Сценарии:

- **Константы:** `ASTEROID_SPAWN_WINDOW` = `{ minTicks: 300, maxTicks: 900 }` из
  `ASTEROID_SPAWN_MIN/MAX_TICKS`.
- **Без `startLevel`:** конструктор не вызывает `rng` (`calls() === 0`); 1000 `update`
  с `spawning = true` — `asteroid === null`, `spawnTick === null`, `rng` не вызывался.
- **Окно по умолчанию, края:** `startLevel` с `rng = 0` → `spawnTick === 300`; с
  `ALMOST_ONE` → `900`; ровно 1 вызов `rng`; `levelTicks === 0`.
- **Момент появления:** `queued(0, …)` (тик 300) → после 299 `update` — нет, `levelTicks
=== 299`; 300-й — астероид есть, `y === -ASTEROID_SIZE` (не сдвинут), `state =
'flying'`, `spawnTick === null`; дальше до 900+ тиков второго не появляется (тот же
  объект, потом `null`), `rng` больше не вызывается.
- **Порядок `rng` при появлении** (окно 1…1): `queued(0, 0.25, 0, 0.5)` → `startLevel`,
  `update` → `dir = -1`, `x = SCREEN_WIDTH - 12 - 0`, `bonus = BONUS_KINDS[1]`
  (`'fastShot'`); `queued(0, 0.75, ALMOST_ONE, ALMOST_ONE)` → `dir = 1`, `x = 118`,
  `bonus = 'doubleShot'`; ровно 4 вызова. (`randomInt(rng, 1, 2)` всегда 1 — первое
  значение любое.)
- **`spawning = false`:** `levelTicks` стоит, появления нет даже при `levelTicks`
  у порога; летящий астероид продолжает двигаться (`y` растёт).
- **`startLevel` до появления:** `queued(ALMOST_ONE, 0)` → `spawnTick 900`, 100
  `update`, `startLevel` → `spawnTick === 300`, `levelTicks === 0`; появление — через 300
  `update` после второго `startLevel` (на «прошлом уровне» астероида не было).
- **Зачищен раньше:** `startLevel` (тик 900), 500 `update`, `startLevel` — астероида не
  было ни в одном тике до второго `startLevel`.
- **Летящий переживает `startLevel`:** окно 1…1, появился A, `startLevel` →
  `asteroid === A`, состояние и позиция те же.
- **Отложенное появление — полёт** (окно 1…1, `counting(0.5)` или `queued`): `startLevel`,
  `update` → A; `startLevel` (`spawnTick === 1`); цикл `update`: пока после `update`
  `A.state !== 'gone'` — `asteroid === A`, `spawnTick === 1`; в `update`, где A стал
  `gone`, — `asteroid` новый B (`!== A`), `B.y === -ASTEROID_SIZE`, `spawnTick === null`.
  Проверить, что это случилось ровно на `SCREEN_HEIGHT + ASTEROID_SIZE`-м `update`
  после второго `startLevel` и что `rng` для B вызван только в этом `update` (счётчик до
  него не рос).
- **Отложенное появление — взрыв:** окно 1…1, A появился, `hitAsteroid()` → `true`,
  `startLevel`; `EXPLOSION_TICKS - 1` `update` — `asteroid === A` (`exploding`),
  следующий — B.
- **Отложенное появление при `spawning = false`:** окно 1…1, A, `startLevel`; `update(…,
false)` до ухода A → `asteroid === null`, `spawnTick === 1`, `levelTicks === 0`; ещё
  несколько `update(…, false)` — пусто; первый `update(…, true)` — B.
- **`startLevel` во время ожидания:** окно 1…1, A летит (поле занято, `spawnTick === 1`
  после второго `startLevel`); третий `startLevel` → ровно +1 вызов `rng`,
  `levelTicks === 0`, `spawnTick === 1` (вытянут заново), `asteroid === A`.
- **Неверное окно → `RangeError`:** `{0, 5}`, `{1.5, 5}`, `{1, 5.5}`, `{6, 5}`; верные
  `{1, 1}` и умолчание — без исключения.
- **`hitAsteroid`:** без астероида — `false`; по `flying` — `true`, `asteroid.state ===
'exploding'`; повторно — `false`; после `EXPLOSION_TICKS` `update` — `asteroid ===
null`.
- **Уход за низ:** без попадания астероид убирается (`asteroid === null`) в `update`, где
  стал `gone`.
- **Детерминизм:** два поля `new BonusField(createRng(seed))` (окно по умолчанию), одна
  и та же последовательность (`startLevel`, 900 `update`) — одинаковые `spawnTick` до
  появления, затем одинаковые `dir`, `x`, `bonus`, тик появления; для 2–3 seed.

## 5. Ручная проверка

Глазами проверять нечего — в игру не встроено. Достаточно убедиться (`npm run dev`), что
игра выглядит и играется как раньше: очки за врагов прежние (1-й уровень — 920 за весь
строй на месте).

## 6. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md` — только пункт `score.ts`
(строки 215–222). Новое начало пункта (остальное про доп. жизни — без изменений):

```markdown
- `score.ts` — очки без состояния: `KindPoints { formation, flying }`, `ENEMY_POINTS`
  (В1: `drone` 30/60, `striker` 40/80, `raider` 50/100); `levelPoints(base, level)` —
  целочисленная формула `floor((base × (9 + level) + 50) / 100) × 10` (+10 % за уровень
  выше первого, к ближайшим 10, половина вверх, без потолка; В2), `RangeError` на уровне
  не целом ≥ 1; `killPoints(kill, level)` — `levelPoints` от `ENEMY_POINTS` вида
  (`formation` / `flying`); `ASTEROID_POINTS = 100`, `asteroidPoints(level)` —
  `levelPoints(ASTEROID_POINTS, level)` (фича 006, В7: 1-й уровень 100, 5-й 140).
  Доп. жизни (В4): ...
```

Описание `asteroid.ts` / `bonus-field.ts` и `BONUS_FALLBACK_POINTS` в `overview.md` —
**не здесь**, в 027 (решение архитектора, `discussion.md`, п. 4). `README.md` в
`src/game/` нет. `game-design.md` не меняется (механики уже описаны фичей).

## Сводка по файлам

| Действие | Файл                                                       |
| -------- | ---------------------------------------------------------- |
| Изменить | `src/game/score.ts`                                        |
| Изменить | `src/game/score.test.ts`                                   |
| Создать  | `src/game/asteroid.ts`                                     |
| Создать  | `src/game/asteroid.test.ts`                                |
| Создать  | `src/game/bonus-field.ts`                                  |
| Создать  | `src/game/bonus-field.test.ts`                             |
| Изменить | `second-brain/architecture/overview.md` (пункт `score.ts`) |

Не трогать: `battle.ts`, сцены, рендер, HUD, `collisions.ts`, `second-brain/features/`.

Проверки: `npm run format:check`, `lint`, `typecheck`, `test`, `build`.

## Архитектура и паттерны

- Логика без canvas; движение через `dt`, таймеры (`stateTicks`, взрыв, `levelTicks`) — в
  тиках (ADR 003); шаг ½ px/тик точен при `dt = TICK_SECONDS` (проверено: 252 шага дают
  ровно 126).
- Случайность — только собственный `rng` поля, порядок вызовов фиксирован
  (`startLevel`: тик; появление: `dir → offset → bonus`); `rng` боя не затрагивается.
- Автомат `Asteroid` — по образцу `Enemy` (`enter`, `ticksInState`, правило «`++` →
  таймер → поведение»).
- Окно появления — необязательный параметр только для тестов, по образцу
  `BattleOptions.levels`; игра всегда использует `ASTEROID_SPAWN_WINDOW`.
- Константы `ASTEROID_DRIFT_TOTAL` / `ASTEROID_SPAWN_OFFSET_MAX` — выражения, не литералы.
- `import type` для `Rng`, `BonusKind`; `engine/` не трогается.

## Открытые вопросы

Нет. Вопросы analyze закрыты архитектором (`second-brain/features/006-asteroid-bonuses/discussion.md`,
«Реализация: задача 025-asteroid-model»): 1 — окно появления `SpawnWindow` в конструкторе
(вариант (а)); 2 — тест «размер = спрайт» в 026; 3 — `BONUS_FALLBACK_POINTS` в 027;
4 — пункт `score.ts` в `overview.md` правится здесь (шаг 6).

## Ссылки

- `second-brain/tasks/tasks/025-asteroid-model/analyze.md`, `description.md`
- CLAUDE.md
- `second-brain/features/006-asteroid-bonuses/design.md` (Asteroid, BonusField, Интерфейсы, Тестирование, нарезка 2а)
- `second-brain/features/006-asteroid-bonuses/discussion.md` («Реализация: задача 025-asteroid-model»)
- `second-brain/decisions/002-integer-speeds.md`, `003-slow-speeds-tick-timers.md`
- `src/game/enemy.ts` (образец автомата), `src/game/score.ts`, `src/game/bonus.ts`,
  `src/engine/rng.ts`, `src/game/levels.ts` (`isAllowedSpeed`), `src/game/shot.ts`,
  `src/game/attack-director.test.ts` (заглушка `counting`)
