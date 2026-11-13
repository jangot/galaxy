import { describe, expect, it } from 'vitest';
import { SCREEN_WIDTH, TICK_SECONDS } from '../config';
import { createRng } from '../engine/rng';
import { Battle } from './battle';
import { NO_POWER_UPS } from './bonus';
import { CAPSULE_SPRITES } from './bonus-art';
import { CHAR_ADVANCE, GLYPH_HEIGHT, textWidth } from './font';
import type { HudRecord } from './hud';
import {
  formatLevel,
  formatScore,
  HI_LABEL,
  HI_ZONE,
  HUD_HEIGHT,
  HUD_ICON_SIZE,
  HUD_ICON_STEP,
  HUD_LABEL_Y,
  HUD_MARGIN_X,
  HUD_VALUE_Y,
  HUD_WINDOW_PAD,
  HUD_WINDOWS,
  HUD_ZONES,
  hudView,
  LEVEL_LABEL,
  LEVEL_ZONE,
  levelValueX,
  PANEL_BEVEL_HEIGHT,
  PANEL_EDGE_HEIGHT,
  PANEL_RIVETS,
  PANEL_ZONE,
  POWER_UP_SLOT_KINDS,
  POWER_UP_SLOT_X,
  POWER_UPS_ZONE,
  SCORE_DIGITS,
  SCORE_LABEL,
  SCORE_ZONE,
  SHIELD_SEGMENT_HEIGHT,
  SHIELD_SEGMENT_WIDTH,
  SHIELD_SEGMENT_Y,
  SHIELD_ZONE,
  shieldSegmentX,
  valueRow,
} from './hud';
import type { HudZone } from './hud';
import { MAX_SHIELD, START_SHIELD } from './player';
import { TWO_LEVELS } from './test-levels';
import { onlyShot } from './test-shots';

const NO_RECORD: HudRecord = { best: 0, atStart: 0 };

/** a lies inside b (half-open rectangles). */
function inside(a: HudZone, b: HudZone): boolean {
  return (
    a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height
  );
}

/** a and b share at least one pixel (half-open rectangles). */
function overlaps(a: HudZone, b: HudZone): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** A battle that has just shot down the corner drone: score 30. */
function battleWith30(): Battle {
  const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
  const fire = { move: 0, fire: true } as const;
  battle.player.ship.x = 40; // shot column x = 47: the corner drone
  battle.update(TICK_SECONDS, fire);
  onlyShot(battle.player)!.y = 42;
  battle.update(TICK_SECONDS, fire);
  return battle;
}

describe('formatting', () => {
  it('pads the score to six digits and keeps longer numbers whole', () => {
    expect(formatScore(0)).toBe('000000');
    expect(formatScore(123)).toBe('000123');
    expect(formatScore(1234567)).toBe('1234567');
  });

  it('prints the level as a plain number', () => {
    expect(formatLevel(1)).toBe('1');
    expect(formatLevel(12)).toBe('12');
  });
});

describe('hudView', () => {
  it.each([1, 3])(
    "shows the battle level %i, score 0, the player's shield and no power-ups",
    (startLevel) => {
      const battle = new Battle(createRng(1), { levels: TWO_LEVELS, startLevel });
      expect(hudView(battle, NO_RECORD)).toEqual({
        level: startLevel,
        score: 0,
        highScore: 0,
        newRecord: false,
        shield: START_SHIELD,
        powerUps: NO_POWER_UPS,
      });
    },
  );

  it("follows the player's shield", () => {
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
    battle.player.hit();
    expect(hudView(battle, NO_RECORD).shield).toBe(START_SHIELD - 1);
    expect(
      hudView(new Battle(createRng(1), { levels: TWO_LEVELS, shield: 5 }), NO_RECORD).shield,
    ).toBe(5);
  });

  it('follows the battle score', () => {
    const battle = battleWith30();
    expect(battle.wave.enemies[0]!.state).toBe('exploding');
    expect(hudView(battle, NO_RECORD).score).toBe(battle.score);
    expect(hudView(battle, NO_RECORD).score).toBe(30);
  });

  it.each(['fastShot', 'doubleShot'] as const)("follows the player's power-up %s", (kind) => {
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
    battle.player.grantPowerUp(kind);
    expect(hudView(battle, NO_RECORD).powerUps).toEqual({ ...NO_POWER_UPS, [kind]: true });
  });

  it('shows both power-ups and keeps them after a hit', () => {
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
    battle.player.grantPowerUp('fastShot');
    battle.player.grantPowerUp('doubleShot');
    battle.player.hit();
    expect(hudView(battle, NO_RECORD).powerUps).toEqual({ fastShot: true, doubleShot: true });
  });
});

