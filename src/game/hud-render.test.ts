import { describe, expect, it } from 'vitest';
import { SCREEN_WIDTH } from '../config';
import {
  HUD_LABEL_COLOR,
  HUD_RECORD_COLOR,
  HUD_VALUE_COLOR,
  HUD_WINDOW_COLOR,
  PANEL_BEVEL_COLOR,
  PANEL_EDGE_COLOR,
  PANEL_PLATE_COLOR,
  PANEL_RIVET_COLOR,
  SHIELD_COLORS,
  SHIELD_GAUGE_EMPTY_COLOR,
} from './art';
import type { PowerUps } from './bonus';
import { NO_POWER_UPS } from './bonus';
import { CAPSULE_OFF_SPRITES, CAPSULE_SPRITES } from './bonus-art';
import type { FillCall } from './canvas-test-utils';
import { recorder } from './canvas-test-utils';
import { drawText, GLYPH_HEIGHT } from './font';
import type { HudView, HudZone } from './hud';
import {
  formatLevel,
  formatScore,
  HI_LABEL,
  HI_ZONE,
  HUD_HEIGHT,
  HUD_LABEL_Y,
  HUD_VALUE_Y,
  HUD_WINDOWS,
  HUD_ZONES,
  LEVEL_LABEL,
  LEVEL_ZONE,
  levelValueX,
  PANEL_RIVETS,
  PANEL_ZONE,
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
import { drawHud, drawPanel } from './hud-render';
import { MAX_SHIELD } from './player';
import { drawSprite } from './sprite';

const BASE: HudView = {
  level: 1,
  score: 0,
  highScore: 0,
  newRecord: false,
  shield: 3,
  powerUps: NO_POWER_UPS,
};
const ALL: PowerUps = { fastShot: true, doubleShot: true };
const MAX_VIEW: HudView = {
  level: 99999,
  score: 999999,
  highScore: 999999,
  newRecord: true,
  shield: MAX_SHIELD,
  powerUps: ALL,
};

function draw(view: HudView): FillCall[] {
  const { ctx, calls } = recorder();
  drawHud(ctx, view);
  return calls;
}

/** Reference output of drawPanel (static: the same every call). */
function panelCalls(): FillCall[] {
  const { ctx, calls } = recorder();
  drawPanel(ctx);
  return calls;
}

/** drawHud calls without the panel plate: the sections only. */
function sections(view: HudView): FillCall[] {
  return draw(view).slice(panelCalls().length);
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

/** Reference output: a lit capsule for each enabled kind, an unlit lamp for the rest. */
function iconCalls(powerUps: PowerUps): FillCall[] {
  const { ctx, calls } = recorder();
  for (const kind of POWER_UP_SLOT_KINDS) {
    const sprite = powerUps[kind] ? CAPSULE_SPRITES[kind] : CAPSULE_OFF_SPRITES[kind];
    drawSprite(ctx, sprite, POWER_UP_SLOT_X[kind], POWER_UPS_ZONE.y);
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

describe('drawPanel', () => {
  it('starts with the whole plate', () => {
    expect(panelCalls()[0]).toEqual({
      fillStyle: PANEL_PLATE_COLOR,
      x: 0,
      y: 0,
      w: SCREEN_WIDTH,
      h: HUD_HEIGHT,
    });
  });

  it('draws only inside PANEL_ZONE', () => {
    for (const c of panelCalls()) expect(inZone(c, PANEL_ZONE), key(c)).toBe(true);
  });

  it('draws the top edge and the bottom bevel across the full width', () => {
    const calls = panelCalls();
    expect(calls).toContainEqual({
      fillStyle: PANEL_EDGE_COLOR,
      x: 0,
      y: 0,
      w: SCREEN_WIDTH,
      h: 1,
    });
    expect(calls).toContainEqual({
      fillStyle: PANEL_BEVEL_COLOR,
      x: 0,
      y: 22,
      w: SCREEN_WIDTH,
      h: 2,
    });
  });

  it('draws every window in the window color', () => {
    const windows = panelCalls().filter((c) => c.fillStyle === HUD_WINDOW_COLOR);
    expect(windows.map((c) => ({ x: c.x, y: c.y, width: c.w, height: c.h }))).toEqual([
      ...HUD_WINDOWS,
    ]);
  });

  it('draws a 1 px rivet at every PANEL_RIVETS point', () => {
    const rivets = panelCalls().filter((c) => c.fillStyle === PANEL_RIVET_COLOR);
    expect(rivets).toEqual(
      PANEL_RIVETS.map((r) => ({ fillStyle: PANEL_RIVET_COLOR, x: r.x, y: r.y, w: 1, h: 1 })),
    );
  });

  it('uses only the panel and window colors', () => {
    const allowed = new Set([
      PANEL_PLATE_COLOR,
      PANEL_EDGE_COLOR,
      PANEL_BEVEL_COLOR,
      PANEL_RIVET_COLOR,
      HUD_WINDOW_COLOR,
    ]);
    for (const c of panelCalls()) expect(allowed.has(c.fillStyle), key(c)).toBe(true);
  });
});

describe('drawHud', () => {
  it.each([
    ['base', BASE],
    ['max', MAX_VIEW],
  ])('starts with the panel (%s)', (_n, view) => {
    const panel = panelCalls();
    expect(panel.length).toBeGreaterThan(0);
    expect(draw(view).slice(0, panel.length)).toEqual(panel);
  });

  it('draws the values inside their windows', () => {
    // every value-row call of a section (y >= HUD_VALUE_Y) lies inside some HUD_WINDOWS entry
    const values = sections(MAX_VIEW).filter((c) => c.y >= HUD_VALUE_Y);
    expect(values.length).toBeGreaterThan(0);
    for (const c of values) {
      expect(
        HUD_WINDOWS.some((w) => inZone(c, w)),
        key(c),
      ).toBe(true);
    }
  });

  it.each([
    ['base', BASE],
    ['max', MAX_VIEW],
  ])('draws only inside the HUD strip and its zones (%s)', (_name, view) => {
    const calls = sections(view);
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
    ['highScore', { ...BASE, highScore: 123 }, HI_ZONE],
    ['newRecord', { ...BASE, newRecord: true }, HI_ZONE],
    ['shield', { ...BASE, shield: 2 }, SHIELD_ZONE],
    ['powerUps', { ...BASE, powerUps: ALL }, POWER_UPS_ZONE],
  ] as const)('a %s change touches only its own zone', (_name, changed, zone) => {
    const a = sections(BASE);
    const b = sections(changed);
    const diff = [...minus(a, b), ...minus(b, a)];
    expect(diff.length).toBeGreaterThan(0);
    for (const c of diff) expect(inZone(c, zone), key(c)).toBe(true);
  });

  it('places the text and the gauge exactly at the zone positions', () => {
    expect(draw({ ...BASE, shield: 0 })).toEqual([
      ...panelCalls(),
      ...textCalls(SCORE_LABEL, SCORE_ZONE.x, HUD_LABEL_Y, HUD_LABEL_COLOR),
      ...textCalls(formatScore(0), SCORE_ZONE.x, HUD_VALUE_Y, HUD_VALUE_COLOR),
      ...textCalls(HI_LABEL, HI_ZONE.x, HUD_LABEL_Y, HUD_LABEL_COLOR),
      ...textCalls(formatScore(0), HI_ZONE.x, HUD_VALUE_Y, HUD_VALUE_COLOR),
      ...textCalls(LEVEL_LABEL, LEVEL_ZONE.x, HUD_LABEL_Y, HUD_LABEL_COLOR),
      ...textCalls(formatLevel(1), LEVEL_ZONE.x + 16, HUD_VALUE_Y, HUD_VALUE_COLOR),
      ...gaugeCalls(0),
      ...iconCalls(NO_POWER_UPS),
    ]);
  });

  it.each([
    [9, 16],
    [10, 12],
  ])('centers level %i under the label (x offset %i)', (level, offset) => {
    const calls = sections({ ...BASE, level }).filter(
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
      const calls = sections({ ...BASE, shield }).filter((c) => inZone(c, SHIELD_ZONE));
      expect(calls).toEqual(gaugeCalls(shield));
      expect(calls).toHaveLength(MAX_SHIELD);
      const filled = calls.filter((c) => c.fillStyle !== SHIELD_GAUGE_EMPTY_COLOR);
      expect(filled).toHaveLength(shield);
      for (const c of filled) expect(c.fillStyle).toBe(SHIELD_COLORS[shield]);
    },
  );

  it('draws the gauge at the exact pixels', () => {
    const calls = sections({ ...BASE, shield: 2 }).filter((c) => inZone(c, SHIELD_ZONE));
    expect(calls.map((c) => [c.x, c.y, c.w, c.h])).toEqual([
      [200, 14, 8, 4],
      [210, 14, 8, 4],
      [220, 14, 8, 4],
      [230, 14, 8, 4],
      [240, 14, 8, 4],
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
    const calls = sections(BASE);
    const labelRow = calls.filter((c) => c.y >= HUD_LABEL_Y && c.y < HUD_LABEL_Y + GLYPH_HEIGHT);
    expect(labelRow.length).toBeGreaterThan(0);
    for (const c of labelRow) expect(c.fillStyle).toBe(HUD_LABEL_COLOR);

    const valueText = calls.filter(
      (c) =>
        c.y >= HUD_VALUE_Y &&
        c.y < HUD_VALUE_Y + GLYPH_HEIGHT &&
        (inZone(c, SCORE_ZONE) || inZone(c, HI_ZONE) || inZone(c, LEVEL_ZONE)),
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
        sections(view).filter(
          (c) =>
            c.fillStyle === HUD_LABEL_COLOR &&
            (inZone(c, SCORE_ZONE) || inZone(c, HI_ZONE) || inZone(c, LEVEL_ZONE)),
        ),
      );
    expect(
      labels({
        level: 12,
        score: 4567,
        highScore: 4567,
        newRecord: true,
        shield: 1,
        powerUps: ALL,
      }),
    ).toEqual(labels(BASE));
  });

  it('draws the beaten record in HUD_RECORD_COLOR, the label unchanged', () => {
    const calls = sections({ ...BASE, highScore: 42, newRecord: true }).filter((c) =>
      inZone(c, HI_ZONE),
    );
    expect(calls).toEqual([
      ...textCalls(HI_LABEL, HI_ZONE.x, HUD_LABEL_Y, HUD_LABEL_COLOR),
      ...textCalls(formatScore(42), HI_ZONE.x, HUD_VALUE_Y, HUD_RECORD_COLOR),
    ]);
  });

  it('keeps the score value color when the record is beaten', () => {
    const scoreValue = sections({ ...BASE, score: 42, highScore: 42, newRecord: true }).filter(
      (c) => inZone(c, SCORE_ZONE) && c.y >= HUD_VALUE_Y,
    );
    expect(scoreValue.length).toBeGreaterThan(0);
    for (const c of scoreValue) expect(c.fillStyle).toBe(HUD_VALUE_COLOR);
  });

  it('draws the record value in HUD_VALUE_COLOR when not beaten', () => {
    const value = sections({ ...BASE, highScore: 500, newRecord: false }).filter(
      (c) => inZone(c, HI_ZONE) && c.y >= HUD_VALUE_Y,
    );
    expect(value).toEqual(textCalls(formatScore(500), HI_ZONE.x, HUD_VALUE_Y, HUD_VALUE_COLOR));
  });

  it('draws an unlit lamp in every slot without power-ups', () => {
    const calls = sections(BASE).filter((c) => inZone(c, POWER_UPS_ZONE));
    expect(calls.length).toBeGreaterThan(0);
    expect(sortedKeys(calls)).toEqual(sortedKeys(iconCalls(NO_POWER_UPS)));
    const lit = new Set(
      POWER_UP_SLOT_KINDS.flatMap((kind) =>
        CAPSULE_SPRITES[kind].pixels.filter((p): p is string => p !== null),
      ),
    );
    for (const c of calls) expect(lit.has(c.fillStyle), key(c)).toBe(false);
  });

  it.each([
    ['fastShot', { ...NO_POWER_UPS, fastShot: true }],
    ['doubleShot', { ...NO_POWER_UPS, doubleShot: true }],
    ['both', ALL],
  ] as const)('lights the enabled power-ups, the rest stay unlit (%s)', (_name, powerUps) => {
    const calls = sections({ ...BASE, powerUps }).filter((c) => inZone(c, POWER_UPS_ZONE));
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
