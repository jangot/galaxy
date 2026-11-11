# План реализации: Движение корабля

Корабль начинает ездить влево-вправо со скоростью `SHIP_SPEED = 120` px/с (ровно
2 px/тик, ADR 002), без инерции, с зажимом в `[0, SCREEN_WIDTH - SHIP_WIDTH]` = `[0, 241]`.
Управление идёт через намерение `PlayerIntent`, которое строит `readIntent(input)`;
появляется агрегат `Player` (пока только корабль), им владеет `PlayScene`.

Интерфейсы — по `design.md` фичи 001 («Интерфейсы»), без отступлений. `spawnShot()` у
`Ship` и `shot` у `Player` — задача 004, здесь не добавляются.

## 1. Движение и зажим в `Ship`

**Файл (изменить):** `src/game/ship.ts`

- Добавить `SHIP_SPEED = 120` и тип `MoveDir`.
- Добавить метод `update(dt, move)`: сначала шаг, затем зажим (шаг обрезается ровно до
  края, а не отменяется — иначе при нечётном остатке корабль встанет в 1 px от края).
- Обновить комментарий класса: убрать «Stationary for now».

```typescript
import { SCREEN_WIDTH } from '../config';
import { SHIP_SPRITE } from './art';

/** Ship size is derived from its sprite so the hitbox never drifts from the picture. */
export const SHIP_WIDTH = SHIP_SPRITE.width;
export const SHIP_HEIGHT = SHIP_SPRITE.height;
/** Top edge of the ship; the bottom 16 px below it are reserved for the lives HUD. */
export const SHIP_Y = 208;
/** Horizontal speed in px/s. Must be a whole number of px per tick (ADR 002): 2 px/tick. */
export const SHIP_SPEED = 120;

/** Horizontal movement direction for one tick: left, none, right. */
export type MoveDir = -1 | 0 | 1;

const MAX_X = SCREEN_WIDTH - SHIP_WIDTH;

/** Player ship. Position is the top-left corner in logical pixels. Moves horizontally only. */
export class Ship {
  readonly y = SHIP_Y;

  /** Defaults to horizontally centered. */
  constructor(public x = Math.floor((SCREEN_WIDTH - SHIP_WIDTH) / 2)) {}

  /** Moves at a constant speed with no inertia; a step past an edge is cut to the edge. */
  update(dt: number, move: MoveDir): void {
    const next = this.x + move * SHIP_SPEED * dt;
    this.x = Math.min(Math.max(next, 0), MAX_X);
  }
}
```

## 2. `PlayerIntent`, `readIntent`, `Player`

**Файл (создать):** `src/game/player.ts`

- `Input` — только через `import type` (используются лишь методы экземпляра).
- `readIntent` — единственное место, где игра читает клавиатуру для игрока.
- `fire` — edge (`pressed`, решение В5); в 003 `Player` его не использует, подхватит 004.

```typescript
import type { Input } from '../engine/input';
import type { MoveDir } from './ship';
import { Ship } from './ship';

/** What the player wants to do this tick, decoupled from the keyboard. */
export interface PlayerIntent {
  move: MoveDir;
  /** True only on the tick the fire key went down. */
  fire: boolean;
}

/** Samples the input for one tick. Both directions held cancel out. */
export function readIntent(input: Input): PlayerIntent {
  const move = ((input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0)) as MoveDir;
  return { move, fire: input.pressed('fire') };
}

/** Player aggregate: the ship (and, later, its shot). */
export class Player {
  readonly ship: Ship;

  constructor(ship: Ship = new Ship()) {
    this.ship = ship;
  }

  update(dt: number, intent: PlayerIntent): void {
    this.ship.update(dt, intent.move);
  }
}
```

Примечание для `/do`: если линтер ругается на два импорта из `./ship`, объединить в
`import { Ship, type MoveDir } from './ship'` — смотреть, какой стиль принимает текущий
ESLint-конфиг (`consistent-type-imports`); оба варианта допустимы по смыслу.

## 3. Подключение в `PlayScene`

**Файл (изменить):** `src/game/scenes/play-scene.ts`

- Поле `readonly ship = new Ship()` заменить на `readonly player = new Player()`.
- Импорт `Ship` убрать, добавить `{ Player, readIntent } from '../player'`.
- `update(dt, _input)` → `update(dt, input)`: после звёзд — `player.update`.
- `render` — рисовать по `this.player.ship`. Порядок слоёв не меняется.
- Комментарий класса: убрать «still stationary».

