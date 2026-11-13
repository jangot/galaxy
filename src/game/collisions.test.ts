import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT, TICK_SECONDS } from '../config';
import { createRng } from '../engine/rng';
import { BonusField } from './bonus-field';
import { CAPSULE_SIZE } from './capsule';
import { overlaps, resolveBonusCollisions, resolveCollisions } from './collisions';
import type { Enemy, EnemyEnv } from './enemy';
import { EXPLOSION_TICKS, PEEL_SEGMENTS } from './enemy';
import { Player, START_SHIELD } from './player';
import { SHIP_Y } from './ship';
import type { Shot } from './shot';
import { diveOrder, passiveLevel } from './test-levels';
import { Wave } from './wave';
import { onlyShot } from './test-shots';

const FIRE = { move: 0, fire: true } as const;
const ENV: EnemyEnv = { diveSpeed: 60, targetX: null };

function rect(x: number, y: number, width: number, height: number) {
  return { x, y, width, height };
}

/** Player with the default ship (x = 120): the shot flies in column x = 127. */
function playerWithShot(y: number): { player: Player; shot: Shot } {
  const player = new Player();
  player.update(TICK_SECONDS, FIRE);
  const shot = onlyShot(player);
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
    expect(onlyShot(player)).toBe(shot);
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
    expect(onlyShot(player)).toBeNull();
  });

  it('does not hit on touching edges', () => {
    const w = wave(['D']);
    const { player, shot } = playerWithShot(42);
    resolveCollisions(player, w);
    expect(w.enemies[0]!.state).toBe('formation');
    expect(onlyShot(player)).toBe(shot);
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
      expect(onlyShot(player)).toBeNull();
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
    expect(onlyShot(player)).toBe(shot);
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
    expect(onlyShot(player)).toBeNull();
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
    expect(onlyShot(player)).toBeNull();
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
    expect(onlyShot(player)).toBeNull();
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

describe('resolveCollisions kills', () => {
  it('returns no kills without a hit', () => {
    expect(resolveCollisions(new Player(), wave(['D']))).toEqual([]);
    const { player } = playerWithShot(100);
    expect(resolveCollisions(player, wave(['D']))).toEqual([]);
  });

  it('reports a formation kill', () => {
    const w = wave(['D']);
    const { player } = playerWithShot(38);
    expect(resolveCollisions(player, w)).toEqual([{ kind: 'drone', inFlight: false }]);
  });

  it.each([
    ['S', 'striker'],
    ['R', 'raider'],
  ] as const)('reports the kind of the enemy (%s -> %s)', (c, kind) => {
    const w = wave([c]);
    w.enemies[0]!.x = 122;
    w.enemies[0]!.y = 100;
    const { player } = playerWithShot(104);
    expect(resolveCollisions(player, w)).toEqual([{ kind, inFlight: false }]);
  });

  it('reports a diving kill as in flight', () => {
    const w = wave(['D']);
    divingAt(w, 0, 122, 100);
    const { player } = playerWithShot(104);
    expect(resolveCollisions(player, w)).toEqual([{ kind: 'drone', inFlight: true }]);
  });

  it('reports a returning kill as in flight', () => {
    const w = wave(['D']);
    returningAt(w, 0, 122, 100);
    const { player } = playerWithShot(104);
    expect(resolveCollisions(player, w)).toEqual([{ kind: 'drone', inFlight: true }]);
  });
});

// The default ship: x = 120, y = 208, 15 x 16 (120 … 135 x 208 … 224). A drone is 11 x 8.
describe('resolveCollisions ram', () => {
  it('a diving enemy rams the ship without a player shot', () => {
    const w = wave(['D']);
    const enemy = divingAt(w, 0, 122, 205);
    const player = new Player();
    resolveCollisions(player, w);
    expect(enemy.state).toBe('exploding');
    expect(player.state).toBe('invulnerable');
    expect(player.shield).toBe(START_SHIELD - 1);
  });

  it('a returning enemy rams the ship', () => {
    const w = wave(['D']);
    const enemy = returningAt(w, 0, 122, 205);
    const player = new Player();
    resolveCollisions(player, w);
    expect(enemy.state).toBe('exploding');
    expect(player.state).toBe('invulnerable');
    expect(player.shield).toBe(START_SHIELD - 1);
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
    expect(player.state).toBe('invulnerable');
    expect(player.shield).toBe(START_SHIELD - 1);
  });

  it('no ram while the ship is down or invulnerable', () => {
    const down = new Player(undefined, 0);
    down.hit();
    const invulnerable = new Player();
    invulnerable.hit();
    expect(invulnerable.state).toBe('invulnerable');
    for (const player of [down, invulnerable]) {
      const w = wave(['D']);
      const enemy = divingAt(w, 0, player.ship.x + 2, 205);
      const { state, shield } = player;
      resolveCollisions(player, w);
      expect(enemy.state).toBe('diving');
      expect(player.state).toBe(state);
      expect(player.shield).toBe(shield);
    }
  });

  it('a ram at shield 0 puts the ship down, the rammer explodes', () => {
    const w = wave(['D']);
    const enemy = divingAt(w, 0, 122, 205);
    const player = new Player(undefined, 0);
    resolveCollisions(player, w);
    expect(enemy.state).toBe('exploding');
    expect(player.state).toBe('down');
  });

  it('only the first of two overlapping divers rams', () => {
    const w = wave(['DD']);
    const first = divingAt(w, 0, 122, 205);
    const second = divingAt(w, 1, 122, 205);
    const player = new Player();
    resolveCollisions(player, w);
    expect(first.state).toBe('exploding');
    expect(second.state).toBe('diving');
    expect(player.state).toBe('invulnerable');
    expect(player.shield).toBe(START_SHIELD - 1);
  });

  it('an enemy shot down this tick does not ram', () => {
    const w = wave(['D']);
    // 203 … 211 overlaps the ship; the shot (column 127, 204 … 208) is inside the enemy.
    const enemy = divingAt(w, 0, 122, 203);
    const { player } = playerWithShot(204);
    const kills = resolveCollisions(player, w);
    expect(kills).toEqual([{ kind: 'drone', inFlight: true }]);
    expect(enemy.state).toBe('exploding');
    expect(onlyShot(player)).toBeNull();
    expect(player.state).toBe('active');
  });

  it('reports a ram as an in-flight kill', () => {
    const w = wave(['S']);
    divingAt(w, 0, 122, 205);
    const player = new Player();
    expect(resolveCollisions(player, w)).toEqual([{ kind: 'striker', inFlight: true }]);
    expect(player.state).toBe('invulnerable');
    expect(player.shield).toBe(START_SHIELD - 1);
  });

  it('reports a shot kill and a ram in one tick, shot first', () => {
    const w = wave(['RD']);
    const shotDown = w.enemies[0]!;
    shotDown.x = 122;
    shotDown.y = 100;
    // The shot (y 104 … 108) is far above the rammer (y 205 …).
    const rammer = divingAt(w, 1, 122, 205);
    const { player } = playerWithShot(104);
    expect(resolveCollisions(player, w)).toEqual([
      { kind: 'raider', inFlight: false },
      { kind: 'drone', inFlight: true },
    ]);
    expect(shotDown.state).toBe('exploding');
    expect(rammer.state).toBe('exploding');
    expect(player.state).toBe('invulnerable');
    expect(player.shield).toBe(START_SHIELD - 1);
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
    expect(resolveCollisions(player, w)).toEqual([]); // enemy shots kill no enemies
    expect(w.shots).toHaveLength(0);
    expect(player.state).toBe('invulnerable');
    expect(player.shield).toBe(START_SHIELD - 1);
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
    expect(p3.state).toBe('invulnerable');
    expect(p3.shield).toBe(START_SHIELD - 1);
  });

  it('enemy shots pass through the ship while it is down or invulnerable', () => {
    const down = new Player(undefined, 0);
    down.hit();
    const invulnerable = new Player();
    invulnerable.hit();
    expect(invulnerable.state).toBe('invulnerable');
    for (const player of [down, invulnerable]) {
      const w = waveWithShots(1);
      w.shots[0]!.y = 205;
      const { state, stateTicks, shield } = player;
      resolveCollisions(player, w);
      expect(w.shots).toHaveLength(1);
      expect(player.state).toBe(state);
      expect(player.stateTicks).toBe(stateTicks);
      expect(player.shield).toBe(shield);
    }
  });

  it('an enemy shot at shield 0 puts the ship down', () => {
    const w = waveWithShots(1);
    w.shots[0]!.y = 205;
    const player = new Player(undefined, 0);
    resolveCollisions(player, w);
    expect(w.shots).toHaveLength(0);
    expect(player.state).toBe('down');
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
    expect(player.state).toBe('invulnerable');
    expect(player.shield).toBe(START_SHIELD - 1);
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
    expect(player.state).toBe('invulnerable');
    expect(player.shield).toBe(START_SHIELD - 1);
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
    expect(onlyShot(player)).toBe(shot);
    expect(player.state).toBe('active');
  });
});

/**
 * doubleShot player with two shots at height y: the older one in column 127 (ship x = 120),
 * the younger one in column 67 (ship moved to x = 60).
 */
function playerWithTwoShots(y: number): { player: Player; older: Shot; younger: Shot } {
  const player = new Player();
  player.grantPowerUp('doubleShot');
  player.update(TICK_SECONDS, FIRE);
  player.ship.x = 60;
  player.update(TICK_SECONDS, FIRE);
  const [older, younger] = player.shots;
  if (!older || !younger) throw new Error('expected two shots');
  older.y = y;
  younger.y = y;
  return { player, older, younger };
}

describe('resolveCollisions with two player shots', () => {
  it('both shots hit two targets in one tick, kills in shots order', () => {
    // Enemy 1 is under the older shot, enemy 0 under the younger one.
    const w = wave(['SD']);
    const [striker, drone] = [w.enemies[0]!, w.enemies[1]!];
    striker.x = 62;
    striker.y = 100;
    drone.x = 122;
    drone.y = 100;
    const { player, older, younger } = playerWithTwoShots(104);
    expect(older.x).toBe(127);
    expect(younger.x).toBe(67);
    const kills = resolveCollisions(player, w);
    expect(kills).toEqual([
      { kind: 'drone', inFlight: false },
      { kind: 'striker', inFlight: false },
    ]);
    expect(striker.state).toBe('exploding');
    expect(drone.state).toBe('exploding');
    expect(player.shots).toEqual([]);
  });

  it('two shots over one enemy: the older one kills it, the younger one flies on', () => {
    const w = wave(['D']);
    const enemy = w.enemies[0]!;
    enemy.x = 122;
    enemy.y = 98;
    const player = new Player();
    player.grantPowerUp('doubleShot');
    player.update(TICK_SECONDS, FIRE);
    player.update(TICK_SECONDS, FIRE);
    const [older, younger] = player.shots;
    older!.y = 100;
    younger!.y = 102;
    const kills = resolveCollisions(player, w);
    expect(kills).toEqual([{ kind: 'drone', inFlight: false }]);
    expect(enemy.state).toBe('exploding');
    expect(player.shots).toEqual([younger]);
  });

  it('reports up to three kills in one tick: two shots, then a ram', () => {
    const w = wave(['DDS']);
    const [a, b] = [w.enemies[0]!, w.enemies[1]!];
    a.x = 122;
    a.y = 100;
    b.x = 62;
    b.y = 100;
    const { player } = playerWithTwoShots(104);
    // The ship is at x = 60 now: the striker dives onto it.
    divingAt(w, 2, player.ship.x + 2, 205);
    const kills = resolveCollisions(player, w);
    expect(kills).toEqual([
      { kind: 'drone', inFlight: false },
      { kind: 'drone', inFlight: false },
      { kind: 'striker', inFlight: true },
    ]);
    expect(player.shots).toEqual([]);
    expect(player.state).toBe('invulnerable');
    expect(player.shield).toBe(START_SHIELD - 1);
  });
});

/** A field whose asteroid has just spawned (window 1...1, rng 0), moved to (x, y). */
function fieldWithAsteroid(x: number, y: number): BonusField {
  const field = new BonusField(() => 0, { minTicks: 1, maxTicks: 1 });
  field.startLevel();
  field.update(TICK_SECONDS, true);
  const asteroid = field.asteroid!;
  asteroid.x = x;
  asteroid.y = y;
  return field;
}

/** A field with a capsule over the default ship (x = 120 … 134, y = 208 … 223). */
function fieldWithCapsuleAt(y: number): BonusField {
  const field = fieldWithAsteroid(122, 100);
  field.hitAsteroid(); // capsule at x = 124, y = 102
  field.capsule!.y = y;
  return field;
}

describe('resolveBonusCollisions', () => {
  // The shot flies in column 127: an asteroid at x = 122 (122 … 133) covers it, at 128 not.
  it('a shot over the flying asteroid breaks it and is removed', () => {
    const field = fieldWithAsteroid(122, 100);
    const { player } = playerWithShot(104);
    expect(resolveBonusCollisions(player, field)).toEqual({
      asteroidBroken: true,
      collected: null,
    });
    expect(player.shots).toEqual([]);
    expect(field.asteroid!.state).toBe('exploding');
  });

  it('a miss keeps the shot and the asteroid', () => {
    const field = fieldWithAsteroid(128, 100);
    const { player, shot } = playerWithShot(104);
    expect(resolveBonusCollisions(player, field)).toEqual({
      asteroidBroken: false,
      collected: null,
    });
    expect(onlyShot(player)).toBe(shot);
    expect(field.asteroid!.state).toBe('flying');
  });

  it('does nothing without an asteroid', () => {
    const field = new BonusField(() => 0);
    field.startLevel();
    const { player, shot } = playerWithShot(104);
    expect(resolveBonusCollisions(player, field)).toEqual({
      asteroidBroken: false,
      collected: null,
    });
    expect(onlyShot(player)).toBe(shot);
  });

  it('an exploding asteroid lets the shot fly on', () => {
    const field = fieldWithAsteroid(122, 100);
    field.asteroid!.hit();
    const { player, shot } = playerWithShot(104);
    expect(resolveBonusCollisions(player, field).asteroidBroken).toBe(false);
    expect(onlyShot(player)).toBe(shot);
  });

  it('two shots over it: the older one breaks it, the younger one flies on', () => {
    const field = fieldWithAsteroid(122, 98);
    const player = new Player();
    player.grantPowerUp('doubleShot');
    player.update(TICK_SECONDS, FIRE);
    player.update(TICK_SECONDS, FIRE);
    const [older, younger] = player.shots;
    older!.y = 100;
    younger!.y = 102;
    expect(resolveBonusCollisions(player, field).asteroidBroken).toBe(true);
    expect(player.shots).toEqual([younger]);
  });

  it('an enemy goes first: a shot that killed it cannot hit the asteroid', () => {
    const w = wave(['D']);
    const enemy = w.enemies[0]!;
    enemy.x = 122;
    enemy.y = 98;
    const field = fieldWithAsteroid(122, 98);
    const { player } = playerWithShot(100);
    expect(resolveCollisions(player, w)).toEqual([{ kind: 'drone', inFlight: false }]);
    expect(resolveBonusCollisions(player, field).asteroidBroken).toBe(false);
    expect(field.asteroid!.state).toBe('flying');
  });

  it('the ship never interacts with the asteroid', () => {
    const player = new Player();
    const field = fieldWithAsteroid(player.ship.x, SHIP_Y);
    expect(resolveBonusCollisions(player, field)).toEqual({
      asteroidBroken: false,
      collected: null,
    });
    expect(player.state).toBe('active');
    expect(player.shield).toBe(START_SHIELD);
    expect(field.asteroid!.state).toBe('flying');
  });

  // The bonus rng () => 0 gives every capsule here the kind 'shield'.
  it('the active ship catches a capsule over it', () => {
    const player = new Player();
    const field = fieldWithCapsuleAt(SHIP_Y);
    expect(resolveBonusCollisions(player, field)).toEqual({
      asteroidBroken: false,
      collected: 'shield',
    });
    expect(field.capsule).toBeNull();
  });

  it('the invulnerable ship catches it too', () => {
    const player = new Player();
    player.hit();
    expect(player.state).toBe('invulnerable');
    const field = fieldWithCapsuleAt(SHIP_Y);
    expect(resolveBonusCollisions(player, field).collected).toBe('shield');
    expect(field.capsule).toBeNull();
  });

  it('the ship that is down does not catch it', () => {
    const player = new Player(undefined, 0);
    player.hit();
    expect(player.state).toBe('down');
    const field = fieldWithCapsuleAt(SHIP_Y);
    const capsule = field.capsule;
    expect(resolveBonusCollisions(player, field).collected).toBeNull();
    expect(field.capsule).toBe(capsule);
  });

  it('touching edges do not catch; a 1 px overlap does', () => {
    const player = new Player();
    const touching = fieldWithCapsuleAt(SHIP_Y - CAPSULE_SIZE);
    const capsule = touching.capsule;
    expect(resolveBonusCollisions(player, touching).collected).toBeNull();
    expect(touching.capsule).toBe(capsule);

    const overlapping = fieldWithCapsuleAt(SHIP_Y - CAPSULE_SIZE + 1);
    expect(resolveBonusCollisions(player, overlapping).collected).toBe('shield');
    expect(overlapping.capsule).toBeNull();
  });

  it('an asteroid broken at the ship height gives its capsule in the same call', () => {
    const field = fieldWithAsteroid(122, 200);
    const { player } = playerWithShot(204);
    // The capsule drops at y = 202: 202 + 8 > SHIP_Y = 208.
    expect(resolveBonusCollisions(player, field)).toEqual({
      asteroidBroken: true,
      collected: 'shield',
    });
    expect(field.capsule).toBeNull();
    expect(player.shots).toEqual([]);
  });

  it('a player shot passes through the capsule', () => {
    const field = fieldWithCapsuleAt(100); // x = 124 … 131 covers the shot column 127
    const capsule = field.capsule;
    expect(field.asteroid!.state).toBe('exploding');
    const { player, shot } = playerWithShot(102);
    expect(resolveBonusCollisions(player, field)).toEqual({
      asteroidBroken: false,
      collected: null,
    });
    expect(onlyShot(player)).toBe(shot);
    expect(field.capsule).toBe(capsule);
  });
});
