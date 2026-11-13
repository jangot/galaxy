import { describe, expect, it } from 'vitest';
import { SCREEN_WIDTH } from '../config';
import { HUD_LABEL_COLOR, HUD_VALUE_COLOR, SHIELD_COLORS, SHIELD_GAUGE_EMPTY_COLOR } from './art';
import type { PowerUps } from './bonus';
import { NO_POWER_UPS } from './bonus';
import { CAPSULE_SPRITES } from './bonus-art';
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
  POWER_UP_SLOT_KINDS,
  POWER_UP_SLOT_X,
  POWER_UPS_ZONE,
  SCORE_LABEL,
  SCORE_ZONE,
  SHIELD_SEGMENT_HEIGHT,
  SHIELD_SEGMENT_WIDTH,
  SHIELD_SEGMENT_Y,
  SHIELD_ZONE,
  shieldSegmentX,
} from './hud';
import { drawHud } from './hud-render';
import { MAX_SHIELD } from './player';
import { drawSprite } from './sprite';

const BASE: HudView = { level: 1, score: 0, shield: 3, powerUps: NO_POWER_UPS };
const ALL: PowerUps = { fastShot: true, doubleShot: true };

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

/** Reference output: capsule sprites of the enabled kinds in their slots. */
function iconCalls(powerUps: PowerUps): FillCall[] {
  const { ctx, calls } = recorder();
  for (const kind of POWER_UP_SLOT_KINDS) {
    if (powerUps[kind])
      drawSprite(ctx, CAPSULE_SPRITES[kind], POWER_UP_SLOT_X[kind], POWER_UPS_ZONE.y);
  }
  return calls;
}

/** Reference output: the gauge for a shield level, built from the layout constants. */
function gaugeCalls(shield: number): FillCall[] {
  return Array.from({ length: MAX_SHIELD }, (_, i) => ({
    fillStyle: i < shield ? SHIELD_COLORS[shield]! : SHIELD_GAUGE_EMPTY_COLOR,
    x: shieldSegmentX(i),
    y: SHIELD_SEGMENT_Y,
    w: SHIELD_SEGMENT_WIDTH,
    h: SHIELD_SEGMENT_HEIGHT,
  }));
}

describe('drawHud', () => {
  it.each([
    ['base', BASE],
    ['max', { level: 99999, score: 999999, shield: MAX_SHIELD, powerUps: ALL }],
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
    ['shield', { ...BASE, shield: 2 }, SHIELD_ZONE],
    ['powerUps', { ...BASE, powerUps: ALL }, POWER_UPS_ZONE],
  ] as const)('a %s change touches only its own zone', (_name, changed, zone) => {
    const a = draw(BASE);
    const b = draw(changed);
    const diff = [...minus(a, b), ...minus(b, a)];
    expect(diff.length).toBeGreaterThan(0);
    for (const c of diff) expect(inZone(c, zone), key(c)).toBe(true);
  });

  it('places the text and the gauge exactly at the zone positions', () => {
    expect(draw({ ...BASE, shield: 0 })).toEqual([
      ...textCalls(SCORE_LABEL, SCORE_ZONE.x, HUD_LABEL_Y, HUD_LABEL_COLOR),
      ...textCalls(formatScore(0), SCORE_ZONE.x, HUD_VALUE_Y, HUD_VALUE_COLOR),
      ...textCalls(LEVEL_LABEL, LEVEL_ZONE.x, HUD_LABEL_Y, HUD_LABEL_COLOR),
      ...textCalls(formatLevel(1), LEVEL_ZONE.x + 16, HUD_VALUE_Y, HUD_VALUE_COLOR),
      ...gaugeCalls(0),
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

  it.each([0, 1, 2, 3, 4, MAX_SHIELD])(
    'draws the gauge for shield %i: always MAX_SHIELD segments, that many filled',
    (shield) => {
      const calls = draw({ ...BASE, shield }).filter((c) => inZone(c, SHIELD_ZONE));
      expect(calls).toEqual(gaugeCalls(shield));
      expect(calls).toHaveLength(MAX_SHIELD);
      const filled = calls.filter((c) => c.fillStyle !== SHIELD_GAUGE_EMPTY_COLOR);
      expect(filled).toHaveLength(shield);
      for (const c of filled) expect(c.fillStyle).toBe(SHIELD_COLORS[shield]);
    },
  );

  it('draws the gauge at the exact pixels', () => {
    const calls = draw({ ...BASE, shield: 2 }).filter((c) => inZone(c, SHIELD_ZONE));
    expect(calls.map((c) => [c.x, c.y, c.w, c.h])).toEqual([
      [200, 16, 8, 4],
      [210, 16, 8, 4],
      [220, 16, 8, 4],
      [230, 16, 8, 4],
      [240, 16, 8, 4],
    ]);
    expect(calls.map((c) => c.fillStyle)).toEqual([
      SHIELD_COLORS[2],
      SHIELD_COLORS[2],
      SHIELD_GAUGE_EMPTY_COLOR,
      SHIELD_GAUGE_EMPTY_COLOR,
      SHIELD_GAUGE_EMPTY_COLOR,
    ]);
  });

  it('uses label, value and gauge colors in their places', () => {
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

    const gaugeColors = new Set([SHIELD_COLORS[BASE.shield], SHIELD_GAUGE_EMPTY_COLOR]);
    const gauge = calls.filter((c) => inZone(c, SHIELD_ZONE));
    expect(gauge.length).toBeGreaterThan(0);
    for (const c of gauge) expect(gaugeColors.has(c.fillStyle)).toBe(true);
  });

  it('draws the labels the same for any values', () => {
    // Text zones only: other sections may share colors with the labels.
    const labels = (view: HudView): string[] =>
      sortedKeys(
        draw(view).filter(
          (c) =>
            c.fillStyle === HUD_LABEL_COLOR && (inZone(c, SCORE_ZONE) || inZone(c, LEVEL_ZONE)),
        ),
      );
    expect(labels({ level: 12, score: 4567, shield: 1, powerUps: ALL })).toEqual(labels(BASE));
  });

  it('draws nothing in the power-ups zone without power-ups', () => {
    expect(draw(BASE).filter((c) => inZone(c, POWER_UPS_ZONE))).toEqual([]);
  });

  it.each([
    ['fastShot', { ...NO_POWER_UPS, fastShot: true }],
    ['doubleShot', { ...NO_POWER_UPS, doubleShot: true }],
    ['both', ALL],
  ] as const)('draws only the enabled power-ups, each in its slot (%s)', (_name, powerUps) => {
    const calls = draw({ ...BASE, powerUps }).filter((c) => inZone(c, POWER_UPS_ZONE));
    expect(calls.length).toBeGreaterThan(0);
    expect(sortedKeys(calls)).toEqual(sortedKeys(iconCalls(powerUps)));
  });

  it('keeps the doubleShot icon in place with or without fastShot', () => {
    const only = draw({ ...BASE, powerUps: { ...NO_POWER_UPS, doubleShot: true } });
    const both = draw({ ...BASE, powerUps: ALL });
    const fastOnly = draw({ ...BASE, powerUps: { ...NO_POWER_UPS, fastShot: true } });
    // both = doubleShot alone + fastShot alone, as multisets (outside the zone nothing changes)
    expect(sortedKeys(minus(both, fastOnly))).toEqual(sortedKeys(minus(only, draw(BASE))));
  });
});
