# План реализации: Инерция striker

`striker` по-прежнему берёт цель каждый тик, но боковая скорость меняется с инерцией
`STRIKER_TURN_TICKS = 8` (1 px/тик за 8 тиков): после дуги он продолжает её боковой ход, на
развороте корабля проскакивает, «стоит» по X и только потом догоняет. Модель (`steering.ts`,
`descend`) уже есть с 014 — в коде меняются константа и профиль, основная работа — тесты:
механические проверки уезжают со `striker` на `drone`/`raider`/`steering.test.ts`, на
`striker` появляются тесты инерции и сценарий уходимости.

**Вопросы `analyze.md` (пп. 1–5) закрыты архитектором** — `second-brain/features/003-enemy-flight/discussion.md`,
раздел «Реализация: задача 016-striker-inertia»; `design.md` («Тестирование») обновлён. План
следует этим ответам. Правки идут поверх незакоммиченного текста 015 (тест профилей,
«Пикирование» в `game-design.md`, `overview.md`, комментарий `battle.ts`).

Все числа ниже проверены прогоном настоящих `Enemy`/`Wave`/`Battle` с `turnTicks: 8` и
черновиков тестов этого плана в копии дерева (scratchpad); `src/` проекта не менялся.

## 1. Константа и профиль `striker`

**Файл (изменить):** `src/game/enemy.ts`

Рядом с `DRONE_RETARGET_TICKS` добавить константу, профиль `striker` — через неё, комментарий
профиля переписать. Логику `descend` и `turn` не трогать.

```typescript
/**
 * Striker inertia in 'descend', ticks per 1 px/tick change of vx: a reversal takes
 * T - 1 ticks on the old course, T ticks with vx = 0, then the new course. Approved by the
 * owner (feature 003, Q2).
 */
export const STRIKER_TURN_TICKS = 8;

export const ENEMY_KINDS: Readonly<Record<EnemyKind, EnemyKindSpec>> = {
  // ... drone unchanged
  // Re-aims every tick, turns with inertia: overshoots a reversing ship, can be shaken off by a feint.
  striker: {
    sprite: STRIKER_SPRITE,
    steer: { retargetTicks: 1, turnTicks: STRIKER_TURN_TICKS, maxVx: 1 },
  },
  // ... raider unchanged
};
```

## 2. Комментарий о `null`-цели в бою

**Файл (изменить):** `src/game/battle.ts` (`update`, строки 64–65)

Часть про `drone` (её писала 015) оставить, часть про `striker` переписать:

```typescript
// No target while the ship is down: strikers shed their lateral speed within
// STRIKER_TURN_TICKS ticks and then fly straight down; drones stop steering until a
// re-aim tick finds the ship again.
```

## 3. Общий сценарий уходимости для тестов

**Файл (создать):** `src/game/test-evasion.ts` — только для тестов (как `test-levels.ts`).

Нужен потому, что одна таблица `{ diveSpeed, turnY }` и один скрипт корабля используются и в
`enemy.test.ts` (настоящий `Enemy`), и в `steering.test.ts` (мини-симуляция с `T = 0` / `T = 8`)
— решение архитектора, п. 5. Импорт `overlaps` и `SHIP_*` — только здесь и в тестах,
`steering.ts` остаётся без импортов.

