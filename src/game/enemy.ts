import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../config';
import { DRONE_SPRITE, EXPLOSION_FRAMES, RAIDER_SPRITE, STRIKER_SPRITE } from './enemy-art';
import type { Formation } from './formation';
import type { EnemyKind, Slot } from './levels';
import { SHIP_Y } from './ship';
import type { Sprite } from './sprite';

/** How a diver picks its X target in 'descend'. fixed: once, on the first tick; track: every tick. */
export type Aim = 'fixed' | 'track';

/** Per-kind data. */
export interface EnemyKindSpec {
  readonly sprite: Sprite;
  readonly aim: Aim;
}

export const ENEMY_KINDS: Readonly<Record<EnemyKind, EnemyKindSpec>> = {
  drone: { sprite: DRONE_SPRITE, aim: 'fixed' },
  striker: { sprite: STRIKER_SPRITE, aim: 'track' },
  raider: { sprite: RAIDER_SPRITE, aim: 'fixed' },
};

/** Visual, starting values (owner approves the look). One explosion frame lasts this many ticks. */
export const EXPLOSION_FRAME_TICKS = 8;
/** Whole explosion, ticks: 16. */
export const EXPLOSION_TICKS = EXPLOSION_FRAMES.length * EXPLOSION_FRAME_TICKS;

/** Enemy states. */
export type EnemyState = 'formation' | 'diving' | 'returning' | 'exploding' | 'dead';

/**
 * Horizontal steering speed, px/s (1 px/tick): the X step of 'descend' aiming and of 'returning'.
 * Slower than the ship (SHIP_SPEED), so a tracker can be dodged.
 */
export const STEER_SPEED = 60;
/** Downward speed of 'returning', px/s (1 px/tick). */
export const RETURN_SPEED = 60;

/** One leg of the peel-off arc. Units are whole px PER TICK (no dt); vx is for side = +1. */
export interface PeelSegment {
  readonly ticks: number;
  readonly vx: number;
  readonly vy: number;
}

/**
 * Peel-off arc, side = +1 (mirrored for -1): up-and-out, sideways, then down-and-out.
 * Visual, starting values (owner approves). Limits: whole ticks >= 1, whole vx/vy, first vy < 0,
 * last vy > 0, vx >= 0, max vy <= 3 (tunneling invariant). Exported for those tests.
 */
export const PEEL_SEGMENTS: readonly PeelSegment[] = [
  { ticks: 4, vx: 1, vy: -1 },
  { ticks: 4, vx: 1, vy: 0 },
  { ticks: 6, vx: 1, vy: 1 },
];
/** Peel length, ticks (14). */
const PEEL_TICKS = PEEL_SEGMENTS.reduce((sum, s) => sum + s.ticks, 0);

/** Ticks between two shots of one diver (owner decision В2). */
export const ENEMY_FIRE_INTERVAL_TICKS = 20;

/**
 * Who launches a dive, which way it peels off, how many shots it may fire and, for a raider
 * group, where it aims relative to the ship. A solo dive has all three offsets at 0.
 */
export interface DiveOrder {
  readonly sortieId: number;
  readonly side: -1 | 1;
  /** Shots for this dive, whole number >= 0. */
  readonly shots: number;
  /** X offset of this member's target from the group's anchor, px; 0 for solo dives. */
  readonly aimOffsetX: number;
  /** Min aimOffsetX over the sortie's members (<= 0); 0 for solo dives. */
  readonly groupMinOffsetX: number;
  /** Max aimOffsetX over the sortie's members (>= 0); 0 for solo dives. */
  readonly groupMaxOffsetX: number;
}

/** Per-tick input from the wave. The formation is not here: the enemy keeps its own. */
export interface EnemyEnv {
  /** Descend speed, px/s. */
  readonly diveSpeed: number;
  /** Center X of the ship, or null when there is nothing to aim at. */
  readonly targetX: number | null;
}

