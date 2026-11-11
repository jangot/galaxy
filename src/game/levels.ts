import { TICK_SECONDS } from '../config';

/** Enemy kinds. */
export type EnemyKind = 'drone' | 'striker' | 'raider';
/** Layout chars: 'D' drone, 'S' striker, 'R' raider, '.' empty cell. */
export type LayoutChar = 'D' | 'S' | 'R' | '.';

/** One row of the level table: layout, sway, dives, shots. */
export interface LevelConfig {
  /** Rows top to bottom; 'D' drone, 'S' striker, 'R' raider, '.' empty. */
  readonly layout: readonly string[];
  /** Formation sway speed, px/s; px/tick must be 1/8, 1/4, 1/2 or a whole number (ADR 003). */
  readonly swaySpeed: number;
  /**
   * Dive (descend) speed, px/s; px/tick must be >= 1 and a multiple of 1/2 (ADR 004,
   * extends ADR 002). Checked by isAllowedDiveSpeed.
   */
  readonly diveSpeed: number;
  /** Ticks from the wave's start until the first dive (whole ticks, ADR 003). */
  readonly firstDiveDelayTicks: number;
  /** Ticks between dive launches. */
  readonly diveIntervalTicks: number;
  /** Max sorties out of the formation at the same time (a raider group is one sortie). */
  readonly maxSorties: number;
  /** Shots per dive for drone/striker, whole number >= 0; 0 = they do not shoot. */
  readonly diverShots: number;
  /** Shots per dive for each raider, whole number >= 0; > 0 when the layout has 'R'. */
  readonly raiderShots: number;
}

export interface Slot {
  readonly row: number;
  readonly col: number;
  readonly kind: EnemyKind;
  /** Raider group: id of an unbroken run of 'R' in a row, counted across the layout; null for others. */
  readonly group: number | null;
}

export interface Layout {
  readonly rows: number;
  readonly cols: number;
  /** Row-major: top to bottom, left to right within a row. Wave order follows it. */
  readonly slots: readonly Slot[];
}

/** Widest layout the formation geometry is designed for. */
export const FORMATION_MAX_COLS = 11;

const EMPTY: LayoutChar = '.';
const RAIDER: LayoutChar = 'R';
const KIND_BY_CHAR: Readonly<Record<Exclude<LayoutChar, '.'>, EnemyKind>> = {
  D: 'drone',
  S: 'striker',
  R: 'raider',
};

/** Default level table. All layouts are 10 columns wide (see design, exact rows). */
export const LEVELS: readonly LevelConfig[] = [
  {
    layout: ['.SSSSSSSS.', 'DDDDDDDDDD', 'DDDDDDDDDD'],
    swaySpeed: 15,
    diveSpeed: 60,
    firstDiveDelayTicks: 180,
    diveIntervalTicks: 180,
    maxSorties: 1,
    diverShots: 0,
    raiderShots: 0,
  },
  {
    layout: ['.SSSSSSSS.', 'SSSSSSSSSS', 'DDDDDDDDDD', 'DDDDDDDDDD'],
    swaySpeed: 15,
    diveSpeed: 90,
    firstDiveDelayTicks: 150,
    diveIntervalTicks: 150,
    maxSorties: 2,
    diverShots: 0,
    raiderShots: 0,
  },
  {
    layout: ['.SSSSSSSS.', 'SSSSSSSSSS', 'DDDDDDDDDD', 'DDDDDDDDDD'],
    swaySpeed: 30,
    diveSpeed: 120,
    firstDiveDelayTicks: 120,
    diveIntervalTicks: 120,
    maxSorties: 2,
    diverShots: 1,
    raiderShots: 0,
  },
  {
    layout: ['..RR..RR..', '.SSSSSSSS.', 'DDDDDDDDDD', 'DDDDDDDDDD'],
    swaySpeed: 30,
    diveSpeed: 150,
    firstDiveDelayTicks: 120,
    diveIntervalTicks: 90,
    maxSorties: 3,
    diverShots: 2,
    raiderShots: 2,
  },
  {
    layout: ['.RRR..RRR.', '.SSSSSSSS.', 'DDDDDDDDDD', 'DDDDDDDDDD'],
    swaySpeed: 30,
    diveSpeed: 180,
    firstDiveDelayTicks: 90,
    diveIntervalTicks: 60,
    maxSorties: 3,
    diverShots: 2,
    raiderShots: 3,
  },
];

/** Binary fractions of a pixel per tick allowed for slow motion (ADR 003). */
const FRACTIONAL_STEPS: readonly number[] = [1 / 2, 1 / 4, 1 / 8];

