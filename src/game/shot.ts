/** Shot size in logical pixels: a thin vertical bar. */
export const SHOT_WIDTH = 1;
export const SHOT_HEIGHT = 4;
/** Upward speed in px/s. Must be a whole number of px per tick (ADR 002): 4 px/tick. */
export const SHOT_SPEED = 240;

/** Player shot. Position is the top-left corner in logical pixels. Flies straight up. */
export class Shot {
  /** `x` is fixed at launch: the shot does not follow the ship. */
  constructor(
    readonly x: number,
    public y: number,
  ) {}

  update(dt: number): void {
    this.y -= SHOT_SPEED * dt;
  }

  /** True once the whole shot is above the top edge of the screen. */
  get isOffscreen(): boolean {
    return this.y + SHOT_HEIGHT <= 0;
  }
}
