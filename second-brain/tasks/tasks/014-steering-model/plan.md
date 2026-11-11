# План реализации: Модель руления пикирующих врагов

Боковое движение врага в фазе `descend` переводится с `Aim = 'fixed' | 'track'` на единую
модель «переприцеливание → желаемая скорость → инерция → сдвиг» в новом чистом модуле
`src/game/steering.ts`; у каждого вида в `ENEMY_KINDS` — профиль `steer: SteerSpec`. Профили
воспроизводят текущее поведение (`drone {null, 0, 1}`, `striker {1, 0, 1}`,
`raider {null, 0, 1}`), в игре ничего не меняется. Рамка — `design.md` фичи 003 (раунд 2,
пункт 1 нарезки) и `analyze.md` этой задачи.

Код на момент плана: ветка `feature/003-enemy-flight`, коммит `cfc9e12`.

## 1. Модуль руления

**Файл (создать):** `src/game/steering.ts`

Без импортов. Типы и сигнатуры — дословно из `design.md` («Интерфейсы»), правила `turn` —
«Правила тика descend», п. 3.

```typescript
/**
 * Lateral steering of a diver in 'descend' (pure, no imports). One model for every kind;
 * kinds differ only by their SteerSpec (ENEMY_KINDS[kind].steer).
 */

/** Lateral steering profile of a diver in 'descend'. */
export interface SteerSpec {
  /** Aim is taken on descend ticks 1, 1 + N, 1 + 2N, ...; null - only on tick 1. Whole >= 1. */
  readonly retargetTicks: number | null;
  /** Ticks per 1 px/tick change of vx (inertia); 0 - vx jumps to the desired value. Whole >= 0. */
  readonly turnTicks: number;
  /** Max |vx|, whole px PER TICK (no dt) >= 1, below the ship's speed. */
  readonly maxVx: number;
}

export interface SteerState {
  /** Lateral speed, whole px PER TICK (no dt). */
  readonly vx: number;
  /** Ticks accumulated towards the next inertia step. */
  readonly turnCounter: number;
}

/** Whether the aim is taken on this descend tick. descendTick is 1-based. */
export function isRetargetTick(descendTick: number, retargetTicks: number | null): boolean {
  if (retargetTicks === null) return descendTick === 1;
  return (descendTick - 1) % retargetTicks === 0;
}

/**
 * sign(aimX - centerX) * maxVx when the gap is >= 1 px; 0 otherwise or when aimX is null
 * (no jitter over the target, also with a fractional center).
 */
export function desiredVx(centerX: number, aimX: number | null, maxVx: number): number {
  if (aimX === null) return 0;
  const gap = aimX - centerX;
  return Math.abs(gap) >= 1 ? Math.sign(gap) * maxVx : 0;
}

/**
 * One inertia step towards desired. turnTicks = 0: vx = desired at once. Otherwise vx moves by
 * 1 px/tick every turnTicks ticks; reaching desired resets the counter, a change of desired
 * mid-way does not.
 */
export function turn(state: SteerState, desired: number, turnTicks: number): SteerState {
  if (turnTicks === 0) return { vx: desired, turnCounter: 0 };
  if (state.vx === desired) return { vx: state.vx, turnCounter: 0 };
  const turnCounter = state.turnCounter + 1;
  if (turnCounter < turnTicks) return { vx: state.vx, turnCounter };
  return { vx: state.vx + Math.sign(desired - state.vx), turnCounter: 0 };
}
```

Замечание: `desiredVx` при `maxVx = 1` совпадает с нынешним `steerStep(centerX, aimX, 1)`
(`enemy.ts:309-313`) — порог `>= 1` тот же, что `>= step` при `step = 1`.

## 2. `ENEMY_KINDS` и константы

**Файл (изменить):** `src/game/enemy.ts`

- Удалить `export type Aim` (`:8-9`).
- Импорты: `import type { SteerSpec } from './steering';` и
  `import { desiredVx, isRetargetTick, turn } from './steering';` (линтер требует
  `import type` для типа — две строки).
- `EnemyKindSpec`: `readonly steer: SteerSpec` вместо `aim`.
- Профили (констант `DRONE_RETARGET_TICKS` / `STRIKER_TURN_TICKS` в 014 нет — появятся в
  015/016):