/**
 * One enemy of a wave. Position is the top-left corner in logical pixels.
 * Size comes from the kind's sprite, so the hitbox matches the picture.
 * States:
 *   formation --startDive--> diving (peel -> descend) --y >= SCREEN_HEIGHT--> returning
 *     --in slot--> formation;
 *   alive --kill--> exploding --EXPLOSION_TICKS--> dead.
 * In 'formation' the position is recomputed from the slot on every update;
 * in 'exploding' x/y stay where the enemy was hit; 'dead' is not updated at all.
 * In flight x stays fractional: it starts from the swaying slot and moves by whole px
 * (ADR 002/003).
 * In 'descend' the enemy steers on X towards its aim (see ENEMY_KINDS[kind].aim);
 * fixed: anchor + aimOffsetX, taken on tick PEEL_TICKS + 1 (see fixedAim()).
 * In 'descend' it also fires by the order's shots (see fires()); update() returns true then.
 */
export class Enemy {
  readonly kind: EnemyKind;
  readonly width: number;
  readonly height: number;
  x: number;
  y: number;
  private currentState: EnemyState = 'formation';
  private ticksInState = 0;
  private currentSortieId = 0;
  private side: -1 | 1 = 1;
  private readonly aim: Aim;
  /**
   * 'fixed' only: target taken on the first 'descend' tick (anchor + aimOffsetX);
   * null - no target for this descend.
   */
  private fixedAimX: number | null = null;
  private shotsLeft = 0;
  private aimOffsetX = 0;
  private groupMinOffsetX = 0;
  private groupMaxOffsetX = 0;

  constructor(
    readonly slot: Slot,
    private readonly formation: Formation,
  ) {
    this.kind = slot.kind;
    const { sprite, aim } = ENEMY_KINDS[slot.kind];
    this.width = sprite.width;
    this.height = sprite.height;
    this.aim = aim;
    this.x = this.slotX();
    this.y = this.slotY();
  }

  get state(): EnemyState {
    return this.currentState;
  }

  /** Ticks since entering the current state: 0 on the entry tick, +1 at the start of each update. */
  get stateTicks(): number {
    return this.ticksInState;
  }

  /** Sortie the enemy is out on; null when not out (also after being shot in flight). */
  get sortieId(): number | null {
    return this.isOut ? this.currentSortieId : null;
  }

  /** Can be hit: in the formation or in flight. */
  get isAlive(): boolean {
    return this.isOut || this.currentState === 'formation';
  }

  /** Out of the formation: counts against maxSorties. */
  get isOut(): boolean {
    return this.currentState === 'diving' || this.currentState === 'returning';
  }

  /** Any alive state -> 'exploding'; ignored otherwise. The enemy stays where it is. */
  kill(): void {
    if (!this.isAlive) return;
    this.enter('exploding');
  }

  /** Only from 'formation'; ignored otherwise. The first peel step happens on the next update. */
  startDive(order: DiveOrder): void {
    if (this.currentState !== 'formation') return;
    this.currentSortieId = order.sortieId;
    this.side = order.side;
    this.shotsLeft = order.shots;
    this.aimOffsetX = order.aimOffsetX;
    this.groupMinOffsetX = order.groupMinOffsetX;
    this.groupMaxOffsetX = order.groupMaxOffsetX;
    this.fixedAimX = null;
    this.enter('diving');
  }

  /**
   * Tick rule: count the tick, apply the timer transition, then act in the (new) state.
   * formation: follow the slot. diving: peel, then descend (may fire). returning: back into the
   * slot. exploding: stand still, become dead after EXPLOSION_TICKS. dead: nothing.
   * Returns true on a tick the enemy fires (only in 'descend'); the wave creates the shot.
   */
  update(dt: number, env: EnemyEnv): boolean {
    if (this.currentState === 'dead') return false;
    this.ticksInState++;
    switch (this.currentState) {
      case 'exploding':
        if (this.ticksInState >= EXPLOSION_TICKS) this.enter('dead');
        break;
      case 'formation':
        this.x = this.slotX();
        this.y = this.slotY();
        break;
      case 'diving':
        return this.updateDiving(dt, env);
      case 'returning':
        this.updateReturning(dt);
        break;
    }
    return false;
  }

