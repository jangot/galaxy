import { parseSprite, type Sprite } from './sprite';

const SHIP_PALETTE = {
  Y: '#ffd36b', // hull
  P: '#b884ff', // wings
  R: '#ff5a3c', // cockpit, engine glow
} as const;

/** Player ship, 15×16. Nose is the center column (col 7). */
export const SHIP_SPRITE: Sprite = parseSprite(
  [
    '.......Y.......',
    '.......Y.......',
    '......YYY......',
    '......YRY......',
    '.....YYRYY.....',
    '.....YYYYY.....',
    '..P..YYYYY..P..',
    '..P.YYYYYYY.P..',
    '.PP.YYYYYYY.PP.',
    '.PPYYYYYYYYYPP.',
    'PPPYYYYYYYYYPPP',
    'PPYYYPYYYPYYYPP',
    'PP.YYP.Y.PYY.PP',
    'P...RR.Y.RR...P',
    '.....R.R.R.....',
    '.......R.......',
  ],
  SHIP_PALETTE,
);

/** Player shot color. The shot is a plain rectangle, not a sprite. */
export const SHOT_COLOR = '#ffffff';

/**
 * Shield arc color per level (index = player.shield); index 0 is null (no shield).
 * 6 literals = MAX_SHIELD + 1 (art.ts must not import player.ts; art.test.ts checks the length).
 */
export const SHIELD_COLORS: readonly (string | null)[] = [
  null,
  '#ff3b3b', // 1 red (explosion embers)
  '#ffe14f', // 2 yellow (explosion flash), START_SHIELD
  '#c8e84a', // 3 yellow-green
  '#8ee05a', // 4 light green
  '#4fd16a', // 5 green (drone body), MAX_SHIELD
];

/** Shield arc shape, 15×4 = ship width; drawn above the ship, one color per level. */
// prettier-ignore
const SHIELD_ARC_ROWS = [
  '....#######....',
  '..##.......##..',
  '.#...........#.',
  '#.............#',
];

/** The arc in SHIELD_COLORS[level]; index 0 is null. Same length as SHIELD_COLORS. */
export const SHIELD_SPRITES: readonly (Sprite | null)[] = SHIELD_COLORS.map((color) =>
  color === null ? null : parseSprite(SHIELD_ARC_ROWS, { '#': color }),
);

/** Arc top relative to ship.y: rows 203..206, one empty row (207) above the nose at 208. */
export const SHIELD_OFFSET_Y = -5;

/** HUD shield gauge: color of an empty segment (first pass, approved at acceptance). */
export const SHIELD_GAUGE_EMPTY_COLOR = '#3c3c3c';

/** HUD label row color (SCORE, LEVEL). */
export const HUD_LABEL_COLOR = '#ff5a3c';
/** HUD value row color (digits). */
export const HUD_VALUE_COLOR = '#ffffff';
/**
 * HUD HI value while this game beats the record (feature 009 В4). First pass: the same
 * NES yellow as shield level 2; approved at acceptance.
 */
export const HUD_RECORD_COLOR = '#ffe14f';

/**
 * Ship panel colors (feature 009 В5), first pass, approved at acceptance. Pairwise distinct,
 * distinct from the window, the empty gauge segment and the HUD text colors (art.test.ts).
 */
/** Plate: cool steel grey-blue; the red labels sit on it. */
export const PANEL_PLATE_COLOR = '#545470';
/** Light top edge, y = 0. */
export const PANEL_EDGE_COLOR = '#a8a8c8';
/** Dark bottom bevel, y = 22...23. */
export const PANEL_BEVEL_COLOR = '#24243a';
/** Corner rivets, 1 px. */
export const PANEL_RIVET_COLOR = '#d0d0e0';

/** Instrument windows behind the values. Not a PANEL_* color: tests compare those with it. */
export const HUD_WINDOW_COLOR = '#000';
