# План реализации: Поражение игрока тараном

Пикирующий/возвращающийся враг, коснувшийся корабля в `active`, гибнет сам и
переводит корабль в `down` (1 с: взрыв 16 тиков, затем пусто, ввод игнорируется, цели
нет), затем `invulnerable` (2 с: по центру, мигает, управляем, коллизий нет), затем
снова `active`. Уровень не перезапускается. Всё — по дизайну фичи 002 (п. 7 нарезки,
«Player — автомат корабля», «Правило тиков переходов», «Поток тика», «Уточнения для
реализации»), без отступлений.

Порядок шагов: `ship` → `player` → `collisions` → `battle` → `battle-render` → тесты →
документация. После каждого шага код компилируется, существующие 274 теста зелёные.

## 1. `SHIP_START_X`

**Файл (изменить):** `src/game/ship.ts`

```typescript
/** Ship's start and respawn x: horizontally centered. */
export const SHIP_START_X = Math.floor((SCREEN_WIDTH - SHIP_WIDTH) / 2);

export class Ship {
  readonly y = SHIP_Y;

  /** Defaults to SHIP_START_X (horizontally centered). */
  constructor(public x = SHIP_START_X) {}
  // ...без изменений
}
```

Константа объявляется после `SHIP_WIDTH` (зависит от неё), до класса.

**Файл (изменить):** `src/game/ship.test.ts` — в тесте `starts horizontally centered
at SHIP_Y` добавить `expect(SHIP_START_X).toBe(120)` и `expect(ship.x).toBe(SHIP_START_X)`
(существующую проверку формулой оставить).

## 2. Автомат корабля в `Player`

**Файл (изменить):** `src/game/player.ts`

Импорт: `import { SHIP_START_X, Ship } from './ship';` (`MoveDir` — по-прежнему `import type`).

```typescript
/** Ship states: active -hit()-> down -DOWN_TICKS-> invulnerable -INVULNERABLE_TICKS-> active. */
export type ShipState = 'active' | 'down' | 'invulnerable';
/** Ship is gone after a hit, ticks (owner decision В5: 1 s). Must be > EXPLOSION_TICKS. */
export const DOWN_TICKS = 60;
/** Blinking, untouchable but controllable after the respawn, ticks (В5: 2 s). */
export const INVULNERABLE_TICKS = 120;
```

Doc-комментарий класса дополнить автоматом корабля (кратко: состояния, что в каждом
игнорируется, правило тиков). Новые поля и члены:

```typescript
  private currentState: ShipState = 'active';
  private ticksInState = 0;

  get state(): ShipState {
    return this.currentState;
  }

  /** Ticks since entering the current state: 0 on the entry tick, +1 at the start of each update. */
  get stateTicks(): number {
    return this.ticksInState;
  }

  /** Collisions with the ship are checked only while active. */
  get canBeHit(): boolean {
    return this.currentState === 'active';
  }

  /** Enemies aim at the ship unless it is down. */
  get canBeTargeted(): boolean {
    return this.currentState !== 'down';
  }

  /**
   * active -> down; ignored in any other state (does not restart the timer,
   * so a ram during invulnerable cannot extend it). The shot in flight is kept.
   */
  hit(): void {
    if (this.currentState !== 'active') return;
    this.enter('down');
  }

  /**
   * Tick rule: count the tick, apply the timer transition, then act in the (new) state.
   * down: only the shot flies (intent ignored). active/invulnerable: move -> fly and drop
   * the shot -> fire. On the respawn tick the ship is put at SHIP_START_X and this tick's
   * intent already applies.
   */
  update(dt: number, intent: PlayerIntent): void {
    this.ticksInState++;
    if (this.currentState === 'down' && this.ticksInState >= DOWN_TICKS) {
      this.enter('invulnerable');
      this.ship.x = SHIP_START_X;
    } else if (this.currentState === 'invulnerable' && this.ticksInState >= INVULNERABLE_TICKS) {
      this.enter('active');
    }
    const controllable = this.currentState !== 'down';
    if (controllable) this.ship.update(dt, intent.move);
    if (this.activeShot) {
      this.activeShot.update(dt);
      if (this.activeShot.isOffscreen) this.activeShot = null;
    }
    if (controllable && intent.fire && !this.activeShot) {
      this.activeShot = this.ship.spawnShot();
    }
  }

  private enter(state: ShipState): void {
    this.currentState = state;
    this.ticksInState = 0;
  }
```

