import type { Input } from '../engine/input';
import type { MoveDir } from './ship';
import { SHIP_START_X, Ship } from './ship';
import type { Shot } from './shot';

/**
 * Ship states: active -hit()-> down -DOWN_TICKS, lives > 0-> invulnerable -INVULNERABLE_TICKS->
 * active. down with 0 lives (isLost) stays down until addLife() brings a life back; otherwise
 * for good, the battle ends the game.
 */
export type ShipState = 'active' | 'down' | 'invulnerable';
/** Ship is gone after a hit, ticks (owner decision В5: 1 s). Must be > EXPLOSION_TICKS. */
export const DOWN_TICKS = 60;
/** Blinking, untouchable but controllable after the respawn, ticks (В5: 2 s). */
export const INVULNERABLE_TICKS = 120;
/** Total lives at the start, including the ship on the field (owner decision В4). */
export const START_LIVES = 3;
/** Cap for addLife (owner decision В4); LIVES_ICON_SLOTS >= MAX_LIVES is checked by a test. */
export const MAX_LIVES = 5;

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
 * Ship state: active --hit()--> down [lives - 1] --DOWN_TICKS, lives > 0--> invulnerable
 * --INVULNERABLE_TICKS--> active.
 * down with 0 lives (isLost): stays down until addLife() brings a life back; otherwise for
 * good, the battle ends the game.
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
  private livesLeft: number;

  /**
   * lives: total including the ship on the field; an integer in 1..MAX_LIVES,
   * throws RangeError otherwise.
   */
  constructor(ship: Ship = new Ship(), lives: number = START_LIVES) {
    if (!Number.isInteger(lives) || lives < 1 || lives > MAX_LIVES) {
      throw new RangeError(`lives must be an integer in 1..${MAX_LIVES}, got ${lives}`);
    }
    this.ship = ship;
    this.livesLeft = lives;
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

  /** Total lives including the ship on the field; drops on the hit tick. */
  get lives(): number {
    return this.livesLeft;
  }

  /** No lives left: the ship stays down (until addLife), stateTicks keeps growing. */
  get isLost(): boolean {
    return this.livesLeft === 0;
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
   * active -> down and lives - 1; ignored in any other state (no loss, does not restart the
   * timer, so a ram during invulnerable cannot extend it). The shot in flight is kept.
   */
  hit(): void {
    if (this.currentState !== 'active') return;
    this.livesLeft--;
    this.enter('down');
  }

  /**
   * lives + 1 up to MAX_LIVES (an extra life over the cap is lost), in any state; does not
   * touch the state or stateTicks. In down with 0 lives it brings the respawn back: the ship
   * returns on the usual DOWN_TICKS tick counted from the hit. Only Battle calls it (from
   * addScore, never in over).
   */
  addLife(): void {
    if (this.livesLeft < MAX_LIVES) this.livesLeft++;
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
    if (this.currentState === 'down' && this.livesLeft > 0 && this.ticksInState >= DOWN_TICKS) {
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
