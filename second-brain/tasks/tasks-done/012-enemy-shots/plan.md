# План реализации: Стрельба пикирующих врагов

С 3-го уровня враг в фазе `descend` стреляет вниз короткими выстрелами 1×4 (240 px/с,
свой цвет). На экране не больше 4 вражеских выстрелов, лишний «пропадает». Попадание в
`active` корабль поражает его как таран (автомат из 011); в `down`/`invulnerable` выстрелы
пролетают насквозь; при входе в `cleared` выстрелы исчезают. Всё — по `analyze.md` и
согласованному `design.md` фичи 002 (п. 8 нарезки, «Уточнения для реализации» → «Точные
правила», строка 012 «Появления API по задачам»). Отступлений от дизайна нет. Есть одно
внутреннее решение: в `DiveOrder` пока нет `aimOffsetX`, он появится в 013.

Порядок шагов: `enemy-shot` → `enemy-art` → `levels`/`test-levels` → `enemy` →
`attack-director` → `wave` → `collisions` → `battle` → `battle-render` → тесты →
документация. Шаги 3–5 меняют сигнатуры (`diverShots`, `DiveOrder.shots`,
`selectSortie(…, config, …)`), поэтому компиляция тестов чинится сразу в этих шагах (п. 10.1).
Базовая линия: 17 файлов, 303 теста, все зелёные.

## 1. `EnemyShot`

**Файл (создать):** `src/game/enemy-shot.ts`

По образцу `src/game/shot.ts`, но отдельный класс (решение дизайна; `shot.ts` не трогаем).

```typescript
import { SCREEN_HEIGHT } from '../config';

/** Enemy shot size in logical pixels: a thin vertical bar. */
export const ENEMY_SHOT_WIDTH = 1;
export const ENEMY_SHOT_HEIGHT = 4;
/**
 * Downward speed in px/s: 4 px/tick, a whole number (ADR 002).
 * Must exceed every level's diveSpeed, so a shot always pulls away from the enemy's nose.
 */
export const ENEMY_SHOT_SPEED = 240;

/** Enemy shot. Position is the top-left corner in logical pixels. Flies straight down. */
export class EnemyShot {
  /** `x` is fixed at launch: the shot does not follow the enemy. */
  constructor(
    readonly x: number,
    public y: number,
  ) {}

  update(dt: number): void {
    this.y += ENEMY_SHOT_SPEED * dt;
  }

  /** True once the whole shot is below the bottom edge of the screen. */
  get isOffscreen(): boolean {
    return this.y >= SCREEN_HEIGHT;
  }
}
```

## 2. Цвет вражеского выстрела

**Файл (изменить):** `src/game/enemy-art.ts`

В конец файла:

```typescript
/**
 * Enemy shot color (visual, starting value; owner approves). Not white (the player's
 * SHOT_COLOR), not the ship hull, not one of the star colors; reads well on black.
 */
export const ENEMY_SHOT_COLOR = '#ff5fd2';
```

Почему `#ff5fd2` (ярко-розовый): не совпадает с `#ffffff` (`SHOT_COLOR`), с корпусом корабля
`#ffd36b` и ни с одним из `STAR_COLORS` (`starfield.ts`: белый, `#ff5a3c`, `#5ad15a`, `#b884ff`,
`#ffd36b`, `#5ab4ff`). Тёплый и яркий, хорошо виден на чёрном фоне. Цвет окончательно
утверждается глазами (п. 11).

## 3. `diverShots` в таблице уровней

**Файл (изменить):** `src/game/levels.ts`

В `LevelConfig` после `maxSorties`:

```typescript
  /** Shots per dive for drone/striker, whole number >= 0; 0 = they do not shoot. */
  readonly diverShots: number;
```

Комментарий интерфейса «More fields arrive with later tasks.» оставить: `raiderShots`
добавит задача 013. В `LEVELS` добавить `diverShots: 0` уровням 1 и 2 и `diverShots: 1`
уровню 3.

**Файл (изменить):** `src/game/test-levels.ts`. В `PASSIVE` добавить `diverShots: 0`.
Комментарий «fields added by tasks 007-013» уже подходит.

## 4. Расписание стрельбы в `Enemy`

**Файл (изменить):** `src/game/enemy.ts`

Импорты: добавить `import { SHIP_Y } from './ship';`. Это новая зависимость `enemy → ship`,
цикла нет: `ship → {config, art, shot}`.

Константы и типы:

```typescript
/** Whole explosion, ticks: 16. */
export const EXPLOSION_TICKS = EXPLOSION_FRAMES.length * EXPLOSION_FRAME_TICKS;
```