```typescript
/** Per-kind data. steer: lateral steering in 'descend' (see steering.ts). */
export interface EnemyKindSpec {
  readonly sprite: Sprite;
  readonly steer: SteerSpec;
}

export const ENEMY_KINDS: Readonly<Record<EnemyKind, EnemyKindSpec>> = {
  // Aims once, on the first descend tick.
  drone: { sprite: DRONE_SPRITE, steer: { retargetTicks: null, turnTicks: 0, maxVx: 1 } },
  // Re-aims every tick, no inertia.
  striker: { sprite: STRIKER_SPRITE, steer: { retargetTicks: 1, turnTicks: 0, maxVx: 1 } },
  // Aims once, on the first descend tick (group anchor + aimOffsetX).
  raider: { sprite: RAIDER_SPRITE, steer: { retargetTicks: null, turnTicks: 0, maxVx: 1 } },
};
```

- Комментарий `STEER_SPEED` (`:31-34`) — теперь только `returning`:

```typescript
/**
 * Horizontal speed of 'returning', px/s (1 px/tick). 'descend' steers by
 * ENEMY_KINDS[kind].steer.maxVx (px/tick) instead.
 */
export const STEER_SPEED = 60;
```

- Рядом с `PEEL_TICKS` (`:57`) — private-константа vx последнего отрезка дуги:

```typescript
/** vx of the last peel leg (side = +1): 'descend' starts by continuing it. */
const LAST_PEEL_VX = PEEL_SEGMENTS[PEEL_SEGMENTS.length - 1]!.vx;
```

## 3. Состояние вылета и геттер `vx`

**Файл (изменить):** `src/game/enemy.ts`

- Поле `private readonly aim: Aim` → `private readonly steer: SteerSpec`; в конструкторе
  `const { sprite, steer } = ENEMY_KINDS[slot.kind]; … this.steer = steer;`.
- `fixedAimX` → три поля (сброс **только** в `startDive`):

```typescript
  /** Current aim of this descend (anchor + aimOffsetX, see aimFor()); null - none yet / no target. */
  private aimX: number | null = null;
  /** Lateral speed of 'descend', whole px PER TICK (no dt). Read through the vx getter. */
  private steerVx = 0;
  /** Ticks accumulated towards the next inertia step (see steering.turn). */
  private turnCounter = 0;
```

- `startDive`: вместо `this.fixedAimX = null;` —
  `this.aimX = null; this.steerVx = 0; this.turnCounter = 0;`.
- Публичный геттер (после `isOut`):

```typescript
  /**
   * Lateral speed of 'descend', whole px/tick; 0 outside 'descend'. Derived from the state, so
   * kill(), leaving past the bottom etc. need not reset steerVx.
   */
  get vx(): number {
    return this.isDescending ? this.steerVx : 0;
  }

  private get isDescending(): boolean {
    return this.currentState === 'diving' && this.ticksInState > PEEL_TICKS;
  }
```

`isDescending` использовать и в `updateDiving` (вместо `this.ticksInState <= PEEL_TICKS`
— по желанию, поведение то же) и в последней строке `return this.isDescending && this.fires()`.

## 4. Тик `descend`

**Файл (изменить):** `src/game/enemy.ts`

`updateDiving` (`:211-231`): peel оставляет свой зажим, ветка `descend` выносится в
`private descend(dt, env)` по правилам 1–6 дизайна. Уход за низ и `fires()` — без изменений.