Проверка счёта (дизайн): `hit()` в тике `T` → `stateTicks = 0`; `update` в `T+1…T+59`
даёт 1…59 (`down`); в `T+60` — 60 → `invulnerable`, `stateTicks = 0`, центр, intent
обработан; `invulnerable → active` в `T+180`. В `active` `stateTicks` растёт без
ограничения — безопасно, никто не читает.

`removeShot()`, `shot`, `readIntent`, конструктор — без изменений.

## 3. Правило 3 коллизий — таран

**Файл (изменить):** `src/game/collisions.ts`

Импорт значений: `import { SHIP_HEIGHT, SHIP_WIDTH } from './ship';`. Ранний `return`
уходит внутрь функции правила 1, чтобы не обрывать таран.

```typescript
/**
 * Runs after everything has moved this tick, during 'playing' only. Rules in order:
 * 1. The player's shot kills one alive enemy (in formation or in flight) it overlaps - the lowest one
 *    (largest y + height; on a tie the smaller index in wave.enemies) - and is removed.
 * 2. Enemy shots x ship - task 012.
 * 3. Ram: while the ship can be hit, the first enemy out of the formation (diving/returning)
 *    in wave.enemies order that overlaps the ship is killed and the ship is hit; one hit per tick.
 * Rule 1 goes first: an enemy shot down this tick is already exploding and cannot ram.
 */
export function resolveCollisions(player: Player, wave: Wave): void {
  hitByPlayerShot(player, wave);
  ram(player, wave);
}

function hitByPlayerShot(player: Player, wave: Wave): void {
  const { shot } = player;
  if (!shot) return;
  // ...тело правила 1 без изменений
}

function ram(player: Player, wave: Wave): void {
  if (!player.canBeHit) return;
  const { ship } = player;
  const shipRect: Rect = { x: ship.x, y: ship.y, width: SHIP_WIDTH, height: SHIP_HEIGHT };
  for (const enemy of wave.enemies) {
    // isOut implies alive: exploding/dead and formation enemies never ram.
    if (!enemy.isOut || !overlaps(shipRect, enemy)) continue;
    enemy.kill();
    player.hit();
    return;
  }
}
```

Цикла импортов нет: `ship → {config, art, shot}`.

## 4. Цель только при `canBeTargeted`

**Файл (изменить):** `src/game/battle.ts`

```typescript
this.player.update(dt, intent);
// No target while the ship is down: strikers fly straight down, drones starting a descend keep no aim.
const { ship } = this.player;
const targetX = this.player.canBeTargeted ? ship.x + Math.floor(SHIP_WIDTH / 2) : null;
this.currentWave.update(dt, targetX);
```

Doc-комментарий `update`: «wave (aims at the ship's center of this tick, `null` while
the ship is down)». Порядок тика не меняется. В тике `hit()` волна уже обновлена с целью;
`null` — с `T+1`; в тике возрождения цель — центр нового положения.

## 5. Рендер корабля: взрыв и мигание

**Файл (изменить):** `src/game/battle-render.ts`

Импорты: `import type { Player } from './player';`,
`import { ENEMY_KINDS, EXPLOSION_FRAME_TICKS, EXPLOSION_TICKS } from './enemy';`,
`import { SHIP_HEIGHT, SHIP_WIDTH } from './ship';`.

```typescript
/** Invulnerable ship blinks: BLINK_TICKS shown, BLINK_TICKS hidden; shown on the entry tick. */
export const BLINK_TICKS = 4;

export function drawBattle(ctx: CanvasRenderingContext2D, battle: Battle): void {
  const { shot } = battle.player;
  if (shot) {
    /* без изменений */
  }
  for (const enemy of battle.wave.enemies) drawEnemy(ctx, enemy);
  drawShip(ctx, battle.player);
}

/** active: sprite; down: explosion for EXPLOSION_TICKS, then nothing; invulnerable: blinking sprite. */
function drawShip(ctx: CanvasRenderingContext2D, player: Player): void {
  const x = Math.floor(player.ship.x);
  const y = Math.floor(player.ship.y);
  const ticks = player.stateTicks;
  if (player.state === 'down') {
    if (ticks < EXPLOSION_TICKS) drawExplosion(ctx, ticks, x, y, SHIP_WIDTH, SHIP_HEIGHT);
    return;
  }
  if (player.state === 'invulnerable' && Math.floor(ticks / BLINK_TICKS) % 2 !== 0) return;
  drawSprite(ctx, SHIP_SPRITE, x, y);
}

/** Explosion frame for `ticks`, centered in the (x, y, width, height) rectangle. */
function drawExplosion(
  ctx: CanvasRenderingContext2D,
  ticks: number,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const frame = EXPLOSION_FRAMES[Math.floor(ticks / EXPLOSION_FRAME_TICKS)];
  if (!frame) return;
  // May stick out by a pixel for a narrower entity.
  drawSprite(
    ctx,
    frame,
    x + Math.floor((width - frame.width) / 2),
    y + Math.floor((height - frame.height) / 2),
  );
}
```

