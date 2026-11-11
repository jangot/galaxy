import { describe, expect, it } from 'vitest';
import { TICK_SECONDS } from '../config';
import { SHOT_HEIGHT, SHOT_SPEED, Shot } from './shot';

const STEP = SHOT_SPEED * TICK_SECONDS;

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
});