```typescript
import { TICK_SECONDS } from '../config';
import type { Rect } from './collisions';
import { overlaps } from './collisions';
import { SHIP_HEIGHT, SHIP_SPEED, SHIP_WIDTH, SHIP_Y } from './ship';

/**
 * Test-only evasion scenario of a striker (feature 003, task 016). Import from *.test.ts only.
 * turnY - the diver's y at which the feinting ship reverses: the middle of the window
 * "T = 8 escapes, T = 0 rams" (180 px/s: 120..130, 120 px/s: 130..140). One height for both
 * speeds gives no window.
 */
export const EVASION_CASES = [
  { diveSpeed: 180, turnY: 125 },
  { diveSpeed: 120, turnY: 135 },
] as const;

/** A striker right after the peel (side = +1, enemy.test's afterPeel): x, y, vx of descend tick 1. */
export const EVASION_START = { x: 127, y: 47, vx: 1 } as const;

/** The ship's center starts this many px right of the diver's center. */
export const EVASION_LEAD_X = 27;

/** stand - the ship does not move; feint - runs right, reverses once the diver's y >= turnY. */
export type ShipScript =
  { readonly move: 'stand' } | { readonly move: 'feint'; readonly turnY: number };

/**
 * Plays one descend against a scripted ship, from the diver's current position until its top
 * passes the ship's bottom. Each tick (as in Battle): the ship moves (SHIP_SPEED), then
 * step(shipCenter) advances the diver by one tick, then the ship and the diver are checked
 * with overlaps(). 'ram' on the first overlap, 'miss' otherwise.
 */
export function runEvasion(
  diver: Rect,
  step: (targetX: number) => void,
  script: ShipScript,
): 'ram' | 'miss' {
  const speed = SHIP_SPEED * TICK_SECONDS;
  const half = Math.floor(SHIP_WIDTH / 2);
  let center = diver.x + Math.floor(diver.width / 2) + EVASION_LEAD_X;
  let dir = 1;
  for (let tick = 0; diver.y < SHIP_Y + SHIP_HEIGHT; tick++) {
    if (tick >= 1000) throw new Error('the diver does not reach the ship');
    if (script.move === 'feint') {
      if (diver.y >= script.turnY) dir = -1;
      center += speed * dir;
    }
    step(center);
    const ship = { x: center - half, y: SHIP_Y, width: SHIP_WIDTH, height: SHIP_HEIGHT };
    if (overlaps(ship, diver)) return 'ram';
  }
  return 'miss';
}
```

`diver` — тот же объект, который двигает `step` (`Enemy` или объект симуляции): цикл читает
его `x`/`y` после шага. Проверено: настоящий `Enemy` при `T = 8` — стоит → таран (180: тик 51,
120: тик 77), финт → разошлись (мин. зазор центров на высоте корабля 21 и 25 px); симуляция
с `T = 0` — таран в обоих режимах, с `T = 8` — тики/зазоры совпадают с `Enemy`.

## 4. Тесты `enemy.test.ts`

**Файл (изменить):** `src/game/enemy.test.ts` (Vitest, environment `node`)

Импорты: добавить `STRIKER_TURN_TICKS` из `./enemy`; `EVASION_CASES`, `EVASION_START`,
`runEvasion` из `./test-evasion`. Комментарий `afterPeel` дополнить: «`striker`: `vx = side`
on descend tick 1 (continues the arc)». Ниже `T = STRIKER_TURN_TICKS`.

### 4.1. Тест профилей (`enemy.test.ts:448`)

```typescript
it('kind profiles: drone re-aims every DRONE_RETARGET_TICKS = 30 ticks, striker every tick with STRIKER_TURN_TICKS = 8 inertia, raider once', () => {
  expect(DRONE_RETARGET_TICKS).toBe(30);
  expect(STRIKER_TURN_TICKS).toBe(8);
  // drone, raider - as now
  expect(ENEMY_KINDS.striker.steer).toEqual({
    retargetTicks: 1,
    turnTicks: STRIKER_TURN_TICKS,
    maxVx: 1,
  });
});
```

### 4.2. Механические тесты «Enemy aim» — перенос со `striker` (дизайн, «Тестирование»)

Ожидания не подгоняются под инерцию; меняется только геометрия вида (`drone` 11 px, центр
`x + 5`, после дуги `x = 128`, центр 133).

- **«track follows the target of every tick»** — удалить из `enemy.test.ts`, перенести в
  `steering.test.ts` (шаг 5).
- **«does not jitter over the target with a fractional center»** → на `drone`, каждый случай —
  на **свежем** враге (`afterPeel('drone')`), чтобы цель бралась в `d = 1` именно этого случая.
  Причина: в старом тесте один враг на 71 тик; у `drone` переприцеливание в `d = 31, 61`, и
  блок «цель 134» (`d = 41…60`) фактически летел бы к цели 133 — тест прошёл бы, но перестал
  проверять случай 134. Все окна ≤ 20 тиков < `N`.

  ```typescript
  it.each([
    [128.25, 133],
    [128.75, 133],
    [128.75, 134],
  ])('does not jitter over the target with a fractional center (x %s, target %i)', (x, target) => {
    const enemy = afterPeel('drone');
    enemy.x = x;
    step(enemy, 20, aimAt(target));
    expect(enemy.x).toBe(x);
  });

  it('steps once to a target 1 px away and stays', () => {
    const enemy = afterPeel('drone');
    enemy.x = 128;
    step(enemy, 1, aimAt(134));
    expect(enemy.x).toBe(129);
    step(enemy, 10, aimAt(134));
    expect(enemy.x).toBe(129);
  });
  ```