```typescript
import { Player, readIntent } from '../player';
// ...

/** Gameplay screen: starfield and the player ship. */
export class PlayScene implements Scene {
  /** Exposed for tests. */
  readonly player = new Player();
  private readonly starfield: Starfield;

  // constructor unchanged

  update(dt: number, input: Input): void {
    this.starfield.update(dt);
    this.player.update(dt, readIntent(input));
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.starfield.render(ctx);
    const { ship } = this.player;
    drawSprite(ctx, SHIP_SPRITE, Math.floor(ship.x), Math.floor(ship.y));
  }
}
```

`title-scene.ts`, `main.ts`, `src/engine/*`, `scene-test-utils.ts` не меняются.

## 4. Тесты

Все — Vitest, environment `node`, сравнения координат — `toBe` (координаты целые).
Числа — через экспортируемые константы (`SHIP_SPEED`, `SHIP_WIDTH`, `SCREEN_WIDTH`,
`TICK_SECONDS`), чтобы перерисовка спрайта не ломала тесты.

### 4.1. `Ship`

**Файл (изменить):** `src/game/ship.test.ts` — существующие тесты оставить, добавить:

```typescript
const STEP = SHIP_SPEED * TICK_SECONDS;
const MAX_X = SCREEN_WIDTH - SHIP_WIDTH;

it('moves a whole number of pixels per tick (ADR 002)', () => {
  expect(Number.isInteger(STEP)).toBe(true);
});

it('moves right by one step per tick', () => {
  const ship = new Ship(100);
  ship.update(TICK_SECONDS, 1);
  expect(ship.x).toBe(100 + STEP);
});
```

Сценарии:

- инвариант `Number.isInteger(SHIP_SPEED * TICK_SECONDS)`;
- `move = 1` — сдвиг вправо ровно на `STEP`; `move = -1` — влево на `STEP`;
  `move = 0` — `x` не меняется;
- `y` не меняется при движении (остаётся `SHIP_Y`);
- зажим слева прямой установкой: `new Ship(1)` + `move = -1` → `0`;
- зажим справа: `new Ship(MAX_X - 1)` + `move = 1` → `MAX_X`;
- «упёрся и стоит»: `new Ship(0)` + 5 тиков `move = -1` → `0`;
  `new Ship(MAX_X)` + 5 тиков `move = 1` → `MAX_X`.

Импорты: добавить `TICK_SECONDS` из `../config`, `SHIP_SPEED` из `./ship`.

### 4.2. `readIntent` и `Player`

**Файл (создать):** `src/game/player.test.ts`

Через реальный `Input` (`press` / `release` / `endTick`):

- ничего не зажато → `{ move: 0, fire: false }`;
- только `left` → `move = -1`; только `right` → `move = 1`; обе → `move = 0`;
- `fire`: после `press('fire')` → `true`; после `endTick()` при удержании → `false`;
- `Player` по умолчанию создаёт `Ship` в стартовой позиции (`player.ship.x === new Ship().x`);
- `new Player(new Ship(50))` — использует переданный корабль;
- `player.update(TICK_SECONDS, { move: 1, fire: false })` → `ship.x` вырос на
  `SHIP_SPEED * TICK_SECONDS`; `move: -1` → уменьшился; `move: 0` → не изменился.

`fire: true` в `Player.update` явно не тестировать — поведение придёт в 004.

```typescript
it('cancels out when both directions are held', () => {
  const input = new Input();
  input.press('left');
  input.press('right');
  expect(readIntent(input).move).toBe(0);
});
```

### 4.3. `PlayScene`

**Файл (изменить):** `src/game/scenes/play-scene.test.ts`

- Тест стартовой позиции перевести на `scene.player.ship` (+ `expect(scene.player).toBeInstanceOf(Player)`).
- Тест «keeps the ship still regardless of input» **заменить** на «stays still when both
  directions are held» (тот же сценарий, `scene.player.ship`).
- Добавить (только через `step()`):
  - зажать `right` на 10 тиков → `x === x0 + 10 * SHIP_SPEED * TICK_SECONDS`;
  - зажать `left` на 10 тиков → `x === x0 - 10 * STEP`;
  - зажать `right` 10 тиков, `release('right')`, ещё 10 тиков → `x` как после первых 10
    (остановка сразу, без инерции);
  - зажать `right` на 200 тиков → `x === SCREEN_WIDTH - SHIP_WIDTH`.