`drawEnemy` в ветке `exploding` вызывает `drawExplosion(ctx, enemy.stateTicks, x, y,
enemy.width, enemy.height)` — поведение и вызовы для врага не меняются (существующие
тесты взрывов это проверят). Doc-комментарий `drawBattle` дополнить состояниями
корабля. Выстрел игрока рисуется в любом состоянии корабля.

Для корабля 15 × 16 это даёт кадр 0 (11 × 9) в `(x + 2, y + 3)`, кадр 1 (13 × 9) — в
`(x + 1, y + 3)`.

## 6. Тесты

Все — Vitest, environment `node`, `dt = TICK_SECONDS`.

### 6.1 `src/game/player.test.ts` (изменить)

Импорты: `DOWN_TICKS`, `INVULNERABLE_TICKS` из `./player`, `SHIP_START_X` из `./ship`.
Хелпер в файле: `function run(player, n, intent = IDLE)`; `function downPlayer()` —
`new Player(new Ship(40))` (сдвинут от центра, чтобы проверка `SHIP_START_X`
была содержательной) + `hit()`.

Новый `describe('Player ship state')`:

- стартует `active`, `stateTicks = 0`, `canBeHit = true`, `canBeTargeted = true`;
- `hit()` → `down`, `stateTicks = 0`, `canBeHit = false`, `canBeTargeted = false`;
  `ship.x` не меняется (40);
- в `down` ввод игнорируется: `update` с `{ move: 1, fire: true }` — `ship.x === 40`,
  `shot === null`;
- выстрел, выпущенный до `hit()`, в `down` летит (`y` уменьшается на `SHOT_STEP`) и
  удаляется, уйдя за верх (`y = LAST_ON_SCREEN_Y` → `null`);
- `hit()` не снимает выстрел (`shot` тот же объект);
- после `DOWN_TICKS - 1` апдейтов — ещё `down`, `stateTicks === DOWN_TICKS - 1`,
  `ship.x === 40`;
- **тик возрождения, `IDLE`**: `DOWN_TICKS` апдейтов → `invulnerable`, `stateTicks = 0`,
  `ship.x === SHIP_START_X`, `canBeHit = false`, `canBeTargeted = true`;
- **тик возрождения, `{ move: 1, fire: true }`**: `DOWN_TICKS - 1` апдейтов `IDLE`, затем
  один с `{ move: 1, fire: true }` → `invulnerable`, `ship.x === SHIP_START_X + STEP`,
  выстрел создан у носа (`muzzleOf(player.ship)`);
- в `invulnerable` корабль двигается и стреляет (один апдейт `RIGHT`/`FIRE`);
- через `INVULNERABLE_TICKS` апдейтов после возрождения → `active`, `stateTicks = 0`,
  `canBeHit = true`; за тик до этого — ещё `invulnerable`, `stateTicks = 119`;
- **повторный `hit()` в `down` не сбрасывает таймер** (риск из анализа): `hit()`, 10
  апдейтов, `hit()` → `down`, `stateTicks === 10`; ещё `DOWN_TICKS - 10` апдейтов →
  `invulnerable` (ровно `DOWN_TICKS` после первого `hit()`);
- **`hit()` в `invulnerable` ничего не делает**: дойти до `invulnerable`, 10 апдейтов,
  `hit()` → `invulnerable`, `stateTicks === 10`, `ship.x` не тронут; ещё
  `INVULNERABLE_TICKS - 10` → `active`;
- после возвращения в `active` `hit()` снова работает → `down`.

### 6.2 `src/game/collisions.test.ts` (изменить)

Геометрия: корабль по умолчанию `x = 120, y = 208`, 15 × 16 (`120…135 × 208…224`);
`drone` 11 × 8. Хелпер `divingAt(w, i, x, y)` — `startDive({ sortieId: 1, side: 1 })`

- прямая установка `x`/`y`; хелпер `returningAt` — как в тесте `kills a returning
enemy` (20 апдейтов, `y = SCREEN_HEIGHT - 1`, апдейт → `returning`), затем установка
  координат. Новый `describe('resolveCollisions ram')`:

