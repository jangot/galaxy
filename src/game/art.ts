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
