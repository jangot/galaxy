import type { DiveOrder } from './enemy';
import type { LevelConfig } from './levels';

/** Passive values of the fields added by tasks 007-013: no dives in scene/battle tests. */
const PASSIVE: Omit<LevelConfig, 'layout'> = {
  swaySpeed: 15,
  diveSpeed: 60,
  firstDiveDelayTicks: 1_000_000,
  diveIntervalTicks: 1_000_000,
  maxSorties: 1,
  diverShots: 0,
  raiderShots: 0,
};

/** A passive level with the given layout; `overrides` turn single fields on for a test. */
export function passiveLevel(
  layout: readonly string[],
  overrides: Partial<Omit<LevelConfig, 'layout'>> = {},
): LevelConfig {
  return { layout, ...PASSIVE, ...overrides };
}

/** A solo dive order with zero defaults; `overrides` set single fields for a test. */
export function diveOrder(overrides: Partial<DiveOrder> = {}): DiveOrder {
  return {
    sortieId: 1,
    side: 1,
    shots: 0,
    aimOffsetX: 0,
    groupMinOffsetX: 0,
    groupMaxOffsetX: 0,
    ...overrides,
  };
}

/**
 * Test-only level tables. Import from *.test.ts only.
 *
 * ONE_CORNER_ENEMY: a single drone in the top-left cell of a full-width
 * (FORMATION_MAX_COLS) layout, so baseX = 40 and the enemy starts at x = 42
 * (then x = 42 + formation.offset, within ±SWAY_RANGE), far from the ship's shot column
 * (x = 127). A one-column layout would be centered right above the ship.
 * TWO_LEVELS: two distinct levels for level-change tests (see below).
 * All levels here are passive (see PASSIVE): the first dive is 1_000_000 ticks away.
 */
export const ONE_CORNER_ENEMY: readonly LevelConfig[] = [passiveLevel(['D..........'])];

/**
 * TWO_LEVELS: two distinct passive levels for level-change tests. Level 1 - one drone in the
 * top-left cell, level 2 - two drones in the corners of a full-width (11) layout; both far from
 * the ship's shot column (x = 127). Level 3+ is level 2 with dive timers shrunk by levelConfig's
 * escalation (still passive).
 */
export const TWO_LEVELS: readonly LevelConfig[] = [
  passiveLevel(['D..........']),
  passiveLevel(['D.........D']),
];
