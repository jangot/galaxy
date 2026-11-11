import { describe, expect, it } from 'vitest';
import { TICK_SECONDS } from '../config';
import type { Rng } from '../engine/rng';
import { createRng } from '../engine/rng';
import { AttackDirector, selectSortie } from './attack-director';
import type { Enemy } from './enemy';
import { EXPLOSION_TICKS } from './enemy';
import type { LevelConfig } from './levels';
import { LEVELS } from './levels';
import { diveOrder, passiveLevel } from './test-levels';
import { Wave } from './wave';

/** Enemies of a passive level: the wave's own director never fires. */
function enemiesOf(layout: readonly string[]): { enemies: readonly Enemy[]; cols: number } {
  const wave = new Wave(passiveLevel(layout), createRng(1));
  return { enemies: wave.enemies, cols: wave.formation.cols };
}

const fixed =
  (v: number): Rng =>
  () =>
    v;

/** A fixed rng that counts its calls. */
function counting(v = 0.5): { rng: Rng; calls: () => number } {
  let calls = 0;
  return {
    rng: () => {
      calls++;
      return v;
    },
    calls: () => calls,
  };
}

function at(enemies: readonly Enemy[], row: number, col: number): Enemy {
  const enemy = enemies.find((e) => e.slot.row === row && e.slot.col === col);
  if (!enemy) throw new Error(`no enemy at ${row},${col}`);
  return enemy;
}

/** Passive config for direct selectSortie calls: only diverShots (0) is read. */
const CONFIG = passiveLevel(['DD']);

function pick(enemies: readonly Enemy[], cols: number, rng: Rng): [number, number, number] {
  const sortie = selectSortie(enemies, cols, CONFIG, 1, rng);
  if (!sortie) throw new Error('expected a sortie');
  const member = sortie.members[0]!;
  return [member.slot.row, member.slot.col, sortie.orders[0]!.side];
}

function out(enemies: readonly Enemy[]): Enemy[] {
  return enemies.filter((e) => e.isOut);
}

function explodeToDeath(enemy: Enemy): void {
  enemy.kill();
  for (let i = 0; i < EXPLOSION_TICKS; i++)
    enemy.update(TICK_SECONDS, { diveSpeed: 60, targetX: null });
}

describe('selectSortie', () => {
  it('lists row edges top to bottom, left before right', () => {
    const { enemies, cols } = enemiesOf(['DDD', '.D.', 'DD.']);
    expect(cols).toBe(3);
    const n = 5;
    const picks = Array.from({ length: n }, (_, k) => pick(enemies, cols, fixed((k + 0.5) / n)));
    expect(picks).toEqual([
      [0, 0, -1],
      [0, 2, 1],
      [1, 1, 1],
      [2, 0, -1],
      [2, 1, 1],
    ]);
    expect(pick(enemies, cols, fixed(0.999999))).toEqual([2, 1, 1]);
    expect(pick(enemies, cols, fixed(0))).toEqual([0, 0, -1]);
  });

  it('sends a lone enemy to its half of the formation', () => {
    const left = enemiesOf(['D..']);
    expect(pick(left.enemies, left.cols, fixed(0))).toEqual([0, 0, -1]);
    const right = enemiesOf(['..D']);
    expect(pick(right.enemies, right.cols, fixed(0))).toEqual([0, 2, 1]);
    const middle = enemiesOf(['.D.']);
    expect(pick(middle.enemies, middle.cols, fixed(0))).toEqual([0, 1, 1]);
  });

  it('takes the edges among enemies still in formation', () => {
    const { enemies, cols } = enemiesOf(['DDD']);
    at(enemies, 0, 0).startDive(diveOrder({ side: -1 }));
    expect(pick(enemies, cols, fixed(0.25))).toEqual([0, 1, -1]);
    expect(pick(enemies, cols, fixed(0.75))).toEqual([0, 2, 1]);
  });

  it('skips exploding and dead enemies', () => {
    const { enemies, cols } = enemiesOf(['DDDD']);
    at(enemies, 0, 3).kill();
    expect(pick(enemies, cols, fixed(0.75))).toEqual([0, 2, 1]);
    explodeToDeath(at(enemies, 0, 0));
    expect(at(enemies, 0, 0).state).toBe('dead');
    expect(pick(enemies, cols, fixed(0.25))).toEqual([0, 1, -1]);
  });

  it('returns null without touching the rng when nobody is in formation', () => {
    const { enemies, cols } = enemiesOf(['DD']);
    at(enemies, 0, 0).startDive(diveOrder({ side: -1 }));
    at(enemies, 0, 1).kill();
    const { rng, calls } = counting();
    expect(selectSortie(enemies, cols, CONFIG, 1, rng)).toBeNull();
    expect(calls()).toBe(0);
  });

  it('builds a one-member sortie with the given id', () => {
    const { enemies, cols } = enemiesOf(['DD']);
    const { rng, calls } = counting(0);
    const sortie = selectSortie(enemies, cols, CONFIG, 42, rng);
    expect(sortie?.members).toEqual([at(enemies, 0, 0)]);
    expect(sortie?.orders).toEqual([
      { sortieId: 42, side: -1, shots: 0, aimOffsetX: 0, groupMinOffsetX: 0, groupMaxOffsetX: 0 },
    ]);
    expect(calls()).toBe(1);
  });

  it("puts the level's diverShots into the order", () => {
    const { enemies, cols } = enemiesOf(['DD']);
    const { rng } = counting(0);
    const config = passiveLevel(['DD'], { diverShots: 3 });
    expect(selectSortie(enemies, cols, config, 42, rng)?.orders).toEqual([
      { sortieId: 42, side: -1, shots: 3, aimOffsetX: 0, groupMinOffsetX: 0, groupMaxOffsetX: 0 },
    ]);
  });
});