- **«Y step at %i px/s does not depend on steering»** → `afterPeel('drone', aimAt(0, diveSpeed))`,
  остальное как есть (5 тиков `x − 1`, `y + diveSpeed / 60`).
- **«stays on screen while aiming at the edge»** → на `drone`: `expect(enemy.width).toBe(11)`,
  таблица `[0, 0]`, `[255, SCREEN_WIDTH - 11]`, старт `x = 3` / `SCREEN_WIDTH - width - 3`, 10 тиков.
- **«measures the gap from the center of its own sprite»** → `drone` + `raider` (переменная
  `raider` вместо `striker`), ожидания прежние: `drone` 100 → 100, `raider` 100 → 99 после
  1-го тика и после ещё 4.

### 4.3. «Enemy vx» из 014

- «is 0 in the formation and on every peel tick» — без изменений (`striker`, проходит).
- **«in descend equals the actual x shift of the tick»** → свойство на `striker` без жёстких
  значений `vx`:

  ```typescript
  it('in descend equals the actual x shift of every tick (striker, with inertia)', () => {
    const enemy = afterPeel('striker');
    const targets: readonly (number | null)[] = [
      ...Array<number>(20).fill(0),
      ...Array<number>(20).fill(250),
      ...Array<null>(20).fill(null),
      ...Array<number>(10).fill(0),
    ];
    const seen = new Set<number>();
    for (const target of targets) {
      const x = enemy.x;
      step(enemy, 1, aimAt(target));
      expect(enemy.x - x).toBe(enemy.vx);
      seen.add(enemy.vx);
    }
    expect(seen).toEqual(new Set([-1, 0, 1])); // the run really turned both ways
  });
  ```

- **«is 0 after leaving past the bottom»**, **«is 0 after kill() in descend»** → `afterPeel('drone')`,
  ожидания те же (`aimAt(0)` в `d = 1` → `vx = −1`).
- **«hitting the … edge zeroes vx»** → настоящий проскок `striker` у обоих краёв (заменяет тест
  с `aimOffsetX` ±32). Цель за краем зажимается `aimFor` в центр крайней позиции, враг
  доходит до края с `vx` к стене своим ходом; в следующем тике `desired = 0`, а инерция держала
  бы `vx` ещё `T − 1` тиков — правило стены обнуляет его сразу.

  ```typescript
  it.each([
    { side: 1, target: 0, dir: -1, edge: 'left' },
    { side: -1, target: 255, dir: 1, edge: 'right' },
  ] as const)('overshooting into the $edge screen edge zeroes vx', ({ side, target, dir }) => {
    const { enemy } = newEnemyOf('striker');
    enemy.startDive(diveOrder({ side }));
    step(enemy, P);
    const edgeX = dir > 0 ? SCREEN_WIDTH - enemy.width : 0;
    for (let i = 0; enemy.x !== edgeX; i++) {
      if (i >= 400) throw new Error('never reached the edge');
      step(enemy, 1, aimAt(target));
    }
    expect(enemy.vx).toBe(dir); // arrived at full speed, by its own steering
    for (let i = 0; i < STRIKER_TURN_TICKS; i++) {
      step(enemy, 1, aimAt(target));
      expect(enemy.x).toBe(edgeX);
      expect(enemy.vx).toBe(0);
    }
    expect(enemy.state).toBe('diving');
  });
  ```

  Проверено: слева край на `d = 149`, справа (старт `x = 99`) на `d = 166`; при `diveSpeed 60`
  враг ещё в `diving`.

### 4.4. Новый `describe('Enemy striker inertia', …)`

