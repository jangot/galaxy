import { TICK_SECONDS } from '../config';
import type { Rect } from './collisions';
import { overlaps } from './collisions';
import { SHIP_HEIGHT, SHIP_SPEED, SHIP_WIDTH, SHIP_Y } from './ship';

/**
 * Test-only evasion scenario of a striker (feature 003, tasks 016-017). Import from *.test.ts only.
 * turnY - the diver's y at which the feinting ship reverses: about the middle of the window
 * "T = 8 escapes, T = 0 rams", measured with step 1 in task 017: 180 px/s 111..131,
 * 150 px/s 120..137, 120 px/s 128..141, 90 px/s 136..146. No single height fits all speeds.
 */
export const EVASION_CASES = [
  { diveSpeed: 180, turnY: 125 },
  { diveSpeed: 150, turnY: 128 },
  { diveSpeed: 120, turnY: 135 },
  { diveSpeed: 90, turnY: 141 },
] as const;

/** A striker right after the peel (side = +1, enemy.test's afterPeel): x, y, vx of descend tick 1. */
export const EVASION_START = { x: 127, y: 47, vx: 1 } as const;

/** The ship's center starts this many px right of the diver's center. */
export const EVASION_LEAD_X = 27;

/** stand - the ship does not move; feint - runs right, reverses once the diver's y >= turnY. */
export type ShipScript =
  { readonly move: 'stand' } | { readonly move: 'feint'; readonly turnY: number };

/**
 * Plays one descend against a scripted ship, from the diver's current position until its top
 * passes the ship's bottom. Each tick (as in Battle): the ship moves (SHIP_SPEED), then
 * step(shipCenter) advances the diver by one tick, then the ship and the diver are checked
 * with overlaps(). 'ram' on the first overlap, 'miss' otherwise.
 */
export function runEvasion(
  diver: Rect,
  step: (targetX: number) => void,
  script: ShipScript,
): 'ram' | 'miss' {
  const speed = SHIP_SPEED * TICK_SECONDS;
  const half = Math.floor(SHIP_WIDTH / 2);
  let center = diver.x + Math.floor(diver.width / 2) + EVASION_LEAD_X;
  let dir = 1;
  for (let tick = 0; diver.y < SHIP_Y + SHIP_HEIGHT; tick++) {
    if (tick >= 1000) throw new Error('the diver does not reach the ship');
    if (script.move === 'feint') {
      if (diver.y >= script.turnY) dir = -1;
      center += speed * dir;
    }
    step(center);
    const ship = { x: center - half, y: SHIP_Y, width: SHIP_WIDTH, height: SHIP_HEIGHT };
    if (overlaps(ship, diver)) return 'ram';
  }
  return 'miss';
}
