import type { BonusKind, PowerUpKind } from './bonus';
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

/** Letter rows 1...5 of the capsule plates (4×5 letter L on fill F, frame B). */
const FAST_SHOT_LETTER = ['BFFLLLFB', 'BFLFFFFB', 'BFFLLFFB', 'BFFFFLFB', 'BFLLLFFB'];
const DOUBLE_SHOT_LETTER = ['BFLLLFFB', 'BFLFFLFB', 'BFLFFLFB', 'BFLFFLFB', 'BFLLLFFB'];

/** Plate, 8×8: frame B, fill F, letter L (4×5) in rows 1...5. */
function capsuleSprite(
  letterRows: readonly string[],
  fill: string,
  frame: string,
  letter: string = CAPSULE_LETTER_COLOR,
): Sprite {
  return parseSprite(['.BBBBBB.', ...letterRows, 'BFFFFFFB', '.BBBBBB.'], {
    B: frame,
    F: fill,
    L: letter,
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
    FAST_SHOT_LETTER,
    '#3a72d8', // blue plate
    '#142f7a',
  ),
  doubleShot: capsuleSprite(
    DOUBLE_SHOT_LETTER,
    '#3aa84a', // green plate
    '#145a1e',
  ),
};

/**
 * Unlit HUD lamps (feature 009 В7): the same capsule and letter in a dark palette, shown in a
 * power-up slot until the power-up is taken. No window black and no color of the lit sprite
 * (bonus-art.test.ts). First pass, approved at acceptance.
 */
export const CAPSULE_OFF_SPRITES: Readonly<Record<PowerUpKind, Sprite>> = {
  fastShot: capsuleSprite(FAST_SHOT_LETTER, '#1c2a54', '#0e1838', '#56689c'), // dim blue
  doubleShot: capsuleSprite(DOUBLE_SHOT_LETTER, '#1c3a22', '#0e2412', '#56845e'), // dim green
};
