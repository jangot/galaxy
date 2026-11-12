import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../config';
import type { BonusKind } from './bonus';
import { EXPLOSION_TICKS } from './enemy';

export type AsteroidState = 'flying' | 'exploding' | 'gone';

/** Hitbox side, px. Equals the sprite size (ASTEROID_SPRITE, checked in bonus-art.test.ts). */
export const ASTEROID_SIZE = 12;
/** Downward speed, px/s: 1 px/tick (ADR 002). */
export const ASTEROID_FALL_SPEED = 60;
/** Sideways speed, px/s: 1/2 px/tick (ADR 003, exact binary fraction). */
export const ASTEROID_DRIFT_SPEED = 30;
/** Sideways travel over the whole fall, px: (SCREEN_HEIGHT + size) * drift / fall = 126. */
export const ASTEROID_DRIFT_TOTAL =
  ((SCREEN_HEIGHT + ASTEROID_SIZE) * ASTEROID_DRIFT_SPEED) / ASTEROID_FALL_SPEED;
/** Largest start offset from the side it starts at, px: keeps the whole fall on screen (118). */
export const ASTEROID_SPAWN_OFFSET_MAX = SCREEN_WIDTH - ASTEROID_SIZE - ASTEROID_DRIFT_TOTAL;

/**
 * A bonus target: falls diagonally from above a top corner, breaks on one hit (В3).
 * flying --hit()--> exploding --EXPLOSION_TICKS--> gone; flying --y >= SCREEN_HEIGHT--> gone.
 * Does not move on the tick it is created (the field creates it after moving its objects).
 */
export class Asteroid {
  readonly width = ASTEROID_SIZE;
  readonly height = ASTEROID_SIZE;
  x: number;
  y: number;
  private currentState: AsteroidState = 'flying';
  private ticksInState = 0;

  /**
   * dir: sideways drift (1 - right, starts at the left side);
   * offset in [0, ASTEROID_SPAWN_OFFSET_MAX] from that side.
   */
  constructor(
    readonly dir: -1 | 1,
    offset: number,
    readonly bonus: BonusKind,
  ) {
    this.x = dir === 1 ? offset : SCREEN_WIDTH - this.width - offset;
    this.y = -this.height;
  }

  get state(): AsteroidState {
    return this.currentState;
  }

  /** Ticks since entering the current state: 0 on the entry tick, +1 at the start of each update. */
  get stateTicks(): number {
    return this.ticksInState;
  }

  /** Tick rule as Enemy: count the tick, apply the timer, then act. gone: nothing. */
  update(dt: number): void {
    if (this.currentState === 'gone') return;
    this.ticksInState++;
    if (this.currentState === 'exploding') {
      if (this.ticksInState >= EXPLOSION_TICKS) this.enter('gone');
      return;
    }
    this.x += this.dir * ASTEROID_DRIFT_SPEED * dt;
    this.y += ASTEROID_FALL_SPEED * dt;
    if (this.y >= SCREEN_HEIGHT) this.enter('gone');
  }

  /** Only while flying: -> exploding in place, true; otherwise false, no effect. */
  hit(): boolean {
    if (this.currentState !== 'flying') return false;
    this.enter('exploding');
    return true;
  }

  private enter(state: AsteroidState): void {
    this.currentState = state;
    this.ticksInState = 0;
  }
}
