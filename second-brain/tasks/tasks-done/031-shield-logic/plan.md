# План реализации: Щит вместо запаса жизней — логика

Запас кораблей (фича 005) заменяется одним кораблём со щитом `0…MAX_SHIELD`: удар по
щиту — `shield − 1` и 2 с `invulnerable` на месте, удар без щита — `down` (конечное) и
через `GAME_OVER_DELAY_TICKS` — `over`. Щит растёт от капсулы `L` и порогов счёта (не в
`down`). Отрисовка временная: иконки кораблей в панели показывают `shield`. Рамка —
согласованный `second-brain/features/008-ship-shield/design.md` (раунд 3), отступлений от
интерфейсов нет.

План в двух файлах: здесь — код (`src/`, шаги 1–11); в `plan-part2.md` — тесты по
файлам, документы, `acceptance.md`, финальный поиск и проверки, сводка по файлам.

Код: ветка `feature/008-ship-shield`, база `33e77e7`. Номера строк — по ней.

## 1. `Player`: щит и новый автомат

**Файл (изменить):** `src/game/player.ts`

- Импорт `ship.ts`: `SHIP_START_X` больше не нужен → `import { Ship } from './ship';`
  (`import type { MoveDir }` остаётся).
- Константы (`:9–22`) заменить:

```typescript
/**
 * Ship states: active -hit(), shield > 0-> invulnerable -INVULNERABLE_TICKS-> active;
 * active -hit(), shield = 0-> down, terminal (isLost): the battle ends the game.
 */
export type ShipState = 'active' | 'down' | 'invulnerable';
/** Blinking, untouchable but controllable after a shield hit, ticks (feature 008, В4: 2 s). */
export const INVULNERABLE_TICKS = 120;
/** Shield level at the start: survives 2 hits, the 3rd one ends the game (feature 008, В1). */
export const START_SHIELD = 2;
/** Cap for addShield (В1); LIVES_ICON_SLOTS >= MAX_SHIELD is checked by a test. */
export const MAX_SHIELD = 5;
```

`DOWN_TICKS`, `START_LIVES`, `MAX_LIVES` удаляются.

- JSDoc класса (`:37–51`) — строки про состояния переписать:

```typescript
 * Power-ups (grantPowerUp) stay until the game ends: hit() keeps them.
 * Shield: an integer 0..MAX_SHIELD. Ship state: active --hit(), shield > 0--> invulnerable
 * [shield - 1] --INVULNERABLE_TICKS--> active; active --hit(), shield = 0--> down, terminal.
 * down (isLost): intent is ignored, no hits, no target, only the shots in flight keep flying;
 * the battle ends the game.
 * invulnerable: stays where it was hit, controllable and targetable, but cannot be hit.
```

- Поле `private livesLeft: number` → `private shieldLevel: number`.
- Конструктор:

```typescript
  /** shield: an integer in 0..MAX_SHIELD, throws RangeError otherwise. */
  constructor(ship: Ship = new Ship(), shield: number = START_SHIELD) {
    if (!Number.isInteger(shield) || shield < 0 || shield > MAX_SHIELD) {
      throw new RangeError(`shield must be an integer in 0..${MAX_SHIELD}, got ${shield}`);
    }
    this.ship = ship;
    this.shieldLevel = shield;
  }
```

- Геттеры `lives`/`isLost` (`:100–108`) заменить:

```typescript
  /** Shield level 0..MAX_SHIELD; drops on the hit tick. Hits survivable = shield. */
  get shield(): number {
    return this.shieldLevel;
  }

  /** The only ship is down: terminal, stateTicks keeps growing. */
  get isLost(): boolean {
    return this.currentState === 'down';
  }
```

- `hit()` и `addLife()` (`:138–157`) заменить:

