/** Row-major pixel colors; null = transparent. Pixel (col, row) is pixels[row * width + col]. */
export interface Sprite {
  readonly width: number;
  readonly height: number;
  readonly pixels: readonly (string | null)[];
}

const TRANSPARENT = '.';

/**
 * Builds a sprite from text rows.
 * rows: equal-length strings; '.' = transparent, any other char is a key of palette.
 * Throws on bad input (no rows, zero width, ragged rows, '.' in palette, unknown char).
 */
export function parseSprite(
  rows: readonly string[],
  palette: Readonly<Record<string, string>>,
): Sprite {
  const first = rows[0];
  if (first === undefined) throw new Error('Sprite has no rows');
  const width = first.length;
  if (width === 0) throw new Error('Sprite has zero width');
  if (Object.hasOwn(palette, TRANSPARENT)) {
    throw new Error(`Palette must not define '${TRANSPARENT}' (it is always transparent)`);
  }

  const pixels: (string | null)[] = [];
  rows.forEach((row, r) => {
    if (row.length !== width) {
      throw new Error(`Sprite row ${r} has length ${row.length}, expected ${width}`);
    }
    for (const ch of row) {
      if (ch === TRANSPARENT) {
        pixels.push(null);
        continue;
      }
      const color = Object.hasOwn(palette, ch) ? palette[ch] : undefined;
      if (color === undefined) throw new Error(`Unknown sprite char '${ch}' in row ${r}`);
      pixels.push(color);
    }
  });
  return { width, height: rows.length, pixels };
}

/** Draws the sprite with its top-left corner at (x, y), one 1×1 fillRect per opaque pixel. Expects integer x/y. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
): void {
  let current: string | null = null;
  for (let row = 0; row < sprite.height; row++) {
    for (let col = 0; col < sprite.width; col++) {
      const color = sprite.pixels[row * sprite.width + col];
      if (color == null) continue; // null = transparent; undefined cannot happen for a parsed sprite
      if (color !== current) {
        ctx.fillStyle = color;
        current = color;
      }
      ctx.fillRect(x + col, y + row, 1, 1);
    }
  }
}
