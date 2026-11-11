import { describe, expect, it } from 'vitest';
import { TICK_SECONDS } from '../config';
import { ENEMY_KINDS, PEEL_SEGMENTS, RETURN_SPEED, STEER_SPEED } from './enemy';
import { ENEMY_SHOT_HEIGHT, ENEMY_SHOT_SPEED } from './enemy-shot';
import {
  ESCALATION_MIN_FIRST_DELAY_TICKS,
  ESCALATION_MIN_INTERVAL_TICKS,
  ESCALATION_STEP_TICKS,
  FORMATION_MAX_COLS,
  isAllowedDiveSpeed,
  isAllowedSpeed,
  LEVELS,
  levelConfig,
  parseLayout,
  parseStartLevel,
} from './levels';
import { SHIP_HEIGHT, SHIP_SPEED } from './ship';
import { SHOT_HEIGHT, SHOT_SPEED } from './shot';
import { passiveLevel } from './test-levels';

const LEVELS_1_TO_20 = Array.from({ length: 20 }, (_, i) => [i + 1, levelConfig(i + 1)] as const);

describe('parseLayout', () => {
  it('parses kinds, skips empty cells and keeps row-major order', () => {
    const layout = parseLayout(['.S.', 'D.D']);
    expect(layout.rows).toBe(2);
    expect(layout.cols).toBe(3);
    expect(layout.slots).toEqual([
      { row: 0, col: 1, kind: 'striker', group: null },
      { row: 1, col: 0, kind: 'drone', group: null },
      { row: 1, col: 2, kind: 'drone', group: null },
    ]);
  });

  const groupsOf = (layout: readonly string[]): (number | null)[] =>
    parseLayout(layout).slots.map((s) => s.group);

  it('gives each unbroken run of R in a row its own group', () => {
    const { slots } = parseLayout(['RR.RR']);
    expect(slots.map((s) => s.kind)).toEqual(['raider', 'raider', 'raider', 'raider']);
    expect(slots.map((s) => s.group)).toEqual([0, 0, 1, 1]);
  });

  it('breaks a run on any other char; drones and strikers have no group', () => {
    expect(groupsOf(['DRRD'])).toEqual([null, 0, 0, null]);
    expect(groupsOf(['RSR'])).toEqual([0, null, 1]);
  });

  it('counts groups across the layout in row-major order', () => {
    expect(groupsOf(['R.R', '.RR'])).toEqual([0, 1, 2, 2]);
  });

  it('does not carry a run over the end of a row', () => {
    expect(groupsOf(['RR', 'RR'])).toEqual([0, 0, 1, 1]);
  });

  it('accepts a layout exactly FORMATION_MAX_COLS wide', () => {
    expect(parseLayout(['D'.padEnd(FORMATION_MAX_COLS, '.')]).cols).toBe(FORMATION_MAX_COLS);
  });

  it.each([
    ['no rows', []],
    ['ragged rows', ['DD', 'D']],
    ['unknown char', ['DX']],
    ['too wide', ['D'.repeat(FORMATION_MAX_COLS + 1)]],
    ['no enemies', ['...', '...']],
    ['zero width', ['']],
  ] as const)('throws on %s', (_name, layout) => {
    expect(() => parseLayout(layout)).toThrow();
  });
});