(Убрать устаревшее «Later must stay < DOWN_TICKS (task 011)»: инвариант уже проверяет
`battle-render.test.ts` → `the ship explosion ends before the respawn`.)

```typescript
/** Ticks between two shots of one diver (owner decision В2). */
export const ENEMY_FIRE_INTERVAL_TICKS = 20;

/** Who launches a dive, which way it peels off and how many shots it may fire. `aimOffsetX` comes in task 013. */
export interface DiveOrder {
  readonly sortieId: number;
  readonly side: -1 | 1;
  /** Shots for this dive, whole number >= 0. */
  readonly shots: number;
}
```

Поле класса: `private shotsLeft = 0;`. В `startDive` после `this.side = order.side;`
добавить `this.shotsLeft = order.shots;`. Новый вылет берёт число выстрелов нового
приказа, счётчик с прошлого вылета не переносится.

`update` возвращает `boolean`. TS не должен требовать финальный `return`, поэтому ветки,
которые не стреляют, делают `break`, а в конце стоит один `return false`:

```typescript
  /**
   * Tick rule: count the tick, apply the timer transition, then act in the (new) state.
   * formation: follow the slot. diving: peel, then descend (may fire). returning: back into the
   * slot. exploding: stand still, become dead after EXPLOSION_TICKS. dead: nothing.
   * Returns true on a tick the enemy fires (only in 'descend'); the wave creates the shot.
   */
  update(dt: number, env: EnemyEnv): boolean {
    if (this.currentState === 'dead') return false;
    this.ticksInState++;
    switch (this.currentState) {
      case 'exploding':
        if (this.ticksInState >= EXPLOSION_TICKS) this.enter('dead');
        break;
      case 'formation':
        this.x = this.slotX();
        this.y = this.slotY();
        break;
      case 'diving':
        return this.updateDiving(dt, env);
      case 'returning':
        this.updateReturning(dt);
        break;
    }
    return false;
  }
```

`updateDiving` тоже возвращает `boolean`. Порядок по «Точным правилам»: (первый тик —
цель `fixed`) → сдвиг X/Y, зажим X → уход за низ → решение о выстреле по новой позиции:

```typescript
  /**
   * Ticks 1..PEEL_TICKS: peel segment by stateTicks. Then descend at diveSpeed, steering on X
   * towards aimX (fixed: taken on tick PEEL_TICKS + 1; track: env.targetX of this tick), and
   * fire by the schedule (see fires()). Leaving past the bottom ends the descend without a shot.
   */
  private updateDiving(dt: number, env: EnemyEnv): boolean {
    // ...peel / descend move and clamp — unchanged...
    if (this.y >= SCREEN_HEIGHT) {
      // Gone past the bottom: reappear right above the current slot.
      this.enter('returning');
      this.x = this.slotX();
      this.y = -this.height;
      return false;
    }
    return this.ticksInState > PEEL_TICKS && this.fires();
  }

  /**
   * 'descend' fire schedule: ticks D, D + 20, D + 40, … (D = PEEL_TICKS + 1, the first descend
   * tick) while shots are left and the enemy's bottom is not below the ship's top
   * (checked after this tick's move). A fired shot is spent even if the wave drops it
   * (MAX_ENEMY_SHOTS). Below SHIP_Y the enemy only goes further down, so later shots never come.
   */
  private fires(): boolean {
    if (this.shotsLeft <= 0) return false;
    if ((this.ticksInState - (PEEL_TICKS + 1)) % ENEMY_FIRE_INTERVAL_TICKS !== 0) return false;
    if (this.y + this.height > SHIP_Y) return false;
    this.shotsLeft--;
    return true;
  }
```

Стрельба не зависит от `env.targetX`: враги стреляют и при `targetX === null`, то есть когда
корабль в `down`.

Doc-комментарий класса: после строки про `'descend'` добавить
` * In 'descend' it also fires by the order's shots (see fires()); update() returns true then.`

Существующие вызовы `enemy.update(...)` в тестах игнорируют результат. Это допустимо:
для не-Promise значений правила ESLint на это нет.

## 5. Приказ несёт `diverShots`

**Файл (изменить):** `src/game/attack-director.ts`

```typescript
/**
 * Pure. Candidates: … (без изменений) … Uniform pick via rng; null (rng untouched) when nobody
 * can go. The order carries config.diverShots. Raider groups - task 013.
 */
export function selectSortie(
  enemies: readonly Enemy[],
  cols: number,
  config: LevelConfig,
  sortieId: number,
  rng: Rng,
): Sortie | null {
  const candidates = edgeCandidates(enemies, cols);
  if (candidates.length === 0) return null;
  const pick = candidates[randomInt(rng, 0, candidates.length)]!;
  return {
    members: [pick.enemy],
    orders: [{ sortieId, side: pick.side, shots: config.diverShots }],
  };
}
```