```typescript
  /**
   * Ticks 1..PEEL_TICKS: peel segment by stateTicks. Then descend (see descend()) and fire by
   * the schedule (see fires()). Leaving past the bottom ends the descend without a shot.
   */
  private updateDiving(dt: number, env: EnemyEnv): boolean {
    if (this.ticksInState <= PEEL_TICKS) {
      const segment = peelSegmentAt(this.ticksInState);
      this.x = clamp(this.x + segment.vx * this.side, 0, SCREEN_WIDTH - this.width);
      this.y += segment.vy;
    } else {
      this.descend(dt, env);
    }
    if (this.y >= SCREEN_HEIGHT) {
      // Gone past the bottom: reappear right above the current slot.
      this.enter('returning');
      this.x = this.slotX();
      this.y = -this.height;
      return false;
    }
    return this.isDescending && this.fires();
  }

  /**
   * One 'descend' tick (d = stateTicks - PEEL_TICKS, 1-based), profile ENEMY_KINDS[kind].steer:
   * d = 1 - vx continues the peel arc; on retarget ticks the aim is taken anew (aimFor());
   * vx turns towards the desired value (steering.turn); x moves by vx px PER TICK (no dt,
   * ADR 003), y by diveSpeed * dt. x stays on screen; hitting an edge zeroes vx into it.
   */
  private descend(dt: number, env: EnemyEnv): void {
    const { retargetTicks, turnTicks, maxVx } = this.steer;
    const d = this.ticksInState - PEEL_TICKS;
    if (d === 1) {
      this.steerVx = clamp(LAST_PEEL_VX * this.side, -maxVx, maxVx);
      this.turnCounter = 0;
    }
    if (isRetargetTick(d, retargetTicks)) this.aimX = this.aimFor(env.targetX);
    const desired = desiredVx(this.x + Math.floor(this.width / 2), this.aimX, maxVx);
    const next = turn({ vx: this.steerVx, turnCounter: this.turnCounter }, desired, turnTicks);
    this.steerVx = next.vx;
    this.turnCounter = next.turnCounter;
    const maxX = SCREEN_WIDTH - this.width;
    const x = this.x + this.steerVx;
    this.x = clamp(x, 0, maxX);
    if ((x < 0 && this.steerVx < 0) || (x > maxX && this.steerVx > 0)) {
      this.steerVx = 0;
      this.turnCounter = 0;
    }
    this.y += env.diveSpeed * dt;
  }
```

- `fixedAim` → `aimFor` (тело без изменений), комментарий: «Aim for this descend tick (every
  kind): the ship's center X as the group's anchor, clamped …; a solo diver (offsets 0) is
  never clamped by it».
- Удалить `steerStep` (`:305-313`).
- Комментарий класса (`:96-100`): заменить строки про `aim`/`fixed` на
  «In 'descend' the enemy steers on X by its kind's profile (ENEMY_KINDS[kind].steer, see
  steering.ts): aim = anchor + aimOffsetX (aimFor()), lateral speed vx in whole px per tick.»

**Почему поведение не меняется:** `dt = TICK_SECONDS` везде (`STEER_SPEED · dt = 1 = maxVx`);
при `turnTicks = 0` `turn` перезаписывает `vx` из п. 1 и обнуление у стены не переносится на
следующий тик; `striker` через `aimFor` получает цель в `[6, 249]` — тестовые цели 0/255
дают те же `x` (проверено в `analyze.md`). Обнуление у стены при одиночных врагах в игре не
срабатывает вовсе: `aimFor` держит цель там, куда центр спрайта может дойти, поэтому gap ≥ 1
не толкает `x` за край.

## 5. Тесты модуля руления

**Файл (создать):** `src/game/steering.test.ts` (Vitest, environment `node`)

Произвольные профили, не зависят от чисел `ENEMY_KINDS`.

- `isRetargetTick`:
  - `null`: `true` на тике 1, `false` на 2, 30, 31, 100;
  - `1`: `true` на тиках 1…10;
  - `30`: `true` на 1, 31, 61; `false` на 2, 30, 32, 60.
- `desiredVx`:
  - `aimX = null` → 0;
  - дробный центр, gap < 1: `(132.75, 133, 1)` → 0, `(133.25, 133, 1)` → 0, `(133, 133, 1)` → 0;
  - gap ≥ 1: `(100, 101, 1)` → 1, `(100, 99, 1)` → −1, `(132.75, 134, 1)` → 1;
  - `maxVx > 1`: `(100, 150, 2)` → 2, `(100, 50, 2)` → −2.