```typescript
describe('Enemy striker inertia', () => {
  const T = STRIKER_TURN_TICKS;

  it.each([
    [1, 0],
    [1, 250],
    [1, null],
    [-1, 0],
    [-1, 250],
    [-1, null],
  ] as const)('continues the peel arc on descend tick 1 (side %i, target %s)', (side, target) => {
    const { enemy } = newEnemyOf('striker');
    enemy.startDive(diveOrder({ side }));
    step(enemy, P);
    const x = enemy.x;
    step(enemy, 1, aimAt(target));
    expect(enemy.vx).toBe(side);
    expect(enemy.x - x).toBe(side);
  });

  it('reverses by the layout: T - 1 ticks on the old course, T ticks still, then back', () => {
    const enemy = afterPeel('striker'); // x = 127, the target is to the left
    const vxs: number[] = [];
    for (let d = 1; d <= 3 * T; d++) {
      step(enemy, 1, aimAt(0));
      vxs.push(enemy.vx);
    }
    expect(vxs).toEqual(vxs.map((_, i) => (i + 1 < T ? 1 : i + 1 < 2 * T ? 0 : -1)));
    expect(enemy.x).toBe(127 + (T - 1) - (T + 1));
  });

  it('wobbles within T - 1 px over a standing target', () => {
    const enemy = afterPeel('striker');
    const target = 160;
    let reached = false;
    let maxGap = 0;
    const dirs = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      step(enemy, 1, aimAt(target));
      if (enemy.state !== 'diving') break;
      if (Math.abs(centerX(enemy) - target) < 1) reached = true;
      if (!reached) continue;
      maxGap = Math.max(maxGap, Math.abs(centerX(enemy) - target));
      if (enemy.vx !== 0) dirs.add(enemy.vx);
    }
    expect(reached).toBe(true);
    expect(maxGap).toBeLessThanOrEqual(T - 1);
    expect(dirs).toEqual(new Set([-1, 1])); // it does wobble
  });

  it('sheds vx within T ticks when the target is gone, then flies straight down', () => {
    const enemy = afterPeel('striker');
    step(enemy, 20, aimAt(0)); // d = 16+: vx = -1
    expect(enemy.vx).toBe(-1);
    let n = 0;
    while (enemy.vx !== 0 && n <= T) {
      step(enemy, 1, aimAt(null));
      n++;
    }
    expect(n).toBeLessThanOrEqual(T);
    const x = enemy.x;
    for (let i = 0; i < 30; i++) {
      step(enemy, 1, aimAt(null));
      expect(enemy.vx).toBe(0);
      expect(enemy.x).toBe(x);
    }
  });

  it('starts the evasion scenario from EVASION_START', () => {
    const enemy = afterPeel('striker');
    expect({ x: enemy.x, y: enemy.y }).toEqual({ x: EVASION_START.x, y: EVASION_START.y });
  });

  it.each(EVASION_CASES)(
    'at $diveSpeed px/s rams a standing ship, misses a feint at y >= $turnY',
    ({ diveSpeed, turnY }) => {
      const standing = afterPeel('striker');
      const env = (t: number) => aimAt(t, diveSpeed);
      expect(runEvasion(standing, (t) => step(standing, 1, env(t)), { move: 'stand' })).toBe('ram');
      const feinted = afterPeel('striker');
      expect(runEvasion(feinted, (t) => step(feinted, 1, env(t)), { move: 'feint', turnY })).toBe(
        'miss',
      );
    },
  );
});
```

Проверено при `T = 8`: затухание ровно за 8 тиков; виляние — макс. 7 px, оба знака `vx`
(прогон до ухода за низ, 193 тика, выход из цикла по `state !== 'diving'`, иначе после
`returning` центр прыгает в слот).

Без изменений и проходят: «%s peel does not depend on the target», тесты `raider`
(`fixed …`), `drone` из 015, «Enemy fire», группа `raider`, «every kind reads the group
offsets».

## 5. Тесты `steering.test.ts`

**Файл (изменить):** `src/game/steering.test.ts`

