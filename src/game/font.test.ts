import { describe, expect, it } from 'vitest';
import { recorder } from './canvas-test-utils';
import {
  CHAR_ADVANCE,
  drawText,
  FONT,
  GLYPH_HEIGHT,
  GLYPH_WIDTH,
  parseFont,
  textWidth,
} from './font';
import type { Sprite } from './sprite';

const DIGITS = '0123456789';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CHARSET = `${DIGITS}${LETTERS} `;

/** Test-local fake ctx that counts fillStyle assignments (recorder() does not). */
function styleCounter(): { ctx: CanvasRenderingContext2D; styles: string[] } {
  const styles: string[] = [];
  const ctx = {
    set fillStyle(value: string) {
      styles.push(value);
    },
    fillRect() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, styles };
}

function glyph(ch: string): Sprite {
  const g = FONT.get(ch);
  if (g === undefined) throw new Error(`missing glyph '${ch}'`);
  return g;
}

/** Expected fillRect calls for one glyph at (x, y): mask pixels in row-major order. */
function maskRects(g: Sprite, x: number, y: number, color: string) {
  const rects = [];
  for (let row = 0; row < g.height; row++) {
    for (let col = 0; col < g.width; col++) {
      if (g.pixels[row * g.width + col] != null) {
        rects.push({ fillStyle: color, x: x + col, y: y + row, w: 1, h: 1 });
      }
    }
  }
  return rects;
}

const maskKey = (g: Sprite) => g.pixels.map((p) => (p === null ? '.' : '#')).join('');
const SEVEN_DOTS = '.......';
const blankGlyph = (): string[] => Array.from({ length: GLYPH_HEIGHT }, () => SEVEN_DOTS);

describe('FONT', () => {
  it('contains exactly 0-9, A-Z and space', () => {
    expect([...FONT.keys()].sort()).toEqual([...CHARSET].sort());
  });

  it('has every glyph GLYPH_WIDTH x GLYPH_HEIGHT', () => {
    for (const ch of CHARSET) {
      const g = glyph(ch);
      expect(g.width).toBe(GLYPH_WIDTH);
      expect(g.height).toBe(GLYPH_HEIGHT);
      expect(g.pixels.length).toBe(GLYPH_WIDTH * GLYPH_HEIGHT);
    }
  });

  it('has an empty space glyph', () => {
    expect(glyph(' ').pixels.every((p) => p === null)).toBe(true);
  });

  it('has at least one pixel in every non-space glyph', () => {
    for (const ch of `${DIGITS}${LETTERS}`) {
      expect(glyph(ch).pixels.some((p) => p !== null)).toBe(true);
    }
  });

  it('has pairwise distinct digits', () => {
    expect(new Set([...DIGITS].map((c) => maskKey(glyph(c)))).size).toBe(10);
  });

  it('has pairwise distinct letters', () => {
    expect(new Set([...LETTERS].map((c) => maskKey(glyph(c)))).size).toBe(26);
  });
});

describe('parseFont', () => {
  it('builds a map of 7x7 glyphs from valid data', () => {
    const font = parseFont({ A: blankGlyph() });
    expect([...font.keys()]).toEqual(['A']);
    const a = font.get('A');
    expect(a?.width).toBe(GLYPH_WIDTH);
    expect(a?.height).toBe(GLYPH_HEIGHT);
  });

  it('throws on a glyph of the wrong width', () => {
    const rows = Array.from({ length: GLYPH_HEIGHT }, () => '......');
    expect(() => parseFont({ A: rows })).toThrow(/expected 7x7/);
  });

  it('throws on a glyph of the wrong height', () => {
    const rows = Array.from({ length: GLYPH_HEIGHT - 1 }, () => SEVEN_DOTS);
    expect(() => parseFont({ A: rows })).toThrow(/expected 7x7/);
  });

  it('propagates parseSprite errors on ragged rows', () => {
    const rows = blankGlyph();
    rows[3] = '......';
    expect(() => parseFont({ A: rows })).toThrow(/row 3/);
  });

  it('propagates parseSprite errors on an unknown char', () => {
    const rows = blankGlyph();
    rows[2] = '...x...';
    expect(() => parseFont({ A: rows })).toThrow(/Unknown sprite char 'x'/);
  });
});

describe('textWidth', () => {
  it('is 0 for an empty string', () => {
    expect(textWidth('')).toBe(0);
  });

  it('is text.length * CHAR_ADVANCE, trailing gap included', () => {
    expect(textWidth('AB')).toBe(2 * CHAR_ADVANCE);
    expect(textWidth('SCORE')).toBe(5 * CHAR_ADVANCE);
  });

  it('throws on a char without a glyph', () => {
    expect(() => textWidth('a')).toThrow(/No glyph/);
    expect(() => textWidth('!')).toThrow(/No glyph/);
  });
});

describe('drawText', () => {
  it('draws one glyph as 1x1 mask pixels at (x, y) in the given color', () => {
    const { ctx, calls } = recorder();
    drawText(ctx, 'A', 10, 20, '#abc');
    expect(calls).toEqual(maskRects(glyph('A'), 10, 20, '#abc'));
  });

  it('shifts the next char by CHAR_ADVANCE', () => {
    const c = '#0f0';
    const { ctx, calls } = recorder();
    drawText(ctx, 'A1', 3, 5, c);
    expect(calls).toEqual([
      ...maskRects(glyph('A'), 3, 5, c),
      ...maskRects(glyph('1'), 3 + CHAR_ADVANCE, 5, c),
    ]);
  });

  it('draws nothing for a space but still advances', () => {
    const c = '#0f0';
    const space = recorder();
    drawText(space.ctx, ' ', 0, 0, c);
    expect(space.calls).toEqual([]);

    const spaced = recorder();
    drawText(spaced.ctx, 'A A', 0, 0, c);
    expect(spaced.calls).toEqual([
      ...maskRects(glyph('A'), 0, 0, c),
      ...maskRects(glyph('A'), 2 * CHAR_ADVANCE, 0, c),
    ]);

    const pair = recorder();
    drawText(pair.ctx, 'AA', 0, 0, c);
    expect(spaced.calls.length).toBe(pair.calls.length);
  });

  it('uses the given color, not the font ink', () => {
    for (const color of ['#123', '#456']) {
      const { ctx, calls } = recorder();
      drawText(ctx, 'SCORE', 0, 0, color);
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every((call) => call.fillStyle === color)).toBe(true);
    }
  });

  it('sets fillStyle exactly once per call', () => {
    const { ctx, styles } = styleCounter();
    drawText(ctx, 'SCORE 0', 0, 0, '#f00');
    expect(styles).toEqual(['#f00']);
  });

  it('throws on a char without a glyph and draws nothing', () => {
    const { ctx, calls } = recorder();
    expect(() => drawText(ctx, 'Aa', 0, 0, '#fff')).toThrow(/No glyph/);
    expect(calls).toEqual([]);
  });
});
