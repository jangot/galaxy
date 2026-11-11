import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT, TICK_SECONDS } from '../config';
import { createRng } from '../engine/rng';
import type { Enemy } from './enemy';
import { ENEMY_FIRE_INTERVAL_TICKS, EXPLOSION_TICKS, PEEL_SEGMENTS } from './enemy';
import { EnemyShot } from './enemy-shot';
import { CELL_WIDTH } from './formation';
import { LEVELS } from './levels';
import { diveOrder, passiveLevel } from './test-levels';
import { MAX_ENEMY_SHOTS, Wave } from './wave';

const SHIP_CENTER_X = 127; // default ship: x = 120, width 15

describe('Wave', () => {
  it('builds level 1: 8 strikers on top, two rows of 10 drones', () => {
    const wave = new Wave(LEVELS[0]!, createRng(1));
    expect(wave.enemies).toHaveLength(28);
    const count = (row: number, kind: string) =>
      wave.enemies.filter((e) => e.slot.row === row && e.kind === kind).length;
    expect(count(0, 'striker')).toBe(8);
    expect(count(0, 'drone')).toBe(0);
    expect(count(1, 'drone')).toBe(10);
    expect(count(2, 'drone')).toBe(10);
    expect(wave.enemies.filter((e) => e.kind === 'striker')).toHaveLength(8);
  });

  it('follows the layout slots in order and places enemies in their slots', () => {
    const wave = new Wave(passiveLevel(['.S.', 'D.D']), createRng(1));
    expect(wave.enemies.map((e) => [e.slot.row, e.slot.col, e.kind])).toEqual([
      [0, 1, 'striker'],
      [1, 0, 'drone'],
      [1, 2, 'drone'],
    ]);
    expect(wave.formation.cols).toBe(3);
    expect(wave.formation.rows).toBe(2);
    for (const e of wave.enemies) {
      expect(e.x).toBe(wave.formation.slotX(e.slot.col, e.width));
      expect(e.y).toBe(wave.formation.slotY(e.slot.row, e.height));
    }
  });

  it('keeps the config object', () => {
    const config = passiveLevel(['D']);
    expect(new Wave(config, createRng(1)).config).toBe(config);
  });

  it('sways: enemies follow their slots on X, Y stays', () => {
    const wave = new Wave(LEVELS[0]!, createRng(1));
    const before = wave.enemies.map((e) => [e.x, e.y] as const);
    for (let i = 0; i < 4; i++) wave.update(TICK_SECONDS, SHIP_CENTER_X);
    expect(wave.formation.offset).toBe(1);
    wave.enemies.forEach((e, i) => {
      const [x0, y0] = before[i]!;
      expect(e.x).toBe(x0 + 1);
      expect(e.y).toBe(y0);
      expect(e.x).toBe(wave.formation.slotX(e.slot.col, e.width));
    });
  });

  it('rejects a bad layout', () => {
    expect(() => new Wave(passiveLevel(['X']), createRng(1))).toThrow();
  });
});

describe('Wave.isCleared', () => {
  it('is false for a new wave', () => {
    expect(new Wave(LEVELS[0]!, createRng(1)).isCleared).toBe(false);
  });

  it('becomes true only after every explosion has finished', () => {
    const wave = new Wave(LEVELS[0]!, createRng(1));
    for (const e of wave.enemies) e.kill();
    expect(wave.isCleared).toBe(false);
    for (let i = 0; i < EXPLOSION_TICKS - 1; i++) wave.update(TICK_SECONDS, SHIP_CENTER_X);
    expect(wave.isCleared).toBe(false);
    wave.update(TICK_SECONDS, SHIP_CENTER_X);
    expect(wave.isCleared).toBe(true);
  });

  it('stays false while one enemy is alive', () => {
    const wave = new Wave(LEVELS[0]!, createRng(1));
    wave.enemies.slice(1).forEach((e) => e.kill());
    for (let i = 0; i < EXPLOSION_TICKS; i++) wave.update(TICK_SECONDS, SHIP_CENTER_X);
    expect(wave.enemies[0]!.state).toBe('formation');
    expect(wave.isCleared).toBe(false);
  });
});