Помощник мини-симуляции — в тестовом файле (в `steering.ts` не выносить, п. 3 архитектора).
Повторяет правила тика `descend` (`enemy.ts:262-282`): переприцеливание с зажимом одиночки
`[half, SCREEN_WIDTH − width + half]`, `desiredVx` по центру, `turn`, `x += vx` с зажимом в
экран и правилом стены, `y += dy`. Стартовый `vx` — `vx` 1-го тика `descend` (продолжение дуги).

```typescript
import { SCREEN_WIDTH, TICK_SECONDS } from '../config';
import { STRIKER_TURN_TICKS } from './enemy';
import { STRIKER_SPRITE } from './enemy-art';
import type { SteerSpec, SteerState } from './steering';
import { EVASION_CASES, EVASION_START, runEvasion } from './test-evasion';
import type { ShipScript } from './test-evasion';

/** A diver of the mini simulation: the descend tick rules of Enemy, solo (no group offsets). */
interface SimDiver {
  x: number;
  y: number;
  readonly width: number;
  readonly height: number;
  vx: number;
  turnCounter: number;
  aimX: number | null;
  d: number;
}

function simDiver(x: number, y: number, vx: number, width = 13, height = 9): SimDiver {
  return { x, y, width, height, vx, turnCounter: 0, aimX: null, d: 0 };
}

/** One descend tick, as Enemy.descend(): re-aim, desiredVx, turn, x += vx (screen, wall), y += dy. */
function simStep(s: SimDiver, spec: SteerSpec, targetX: number | null, dy = 1): void {
  s.d++;
  const half = Math.floor(s.width / 2);
  const maxX = SCREEN_WIDTH - s.width;
  if (isRetargetTick(s.d, spec.retargetTicks)) {
    s.aimX = targetX === null ? null : Math.min(Math.max(targetX, half), maxX + half);
  }
  const desired = desiredVx(s.x + half, s.aimX, spec.maxVx);
  const next = turn({ vx: s.vx, turnCounter: s.turnCounter }, desired, spec.turnTicks);
  s.vx = next.vx;
  s.turnCounter = next.turnCounter;
  const x = s.x + s.vx;
  s.x = Math.min(Math.max(x, 0), maxX);
  if ((x < 0 && s.vx < 0) || (x > maxX && s.vx > 0)) {
    s.vx = 0;
    s.turnCounter = 0;
  }
  s.y += dy;
}
```

Новый `describe('steering simulation', …)`:

- **«track follows the target of every tick»** (перенос из `enemy.test.ts`, тот же сценарий
  целей и ожидания) — профиль `{ retargetTicks: 1, turnTicks: 0, maxVx: 1 }`,
  `simDiver(127, 0, 1)`: 5 × цель 0 → `x − 1` каждый тик, 3 × 250 → `x + 1`, 4 × `null` →
  стоит, затем 0 → `x − 1`.
- **Контроль уходимости** — `it.each(EVASION_CASES)`: для `turnTicks = 0` ожидается таран и
  стоя, и финтом; для `STRIKER_TURN_TICKS` — таран стоя, «разошлись» финтом. Профиль
  `{ retargetTicks: 1, turnTicks, maxVx: 1 }`, старт `simDiver(EVASION_START.x, EVASION_START.y,
EVASION_START.vx, STRIKER_SPRITE.width, STRIKER_SPRITE.height)`,
  `dy = diveSpeed * TICK_SECONDS`.

  ```typescript
  it.each(EVASION_CASES)(
    'at $diveSpeed px/s the feint escapes only because of inertia',
    ({ diveSpeed, turnY }) => {
      const play = (turnTicks: number, script: ShipScript) => {
        const s = simDiver(
          EVASION_START.x,
          EVASION_START.y,
          EVASION_START.vx,
          STRIKER_SPRITE.width,
          STRIKER_SPRITE.height,
        );
        const spec = { retargetTicks: 1, turnTicks, maxVx: 1 };
        return runEvasion(s, (t) => simStep(s, spec, t, diveSpeed * TICK_SECONDS), script);
      };
      const feint: ShipScript = { move: 'feint', turnY };
      expect(play(0, { move: 'stand' })).toBe('ram');
      expect(play(0, feint)).toBe('ram');
      expect(play(STRIKER_TURN_TICKS, { move: 'stand' })).toBe('ram');
      expect(play(STRIKER_TURN_TICKS, feint)).toBe('miss');
    },
  );
  ```

