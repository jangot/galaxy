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

/** Lives icon for the HUD: a small ship silhouette, 7×8 (must stay within 8×8, see hud.ts). */
export const LIFE_ICON_SPRITE: Sprite = parseSprite(
  ['...Y...', '...Y...', '..YYY..', '..YRY..', 'P.YYY.P', 'PYYYYYP', 'PPYYYPP', 'P.R.R.P'],
  SHIP_PALETTE,
);

/** Player shot color. The shot is a plain rectangle, not a sprite. */
export const SHOT_COLOR = '#ffffff';

/** HUD label row color (SCORE, LEVEL). */
export const HUD_LABEL_COLOR = '#ff5a3c';
/** HUD value row color (digits). */
export const HUD_VALUE_COLOR = '#ffffff';
