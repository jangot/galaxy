# План реализации: Выстрел игрока

Корабль получает выстрел: по нажатию «огня» (Space / Z) из носа вылетает белая полоска
1×4 и летит вверх со скоростью 240 px/с (4 px/тик). На экране не больше одного своего
выстрела, удержание кнопки очередью не стреляет, нажатие во время полёта игнорируется и
не запоминается. План следует `second-brain/features/001-player-ship/design.md` (пункт 4
нарезки) и `analyze.md` задачи без отступлений; единственное решение, оставленное
плану, — имя приватного поля выстрела в `Player` (`activeShot`, см. шаг 4).

Порядок шагов — по графу импортов: `shot.ts` (без зависимостей) → `art.ts` → `ship.ts`
→ `player.ts` → `play-scene.ts`. После каждого шага код компилируется.

## 1. Сущность `Shot`

**Файл (создать):** `src/game/shot.ts`

Константы выстрела и класс без зависимостей от других модулей игры. Стиль — как у
`Ship` (`src/game/ship.ts`): параметры-свойства конструктора, JSDoc на английском,
комментарий к скорости про px/тик и ADR 002.

```typescript
/** Shot size in logical pixels: a thin vertical bar. */
export const SHOT_WIDTH = 1;
export const SHOT_HEIGHT = 4;
/** Upward speed in px/s. Must be a whole number of px per tick (ADR 002): 4 px/tick. */
export const SHOT_SPEED = 240;

/** Player shot. Position is the top-left corner in logical pixels. Flies straight up. */
export class Shot {
  /** `x` is fixed at launch: the shot does not follow the ship. */
  constructor(
    readonly x: number,
    public y: number,
  ) {}

  update(dt: number): void {
    this.y -= SHOT_SPEED * dt;
  }

  /** True once the whole shot is above the top edge of the screen. */
  get isOffscreen(): boolean {
    return this.y + SHOT_HEIGHT <= 0;
  }
}
```

`y` — публичное изменяемое: тесты ставят границу прямой установкой (design.md,
«Тестирование»). Форматирование конструктора — как отформатирует Prettier
(`npm run format`).

## 2. Цвет выстрела

**Файл (изменить):** `src/game/art.ts`

Добавить в конец файла, после `SHIP_SPRITE`:

```typescript
/** Player shot color. The shot is a plain rectangle, not a sprite. */
export const SHOT_COLOR = '#ffffff';
```

`art.ts` не импортирует `shot.ts` — это просто строка.

## 3. Точка вылета `Ship.spawnShot()`

**Файл (изменить):** `src/game/ship.ts`

Импорт (значения, не типы — `Shot` создаётся через `new`):

```typescript
import { SCREEN_WIDTH } from '../config';
import { SHIP_SPRITE } from './art';
import { SHOT_HEIGHT, SHOT_WIDTH, Shot } from './shot';
```

Новый метод в классе `Ship`, после `update`:

```typescript
  /** Creates a shot centered on the nose, its bottom touching the top of the ship. */
  spawnShot(): Shot {
    const x = this.x + Math.floor(SHIP_WIDTH / 2) - Math.floor(SHOT_WIDTH / 2);
    return new Shot(x, this.y - SHOT_HEIGHT);
  }
```

При `x = 120` → `(127, 204)`; у краёв `x = 0` / `241` → `muzzleX = 7` / `248`.
Граф: `ship → {config, art, shot}`, цикла нет (`shot` ничего не импортирует).

## 4. Автомат выстрела в `Player`

**Файл (изменить):** `src/game/player.ts`

Решение плана по имени поля: приватное поле — `activeShot`, публичный геттер — `shot`
(интерфейс из design.md: `get shot(): Shot | null`). `activeShot` читается как «выстрел
в полёте» и не конфликтует с будущим `removeShot()` фичи коллизий.

Импорты — `Shot` только как тип (линтер `consistent-type-imports`):

```typescript
import type { Input } from '../engine/input';
import type { MoveDir } from './ship';
import { Ship } from './ship';
import type { Shot } from './shot';
```

Класс целиком (`PlayerIntent` и `readIntent` не меняются):