В `AttackDirector.update`:
`selectSortie(enemies, cols, this.config, this.nextSortieId, rng)`. `LevelConfig` уже
импортирован как `import type`, этого хватает.

## 6. Выстрелы в `Wave`

**Файл (изменить):** `src/game/wave.ts`

```typescript
import { EnemyShot } from './enemy-shot';

/** Enemy shots on screen at once (owner decision В2); a shot over the limit is lost. */
export const MAX_ENEMY_SHOTS = 4;

/**
 * One level's worth of enemies and their shots: built from a LevelConfig, thrown away as a
 * whole on level change.
 */
export class Wave {
  // ...
  private readonly enemyShots: EnemyShot[] = [];

  /** Enemy shots in creation order. A live view: copy it before mutating the wave in a loop. */
  get shots(): readonly EnemyShot[] {
    return this.enemyShots;
  }

  /**
   * Tick order: formation sway -> enemy shots fly, those past the bottom are removed ->
   * every enemy (reads this tick's slots and targetX; one that fires gets a shot from the
   * center of its bottom edge if fewer than MAX_ENEMY_SHOTS are out) -> attack director
   * (a newly launched enemy stands in this tick's slot and takes its first peel step next tick).
   * A new shot does not move on its first tick; a slot freed by a shot leaving is free this tick.
   * targetX: center X of the ship, or null when there is nothing to aim at.
   */
  update(dt: number, targetX: number | null): void {
    this.formation.update(dt);
    this.updateShots(dt);
    const env: EnemyEnv = { diveSpeed: this.config.diveSpeed, targetX };
    for (const enemy of this.enemies) {
      const fired = enemy.update(dt, env);
      if (fired && this.enemyShots.length < MAX_ENEMY_SHOTS) {
        this.enemyShots.push(shotFrom(enemy));
      }
    }
    this.director.update(this.enemies, this.formation.cols, this.rng);
  }

  /** Removes one shot (it hit the ship); unknown shots are ignored. */
  removeShot(shot: EnemyShot): void {
    const i = this.enemyShots.indexOf(shot);
    if (i >= 0) this.enemyShots.splice(i, 1);
  }

  /** Removes every enemy shot (the wave is cleared). */
  clearShots(): void {
    this.enemyShots.length = 0;
  }

  /** Moves the shots and drops those past the bottom, in place, keeping the order. */
  private updateShots(dt: number): void {
    let kept = 0;
    for (const shot of this.enemyShots) {
      shot.update(dt);
      if (!shot.isOffscreen) this.enemyShots[kept++] = shot;
    }
    this.enemyShots.length = kept;
  }
}

/** A shot under the center column of the drawn sprite, at the enemy's nose. */
function shotFrom(enemy: Enemy): EnemyShot {
  return new EnemyShot(Math.floor(enemy.x) + Math.floor(enemy.width / 2), enemy.y + enemy.height);
}
```

`Enemy` уже импортирован как значение, для типа в `shotFrom` этого хватает. Массив один
на всю жизнь волны и меняется на месте, поэтому геттер `shots` всегда отдаёт актуальное
состояние.

## 7. Правило 2 коллизий

**Файл (изменить):** `src/game/collisions.ts`

Импорт: `import { ENEMY_SHOT_HEIGHT, ENEMY_SHOT_WIDTH } from './enemy-shot';`.

Doc-комментарий `resolveCollisions`, пункт 2:

```
 * 2. Enemy shot: while the ship can be hit, the first shot in wave.shots order that overlaps
 *    the ship is removed and the ship is hit; at most one per tick.
 * 3. Ram: … (без изменений) …
 * Rule 1 goes first: an enemy shot down this tick is already exploding and cannot ram.
 * Rules 2 and 3 share one hit per tick: after a shot hit the ship can no longer be hit, so a
 * would-be rammer survives and flies on. Player and enemy shots never interact.
```

```typescript
export function resolveCollisions(player: Player, wave: Wave): void {
  hitByPlayerShot(player, wave);
  hitByEnemyShot(player, wave);
  ram(player, wave);
}

function hitByEnemyShot(player: Player, wave: Wave): void {
  if (!player.canBeHit) return;
  const ship = shipRect(player);
  for (const shot of wave.shots) {
    const rect: Rect = { x: shot.x, y: shot.y, width: ENEMY_SHOT_WIDTH, height: ENEMY_SHOT_HEIGHT };
    if (!overlaps(ship, rect)) continue;
    wave.removeShot(shot);
    player.hit();
    return; // the loop stops right after the removal
  }
}

/** The ship's hitbox: its sprite rectangle. */
function shipRect(player: Player): Rect {
  const { ship } = player;
  return { x: ship.x, y: ship.y, width: SHIP_WIDTH, height: SHIP_HEIGHT };
}
```

