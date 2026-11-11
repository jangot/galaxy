import { describe, expect, it } from 'vitest';
import { SCREEN_WIDTH, TICK_SECONDS } from '../config';
import { CELL_WIDTH, Formation, SWAY_RANGE } from './formation';
import { FORMATION_MAX_COLS } from './levels';

function run(f: Formation, ticks: number): void {
  for (let i = 0; i < ticks; i++) f.update(TICK_SECONDS);
}

describe('Formation', () => {
  it.each([
    [10, 48],
    [11, 40],
  ])('centers %i columns at baseX %i', (cols, baseX) => {
    expect(new Formation(cols, 1, 15).slotX(0, CELL_WIDTH)).toBe(baseX);
  });

  it('centers a sprite horizontally in its cell', () => {
    const f = new Formation(10, 3, 15);
    expect(f.slotX(0, 11)).toBe(50);
    expect(f.slotX(0, 13)).toBe(49);
    expect(f.slotX(3, 11)).toBe(48 + 3 * 16 + 2);
  });

  it('centers a sprite vertically in its cell below the top edge', () => {
    const f = new Formation(10, 3, 15);
    expect(f.slotY(0, 8)).toBe(34);
    expect(f.slotY(2, 9)).toBe(32 + 24 + 1);
  });

  it('keeps cols and rows', () => {
    const f = new Formation(7, 4, 15);
    expect(f.cols).toBe(7);
    expect(f.rows).toBe(4);
  });

  it('starts centered with no offset', () => {
    const f = new Formation(10, 3, 15);
    expect(f.offset).toBe(0);
    expect(f.slotX(0, CELL_WIDTH)).toBe(48);
  });

  it('moves by swaySpeed * dt per tick, X only', () => {
    const f = new Formation(10, 3, 15);
    f.update(TICK_SECONDS);
    expect(f.offset).toBe(15 * TICK_SECONDS);
    expect(f.offset).toBe(0.25);
    expect(f.slotX(0, CELL_WIDTH)).toBe(48.25);
    expect(f.slotY(0, 8)).toBe(34);
  });

  it.each([
    [63, 15.75],
    [64, 16],
    [67, 16.75],
    [68, 16.5],
    [198, -16],
    [199, -15.75],
    [262, 0],
    [263, 0.25],
  ])('at 15 px/s after %i ticks the offset is %s', (ticks, offset) => {
    const f = new Formation(10, 1, 15);
    run(f, ticks);
    expect(f.offset).toBe(offset);
  });

  it.each([
    [5, 15],
    [6, 16],
    [7, 13],
    [17, -16],
    [18, -13],
  ])('a whole speed (3 px/tick) is clamped to the edge: tick %i -> %s', (ticks, offset) => {
    const f = new Formation(10, 1, 180);
    run(f, ticks);
    expect(f.offset).toBe(offset);
  });

  it.each([
    [7.5, 526, 15, 16],
    [15, 262, 7, 8],
    [30, 130, 3, 4],
  ])('sway at %s px/s shows both edges equally long', (speed, period, edge, middle) => {
    const f = new Formation(10, 1, speed);
    const counts = new Map<number, number>();
    for (let i = 0; i < period; i++) {
      f.update(TICK_SECONDS);
      const px = Math.floor(f.offset);
      counts.set(px, (counts.get(px) ?? 0) + 1);
    }
    expect(counts.get(SWAY_RANGE)).toBe(edge);
    expect(counts.get(-SWAY_RANGE)).toBe(edge);
    for (let v = -SWAY_RANGE + 1; v < SWAY_RANGE; v++) expect(counts.get(v)).toBe(middle);
    expect([...counts.keys()].every((v) => Math.abs(v) <= SWAY_RANGE)).toBe(true);
    expect(f.offset).toBe(0);
  });

  it('slotX includes the offset, slotY does not', () => {
    const f = new Formation(10, 3, 15);
    const x0 = f.slotX(3, 11);
    const y0 = f.slotY(2, 9);
    run(f, 10);
    expect(f.slotX(3, 11)).toBe(x0 + f.offset);
    expect(f.slotY(2, 9)).toBe(y0);
  });

  it('keeps the widest formation on screen at both sway extremes', () => {
    const f = new Formation(FORMATION_MAX_COLS, 1, 15);
    run(f, 67);
    expect(f.offset).toBe(16.75);
    const right = f.slotX(FORMATION_MAX_COLS - 1, CELL_WIDTH) + CELL_WIDTH;
    expect(right).toBe(232.75);
    expect(right).toBeLessThanOrEqual(SCREEN_WIDTH);
    run(f, 198 - 67);
    expect(f.offset).toBe(-16);
    expect(f.slotX(0, CELL_WIDTH)).toBe(24);
    expect(f.slotX(0, CELL_WIDTH)).toBeGreaterThanOrEqual(0);
  });
});