describe('levelConfig', () => {
  it('returns the first level for 1', () => {
    expect(levelConfig(1)).toBe(LEVELS[0]);
  });

  it.each(LEVELS.map((config, i) => [i + 1, config] as const))(
    'returns row %i of the table as is',
    (n, config) => {
      expect(levelConfig(n)).toBe(config);
    },
  );

  it('escalates the last level past the end of the table', () => {
    expect(levelConfig(LEVELS.length + 1)).toEqual({
      ...LEVELS[4]!,
      firstDiveDelayTicks: 84,
      diveIntervalTicks: 54,
    });
  });

  it.each([
    [6, 84, 54],
    [7, 78, 48],
    [8, 72, 42],
    [9, 66, 36],
    [10, 60, 30],
    [20, 60, 30],
  ] as const)('level %i has first delay %i and interval %i', (n, firstDelay, interval) => {
    const config = levelConfig(n);
    expect(config.firstDiveDelayTicks).toBe(firstDelay);
    expect(config.diveIntervalTicks).toBe(interval);
  });

  it.each(LEVELS_1_TO_20.filter(([n]) => n > LEVELS.length))(
    'level %i keeps everything but the dive timers of the last row',
    (_n, config) => {
      const last = LEVELS[LEVELS.length - 1]!;
      expect(config.layout).toBe(last.layout);
      expect(config.swaySpeed).toBe(last.swaySpeed);
      expect(config.diveSpeed).toBe(last.diveSpeed);
      expect(config.maxSorties).toBe(last.maxSorties);
      expect(config.diverShots).toBe(last.diverShots);
      expect(config.raiderShots).toBe(last.raiderShots);
    },
  );

  it('is pure and does not mutate the table', () => {
    const snapshot = structuredClone(LEVELS[4]);
    expect(levelConfig(12)).toEqual(levelConfig(12));
    expect(LEVELS[4]).toEqual(snapshot);
  });

  it('is monotonic on levels 1..20 and stops at the floors', () => {
    for (let i = 1; i < LEVELS_1_TO_20.length; i++) {
      const prev = LEVELS_1_TO_20[i - 1]![1];
      const cur = LEVELS_1_TO_20[i]![1];
      expect(cur.diveSpeed).toBeGreaterThanOrEqual(prev.diveSpeed);
      expect(cur.firstDiveDelayTicks).toBeLessThanOrEqual(prev.firstDiveDelayTicks);
      expect(cur.diveIntervalTicks).toBeLessThanOrEqual(prev.diveIntervalTicks);
    }
    for (const [n, config] of LEVELS_1_TO_20) {
      expect(config.firstDiveDelayTicks).toBeGreaterThanOrEqual(ESCALATION_MIN_FIRST_DELAY_TICKS);
      expect(config.diveIntervalTicks).toBeGreaterThanOrEqual(ESCALATION_MIN_INTERVAL_TICKS);
      if (n >= 10) {
        expect(config.firstDiveDelayTicks).toBe(ESCALATION_MIN_FIRST_DELAY_TICKS);
        expect(config.diveIntervalTicks).toBe(ESCALATION_MIN_INTERVAL_TICKS);
      }
    }
  });

  it('shrinks the timers by ESCALATION_STEP_TICKS per level', () => {
    const six = levelConfig(6);
    const seven = levelConfig(7);
    expect(six.firstDiveDelayTicks - seven.firstDiveDelayTicks).toBe(ESCALATION_STEP_TICKS);
    expect(six.diveIntervalTicks - seven.diveIntervalTicks).toBe(ESCALATION_STEP_TICKS);
  });

  it.each([
    [2, 94, 34],
    [3, 88, 30],
    [7, 64, 30],
    [8, 60, 30],
  ] as const)(
    'escalates an injected active table: level %i -> %i / %i',
    (n, firstDelay, interval) => {
      const table = [passiveLevel(['D'], { firstDiveDelayTicks: 100, diveIntervalTicks: 40 })];
      const config = levelConfig(n, table);
      expect(config.firstDiveDelayTicks).toBe(firstDelay);
      expect(config.diveIntervalTicks).toBe(interval);
    },
  );

  it.each([2, 10])('does not raise timers already below the floor (level %i)', (n) => {
    const table = [passiveLevel(['D'], { firstDiveDelayTicks: 50, diveIntervalTicks: 20 })];
    const config = levelConfig(n, table);
    expect(config.firstDiveDelayTicks).toBe(50);
    expect(config.diveIntervalTicks).toBe(20);
  });

  it.each([0, -1, 1.5, NaN, Infinity])('throws on level %s', (level) => {
    expect(() => levelConfig(level)).toThrow();
  });

  it('throws on an empty table', () => {
    expect(() => levelConfig(1, [])).toThrow();
  });

  it('uses an injected table', () => {
    const a = passiveLevel(['D']);
    const b = passiveLevel(['S']);
    const table = [a, b];
    expect(levelConfig(1, table)).toBe(a);
    expect(levelConfig(2, table)).toBe(b);
    expect(levelConfig(3, table)).toEqual({
      ...b,
      firstDiveDelayTicks: 1_000_000 - 6,
      diveIntervalTicks: 1_000_000 - 6,
    });
  });
});

describe('isAllowedDiveSpeed', () => {
  it.each([60, 90, 120, 150, 180])('allows %s px/s', (speed) => {
    expect(isAllowedDiveSpeed(speed)).toBe(true);
  });

  it.each([0, -60, -90, 30, 45, 75, NaN, Infinity])('rejects %s px/s', (speed) => {
    expect(isAllowedDiveSpeed(speed)).toBe(false);
  });
});

describe('isAllowedSpeed', () => {
  it.each([7.5, 15, 30, 60, 120])('allows %s px/s', (speed) => {
    expect(isAllowedSpeed(speed)).toBe(true);
  });

  it.each([0, -15, -60, 20, 45, 90, NaN, Infinity])('rejects %s px/s', (speed) => {
    expect(isAllowedSpeed(speed)).toBe(false);
  });
});