Существующие тесты функций (`isRetargetTick`, `desiredVx`, `turn`) — без изменений.

## 6. `wave.test.ts` — «passes targetX to the enemies»

**Файл (изменить):** `src/game/wave.test.ts:109-120`

Две волны с одним сидом (п. 1 архитектора): `drone` держит цель `N` тиков, поэтому `null`
проверяется на тике прицеливания.

```typescript
it('passes targetX to the enemies', () => {
  const P = PEEL_SEGMENTS.reduce((sum, s) => sum + s.ticks, 0);
  const level = passiveLevel(['D'], { firstDiveDelayTicks: 1 });
  const aimed = new Wave(level, createRng(1));
  const blind = new Wave(level, createRng(1));
  for (let i = 0; i < 1 + P; i++) {
    aimed.update(TICK_SECONDS, 0);
    blind.update(TICK_SECONDS, 0);
  }
  const a = aimed.enemies[0]!;
  const b = blind.enemies[0]!;
  expect(a.state).toBe('diving');
  expect(b.x).toBe(a.x);
  const x = a.x;
  aimed.update(TICK_SECONDS, 0); // descend tick 1: aims at 0
  blind.update(TICK_SECONDS, null); // descend tick 1: no target, straight down
  expect(a.x).toBe(x - 1);
  expect(b.x).toBe(x);
});
```

## 7. `battle.test.ts`

**Файл (изменить):** `src/game/battle.test.ts`

Импорт: `STRIKER_TURN_TICKS` из `./enemy`.

- **«Battle aim»** (`:169-183`): `run(battle, 1 + P + 160)`; проверка
  `expect(Math.abs(enemyCenter - shipCenter)).toBeLessThanOrEqual(STRIKER_TURN_TICKS - 1)`;
  комментарий: «a flank striker first runs on / stands for about 15 ticks (inertia), then
  wobbles within T − 1 px; the ram comes at about 165». Проверено: разница 2,25, `diving`.
- **«gives the wave no target while the ship is down»** (`:202-213`): после `hit()` —
  `run(battle, STRIKER_TURN_TICKS)`, затем запомнить `x` и 10 тиков проверять `enemy.x === x`;
  в конце `state === 'diving'`. Проверено: `x` стабилен через 6 тиков.

## 8. Ручная проверка

`npm run dev`:

- `?level=2` и `?level=5`: `striker` после дуги продолжает её боковой ход, переход дуги в пике
  плавный; затем разворачивается к кораблю и преследует.
- Финт (повести врага в одну сторону и резко развернуться на середине его пике) — враг
  проскакивает и проходит мимо; стоя на месте — таран.
- Отдельно — **фланговые** `striker` (вылет с краёв строя): не слишком ли слабы из-за
  продолжения дуги (≈ 22 px в сторону от корабля). Если слабы — запасной вариант из дизайна
  (старт `descend` с `vx = 0`) — отдельное решение владельца, не в этой задаче.
- Корабль сбит: `striker` за долю секунды гасит боковой ход и уходит прямо вниз.
- `drone` и группы `raider` — как после 015.

Результат приёмки — в `acceptance.md` папки задачи (если прогон через `/feature-chain`).

## 9. Обновление документации

**Файл (изменить):** `second-brain/game-design.md` («Пикирование», строка 34) — заменить
«`striker` преследует корабль со скоростью 1 px/тик;» на:

> `striker` преследует корабль со скоростью 1 px/тик с инерцией (фича 003, В2): после дуги
> вылета продолжает её боковой ход, на развороте корабля ещё ≈ 0,1 с летит прежним курсом,
> столько же «стоит» по X и только потом догоняет (смена скорости на 1 px/тик — за 8 тиков);
> от него уходят финтом, но не стоя на месте (над стоящим кораблём он виляет в пределах 7 px);
> если корабль сбит, боковой ход гаснет за ≤ 8 тиков, и враг идёт прямо вниз;

**Файл (изменить):** `second-brain/architecture/overview.md`:

- строка 117: `striker {1, 0, 1}` → `striker {1, STRIKER_TURN_TICKS = 8, 1}` (инерция: разворот —
  `T − 1` тиков прежним курсом, `T` тиков `vx = 0`, затем обратно);