В `ram` вместо локального `shipRect` вызвать `shipRect(player)`. Поведение тарана не
меняется. Ради `canBeHit` в таране ничего добавлять не нужно: проверка там уже есть.

## 8. Очистка выстрелов при входе в `cleared`

**Файл (изменить):** `src/game/battle.ts`

Из doc-комментария `updatePhase` убрать «Clearing enemy shots on entering 'cleared' arrives
in task 012.» и вписать в первую строку правило:

```typescript
  /**
   * playing -> cleared once every enemy is dead (phaseTicks = 0 on that tick; enemy shots
   * still in flight are removed); cleared -> playing with the next level's wave when phaseTicks
   * reaches LEVEL_PAUSE_TICKS.
   * The new wave is drawn this tick at its start positions and first updated next tick.
   */
  private updatePhase(): void {
    if (this.currentPhase === 'playing') {
      if (this.currentWave.isCleared) {
        this.currentPhase = 'cleared';
        this.phaseTicks = 0;
        this.currentWave.clearShots();
      }
      return;
    }
    // ...без изменений
  }
```

В `cleared` `wave.update` продолжает вызываться, но живых врагов нет, поэтому новых
выстрелов не появится. Новая волна стартует с пустым `shots`.

## 9. Слой вражеских выстрелов в рендере

**Файл (изменить):** `src/game/battle-render.ts`

Импорты: `ENEMY_SHOT_COLOR` из `./enemy-art` (вместе с `EXPLOSION_FRAMES`),
`ENEMY_SHOT_HEIGHT, ENEMY_SHOT_WIDTH` из `./enemy-shot`.

```typescript
/**
 * Draws the battle entities, back to front: enemy shots, player shot, enemies, ship.
 * No background. … (остальное без изменений)
 */
export function drawBattle(ctx: CanvasRenderingContext2D, battle: Battle): void {
  for (const enemyShot of battle.wave.shots) {
    ctx.fillStyle = ENEMY_SHOT_COLOR;
    ctx.fillRect(
      Math.floor(enemyShot.x),
      Math.floor(enemyShot.y),
      ENEMY_SHOT_WIDTH,
      ENEMY_SHOT_HEIGHT,
    );
  }
  const { shot } = battle.player;
  // ...дальше без изменений
}
```

## 10. Тесты

Все тесты на Vitest в environment `node`. Время задаётся `TICK_SECONDS`, `P` = сумма
`PEEL_SEGMENTS.ticks` = 14, `D` = `P + 1`, первый тик `descend` после `startDive`.

### 10.1 Починка компиляции (сигнатуры)

- **`src/game/enemy.test.ts`, `src/game/collisions.test.ts`, `src/game/attack-director.test.ts`:** во
  все 27 вызовов `startDive({ sortieId, side })` добавить `shots: 0`. Проверка:
  `grep -rn "startDive(" src | grep test.ts` → у каждого есть `shots`.
- **`src/game/attack-director.test.ts`:** хелпер `pick` и два прямых вызова `selectSortie` получают
  `config` третьим аргументом (`passiveLevel(['DD'])` или по раскладке теста). В тесте
  `builds a one-member sortie with the given id` ожидаемый приказ меняется на
  `{ sortieId: 42, side: -1, shots: 0 }`.
- **`src/game/levels.test.ts`:** в `has the agreed rows` добавить `diverShots: 0 / 0 / 1`.

### 10.2 `src/game/enemy-shot.test.ts` (создать)

- `update(TICK_SECONDS)` сдвигает `y` ровно на +4, `x` не меняется (два тика подряд: +4, +8).
- `isOffscreen`: `y = SCREEN_HEIGHT - 1` даёт `false`, `y = SCREEN_HEIGHT` даёт `true`.
  `y` задаётся прямой установкой.
- `Number.isInteger(ENEMY_SHOT_SPEED * TICK_SECONDS)` и значение 4. Размеры 1×4.

### 10.3 `src/game/enemy.test.ts` (изменить): `describe('Enemy fire')`

Хелперы:

```typescript
/** stateTicks of the ticks on which update() returned true, over n updates. */
function fireTicks(enemy: Enemy, n: number, env: EnemyEnv = ENV): number[] {
  const ticks: number[] = [];
  for (let i = 0; i < n; i++) if (enemy.update(TICK_SECONDS, env)) ticks.push(enemy.stateTicks);
  return ticks;
}
```

