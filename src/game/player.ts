import type { Input } from '../engine/input';
import type { MoveDir } from './ship';
import { Ship } from './ship';
import type { Shot } from './shot';

/** What the player wants to do this tick, decoupled from the keyboard. */
export interface PlayerIntent {
  move: MoveDir;
  /** True only on the tick the fire key went down. */
  fire: boolean;
}

/** Samples the input for one tick. Both directions held cancel out. */
export function readIntent(input: Input): PlayerIntent {
  const move = ((input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0)) as MoveDir;
  return { move, fire: input.pressed('fire') };
}

/**
 * Player aggregate: the ship and its single shot.
 * Shot state: Ready (no shot) --fire--> InFlight --offscreen--> Ready.
 * Fire while a shot is in flight is ignored, not buffered.
 */
export class Player {
  readonly ship: Ship;
  private activeShot: Shot | null = null;

  constructor(ship: Ship = new Ship()) {
    this.ship = ship;
  }

  /** The shot in flight, or null when the player is ready to fire. */
  get shot(): Shot | null {
    return this.activeShot;
  }

  /**
   * Tick order matters: move -> fly and drop the shot -> fire.
   * A shot that leaves the screen this tick frees the slot at once,
   * and a new shot launches from the ship's updated position without moving this tick.
   */
  update(dt: number, intent: PlayerIntent): void {
    this.ship.update(dt, intent.move);
    if (this.activeShot) {
      this.activeShot.update(dt);
      if (this.activeShot.isOffscreen) this.activeShot = null;
    }
    if (intent.fire && !this.activeShot) {
      this.activeShot = this.ship.spawnShot();
    }
  }
}
