import type { Kill } from './collisions';
import type { EnemyKind } from './levels';

/** Base points for one enemy kind: shot in the formation / out of it (diving or returning). */
export interface KindPoints {
  readonly formation: number;
  readonly flying: number;
}

/** Owner decision В1; every value is a positive multiple of 10 (so level 1 returns the base). */
export const ENEMY_POINTS: Readonly<Record<EnemyKind, KindPoints>> = {
  drone: { formation: 30, flying: 60 },
  striker: { formation: 40, flying: 80 },
  raider: { formation: 50, flying: 100 },
};

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

/**
 * Instead of a useless bonus (L at MAX_LIVES, a power-up already on): flat, no level bonus
 * (feature 006, В8). Goes through Battle.addScore, so extra-life thresholds apply.
 */
export const BONUS_FALLBACK_POINTS = 500;

/** First extra-life threshold, points (owner decision В4). */
export const EXTRA_LIFE_FIRST = 5000;
/** Step between the next thresholds: 15000, 25000, ... (В4). */
export const EXTRA_LIFE_EVERY = 10000;

/** Thresholds at or below the score: 0 below 5000, 1 for 5000..14999, 2 for 15000..24999, ... */
function thresholdsReached(score: number): number {
  return score < EXTRA_LIFE_FIRST
    ? 0
    : Math.floor((score - EXTRA_LIFE_FIRST) / EXTRA_LIFE_EVERY) + 1;
}

/**
 * How many extra-life thresholds (5000, 15000, 25000, ...) the score crossed from `before` to
 * `after`; reaching a threshold exactly counts. Pure, no lives cap (that is Player.addLife).
 * The score only grows, so the result is >= 0 on every real call.
 */
export function extraLivesEarned(before: number, after: number): number {
  return thresholdsReached(after) - thresholdsReached(before);
}
