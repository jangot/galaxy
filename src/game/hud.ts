import { SCREEN_WIDTH } from '../config';
import type { Battle } from './battle';
import type { PowerUpKind, PowerUps } from './bonus';
import { CHAR_ADVANCE, GLYPH_HEIGHT, textWidth } from './font';
import { MAX_SHIELD } from './player';

/** Data shown by the HUD; a pure snapshot built from the battle each frame. */
export interface HudView {
  readonly level: number;
  readonly score: number;
  /** Shown record: max(record.best, score). */
  readonly highScore: number;
  /** score > the record at the start of this game; colors the HI value (В4). */
  readonly newRecord: boolean;
  /** Shield level 0..MAX_SHIELD, drawn as the shield gauge. */
  readonly shield: number;
  /** Enabled power-ups; each one lights its own fixed slot until the game ends. */
  readonly powerUps: PowerUps;
}

/** What the HUD needs to know about the record; PlayScene.hudRecord() builds it. */
export interface HudRecord {
  /** The session's best score (HighScoreStore.best). */
  readonly best: number;
  /** The record when this game started; beating it makes newRecord. */
  readonly atStart: number;
}

/** A section's rectangle in logical px (half-open: x...x+width, y...y+height). */
export interface HudZone {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const SCORE_DIGITS = 6;
export const SCORE_LABEL = 'SCORE';
export const LEVEL_LABEL = 'LEVEL';
export const HI_LABEL = 'HI';

/**
 * The HUD occupies y = 0...HUD_HEIGHT-1, above the formation (FORMATION_TOP = 32). The opaque
 * panel plate covers the whole strip.
 */
export const HUD_HEIGHT = 24;
/** Left/right screen margin: one 8 px cell. */
export const HUD_MARGIN_X = 8;
/** Top of the label row (glyphs y = 3...9), under the plate's top edge (y = 0). */
export const HUD_LABEL_Y = 3;
/**
 * Top of the value row (glyphs y = 12...18, icons and gauge zone y = 12...19); the
 * instrument windows around it are y = 11...20, above the bottom bevel (y = 22...23).
 */
export const HUD_VALUE_Y = 12;

/** Size limit of a value-row icon (both sides); zones are sized by it, not by the art. */
export const HUD_ICON_SIZE = 8;
/** Horizontal step between value-row icons and shield segments: <= 8 px plus a 2 px gap. */
export const HUD_ICON_STEP = 10;

/** One shield gauge segment, a plain rectangle. */
export const SHIELD_SEGMENT_WIDTH = 8;
export const SHIELD_SEGMENT_HEIGHT = 4;
/** Segment top: centered in the value row's icon height (12 + (8 - 4) / 2 = 14, rows 14...17). */
export const SHIELD_SEGMENT_Y = HUD_VALUE_Y + (HUD_ICON_SIZE - SHIELD_SEGMENT_HEIGHT) / 2;

/** Label row + value row: 12 + 7 - 3 = 16. */
const TEXT_ZONE_HEIGHT = HUD_VALUE_Y + GLYPH_HEIGHT - HUD_LABEL_Y;

/** x = 8...55: the label or SCORE_DIGITS digits, whichever is wider (48). */
export const SCORE_ZONE: HudZone = {
  x: HUD_MARGIN_X,
  y: HUD_LABEL_Y,
  width: Math.max(textWidth(SCORE_LABEL), SCORE_DIGITS * CHAR_ADVANCE),
  height: TEXT_ZONE_HEIGHT,
};

/** x = 64...111: right of SCORE with an 8 px gap; label or SCORE_DIGITS digits, like SCORE. */
export const HI_ZONE: HudZone = {
  x: 64,
  y: HUD_LABEL_Y,
  width: Math.max(textWidth(HI_LABEL), SCORE_DIGITS * CHAR_ADVANCE),
  height: TEXT_ZONE_HEIGHT,
};

const LEVEL_ZONE_WIDTH = textWidth(LEVEL_LABEL); // 40: the number is centered under the label

/** x = 120...159: right of HI with an 8 px gap (12 px right of the screen center, В1). */
export const LEVEL_ZONE: HudZone = {
  x: 120,
  y: HUD_LABEL_Y,
  width: LEVEL_ZONE_WIDTH,
  height: TEXT_ZONE_HEIGHT,
};

const SHIELD_ZONE_WIDTH = (MAX_SHIELD - 1) * HUD_ICON_STEP + SHIELD_SEGMENT_WIDTH; // 48

/** x = 200...247, y = 12...19: value row only; MAX_SHIELD segments left to right. */
export const SHIELD_ZONE: HudZone = {
  x: SCREEN_WIDTH - HUD_MARGIN_X - SHIELD_ZONE_WIDTH,
  y: HUD_VALUE_Y,
  width: SHIELD_ZONE_WIDTH,
  height: HUD_ICON_SIZE,
};

/** x of shield segment i (0-based, left to right): 200, 210, ..., 240. Filled when i < shield. */
export function shieldSegmentX(i: number): number {
  return SHIELD_ZONE.x + i * HUD_ICON_STEP;
}

/** Power-up slots left to right; every PowerUpKind has exactly one slot. */
export const POWER_UP_SLOT_KINDS: readonly PowerUpKind[] = ['fastShot', 'doubleShot'];

const POWER_UPS_ZONE_WIDTH = HUD_ICON_STEP + HUD_ICON_SIZE; // 18: two slots

/**
 * x = 168...185, y = 12...19: value row between the level (ends at 159) and the shield
 * gauge (starts at 200). No label: the label row above stays empty.
 */
export const POWER_UPS_ZONE: HudZone = {
  x: 168,
  y: HUD_VALUE_Y,
  width: POWER_UPS_ZONE_WIDTH,
  height: HUD_ICON_SIZE,
};

/** Fixed slot x per power-up: an icon never moves when the other one arrives. */
export const POWER_UP_SLOT_X: Readonly<Record<PowerUpKind, number>> = {
  fastShot: POWER_UPS_ZONE.x,
  doubleShot: POWER_UPS_ZONE.x + HUD_ICON_STEP,
};

/** All section zones, for the overlap test; a new section adds its zone here. */
export const HUD_ZONES: readonly HudZone[] = [
  SCORE_ZONE,
  HI_ZONE,
  LEVEL_ZONE,
  SHIELD_ZONE,
  POWER_UPS_ZONE,
];

/** The value row of a section zone: same x/width, y = HUD_VALUE_Y, height = HUD_ICON_SIZE. */
export function valueRow(zone: HudZone): HudZone {
  return { x: zone.x, y: HUD_VALUE_Y, width: zone.width, height: HUD_ICON_SIZE };
}

/** Panel plate = the whole HUD strip (opaque, covers stars and objects under it, В5). */
export const PANEL_ZONE: HudZone = { x: 0, y: 0, width: SCREEN_WIDTH, height: HUD_HEIGHT };

/** Light top edge of the plate: row y = 0. */
export const PANEL_EDGE_HEIGHT = 1;
/** Dark bottom bevel of the plate: rows y = 22...23. */
export const PANEL_BEVEL_HEIGHT = 2;

/** Window margin around a value row, px. */
export const HUD_WINDOW_PAD = 1;

/**
 * Dark instrument windows: valueRow(zone) grown by HUD_WINDOW_PAD, one per HUD_ZONES entry
 * (same order). y = 11...20; x: SCORE 7...56, HI 63...112, LEVEL 119...160,
 * shield 199...248, power-ups 167...186.
 */
export const HUD_WINDOWS: readonly HudZone[] = HUD_ZONES.map((zone) => {
  const row = valueRow(zone);
  return {
    x: row.x - HUD_WINDOW_PAD,
    y: row.y - HUD_WINDOW_PAD,
    width: row.width + 2 * HUD_WINDOW_PAD,
    height: row.height + 2 * HUD_WINDOW_PAD,
  };
});

/** 1 px rivets in the plate corners, in the side margins (x 0...6, 249...255), off the windows. */
export const PANEL_RIVETS: readonly { readonly x: number; readonly y: number }[] = [
  { x: 2, y: 2 },
  { x: SCREEN_WIDTH - 3, y: 2 },
  { x: 2, y: HUD_HEIGHT - PANEL_BEVEL_HEIGHT - 2 },
  { x: SCREEN_WIDTH - 3, y: HUD_HEIGHT - PANEL_BEVEL_HEIGHT - 2 },
];

/**
 * Builds the HUD snapshot from the battle and the record: level, score, record, shield and
 * power-ups. highScore takes max with the score, so the view is right before the first
 * submit too. record is required: forgetting it in PlayScene is a type error. The power-ups
 * object is the player's immutable snapshot (grantPowerUp replaces it).
 */
export function hudView(battle: Battle, record: HudRecord): HudView {
  return {
    level: battle.level,
    score: battle.score,
    highScore: Math.max(record.best, battle.score),
    newRecord: battle.score > record.atStart,
    shield: battle.player.shield,
    powerUps: battle.player.powerUps,
  };
}

/** Zero-padded to SCORE_DIGITS; longer numbers are kept whole. Expects an integer >= 0. */
export function formatScore(score: number): string {
  return String(score).padStart(SCORE_DIGITS, '0');
}

/** Plain decimal, no padding. */
export function formatLevel(level: number): string {
  return String(level);
}

/**
 * x of the level number, centered under the LEVEL label (integer: +16 for 1 digit,
 * +12 for 2). Stays inside LEVEL_ZONE up to 5 digits; 6+ digits would stick out.
 */
export function levelValueX(text: string): number {
  return LEVEL_ZONE.x + Math.floor((textWidth(LEVEL_LABEL) - textWidth(text)) / 2);
}
