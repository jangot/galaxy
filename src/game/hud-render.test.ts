import { describe, expect, it } from 'vitest';
import { SCREEN_WIDTH } from '../config';
import { HUD_LABEL_COLOR, HUD_VALUE_COLOR, LIFE_ICON_SPRITE } from './art';
import type { FillCall } from './canvas-test-utils';
import { recorder } from './canvas-test-utils';
import { drawText, GLYPH_HEIGHT } from './font';
import type { HudView, HudZone } from './hud';
import {
  formatLevel,
  formatScore,
  HUD_HEIGHT,
  HUD_LABEL_Y,
  HUD_VALUE_Y,
  HUD_ZONES,
  LEVEL_LABEL,
  LEVEL_ZONE,
  levelValueX,
  LIFE_ICON_STEP,
  LIVES_ICON_SLOTS,
  LIVES_ZONE,
  SCORE_LABEL,
  SCORE_ZONE,
} from './hud';
import { drawHud } from './hud-render';
import { drawSprite } from './sprite';

const BASE: HudView = { level: 1, score: 0, lives: 3 };

function draw(view: HudView): FillCall[] {
  const { ctx, calls } = recorder();
  drawHud(ctx, view);
  return calls;
}

/** Reference output of a drawText call, recorded separately. */
function textCalls(text: string, x: number, y: number, color: string): FillCall[] {
  const { ctx, calls } = recorder();
  drawText(ctx, text, x, y, color);
  return calls;
}

const key = (c: FillCall): string => `${c.fillStyle}|${c.x}|${c.y}|${c.w}|${c.h}`;

/** Multiset difference: calls of a that are not matched in b. */
function minus(a: readonly FillCall[], b: readonly FillCall[]): FillCall[] {
  const counts = new Map<string, number>();
  for (const c of b) counts.set(key(c), (counts.get(key(c)) ?? 0) + 1);
  const rest: FillCall[] = [];
  for (const c of a) {
    const n = counts.get(key(c)) ?? 0;
    if (n > 0) counts.set(key(c), n - 1);
    else rest.push(c);
  }
  return rest;
}

/** Order-independent comparison of two call lists. */
const sortedKeys = (calls: readonly FillCall[]): string[] => calls.map(key).sort();

function inZone(c: FillCall, z: HudZone): boolean {
  return c.x >= z.x && c.x + c.w <= z.x + z.width && c.y >= z.y && c.y + c.h <= z.y + z.height;
}

/** Number of opaque pixels of the icon. */
const ICON_PIXELS = LIFE_ICON_SPRITE.pixels.filter((p) => p != null).length;

describe('drawHud', () => {
  it.each([
    ['base', BASE],
    ['max', { level: 99999, score: 999999, lives: LIVES_ICON_SLOTS }],
  ])('draws only inside the HUD strip and its zones (%s)', (_name, view) => {
    const calls = draw(view);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(SCREEN_WIDTH);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y + c.h).toBeLessThanOrEqual(HUD_HEIGHT);
      expect(
        HUD_ZONES.some((z) => inZone(c, z)),
        key(c),
      ).toBe(true);
    }
  });

  it.each([
    ['level', { ...BASE, level: 2 }, LEVEL_ZONE],
    ['score', { ...BASE, score: 123 }, SCORE_ZONE],
    ['lives', { ...BASE, lives: 2 }, LIVES_ZONE],
  ] as const)('a %s change touches only its own zone', (_name, changed, zone) => {
    const a = draw(BASE);
    const b = draw(changed);
    const diff = [...minus(a, b), ...minus(b, a)];
    expect(diff.length).toBeGreaterThan(0);
    for (const c of diff) expect(inZone(c, zone), key(c)).toBe(true);
  });

  it('places the text exactly at the zone positions', () => {
    expect(draw({ ...BASE, lives: 0 })).toEqual([
      ...textCalls(SCORE_LABEL, SCORE_ZONE.x, HUD_LABEL_Y, HUD_LABEL_COLOR),
      ...textCalls(formatScore(0), SCORE_ZONE.x, HUD_VALUE_Y, HUD_VALUE_COLOR),
      ...textCalls(LEVEL_LABEL, LEVEL_ZONE.x, HUD_LABEL_Y, HUD_LABEL_COLOR),
      ...textCalls(formatLevel(1), LEVEL_ZONE.x + 16, HUD_VALUE_Y, HUD_VALUE_COLOR),
    ]);
  });

  it.each([
    [9, 16],
    [10, 12],
  ])('centers level %i under the label (x offset %i)', (level, offset) => {
    const calls = draw({ ...BASE, level }).filter(
      (c) => c.fillStyle === HUD_VALUE_COLOR && inZone(c, LEVEL_ZONE),
    );
    expect(calls).toEqual(
      textCalls(formatLevel(level), LEVEL_ZONE.x + offset, HUD_VALUE_Y, HUD_VALUE_COLOR),
    );
    expect(levelValueX(formatLevel(level))).toBe(LEVEL_ZONE.x + offset);
  });

  it.each([0, 1, 3, LIVES_ICON_SLOTS])('draws %i lives icons from the right edge', (lives) => {
    const calls = draw({ ...BASE, lives }).filter((c) => inZone(c, LIVES_ZONE));
    expect(calls).toHaveLength(lives * ICON_PIXELS);
    if (lives > 0) {
      expect(Math.max(...calls.map((c) => c.x + c.w))).toBe(LIVES_ZONE.x + LIVES_ZONE.width);
    }
    const { ctx, calls: expected } = recorder();
    for (let i = 0; i < lives; i++) {
      const x = LIVES_ZONE.x + LIVES_ZONE.width - LIFE_ICON_SPRITE.width - i * LIFE_ICON_STEP;
      drawSprite(ctx, LIFE_ICON_SPRITE, x, LIVES_ZONE.y);
    }
    expect(sortedKeys(calls)).toEqual(sortedKeys(expected));
  });

  it('uses label, value and icon colors in their places', () => {
    const calls = draw(BASE);
    const labelRow = calls.filter((c) => c.y >= HUD_LABEL_Y && c.y < HUD_LABEL_Y + GLYPH_HEIGHT);
    expect(labelRow.length).toBeGreaterThan(0);
    for (const c of labelRow) expect(c.fillStyle).toBe(HUD_LABEL_COLOR);

    const valueText = calls.filter(
      (c) =>
        c.y >= HUD_VALUE_Y &&
        c.y < HUD_VALUE_Y + GLYPH_HEIGHT &&
        (inZone(c, SCORE_ZONE) || inZone(c, LEVEL_ZONE)),
    );
    expect(valueText.length).toBeGreaterThan(0);
    for (const c of valueText) expect(c.fillStyle).toBe(HUD_VALUE_COLOR);

    const iconColors = new Set(LIFE_ICON_SPRITE.pixels.filter((p) => p != null));
    const icons = calls.filter((c) => inZone(c, LIVES_ZONE));
    expect(icons.length).toBeGreaterThan(0);
    for (const c of icons) expect(iconColors.has(c.fillStyle)).toBe(true);
  });

  it('draws the labels the same for any values', () => {
    // Text zones only: the icon's cockpit/engine red equals HUD_LABEL_COLOR (ship palette R).
    const labels = (view: HudView): string[] =>
      sortedKeys(
        draw(view).filter(
          (c) =>
            c.fillStyle === HUD_LABEL_COLOR && (inZone(c, SCORE_ZONE) || inZone(c, LEVEL_ZONE)),
        ),
      );
    expect(labels({ level: 12, score: 4567, lives: 1 })).toEqual(labels(BASE));
  });
});