```typescript
  /**
   * From active only: shield > 0 -> shield - 1 and invulnerable, in place (the ship is not
   * moved); shield = 0 -> down. Ignored in any other state (no loss, does not restart the
   * timer, so a ram during invulnerable cannot extend it). The shots in flight and the
   * power-ups are kept.
   */
  hit(): void {
    if (this.currentState !== 'active') return;
    if (this.shieldLevel > 0) {
      this.shieldLevel--;
      this.enter('invulnerable');
    } else {
      this.enter('down');
    }
  }

  /**
   * shield + 1 below MAX_SHIELD and not down; returns true if the shield grew (false at the
   * cap or down: a threshold or capsule there is lost). Does not touch the state or
   * stateTicks (blinking goes on). Only Battle calls it (from addScore and applyBonus).
   */
  addShield(): boolean {
    if (this.currentState === 'down' || this.shieldLevel >= MAX_SHIELD) return false;
    this.shieldLevel++;
    return true;
  }
```

- `update` (`:159–185`): ветку возрождения убрать, JSDoc — без строки «On the respawn
  tick…»:

```typescript
  update(dt: number, intent: PlayerIntent): void {
    this.ticksInState++;
    if (this.currentState === 'invulnerable' && this.ticksInState >= INVULNERABLE_TICKS) {
      this.enter('active');
    }
    const controllable = this.currentState !== 'down';
    // ... the rest is unchanged
  }
```

`ShipState`, `canBeHit`, `canBeTargeted`, `grantPowerUp`, `removeShot`, выстрелы — без
изменений (комментарий `grantPowerUp` «in any ship state (down included)» верен).

## 2. `Battle`: опция `shield`, пороги и капсула

**Файл (изменить):** `src/game/battle.ts`

- Импорты:

```typescript
import { Player, START_SHIELD } from './player';
import { asteroidPoints, BONUS_FALLBACK_POINTS, extraShieldsEarned, killPoints } from './score';
```

- Комментарий типа фаз (`:14–16`): «over: the last ship is lost» → «over: the ship is lost
  (hit without a shield)».
- `GAME_OVER_DELAY_TICKS` (`:20–21`):

```typescript
/** Ticks from the fatal hit (no shield) to over (feature 005, В3: 1 s); > EXPLOSION_TICKS. */
export const GAME_OVER_DELAY_TICKS = 60;
```

- `BattleOptions` (`:33–34`):

```typescript
  /** Starting shield, default START_SHIELD; tests use 0 for a quick game over. Player validates it. */
  readonly shield?: number;
```

- JSDoc класса (`:39–55`): «extra lives for score thresholds (extraLivesEarned, capped by
  MAX_LIVES)» → «a shield level for each score threshold (extraShieldsEarned, capped by
  MAX_SHIELD, none while down)»; «playing | cleared -> (last ship lost, …) -> over,
  terminal; an extra life won while the last ship is down cancels it (the ship respawns).»
  → «playing | cleared -> (ship lost, GAME_OVER_DELAY_TICKS) -> over, terminal; a threshold
  crossed while the ship is down does not cancel it (feature 008, В7).»
- Конструктор (`:70`): `this.player = new Player(undefined, opts.shield ?? START_SHIELD);`
- `addScore` (`:140–151`):

```typescript
  /**
   * The only place the score changes. Each shield threshold crossed by these points gives
   * player.addShield() (lost over MAX_SHIELD or while down; the threshold still counts). Runs
   * after resolveCollisions; within the tick the order is kills -> asteroid -> capsule bonus,
   * so this tick's hit is charged first: at MAX_SHIELD a ram that crosses a threshold goes
   * 5 -> 4 -> 5, at shield 0 it is down and the game is over.
   */
  private addScore(points: number): void {
    const before = this.currentScore;
    this.currentScore += points;
    for (let i = extraShieldsEarned(before, this.currentScore); i > 0; i--) this.player.addShield();
  }
```

(если Prettier перенесёт строку цикла — оставить его форматирование).

- `applyBonus` (`:153–167`):

```typescript
  /**
   * A caught capsule (feature 006 В6, В8; feature 008 В5): shield - addShield(); a power-up -
   * turned on if it is off. Useless (L at MAX_SHIELD, the power-up already on) -
   * BONUS_FALLBACK_POINTS instead. Decided by the state at this moment: after the kills and
   * the asteroid points of the tick (a shield level just won by them can make L useless).
   * addShield() is false only at the cap here: a down ship catches no capsule (collisions.ts).
   */
  private applyBonus(kind: BonusKind): void {
    if (kind === 'shield') {
      if (!this.player.addShield()) this.addScore(BONUS_FALLBACK_POINTS);
      return;
    }
    if (this.player.powerUps[kind]) this.addScore(BONUS_FALLBACK_POINTS);
    else this.player.grantPowerUp(kind);
  }
```

