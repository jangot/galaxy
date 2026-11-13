import { parseStartLevel } from './levels';
import { MAX_SHIELD } from './player';

/** Dev-only URL parameters (see second-brain/architecture/dev-hooks.md). */
export interface DevParams {
  /** ?seed=N: integer 0..2^32-1; null = Date.now(). */
  readonly seed: number | null;
  /** ?paused=1: the loop starts paused, ticks only via __galaxy.step(). */
  readonly paused: boolean;
  /** ?level=N, parseStartLevel; undefined in production. */
  readonly startLevel: number | undefined;
  /** ?shield=N: integer 0..MAX_SHIELD; undefined = START_SHIELD. */
  readonly shield: number | undefined;
}

/** What production uses: no parameters are read. */
export const NO_DEV_PARAMS: DevParams = {
  seed: null,
  paused: false,
  startLevel: undefined,
  shield: undefined,
};

const MAX_SEED = 2 ** 32 - 1;

/** Plain decimal integer in min..max, otherwise null. */
function parseIntIn(value: string | null, min: number, max: number): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

/** Parses location.search; invalid values fall back to the defaults. */
export function parseDevParams(search: string): DevParams {
  const q = new URLSearchParams(search);
  return {
    seed: parseIntIn(q.get('seed'), 0, MAX_SEED),
    paused: q.get('paused') === '1',
    startLevel: parseStartLevel(q.get('level')),
    shield: parseIntIn(q.get('shield'), 0, MAX_SHIELD) ?? undefined,
  };
}
