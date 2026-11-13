import type { Input } from '../engine/input';
import type { PowerUpKind, PowerUps } from './bonus';
import { NO_POWER_UPS } from './bonus';
import type { MoveDir } from './ship';
import { Ship } from './ship';
import type { Shot } from './shot';
import { FAST_SHOT_SPEED, SHOT_SPEED } from './shot';

/**
 * Ship states: active -hit(), shield > 0-> invulnerable -INVULNERABLE_TICKS-> active;
 * active -hit(), shield = 0-> down, terminal (isLost): the battle ends the game.
 */
export type ShipState = 'active' | 'down' | 'invulnerable';
/** Blinking, untouchable but controllable after a shield hit, ticks (feature 008, В4: 2 s). */
export const INVULNERABLE_TICKS = 120;
/** Shield level at the start: survives 2 hits, the 3rd one ends the game (feature 008, В1). */
export const START_SHIELD = 2;
/** Cap for addShield (В1); also the number of HUD shield gauge segments. */
export const MAX_SHIELD = 5;

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
 * Player aggregate: the ship, its state, its shots and power-ups.
 * Shots: a list of 0..maxShots shots in flight, oldest first. Fire launches a shot when fewer
 * than maxShots are in flight; otherwise it is ignored, not buffered. A shot leaves the list
 * when it goes offscreen or hits something (removeShot).
 * Power-ups (grantPowerUp) stay until the game ends: hit() keeps them.
 * Shield: an integer 0..MAX_SHIELD. Ship state: active --hit(), shield > 0--> invulnerable
 * [shield - 1] --INVULNERABLE_TICKS--> active; active --hit(), shield = 0--> down, terminal.
 * down (isLost): intent is ignored, no hits, no target, only the shots in flight keep flying;
 * the battle ends the game.
 * invulnerable: stays where it was hit, controllable and targetable, but cannot be hit.
 * Tick rule (as in Enemy): entering a state sets stateTicks = 0; each update counts the tick,
 * applies the timer transition, then acts in the (new) state.
 */
export class Player {
  readonly ship: Ship;
  private activeShots: readonly Shot[] = [];
  private currentPowerUps: PowerUps = NO_POWER_UPS;
  private currentState: ShipState = 'active';
  private ticksInState = 0;
  private shieldLevel: number;

  /** shield: an integer in 0..MAX_SHIELD, throws RangeError otherwise. */
  constructor(ship: Ship = new Ship(), shield: number = START_SHIELD) {
    if (!Number.isInteger(shield) || shield < 0 || shield > MAX_SHIELD) {
      throw new RangeError(`shield must be an integer in 0..${MAX_SHIELD}, got ${shield}`);
    }
    this.ship = ship;
    this.shieldLevel = shield;
  }

  /**
   * Shots in flight, oldest first; length <= maxShots. The array is never mutated: every
   * change (fire, offscreen, removeShot) replaces it, so a loop over a previously read
   * `shots` stays valid while shots are removed inside it.
   */
  get shots(): readonly Shot[] {
    return this.activeShots;
  }

  /** How many shots may be in flight at once: 1, or 2 with doubleShot. */
  get maxShots(): number {
    return this.currentPowerUps.doubleShot ? 2 : 1;
  }

  /** Enabled power-ups; a new object on every change, never mutated. */
  get powerUps(): PowerUps {
    return this.currentPowerUps;
  }

  get state(): ShipState {
    return this.currentState;
  }

  /** Ticks since entering the current state: 0 on the entry tick, +1 at the start of each update. */
  get stateTicks(): number {
    return this.ticksInState;
  }

  /** Shield level 0..MAX_SHIELD; drops on the hit tick. Hits survivable = shield. */
  get shield(): number {
    return this.shieldLevel;
  }

  /** The only ship is down: terminal, stateTicks keeps growing. */
  get isLost(): boolean {
    return this.currentState === 'down';
  }

  /** Collisions with the ship are checked only while active. */
  get canBeHit(): boolean {
    return this.currentState === 'active';
  }

  /** Enemies aim at the ship unless it is down. */
  get canBeTargeted(): boolean {
    return this.currentState !== 'down';
  }

  /**
   * Turns a power-up on in any ship state (down included); it stays until the game ends.
   * Returns true if it was off, false if it was already on (no-op).
   */
  grantPowerUp(kind: PowerUpKind): boolean {
    if (this.currentPowerUps[kind]) return false;
    this.currentPowerUps = { ...this.currentPowerUps, [kind]: true };
    return true;
  }

  /**
   * Drops this shot (it hit something); unknown shots are ignored. Replaces the array.
   * The freed slot is used from the next update (collisions run after Player.update).
   */
  removeShot(shot: Shot): void {
    this.activeShots = this.activeShots.filter((s) => s !== shot);
  }

  /**
   * From active only: shield > 0 -> shield - 1 and invulnerable, in place (the ship is not
   * moved); shield = 0 -> down. Ignored in any other state (no loss, does not restart the
   * timer, so a ram during invulnerable cannot extend it). The shots in flight and the
   * power-ups are kept.
   */
  hit(): void {
    if (this.currentState !== 'active') return;
    if (this.shieldLevel > 0) {
      this.shieldLevel--;
      this.enter('invulnerable');
    } else {
      this.enter('down');
    }
  }

  /**
   * shield + 1 below MAX_SHIELD and not down; returns true if the shield grew (false at the
   * cap or down: a threshold or capsule there is lost). Does not touch the state or
   * stateTicks (blinking goes on). Only Battle calls it (from addScore and applyBonus).
   */
  addShield(): boolean {
    if (this.currentState === 'down' || this.shieldLevel >= MAX_SHIELD) return false;
    this.shieldLevel++;
    return true;
  }

  /**
   * Tick rule: count the tick, apply the timer transition, then act in the (new) state.
   * down: only the shots fly (intent ignored). active/invulnerable: move -> fly and drop
   * offscreen shots -> fire (speed by fastShot, limit maxShots). A slot freed by a shot
   * leaving the screen this tick is free at once, and a new shot launches from the ship's
   * updated position without moving this tick.
   */
  update(dt: number, intent: PlayerIntent): void {
    this.ticksInState++;
    if (this.currentState === 'invulnerable' && this.ticksInState >= INVULNERABLE_TICKS) {
      this.enter('active');
    }
    const controllable = this.currentState !== 'down';
    if (controllable) this.ship.update(dt, intent.move);
    for (const shot of this.activeShots) shot.update(dt);
    if (this.activeShots.some((s) => s.isOffscreen)) {
      this.activeShots = this.activeShots.filter((s) => !s.isOffscreen);
    }
    if (controllable && intent.fire && this.activeShots.length < this.maxShots) {
      const speed = this.currentPowerUps.fastShot ? FAST_SHOT_SPEED : SHOT_SPEED;
      this.activeShots = [...this.activeShots, this.ship.spawnShot(speed)];
    }
  }

  private enter(state: ShipState): void {
    this.currentState = state;
    this.ticksInState = 0;
  }
}
