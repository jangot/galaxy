import { FONT_GLYPHS } from './font-art';
import { parseSprite, type Sprite } from './sprite';

export const GLYPH_WIDTH = 7;
export const GLYPH_HEIGHT = 7;
/** Monospace cell width: glyph plus 1 px gap (8×8 cell, NES style). */
export const CHAR_ADVANCE = 8;

export type Font = ReadonlyMap<string, Sprite>;

/** Placeholder palette color for glyph pixels: mask only, never drawn. */
const FONT_INK = '#fff';

/** Builds a monospace font; throws on bad glyph data or a glyph of the wrong size. */
export function parseFont(glyphs: Readonly<Record<string, readonly string[]>>): Font {
  const font = new Map<string, Sprite>();
  for (const [ch, rows] of Object.entries(glyphs)) {
    const glyph = parseSprite(rows, { '#': FONT_INK }); // format errors propagate
    if (glyph.width !== GLYPH_WIDTH || glyph.height !== GLYPH_HEIGHT) {
      throw new Error(
        `Glyph '${ch}' is ${glyph.width}x${glyph.height}, expected ${GLYPH_WIDTH}x${GLYPH_HEIGHT}`,
      );
    }
    font.set(ch, glyph);
  }
  return font;
}

/** The game font (parsed at module load, a format error fails the import). */
export const FONT: Font = parseFont(FONT_GLYPHS);

function glyphOf(ch: string): Sprite {
  const glyph = FONT.get(ch);
  if (glyph === undefined) throw new Error(`No glyph for char '${ch}'`);
  return glyph;
}

/**
 * Width in px: text.length * CHAR_ADVANCE. Includes the trailing 1 px gap of the last
 * cell on purpose (monospace cell width) - do not trim it. Throws on unknown char.
 */
export function textWidth(text: string): number {
  for (const ch of text) glyphOf(ch);
  return text.length * CHAR_ADVANCE;
}

/**
 * Draws text with its top-left at (x, y) in one color: sets fillStyle once, then one
 * 1×1 fillRect per mask pixel. Expects integer x/y. Throws on unknown char
 * (before drawing anything).
 */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  const glyphs = Array.from(text, glyphOf); // validate the whole string first
  ctx.fillStyle = color;
  glyphs.forEach((glyph, i) => {
    const gx = x + i * CHAR_ADVANCE;
    for (let row = 0; row < glyph.height; row++) {
      for (let col = 0; col < glyph.width; col++) {
        if (glyph.pixels[row * glyph.width + col] == null) continue; // mask only
        ctx.fillRect(gx + col, y + row, 1, 1);
      }
    }
  });
}
