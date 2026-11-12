import { SCREEN_WIDTH } from '../config';
import type { Battle } from './battle';
import { CHAR_ADVANCE, GLYPH_HEIGHT, textWidth } from './font';

/** Data shown by the HUD; a pure snapshot built from the battle each frame. */
export interface HudView {
  readonly level: number;
  readonly score: number;
  /** Total lives including the ship on the field. */
  readonly lives: number;
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
/** Top of the value row (glyphs y = 14...20, icons y = 14...21). */
export const HUD_VALUE_Y = 14;

/** Size limit of the lives icon (both sides); the zone is sized by it, not by the art. */
export const LIFE_ICON_MAX_SIZE = 8;
/** Horizontal step between lives icons: icon <= 8 px plus a 2 px gap. */
export const LIFE_ICON_STEP = 10;
/** How many icons the lives zone holds; drawLives draws at most this many. */
export const LIVES_ICON_SLOTS = 5;

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

const LIVES_ZONE_WIDTH = (LIVES_ICON_SLOTS - 1) * LIFE_ICON_STEP + LIFE_ICON_MAX_SIZE; // 48

/** x = 200...247, y = 14...21: value row only; icons fill it from the right edge. */
export const LIVES_ZONE: HudZone = {
  x: SCREEN_WIDTH - HUD_MARGIN_X - LIVES_ZONE_WIDTH,
  y: HUD_VALUE_Y,
  width: LIVES_ZONE_WIDTH,
  height: LIFE_ICON_MAX_SIZE,
};

/** All section zones, for the overlap test; a new section adds its zone here. */
export const HUD_ZONES: readonly HudZone[] = [SCORE_ZONE, LEVEL_ZONE, LIVES_ZONE];

/** Builds the HUD snapshot from the battle: level, score and lives. */
export function hudView(battle: Battle): HudView {
  return { level: battle.level, score: battle.score, lives: battle.player.lives };
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
