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

/**
 * What bonus things are on the field: one asteroid per level at a random 'playing' tick; a
 * broken asteroid drops a capsule. At most one of them on the field: the next asteroid waits
 * for an empty field. Own rng; call order is fixed: startLevel - 1 call (spawn tick); spawn -
 * dir, offset, bonus. The capsule never calls the rng (its kind is the asteroid's bonus).
 */
export class BonusField {
  private current: Asteroid | null = null;
  private dropped: Capsule | null = null;
  private tick: number | null = null;
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

  /** This level's spawn tick; null once spawned or before the first startLevel. For tests. */
  get spawnTick(): number | null {
    return this.tick;
  }

  /** Ticks of 'playing' counted in the current level. For tests. */
  get levelTicks(): number {
    return this.ticks;
  }

  /**
   * A new level begins: draws its spawn tick; an unspawned asteroid of the last level is lost.
   * A flying one stays.
   */
  startLevel(): void {
    this.ticks = 0;
    this.tick = randomInt(this.rng, this.spawnWindow.minTicks, this.spawnWindow.maxTicks + 1);
  }

  /**
   * Moves the asteroid and the capsule, drops a gone asteroid / an offscreen capsule; then,
   * only if spawning, counts the level tick and spawns. A busy field (asteroid or capsule)
   * delays the spawn (spawnTick kept, checked every spawning update); since what left is
   * dropped first, the new asteroid may appear in the very update the old thing leaves.
   * The new asteroid does not move on its spawn tick.
   */
  update(dt: number, spawning: boolean): void {
    if (this.current) {
      this.current.update(dt);
      if (this.current.state === 'gone') this.current = null;
    }
    if (this.dropped) {
      this.dropped.update(dt);
      if (this.dropped.isOffscreen) this.dropped = null;
    }
    if (!spawning) return;
    this.ticks++;
    if (this.tick !== null && this.ticks >= this.tick && this.isEmpty) {
      this.current = this.spawn();
      this.tick = null;
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

  /** No asteroid (flying or exploding) and no capsule: a new asteroid may spawn. */
  private get isEmpty(): boolean {
    return this.current === null && this.dropped === null;
  }

  /** rng order: dir, offset, bonus. */
  private spawn(): Asteroid {
    const dir = this.rng() < 0.5 ? -1 : 1;
    const offset = randomInt(this.rng, 0, ASTEROID_SPAWN_OFFSET_MAX + 1);
    const bonus = BONUS_KINDS[randomInt(this.rng, 0, BONUS_KINDS.length)]!;
    return new Asteroid(dir, offset, bonus);
  }
}
