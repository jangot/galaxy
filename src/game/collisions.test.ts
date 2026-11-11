import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT, TICK_SECONDS } from '../config';
import { createRng } from '../engine/rng';
import { overlaps, resolveCollisions } from './collisions';
import type { Enemy, EnemyEnv } from './enemy';
import { EXPLOSION_TICKS, PEEL_SEGMENTS } from './enemy';
import { DOWN_TICKS, Player } from './player';
import type { Shot } from './shot';
import { diveOrder, passiveLevel } from './test-levels';
import { Wave } from './wave';

const FIRE = { move: 0, fire: true } as const;
const IDLE = { move: 0, fire: false } as const;
const ENV: EnemyEnv = { diveSpeed: 60, targetX: null };

function rect(x: number, y: number, width: number, height: number) {
  return { x, y, width, height };
}

/** Player with the default ship (x = 120): the shot flies in column x = 127. */
function playerWithShot(y: number): { player: Player; shot: Shot } {
  const player = new Player();
  player.update(TICK_SECONDS, FIRE);
  const shot = player.shot;
  if (!shot) throw new Error('expected a shot');
  shot.y = y;
  return { player, shot };
}

function wave(layout: string[]): Wave {
  return new Wave(passiveLevel(layout), createRng(1));
}

describe('overlaps', () => {
  it('is true for a 1 px overlap', () => {
    expect(overlaps(rect(0, 0, 4, 4), rect(3, 3, 4, 4))).toBe(true);
  });

  it('is false for edges touching on X or Y', () => {
    expect(overlaps(rect(0, 0, 4, 4), rect(4, 0, 4, 4))).toBe(false);
    expect(overlaps(rect(0, 0, 4, 4), rect(0, 4, 4, 4))).toBe(false);
  });

  it('floors fractional positions', () => {
    // Without floor, 3.75 + 1 > 4 would overlap.
    expect(overlaps(rect(3.75, 0, 1, 1), rect(4, 0, 4, 4))).toBe(false);
    expect(overlaps(rect(4.5, 0, 1, 1), rect(4, 0, 4, 4))).toBe(true);
    expect(overlaps(rect(4, 0, 1, 1), rect(0.75, 0, 4, 4))).toBe(false);
  });
});