/** Config for raider groups: shots differ by kind (drone/striker 1, raider 2). */
const GROUP_CONFIG = passiveLevel(['DD'], { diverShots: 1, raiderShots: 2 });

/** Sortie picked with a fixed rng value from GROUP_CONFIG. */
function groupSortie(enemies: readonly Enemy[], cols: number, v: number) {
  const sortie = selectSortie(enemies, cols, GROUP_CONFIG, 42, fixed(v));
  if (!sortie) throw new Error('expected a sortie');
  return sortie;
}

/** [row, col] of a sortie's members and its sides. */
function shape(sortie: { members: readonly Enemy[]; orders: readonly { side: -1 | 1 }[] }) {
  return {
    members: sortie.members.map((m) => [m.slot.row, m.slot.col]),
    sides: sortie.orders.map((o) => o.side),
  };
}

describe('selectSortie raider groups', () => {
  it('sends a whole group with offsets from its leader', () => {
    const { enemies, cols } = enemiesOf(['.RRR..RRR.']);
    const left = groupSortie(enemies, cols, 0);
    expect(left.members).toEqual([at(enemies, 0, 1), at(enemies, 0, 2), at(enemies, 0, 3)]);
    const base = { sortieId: 42, shots: 2 };
    expect(left.orders).toEqual(
      [0, 16, 32].map((aimOffsetX) => ({
        ...base,
        side: -1,
        aimOffsetX,
        groupMinOffsetX: 0,
        groupMaxOffsetX: 32,
      })),
    );
    const right = groupSortie(enemies, cols, 0.75);
    expect(right.members).toEqual([at(enemies, 0, 6), at(enemies, 0, 7), at(enemies, 0, 8)]);
    expect(right.orders).toEqual(
      [-32, -16, 0].map((aimOffsetX) => ({
        ...base,
        side: 1,
        aimOffsetX,
        groupMinOffsetX: -32,
        groupMaxOffsetX: 0,
      })),
    );
  });

  it.each([
    [['RR.'], -1],
    [['.RR'], 1],
    [['RR'], 1],
  ] as const)('group of %j peels to side %i', (layout, side) => {
    const { enemies, cols } = enemiesOf(layout);
    expect(groupSortie(enemies, cols, 0).orders.map((o) => o.side)).toEqual([side, side]);
  });

  it('keeps raiders out of the row edges and orders candidates by their left column', () => {
    const rrd = enemiesOf(['RRD']);
    const group = groupSortie(rrd.enemies, rrd.cols, 0.25);
    expect(shape(group)).toEqual({
      members: [
        [0, 0],
        [0, 1],
      ],
      sides: [-1, -1],
    });
    expect(group.orders.map((o) => o.shots)).toEqual([2, 2]);
    const solo = groupSortie(rrd.enemies, rrd.cols, 0.75);
    expect(solo.members).toEqual([at(rrd.enemies, 0, 2)]);
    expect(solo.orders).toEqual([
      { sortieId: 42, side: 1, shots: 1, aimOffsetX: 0, groupMinOffsetX: 0, groupMaxOffsetX: 0 },
    ]);

    const drrd = enemiesOf(['DRRD']);
    const picks = [0.1, 0.5, 0.9].map((v) => shape(groupSortie(drrd.enemies, drrd.cols, v)));
    expect(picks).toEqual([
      { members: [[0, 0]], sides: [-1] },
      {
        members: [
          [0, 1],
          [0, 2],
        ],
        sides: [1, 1],
      },
      { members: [[0, 3]], sides: [1] },
    ]);

    const rows = enemiesOf(['RR', 'DD']);
    expect(shape(groupSortie(rows.enemies, rows.cols, 0)).members).toEqual([
      [0, 0],
      [0, 1],
    ]);
  });

  it('does not send a group while one of its members is out', () => {
    const { enemies, cols } = enemiesOf(['RRR']);
    at(enemies, 0, 1).startDive(diveOrder());
    const { rng, calls } = counting();
    expect(selectSortie(enemies, cols, GROUP_CONFIG, 42, rng)).toBeNull();
    expect(calls()).toBe(0);
  });

  it.each([
    ['exploding', (e: Enemy) => e.kill()],
    ['dead', explodeToDeath],
  ] as const)('leaves %s members out of the group', (_state, hit) => {
    const pair = enemiesOf(['RRR']);
    hit(at(pair.enemies, 0, 2));
    const two = groupSortie(pair.enemies, pair.cols, 0);
    expect(two.members).toEqual([at(pair.enemies, 0, 0), at(pair.enemies, 0, 1)]);
    expect(two.orders).toEqual(
      [0, 16].map((aimOffsetX) => ({
        sortieId: 42,
        side: -1,
        shots: 2,
        aimOffsetX,
        groupMinOffsetX: 0,
        groupMaxOffsetX: 16,
      })),
    );

    const lone = enemiesOf(['RRR']);
    hit(at(lone.enemies, 0, 0));
    hit(at(lone.enemies, 0, 2));
    const one = groupSortie(lone.enemies, lone.cols, 0);
    expect(one.members).toEqual([at(lone.enemies, 0, 1)]);
    expect(one.orders).toEqual([
      { sortieId: 42, side: 1, shots: 2, aimOffsetX: 0, groupMinOffsetX: 0, groupMaxOffsetX: 0 },
    ]);
  });

  it('a group with no alive members gives no candidate', () => {
    const { enemies, cols } = enemiesOf(['RR', 'D.']);
    at(enemies, 0, 0).kill();
    explodeToDeath(at(enemies, 0, 1));
    for (const v of [0, 0.5, 0.99]) {
      expect(groupSortie(enemies, cols, v).members).toEqual([at(enemies, 1, 0)]);
    }
  });
});