Сценарии (враг из `newEnemyOf('drone')`, `ENV` с `diveSpeed: 60` даёт 1 px/тик; отдельные
кейсы для `striker` или через `it.each` по видам):

- `shots: 1`: за `P` тиков (peel) ни одного `true`. Первый `true` приходит в тике
  `stateTicks === P + 1`, после него до ухода вниз больше ничего.
- `shots: 3`: `fireTicks` за `P + 1 + 60` тиков даёт `[D, D + 20, D + 40]`
  (`D + ENEMY_FIRE_INTERVAL_TICKS` и т. д.). Проверить, что `ENEMY_FIRE_INTERVAL_TICKS === 20`.
- `shots: 0`: ни одного `true` за весь вылет до `returning` (цикл до смены состояния).
- Стрельба без цели: при `targetX: null` и при числовом `targetX` результаты совпадают.
- Граница по `SHIP_Y`. Решение принимается по позиции **после** сдвига: после `P` тиков
  ставим `enemy.y = SHIP_Y - enemy.height - 1`. В тике `D` враг сдвигается на 1 px,
  получается `y + height === SHIP_Y`, будет `true`. Второй кейс: `enemy.y = SHIP_Y - enemy.height`.
  До сдвига стрелять ещё можно, после сдвига низ на 1 px ниже, будет `false`. Значит, проверка
  идёт после сдвига. Во втором кейсе с `shots: 2` в `D + 20` тоже `false`: плановые выстрелы
  не возобновляются.
- Уход за низ в тике `D` (`enemy.y = SCREEN_HEIGHT - 1` перед тиком): состояние
  `returning`, `false`.
- `formation` (`shots` у врага в строю не задан): всегда `false`. В `returning` после
  `toReturning`: `false` во всех тиках до возврата в строй. `exploding`: `kill()` в `descend`
  перед плановым тиком, дальше `false` до `dead`. `dead`: `false`.
- Новый вылет берёт `shots` нового приказа. Первый вылет с `shots: 3` уходит за низ после
  одного выстрела (`y` у нижнего края сразу после `D`), возвращается в строй (`toReturning`
  или ручное доведение). Второй вылет с `shots: 1` стреляет ровно один раз в своём `D`.
  Обратный вариант: первый `shots: 1`, второй `shots: 0`, во втором ни одного `true`.

### 10.4 `src/game/attack-director.test.ts` (изменить)

- Приказ несёт `diverShots` уровня:
  `selectSortie(enemies, cols, passiveLevel(['DD'], { diverShots: 3 }), 42, rng)?.orders`
  равен `[{ sortieId: 42, side: -1, shots: 3 }]` (при `counting(0)`).

### 10.5 `src/game/wave.test.ts` (изменить): `describe('Wave enemy shots')`

Хелпер: волна на `passiveLevel([...])`, ручные `startDive` у `wave.enemies[i]` с нужным
`shots`, `wave.update(TICK_SECONDS, null)`. При `targetX = null` враг не рулит по X.

```typescript
const P = PEEL_SEGMENTS.reduce((sum, s) => sum + s.ticks, 0);
function run(wave: Wave, n: number): void {
  for (let i = 0; i < n; i++) wave.update(TICK_SECONDS, null);
}
```

- Выстрел создаётся в тике `D`. Волна `['D']`, `startDive({ sortieId: 1, side: 1, shots: 1 })`.
  После `P` тиков `wave.shots` пуст, после `P + 1` в нём ровно один выстрел с
  `x === Math.floor(enemy.x) + Math.floor(enemy.width / 2)` и `y === enemy.y + enemy.height`
  (в тике появления выстрел не сдвинут). Ещё тик: `y` на +4 от прежнего, `x` прежний.
  Тот же кейс для `['S']`: смещение +6.
- Нет приказа, нет выстрелов. За 600 тиков `passiveLevel` с `firstDiveDelayTicks: 1` (вылеты
  с `diverShots: 0`) `shots` всегда пуст.
- Лимит и «выстрел пропал». Волна `['DDDDD']`. Враги 0–3 вылетают с `shots: 1`, враг 4 с
  `shots: 2`, все в одном тике. После `P + 1` тиков `shots.length === MAX_ENEMY_SHOTS` (4),
  их `x` — столбцы врагов 0–3 в порядке волны, у врага 4 выстрела нет. Дальше
  `wave.clearShots()`. В тике `D + 20` появляется ровно 1 выстрел, в столбце врага 4.
  В тике `D + 40` их по-прежнему 1: выстрел, отброшенный лимитом в `D`, израсходовал
  счётчик. Враги к этому моменту выше `SHIP_Y` (около 40 px вниз при 1 px/тик).