describe('resolveCollisions', () => {
  it('does nothing without a shot', () => {
    const player = new Player();
    const w = wave(['D']);
    expect(() => resolveCollisions(player, w)).not.toThrow();
    expect(w.enemies[0]!.state).toBe('formation');
  });

  it('keeps a shot that misses', () => {
    const { player, shot } = playerWithShot(100);
    const w = wave(['D']);
    resolveCollisions(player, w);
    expect(player.shot).toBe(shot);
    expect(w.enemies[0]!.state).toBe('formation');
  });

  it('kills the enemy it hits and removes the shot', () => {
    // One column: the drone is at x = 122 … 132, y = 34 … 42.
    const w = wave(['D']);
    expect(w.enemies[0]!.x).toBe(122);
    expect(w.enemies[0]!.y).toBe(34);
    const { player } = playerWithShot(38);
    resolveCollisions(player, w);
    expect(w.enemies[0]!.state).toBe('exploding');
    expect(player.shot).toBeNull();
  });

  it('does not hit on touching edges', () => {
    const w = wave(['D']);
    const { player, shot } = playerWithShot(42);
    resolveCollisions(player, w);
    expect(w.enemies[0]!.state).toBe('formation');
    expect(player.shot).toBe(shot);
  });

  it('kills the lowest enemy, by y + height, not by index', () => {
    for (const [y0, y1, killed] of [
      [100, 101, 1],
      [101, 100, 0],
    ] as const) {
      const w = wave(['DD']);
      const [a, b] = [w.enemies[0]!, w.enemies[1]!];
      a.x = 122;
      b.x = 122;
      a.y = y0;
      b.y = y1;
      const { player } = playerWithShot(104);
      resolveCollisions(player, w);
      expect(w.enemies[killed]!.state).toBe('exploding');
      expect(w.enemies[1 - killed]!.state).toBe('formation');
      expect(player.shot).toBeNull();
    }
  });

  it('kills the smaller index on a tie', () => {
    const w = wave(['DD']);
    for (const e of w.enemies) {
      e.x = 122;
      e.y = 100;
    }
    const { player } = playerWithShot(104);
    resolveCollisions(player, w);
    expect(w.enemies[0]!.state).toBe('exploding');
    expect(w.enemies[1]!.state).toBe('formation');
  });

  it('kills exactly one of two overlapping enemies', () => {
    const w = wave(['DD']);
    w.enemies[0]!.x = 122;
    w.enemies[0]!.y = 98;
    w.enemies[1]!.x = 124;
    w.enemies[1]!.y = 100;
    const { player } = playerWithShot(104);
    resolveCollisions(player, w);
    expect(w.enemies.filter((e) => e.state === 'exploding')).toHaveLength(1);
  });

  it('ignores an exploding enemy', () => {
    const w = wave(['D']);
    const enemy = w.enemies[0]!;
    enemy.kill();
    enemy.update(TICK_SECONDS, ENV);
    const { player, shot } = playerWithShot(38);
    resolveCollisions(player, w);
    expect(player.shot).toBe(shot);
    expect(enemy.state).toBe('exploding');
    expect(enemy.stateTicks).toBe(1);
  });

  it('passes an exploding lower enemy and kills the alive one above', () => {
    const w = wave(['DD']);
    const [upper, lower] = [w.enemies[0]!, w.enemies[1]!];
    upper.x = 122;
    upper.y = 99;
    lower.x = 122;
    lower.y = 100;
    lower.kill();
    const { player } = playerWithShot(104);
    resolveCollisions(player, w);
    expect(upper.state).toBe('exploding');
    expect(lower.stateTicks).toBe(0);
    expect(player.shot).toBeNull();
  });

  it('kills a diving enemy', () => {
    const w = wave(['D']);
    const enemy = w.enemies[0]!;
    enemy.startDive(diveOrder());
    enemy.x = 122;
    enemy.y = 100;
    const { player } = playerWithShot(104);
    resolveCollisions(player, w);
    expect(enemy.state).toBe('exploding');
    expect(enemy.sortieId).toBeNull();
    expect(player.shot).toBeNull();
  });

  it('kills a returning enemy', () => {
    const w = wave(['D']);
    const enemy = w.enemies[0]!;
    enemy.startDive(diveOrder());
    for (let i = 0; i < 20; i++) enemy.update(TICK_SECONDS, ENV);
    enemy.y = SCREEN_HEIGHT - 1;
    enemy.update(TICK_SECONDS, ENV);
    expect(enemy.state).toBe('returning');
    enemy.x = 122;
    enemy.y = 100;
    const { player } = playerWithShot(104);
    resolveCollisions(player, w);
    expect(enemy.state).toBe('exploding');
    expect(enemy.sortieId).toBeNull();
    expect(player.shot).toBeNull();
  });
});

/** Enemy i of the wave diving, moved to (x, y). */
function divingAt(w: Wave, i: number, x: number, y: number): Enemy {
  const enemy = w.enemies[i]!;
  enemy.startDive(diveOrder());
  enemy.x = x;
  enemy.y = y;
  return enemy;
}

/** Enemy i of the wave returning to the formation, moved to (x, y). */
function returningAt(w: Wave, i: number, x: number, y: number): Enemy {
  const enemy = w.enemies[i]!;
  enemy.startDive(diveOrder());
  for (let t = 0; t < 20; t++) enemy.update(TICK_SECONDS, ENV);
  enemy.y = SCREEN_HEIGHT - 1;
  enemy.update(TICK_SECONDS, ENV);
  expect(enemy.state).toBe('returning');
  enemy.x = x;
  enemy.y = y;
  return enemy;
}