/** Speed rule shared by tests: whole px/tick >= 1 or exactly 1/2, 1/4, 1/8 px/tick. */
export function isAllowedSpeed(pxPerSecond: number): boolean {
  const perTick = pxPerSecond * TICK_SECONDS;
  return (Number.isInteger(perTick) && perTick >= 1) || FRACTIONAL_STEPS.includes(perTick);
}

/**
 * Dive speed rule (ADR 004): px/tick >= 1 and a whole number of half pixels
 * (60, 90, 120, 150, 180 px/s). Only for the dive's Y; sway still uses isAllowedSpeed.
 */
export function isAllowedDiveSpeed(pxPerSecond: number): boolean {
  const perTick = pxPerSecond * TICK_SECONDS;
  return perTick >= 1 && Number.isInteger(perTick * 2);
}

/** Past the end of the table: dive timers shrink by this many ticks per level (0.1 s). */
export const ESCALATION_STEP_TICKS = 6;
/** Floor of diveIntervalTicks past the end of the table (0.5 s). */
export const ESCALATION_MIN_INTERVAL_TICKS = 30;
/** Floor of firstDiveDelayTicks past the end of the table (1 s). */
export const ESCALATION_MIN_FIRST_DELAY_TICKS = 60;

/** Shrinks a timer by k steps down to the floor; never raises a value already below it. */
function escalate(last: number, floor: number, k: number): number {
  return Math.min(last, Math.max(floor, last - ESCALATION_STEP_TICKS * k));
}

/**
 * 1-based. Levels inside the table return their row as is. Past the end, k = level - length:
 * the last row with diveIntervalTicks and firstDiveDelayTicks shrunk by ESCALATION_STEP_TICKS
 * per level down to their floors (relative to the last row, so passive test tables stay
 * passive). Pure: depends only on level and the table.
 * Throws if !Number.isInteger(level) || level < 1, or if the table is empty.
 */
export function levelConfig(level: number, levels: readonly LevelConfig[] = LEVELS): LevelConfig {
  if (!Number.isInteger(level) || level < 1) {
    throw new Error(`Level must be an integer >= 1, got ${level}`);
  }
  const last = levels[levels.length - 1];
  if (last === undefined) throw new Error('Level table is empty');
  if (level <= levels.length) {
    const config = levels[level - 1];
    if (config === undefined) throw new Error(`Level ${level} is missing`);
    return config;
  }
  const k = level - levels.length;
  return {
    ...last,
    firstDiveDelayTicks: escalate(last.firstDiveDelayTicks, ESCALATION_MIN_FIRST_DELAY_TICKS, k),
    diveIntervalTicks: escalate(last.diveIntervalTicks, ESCALATION_MIN_INTERVAL_TICKS, k),
  };
}

/**
 * Parses the dev-only `?level=N` value. Returns N for a plain decimal integer >= 1,
 * otherwise 1. A level past the end of the table is fine: levelConfig escalates the last one (faster dive timers).
 */
export function parseStartLevel(value: string | null): number {
  if (value === null || !/^\d+$/.test(value)) return 1;
  const level = Number(value);
  return Number.isSafeInteger(level) && level >= 1 ? level : 1;
}

/**
 * Parses a layout into slots.
 * Slots of an unbroken run of 'R' in a row share a group id (0, 1, … in row-major order);
 * others get null.
 * Throws on: no rows, ragged rows, unknown char, width > FORMATION_MAX_COLS, no enemies.
 */
export function parseLayout(layout: readonly string[]): Layout {
  const first = layout[0];
  if (first === undefined) throw new Error('Layout has no rows');
  const cols = first.length;
  if (cols > FORMATION_MAX_COLS) {
    throw new Error(`Layout is ${cols} columns wide, max is ${FORMATION_MAX_COLS}`);
  }
  const slots: Slot[] = [];
  let groups = 0;
  layout.forEach((line, row) => {
    if (line.length !== cols) {
      throw new Error(`Layout row ${row} has length ${line.length}, expected ${cols}`);
    }
    [...line].forEach((ch, col) => {
      if (ch === EMPTY) return;
      const kind = Object.hasOwn(KIND_BY_CHAR, ch)
        ? KIND_BY_CHAR[ch as keyof typeof KIND_BY_CHAR]
        : undefined;
      if (kind === undefined) {
        throw new Error(`Unknown layout char '${ch}' at row ${row}, col ${col}`);
      }
      // A run of 'R' is one group; a new run starts after any other char or at the row start.
      const group = kind === 'raider' ? (line[col - 1] === RAIDER ? groups - 1 : groups++) : null;
      slots.push({ row, col, kind, group });
    });
  });
  if (slots.length === 0) throw new Error('Layout has no enemies');
  return { rows: layout.length, cols, slots };
}