- `turn`:
  - `turnTicks = 0`: из `{vx: 1, turnCounter: 3}` к `−1` → `{−1, 0}`; к `0` → `{0, 0}`;
  - раскладка разворота, `T = 4` и `T = 8` (`it.each`): от `{1, 0}` при `desired = −1` прогнать
    `3T` тиков, записать `vx` после каждого; тики 1…T−1 — `+1`, T…2T−1 — `0`, с 2T — `−1`;
  - смена `desired` не сбрасывает счётчик: `T = 4`, от `{0, 0}` два тика с `desired = 1`
    (`{0, 2}`), затем два тика с `desired = −1` → после 4-го `{−1, 0}`;
  - `vx === desired` сбрасывает: `{1, 3}`, `desired = 1`, `T = 4` → `{1, 0}`;
  - шаг ±1 и при `maxVx > 1`: `{0, 0}`, `desired = 2`, `T = 1` → `vx` 1, затем 2, затем 2.

```typescript
import { describe, expect, it } from 'vitest';
import type { SteerState } from './steering';
import { desiredVx, isRetargetTick, turn } from './steering';

function run(state: SteerState, desired: number, turnTicks: number, n: number): number[] {
  const vxs: number[] = [];
  for (let i = 0; i < n; i++) {
    state = turn(state, desired, turnTicks);
    vxs.push(state.vx);
  }
  return vxs;
}
```

Сценарий уходимости (контроль `T = 0` против `T = 8`) — **не в 014**, это 016.

## 6. Тесты `Enemy`

**Файл (изменить):** `src/game/enemy.test.ts`

- **Заменить** «drone and raider aim once, striker tracks» (`:447-451`) на тест профилей:

```typescript
it('kind profiles reproduce the old aim: drone and raider aim once, striker every tick', () => {
  expect(ENEMY_KINDS.drone.steer).toEqual({ retargetTicks: null, turnTicks: 0, maxVx: 1 });
  expect(ENEMY_KINDS.striker.steer).toEqual({ retargetTicks: 1, turnTicks: 0, maxVx: 1 });
  expect(ENEMY_KINDS.raider.steer).toEqual({ retargetTicks: null, turnTicks: 0, maxVx: 1 });
});
```

- **Заменить** «track does not read the group offsets» (`:820-832`) на «every kind reads the
  group offsets» (решение: вариант 1 из «Открытых вопросов» `analyze.md`). `striker` с
  `aimOffsetX = 32` (`groupMax 32`) целится в `target + 32` и идёт тик в тик с обычным
  `striker`, которому подают `target + 32`; цель меняется посреди пике (переприцеливание
  каждый тик сохраняет сдвиг):

```typescript
it('every kind reads the group offsets: a striker aims at the target plus its offset', () => {
  const plain = afterPeel('striker');
  const { enemy: offset } = newEnemyOf('striker');
  offset.startDive(diveOrder({ aimOffsetX: 32, groupMinOffsetX: 0, groupMaxOffsetX: 32 }));
  step(offset, P);
  expect(offset.x).toBe(plain.x);
  for (let i = 0; i < 60; i++) {
    const target = i < 30 ? 60 : 150;
    step(plain, 1, aimAt(target + 32));
    step(offset, 1, aimAt(target));
    expect(offset.x).toBe(plain.x);
  }
  expect(centerX(offset)).toBe(133);
  expect(offset.state).toBe('diving');
});
```

Проверка по числам: после дуги `x = 127` (центр 133), за 30 тиков к 92 → `x = 97` (центр
103), затем к 182 — за 30 тиков `x = 127` (центр 133). Якорь не зажат: `lo = 6`,
`hi = 256 − 13 + 6 − 32 = 217`, цели 60 и 150 внутри. В `do` — убедиться, что в последнем
тике враг ещё в `descend` (последняя проверка теста); при `diveSpeed 60` и старте из
ряда 1 до низа > 150 тиков.

- **Добавить** `describe('Enemy vx')`:
  - 0 в `formation` (новый враг) и на всех тиках дуги (`step(enemy, 1)` × `P`, после
    каждого `expect(enemy.vx).toBe(0)`, хотя `x` меняется);
  - в `descend` равен фактическому сдвигу `x` за тик: `striker` после дуги, по 5 тиков с
    `aimAt(0)` (`vx = −1`, `x − 1`), `aimAt(250)` (`vx = 1`, `x + 1`), `aimAt(null)`
    (`vx = 0`, `x` стоит); на каждом тике `expect(enemy.x - x).toBe(enemy.vx)`;
  - 0 после ухода за низ (`returning`) и после `kill()` в `descend` (`exploding`), хотя перед
    этим `vx = −1` — проверяет «геттер от состояния»;
  - **упор в край обнуляет `vx`** (решение: вариант 2 из «Открытых вопросов» `analyze.md` —
    проверка в 014 через геттер). С согласованным заказом одиночки до стены не доходят (см.
    шаг 4), поэтому в тесте нарочно несогласованный заказ — цель за краем экрана:
    `diveOrder({ aimOffsetX: 32 })` (`groupMaxOffsetX` по умолчанию 0) → у `striker`
    `aimFor(240) = 240 + 32 = 272`.

