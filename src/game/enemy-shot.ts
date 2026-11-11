import { SCREEN_HEIGHT } from '../config';

/** Enemy shot size in logical pixels: a thin vertical bar. */
export const ENEMY_SHOT_WIDTH = 1;
export const ENEMY_SHOT_HEIGHT = 4;
/**
 * Downward speed in px/s: 4 px/tick, a whole number (ADR 002).
 * Must exceed every level's diveSpeed, so a shot always pulls away from the enemy's nose.
 */
export const ENEMY_SHOT_SPEED = 240;

/** Enemy shot. Position is the top-left corner in logical pixels. Flies straight down. */
export class EnemyShot {
  /** `x` is fixed at launch: the shot does not follow the enemy. */
  constructor(
    readonly x: number,
    public y: number,
  ) {}

  update(dt: number): void {
    this.y += ENEMY_SHOT_SPEED * dt;
  }

  /** True once the whole shot is below the bottom edge of the screen. */
  get isOffscreen(): boolean {
    return this.y >= SCREEN_HEIGHT;
  }
}