- `updatePhase` JSDoc п. 1: «once the ship is lost and GAME_OVER_DELAY_TICKS have passed
  since its last hit» → «… since the fatal hit». Код `updatePhase` не меняется.

## 3. `score.ts`: переименования

**Файл (изменить):** `src/game/score.ts` (`:44–69`)

```typescript
/**
 * Instead of a useless bonus (L at MAX_SHIELD, a power-up already on): flat, no level bonus
 * (feature 006, В8). Goes through Battle.addScore, so shield thresholds apply.
 */
export const BONUS_FALLBACK_POINTS = 500;

/** First shield threshold, points (feature 005 В4, feature 008 В6). */
export const EXTRA_SHIELD_FIRST = 5000;
/** Step between the next thresholds: 15000, 25000, ... */
export const EXTRA_SHIELD_EVERY = 10000;

function thresholdsReached(score: number): number {
  return score < EXTRA_SHIELD_FIRST
    ? 0
    : Math.floor((score - EXTRA_SHIELD_FIRST) / EXTRA_SHIELD_EVERY) + 1;
}

/**
 * How many shield thresholds (5000, 15000, 25000, ...) the score crossed from `before` to
 * `after`; reaching a threshold exactly counts. Pure, no shield cap (that is
 * Player.addShield). The score only grows, so the result is >= 0 on every real call.
 */
export function extraShieldsEarned(before: number, after: number): number {
  return thresholdsReached(after) - thresholdsReached(before);
}
```

## 4. `bonus.ts` и `bonus-art.ts`: вид `'shield'`

**Файл (изменить):** `src/game/bonus.ts` (`:3–7`)

```typescript
/** What a capsule can carry: a shield level or a power-up. */
export type BonusKind = 'shield' | PowerUpKind;

/** Fixed order for picking a bonus with the rng (index randomInt(rng, 0, BONUS_KINDS.length)). */
export const BONUS_KINDS: readonly BonusKind[] = ['shield', 'fastShot', 'doubleShot'];
```

Порядок тот же — розыгрыш `rng` не сдвигается.

**Файл (изменить):** `src/game/bonus-art.ts` (`:42`, `:47`): «L - life» → «L - shield
level»; ключ `life:` → `shield:`; спрайт и цвета не трогать (В8).

## 5. `collisions.ts` и `ship.ts`: только комментарии

**Файл (изменить):** `src/game/collisions.ts`

- JSDoc `resolveCollisions` (`:44–50`): после п. 3 добавить строку «A hit is
  player.hit(): it takes a shield level (the ship blinks, invulnerable) or, with no shield,
  puts the ship down.»; «Rules 2 and 3 share one hit per tick: after a shot hit the ship can
  no longer be hit» — без изменений (верно и для `invulnerable`).
- `:77`: «while the ship is not down (active or invulnerable)» — оставить; при желании
  «(active, or invulnerable after a shield hit)». Код не меняется.

**Файл (изменить):** `src/game/ship.ts`

- `:8`: «(lives are shown in the top HUD)» → «(the shield is shown in the top HUD)».
- `:18`: «Ship's start and respawn x» → «Ship's start x».

## 6. HUD: `HudView.shield`

**Файл (изменить):** `src/game/hud.ts`

- `HudView` (`:10–11`):

```typescript
  /** Shield level 0..MAX_SHIELD; until task 033 drawn as that many ship icons. */
  readonly shield: number;
```

- `hudView` (`:100–111`): JSDoc «level, score, lives and power-ups» → «level, score,
  shield and power-ups»; поле `shield: battle.player.shield`.
- Комментарии констант зоны, где слово `lives` (`:37`, `:39`, `:41`, `:81`): «lives icon» →
  «ship icon», «the lives zone» → «the icon zone (the shield level until task 033)»,
  «between the level (ends at 147) and the lives» → «… and the shield icons». **Имена**
  `LIVES_ZONE`, `LIVES_ICON_SLOTS`, `LIFE_ICON_*`, `LIVES_ZONE_WIDTH` не трогать — их
  переименовывает 033.