// The default ship: x = 120, y = 208, 15 x 16 (120 … 135 x 208 … 224). A drone is 11 x 8.
describe('resolveCollisions ram', () => {
  it('a diving enemy rams the ship without a player shot', () => {
    const w = wave(['D']);
    const enemy = divingAt(w, 0, 122, 205);
    const player = new Player();
    resolveCollisions(player, w);
    expect(enemy.state).toBe('exploding');
    expect(player.state).toBe('down');
  });

  it('a returning enemy rams the ship', () => {
    const w = wave(['D']);
    const enemy = returningAt(w, 0, 122, 205);
    const player = new Player();
    resolveCollisions(player, w);
    expect(enemy.state).toBe('exploding');
    expect(player.state).toBe('down');
  });

  it('an enemy in formation does not ram', () => {
    const w = wave(['D']);
    const enemy = w.enemies[0]!;
    enemy.x = 122;
    enemy.y = 205;
    const player = new Player();
    resolveCollisions(player, w);
    expect(enemy.state).toBe('formation');
    expect(player.state).toBe('active');
  });

  it('exploding and dead enemies do not ram', () => {
    const w = wave(['D']);
    const exploding = divingAt(w, 0, 122, 205);
    exploding.kill();
    const player = new Player();
    resolveCollisions(player, w);
    expect(player.state).toBe('active');
    expect(exploding.stateTicks).toBe(0);

    const w2 = wave(['D']);
    const dead = w2.enemies[0]!;
    dead.kill();
    for (let t = 0; t < EXPLOSION_TICKS; t++) dead.update(TICK_SECONDS, ENV);
    expect(dead.state).toBe('dead');
    dead.x = 122;
    dead.y = 205;
    resolveCollisions(player, w2);
    expect(player.state).toBe('active');
    expect(dead.state).toBe('dead');
  });

  it('touching edges do not ram, a 1 px overlap does', () => {
    for (const [x, y] of [
      [122, 200],
      [109, 205],
    ] as const) {
      const w = wave(['D']);
      const enemy = divingAt(w, 0, x, y);
      const player = new Player();
      resolveCollisions(player, w);
      expect(enemy.state).toBe('diving');
      expect(player.state).toBe('active');
    }
    const w = wave(['D']);
    const enemy = divingAt(w, 0, 122, 201);
    const player = new Player();
    resolveCollisions(player, w);
    expect(enemy.state).toBe('exploding');
    expect(player.state).toBe('down');
  });

  it('no ram while the ship is down or invulnerable', () => {
    const down = new Player();
    down.hit();
    const invulnerable = new Player();
    invulnerable.hit();
    for (let t = 0; t < DOWN_TICKS; t++) invulnerable.update(TICK_SECONDS, IDLE);
    expect(invulnerable.state).toBe('invulnerable');
    for (const player of [down, invulnerable]) {
      const w = wave(['D']);
      const enemy = divingAt(w, 0, player.ship.x + 2, 205);
      const state = player.state;
      resolveCollisions(player, w);
      expect(enemy.state).toBe('diving');
      expect(player.state).toBe(state);
    }
  });

  it('only the first of two overlapping divers rams', () => {
    const w = wave(['DD']);
    const first = divingAt(w, 0, 122, 205);
    const second = divingAt(w, 1, 122, 205);
    const player = new Player();
    resolveCollisions(player, w);
    expect(first.state).toBe('exploding');
    expect(second.state).toBe('diving');
    expect(player.state).toBe('down');
  });

  it('an enemy shot down this tick does not ram', () => {
    const w = wave(['D']);
    // 203 … 211 overlaps the ship; the shot (column 127, 204 … 208) is inside the enemy.
    const enemy = divingAt(w, 0, 122, 203);
    const { player } = playerWithShot(204);
    resolveCollisions(player, w);
    expect(enemy.state).toBe('exploding');
    expect(player.shot).toBeNull();
    expect(player.state).toBe('active');
  });
});

/** Peel length, ticks. */
const P = PEEL_SEGMENTS.reduce((sum, s) => sum + s.ticks, 0);