```typescript
it('drives the ship right while the key is held', () => {
  const scene = new PlayScene(createRng(1));
  const x0 = scene.player.ship.x;
  const input = new Input();
  input.press('right');
  step(scene, input, 10);
  expect(scene.player.ship.x).toBe(x0 + 10 * SHIP_SPEED * TICK_SECONDS);
});
```

`title-scene.test.ts` к `ship` не обращается — проверить `grep "\.ship" src` при `/do`;
если где-то обращается, перевести на `.player.ship`.

## 5. Ручная проверка

`npm run dev` → Enter на титульном экране:

- ←/A и →/D ведут корабль ровно, без подёргивания (2 px/тик);
- отпустил — встал сразу; зажаты обе стороны — стоит;
- у левого и правого края упирается, не уходит за экран и не дрожит; правый край —
  корабль целиком виден;
- от края до края ≈ 2 с;
- зажать стрелку и переключиться в другое окно (blur) — после возврата корабль стоит.

## 6. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md` (на русском)

- `ship.ts`: «Пока неподвижен» → движение `update(dt, move)` с `MoveDir`
  (`-1 | 0 | 1`), `SHIP_SPEED = 120` px/с (2 px/тик), без инерции, зажим
  `[0, SCREEN_WIDTH - SHIP_WIDTH]`, шаг за край обрезается до края.
- Новый пункт `player.ts`: `PlayerIntent { move, fire }`, `readIntent(input)` —
  единственное место чтения клавиатуры для игрока (`fire` — `pressed`, только тик
  нажатия; используется с задачи 004), `Player` — агрегат (пока только `ship`).
- `scenes/play-scene.ts`: поле `readonly player` (вместо `ship`), `update` →
  `player.update(dt, readIntent(input))`.
- Граф импортов: `play-scene → {starfield, player, art, sprite}`,
  `player → ship` (`Input` — `import type`).
- В «Принципы»: правило скоростей — `SPEED * TICK_SECONDS` целое число px/тик для
  сущностей со спрайтом, закреплено тестами (ссылка на `second-brain/decisions/002-integer-speeds.md`).

`README.md` в `src/` нет; `game-design.md` уже содержит решения В1 (скорость, без
инерции) — менять не требуется (при `/do` сверить, что 120 px/с там указано).

## 7. Проверки

`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Сводка по файлам

| Действие | Файл                                    |
| -------- | --------------------------------------- |
| Изменить | `src/game/ship.ts`                      |
| Изменить | `src/game/ship.test.ts`                 |
| Создать  | `src/game/player.ts`                    |
| Создать  | `src/game/player.test.ts`               |
| Изменить | `src/game/scenes/play-scene.ts`         |
| Изменить | `src/game/scenes/play-scene.test.ts`    |
| Изменить | `second-brain/architecture/overview.md` |

## Архитектура и паттерны

- Граница engine/game: движок не меняется; `Input` в игре читается только в `readIntent`,
  `Player`/`Ship` про клавиатуру не знают.
- Логика отдельно от рендера: движение и зажим — в `Ship.update`, сцена только вызывает
  и рисует; всё тестируется без canvas.
- Время — только через `dt` (`x += move * SHIP_SPEED * dt`); `Rng` не участвует.
- ADR 002: целый шаг px/тик → `Math.floor` при отрисовке не даёт подёргивания;
  закреплено тестом-инвариантом.
- `import type` для `Input` и `MoveDir`; неиспользуемых параметров не остаётся.
- Тесты сцены — только через `step()` (как `main.ts`: `update` → `endTick`).

## Открытые вопросы

Нет (в `analyze.md` открытых вопросов нет; числа и поведение решены владельцем, В1).

## Ссылки

- `second-brain/tasks/tasks/003-ship-movement/analyze.md`
- `CLAUDE.md`
- `second-brain/features/001-player-ship/design.md` — «Сущности и состояния», «Правило скоростей», «Интерфейсы»
- `second-brain/decisions/002-integer-speeds.md`
- `second-brain/architecture/overview.md`
- `second-brain/tasks/tasks/004-player-shot/analyze.md` — что 004 ожидает от `Player`/`readIntent`