- Слот, освобождённый уходом за низ, свободен в том же тике. Та же расстановка (0–3 с
  `shots: 1`, 4 с `shots: 2`). Прогон до `D + 19`: 4 выстрела, все на экране. Затем
  `wave.shots[0]!.y = SCREEN_HEIGHT - 4`. Тик `D + 20`: этот выстрел ушёл и удалён,
  выстрел врага 4 создан, `shots.length === 4`, последний — в столбце врага 4,
  `wave.shots` не содержит старого первого выстрела.
- Ушедшие за низ удаляются: `shot.y = SCREEN_HEIGHT - 4`, тик, `shots` пуст.
  `shot.y = SCREEN_HEIGHT - 5`, тик: выстрел остаётся (`y === SCREEN_HEIGHT - 1`).
- `removeShot(shot)` удаляет именно его, порядок остальных сохраняется. Неизвестный выстрел
  (`new EnemyShot(0, 0)`) игнорируется. `clearShots()` даёт пустой `shots`.
- Детерминизм на стреляющем уровне. Две `Wave(LEVELS[2]!, createRng(7))`, 600 тиков с
  `SHIP_CENTER_X`. Снимок `enemies` и `shots.map((s) => [s.x, s.y])` совпадает. Флаг
  «хоть раз видели выстрел» = `true`.

### 10.6 `src/game/collisions.test.ts` (изменить): `describe('resolveCollisions enemy shots')`

Публичного «добавить выстрел» у `Wave` нет и не нужно, выстрел получаем честно:

```typescript
/**
 * Wave of n drones in one row: all dive with one shot and stand at x = enemyX on the first
 * descend tick, so every shot is in column floor(enemyX) + 5. Returns the wave after tick D.
 */
function waveWithShots(n: number, enemyX = 120): Wave {
  const w = wave(['D'.repeat(n)]);
  for (const e of w.enemies) e.startDive({ sortieId: 1, side: 1, shots: 1 });
  for (let t = 0; t < P; t++) w.update(TICK_SECONDS, null);
  for (const e of w.enemies) e.x = enemyX;
  w.update(TICK_SECONDS, null);
  expect(w.shots).toHaveLength(n);
  return w;
}
```

(`P` из `PEEL_SEGMENTS`. Корабль по умолчанию: `x = 120`, `y = 208`, 15×16. Выстрел в
столбце 125.)

- Попадание. `shots[0].y = 205` (205…209 пересекает 208), `player = new Player()`.
  После `resolveCollisions` `w.shots` пуст, `player.state === 'down'`.
- Касание краями не считается. `y = 204` (низ = 208) даёт выстрел на месте и `active`.
  По X: `ship.x = 110` (110…125, столбец 125 не входит), `y = 210`, выстрел на месте,
  `active`. Контрольный кейс `ship.x = 111` даёт попадание.
- `down` и `invulnerable` (как в тесте тарана: `hit()`, затем `DOWN_TICKS` апдейтов игрока):
  выстрел пересекает корабль, остаётся в `w.shots`, состояние игрока не меняется.
- Два пересекающих выстрела (`waveWithShots(2)`, оба `y = 205`): после `resolveCollisions`
  остался один, тот, что был вторым (`toBe(second)`). Копию массива снять до вызова:
  `const [first, second] = [...w.shots]`.
- Выстрел и таран в одном тике дают одно поражение. `waveWithShots(1)`, выстрел
  `y = 205`. Сам стрелявший враг (он в `diving`) переставлен на `(122, 205)`, то есть
  таранит. Итог: выстрел удалён, `player.state === 'down'`, враг `diving` (жив).
- Выстрел игрока и вражеский не взаимодействуют. `waveWithShots(1, 122)`, вражеский
  выстрел в столбце 127, `y = 100`. `playerWithShot(100)`: столбец 127, те же Y. Враг
  переставлен далеко (`y = 40`), его выстрел игрока не задевает. После `resolveCollisions`
  оба выстрела на месте, `player.state === 'active'`.

### 10.7 `src/game/levels.test.ts` (изменить)

- В `level %i dive fields follow the speed and timer rules`: `diverShots` целое и `≥ 0`
  (отдельно от цикла `≥ 1`).
- `it.each` по `LEVELS`: `level %i: an enemy shot outruns the dive`,
  `ENEMY_SHOT_SPEED > config.diveSpeed`.