* таран без выстрела игрока: `diving` в `(122, 205)` → враг `exploding`,
  `player.state === 'down'`;
* `returning` в той же точке таранит;
* враг в `formation`, поставленный вручную в `(122, 205)`, не таранит
  (`formation`, корабль `active`);
* `exploding` (`diving` + `kill()`) и `dead` (`kill()` + `EXPLOSION_TICKS` апдейтов с
  `ENV`, затем установка координат) — не таранят;
* касание краями — не таран: `y = 200` (низ 208 = верх корабля) и `x = 109`
  (правый край 120 = левый край корабля); пересечение на 1 px (`y = 201`) — таран;
* в `down` и `invulnerable` тарана нет: `player.hit()` до вызова (для `invulnerable` —
  `hit()` + `DOWN_TICKS` апдейтов `IDLE`); враг остаётся `diving`;
* двое пикирующих пересекают корабль (`['DD']`, оба в `(122, 205)`) — гибнет первый по
  индексу, второй остаётся `diving`; корабль `down`;
* враг, сбитый выстрелом игрока в этом же тике, не таранит: пикирующий в `(122, 203)`
  (`203…211` — пересекает корабль), выстрел (`playerWithShot(204)`, столбец 127,
  `204…208`) в нём → враг `exploding`, выстрел снят, корабль `active`;
* существующий `does nothing without a shot` остаётся зелёным (правило 1 без выстрела
  ничего не делает; враг в `formation` не таранит).

`ENV` и `TICK_SECONDS` уже импортированы; добавить импорты `DOWN_TICKS` из `./player`,
`EXPLOSION_TICKS` из `./enemy`.

### 6.3 `src/game/battle.test.ts` (изменить)

Новый `describe('Battle ram')`:

- **сквозной таран через `update()`**: уровень `passiveLevel(['S..........'], {
firstDiveDelayTicks: 1 })`; `run` до `enemy.isOut` (с ограничителем, напр. 10 тиков);
  поставить врага на корабль (`x = ship.x + 2`, `y = SHIP_Y + 2` — с запасом против
  сдвига пилинга до 3 px); `battle.update(IDLE)` → враг `exploding`, `player.state ===
'down'`;
- **нет цели в `down`**: тот же уровень, `run(battle, 1 + P + 1)` (враг в `descend`,
  далеко от корабля по X), `player.hit()`, запомнить `enemy.x`, `run(battle, 10)` →
  `enemy.x` не изменился (`striker` — `track`, `targetX === null` → `vx = 0`), враг
  ещё `diving`.

Существующий `Battle aim` не трогать (враг к концу на y ≈ 165, тарана нет).

### 6.4 `src/game/battle-render.test.ts` (изменить)

Импорты: `BLINK_TICKS` из `./battle-render`, `DOWN_TICKS` из `./player`,
`SHIP_HEIGHT`, `SHIP_WIDTH` из `./ship`. Хелпер `shipExplosionCalls(battle, frame)` —
центрирование в `15 × 16` от `Math.floor(ship.x)`, `SHIP_Y`. Хелпер `run(battle, n)`
(`IDLE`). Все тесты на `newBattle()` (`ONE_CORNER_ENEMY`, вылетов нет) и сравнивают
полные списки вызовов (`[...enemyCalls(battle), ...ожидаемое для корабля]`).

Новый `describe('drawBattle ship states')`:

- инвариант: `expect(EXPLOSION_TICKS).toBeLessThan(DOWN_TICKS)`;
- в тике `hit()` (без апдейта): кадр 0 по центру корабля; явная сверка позиции:
  `shipExplosionCalls(...) == spriteCalls(EXPLOSION_FRAMES[0], 122, 211)`;
- через `EXPLOSION_FRAME_TICKS` апдейтов — кадр 1 в `(121, 211)`;
- на `EXPLOSION_TICKS - 1` — ещё кадр 1; на `EXPLOSION_TICKS` — корабля нет (только
  враги);
- выстрел игрока рисуется в `down`: `update(FIRE)`, `hit()`, `update(IDLE)` → вызовы
  выстрела, враги, кадр 0 взрыва (`stateTicks = 1`);
- `invulnerable`: после `DOWN_TICKS` апдейтов (`stateTicks = 0`) — спрайт в
  `SHIP_START_X`; ещё `BLINK_TICKS` — корабля нет; ещё `BLINK_TICKS` — снова спрайт;
