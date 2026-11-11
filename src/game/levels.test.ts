import { describe, expect, it } from 'vitest';
import { TICK_SECONDS } from '../config';
import { ENEMY_KINDS, PEEL_SEGMENTS, RETURN_SPEED, STEER_SPEED } from './enemy';
import { ENEMY_SHOT_HEIGHT, ENEMY_SHOT_SPEED } from './enemy-shot';
import {
  FORMATION_MAX_COLS,
  isAllowedSpeed,
  LEVELS,
  levelConfig,
  parseLayout,
  parseStartLevel,
} from './levels';
import { SHIP_HEIGHT, SHIP_SPEED } from './ship';
import { SHOT_HEIGHT, SHOT_SPEED } from './shot';
import { passiveLevel } from './test-levels';

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

  it('returns the last level past the end of the table', () => {
    expect(levelConfig(LEVELS.length + 5)).toBe(LEVELS[LEVELS.length - 1]);
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
    expect(levelConfig(3, table)).toBe(b);
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
  it.each(LEVELS.map((c, i) => [i + 1, c] as const))('level %i layout is valid', (_n, config) => {
    expect(() => parseLayout(config.layout)).not.toThrow();
    expect(parseLayout(config.layout).cols).toBe(10);
    expect(isAllowedSpeed(config.swaySpeed)).toBe(true);
  });

  it.each(LEVELS.map((c, i) => [i + 1, c] as const))(
    'level %i dive fields follow the speed and timer rules',
    (_n, config) => {
      expect(isAllowedSpeed(config.diveSpeed)).toBe(true);
      expect(Number.isInteger(config.diveSpeed * TICK_SECONDS)).toBe(true);
      for (const value of [
        config.firstDiveDelayTicks,
        config.diveIntervalTicks,
        config.maxSorties,
      ]) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(1);
      }
      expect(Number.isInteger(config.diverShots)).toBe(true);
      expect(config.diverShots).toBeGreaterThanOrEqual(0);
      // A returning enemy must be able to catch up with its swaying slot.
      expect(config.swaySpeed).toBeLessThan(STEER_SPEED);
    },
  );

  it.each(LEVELS.map((c, i) => [i + 1, c] as const))(
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

  it.each(LEVELS.map((c, i) => [i + 1, c] as const))(
    'level %i: an enemy shot outruns the dive',
    (_n, config) => {
      expect(ENEMY_SHOT_SPEED).toBeGreaterThan(config.diveSpeed);
    },
  );

  it('an enemy shot cannot tunnel through the ship', () => {
    // The ship does not move on Y.
    expect(ENEMY_SHOT_SPEED * TICK_SECONDS).toBeLessThan(ENEMY_SHOT_HEIGHT + SHIP_HEIGHT);
  });

  it.each(LEVELS.map((c, i) => [i + 1, c] as const))('level %i raider rules', (_n, config) => {
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
        diveSpeed: 120,
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
        diveSpeed: 120,
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