- Рядом с туннелированием выстрела игрока одиночный тест «an enemy shot cannot tunnel through
  the ship»: `ENEMY_SHOT_SPEED * TICK_SECONDS < ENEMY_SHOT_HEIGHT + SHIP_HEIGHT` (корабль по
  Y не движется).

### 10.8 `src/game/battle.test.ts` (изменить): `describe('Battle enemy shots')`

- `clearShots` при входе в `cleared`. `new Battle(createRng(1), { levels: ONE_CORNER_ENEMY })`,
  `battle.wave.enemies[0]!.startDive({ sortieId: 1, side: 1, shots: 1 })`, `run(battle, P + 1)`,
  в `wave.shots` 1 выстрел. Затем `enemy.kill()`. После `run(battle, EXPLOSION_TICKS - 1)`
  фаза `playing`, выстрел ещё есть. Ещё один тик: фаза `cleared`, `wave.shots` пуст,
  `player.state === 'active'`. Угловой враг (x ≈ 42) далеко от корабля, за 16 тиков выстрел
  не долетает.
- Сквозной сценарий (`update` → коллизии). Тот же уровень и `startDive(..., shots: 1)`, `run(battle, P)`,
  затем враг переставлен над кораблём: `enemy.x = battle.player.ship.x + 2`. Центр
  совпадает с `targetX` (127), drone не рулит. Дальше гонять `run(battle, 1)`, пока
  `player.state === 'active'`, но не больше 60 тиков. Ожидание: корабль в `down`,
  выстрел исчез, враг жив (`diving`): выстрел долетает примерно за 42 тика, а враг
  (1 px/тик) до корабля дойти не успевает.

### 10.9 `src/game/battle-render.test.ts` (изменить)

- Вражеский выстрел — первый слой. `newBattle()`, `startDive({ …, shots: 1 })` на
  единственном враге, `run(battle, P + 1)`, `const s = battle.wave.shots[0]!`. Ожидается
  `calls` равен `[{ fillStyle: ENEMY_SHOT_COLOR, x: Math.floor(s.x), y: Math.floor(s.y),
w: ENEMY_SHOT_WIDTH, h: ENEMY_SHOT_HEIGHT }, ...enemyCalls(battle), ...shipCalls(…)]`.
- Порядок с выстрелом игрока. Тот же сценарий, на последнем тике `FIRE`. Порядок: вражеский
  выстрел, выстрел игрока (`SHOT_COLOR`), враги, корабль.
- `ENEMY_SHOT_COLOR !== SHOT_COLOR` и не равен цвету корпуса корабля (`#ffd36b`; или
  через `SHIP_SPRITE.pixels`, если там это удобно).
- Существующие тесты не меняются: на пассивных таблицах выстрелов нет.

## 11. Ручная проверка

`npm run dev`, затем открыть `http://localhost:5173/?level=3` и нажать Enter.

- Пикирующие после дуги стреляют, через 20 тиков иногда второй раз (на уровне 3 —
  1 выстрел за вылет, значит, один). Выстрел сразу отрывается от носа врага и виден целиком.
- Цвет выстрела отличим от своего белого выстрела, от звёзд и от корабля.
- Попадание поражает корабль: взрыв, пауза, возрождение с миганием. Во время мигания
  выстрелы пролетают насквозь.
- Свой выстрел и вражеский друг друга не сбивают.
- Когда уровень пройден, оставшиеся вражеские выстрелы исчезают сразу.
- `?level=1` и `?level=2`: враги не стреляют.

## 12. Проверки

