import type { BonusKind } from './bonus';
import { parseSprite, type Sprite } from './sprite';

/**
 * Asteroid, 12×12: a lumpy grey-brown rock, lit from the top left, craters at the bottom right.
 * Its size is the asteroid hitbox (ASTEROID_SIZE), see bonus-art.test.ts.
 */
export const ASTEROID_SPRITE: Sprite = parseSprite(
  [
    '....LLLR....',
    '..LLRRRRRR..',
    '.LRRRRDDRRR.',
    '.LRRRDDDRRD.',
    'LRRRRRDRRRRD',
    'LRDDRRRRRRRD',
    'RRDDDRRRRRDD',
    'RRRDRRRRDDRD',
    '.RRRRRRRDDD.',
    '.DRRRRRRRRD.',
    '..DDRRRRDD..',
    '....DDDD....',
  ],
  {
    L: '#c9b59a', // lit edge
    R: '#8a7560', // rock
    D: '#5a4a3c', // shade, craters
  },
);

const CAPSULE_LETTER_COLOR = '#fff2c0'; // warm white, not the shot white

/** Plate, 8×8: frame B, fill F, letter L (4×5) in rows 1...5. */
function capsuleSprite(letterRows: readonly string[], fill: string, frame: string): Sprite {
  return parseSprite(['.BBBBBB.', ...letterRows, 'BFFFFFFB', '.BBBBBB.'], {
    B: frame,
    F: fill,
    L: CAPSULE_LETTER_COLOR,
  });
}

/**
 * Capsules, 8×8: a framed colored plate with the bonus letter (L - shield level, S - fast shot,
 * D - double shot). Their size is the capsule hitbox (CAPSULE_SIZE) and the HUD icon size
 * (task 028), see bonus-art.test.ts. Colors are a first pass, the owner approves them.
 */
export const CAPSULE_SPRITES: Readonly<Record<BonusKind, Sprite>> = {
  shield: capsuleSprite(
    ['BFLFFFFB', 'BFLFFFFB', 'BFLFFFFB', 'BFLFFFFB', 'BFLLLLFB'],
    '#d8433a', // red plate
    '#7a1a14',
  ),
  fastShot: capsuleSprite(
    ['BFFLLLFB', 'BFLFFFFB', 'BFFLLFFB', 'BFFFFLFB', 'BFLLLFFB'],
    '#3a72d8', // blue plate
    '#142f7a',
  ),
  doubleShot: capsuleSprite(
    ['BFLLLFFB', 'BFLFFLFB', 'BFLFFLFB', 'BFLFFLFB', 'BFLLLFFB'],
    '#3aa84a', // green plate
    '#145a1e',
  ),
};
