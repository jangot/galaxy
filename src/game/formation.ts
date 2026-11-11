import { SCREEN_WIDTH } from '../config';

/** Formation grid cell, decision В9. Sprites up to 13×10 fit with a gap. */
export const CELL_WIDTH = 16;
export const CELL_HEIGHT = 12;
/** Top edge of the formation; the strip above is reserved for the HUD. */
export const FORMATION_TOP = 32;
/** Visible sway amplitude, px (decision В9). Offset ∈ [-16, 16 + max(0, 1 - step)]. */
export const SWAY_RANGE = 16;

/**
 * Formation geometry: a grid of cells centered horizontally on screen,
 * swaying left and right by SWAY_RANGE as a whole.
 */
export class Formation {
  private readonly baseX: number;
  private currentOffset = 0;
  private dir: -1 | 1 = 1;

  constructor(
    readonly cols: number,
    readonly rows: number,
    private readonly swaySpeed: number,
  ) {
    this.baseX = Math.floor((SCREEN_WIDTH - cols * CELL_WIDTH) / 2);
  }

  /** Current sway offset along X, px; fractional (binary fractions, ADR 003). */
  get offset(): number {
    return this.currentOffset;
  }

  /**
   * Moves the sway one tick and turns around at the edges.
   * The right edge is pushed by 1 - step so that, after Math.floor, both visible edges
   * (+SWAY_RANGE and -SWAY_RANGE) are held for the same number of ticks.
   */
  update(dt: number): void {
    const step = this.swaySpeed * dt;
    const maxOffset = SWAY_RANGE + Math.max(0, 1 - step);
    const minOffset = -SWAY_RANGE;
    this.currentOffset += this.dir * step;
    if (this.currentOffset >= maxOffset) {
      this.currentOffset = maxOffset;
      this.dir = -1;
    } else if (this.currentOffset <= minOffset) {
      this.currentOffset = minOffset;
      this.dir = 1;
    }
  }

  /** Left edge of a sprite of the given width, centered in its column's cell, plus sway. */
  slotX(col: number, width: number): number {
    return (
      this.baseX + col * CELL_WIDTH + Math.floor((CELL_WIDTH - width) / 2) + this.currentOffset
    );
  }

  /** Top edge of a sprite of the given height, centered in its row's cell. Sway is X only. */
  slotY(row: number, height: number): number {
    return FORMATION_TOP + row * CELL_HEIGHT + Math.floor((CELL_HEIGHT - height) / 2);
  }
}
