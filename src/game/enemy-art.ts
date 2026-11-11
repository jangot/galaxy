import { parseSprite, type Sprite } from './sprite';

/** Drone, 11×8: green bug-like body with antennae and legs. Bottom rows of the formation. */
export const DRONE_SPRITE: Sprite = parseSprite(
  [
    '...TT.TT...',
    '....GGG....',
    '..GGGGGGG..',
    '.GGWGGGWGG.',
    'GGGGGGGGGGG',
    '.T.GGGGG.T.',
    'T..T...T..T',
    '...T...T...',
  ],
  {
    G: '#4fd16a', // body
    T: '#2a9e8f', // antennae, legs
    W: '#e8fff0', // eyes
  },
);

/** Striker, 13×9: blue arrowhead pointing down with magenta wingtips. Middle rows. */
export const STRIKER_SPRITE: Sprite = parseSprite(
  [
    'M...........M',
    'MB.........BM',
    '.BB...B...BB.',
    '..BBBBBBBBB..',
    '...BBWBWBB...',
    '....BBBBB....',
    '.....BBB.....',
    '......M......',
    '.....M.M.....',
  ],
  {
    B: '#4a8cff', // hull
    M: '#ff4fa3', // wingtips, tail
    W: '#ffffff', // eyes
  },
);

/** Raider, 13×9: silver hull with red claw-like wings. Top row, flies out in groups of 2-3. */
export const RAIDER_SPRITE: Sprite = parseSprite(
  [
    '..R.......R..',
    '.RR..CCC..RR.',
    'RRR.CCCCC.RRR',
    'RRRCCYCYCCRRR',
    '.RRCCCCCCCRR.',
    '..RRCCCCCRR..',
    '....RCCCR....',
    '.....R.R.....',
    '....R...R....',
  ],
  {
    C: '#c8d0e8', // hull
    R: '#e8383c', // wings
    Y: '#ffe14f', // eyes
  },
);

const EXPLOSION_PALETTE = {
  W: '#ffffff', // hot core
  Y: '#ffe14f', // flash
  O: '#ff8a2a', // fire
  R: '#ff3b3b', // embers
} as const;

/**
 * Enemy explosion, 2 frames: a tight flash, then scattered debris.
 * Odd widths, at most 13×10; the renderer centers a frame in the enemy's rectangle.
 */
export const EXPLOSION_FRAMES: readonly Sprite[] = [
  parseSprite(
    [
      '.....Y.....',
      '..Y..Y..Y..',
      '...Y.O.Y...',
      '....OWO....',
      'YYOOWWWOOYY',
      '....OWO....',
      '...Y.O.Y...',
      '..Y..Y..Y..',
      '.....Y.....',
    ],
    EXPLOSION_PALETTE,
  ),
  parseSprite(
    [
      'R.....O.....R',
      '..O.......O..',
      '....R...R....',
      '.O....Y....O.',
      'O...Y...Y...O',
      '.O....Y....O.',
      '....R...R....',
      '..O.......O..',
      'R.....O.....R',
    ],
    EXPLOSION_PALETTE,
  ),
];

/**
 * Enemy shot color (visual, starting value; owner approves). Not white (the player's
 * SHOT_COLOR), not the ship hull, not one of the star colors; reads well on black.
 */
export const ENEMY_SHOT_COLOR = '#ff5fd2';