```typescript
/**
 * Player aggregate: the ship and its single shot.
 * Shot state: Ready (no shot) --fire--> InFlight --offscreen--> Ready.
 * Fire while a shot is in flight is ignored, not buffered.
 */
export class Player {
  readonly ship: Ship;
  private activeShot: Shot | null = null;

  constructor(ship: Ship = new Ship()) {
    this.ship = ship;
  }

  /** The shot in flight, or null when the player is ready to fire. */
  get shot(): Shot | null {
    return this.activeShot;
  }

  /**
   * Tick order matters: move -> fly and drop the shot -> fire.
   * A shot that leaves the screen this tick frees the slot at once,
   * and a new shot launches from the ship's updated position without moving this tick.
   */
  update(dt: number, intent: PlayerIntent): void {
    this.ship.update(dt, intent.move);
    if (this.activeShot) {
      this.activeShot.update(dt);
      if (this.activeShot.isOffscreen) this.activeShot = null;
    }
    if (intent.fire && !this.activeShot) {
      this.activeShot = this.ship.spawnShot();
    }
  }
}
```

## 5. Отрисовка выстрела в `PlayScene`

**Файл (изменить):** `src/game/scenes/play-scene.ts`

Импорты:

```typescript
import { SHIP_SPRITE, SHOT_COLOR } from '../art';
import { SHOT_HEIGHT, SHOT_WIDTH } from '../shot';
```

JSDoc класса: `/** Gameplay screen: starfield, the player ship and its shot. */`

`render` — слой выстрела между звёздами и кораблём (выстрел под кораблём, чтобы в тике
вылета не перекрывать его):

```typescript
  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.starfield.render(ctx);
    const { ship, shot } = this.player;
    if (shot) {
      ctx.fillStyle = SHOT_COLOR;
      ctx.fillRect(Math.floor(shot.x), Math.floor(shot.y), SHOT_WIDTH, SHOT_HEIGHT);
    }
    drawSprite(ctx, SHIP_SPRITE, Math.floor(ship.x), Math.floor(ship.y));
  }
```

`update` не меняется — он уже вызывает `this.player.update(dt, readIntent(input))`.
`main.ts`, `TitleScene`, `src/engine/*`, `sprite.ts`, `scene-test-utils.ts` — не трогать.

## 6. Тесты

Все — Vitest, environment `node`, `dt = TICK_SECONDS`, числа через экспортируемые
константы, сравнения позиций — `toBe` (координаты целые, ADR 002).

### 6.1 `src/game/shot.test.ts` (создать)

```typescript
import { describe, expect, it } from 'vitest';
import { TICK_SECONDS } from '../config';
import { SHOT_HEIGHT, SHOT_SPEED, Shot } from './shot';

const STEP = SHOT_SPEED * TICK_SECONDS;
```

Сценарии:

- `Number.isInteger(STEP)` — инвариант скорости (ADR 002);
- конструктор сохраняет `x`/`y` (`new Shot(10, 100)`);
- один `update(TICK_SECONDS)`: `y === 100 - STEP`, `x === 10`;
- несколько тиков — `x` не меняется;
- граница: `new Shot(10, -SHOT_HEIGHT).isOffscreen === true`,
  `new Shot(10, -SHOT_HEIGHT + 1).isOffscreen === false`;
- выстрел на экране (`new Shot(10, 0)`, `new Shot(10, 100)`) — `false`.

### 6.2 `src/game/ship.test.ts` (изменить)

Импорт `import { SHOT_HEIGHT, SHOT_WIDTH } from './shot';`. Добавить в `describe('Ship')`:

- `spawnShot()` у `new Ship(100)`:
  `shot.x === 100 + Math.floor(SHIP_WIDTH / 2) - Math.floor(SHOT_WIDTH / 2)`,
  `shot.y + SHOT_HEIGHT === ship.y`;
- у стартового корабля (`new Ship()`) — та же формула через константы (даёт
  `(127, 204)`; магические числа в тест не писать);
- у краёв `new Ship(0)` и `new Ship(SCREEN_WIDTH - SHIP_WIDTH)` — выстрел целиком на
  экране по X: `shot.x >= 0`, `shot.x + SHOT_WIDTH <= SCREEN_WIDTH`, и всё так же по
  центру носа;
- каждый вызов возвращает новый объект (`ship.spawnShot()` `not.toBe` предыдущему).

### 6.3 `src/game/player.test.ts` (изменить)

Импорты: `import { SHOT_HEIGHT, SHOT_SPEED, SHOT_WIDTH } from './shot';`,
`import type { Shot } from './shot';`. Хелпер в файле (вместо `!`, понятное сообщение
при падении):