  /**
   * Ticks 1..PEEL_TICKS: peel segment by stateTicks. Then descend at diveSpeed, steering on X
   * towards aimX (fixed: anchor + aimOffsetX, taken on tick PEEL_TICKS + 1, see fixedAim();
   * track: env.targetX of this tick), and
   * fire by the schedule (see fires()). Leaving past the bottom ends the descend without a shot.
   */
  private updateDiving(dt: number, env: EnemyEnv): boolean {
    if (this.ticksInState <= PEEL_TICKS) {
      const segment = peelSegmentAt(this.ticksInState);
      this.x += segment.vx * this.side;
      this.y += segment.vy;
    } else {
      if (this.ticksInState === PEEL_TICKS + 1) this.fixedAimX = this.fixedAim(env.targetX);
      const aimX = this.aim === 'fixed' ? this.fixedAimX : env.targetX;
      this.x += steerStep(this.x + Math.floor(this.width / 2), aimX, STEER_SPEED * dt);
      this.y += env.diveSpeed * dt;
    }
    this.x = clamp(this.x, 0, SCREEN_WIDTH - this.width);
    if (this.y >= SCREEN_HEIGHT) {
      // Gone past the bottom: reappear right above the current slot.
      this.enter('returning');
      this.x = this.slotX();
      this.y = -this.height;
      return false;
    }
    return this.ticksInState > PEEL_TICKS && this.fires();
  }

  /**
   * 'fixed' target for this descend: the ship's center X as the group's anchor, clamped so that
   * every member's target (anchor + its aimOffsetX) keeps its sprite on screen, plus this
   * member's offset. The whole group shifts together near an edge instead of squeezing.
   * A solo diver (offsets 0) is never clamped by it: the ship's center stays in [lo, hi].
   */
  private fixedAim(targetX: number | null): number | null {
    if (targetX === null) return null;
    const half = Math.floor(this.width / 2);
    const lo = half - this.groupMinOffsetX;
    const hi = SCREEN_WIDTH - this.width + half - this.groupMaxOffsetX;
    return clamp(targetX, lo, hi) + this.aimOffsetX;
  }

  /**
   * 'descend' fire schedule: ticks D, D + 20, D + 40, ... (D = PEEL_TICKS + 1, the first descend
   * tick) while shots are left and the enemy's bottom is not below the ship's top
   * (checked after this tick's move). A fired shot is spent even if the wave drops it
   * (MAX_ENEMY_SHOTS). Below SHIP_Y the enemy only goes further down, so later shots never come.
   */
  private fires(): boolean {
    if (this.shotsLeft <= 0) return false;
    if ((this.ticksInState - (PEEL_TICKS + 1)) % ENEMY_FIRE_INTERVAL_TICKS !== 0) return false;
    if (this.y + this.height > SHIP_Y) return false;
    this.shotsLeft--;
    return true;
  }

  /**
   * Moves towards the current slot by one step per axis, never below slotY
   * (otherwise an enemy that reached slotY first would sink off screen forever).
   * Within one step on both axes - snaps into the slot and rejoins the formation.
   */
  private updateReturning(dt: number): void {
    const slotX = this.slotX();
    const slotY = this.slotY();
    const stepX = STEER_SPEED * dt;
    const stepY = RETURN_SPEED * dt;
    if (Math.abs(slotX - this.x) <= stepX && slotY - this.y <= stepY) {
      this.x = slotX;
      this.y = slotY;
      this.enter('formation');
      return;
    }
    this.y = Math.min(this.y + stepY, slotY);
    this.x += clamp(slotX - this.x, -stepX, stepX);
  }

  private slotX(): number {
    return this.formation.slotX(this.slot.col, this.width);
  }

  private slotY(): number {
    return this.formation.slotY(this.slot.row, this.height);
  }

  private enter(state: EnemyState): void {
    this.currentState = state;
    this.ticksInState = 0;
  }
}

/** Segment for peel tick 1..PEEL_TICKS. */
function peelSegmentAt(tick: number): PeelSegment {
  let end = 0;
  for (const segment of PEEL_SEGMENTS) {
    end += segment.ticks;
    if (tick <= end) return segment;
  }
  throw new Error(`Peel tick ${tick} is past the arc (${PEEL_TICKS})`);
}

/**
 * X move of one 'descend' tick: a whole step towards aimX, or 0 when there is no target or it
 * is closer than one step (no jitter over the target: the gap shrinks by exactly one step).
 */
function steerStep(centerX: number, aimX: number | null, step: number): number {
  if (aimX === null) return 0;
  const gap = aimX - centerX;
  return Math.abs(gap) >= step ? Math.sign(gap) * step : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