describe('hudView record', () => {
  const fresh = (): Battle => new Battle(createRng(1), { levels: TWO_LEVELS });

  it('score 0 over no record: HI 0, not a record (a 0 = 0 tie)', () => {
    const view = hudView(fresh(), NO_RECORD);
    expect(view.highScore).toBe(0);
    expect(view.newRecord).toBe(false);
  });

  it('score 0 over a saved record shows the record, not beaten', () => {
    const view = hudView(fresh(), { best: 500, atStart: 500 });
    expect(view.highScore).toBe(500);
    expect(view.newRecord).toBe(false);
  });

  it('the first game beats the record from the first point', () => {
    const view = hudView(battleWith30(), NO_RECORD);
    expect(view.highScore).toBe(30);
    expect(view.newRecord).toBe(true);
  });

  it('a tie is not a record', () => {
    const view = hudView(battleWith30(), { best: 30, atStart: 30 });
    expect(view.highScore).toBe(30);
    expect(view.newRecord).toBe(false);
  });

  it('shows max(best, score) even before submit', () => {
    const view = hudView(battleWith30(), { best: 10, atStart: 10 });
    expect(view.highScore).toBe(30);
    expect(view.newRecord).toBe(true);
  });

  it("shows another tab's higher record, still yellow (expected by design)", () => {
    const view = hudView(battleWith30(), { best: 900, atStart: 10 });
    expect(view.highScore).toBe(900);
    expect(view.newRecord).toBe(true);
  });
});

describe('layout', () => {
  it('keeps every zone on integer coordinates inside the HUD strip', () => {
    for (const z of HUD_ZONES) {
      for (const v of [z.x, z.y, z.width, z.height]) expect(Number.isInteger(v)).toBe(true);
      expect(z.x).toBeGreaterThanOrEqual(0);
      expect(z.y).toBeGreaterThanOrEqual(0);
      expect(z.x + z.width).toBeLessThanOrEqual(SCREEN_WIDTH);
      expect(z.y + z.height).toBeLessThanOrEqual(HUD_HEIGHT);
    }
  });

  it('has no overlapping zones', () => {
    for (let i = 0; i < HUD_ZONES.length; i++) {
      for (let j = i + 1; j < HUD_ZONES.length; j++) {
        const a = HUD_ZONES[i]!;
        const b = HUD_ZONES[j]!;
        const overlap =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlap, `zones ${i} and ${j}`).toBe(false);
      }
    }
  });

  it('stays above the highest enemy pixel', () => {
    // Free strip above the formation: the highest enemy pixel is an explosion at the peel
    // apex, top y = 29 (drone row 0: slot y 34, 4 px up, frame 9 px tall centered -> -1).
    // <= 28 keeps at least 1 px between the HUD and it; a limit for future sections too.
    expect(HUD_HEIGHT).toBeLessThanOrEqual(28);
  });

  it('includes the HI zone', () => {
    expect(HUD_ZONES).toContain(HI_ZONE);
  });

  it('lays out the columns left to right (В1)', () => {
    expect(SCORE_ZONE.x).toBe(8);
    expect(HI_ZONE).toEqual({ x: 64, y: 3, width: 48, height: 16 });
    expect(LEVEL_ZONE.x).toBe(120);
    expect(POWER_UPS_ZONE.x).toBe(168);
    expect(POWER_UP_SLOT_X).toEqual({ fastShot: 168, doubleShot: 178 });
    expect(SHIELD_ZONE.x).toBe(200);
    const byX = [...HUD_ZONES].sort((a, b) => a.x - b.x);
    for (let i = 1; i < byX.length; i++) {
      const prev = byX[i - 1]!;
      expect(
        byX[i]!.x - (prev.x + prev.width),
        `gap before zone at x ${byX[i]!.x}`,
      ).toBeGreaterThanOrEqual(8);
    }
  });

  it('includes the power-ups zone', () => {
    expect(HUD_ZONES).toContain(POWER_UPS_ZONE);
  });

  it('puts the power-ups zone on the value row', () => {
    expect(POWER_UPS_ZONE.y).toBe(HUD_VALUE_Y);
    expect(POWER_UPS_ZONE.height).toBeGreaterThanOrEqual(HUD_ICON_SIZE);
  });

  it('includes the shield zone', () => {
    expect(HUD_ZONES).toContain(SHIELD_ZONE);
  });

  it('puts the shield zone on the value row at the right margin', () => {
    expect(SHIELD_ZONE.y).toBe(HUD_VALUE_Y);
    expect(SHIELD_ZONE.x + SHIELD_ZONE.width).toBe(SCREEN_WIDTH - HUD_MARGIN_X);
    expect(SHIELD_ZONE).toEqual({ x: 200, y: 12, width: 48, height: 8 });
  });

  it('keeps the label row above the value row', () => {
    expect(HUD_LABEL_Y + GLYPH_HEIGHT).toBeLessThanOrEqual(HUD_VALUE_Y);
  });
});

