import type { Rng } from '../engine/rng';
import { randomInt } from '../engine/rng';
import { Asteroid, ASTEROID_SIZE, ASTEROID_SPAWN_OFFSET_MAX } from './asteroid';
import type { BonusKind } from './bonus';
import { BONUS_KINDS } from './bonus';
import { Capsule, CAPSULE_SIZE } from './capsule';

/** Earliest spawn tick, in 'playing' ticks of the level (5 s, В9). */
export const ASTEROID_SPAWN_MIN_TICKS = 300;
/** Latest spawn tick, inclusive (15 s, В9). */
export const ASTEROID_SPAWN_MAX_TICKS = 900;

/** The capsule is centered in the asteroid's rectangle: (12 - 8) / 2 = 2 px. */
const CAPSULE_DROP_OFFSET = (ASTEROID_SIZE - CAPSULE_SIZE) / 2;

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

/** What waits to fly out: a new asteroid of the level or a retry of an unshot one. */
interface PendingAsteroid {
  /** Level tick ('playing' ticks) on which it may fly out (still waits for an empty field). */
  readonly tick: number;
  /** null - a new asteroid, the bonus is drawn at spawn; otherwise a retry with this bonus. */
  readonly bonus: BonusKind | null;
}

/**
 * What bonus things are on the field: one asteroid per level at a random 'playing' tick; an
 * unshot one that leaves below the screen comes back with the same bonus after a fresh delay
 * from the spawn window (counted in 'playing' ticks from the leaving update), again and again
 * until it is shot down or the level changes. A broken asteroid drops a capsule. At most one
 * of them on the field: the next asteroid (new or retry) waits for an empty field. One thing
 * waits at a time (pending). Own rng; call order is fixed: startLevel - 1 call (spawn tick);
 * new asteroid spawn - dir, offset, bonus; an unshot asteroid leaving while nothing waits -
 * 1 call (retry delay); retry spawn - dir, offset. The capsule never calls the rng (its kind
 * is the asteroid's bonus).
 */
export class BonusField {
  private current: Asteroid | null = null;
  private dropped: Capsule | null = null;
  private pending: PendingAsteroid | null = null;
  private ticks = 0;

  /**
   * spawnWindow defaults to ASTEROID_SPAWN_WINDOW; tests inject short ones.
   * RangeError unless integers 1 <= min <= max.
   */
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

  get capsule(): Capsule | null {
    return this.dropped;
  }

  /**
   * Level tick of the next asteroid (new or retry); null when nothing waits (spawned already,
   * hit down, or before the first startLevel). For tests and dev snapshots.
   */
  get spawnTick(): number | null {
    return this.pending?.tick ?? null;
  }

  /** Bonus of the waiting retry; null when nothing waits or a new asteroid waits. For tests / QA. */
  get retryBonus(): BonusKind | null {
    return this.pending?.bonus ?? null;
  }

  /** Ticks of 'playing' counted in the current level. For tests. */
  get levelTicks(): number {
    return this.ticks;
  }

  /**
   * A new level begins: draws its spawn tick (1 rng call). Whatever waited is dropped - an
   * unspawned asteroid or a waiting retry of the last level (owner decision В4). A flying one
   * stays.
   */
  startLevel(): void {
    this.ticks = 0;
    this.pending = { tick: this.drawWindowTicks(), bonus: null };
  }

  /**
   * Moves the asteroid and the capsule, drops a gone asteroid / an offscreen capsule. An
   * asteroid that went gone straight from flying left unshot (a hit one passes through
   * exploding); if nothing waits, it schedules its retry: spawnTick = levelTicks + a delay
   * from the spawn window (1 rng call), in any phase. Then, only if spawning, counts the level
   * tick (before scheduling, so the delay counts from this update and the retry never flies
   * out in it) and spawns. Scheduling goes before the spawn check on purpose: when an old
   * asteroid leaves in the very update a new one of the level flies out, pending is still
   * busy with the new one, so no retry and no extra rng call (checked by 'delays the spawn
   * while the field is busy with a flying asteroid'). A busy field (asteroid or capsule)
   * delays the spawn (spawnTick kept, checked every spawning update); since what left is
   * dropped first, the next asteroid may appear in the very update the old thing leaves.
   * The new asteroid does not move on its spawn tick.
   */
  update(dt: number, spawning: boolean): void {
    let escaped: BonusKind | null = null;
    if (this.current) {
      const wasFlying = this.current.state === 'flying';
      this.current.update(dt);
      if (this.current.state === 'gone') {
        if (wasFlying) escaped = this.current.bonus;
        this.current = null;
      }
    }
    if (this.dropped) {
      this.dropped.update(dt);
      if (this.dropped.isOffscreen) this.dropped = null;
    }
    if (spawning) this.ticks++;
    if (escaped !== null && this.pending === null) {
      this.pending = { tick: this.ticks + this.drawWindowTicks(), bonus: escaped };
    }
    if (!spawning) return;
    if (this.pending !== null && this.ticks >= this.pending.tick && this.isEmpty) {
      this.current = this.spawn(this.pending.bonus);
      this.pending = null;
    }
  }

  /**
   * Hits the flying asteroid. On break drops a capsule of asteroid.bonus centered in its
   * floored rectangle (it does not move this tick) and returns true; no asteroid / not
   * flying - false. A capsule still on the field would be replaced; unreachable: an asteroid
   * spawns only on an empty field (see the invariant test in bonus-field.test.ts).
   */
  hitAsteroid(): boolean {
    const asteroid = this.current;
    if (asteroid === null || !asteroid.hit()) return false;
    this.dropped = new Capsule(
      asteroid.bonus,
      Math.floor(asteroid.x) + CAPSULE_DROP_OFFSET,
      Math.floor(asteroid.y) + CAPSULE_DROP_OFFSET,
    );
    return true;
  }

  /** Removes the capsule and returns its kind; null if there is none. */
  takeCapsule(): BonusKind | null {
    const capsule = this.dropped;
    this.dropped = null;
    return capsule?.kind ?? null;
  }

  /** No asteroid (flying or exploding) and no capsule: the next asteroid may spawn. */
  private get isEmpty(): boolean {
    return this.current === null && this.dropped === null;
  }

  /** rng order: dir, offset, then bonus only when not given (a retry keeps its bonus, В3). */
  private spawn(bonus: BonusKind | null): Asteroid {
    const dir = this.rng() < 0.5 ? -1 : 1;
    const offset = randomInt(this.rng, 0, ASTEROID_SPAWN_OFFSET_MAX + 1);
    const kind = bonus ?? BONUS_KINDS[randomInt(this.rng, 0, BONUS_KINDS.length)]!;
    return new Asteroid(dir, offset, kind);
  }

  /** One rng call: a tick count in the spawn window, inclusive. Used by startLevel and the retry. */
  private drawWindowTicks(): number {
    return randomInt(this.rng, this.spawnWindow.minTicks, this.spawnWindow.maxTicks + 1);
  }
}