```typescript
it('hitting the screen edge zeroes vx into the wall', () => {
  const { enemy } = newEnemyOf('striker');
  // An inconsistent order (offset without the group range) aims past the right edge.
  enemy.startDive(diveOrder({ aimOffsetX: 32 }));
  step(enemy, P);
  const maxX = SCREEN_WIDTH - enemy.width;
  enemy.x = maxX - 3;
  for (let i = 1; i <= 3; i++) {
    step(enemy, 1, aimAt(240));
    expect(enemy.x).toBe(maxX - 3 + i);
    expect(enemy.vx).toBe(1);
  }
  for (let i = 0; i < 5; i++) {
    step(enemy, 1, aimAt(240));
    expect(enemy.x).toBe(maxX);
    expect(enemy.vx).toBe(0);
  }
});
```

Зеркальный случай слева: `aimOffsetX: −32` (`groupMinOffsetX` по умолчанию 0), цель 10 →
`aimFor = clamp(10, 6, 249) − 32 = −22`; `enemy.x = 3`, три тика `vx = −1` (`x` 2, 1, 0),
затем `x = 0`, `vx = 0`. Оформить оба края одним `it.each` (`[offset, target, startX,
  dir, edgeX]`).

- Остальные тесты «Enemy aim» и «Enemy group aim» — **без правок** (это и есть проверка
  «поведение не изменилось»). Сброс состояния вылета уже покрыт «fixed does not reuse the
  target of the previous sortie». Названия тестов со словами `fixed`/`track` в 014 не
  трогать (переносятся/переименовываются в 015/016).

## 7. Инварианты профилей

**Файл (изменить):** `src/game/levels.test.ts`

- Импорт: `import { SHIP_HEIGHT, SHIP_SPEED } from './ship';`.
- Новый `describe` (рядом с `ENEMY_KINDS`-проверками или после `LEVELS`):

```typescript
describe('ENEMY_KINDS steer', () => {
  it.each(Object.entries(ENEMY_KINDS))(
    '%s steers by whole px per tick, slower than the ship',
    (_kind, { steer }) => {
      expect(Number.isInteger(steer.maxVx)).toBe(true);
      expect(steer.maxVx).toBeGreaterThanOrEqual(1);
      expect(steer.maxVx).toBeLessThan(SHIP_SPEED * TICK_SECONDS);
      if (steer.retargetTicks !== null) {
        expect(Number.isInteger(steer.retargetTicks)).toBe(true);
        expect(steer.retargetTicks).toBeGreaterThanOrEqual(1);
      }
      expect(Number.isInteger(steer.turnTicks)).toBe(true);
      expect(steer.turnTicks).toBeGreaterThanOrEqual(0);
    },
  );
});
```

Инвариант `swaySpeed < STEER_SPEED` (`:127`) и туннелирование — без изменений.

## 8. Ручная проверка

`npm run dev`, уровни `?level=1` … `?level=5`: игра выглядит как до задачи — `drone` летит
к точке, где был корабль в начале пике, и дальше прямо; `striker` ведёт корабль без
задержки, 1 px/тик; группы `raider` (уровни 4–5) идут строем, у края сдвигаются целиком.

Перед этим: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build`.

## 9. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md`

