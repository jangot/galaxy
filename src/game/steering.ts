/**
 * Lateral steering of a diver in 'descend' (pure, no imports). One model for every kind;
 * kinds differ only by their SteerSpec (ENEMY_KINDS[kind].steer).
 */

/** Lateral steering profile of a diver in 'descend'. */
export interface SteerSpec {
  /** Aim is taken on descend ticks 1, 1 + N, 1 + 2N, ...; null - only on tick 1. Whole >= 1. */
  readonly retargetTicks: number | null;
  /** Ticks per 1 px/tick change of vx (inertia); 0 - vx jumps to the desired value. Whole >= 0. */
  readonly turnTicks: number;
  /** Max |vx|, whole px PER TICK (no dt) >= 1, below the ship's speed. */
  readonly maxVx: number;
}

export interface SteerState {
  /** Lateral speed, whole px PER TICK (no dt). */
  readonly vx: number;
  /** Ticks accumulated towards the next inertia step. */
  readonly turnCounter: number;
}

/** Whether the aim is taken on this descend tick. descendTick is 1-based. */
export function isRetargetTick(descendTick: number, retargetTicks: number | null): boolean {
  if (retargetTicks === null) return descendTick === 1;
  return (descendTick - 1) % retargetTicks === 0;
}

/**
 * sign(aimX - centerX) * maxVx when the gap is >= 1 px; 0 otherwise or when aimX is null
 * (no jitter over the target, also with a fractional center).
 */
export function desiredVx(centerX: number, aimX: number | null, maxVx: number): number {
  if (aimX === null) return 0;
  const gap = aimX - centerX;
  return Math.abs(gap) >= 1 ? Math.sign(gap) * maxVx : 0;
}

/**
 * One inertia step towards desired. turnTicks = 0: vx = desired at once. Otherwise vx moves by
 * 1 px/tick every turnTicks ticks; reaching desired resets the counter, a change of desired
 * mid-way does not.
 */
export function turn(state: SteerState, desired: number, turnTicks: number): SteerState {
  if (turnTicks === 0) return { vx: desired, turnCounter: 0 };
  if (state.vx === desired) return { vx: state.vx, turnCounter: 0 };
  const turnCounter = state.turnCounter + 1;
  if (turnCounter < turnTicks) return { vx: state.vx, turnCounter };
  return { vx: state.vx + Math.sign(desired - state.vx), turnCounter: 0 };
}
