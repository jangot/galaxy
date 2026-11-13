import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT, TICK_SECONDS } from '../config';
import { Capsule, CAPSULE_SIZE, CAPSULE_SPEED } from './capsule';
import { isAllowedSpeed } from './levels';

describe('Capsule', () => {
  it('keeps its kind and position, 8×8', () => {
    const c = new Capsule('shield', 10, 20);
    expect(c.kind).toBe('shield');
    expect(c.x).toBe(10);
    expect(c.y).toBe(20);
    expect(CAPSULE_SIZE).toBe(8);
    expect(c.width).toBe(CAPSULE_SIZE);
    expect(c.height).toBe(CAPSULE_SIZE);
  });

  it('falls straight down 1 px a tick', () => {
    const c = new Capsule('fastShot', 10, 20);
    c.update(TICK_SECONDS);
    expect(c.y).toBe(21);
    expect(c.x).toBe(10);
    c.update(TICK_SECONDS);
    c.update(TICK_SECONDS);
    c.update(TICK_SECONDS);
    expect(c.y).toBe(24);
    expect(c.x).toBe(10);
  });

  it('is offscreen once its top reaches the bottom edge', () => {
    expect(new Capsule('shield', 0, SCREEN_HEIGHT - 1).isOffscreen).toBe(false);
    expect(new Capsule('shield', 0, SCREEN_HEIGHT).isOffscreen).toBe(true);
  });

  it('has an allowed speed of exactly 1 px a tick (ADR 002)', () => {
    expect(isAllowedSpeed(CAPSULE_SPEED)).toBe(true);
    expect(CAPSULE_SPEED * TICK_SECONDS).toBe(1);
  });
});
