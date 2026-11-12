import type { Input } from '../engine/input';
import type { PowerUpKind, PowerUps } from './bonus';
import { NO_POWER_UPS } from './bonus';
import type { MoveDir } from './ship';
import { SHIP_START_X, Ship } from './ship';
import type { Shot } from './shot';
import { FAST_SHOT_SPEED, SHOT_SPEED } from './shot';

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
 * Player aggregate: the ship, its state, its shots and power-ups.
 * Shots: a list of 0..maxShots shots in flight, oldest first. Fire launches a shot when fewer
 * than maxShots are in flight; otherwise it is ignored, not buffered. A shot leaves the list
 * when it goes offscreen or hits something (removeShot).
 * Power-ups (grantPowerUp) stay until the game ends: hit() keeps them.
 * Ship state: active --hit()--> down [lives - 1] --DOWN_TICKS, lives > 0--> invulnerable
 * --INVULNERABLE_TICKS--> active.
 * down with 0 lives (isLost): stays down until addLife() brings a life back; otherwise for
 * good, the battle ends the game.
 * down: intent is ignored, no hits, no target, only the shots in flight keep flying.
 * invulnerable: respawned at SHIP_START_X, controllable and targetable, but cannot be hit.
 * Tick rule (as in Enemy): entering a state sets stateTicks = 0; each update counts the tick,
 * applies the timer transition, then acts in the (new) state.
 */
export class Player {
  readonly ship: Ship;
  private activeShots: readonly Shot[] = [];
  private currentPowerUps: PowerUps = NO_POWER_UPS;
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
   * active -> down and lives - 1; ignored in any other state (no loss, does not restart the
   * timer, so a ram during invulnerable cannot extend it). The shots in flight and the
   * power-ups are kept.
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
   * down: only the shots fly (intent ignored). active/invulnerable: move -> fly and drop
   * offscreen shots -> fire (speed by fastShot, limit maxShots). A slot freed by a shot
   * leaving the screen this tick is free at once, and a new shot launches from the ship's
   * updated position without moving this tick.
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
