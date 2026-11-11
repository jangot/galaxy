import { describe, expect, it } from 'vitest';
import { SCREEN_WIDTH, TICK_SECONDS } from '../config';
import { STRIKER_TURN_TICKS } from './enemy';
import { STRIKER_SPRITE } from './enemy-art';
import type { SteerSpec, SteerState } from './steering';
import { desiredVx, isRetargetTick, turn } from './steering';
import type { ShipScript } from './test-evasion';
import { EVASION_CASES, EVASION_START, runEvasion } from './test-evasion';

function run(state: SteerState, desired: number, turnTicks: number, n: number): number[] {
  const vxs: number[] = [];
  for (let i = 0; i < n; i++) {
    state = turn(state, desired, turnTicks);
    vxs.push(state.vx);
  }
  return vxs;
}

describe('isRetargetTick', () => {
  it('null: only the first descend tick', () => {
    expect(isRetargetTick(1, null)).toBe(true);
    for (const d of [2, 30, 31, 100]) expect(isRetargetTick(d, null)).toBe(false);
  });

  it('1: every tick', () => {
    for (let d = 1; d <= 10; d++) expect(isRetargetTick(d, 1)).toBe(true);
  });

  it('30: ticks 1, 31, 61, ...', () => {
    for (const d of [1, 31, 61]) expect(isRetargetTick(d, 30)).toBe(true);
    for (const d of [2, 30, 32, 60]) expect(isRetargetTick(d, 30)).toBe(false);
  });
});

describe('desiredVx', () => {
  it('is 0 without a target', () => {
    expect(desiredVx(100, null, 1)).toBe(0);
  });

  it.each([
    [132.75, 133],
    [133.25, 133],
    [133, 133],
  ])('is 0 when the gap is below 1 px (center %d, aim %d)', (center, aim) => {
    expect(desiredVx(center, aim, 1)).toBe(0);
  });

  it.each([
    [100, 101, 1, 1],
    [100, 99, 1, -1],
    [132.75, 134, 1, 1],
    [100, 150, 2, 2],
    [100, 50, 2, -2],
  ])('center %d, aim %d, maxVx %d -> %d', (center, aim, maxVx, vx) => {
    expect(desiredVx(center, aim, maxVx)).toBe(vx);
  });
});

describe('turn', () => {
  it('turnTicks = 0: vx jumps to the desired value and the counter resets', () => {
    expect(turn({ vx: 1, turnCounter: 3 }, -1, 0)).toEqual({ vx: -1, turnCounter: 0 });
    expect(turn({ vx: 1, turnCounter: 3 }, 0, 0)).toEqual({ vx: 0, turnCounter: 0 });
  });

  it.each([4, 8])('a reversal with turnTicks = %d takes 2T ticks, 1 px/tick per T', (t) => {
    const vxs = run({ vx: 1, turnCounter: 0 }, -1, t, 3 * t);
    const expected = vxs.map((_, i) => {
      const tick = i + 1;
      if (tick < t) return 1;
      if (tick < 2 * t) return 0;
      return -1;
    });
    expect(vxs).toEqual(expected);
  });

  it('a change of desired mid-way does not reset the counter', () => {
    let state: SteerState = { vx: 0, turnCounter: 0 };
    state = turn(state, 1, 4);
    state = turn(state, 1, 4);
    expect(state).toEqual({ vx: 0, turnCounter: 2 });
    state = turn(state, -1, 4);
    state = turn(state, -1, 4);
    expect(state).toEqual({ vx: -1, turnCounter: 0 });
  });

  it('reaching desired resets the counter', () => {
    expect(turn({ vx: 1, turnCounter: 3 }, 1, 4)).toEqual({ vx: 1, turnCounter: 0 });
  });

  it('steps by 1 px/tick also when maxVx > 1', () => {
    expect(run({ vx: 0, turnCounter: 0 }, 2, 1, 3)).toEqual([1, 2, 2]);
  });
});

/** A diver of the mini simulation: the descend tick rules of Enemy, solo (no group offsets). */
interface SimDiver {
  x: number;
  y: number;
  readonly width: number;
  readonly height: number;
  vx: number;
  turnCounter: number;
  aimX: number | null;
  d: number;
}

function simDiver(x: number, y: number, vx: number, width = 13, height = 9): SimDiver {
  return { x, y, width, height, vx, turnCounter: 0, aimX: null, d: 0 };
}

/** One descend tick, as Enemy.descend(): re-aim, desiredVx, turn, x += vx (screen, wall), y += dy. */
function simStep(s: SimDiver, spec: SteerSpec, targetX: number | null, dy = 1): void {
  s.d++;
  const half = Math.floor(s.width / 2);
  const maxX = SCREEN_WIDTH - s.width;
  if (isRetargetTick(s.d, spec.retargetTicks)) {
    s.aimX = targetX === null ? null : Math.min(Math.max(targetX, half), maxX + half);
  }
  const desired = desiredVx(s.x + half, s.aimX, spec.maxVx);
  const next = turn({ vx: s.vx, turnCounter: s.turnCounter }, desired, spec.turnTicks);
  s.vx = next.vx;
  s.turnCounter = next.turnCounter;
  const x = s.x + s.vx;
  s.x = Math.min(Math.max(x, 0), maxX);
  if ((x < 0 && s.vx < 0) || (x > maxX && s.vx > 0)) {
    s.vx = 0;
    s.turnCounter = 0;
  }
  s.y += dy;
}

describe('steering simulation', () => {
  it('track follows the target of every tick', () => {
    const spec: SteerSpec = { retargetTicks: 1, turnTicks: 0, maxVx: 1 };
    const s = simDiver(127, 0, 1);
    let x = s.x;
    for (let i = 0; i < 5; i++) {
      simStep(s, spec, 0);
      expect(s.x).toBe(--x);
    }
    for (let i = 0; i < 3; i++) {
      simStep(s, spec, 250);
      expect(s.x).toBe(++x);
    }
    for (let i = 0; i < 4; i++) {
      simStep(s, spec, null);
      expect(s.x).toBe(x);
    }
    simStep(s, spec, 0);
    expect(s.x).toBe(x - 1);
  });

  it.each(EVASION_CASES)(
    'at $diveSpeed px/s the feint escapes only because of inertia',
    ({ diveSpeed, turnY }) => {
      const play = (turnTicks: number, script: ShipScript): 'ram' | 'miss' => {
        const s = simDiver(
          EVASION_START.x,
          EVASION_START.y,
          EVASION_START.vx,
          STRIKER_SPRITE.width,
          STRIKER_SPRITE.height,
        );
        const spec: SteerSpec = { retargetTicks: 1, turnTicks, maxVx: 1 };
        return runEvasion(s, (t) => simStep(s, spec, t, diveSpeed * TICK_SECONDS), script);
      };
      const feint: ShipScript = { move: 'feint', turnY };
      expect(play(0, { move: 'stand' })).toBe('ram');
      expect(play(0, feint)).toBe('ram');
      expect(play(STRIKER_TURN_TICKS, { move: 'stand' })).toBe('ram');
      expect(play(STRIKER_TURN_TICKS, feint)).toBe('miss');
    },
  );
});