describe('capacity', () => {
  it('fits the score label and six digits', () => {
    expect(SCORE_ZONE.width).toBeGreaterThanOrEqual(textWidth(SCORE_LABEL));
    expect(SCORE_ZONE.width).toBeGreaterThanOrEqual(SCORE_DIGITS * CHAR_ADVANCE);
  });

  it('fits the HI label and six digits', () => {
    expect(HI_ZONE.width).toBeGreaterThanOrEqual(textWidth(HI_LABEL));
    expect(HI_ZONE.width).toBeGreaterThanOrEqual(SCORE_DIGITS * CHAR_ADVANCE);
  });

  it('fits the level label', () => {
    expect(LEVEL_ZONE.width).toBeGreaterThanOrEqual(textWidth(LEVEL_LABEL));
  });

  it.each([1, 9, 10, 99, 999, 99999])('keeps the centered level %i inside its zone', (level) => {
    const text = formatLevel(level);
    const x = levelValueX(text);
    expect(Number.isInteger(x)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(LEVEL_ZONE.x);
    expect(x + textWidth(text)).toBeLessThanOrEqual(LEVEL_ZONE.x + LEVEL_ZONE.width);
  });

  it.each([
    ['score', SCORE_ZONE],
    ['hi', HI_ZONE],
    ['level', LEVEL_ZONE],
  ])('%s zone spans both text rows', (_name, zone) => {
    expect(zone.y).toBeLessThanOrEqual(HUD_LABEL_Y);
    expect(zone.y + zone.height).toBeGreaterThanOrEqual(HUD_VALUE_Y + GLYPH_HEIGHT);
  });
});

describe('shield gauge', () => {
  it('places segments at integer x with HUD_ICON_STEP, left to right', () => {
    const xs = Array.from({ length: MAX_SHIELD }, (_, i) => shieldSegmentX(i));
    expect(xs).toEqual([200, 210, 220, 230, 240]);
    for (const x of xs) expect(Number.isInteger(x)).toBe(true);
  });

  it('does not overlap neighboring segments', () => {
    expect(SHIELD_SEGMENT_WIDTH).toBeLessThanOrEqual(HUD_ICON_STEP);
  });

  it('fits all MAX_SHIELD segments into the zone', () => {
    expect(shieldSegmentX(0)).toBeGreaterThanOrEqual(SHIELD_ZONE.x);
    expect(shieldSegmentX(MAX_SHIELD - 1) + SHIELD_SEGMENT_WIDTH).toBeLessThanOrEqual(
      SHIELD_ZONE.x + SHIELD_ZONE.width,
    );
    expect(SHIELD_SEGMENT_Y).toBeGreaterThanOrEqual(SHIELD_ZONE.y);
    expect(SHIELD_SEGMENT_Y + SHIELD_SEGMENT_HEIGHT).toBeLessThanOrEqual(
      SHIELD_ZONE.y + SHIELD_ZONE.height,
    );
  });

  it('centers segments vertically in the value row (y = 14...17)', () => {
    expect(Number.isInteger(SHIELD_SEGMENT_Y)).toBe(true);
    expect(SHIELD_SEGMENT_Y).toBe(14);
  });
});

describe('panel', () => {
  it('puts the label and value rows inside the panel (labels y = 3, values y = 12)', () => {
    expect(HUD_LABEL_Y).toBe(3);
    expect(HUD_VALUE_Y).toBe(12);
  });

  it('valueRow keeps x and width and takes the value row', () => {
    expect(valueRow(SCORE_ZONE)).toEqual({ x: 8, y: 12, width: 48, height: HUD_ICON_SIZE });
    expect(valueRow(LEVEL_ZONE)).toEqual({ x: 120, y: 12, width: 40, height: 8 });
  });

  it.each([
    ['shield', SHIELD_ZONE],
    ['power-ups', POWER_UPS_ZONE],
  ])('valueRow of the value-row-only %s zone is the zone itself', (_n, zone) => {
    expect(valueRow(zone)).toEqual(zone);
  });

  it('the plate is the whole HUD strip', () => {
    expect(PANEL_ZONE).toEqual({ x: 0, y: 0, width: SCREEN_WIDTH, height: HUD_HEIGHT });
  });

  it('has one window per zone: its value row grown by HUD_WINDOW_PAD', () => {
    expect(HUD_WINDOW_PAD).toBe(1);
    expect(HUD_WINDOWS).toHaveLength(HUD_ZONES.length);
    HUD_ZONES.forEach((zone, i) => {
      const row = valueRow(zone);
      expect(HUD_WINDOWS[i]).toEqual({
        x: row.x - 1,
        y: row.y - 1,
        width: row.width + 2,
        height: row.height + 2,
      });
    });
  });

  it('places the windows at the designed pixels', () => {
    expect(HUD_WINDOWS).toEqual([
      { x: 7, y: 11, width: 50, height: 10 }, // SCORE
      { x: 63, y: 11, width: 50, height: 10 }, // HI
      { x: 119, y: 11, width: 42, height: 10 }, // LEVEL
      { x: 199, y: 11, width: 50, height: 10 }, // shield
      { x: 167, y: 11, width: 20, height: 10 }, // power-ups
    ]);
  });

  it('keeps every window inside the plate, below the labels and above the bevel', () => {
    for (const w of HUD_WINDOWS) {
      expect(inside(w, PANEL_ZONE)).toBe(true);
      expect(w.y).toBeGreaterThan(HUD_LABEL_Y + GLYPH_HEIGHT - 1); // label bottom 9 < top 11
      expect(w.y).toBeGreaterThanOrEqual(PANEL_EDGE_HEIGHT);
      expect(w.y + w.height).toBeLessThanOrEqual(HUD_HEIGHT - PANEL_BEVEL_HEIGHT);
    }
  });

  it('has no overlapping windows', () => {
    for (let i = 0; i < HUD_WINDOWS.length; i++) {
      for (let j = i + 1; j < HUD_WINDOWS.length; j++) {
        expect(overlaps(HUD_WINDOWS[i]!, HUD_WINDOWS[j]!), `windows ${i} and ${j}`).toBe(false);
      }
    }
  });

  it('keeps the rivets in the plate, off the edge, the bevel, the windows and the zones', () => {
    expect(PANEL_RIVETS.length).toBeGreaterThan(0);
    for (const r of PANEL_RIVETS) {
      const px = { x: r.x, y: r.y, width: 1, height: 1 };
      expect(inside(px, PANEL_ZONE)).toBe(true);
      expect(r.y).toBeGreaterThanOrEqual(PANEL_EDGE_HEIGHT);
      expect(r.y).toBeLessThan(HUD_HEIGHT - PANEL_BEVEL_HEIGHT);
      for (const z of [...HUD_WINDOWS, ...HUD_ZONES]) expect(overlaps(px, z)).toBe(false);
    }
  });
});

describe('power-up icons', () => {
  it('keeps the icon size limit within the step', () => {
    expect(HUD_ICON_SIZE).toBeLessThanOrEqual(HUD_ICON_STEP);
    expect(HUD_ICON_SIZE).toBeLessThanOrEqual(8); // owner's decision: icon at most 8×8
  });

  it('has exactly one slot for every power-up', () => {
    expect([...POWER_UP_SLOT_KINDS].sort()).toEqual(Object.keys(NO_POWER_UPS).sort());
  });

  it.each(POWER_UP_SLOT_KINDS)('keeps the %s slot inside the zone', (kind) => {
    const x = POWER_UP_SLOT_X[kind];
    expect(Number.isInteger(x)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(POWER_UPS_ZONE.x);
    expect(x + HUD_ICON_SIZE).toBeLessThanOrEqual(POWER_UPS_ZONE.x + POWER_UPS_ZONE.width);
  });

  it('keeps the slots apart', () => {
    for (let i = 1; i < POWER_UP_SLOT_KINDS.length; i++) {
      const prev = POWER_UP_SLOT_X[POWER_UP_SLOT_KINDS[i - 1]!];
      const next = POWER_UP_SLOT_X[POWER_UP_SLOT_KINDS[i]!];
      expect(next - prev).toBeGreaterThanOrEqual(HUD_ICON_SIZE);
    }
  });

  it.each(POWER_UP_SLOT_KINDS)('fits the %s capsule sprite into a slot', (kind) => {
    expect(CAPSULE_SPRITES[kind].width).toBeLessThanOrEqual(HUD_ICON_SIZE);
    expect(CAPSULE_SPRITES[kind].height).toBeLessThanOrEqual(HUD_ICON_SIZE);
  });
});