```typescript
const SHOT_STEP = SHOT_SPEED * TICK_SECONDS;
const IDLE = { move: 0, fire: false } as const;
const FIRE = { move: 0, fire: true } as const;

function requireShot(player: Player): Shot {
  const { shot } = player;
  if (!shot) throw new Error('expected a shot in flight');
  return shot;
}

/** Where a shot from this ship must appear. */
function muzzleOf(ship: Ship): { x: number; y: number } {
  return {
    x: ship.x + Math.floor(SHIP_WIDTH / 2) - Math.floor(SHOT_WIDTH / 2),
    y: ship.y - SHOT_HEIGHT,
  };
}
```

(`SHIP_WIDTH` — добавить в импорт из `./ship`.) Интенты — простые объекты, без `Input`.

Новый `describe('Player shot')`:

- новый `Player` — `shot === null`;
- `update(IDLE)` — выстрела нет;
- `FIRE` → выстрел есть, в `muzzleOf(ship)`, в тике вылета не сдвинут;
- `{ move: 1, fire: true }` у `new Ship(100)` → выстрел из **уже сдвинутого** корабля
  (`shot.x === muzzleOf(player.ship).x`, `player.ship.x === 100 + STEP`);
- `FIRE` при летящем → `player.shot` `toBe` тот же объект, он сдвинулся на `SHOT_STEP`
  (второго нет, нажатие не создало новый);
- нажатие во время полёта не буферизуется: `FIRE` → `FIRE` (во время полёта) →
  `requireShot(player).y = -SHOT_HEIGHT + 1` → `update(IDLE)` → `shot === null`, и ещё
  `update(IDLE)` — по-прежнему `null`;
- уход за экран без огня: `FIRE`, затем `requireShot(player).y = -SHOT_HEIGHT + 1`,
  `update(IDLE)` → `shot === null`;
- граница не раньше времени: `y = -SHOT_HEIGHT + 1 + SHOT_STEP` → `update(IDLE)` →
  выстрел ещё есть (`y === -SHOT_HEIGHT + 1`);
- освобождение слота в том же тике: `FIRE`, запомнить `first`, `y = -SHOT_HEIGHT + 1`,
  `update(FIRE)` → `player.shot` есть, `not.toBe(first)`, в `muzzleOf(ship)`;
- выстрел не следует за кораблём: `new Ship(100)`, `FIRE`, запомнить `shot.x`, затем 5
  тиков `{ move: 1, fire: false }` → `shot.x` прежний, `ship.x` сдвинулся.

Существующие тесты `readIntent` и `Player` не менять — fire-edge уже покрыт.

### 6.4 `src/game/scenes/play-scene.test.ts` (изменить)

Только через `step()` (иначе `pressed('fire')` не гасится `endTick()`). Импорт
`TICK_SECONDS`/`SHOT_SPEED`/`SHOT_HEIGHT` — по необходимости; число тиков полёта
вычислять из констант, а не писать `51`/`52` магией:

```typescript
/** Ticks after launch while the shot is still on screen (y reaches exactly 0). */
const TICKS_ON_SCREEN = (SHIP_Y - SHOT_HEIGHT) / (SHOT_SPEED * TICK_SECONDS); // 51
```

Сценарии:

- без огня — `player.shot === null` после `step(…, 10)`;
- `input.press('fire')` → `step(scene, input, 1)` → `player.shot !== null`;
- удержание без очереди: `press('fire')`, `step(1)`, запомнить `first`; не отпуская —
  `step(TICKS_ON_SCREEN)` → `player.shot` `toBe(first)`; `step(1)` → `null`; ещё
  `step(30)` при зажатой кнопке → по-прежнему `null`;
- повторное нажатие после ухода: продолжение предыдущего — `release('fire')`,
  `press('fire')`, `step(1)` → новый выстрел (`not.toBeNull()`, `not.toBe(first)`);
- нажатие во время полёта игнорируется: `press('fire')`, `step(1)`, `first`;
  `release`+`press` через 10 тиков, `step(1)` → `player.shot` `toBe(first)`.

Отрисовку (`render`) тестами не покрываем — по design.md она проверяется глазами;
логика полностью в `Player`.

## 7. Ручная проверка

`npm run dev`, Enter на титуле:

- Space / Z — из носа корабля вылетает белая полоска 1×4 и летит ровно вверх, без
  подёргивания; в момент вылета не перекрывает корабль;
