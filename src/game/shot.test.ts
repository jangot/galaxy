import { describe, expect, it } from 'vitest';
import { TICK_SECONDS } from '../config';
import { ENEMY_KINDS, PEEL_SEGMENTS, RETURN_SPEED } from './enemy';
import { levelConfig } from './levels';
import { FAST_SHOT_SPEED, SHOT_HEIGHT, SHOT_SPEED, Shot } from './shot';

const STEP = SHOT_SPEED * TICK_SECONDS;
const FAST_STEP = FAST_SHOT_SPEED * TICK_SECONDS;
const LEVELS_1_TO_20 = Array.from({ length: 20 }, (_, i) => [i + 1, levelConfig(i + 1)] as const);

describe('Shot', () => {
  it('moves a whole number of pixels per tick (ADR 002)', () => {
    expect(Number.isInteger(STEP)).toBe(true);
  });

  it('keeps the position it was created at', () => {
    const shot = new Shot(10, 100);
    expect(shot.x).toBe(10);
    expect(shot.y).toBe(100);
  });

  it('moves up by one step per tick', () => {
    const shot = new Shot(10, 100);
    shot.update(TICK_SECONDS);
    expect(shot.y).toBe(100 - STEP);
    expect(shot.x).toBe(10);
  });

  it('never changes x while flying', () => {
    const shot = new Shot(10, 100);
    for (let i = 0; i < 5; i++) shot.update(TICK_SECONDS);
    expect(shot.x).toBe(10);
    expect(shot.y).toBe(100 - 5 * STEP);
  });

  it('is offscreen once its bottom reaches the top edge', () => {
    expect(new Shot(10, -SHOT_HEIGHT).isOffscreen).toBe(true);
    expect(new Shot(10, -SHOT_HEIGHT + 1).isOffscreen).toBe(false);
  });

  it('is on screen while inside the screen', () => {
    expect(new Shot(10, 0).isOffscreen).toBe(false);
    expect(new Shot(10, 100).isOffscreen).toBe(false);
  });

  it('flies at SHOT_SPEED by default', () => {
    expect(new Shot(10, 100).speed).toBe(SHOT_SPEED);
  });

  it('flies at the speed it was created with', () => {
    const shot = new Shot(10, 100, FAST_SHOT_SPEED);
    expect(shot.speed).toBe(FAST_SHOT_SPEED);
    shot.update(TICK_SECONDS);
    expect(shot.y).toBe(100 - FAST_STEP);
    expect(shot.x).toBe(10);
  });

  it('fast shot moves a whole number of pixels per tick (ADR 002)', () => {
    expect(Number.isInteger(FAST_STEP)).toBe(true);
    expect(FAST_STEP).toBe(6);
  });

  it.each(LEVELS_1_TO_20)('level %i: a fast shot cannot tunnel through an enemy', (_n, config) => {
    // ceil: a fractional dive step (2.5 px/tick) moves the floored enemy by up to 3 px.
    const maxDown = Math.max(
      Math.ceil(config.diveSpeed * TICK_SECONDS),
      ...PEEL_SEGMENTS.map((s) => s.vy),
      RETURN_SPEED * TICK_SECONDS,
    );
    const minEnemyHeight = Math.min(...Object.values(ENEMY_KINDS).map((k) => k.sprite.height));
    expect(FAST_SHOT_SPEED * TICK_SECONDS + maxDown).toBeLessThan(SHOT_HEIGHT + minEnemyHeight);
  });
});
