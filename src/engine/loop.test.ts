import { describe, expect, it } from 'vitest';
import { accumulate } from './loop';

const TICK = 1 / 60;

describe('accumulate', () => {
  it('runs one step per tick-length frame', () => {
    const r = accumulate(0, TICK, TICK);
    expect(r.steps).toBe(1);
    expect(r.accumulator).toBeCloseTo(0);
  });

  it('carries leftover time to the next frame', () => {
    const r = accumulate(0, TICK * 1.5, TICK);
    expect(r.steps).toBe(1);
    expect(r.accumulator).toBeCloseTo(TICK * 0.5);
  });

  it('clamps steps after a long pause and drops the backlog', () => {
    const r = accumulate(0, 10, TICK, 5);
    expect(r.steps).toBe(5);
    expect(r.accumulator).toBe(0);
  });

  it('ignores negative frame time', () => {
    expect(accumulate(0, -1, TICK).steps).toBe(0);
  });
});
