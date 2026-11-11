import { describe, expect, it } from 'vitest';
import { drawSprite, parseSprite } from './sprite';

interface Call {
  fillStyle: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function recorder() {
  const calls: Call[] = [];
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ fillStyle: this.fillStyle, x, y, w, h });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('parseSprite', () => {
  it('derives width and height from the rows', () => {
    const s = parseSprite(['ab.', '.ba'], { a: '#1', b: '#2' });
    expect(s.width).toBe(3);
    expect(s.height).toBe(2);
  });

  it('maps chars to palette colors and dots to null, row-major', () => {
    const s = parseSprite(['ab', 'b.'], { a: '#1', b: '#2' });
    expect(s.pixels).toEqual(['#1', '#2', '#2', null]);
  });

  it('throws on no rows', () => {
    expect(() => parseSprite([], { a: '#1' })).toThrow();
  });

  it('throws on zero width', () => {
    expect(() => parseSprite([''], { a: '#1' })).toThrow();
  });

  it('throws on ragged rows', () => {
    expect(() => parseSprite(['ab', 'a'], { a: '#1', b: '#2' })).toThrow();
  });

  it('throws on a char missing from the palette', () => {
    expect(() => parseSprite(['ax'], { a: '#1' })).toThrow();
  });

  it('throws when the palette defines the transparent char', () => {
    expect(() => parseSprite(['a'], { '.': '#000', a: '#1' })).toThrow();
  });
});

describe('drawSprite', () => {
  it('draws one 1x1 rect per opaque pixel and skips transparent ones', () => {
    const s = parseSprite(['a.a', '.a.', 'a..'], { a: '#1' });
    const { ctx, calls } = recorder();
    drawSprite(ctx, s, 0, 0);
    const opaque = s.pixels.filter((p) => p !== null).length;
    expect(calls).toHaveLength(opaque);
    expect(calls.every((c) => c.w === 1 && c.h === 1)).toBe(true);
  });

  it('applies the x/y offset', () => {
    const { ctx, calls } = recorder();
    drawSprite(ctx, parseSprite(['a'], { a: '#1' }), 10, 20);
    expect(calls).toEqual([{ fillStyle: '#1', x: 10, y: 20, w: 1, h: 1 }]);
  });

  it('draws pixel (col, row) at (x + col, y + row) with its color on an asymmetric 2x3 sprite', () => {
    const s = parseSprite(['ab', '.c', 'd.'], { a: '#a', b: '#b', c: '#c', d: '#d' });
    const { ctx, calls } = recorder();
    drawSprite(ctx, s, 5, 7);
    expect(calls).toEqual([
      { fillStyle: '#a', x: 5, y: 7, w: 1, h: 1 },
      { fillStyle: '#b', x: 6, y: 7, w: 1, h: 1 },
      { fillStyle: '#c', x: 6, y: 8, w: 1, h: 1 },
      { fillStyle: '#d', x: 5, y: 9, w: 1, h: 1 },
    ]);
  });

  it('keeps the right fillStyle across repeated and changed colors', () => {
    const { ctx, calls } = recorder();
    drawSprite(ctx, parseSprite(['aab'], { a: '#1', b: '#2' }), 0, 0);
    expect(calls.map((c) => c.fillStyle)).toEqual(['#1', '#1', '#2']);
  });
});
