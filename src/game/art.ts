import { parseSprite, type Sprite } from './sprite';

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
  {
    Y: '#ffd36b', // hull
    P: '#b884ff', // wings
    R: '#ff5a3c', // cockpit, engine glow
  },
);

/** Player shot color. The shot is a plain rectangle, not a sprite. */
export const SHOT_COLOR = '#ffffff';