- пока выстрел летит, повторные нажатия ничего не делают; после ухода за верх — снова
  можно стрелять;
- удержание кнопки не даёт очереди;
- выстрел не следует за кораблём при движении;
- корабль прижат к левому/правому краю — выстрел всё равно из носа;
- на титуле «огонь» ничего не делает, Enter — переход как раньше.

## 8. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md`, раздел «Игра» (на русском):

- новый пункт `shot.ts` — `Shot`: левый верхний угол, `SHOT_WIDTH × SHOT_HEIGHT = 1×4`,
  `SHOT_SPEED = 240` px/с (4 px/тик), `x` фиксирован после вылета, `update(dt)` — вверх,
  `isOffscreen` — `y + SHOT_HEIGHT <= 0`; не зависит от других модулей игры;
- `art.ts`: + `SHOT_COLOR` (белый; выстрел — прямоугольник, не спрайт);
- `ship.ts`: + `spawnShot()` — по центру носа, низ выстрела на верхе корабля;
- `player.ts`: убрать «используется с задачи 004» и «(пока только `ship`)»; описать
  `Player` как агрегат «корабль + единственный выстрел» (`get shot(): Shot | null`),
  автомат Ready/InFlight, нажатие во время полёта не буферизуется, порядок тика
  «движение → полёт и удаление → огонь»;
- `scenes/play-scene.ts`: «звёздный фон, корабль и выстрел»; слои
  «заливка → звёзды → выстрел → корабль»;
- граф импортов: `ship → {config, art, shot}`, `player → ship` (`Input`, `Shot` —
  `import type`), `play-scene → {starfield, player, art, sprite, shot}`.

`game-design.md` уже содержит решения по выстрелу — не менять. `README.md` в
`src/game/` нет. Запись фичи (`features/001-player-ship/README.md`, `features/README.md`)
— вне рамок задачи, её обновляет основная сессия.

## 9. Проверки

`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build` — все зелёные.

## Сводка по файлам

| Действие | Файл                                    |
| -------- | --------------------------------------- |
| Создать  | `src/game/shot.ts`                      |
| Создать  | `src/game/shot.test.ts`                 |
| Изменить | `src/game/art.ts`                       |
| Изменить | `src/game/ship.ts`                      |
| Изменить | `src/game/ship.test.ts`                 |
| Изменить | `src/game/player.ts`                    |
| Изменить | `src/game/player.test.ts`               |
| Изменить | `src/game/scenes/play-scene.ts`         |
| Изменить | `src/game/scenes/play-scene.test.ts`    |
| Изменить | `second-brain/architecture/overview.md` |

## Архитектура и паттерны

- Логика отдельно от рендера: `Shot`, `Ship.spawnShot`, автомат в `Player` — без `ctx`,
  тестируются в `node`; рисование — только в `PlayScene.render`.
- Время — только через `dt`; случайности в задаче нет.
- Правило целых скоростей (ADR 002): 4 px/тик, закреплено тестом-инвариантом.
- `import type` для `Shot` в `player.ts` и тестах, где он только тип.
- Интервал между выстрелами задаётся геометрией (52 тика полёта), отдельного таймера
  нет; состояние автомата кодируется `Shot | null`.
- `PlayerIntent` развязывает `Player` от клавиатуры; edge-семантику «огня» даёт
  `Input.pressed` + `endTick()`, поэтому тесты сцены — только через `step()`.
- `engine` не меняется и ничего не знает о `game`.

## Открытые вопросы

Вопросов к владельцу нет (из `analyze.md` — тоже нет). Решение плана: имя приватного
поля — `activeShot`.

Организационное, вне рамок задачи: в `second-brain/features/001-player-ship/README.md`
ссылки на задачи 001 и 003 ведут в `tasks/tasks/` (папки уже в `tasks-done/`), статус
фичи стоит обновить — делает основная сессия.

## Ссылки

- `second-brain/tasks/tasks/004-player-shot/analyze.md`
- `second-brain/tasks/tasks/004-player-shot/description.md`
- `CLAUDE.md`
- `second-brain/features/001-player-ship/design.md` — Shot, Player, «Поток тика»,
  `PlayScene.render`, «Интерфейсы», «Тестирование», пункт 4 нарезки
- `second-brain/decisions/002-integer-speeds.md`
- `second-brain/architecture/overview.md`