- после возвращения в `active` (`DOWN_TICKS + INVULNERABLE_TICKS` апдейтов) — спрайт
  (берём шаг, где мигание дало бы «скрыто»: `INVULNERABLE_TICKS / BLINK_TICKS` нечётно
  → 116–119 скрыты, 120 — `active` и виден).

Существующие тесты взрыва врага остаются без изменений — проверяют, что вынос
`drawExplosion` не изменил вызовы.

## 7. Ручная проверка

`npm run dev`, начать игру (при необходимости — `?level=N` для частых вылетов):

- подставиться под пикирующего: одновременно взрываются враг и корабль, взрыв корабля
  читается и стоит на месте поражения;
- около 1 с корабля нет, клавиши не действуют; ранее выпущенный выстрел долетает и
  может сбить врага; пикирующие летят прямо вниз;
- корабль появляется по центру, заметно мигает ~2 с, двигается и стреляет; враги
  проходят сквозь него;
- после мигания таран снова срабатывает;
- уровень не перезапускается, строй продолжает жить; переход уровня во время `down`
  идёт параллельно.

## 8. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md` (на русском):

- `ship.ts` — `SHIP_START_X` (центр; старт и возрождение);
- `player.ts` — автомат корабля `active → down → invulnerable → active`, `ShipState`,
  `DOWN_TICKS = 60`, `INVULNERABLE_TICKS = 120`, `state`, `stateTicks`, `canBeHit`,
  `canBeTargeted`, `hit()` (только из `active`, таймер не сбрасывает, выстрел не
  снимает), правило тиков, возрождение в `SHIP_START_X` с обработкой intent тика;
- `collisions.ts` — правило 3 (таран), порядок правил, место правила 2 (012);
- `battle.ts` — `targetX = canBeTargeted ? центр : null` (убрать «пока всегда … — 011»);
- `battle-render.ts` — корабль по состоянию: взрыв (общий `drawExplosion` с врагами),
  мигание `BLINK_TICKS = 4`;
- граф импортов: `collisions → {ship, shot}`, `battle-render → {art, enemy, enemy-art,
sprite, shot, ship}` (`Battle`, `Enemy`, `Player` — type), `player → ship`
  (теперь и `SHIP_START_X`).

`README.md` в `src/game/` нет; `game-design.md` — механика уже описана в дизайне фичи,
не трогать. Запись фичи в `second-brain/features/` не трогать.

## Сводка по файлам

| Действие | Файл                                    |
| -------- | --------------------------------------- |
| Изменить | `src/game/ship.ts`                      |
| Изменить | `src/game/ship.test.ts`                 |
| Изменить | `src/game/player.ts`                    |
| Изменить | `src/game/player.test.ts`               |
| Изменить | `src/game/collisions.ts`                |
| Изменить | `src/game/collisions.test.ts`           |
| Изменить | `src/game/battle.ts`                    |
| Изменить | `src/game/battle.test.ts`               |
| Изменить | `src/game/battle-render.ts`             |
| Изменить | `src/game/battle-render.test.ts`        |
| Изменить | `second-brain/architecture/overview.md` |

Не меняются: `enemy.ts`, `wave.ts`, `scenes/*`, `main.ts`, движок.

Финальные проверки: `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build`.

## Архитектура и паттерны

- Логика (автомат `Player`, правило тарана) отдельно от рендера; рендер только читает
  `state`/`stateTicks`.
- Единое «Правило тиков переходов», как в `Enemy`: `enter()` ставит `stateTicks = 0`,
  `update` — счёт → переход → поведение нового состояния.
- Таймеры — целые тики (ADR 003), без `dt`; случайности нет.
- Граница engine/game не затрагивается; `import type` для `Player` в рендере и коллизиях.
- Порядок правил коллизий — в пользу игрока (выстрел раньше тарана).

## Открытые вопросы

нет (в `analyze.md` открытых вопросов нет).

## Ссылки

- `second-brain/tasks/tasks/011-player-ram/analyze.md`, `description.md`
- `CLAUDE.md`
- `second-brain/features/002-enemies-and-levels/design.md` — «Player — автомат
  корабля», «Правило тиков переходов», «Поток тика», «Интерфейсы», «Тесты»,
  «Уточнения для реализации» (взрыв, позиция взрыва, мигание), п. 7 нарезки; В5, В6
- `second-brain/architecture/overview.md`
- `second-brain/decisions/003-slow-speeds-tick-timers.md`