- строка 199: «в `down` пикирующие летят прямо вниз» → «в `down` `striker` гасит боковой ход
  за ≤ `STRIKER_TURN_TICKS` тиков и идёт прямо вниз, `drone` перестаёт сворачивать на
  ближайшем переприцеливании»;
- рядом с `test-levels.ts` (строка 186) — пункт `test-evasion.ts`: «только для тестов:
  сценарий уходимости `striker` — `EVASION_CASES` (`{ diveSpeed, turnY }`: 180/125, 120/135 —
  середины окон «`T = 8` уходит, `T = 0` таран»), `EVASION_START`, `runEvasion(diver, step,
script)` (скриптовый корабль стоит / финтит, таран — `overlaps`); используют `enemy.test.ts`
  и `steering.test.ts`»;
- граф зависимостей (строка 240): `test-evasion → {config, collisions, ship}` (`Rect` — type),
  только из `*.test.ts`.

README в `src/game/` нет — не требуется.

## Сводка по файлам

| Действие | Файл                                                                                        |
| -------- | ------------------------------------------------------------------------------------------- |
| Изменить | `src/game/enemy.ts` (константа `STRIKER_TURN_TICKS`, профиль, комментарий)                  |
| Изменить | `src/game/battle.ts` (комментарий о `null`-цели)                                            |
| Создать  | `src/game/test-evasion.ts` (сценарий уходимости, только для тестов)                         |
| Изменить | `src/game/enemy.test.ts` (профили; перенос «Enemy aim»/«Enemy vx»; `Enemy striker inertia`) |
| Изменить | `src/game/steering.test.ts` (мини-симуляция: «каждый тик», контроль уходимости)             |
| Изменить | `src/game/wave.test.ts` («passes targetX» — две волны `D`)                                  |
| Изменить | `src/game/battle.test.ts` («Battle aim», «no target while down»)                            |
| Изменить | `second-brain/game-design.md` («Пикирование»)                                               |
| Изменить | `second-brain/architecture/overview.md` (профиль, `down`, `test-evasion.ts`, граф)          |

Проверки: `npm run format:check`, `lint`, `typecheck`, `test`, `build`.

## Архитектура и паттерны

- Граница engine/game не затронута; `steering.ts` — без импортов (симуляция и `overlaps` —
  только в тестах).
- Параметр по виду — поле `ENEMY_KINDS` через именованную константу (как `DRONE_RETARGET_TICKS`);
  подстройка `T` — правка одного числа, тесты выражены через `STRIKER_TURN_TICKS`.
- Детерминизм: без `Rng`, X в `descend` — целые px/тик без `dt` (ADR 002/003), вертикаль —
  `diveSpeed · dt`.
- Принцип тестов фичи: механика (`desiredVx`, зажим, вертикаль, геттер `vx`) — на видах без
  инерции, на `striker` — только инерция и свойства, от неё не зависящие.
- `import type` для `Rect`, `SteerSpec`, `ShipScript`, `EnemyEnv`.

## Открытые вопросы

Нет. Вопросы `analyze.md` 1–5 закрыты архитектором (`discussion.md`, «Реализация: задача
016-striker-inertia»). Отступление от буквы дизайна одно и по технической причине: «does not
jitter» на `drone` разбит на случаи со свежим врагом (иначе переприцеливание в `d = 41…60`
подменяло бы цель 134 на 133, см. 4.2) — ожидания те же.

## Ссылки

- `second-brain/tasks/tasks/016-striker-inertia/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/003-enemy-flight/design.md` («Тестирование», «Правила тика descend»,
  «Альтернативы»), `discussion.md` («Реализация: задача 016-striker-inertia», В2)
- `second-brain/tasks/tasks/014-steering-model/plan.md`, `015-drone-retarget/plan.md`
- `second-brain/decisions/002-integer-speeds.md`, `003-slow-speeds-tick-timers.md`
- Код: `src/game/enemy.ts`, `steering.ts`, `collisions.ts`, `ship.ts`, `test-levels.ts`, тесты
  `enemy`/`steering`/`wave`/`battle`
