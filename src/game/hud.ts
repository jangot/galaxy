import { SCREEN_WIDTH } from '../config';
import type { Battle } from './battle';
import type { PowerUpKind, PowerUps } from './bonus';
import { CHAR_ADVANCE, GLYPH_HEIGHT, textWidth } from './font';
import { MAX_SHIELD } from './player';

/** Data shown by the HUD; a pure snapshot built from the battle each frame. */
export interface HudView {
  readonly level: number;
  readonly score: number;
  /** Shield level 0..MAX_SHIELD, drawn as the shield gauge. */
  readonly shield: number;
  /** Enabled power-ups; each one lights its own fixed slot until the game ends. */
  readonly powerUps: PowerUps;
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

/** The HUD occupies y = 0...HUD_HEIGHT-1, above the formation (FORMATION_TOP = 32). */
export const HUD_HEIGHT = 24;
/** Left/right screen margin: one 8 px cell. */
export const HUD_MARGIN_X = 8;
/** Top of the label row (glyphs y = 4...10). */
export const HUD_LABEL_Y = 4;
/** Top of the value row (glyphs y = 14...20, icons and gauge zone y = 14...21). */
export const HUD_VALUE_Y = 14;

/** Size limit of a value-row icon (both sides); zones are sized by it, not by the art. */
export const HUD_ICON_SIZE = 8;
/** Horizontal step between value-row icons and shield segments: <= 8 px plus a 2 px gap. */
export const HUD_ICON_STEP = 10;

/** One shield gauge segment, a plain rectangle. */
export const SHIELD_SEGMENT_WIDTH = 8;
export const SHIELD_SEGMENT_HEIGHT = 4;
/** Segment top: centered in the value row's icon height (14 + (8 - 4) / 2 = 16, rows 16...19). */
export const SHIELD_SEGMENT_Y = HUD_VALUE_Y + (HUD_ICON_SIZE - SHIELD_SEGMENT_HEIGHT) / 2;

/** Label row + value row: 14 + 7 - 4 = 17. */
const TEXT_ZONE_HEIGHT = HUD_VALUE_Y + GLYPH_HEIGHT - HUD_LABEL_Y;

/** x = 8...55: the label or SCORE_DIGITS digits, whichever is wider (48). */
export const SCORE_ZONE: HudZone = {
  x: HUD_MARGIN_X,
  y: HUD_LABEL_Y,
  width: Math.max(textWidth(SCORE_LABEL), SCORE_DIGITS * CHAR_ADVANCE),
  height: TEXT_ZONE_HEIGHT,
};

const LEVEL_ZONE_WIDTH = textWidth(LEVEL_LABEL); // 40: the number is centered under the label

/** x = 108...147, centered on screen. */
export const LEVEL_ZONE: HudZone = {
  x: Math.floor((SCREEN_WIDTH - LEVEL_ZONE_WIDTH) / 2),
  y: HUD_LABEL_Y,
  width: LEVEL_ZONE_WIDTH,
  height: TEXT_ZONE_HEIGHT,
};

const SHIELD_ZONE_WIDTH = (MAX_SHIELD - 1) * HUD_ICON_STEP + SHIELD_SEGMENT_WIDTH; // 48

/** x = 200...247, y = 14...21: value row only; MAX_SHIELD segments left to right. */
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
 * x = 156...173, y = 14...21: value row between the level (ends at 147) and the shield
 * gauge (starts at 200). No label: the label row above stays empty.
 */
export const POWER_UPS_ZONE: HudZone = {
  x: 156,
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
export const HUD_ZONES: readonly HudZone[] = [SCORE_ZONE, LEVEL_ZONE, SHIELD_ZONE, POWER_UPS_ZONE];

/**
 * Builds the HUD snapshot from the battle: level, score, shield and power-ups. The
 * power-ups object is the player's immutable snapshot (grantPowerUp replaces it).
 */
export function hudView(battle: Battle): HudView {
  return {
    level: battle.level,
    score: battle.score,
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