**Файл (изменить):** `src/game/hud-render.ts`

- `drawHud` (`:25–34`): JSDoc «score, level, lives, power-ups sections» → «score, level,
  shield (ship icons until task 033), power-ups sections»; вызов
  `drawLives(ctx, view.shield);`.
- `drawLives` (`:59–66`) — имя остаётся до 033, параметр переименовать:

```typescript
/**
 * Temporary until task 033: one ship icon per shield level, from the zone's right edge
 * leftwards; icon 0 is the rightmost. At most LIVES_ICON_SLOTS (= MAX_SHIELD).
 */
function drawLives(ctx: CanvasRenderingContext2D, shield: number): void {
  const rightmostX = LIVES_ZONE.x + LIVES_ZONE.width - LIFE_ICON_SPRITE.width;
  const count = Math.min(shield, LIVES_ICON_SLOTS);
  // ... the loop is unchanged
}
```

**Файл (изменить, только комментарий):** `src/game/art.ts:32` — «Lives icon for the HUD:
a small ship silhouette, 7×8 …» → «HUD ship icon (the shield level until task 033): a small
ship silhouette, 7×8 …». Отступление от analyze.md («`art.ts` не меняется»): только текст
комментария, чтобы финальный поиск `lives`/`Lives` был чистым; импорты `art.ts` не
трогаются (правило «`art.ts` импортирует только `sprite.ts`» соблюдено).

## 7. dev-параметры: `?shield=N`

**Файл (изменить):** `src/game/dev-params.ts`

```typescript
import { parseStartLevel } from './levels';
import { MAX_SHIELD } from './player';

export interface DevParams {
  // seed, paused, startLevel - unchanged
  /** ?shield=N: integer 0..MAX_SHIELD; undefined = START_SHIELD. */
  readonly shield: number | undefined;
}

export const NO_DEV_PARAMS: DevParams = {
  seed: null,
  paused: false,
  startLevel: undefined,
  shield: undefined,
};

// in parseDevParams:
    shield: parseIntIn(q.get('shield'), 0, MAX_SHIELD) ?? undefined,
```

`?shield=0` → `0` (`?? undefined` не трогает `0`, `parseIntIn` с `min = 0` уже работает
для `seed`). `?lives` больше не читается.

## 8. dev-снимок: `shield` на верхнем уровне

**Файл (изменить):** `src/game/dev-snapshot.ts`

- `BattleSnapshot` (`:38`): `readonly lives: number;` → `readonly shield: number;`.
- `snapshotBattle` (`:93`): `lives: player.lives,` → `shield: player.shield,`.
- В `player` не дублировать. `BonusKind` приходит типом — `'shield'` автоматически.

## 9. Титул: `GameStart.shield`

**Файл (изменить):** `src/game/scenes/title-scene.ts`

```typescript
/** How a new game starts: level and shield (dev builds pass ?level / ?shield). */
export type GameStart = Pick<BattleOptions, 'startLevel' | 'shield'>;
```

`:20`: «undefined fields = level 1, START_LIVES.» → «undefined fields = level 1,
START_SHIELD.». `:32` («The factory lives here, …») — **не трогать** (английский глагол).

## 10. `main.ts`

**Файл (изменить):** `src/main.ts`

```typescript
// Dev only: ?seed / ?paused / ?level / ?shield (second-brain/architecture/dev-hooks.md).
const params = import.meta.env.DEV ? parseDevParams(window.location.search) : NO_DEV_PARAMS;
const rng = createRng(params.seed ?? Date.now());
let scene: Scene = new TitleScene(rng, { startLevel: params.startLevel, shield: params.shield });
```

## 11. Что в коде не меняется

`battle-render.ts` (`drawShip`: `down` — взрыв, `invulnerable` — мигание; корабль просто
не переносится), `play-scene.ts`, `dev-hooks.ts`, `bonus-field.ts`, `capsule.ts`,
`asteroid.ts`, `wave.ts` — без правок. После шагов 1–10 `npm run typecheck` покажет все
места тестов, которые надо перевести (шаги части 2).

---

Продолжение — `plan-part2.md`: тесты (шаги 12–25), документы, `acceptance.md`, поиск,
проверки, сводка по файлам, архитектура, открытые вопросы, ссылки.