describe('Wave dives', () => {
  it('runs the director after the enemies: a new diver stands in this tick slot', () => {
    const wave = new Wave(passiveLevel(['D'], { firstDiveDelayTicks: 1 }), createRng(1));
    wave.update(TICK_SECONDS, SHIP_CENTER_X);
    const enemy = wave.enemies[0]!;
    expect(wave.formation.offset).toBe(0.25);
    expect(enemy.state).toBe('diving');
    expect(enemy.stateTicks).toBe(0);
    expect(enemy.x).toBe(wave.formation.slotX(0, enemy.width));
    expect(enemy.y).toBe(wave.formation.slotY(0, enemy.height));
  });

  it('level 1 launches the first dive on tick 180', () => {
    const wave = new Wave(LEVELS[0]!, createRng(1));
    for (let i = 0; i < 179; i++) wave.update(TICK_SECONDS, SHIP_CENTER_X);
    expect(wave.enemies.filter((e) => e.isOut)).toHaveLength(0);
    wave.update(TICK_SECONDS, SHIP_CENTER_X);
    expect(wave.enemies.filter((e) => e.isOut)).toHaveLength(1);
  });

  it('passes targetX to the enemies', () => {
    const P = PEEL_SEGMENTS.reduce((sum, s) => sum + s.ticks, 0);
    const level = passiveLevel(['D'], { firstDiveDelayTicks: 1 });
    const aimed = new Wave(level, createRng(1));
    const blind = new Wave(level, createRng(1));
    for (let i = 0; i < 1 + P; i++) {
      aimed.update(TICK_SECONDS, 0);
      blind.update(TICK_SECONDS, 0);
    }
    const a = aimed.enemies[0]!;
    const b = blind.enemies[0]!;
    expect(a.state).toBe('diving');
    expect(b.x).toBe(a.x);
    const x = a.x;
    aimed.update(TICK_SECONDS, 0); // descend tick 1: aims at 0
    blind.update(TICK_SECONDS, null); // descend tick 1: no target, straight down
    expect(a.x).toBe(x - 1);
    expect(b.x).toBe(x);
  });

  it('is deterministic for a seed, including dives and returns', () => {
    const a = new Wave(LEVELS[1]!, createRng(7));
    const b = new Wave(LEVELS[1]!, createRng(7));
    let sawReturning = false;
    for (let i = 0; i < 600; i++) {
      a.update(TICK_SECONDS, SHIP_CENTER_X);
      b.update(TICK_SECONDS, SHIP_CENTER_X);
      if (a.enemies.some((e) => e.state === 'returning')) sawReturning = true;
    }
    const snapshot = (w: Wave) => w.enemies.map((e) => [e.x, e.y, e.state, e.sortieId]);
    expect(snapshot(a)).toEqual(snapshot(b));
    expect(sawReturning).toBe(true);
  });
});

