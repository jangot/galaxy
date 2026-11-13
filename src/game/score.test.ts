import { describe, expect, it } from 'vitest';
import type { Kill } from './collisions';
import type { EnemyKind } from './levels';
import { LEVELS, parseLayout } from './levels';
import {
  ASTEROID_POINTS,
  asteroidPoints,
  BONUS_FALLBACK_POINTS,
  ENEMY_POINTS,
  EXTRA_SHIELD_EVERY,
  EXTRA_SHIELD_FIRST,
  extraShieldsEarned,
  killPoints,
  levelPoints,
} from './score';

const kill = (kind: EnemyKind, inFlight: boolean): Kill => ({ kind, inFlight });
const KINDS: readonly EnemyKind[] = ['drone', 'striker', 'raider'];

describe('ENEMY_POINTS', () => {
  it('is the owner table В1', () => {
    expect(ENEMY_POINTS).toEqual({
      drone: { formation: 30, flying: 60 },
      striker: { formation: 40, flying: 80 },
      raider: { formation: 50, flying: 100 },
    });
  });

  it('holds positive multiples of 10, flying >= formation', () => {
    for (const kind of KINDS) {
      const { formation, flying } = ENEMY_POINTS[kind];
      for (const v of [formation, flying]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
        expect(v % 10).toBe(0);
      }
      expect(flying).toBeGreaterThanOrEqual(formation);
    }
  });
});

describe('killPoints', () => {
  it('returns the base points on level 1', () => {
    for (const kind of KINDS) {
      expect(killPoints(kill(kind, false), 1)).toBe(ENEMY_POINTS[kind].formation);
      expect(killPoints(kill(kind, true), 1)).toBe(ENEMY_POINTS[kind].flying);
    }
  });

  it.each([
    ['drone', 2, 30, 70],
    ['drone', 3, 40, 70],
    ['drone', 5, 40, 80],
    ['drone', 6, 50, 90],
    ['drone', 11, 60, 120],
    ['striker', 2, 40, 90],
    ['striker', 3, 50, 100],
    ['striker', 5, 60, 110],
    ['striker', 6, 60, 120],
    ['striker', 11, 80, 160],
    ['raider', 2, 60, 110],
    ['raider', 3, 60, 120],
    ['raider', 5, 70, 140],
    ['raider', 6, 80, 150],
    ['raider', 11, 100, 200],
  ] as const)('%s on level %i: %i in formation, %i in flight', (kind, level, formation, flying) => {
    expect(killPoints(kill(kind, false), level)).toBe(formation);
    expect(killPoints(kill(kind, true), level)).toBe(flying);
  });

  it("matches the owner's example: a drone on level 5 and 11", () => {
    expect(killPoints(kill('drone', false), 5)).toBe(40);
    expect(killPoints(kill('drone', true), 5)).toBe(80);
    expect(killPoints(kill('drone', false), 11)).toBe(60);
    expect(killPoints(kill('drone', true), 11)).toBe(120);
  });

  it('rounds half up', () => {
    // 30 * 1.5 = 45 -> 50.
    expect(killPoints(kill('drone', false), 6)).toBe(50);
  });

  it('avoids the float trap', () => {
    // Math.round(50 * 2.3 / 10) * 10 gives 110: 50 * 2.3 = 114.99999999999999.
    expect(killPoints(kill('raider', false), 14)).toBe(120);
  });

  it('is a multiple of 10 and never decreases with the level', () => {
    for (const kind of KINDS) {
      for (const inFlight of [false, true]) {
        let previous = 0;
        for (let level = 1; level <= 30; level++) {
          const points = killPoints(kill(kind, inFlight), level);
          expect(points % 10).toBe(0);
          expect(points).toBeGreaterThanOrEqual(previous);
          previous = points;
        }
      }
    }
  });

  it('gives 920 for the whole level 1 formation shot in place', () => {
    const { slots } = parseLayout(LEVELS[0]!.layout);
    const total = slots.reduce((sum, s) => sum + killPoints(kill(s.kind, false), 1), 0);
    expect(total).toBe(920);
  });

  it('throws RangeError on a level that is not an integer >= 1', () => {
    expect(() => killPoints(kill('drone', false), 0)).toThrow(RangeError);
    expect(() => killPoints(kill('drone', false), 1.5)).toThrow(RangeError);
  });
});

