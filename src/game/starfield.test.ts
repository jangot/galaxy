import { describe, expect, it } from 'vitest';
import { createRng } from '../engine/rng';
import { Starfield } from './starfield';

describe('Starfield', () => {
  it('is deterministic for the same seed', () => {
    const a = new Starfield(256, 240, createRng(42));
    const b = new Starfield(256, 240, createRng(42));
    expect(a.stars).toEqual(b.stars);
  });

  it('keeps stars inside the screen while scrolling', () => {
    const field = new Starfield(256, 240, createRng(1), 32, 600);
    for (let i = 0; i < 600; i++) field.update(1 / 60);
    for (const s of field.stars) {
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThan(240);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(256);
    }
  });
});
