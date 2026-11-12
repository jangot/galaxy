import { SCREEN_HEIGHT } from '../config';
import type { BonusKind } from './bonus';

/** Hitbox side, px. Equals the sprite size (CAPSULE_SPRITES, checked in bonus-art.test.ts). */
export const CAPSULE_SIZE = 8;
/** Downward speed, px/s: 1 px/tick (ADR 002). */
export const CAPSULE_SPEED = 60;

/**
 * A bonus dropped by a broken asteroid (В4): falls straight down, carries its kind.
 * No states: it is on the field while BonusField holds it (caught or offscreen - dropped).
 * Shots pass through it; only the ship catches it. Does not move on the tick it drops.
 */
export class Capsule {
  readonly width = CAPSULE_SIZE;
  readonly height = CAPSULE_SIZE;

  /** x is fixed (falls straight down); integer x/y from the floored asteroid position. */
  constructor(
    readonly kind: BonusKind,
    readonly x: number,
    public y: number,
  ) {}

  update(dt: number): void {
    this.y += CAPSULE_SPEED * dt;
  }

  /** True once the whole capsule is below the bottom edge of the screen. */
  get isOffscreen(): boolean {
    return this.y >= SCREEN_HEIGHT;
  }
}