`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Всё
зелёное. При ошибках `format:check` выполнить `npm run format`.

## 13. Обновление документации

**Файл (изменить):** `second-brain/architecture/overview.md` (на русском)

- Новый пункт `enemy-shot.ts`: `EnemyShot(x, y)`, 1×4, `ENEMY_SHOT_SPEED = 240` (4 px/тик,
  быстрее любого `diveSpeed`), `x` фиксирован, `isOffscreen` — `y >= SCREEN_HEIGHT`.
  Импортирует `config`.
- `levels.ts`: поле `diverShots` в перечне `LevelConfig`, значения 0/0/1.
- `enemy-art.ts`: `ENEMY_SHOT_COLOR`.
- `enemy.ts`: `DiveOrder { sortieId, side, shots }`, `ENEMY_FIRE_INTERVAL_TICKS = 20`,
  расписание `D, D + 20, …` при `y + height <= SHIP_Y` по позиции после сдвига,
  выстрел расходуется даже при лимите, `update` возвращает `boolean` (`true` только в
  `descend`). Импорт `ship` (`SHIP_Y`).
- `attack-director.ts`: `selectSortie(enemies, cols, config, sortieId, rng)`, в приказе
  `shots = config.diverShots`.
- `wave.ts`: `MAX_ENEMY_SHOTS = 4`, `shots`/`removeShot`/`clearShots`. Новый порядок тика:
  строй → выстрелы → враги (создание с лимитом) → директор.
- `collisions.ts`: правило 2 вместо «задача 012», одно поражение за тик на правила 2 и 3.
- `battle.ts`: `clearShots()` при входе в `cleared`.
- `battle-render.ts`: слои «вражеские выстрелы → выстрел игрока → враги → корабль».
- `test-levels.ts`: `diverShots = 0` в пассивных значениях.
- Граф импортов: `enemy-shot → config`, `wave → {…, enemy-shot}`,
  `collisions → {ship, shot, enemy-shot}`, `battle-render → {…, enemy-shot}`,
  `enemy → {config, enemy-art, ship}`.

`README.md` в корне модули не перечисляет, менять не нужно. `game-design.md` обновит задача
013 (границы задачи). Запись фичи в `second-brain/features/` не трогаем.

## Сводка по файлам

| Действие | Файл                                    |
| -------- | --------------------------------------- |
| Создать  | `src/game/enemy-shot.ts`                |
| Создать  | `src/game/enemy-shot.test.ts`           |
| Изменить | `src/game/enemy-art.ts`                 |
| Изменить | `src/game/levels.ts`                    |
| Изменить | `src/game/levels.test.ts`               |
| Изменить | `src/game/test-levels.ts`               |
| Изменить | `src/game/enemy.ts`                     |
| Изменить | `src/game/enemy.test.ts`                |
| Изменить | `src/game/attack-director.ts`           |
| Изменить | `src/game/attack-director.test.ts`      |
| Изменить | `src/game/wave.ts`                      |
| Изменить | `src/game/wave.test.ts`                 |
| Изменить | `src/game/collisions.ts`                |
| Изменить | `src/game/collisions.test.ts`           |
| Изменить | `src/game/battle.ts`                    |
| Изменить | `src/game/battle.test.ts`               |
| Изменить | `src/game/battle-render.ts`             |
| Изменить | `src/game/battle-render.test.ts`        |
| Изменить | `second-brain/architecture/overview.md` |

Не меняются: `player.ts`, `ship.ts`, `shot.ts`, `art.ts`, `formation.ts`, сцены, `main.ts`,
`engine/`.

Уборка заглушек: `enemy.ts:23` («Later must stay < DOWN_TICKS (task 011)»), `enemy.ts:57`
(«`shots` (012) … come later»), `wave.ts:11`, `collisions.ts:31`, `battle.ts:76`. Проверка
после реализации: `grep -rn "012" src` ничего не находит.

## Архитектура и паттерны

- Детерминизм: стрельба не использует `Rng`. Таймеры — целые тики (ADR 003), скорость
  выстрела — целые 4 px/тик (ADR 002).
- Логика отдельно от рендера. Враг только сообщает «стреляю» (`boolean`), волна создаёт
  выстрел и держит лимит, коллизии — отдельный модуль, рендер читает `wave.shots`.
- Граница engine/game не меняется. Новые зависимости: только `enemy → ship` и `→ enemy-shot`,
  циклов нет.
- Хелперы тестов честные: выстрелы появляются через `startDive` и `update`, без тестового
  API в `Wave`. Мутируются только публичные `y`/`x` (`EnemyShot.y`, `Enemy.x/y`, `Ship.x`).
- `import type` для типов. В `wave.ts` `Enemy` уже импортирован как значение.
- Производительность: не больше 4 выстрелов, каждый проверяется против одного корабля.

## Открытые вопросы

нет (в `analyze.md` открытых вопросов тоже нет). `ENEMY_SHOT_COLOR = '#ff5fd2'` — стартовое
значение, выбранное по ограничениям дизайна; владелец утверждает его глазами на `?level=3`.

## Ссылки

- `second-brain/tasks/tasks/012-enemy-shots/analyze.md`
- `second-brain/tasks/tasks/012-enemy-shots/description.md`
- `CLAUDE.md`
- `second-brain/architecture/overview.md`
- `second-brain/decisions/002-integer-speeds.md`, `second-brain/decisions/003-slow-speeds-tick-timers.md`
- `second-brain/features/002-enemies-and-levels/design.md`: «Интерфейсы», «Поток тика»,
  «Уточнения для реализации» → «Точные правила», «Появление API по задачам» (012),
  «Нарезка на задачи» (п. 8)
- `second-brain/features/002-enemies-and-levels/discussion.md`: В2, 240 px/с