describe('LEVELS', () => {
  it.each(LEVELS_1_TO_20)('level %i layout is valid', (_n, config) => {
    expect(() => parseLayout(config.layout)).not.toThrow();
    expect(parseLayout(config.layout).cols).toBe(10);
    expect(isAllowedSpeed(config.swaySpeed)).toBe(true);
  });

  it.each(LEVELS_1_TO_20)('level %i dive fields follow the speed and timer rules', (_n, config) => {
    expect(isAllowedDiveSpeed(config.diveSpeed)).toBe(true);
    for (const value of [config.firstDiveDelayTicks, config.diveIntervalTicks, config.maxSorties]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
    }
    expect(Number.isInteger(config.diverShots)).toBe(true);
    expect(config.diverShots).toBeGreaterThanOrEqual(0);
    // A returning enemy must be able to catch up with its swaying slot.
    expect(config.swaySpeed).toBeLessThan(STEER_SPEED);
  });

  it.each(LEVELS_1_TO_20)(
    'level %i: the player shot cannot tunnel through a diving enemy',
    (_n, config) => {
      const maxDown = Math.max(
        config.diveSpeed * TICK_SECONDS,
        ...PEEL_SEGMENTS.map((s) => s.vy),
        RETURN_SPEED * TICK_SECONDS,
      );
      const minEnemyHeight = Math.min(...Object.values(ENEMY_KINDS).map((k) => k.sprite.height));
      expect(SHOT_SPEED * TICK_SECONDS + maxDown).toBeLessThan(SHOT_HEIGHT + minEnemyHeight);
    },
  );

  it.each(LEVELS_1_TO_20)('level %i: an enemy shot outruns the dive', (_n, config) => {
    expect(ENEMY_SHOT_SPEED).toBeGreaterThan(config.diveSpeed);
  });

  it.each(LEVELS_1_TO_20)('level %i: the dive speed is at most 180 px/s', (_n, config) => {
    expect(config.diveSpeed).toBeLessThanOrEqual(180);
  });

  it('an enemy shot cannot tunnel through the ship', () => {
    // The ship does not move on Y.
    expect(ENEMY_SHOT_SPEED * TICK_SECONDS).toBeLessThan(ENEMY_SHOT_HEIGHT + SHIP_HEIGHT);
  });

  it.each(LEVELS_1_TO_20)('level %i raider rules', (_n, config) => {
    expect(Number.isInteger(config.raiderShots)).toBe(true);
    expect(config.raiderShots).toBeGreaterThanOrEqual(0);
    const raiders = parseLayout(config.layout).slots.filter((s) => s.kind === 'raider');
    if (raiders.length > 0) expect(config.raiderShots).toBeGreaterThan(0);
    const sizes = new Map<number | null, number>();
    for (const s of raiders) {
      expect(s.row).toBe(0);
      sizes.set(s.group, (sizes.get(s.group) ?? 0) + 1);
    }
    for (const size of sizes.values()) {
      expect(size).toBeGreaterThanOrEqual(2);
      expect(size).toBeLessThanOrEqual(3);
    }
  });

  it('has the agreed rows', () => {
    expect(LEVELS).toHaveLength(5);
    expect(LEVELS).toEqual([
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
    ]);
    expect(parseLayout(LEVELS[1]!.layout).slots).toHaveLength(38);
    expect(parseLayout(LEVELS[2]!.layout).slots).toHaveLength(38);
    expect(parseLayout(LEVELS[3]!.layout).slots).toHaveLength(32);
    expect(parseLayout(LEVELS[4]!.layout).slots).toHaveLength(34);
    const raiderCols = (n: number): [number, number | null][] =>
      parseLayout(LEVELS[n]!.layout)
        .slots.filter((s) => s.kind === 'raider')
        .map((s) => [s.col, s.group]);
    expect(raiderCols(3)).toEqual([
      [2, 0],
      [3, 0],
      [6, 1],
      [7, 1],
    ]);
    expect(raiderCols(4)).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
      [6, 1],
      [7, 1],
      [8, 1],
    ]);
  });
});

describe('ENEMY_KINDS steer', () => {
  it.each(Object.entries(ENEMY_KINDS))(
    '%s steers by whole px per tick, slower than the ship',
    (_kind, { steer }) => {
      expect(Number.isInteger(steer.maxVx)).toBe(true);
      expect(steer.maxVx).toBeGreaterThanOrEqual(1);
      expect(steer.maxVx).toBeLessThan(SHIP_SPEED * TICK_SECONDS);
      if (steer.retargetTicks !== null) {
        expect(Number.isInteger(steer.retargetTicks)).toBe(true);
        expect(steer.retargetTicks).toBeGreaterThanOrEqual(1);
      }
      expect(Number.isInteger(steer.turnTicks)).toBe(true);
      expect(steer.turnTicks).toBeGreaterThanOrEqual(0);
    },
  );
});

describe('parseStartLevel', () => {
  it.each([
    ['1', 1],
    ['2', 2],
    ['99', 99],
  ] as const)('parses %s as %i', (value, level) => {
    expect(parseStartLevel(value)).toBe(level);
  });

  it.each([null, '', '0', '1.5', 'abc', '-2', '1e3', ' 2', '99999999999999999999'])(
    'falls back to 1 for %s',
    (value) => {
      expect(parseStartLevel(value)).toBe(1);
    },
  );
});
