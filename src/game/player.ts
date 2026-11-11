import type { Input } from '../engine/input';
import type { MoveDir } from './ship';
import { SHIP_START_X, Ship } from './ship';
import type { Shot } from './shot';

/** Ship states: active -hit()-> down -DOWN_TICKS-> invulnerable -INVULNERABLE_TICKS-> active. */
export type ShipState = 'active' | 'down' | 'invulnerable';
/** Ship is gone after a hit, ticks (owner decision В5: 1 s). Must be > EXPLOSION_TICKS. */
export const DOWN_TICKS = 60;
/** Blinking, untouchable but controllable after the respawn, ticks (В5: 2 s). */
export const INVULNERABLE_TICKS = 120;

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
 * Player aggregate: the ship, its state and its single shot.
 * Shot state: Ready (no shot) --fire--> InFlight --offscreen--> Ready, InFlight --hit--> Ready.
 * Fire while a shot is in flight is ignored, not buffered.
 * Ship state: active --hit()--> down --DOWN_TICKS--> invulnerable --INVULNERABLE_TICKS--> active.
 * down: intent is ignored, no hits, no target, only the shot in flight keeps flying.
 * invulnerable: respawned at SHIP_START_X, controllable and targetable, but cannot be hit.
 * Tick rule (as in Enemy): entering a state sets stateTicks = 0; each update counts the tick,
 * applies the timer transition, then acts in the (new) state.
 */
export class Player {
  readonly ship: Ship;
  private activeShot: Shot | null = null;
  private currentState: ShipState = 'active';
  private ticksInState = 0;

  constructor(ship: Ship = new Ship()) {
    this.ship = ship;
  }

  /** The shot in flight, or null when the player is ready to fire. */
  get shot(): Shot | null {
    return this.activeShot;
  }

  get state(): ShipState {
    return this.currentState;
  }

  /** Ticks since entering the current state: 0 on the entry tick, +1 at the start of each update. */
  get stateTicks(): number {
    return this.ticksInState;
  }

  /** Collisions with the ship are checked only while active. */
  get canBeHit(): boolean {
    return this.currentState === 'active';
  }

  /** Enemies aim at the ship unless it is down. */
  get canBeTargeted(): boolean {
    return this.currentState !== 'down';
  }

  /** Drops the shot in flight (it hit something). Fire is available from the next update. */
  removeShot(): void {
    this.activeShot = null;
  }

  /**
   * active -> down; ignored in any other state (does not restart the timer,
   * so a ram during invulnerable cannot extend it). The shot in flight is kept.
   */
  hit(): void {
    if (this.currentState !== 'active') return;
    this.enter('down');
  }

  /**
   * Tick rule: count the tick, apply the timer transition, then act in the (new) state.
   * down: only the shot flies (intent ignored). active/invulnerable: move -> fly and drop
   * the shot -> fire. A shot that leaves the screen this tick frees the slot at once,
   * and a new shot launches from the ship's updated position without moving this tick.
   * On the respawn tick the ship is put at SHIP_START_X and this tick's intent already applies.
   */
  update(dt: number, intent: PlayerIntent): void {
    this.ticksInState++;
    if (this.currentState === 'down' && this.ticksInState >= DOWN_TICKS) {
      this.enter('invulnerable');
      this.ship.x = SHIP_START_X;
    } else if (this.currentState === 'invulnerable' && this.ticksInState >= INVULNERABLE_TICKS) {
      this.enter('active');
    }
    const controllable = this.currentState !== 'down';
    if (controllable) this.ship.update(dt, intent.move);
    if (this.activeShot) {
      this.activeShot.update(dt);
      if (this.activeShot.isOffscreen) this.activeShot = null;
    }
    if (controllable && intent.fire && !this.activeShot) {
      this.activeShot = this.ship.spawnShot();
    }
  }

  private enter(state: ShipState): void {
    this.currentState = state;
    this.ticksInState = 0;
  }
}
