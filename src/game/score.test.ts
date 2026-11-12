import { describe, expect, it } from 'vitest';
import type { Kill } from './collisions';
import type { EnemyKind } from './levels';
import { LEVELS, parseLayout } from './levels';
import {
  ENEMY_POINTS,
  EXTRA_LIFE_EVERY,
  EXTRA_LIFE_FIRST,
  extraLivesEarned,
  killPoints,
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

describe('extra lives', () => {
  it('has the owner thresholds В4', () => {
    expect(EXTRA_LIFE_FIRST).toBe(5000);
    expect(EXTRA_LIFE_EVERY).toBe(10000);
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
    expect(extraLivesEarned(before, after)).toBe(expected);
  });

  it.each([
    [4999, 0],
    [5000, 1],
    [14999, 1],
    [15000, 2],
    [25000, 3],
  ])('counts the thresholds at or below %i: %i', (score, expected) => {
    expect(extraLivesEarned(0, score)).toBe(expected);
  });
});