/**
 * Wave of n drones in one row: all dive with one shot and stand at x = enemyX on the first
 * descend tick, so every shot is in column floor(enemyX) + 5. Returns the wave after tick D.
 */
function waveWithShots(n: number, enemyX = 120): Wave {
  const w = wave(['D'.repeat(n)]);
  for (const e of w.enemies) e.startDive(diveOrder({ shots: 1 }));
  for (let t = 0; t < P; t++) w.update(TICK_SECONDS, null);
  for (const e of w.enemies) e.x = enemyX;
  w.update(TICK_SECONDS, null);
  expect(w.shots).toHaveLength(n);
  return w;
}

// Shots from waveWithShots() fly in column 125, inside the default ship (120 … 135).
describe('resolveCollisions enemy shots', () => {
  it('an enemy shot hits the ship and is removed', () => {
    const w = waveWithShots(1);
    w.shots[0]!.y = 205; // 205 … 209 crosses 208
    const player = new Player();
    resolveCollisions(player, w);
    expect(w.shots).toHaveLength(0);
    expect(player.state).toBe('down');
  });

  it('touching edges do not hit', () => {
    const above = waveWithShots(1);
    above.shots[0]!.y = 204; // bottom = 208
    const p1 = new Player();
    resolveCollisions(p1, above);
    expect(above.shots).toHaveLength(1);
    expect(p1.state).toBe('active');

    const side = waveWithShots(1);
    side.shots[0]!.y = 210;
    const p2 = new Player();
    p2.ship.x = 110; // 110 … 125: column 125 is outside
    resolveCollisions(p2, side);
    expect(side.shots).toHaveLength(1);
    expect(p2.state).toBe('active');

    const inside = waveWithShots(1);
    inside.shots[0]!.y = 210;
    const p3 = new Player();
    p3.ship.x = 111;
    resolveCollisions(p3, inside);
    expect(inside.shots).toHaveLength(0);
    expect(p3.state).toBe('down');
  });

  it('enemy shots pass through the ship while it is down or invulnerable', () => {
    const down = new Player();
    down.hit();
    const invulnerable = new Player();
    invulnerable.hit();
    for (let t = 0; t < DOWN_TICKS; t++) invulnerable.update(TICK_SECONDS, IDLE);
    expect(invulnerable.state).toBe('invulnerable');
    for (const player of [down, invulnerable]) {
      const w = waveWithShots(1);
      w.shots[0]!.y = 205;
      const { state, stateTicks } = player;
      resolveCollisions(player, w);
      expect(w.shots).toHaveLength(1);
      expect(player.state).toBe(state);
      expect(player.stateTicks).toBe(stateTicks);
    }
  });

  it('only the first overlapping shot hits; the second stays', () => {
    const w = waveWithShots(2);
    const [first, second] = [...w.shots];
    first!.y = 205;
    second!.y = 205;
    const player = new Player();
    resolveCollisions(player, w);
    expect(w.shots).toHaveLength(1);
    expect(w.shots[0]).toBe(second);
    expect(player.state).toBe('down');
  });

  it('a shot and a ram on the same tick hit the ship once; the rammer survives', () => {
    const w = waveWithShots(1);
    w.shots[0]!.y = 205;
    const enemy = w.enemies[0]!;
    expect(enemy.state).toBe('diving');
    enemy.x = 122;
    enemy.y = 205;
    const player = new Player();
    resolveCollisions(player, w);
    expect(w.shots).toHaveLength(0);
    expect(player.state).toBe('down');
    expect(enemy.state).toBe('diving');
  });

  it('player and enemy shots do not interact', () => {
    const w = waveWithShots(1, 122); // enemy shot in column 127
    const enemyShot = w.shots[0]!;
    enemyShot.y = 100;
    w.enemies[0]!.y = 40;
    const { player, shot } = playerWithShot(100); // column 127, same Y
    resolveCollisions(player, w);
    expect(w.shots).toEqual([enemyShot]);
    expect(player.shot).toBe(shot);
    expect(player.state).toBe('active');
  });
});
