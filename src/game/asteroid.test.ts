import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT, SCREEN_WIDTH, TICK_SECONDS } from '../config';
import {
  Asteroid,
  ASTEROID_DRIFT_SPEED,
  ASTEROID_DRIFT_TOTAL,
  ASTEROID_FALL_SPEED,
  ASTEROID_SIZE,
  ASTEROID_SPAWN_OFFSET_MAX,
} from './asteroid';
import { EXPLOSION_TICKS } from './enemy';
import { isAllowedSpeed } from './levels';
import { FAST_SHOT_SPEED, SHOT_HEIGHT } from './shot';

const FLIGHT_TICKS = SCREEN_HEIGHT + ASTEROID_SIZE;

function run(a: Asteroid, n: number): void {
  for (let i = 0; i < n; i++) a.update(TICK_SECONDS);
}

describe('Asteroid constants', () => {
  it('moves at allowed speeds (ADR 002, 003)', () => {
    expect(isAllowedSpeed(ASTEROID_FALL_SPEED)).toBe(true);
    expect(isAllowedSpeed(ASTEROID_DRIFT_SPEED)).toBe(true);
  });

  it('derives the drift total and the max offset from the other constants', () => {
    expect(ASTEROID_DRIFT_TOTAL).toBe(
      ((SCREEN_HEIGHT + ASTEROID_SIZE) * ASTEROID_DRIFT_SPEED) / ASTEROID_FALL_SPEED,
    );
    expect(ASTEROID_SPAWN_OFFSET_MAX).toBe(SCREEN_WIDTH - ASTEROID_SIZE - ASTEROID_DRIFT_TOTAL);
    expect(ASTEROID_DRIFT_TOTAL).toBe(126);
    expect(ASTEROID_SPAWN_OFFSET_MAX).toBe(118);
    expect(Number.isInteger(ASTEROID_DRIFT_TOTAL)).toBe(true);
    expect(Number.isInteger(ASTEROID_SPAWN_OFFSET_MAX)).toBe(true);
  });

  it('cannot be passed by a fast shot in one tick', () => {
    expect(FAST_SHOT_SPEED * TICK_SECONDS + ASTEROID_FALL_SPEED * TICK_SECONDS).toBeLessThan(
      SHOT_HEIGHT + ASTEROID_SIZE,
    );
  });
});

describe('Asteroid', () => {
  it('starts above the top edge at its side', () => {
    const a = new Asteroid(1, 0, 'shield');
    expect(a.x).toBe(0);
    expect(a.y).toBe(-ASTEROID_SIZE);
    expect(a.width).toBe(ASTEROID_SIZE);
    expect(a.height).toBe(ASTEROID_SIZE);
    expect(a.state).toBe('flying');
    expect(a.stateTicks).toBe(0);
    expect(a.dir).toBe(1);
    expect(a.bonus).toBe('shield');

    expect(new Asteroid(1, 37, 'shield').x).toBe(37);
    const right = new Asteroid(-1, 0, 'doubleShot');
    expect(right.x).toBe(SCREEN_WIDTH - ASTEROID_SIZE);
    expect(right.y).toBe(-ASTEROID_SIZE);
    expect(right.dir).toBe(-1);
    expect(right.bonus).toBe('doubleShot');
    expect(new Asteroid(-1, 37, 'fastShot').x).toBe(SCREEN_WIDTH - ASTEROID_SIZE - 37);
  });

  it.each([
    [1, 0.5],
    [-1, -0.5],
  ] as const)('steps 1 px down and %i/2 px sideways per tick', (dir, dx) => {
    const a = new Asteroid(dir, 10, 'shield');
    const x0 = a.x;
    run(a, 1);
    expect(a.x).toBe(x0 + dx);
    expect(a.y).toBe(-ASTEROID_SIZE + 1);
    expect(a.stateTicks).toBe(1);
  });

  it.each([
    [1, 0],
    [1, ASTEROID_SPAWN_OFFSET_MAX],
    [-1, 0],
    [-1, ASTEROID_SPAWN_OFFSET_MAX],
  ] as const)('stays on screen the whole fall: dir %i, offset %i', (dir, offset) => {
    const a = new Asteroid(dir, offset, 'shield');
    let updates = 0;
    while (a.state !== 'gone') {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x + a.width).toBeLessThanOrEqual(SCREEN_WIDTH);
      run(a, 1);
      updates++;
      expect(updates).toBeLessThanOrEqual(FLIGHT_TICKS);
    }
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x + a.width).toBeLessThanOrEqual(SCREEN_WIDTH);
    if (offset === ASTEROID_SPAWN_OFFSET_MAX) {
      if (dir === 1) expect(a.x + a.width).toBe(SCREEN_WIDTH);
      else expect(a.x).toBe(0);
    }
  });

  it('leaves below the bottom edge on update number SCREEN_HEIGHT + size', () => {
    const a = new Asteroid(1, 50, 'shield');
    run(a, FLIGHT_TICKS - 1);
    expect(a.state).toBe('flying');
    run(a, 1);
    expect(a.state).toBe('gone');
    expect(a.stateTicks).toBe(0);
    expect(a.y).toBe(SCREEN_HEIGHT);
  });

  it('breaks on one hit, explodes in place, then is gone', () => {
    const a = new Asteroid(1, 20, 'fastShot');
    run(a, 10);
    const { x, y } = a;
    expect(a.hit()).toBe(true);
    expect(a.state).toBe('exploding');
    expect(a.stateTicks).toBe(0);
    run(a, EXPLOSION_TICKS - 1);
    expect(a.state).toBe('exploding');
    expect(a.x).toBe(x);
    expect(a.y).toBe(y);
    run(a, 1);
    expect(a.state).toBe('gone');
    expect(a.x).toBe(x);
    expect(a.y).toBe(y);
  });

  it('ignores hit() while exploding or gone', () => {
    const a = new Asteroid(-1, 0, 'shield');
    a.hit();
    run(a, 3);
    expect(a.hit()).toBe(false);
    expect(a.state).toBe('exploding');
    expect(a.stateTicks).toBe(3);

    run(a, EXPLOSION_TICKS);
    expect(a.state).toBe('gone');
    const ticks = a.stateTicks;
    expect(a.hit()).toBe(false);
    expect(a.state).toBe('gone');
    expect(a.stateTicks).toBe(ticks);
  });

  it('does nothing on update once gone', () => {
    const a = new Asteroid(1, 0, 'shield');
    run(a, FLIGHT_TICKS);
    expect(a.state).toBe('gone');
    const { x, y, stateTicks } = a;
    run(a, 10);
    expect(a.x).toBe(x);
    expect(a.y).toBe(y);
    expect(a.stateTicks).toBe(stateTicks);
  });
});