describe('AttackDirector', () => {
  function director(
    layout: readonly string[],
    overrides: Partial<Omit<LevelConfig, 'layout'>>,
  ): { director: AttackDirector; enemies: readonly Enemy[]; cols: number } {
    const { enemies, cols } = enemiesOf(layout);
    return { director: new AttackDirector(passiveLevel(layout, overrides)), enemies, cols };
  }

  it('launches after firstDiveDelayTicks, then every diveIntervalTicks', () => {
    const d = director(['DDDD'], { firstDiveDelayTicks: 5, diveIntervalTicks: 3, maxSorties: 4 });
    const rng = createRng(1);
    const counts: number[] = [];
    for (let i = 0; i < 12; i++) {
      d.director.update(d.enemies, d.cols, rng);
      counts.push(out(d.enemies).length);
    }
    expect(counts).toEqual([0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3]);
  });

  it('numbers sorties one after another', () => {
    const d = director(['DDDD'], { firstDiveDelayTicks: 1, diveIntervalTicks: 1, maxSorties: 4 });
    const rng = createRng(1);
    d.director.update(d.enemies, d.cols, rng);
    const first = out(d.enemies)[0]!;
    d.director.update(d.enemies, d.cols, rng);
    const second = out(d.enemies).find((e) => e !== first)!;
    expect(second.sortieId).toBe(first.sortieId! + 1);
  });

  it('keeps at most maxSorties out and relaunches as soon as one is shot', () => {
    const d = director(['DDDD'], { firstDiveDelayTicks: 1, diveIntervalTicks: 1, maxSorties: 1 });
    const rng = createRng(1);
    for (let i = 0; i < 10; i++) d.director.update(d.enemies, d.cols, rng);
    const [diver, ...rest] = out(d.enemies);
    expect(rest).toHaveLength(0);
    diver!.kill();
    expect(out(d.enemies)).toHaveLength(0);
    d.director.update(d.enemies, d.cols, rng);
    expect(out(d.enemies)).toHaveLength(1);
    expect(out(d.enemies)[0]).not.toBe(diver);
  });

  it('allows up to two sorties when maxSorties is 2', () => {
    const d = director(['DDDD'], { firstDiveDelayTicks: 1, diveIntervalTicks: 1, maxSorties: 2 });
    const rng = createRng(1);
    for (let i = 0; i < 10; i++) {
      d.director.update(d.enemies, d.cols, rng);
      const ids = new Set(out(d.enemies).map((e) => e.sortieId));
      expect(ids.size).toBeLessThanOrEqual(2);
    }
    expect(out(d.enemies)).toHaveLength(2);
  });

  it('a returned enemy frees its place in the limit', () => {
    const wave = new Wave(
      passiveLevel(['D.D'], { firstDiveDelayTicks: 1, diveIntervalTicks: 1, maxSorties: 1 }),
      createRng(1),
    );
    const prev = wave.enemies.map((e) => e.state);
    let returns = 0;
    for (let tick = 0; tick < 1200; tick++) {
      wave.update(TICK_SECONDS, null);
      expect(out(wave.enemies)).toHaveLength(1);
      wave.enemies.forEach((e, i) => {
        if (prev[i] === 'returning' && e.state !== 'returning') returns++;
        prev[i] = e.state;
      });
    }
    expect(returns).toBeGreaterThanOrEqual(2);
  });

  it('waits without calling the rng while the limit is reached or nobody can go', () => {
    const limited = director(['DD'], {
      firstDiveDelayTicks: 1,
      diveIntervalTicks: 1,
      maxSorties: 1,
    });
    const a = counting(0);
    for (let i = 0; i < 5; i++) limited.director.update(limited.enemies, limited.cols, a.rng);
    expect(a.calls()).toBe(1);

    const lonely = director(['D'], { firstDiveDelayTicks: 1, diveIntervalTicks: 1, maxSorties: 2 });
    const b = counting(0);
    for (let i = 0; i < 5; i++) lonely.director.update(lonely.enemies, lonely.cols, b.rng);
    expect(b.calls()).toBe(1);
    expect(out(lonely.enemies)).toHaveLength(1);
  });

  it('counts a raider group as one sortie in the limit', () => {
    const d = director(['RRR', 'DDD'], {
      firstDiveDelayTicks: 1,
      diveIntervalTicks: 1,
      maxSorties: 1,
    });
    const rng = fixed(0);
    d.director.update(d.enemies, d.cols, rng);
    const group = out(d.enemies);
    expect(group.map((e) => e.slot.row)).toEqual([0, 0, 0]);
    expect(new Set(group.map((e) => e.sortieId)).size).toBe(1);
    for (let i = 0; i < 5; i++) d.director.update(d.enemies, d.cols, rng);
    expect(out(d.enemies)).toEqual(group);
    group[0]!.kill();
    d.director.update(d.enemies, d.cols, rng);
    expect(out(d.enemies)).toEqual([group[1], group[2]]);
    group[1]!.kill();
    group[2]!.kill();
    d.director.update(d.enemies, d.cols, rng);
    const next = out(d.enemies);
    expect(next).toHaveLength(1);
    expect(next[0]!.slot.row).toBe(1);
  });

  /** Row/col of the first `n` divers; every diver is shot right away to free the limit. */
  function diveSequence(seed: number, n: number): string[] {
    const d = director(LEVELS[1]!.layout, {
      firstDiveDelayTicks: 1,
      diveIntervalTicks: 1,
      maxSorties: 1,
    });
    const rng = createRng(seed);
    const seq: string[] = [];
    while (seq.length < n) {
      d.director.update(d.enemies, d.cols, rng);
      for (const e of out(d.enemies)) {
        seq.push(`${e.slot.row},${e.slot.col}`);
        e.kill();
      }
    }
    return seq;
  }

  it('is deterministic for a seed', () => {
    expect(diveSequence(42, 20)).toEqual(diveSequence(42, 20));
    expect(diveSequence(1, 20)).not.toEqual(diveSequence(2, 20));
  });
});