describe('Wave enemy shots', () => {
  const P = PEEL_SEGMENTS.reduce((sum, s) => sum + s.ticks, 0);
  const D = P + 1;

  function run(wave: Wave, n: number): void {
    for (let i = 0; i < n; i++) wave.update(TICK_SECONDS, null);
  }

  /** Shot column of an enemy: the center column of its drawn sprite. */
  const column = (e: Enemy): number => Math.floor(e.x) + Math.floor(e.width / 2);

  /** Five drones; 0-3 dive with one shot, 4 with two, all on the same tick. */
  function fiveDivers(): Wave {
    const wave = new Wave(passiveLevel(['DDDDD']), createRng(1));
    wave.enemies.forEach((e, i) => e.startDive(diveOrder({ shots: i === 4 ? 2 : 1 })));
    return wave;
  }

  it.each([
    ['D', 5],
    ['S', 6],
  ] as const)('%s fires on the first descend tick from its nose (+%i px)', (layout, offset) => {
    const wave = new Wave(passiveLevel([layout]), createRng(1));
    const enemy = wave.enemies[0]!;
    enemy.startDive(diveOrder({ shots: 1 }));
    run(wave, P);
    expect(wave.shots).toHaveLength(0);
    run(wave, 1);
    expect(wave.shots).toHaveLength(1);
    const shot = wave.shots[0]!;
    expect(shot.x).toBe(column(enemy));
    expect(shot.x - Math.floor(enemy.x)).toBe(offset);
    expect(shot.y).toBe(enemy.y + enemy.height);
    const { x, y } = shot;
    run(wave, 1);
    expect(shot.y).toBe(y + 4);
    expect(shot.x).toBe(x);
  });

  it('has no shots without a shooting order', () => {
    const wave = new Wave(passiveLevel(['DD'], { firstDiveDelayTicks: 1 }), createRng(1));
    let sawDive = false;
    for (let i = 0; i < 600; i++) {
      wave.update(TICK_SECONDS, SHIP_CENTER_X);
      if (wave.enemies.some((e) => e.isOut)) sawDive = true;
      expect(wave.shots).toHaveLength(0);
    }
    expect(sawDive).toBe(true);
  });

  it('keeps at most MAX_ENEMY_SHOTS; a shot over the limit is lost but spent', () => {
    expect(MAX_ENEMY_SHOTS).toBe(4);
    const wave = fiveDivers();
    run(wave, D);
    expect(wave.shots).toHaveLength(MAX_ENEMY_SHOTS);
    expect(wave.shots.map((s) => s.x)).toEqual(wave.enemies.slice(0, 4).map(column));
    wave.clearShots();
    run(wave, ENEMY_FIRE_INTERVAL_TICKS);
    expect(wave.shots).toHaveLength(1);
    expect(wave.shots[0]!.x).toBe(column(wave.enemies[4]!));
    run(wave, ENEMY_FIRE_INTERVAL_TICKS);
    expect(wave.shots).toHaveLength(1);
    expect(wave.enemies.every((e) => e.state === 'diving')).toBe(true);
  });

  it('a slot freed by a shot leaving past the bottom is free on the same tick', () => {
    const wave = fiveDivers();
    run(wave, D + ENEMY_FIRE_INTERVAL_TICKS - 1);
    expect(wave.shots).toHaveLength(4);
    const leaving = wave.shots[0]!;
    leaving.y = SCREEN_HEIGHT - 4;
    run(wave, 1);
    expect(wave.shots).toHaveLength(4);
    expect(wave.shots).not.toContain(leaving);
    expect(wave.shots[3]!.x).toBe(column(wave.enemies[4]!));
  });

  it('removes shots once they are past the bottom', () => {
    const wave = new Wave(passiveLevel(['D']), createRng(1));
    wave.enemies[0]!.startDive(diveOrder({ shots: 2 }));
    run(wave, D);
    const shot = wave.shots[0]!;
    shot.y = SCREEN_HEIGHT - 5;
    run(wave, 1);
    expect(wave.shots).toEqual([shot]);
    expect(shot.y).toBe(SCREEN_HEIGHT - 1);
    run(wave, 1);
    expect(wave.shots).toHaveLength(0);
  });

  it('removeShot() removes that shot only, keeping the order; clearShots() removes all', () => {
    const wave = fiveDivers();
    run(wave, D);
    const [a, b, c, d] = [...wave.shots];
    wave.removeShot(b!);
    expect(wave.shots).toEqual([a, c, d]);
    wave.removeShot(new EnemyShot(0, 0));
    expect(wave.shots).toEqual([a, c, d]);
    wave.clearShots();
    expect(wave.shots).toHaveLength(0);
  });

  it('is deterministic for a seed on a shooting level', () => {
    const a = new Wave(LEVELS[2]!, createRng(7));
    const b = new Wave(LEVELS[2]!, createRng(7));
    let sawShot = false;
    for (let i = 0; i < 600; i++) {
      a.update(TICK_SECONDS, SHIP_CENTER_X);
      b.update(TICK_SECONDS, SHIP_CENTER_X);
      if (a.shots.length > 0) sawShot = true;
    }
    const snapshot = (w: Wave) => w.enemies.map((e) => [e.x, e.y, e.state, e.sortieId]);
    const shots = (w: Wave) => w.shots.map((s) => [s.x, s.y]);
    expect(snapshot(a)).toEqual(snapshot(b));
    expect(shots(a)).toEqual(shots(b));
    expect(sawShot).toBe(true);
  });
});

describe('Wave raider group', () => {
  it('flies out together, keeps its spacing and fires a volley', () => {
    const wave = new Wave(
      passiveLevel(['RRR'], {
        firstDiveDelayTicks: 1,
        diveIntervalTicks: 1_000_000,
        maxSorties: 1,
        raiderShots: 1,
      }),
      createRng(1),
    );
    const members = wave.enemies;
    expect(members.map((e) => e.kind)).toEqual(['raider', 'raider', 'raider']);
    let launched = false;
    let volley = false;
    let lastLeftX = NaN;
    for (let tick = 0; tick < 1000; tick++) {
      const before = wave.shots.length;
      wave.update(TICK_SECONDS, 7);
      if (!launched && members.some((e) => e.state === 'diving')) {
        launched = true;
        expect(members.every((e) => e.state === 'diving')).toBe(true);
        expect(new Set(members.map((e) => e.sortieId)).size).toBe(1);
      }
      if (wave.shots.length > before) {
        expect(volley).toBe(false);
        expect(before).toBe(0);
        expect(wave.shots).toHaveLength(3);
        volley = true;
      }
      if (members.every((e) => e.state === 'diving')) {
        expect(members[1]!.x - members[0]!.x).toBe(CELL_WIDTH);
        expect(members[2]!.x - members[1]!.x).toBe(CELL_WIDTH);
        lastLeftX = members[0]!.x;
      }
      if (members.every((e) => e.state === 'returning')) break;
    }
    expect(launched).toBe(true);
    expect(volley).toBe(true);
    expect(members.every((e) => e.state === 'returning')).toBe(true);
    // The anchor is clamped at the left edge: the leftmost member ends at the edge, over the
    // ship (within one steering step: the start X carries the sway's fraction).
    expect(lastLeftX).toBeGreaterThanOrEqual(0);
    expect(lastLeftX).toBeLessThan(1);
  });
});