- Новый пункт перед `enemy.ts`: «`steering.ts` — чистые функции боковой рулёжки `descend`,
  без импортов: `SteerSpec { retargetTicks, turnTicks, maxVx }` (профиль вида),
  `SteerState { vx, turnCounter }`, `isRetargetTick(d, N)` (тики 1, 1+N, …; `null` — только
  1-й), `desiredVx(centerX, aimX, maxVx)` (`±maxVx` при gap ≥ 1, иначе 0), `turn(state,
desired, T)` (инерция: `vx` меняется на 1 px/тик за `T` тиков; `T = 0` — сразу).»
- Пункт `enemy.ts`: `ENEMY_KINDS { sprite, steer }` вместо `{ sprite, aim }` и `Aim`;
  профили `drone {null, 0, 1}`, `striker {1, 0, 1}`, `raider {null, 0, 1}`; descend —
  правила тика (продолжение `vx` дуги в 1-м тике, переприцеливание `aimFor` — якорь с зажимом
  группы + `aimOffsetX` для всех видов, `desiredVx` → `turn`, `x += vx` px/тик без `dt`,
  `y += diveSpeed · dt`, зажим `x` в экран и обнуление `vx` в стену); состояние вылета
  `aimX`/`steerVx`/`turnCounter` сбрасывается только в `startDive`; геттер `vx` — от
  состояния (0 вне `descend`). Убрать «`track` поля группы не читает» и «`STEER_SPEED` — и в
  descend, и в `returning`» → «`STEER_SPEED` — шаг X только в `returning`».
- Граф импортов: `enemy → {config, enemy-art, ship, steering}` (`Formation`, `EnemyKind`,
  `Slot`, `Sprite`, `SteerSpec` — type); добавить «`steering` — без импортов».
- «Принципы», пункт про скорости: добавить «X в `descend` — целые px/тик без `dt` (как
  `PEEL_SEGMENTS`; допустимо, `dt` фиксирован — ADR 003)».

`game-design.md` в 014 не меняется (поведение то же; описание модели — в 015/016).
`README.md` в `src/` нет.

## Сводка по файлам

| Действие | Файл                                    |
| -------- | --------------------------------------- |
| Создать  | `src/game/steering.ts`                  |
| Создать  | `src/game/steering.test.ts`             |
| Изменить | `src/game/enemy.ts`                     |
| Изменить | `src/game/enemy.test.ts`                |
| Изменить | `src/game/levels.test.ts`               |
| Изменить | `second-brain/architecture/overview.md` |

Не меняются: `wave.ts`, `wave.test.ts`, `battle.ts`, `battle.test.ts`, `attack-director.ts`,
`levels.ts`, `collisions.ts`, рендер, `game-design.md` (их правки — 015/016 по дизайну).

## Архитектура и паттерны

- `steering.ts` — чистые функции без импортов и без состояния: тестируются отдельно на
  произвольных профилях; граф импортов получает одно ребро `enemy → steering`, циклов нет.
- Логика отдельно от рендера: `drawBattle` по-прежнему рисует по `Math.floor(x)`.
- Детерминизм: `Rng` не нужен; время — тики `stateTicks` и `dt` для вертикали. X в
  `descend` — целые px/тик без `dt` (ADR 002/003, как `PEEL_SEGMENTS`).
- Состояние вылета сбрасывается только в `startDive`; публичный `vx` выводится из
  состояния, поэтому `kill()`/`enter()` ничего не обнуляют.
- `import type` для `SteerSpec`/`SteerState`; комментарии в коде — на английском.

## Открытые вопросы

Вопросов к владельцу нет. Уточнения из `analyze.md` решены (указание при запуске плана):

1. «track does not read the group offsets» заменяется тестом «every kind reads the group
   offsets» (`striker` с `aimOffsetX = 32` целится в `target + 32`) — шаг 6.
2. Обнуление `vx` у стены проверяется в 014 через геттер `vx` — шаг 6; поскольку при
   согласованном заказе одиночка до стены не доходит, тест использует несогласованный заказ
   (сдвиг без диапазона группы → цель за краем).

## Ссылки

- `second-brain/tasks/tasks/014-steering-model/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/003-enemy-flight/design.md` (раунд 2), `discussion.md`, `dev-review.md`
- `second-brain/architecture/overview.md`
- `second-brain/decisions/002-integer-speeds.md`, `003-slow-speeds-tick-timers.md`
- `src/game/enemy.ts`, `src/game/enemy.test.ts`, `src/game/levels.test.ts`, `src/game/ship.ts`
