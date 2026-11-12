/** Shot size in logical pixels: a thin vertical bar. */
export const SHOT_WIDTH = 1;
export const SHOT_HEIGHT = 4;
/** Upward speed in px/s. Must be a whole number of px per tick (ADR 002): 4 px/tick. */
export const SHOT_SPEED = 240;
/**
 * fastShot power-up speed in px/s (owner decision В7): 6 px/tick (ADR 002).
 * shot.test.ts checks it cannot tunnel through an enemy.
 */
export const FAST_SHOT_SPEED = 360;

/** Player shot. Position is the top-left corner in logical pixels. Flies straight up. */
export class Shot {
  /** `x` is fixed at launch: the shot does not follow the ship. `speed` is fixed at launch too. */
  constructor(
    readonly x: number,
    public y: number,
    readonly speed: number = SHOT_SPEED,
  ) {}

  update(dt: number): void {
    this.y -= this.speed * dt;
  }

  /** True once the whole shot is above the top edge of the screen. */
  get isOffscreen(): boolean {
    return this.y + SHOT_HEIGHT <= 0;
  }
}
