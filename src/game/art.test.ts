import { describe, expect, it } from 'vitest';
import { SHIELD_COLORS, SHIELD_GAUGE_EMPTY_COLOR, SHIELD_OFFSET_Y, SHIELD_SPRITES } from './art';
import { MAX_SHIELD, START_SHIELD } from './player';
import { SHIP_WIDTH } from './ship';

describe('shield arc data', () => {
  it('has one entry per shield level 0..MAX_SHIELD', () => {
    expect(SHIELD_COLORS).toHaveLength(MAX_SHIELD + 1);
    expect(SHIELD_SPRITES).toHaveLength(MAX_SHIELD + 1);
  });

  it('level 0 has no color and no arc, every other level has both', () => {
    expect(SHIELD_COLORS[0]).toBeNull();
    expect(SHIELD_SPRITES[0]).toBeNull();
    for (let k = 1; k <= MAX_SHIELD; k++) {
      expect(SHIELD_COLORS[k]).toEqual(expect.any(String));
      expect(SHIELD_SPRITES[k]).not.toBeNull();
    }
  });

  it('the arc is as wide as the ship and drawn in its level color only', () => {
    for (let k = 1; k <= MAX_SHIELD; k++) {
      const arc = SHIELD_SPRITES[k]!;
      expect(arc.width).toBe(SHIP_WIDTH);
      const opaque = arc.pixels.filter((p) => p != null);
      expect(opaque.length).toBeGreaterThan(0);
      expect(new Set(opaque)).toEqual(new Set([SHIELD_COLORS[k]]));
    }
  });

  it('the arc stays above the ship sprite', () => {
    for (let k = 1; k <= MAX_SHIELD; k++) {
      expect(SHIELD_OFFSET_Y + SHIELD_SPRITES[k]!.height).toBeLessThanOrEqual(0);
    }
  });

  it('levels 1..MAX_SHIELD have distinct colors', () => {
    const colors = SHIELD_COLORS.slice(1);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('the empty gauge segment color differs from every level color', () => {
    expect(SHIELD_COLORS).not.toContain(SHIELD_GAUGE_EMPTY_COLOR);
  });

  it('the start shield is drawn (START_SHIELD has an arc)', () => {
    expect(SHIELD_SPRITES[START_SHIELD]).not.toBeNull();
  });
});