describe('levelPoints', () => {
  it.each([
    [30, 2, 30],
    [30, 5, 40],
    [30, 6, 50],
    [60, 11, 120],
    [80, 6, 120],
    [50, 14, 120],
    [100, 5, 140],
    [100, 11, 200],
  ])('base %i on level %i: %i', (base, level, expected) => {
    expect(levelPoints(base, level)).toBe(expected);
  });

  it('returns the base on level 1', () => {
    for (const kind of KINDS) {
      expect(levelPoints(ENEMY_POINTS[kind].formation, 1)).toBe(ENEMY_POINTS[kind].formation);
      expect(levelPoints(ENEMY_POINTS[kind].flying, 1)).toBe(ENEMY_POINTS[kind].flying);
    }
    expect(levelPoints(ASTEROID_POINTS, 1)).toBe(ASTEROID_POINTS);
  });

  it('throws RangeError on a level that is not an integer >= 1', () => {
    expect(() => levelPoints(30, 0)).toThrow(RangeError);
    expect(() => levelPoints(30, 1.5)).toThrow(RangeError);
  });

  it('agrees with killPoints for every kind, flight and level 1..30', () => {
    for (const kind of KINDS) {
      for (const inFlight of [false, true]) {
        const base = inFlight ? ENEMY_POINTS[kind].flying : ENEMY_POINTS[kind].formation;
        for (let level = 1; level <= 30; level++) {
          expect(killPoints(kill(kind, inFlight), level)).toBe(levelPoints(base, level));
        }
      }
    }
  });
});

describe('asteroidPoints', () => {
  it('has the owner base В7', () => {
    expect(ASTEROID_POINTS).toBe(100);
  });

  it('gives 100 on level 1 and 140 on level 5', () => {
    expect(asteroidPoints(1)).toBe(100);
    expect(asteroidPoints(5)).toBe(140);
  });

  it('is a multiple of 10 and never decreases with the level', () => {
    let previous = 0;
    for (let level = 1; level <= 30; level++) {
      const points = asteroidPoints(level);
      expect(points % 10).toBe(0);
      expect(points).toBeGreaterThanOrEqual(previous);
      previous = points;
    }
  });

  it('throws RangeError on level 0', () => {
    expect(() => asteroidPoints(0)).toThrow(RangeError);
  });
});

describe('BONUS_FALLBACK_POINTS', () => {
  it('is a flat 500, a positive multiple of 10 (В8)', () => {
    expect(BONUS_FALLBACK_POINTS).toBe(500);
    expect(BONUS_FALLBACK_POINTS).toBeGreaterThan(0);
    expect(BONUS_FALLBACK_POINTS % 10).toBe(0);
  });
});

describe('shield thresholds', () => {
  it('has the owner thresholds В4', () => {
    expect(EXTRA_SHIELD_FIRST).toBe(5000);
    expect(EXTRA_SHIELD_EVERY).toBe(10000);
  });

  it.each([
    [0, 0, 0],
    [0, 4990, 0],
    [4990, 5000, 1],
    [5000, 5040, 0],
    [14990, 15000, 1],
    [24990, 25010, 1],
    [0, 25000, 3],
  ])('earns %i -> %i: %i', (before, after, expected) => {
    expect(extraShieldsEarned(before, after)).toBe(expected);
  });

  it.each([
    [4999, 0],
    [5000, 1],
    [14999, 1],
    [15000, 2],
    [25000, 3],
  ])('counts the thresholds at or below %i: %i', (score, expected) => {
    expect(extraShieldsEarned(0, score)).toBe(expected);
  });
});
