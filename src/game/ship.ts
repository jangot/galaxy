import { SCREEN_WIDTH } from '../config';
import { SHIP_SPRITE } from './art';
import { SHOT_HEIGHT, SHOT_WIDTH, Shot } from './shot';

/** Ship size is derived from its sprite so the hitbox never drifts from the picture. */
export const SHIP_WIDTH = SHIP_SPRITE.width;
export const SHIP_HEIGHT = SHIP_SPRITE.height;
/** Top edge of the ship; the bottom 16 px below it are reserved for the lives HUD. */
export const SHIP_Y = 208;
/** Horizontal speed in px/s. Must be a whole number of px per tick (ADR 002): 2 px/tick. */
export const SHIP_SPEED = 120;

/** Horizontal movement direction for one tick: left, none, right. */
export type MoveDir = -1 | 0 | 1;

const MAX_X = SCREEN_WIDTH - SHIP_WIDTH;

/** Ship's start and respawn x: horizontally centered. */
export const SHIP_START_X = Math.floor((SCREEN_WIDTH - SHIP_WIDTH) / 2);

/** Player ship. Position is the top-left corner in logical pixels. Moves horizontally only. */
export class Ship {
  readonly y = SHIP_Y;

  /** Defaults to SHIP_START_X (horizontally centered). */
  constructor(public x = SHIP_START_X) {}

  /** Moves at a constant speed with no inertia; a step past an edge is cut to the edge. */
  update(dt: number, move: MoveDir): void {
    const next = this.x + move * SHIP_SPEED * dt;
    this.x = Math.min(Math.max(next, 0), MAX_X);
  }

  /** Creates a shot centered on the nose, its bottom touching the top of the ship. */
  spawnShot(): Shot {
    const x = this.x + Math.floor(SHIP_WIDTH / 2) - Math.floor(SHOT_WIDTH / 2);
    return new Shot(x, this.y - SHOT_HEIGHT);
  }
}
