import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT, TICK_SECONDS } from '../config';
import type { Rng } from '../engine/rng';
import { createRng } from '../engine/rng';
import type { Asteroid } from './asteroid';
import { ASTEROID_SIZE } from './asteroid';
import type { BattleOptions } from './battle';
import { Battle, GAME_OVER_DELAY_TICKS, LEVEL_PAUSE_TICKS } from './battle';
import type { BonusKind } from './bonus';
import { BONUS_KINDS } from './bonus';
import { ASTEROID_SPAWN_MIN_TICKS } from './bonus-field';
import { CAPSULE_SIZE } from './capsule';
import { EXPLOSION_TICKS, PEEL_SEGMENTS, STRIKER_TURN_TICKS } from './enemy';
import { LEVELS } from './levels';
import type { PlayerIntent } from './player';
import { DOWN_TICKS, MAX_LIVES, START_LIVES } from './player';
import { asteroidPoints, BONUS_FALLBACK_POINTS, killPoints } from './score';
import { SHIP_SPEED, SHIP_WIDTH, SHIP_Y } from './ship';
import type { Shot } from './shot';
import { FAST_SHOT_SPEED } from './shot';
import { diveOrder, ONE_CORNER_ENEMY, passiveLevel, TWO_LEVELS } from './test-levels';
import { onlyShot } from './test-shots';

const IDLE: PlayerIntent = { move: 0, fire: false };
const FIRE: PlayerIntent = { move: 0, fire: true };

function run(battle: Battle, n: number, intent: PlayerIntent = IDLE): void {
  for (let i = 0; i < n; i++) battle.update(TICK_SECONDS, intent);
}

/** Kills every enemy and plays the explosions and the pause: the next level starts. */
function clearWave(battle: Battle): void {
  for (const e of battle.wave.enemies) e.kill();
  run(battle, EXPLOSION_TICKS + LEVEL_PAUSE_TICKS);
}

/** Puts a diving enemy onto the ship, with a margin against the peel step of this tick. */
function ramShip(battle: Battle): void {
  const enemy = battle.wave.enemies[0]!;
  enemy.startDive(diveOrder());
  enemy.x = battle.player.ship.x + 2;
  enemy.y = SHIP_Y + 2;
}

/** A one-enemy battle with a single life, already in over. */
function overBattle(): Battle {
  const battle = new Battle(createRng(1), { levels: ONE_CORNER_ENEMY, lives: 1 });
  battle.player.hit();
  run(battle, GAME_OVER_DELAY_TICKS);
  expect(battle.phase).toBe('over');
  return battle;
}

/**
 * Shoots down the ONE_CORNER_ENEMY drone in formation through update() (two ticks), as in
 * 'shoots down an enemy through update()'.
 */
function shootCornerEnemy(battle: Battle): void {
  battle.player.ship.x = 40; // shot column x = 47
  battle.update(TICK_SECONDS, FIRE);
  onlyShot(battle.player)!.y = 42;
  battle.update(TICK_SECONDS, FIRE);
  expect(battle.wave.enemies[0]!.state).toBe('exploding');
}

describe('Battle', () => {
  it('builds the wave from an injected level table', () => {
    const battle = new Battle(createRng(1), { levels: ONE_CORNER_ENEMY });
    expect(battle.wave.config).toBe(ONE_CORNER_ENEMY[0]);
    expect(battle.wave.enemies).toHaveLength(1);
    const enemy = battle.wave.enemies[0]!;
    expect(enemy.kind).toBe('drone');
    expect(enemy.slot).toMatchObject({ row: 0, col: 0 });
    // baseX = 40 for 11 columns, plus centering an 11×8 sprite in a 16×12 cell.
    expect(enemy.x).toBe(42);
    expect(enemy.y).toBe(34);
  });

  it('defaults to LEVELS', () => {
    const battle = new Battle(createRng(1));
    expect(battle.wave.config).toBe(LEVELS[0]);
    expect(battle.wave.enemies).toHaveLength(28);
  });

  it('moves the player and sways the wave', () => {
    const battle = new Battle(createRng(1));
    const x0 = battle.player.ship.x;
    const before = battle.wave.enemies.map((e) => [e.x, e.y] as const);
    battle.update(TICK_SECONDS, { move: 1, fire: false });
    expect(battle.player.ship.x).toBe(x0 + SHIP_SPEED * TICK_SECONDS);
    const step = LEVELS[0]!.swaySpeed * TICK_SECONDS;
    expect(battle.wave.enemies.map((e) => [e.x, e.y])).toEqual(
      before.map(([x, y]) => [x + step, y]),
    );
  });

  it('delegates firing to the player', () => {
    const battle = new Battle(createRng(1));
    battle.update(TICK_SECONDS, { move: 0, fire: true });
    expect(onlyShot(battle.player)).not.toBeNull();
  });
});

describe('Battle levels and phases', () => {
  it('starts on level 1, playing', () => {
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
    expect(battle.level).toBe(1);
    expect(battle.phase).toBe('playing');
    expect(battle.wave.config).toBe(TWO_LEVELS[0]);
  });

  it('starts from startLevel', () => {
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS, startLevel: 2 });
    expect(battle.level).toBe(2);
    expect(battle.wave.config).toBe(TWO_LEVELS[1]);
  });

  it('starts past the end of the table on the escalated last level', () => {
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS, startLevel: 5 });
    expect(battle.level).toBe(5);
    expect(battle.wave.config).toEqual({
      ...TWO_LEVELS[1]!,
      firstDiveDelayTicks: 1_000_000 - 18,
      diveIntervalTicks: 1_000_000 - 18,
    });
  });

  it('enters cleared on the tick the last explosion ends', () => {
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
    battle.wave.enemies[0]!.kill();
    run(battle, EXPLOSION_TICKS - 1);
    expect(battle.phase).toBe('playing');
    run(battle, 1);
    expect(battle.phase).toBe('cleared');
    expect(battle.level).toBe(1);
  });

  it('starts the next level exactly LEVEL_PAUSE_TICKS later', () => {
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
    battle.wave.enemies[0]!.kill();
    run(battle, EXPLOSION_TICKS);
    const oldWave = battle.wave;
    run(battle, LEVEL_PAUSE_TICKS - 1);
    expect(battle.phase).toBe('cleared');
    expect(battle.level).toBe(1);
    expect(battle.wave).toBe(oldWave);

    run(battle, 1);
    expect(battle.phase).toBe('playing');
    expect(battle.level).toBe(2);
    const { wave } = battle;
    expect(wave).not.toBe(oldWave);
    expect(wave.config).toBe(TWO_LEVELS[1]);
    expect(wave.enemies).toHaveLength(2);
    // Drawn this tick at the start positions; the first update comes next tick.
    expect(wave.formation.offset).toBe(0);
    for (const e of wave.enemies) {
      expect(e.state).toBe('formation');
      expect(e.x).toBe(wave.formation.slotX(e.slot.col, e.width));
      expect(e.y).toBe(wave.formation.slotY(e.slot.row, e.height));
    }
    run(battle, 1);
    expect(wave.formation.offset).toBe(0.25);
  });

  it('escalates the last level past the end of the table', () => {
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
    clearWave(battle);
    const second = battle.wave;
    clearWave(battle);
    expect(battle.level).toBe(3);
    expect(battle.phase).toBe('playing');
    expect(battle.wave.config).toEqual({
      ...TWO_LEVELS[1]!,
      firstDiveDelayTicks: 1_000_000 - 6,
      diveIntervalTicks: 1_000_000 - 6,
    });
    expect(battle.wave).not.toBe(second);
  });

  it('lets the player move and fire while cleared', () => {
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
    battle.wave.enemies[0]!.kill();
    run(battle, EXPLOSION_TICKS);
    expect(battle.phase).toBe('cleared');
    const x0 = battle.player.ship.x;
    battle.update(TICK_SECONDS, { move: 1, fire: true });
    expect(battle.player.ship.x).toBe(x0 + SHIP_SPEED * TICK_SECONDS);
    const shot = onlyShot(battle.player);
    expect(shot).not.toBeNull();
    const y0 = shot!.y;
    run(battle, 1);
    expect(onlyShot(battle.player)).toBe(shot);
    expect(shot!.y).toBeLessThan(y0);
  });

  it('shoots down an enemy through update()', () => {
    const battle = new Battle(createRng(1), { levels: ONE_CORNER_ENEMY });
    const enemy = battle.wave.enemies[0]!;
    battle.player.ship.x = 40; // shot column x = 47
    battle.update(TICK_SECONDS, FIRE);
    const shot = onlyShot(battle.player);
    expect(shot).not.toBeNull();
    expect(shot!.x).toBe(47);
    shot!.y = 42; // touches the enemy's bottom (y = 34 … 42): no hit yet
    // Fire is ignored: the shot is in flight. It moves to y = 38 and hits the enemy,
    // which sits at x = 42 … 52 with offset 0.5.
    battle.update(TICK_SECONDS, FIRE);
    expect(onlyShot(battle.player)).toBeNull();
    expect(enemy.state).toBe('exploding');
    expect(enemy.stateTicks).toBe(0);
    // The slot is free from the next tick.
    battle.update(TICK_SECONDS, FIRE);
    expect(onlyShot(battle.player)).not.toBeNull();
    expect(onlyShot(battle.player)).not.toBe(shot);
  });
});

describe('Battle aim', () => {
  it("aims the wave at the ship's center", () => {
    const P = PEEL_SEGMENTS.reduce((sum, s) => sum + s.ticks, 0);
    const battle = new Battle(createRng(1), {
      levels: [passiveLevel(['S..........'], { firstDiveDelayTicks: 1 })],
    });
    // A flank striker first runs on / stands for about 15 ticks (inertia), then wobbles
    // within T - 1 px; the ram comes at about 165.
    run(battle, 1 + P + 160);
    const enemy = battle.wave.enemies[0]!;
    const ship = battle.player.ship;
    expect(enemy.state).toBe('diving');
    const enemyCenter = enemy.x + Math.floor(enemy.width / 2);
    const shipCenter = ship.x + Math.floor(SHIP_WIDTH / 2);
    expect(Math.abs(enemyCenter - shipCenter)).toBeLessThanOrEqual(STRIKER_TURN_TICKS - 1);
  });
});

describe('Battle ram', () => {
  const RAM_LEVEL = [passiveLevel(['S..........'], { firstDiveDelayTicks: 1 })];

  it('a diver touching the ship explodes and puts the ship down', () => {
    const battle = new Battle(createRng(1), { levels: RAM_LEVEL });
    const enemy = battle.wave.enemies[0]!;
    for (let i = 0; i < 10 && !enemy.isOut; i++) run(battle, 1);
    expect(enemy.isOut).toBe(true);
    const ship = battle.player.ship;
    // A margin against the up to 3 px peel step of this tick.
    enemy.x = ship.x + 2;
    enemy.y = SHIP_Y + 2;
    battle.update(TICK_SECONDS, IDLE);
    expect(enemy.state).toBe('exploding');
    expect(battle.player.state).toBe('down');
  });

  it('gives the wave no target while the ship is down', () => {
    const P = PEEL_SEGMENTS.reduce((sum, s) => sum + s.ticks, 0);
    const battle = new Battle(createRng(1), { levels: RAM_LEVEL });
    run(battle, 1 + P + 1);
    const enemy = battle.wave.enemies[0]!;
    expect(enemy.state).toBe('diving');
    battle.player.hit();
    run(battle, STRIKER_TURN_TICKS);
    const x = enemy.x;
    for (let i = 0; i < 10; i++) {
      run(battle, 1);
      expect(enemy.x).toBe(x);
    }
    expect(enemy.state).toBe('diving');
  });
});

describe('Battle enemy shots', () => {
  const P = PEEL_SEGMENTS.reduce((sum, s) => sum + s.ticks, 0);

  it('removes the enemy shots on entering cleared', () => {
    const battle = new Battle(createRng(1), { levels: ONE_CORNER_ENEMY });
    const enemy = battle.wave.enemies[0]!;
    enemy.startDive(diveOrder({ shots: 1 }));
    run(battle, P + 1);
    expect(battle.wave.shots).toHaveLength(1);
    enemy.kill();
    run(battle, EXPLOSION_TICKS - 1);
    expect(battle.phase).toBe('playing');
    expect(battle.wave.shots).toHaveLength(1);
    run(battle, 1);
    expect(battle.phase).toBe('cleared');
    expect(battle.wave.shots).toHaveLength(0);
    expect(battle.player.state).toBe('active');
  });

  it('an enemy shot puts the ship down through update()', () => {
    const battle = new Battle(createRng(1), { levels: ONE_CORNER_ENEMY });
    const enemy = battle.wave.enemies[0]!;
    enemy.startDive(diveOrder({ shots: 1 }));
    run(battle, P);
    // Center 127 = the ship's center (targetX): the drone does not steer.
    enemy.x = battle.player.ship.x + 2;
    let sawShot = false;
    for (let i = 0; i < 60 && battle.player.state === 'active'; i++) {
      run(battle, 1);
      if (battle.wave.shots.length > 0) sawShot = true;
    }
    expect(sawShot).toBe(true);
    expect(battle.player.state).toBe('down');
    expect(battle.wave.shots).toHaveLength(0);
    expect(enemy.state).toBe('diving');
  });
});

describe('Battle lives and game over', () => {
  it('passes opts.lives to the player', () => {
    expect(new Battle(createRng(1)).player.lives).toBe(START_LIVES);
    expect(new Battle(createRng(1), { lives: 1 }).player.lives).toBe(1);
    expect(() => new Battle(createRng(1), { lives: 0 })).toThrow(RangeError);
  });

  it('enters over exactly GAME_OVER_DELAY_TICKS after the last ship is hit', () => {
    const battle = new Battle(createRng(1), { levels: ONE_CORNER_ENEMY, lives: 1 });
    battle.player.hit();
    run(battle, GAME_OVER_DELAY_TICKS - 1);
    expect(battle.phase).toBe('playing');
    expect(battle.player.state).toBe('down');
    run(battle, 1);
    expect(battle.phase).toBe('over');
    expect(battle.phaseTicks).toBe(0);
  });

  it('does not enter over while lives are left', () => {
    const battle = new Battle(createRng(1), { levels: ONE_CORNER_ENEMY, lives: 2 });
    battle.player.hit();
    run(battle, GAME_OVER_DELAY_TICKS);
    expect(battle.phase).toBe('playing');
    expect(battle.player.state).toBe('invulnerable');
    expect(battle.player.lives).toBe(1);
  });

  it('ends the game, not the level, when the last ship rams the last enemy', () => {
    const battle = new Battle(createRng(1), { levels: ONE_CORNER_ENEMY, lives: 1 });
    const enemy = battle.wave.enemies[0]!;
    ramShip(battle);
    battle.update(TICK_SECONDS, IDLE);
    expect(enemy.state).toBe('exploding');
    expect(battle.player.isLost).toBe(true);
    run(battle, EXPLOSION_TICKS);
    expect(battle.phase).toBe('cleared');
    run(battle, GAME_OVER_DELAY_TICKS - EXPLOSION_TICKS - 1);
    expect(battle.phase).toBe('cleared');
    run(battle, 1);
    expect(battle.phase).toBe('over');
    expect(battle.level).toBe(1);
    const { wave } = battle;
    run(battle, LEVEL_PAUSE_TICKS * 2);
    expect(battle.phase).toBe('over');
    expect(battle.level).toBe(1);
    expect(battle.wave).toBe(wave);
  });

  it('has no collisions in over', () => {
    // In over the ship is down (cannot be hit) and has no shot, so disabled collisions are
    // indistinguishable from enabled ones through the public API: this pins the behavior.
    const battle = overBattle();
    const enemy = battle.wave.enemies[0]!;
    ramShip(battle);
    run(battle, 1);
    expect(enemy.isOut).toBe(true);
    expect(battle.phase).toBe('over');
    expect(battle.player.lives).toBe(0);
  });

  it('keeps the wave flying in over', () => {
    const battle = overBattle();
    const offset = battle.wave.formation.offset;
    run(battle, 1);
    expect(battle.wave.formation.offset).not.toBe(offset);
  });

  it('counts phaseTicks in every phase from 0 after each transition', () => {
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
    expect(battle.phaseTicks).toBe(0);
    run(battle, 5);
    expect(battle.phaseTicks).toBe(5);

    battle.wave.enemies[0]!.kill();
    run(battle, EXPLOSION_TICKS);
    expect(battle.phase).toBe('cleared');
    expect(battle.phaseTicks).toBe(0);
    run(battle, 1);
    expect(battle.phaseTicks).toBe(1);

    run(battle, LEVEL_PAUSE_TICKS - 1);
    expect(battle.phase).toBe('playing');
    expect(battle.level).toBe(2);
    expect(battle.phaseTicks).toBe(0);
    run(battle, 3);
    expect(battle.phaseTicks).toBe(3);
  });

  it('counts phaseTicks in over', () => {
    const battle = overBattle();
    expect(battle.phaseTicks).toBe(0);
    run(battle, 3);
    expect(battle.phaseTicks).toBe(3);
  });
});

// Extra-life tests reach 5000 with one kill: past the end of a passive table levelConfig
// only shrinks the 1_000_000-tick dive timers (still passive) and killPoints has no cap (В2),
// so a high startLevel gives exactly EXTRA_LIFE_FIRST in one kill without widening Battle's API.
/** A drone in formation is worth exactly 5000 here (1655 gives 4990). */
const DRONE_5000_LEVEL = 1656;
/** A rammed striker (in flight) is worth exactly 5000 here (615 gives 4990). */
const STRIKER_RAM_5000_LEVEL = 616;

describe('Battle score', () => {
  it('starts at 0', () => {
    expect(new Battle(createRng(1)).score).toBe(0);
  });

  it('adds formation points on the tick of the hit', () => {
    const battle = new Battle(createRng(1), { levels: ONE_CORNER_ENEMY });
    battle.player.ship.x = 40; // shot column x = 47
    battle.update(TICK_SECONDS, FIRE);
    expect(battle.score).toBe(0);
    onlyShot(battle.player)!.y = 42;
    battle.update(TICK_SECONDS, FIRE);
    expect(battle.wave.enemies[0]!.state).toBe('exploding');
    expect(battle.score).toBe(30);
  });

  it('adds in-flight points for a ram', () => {
    const battle = new Battle(createRng(1), { levels: [passiveLevel(['S..........'])] });
    ramShip(battle);
    battle.update(TICK_SECONDS, IDLE);
    expect(battle.wave.enemies[0]!.state).toBe('exploding');
    expect(battle.player.state).toBe('down');
    expect(battle.score).toBe(80);
  });

  it.each([
    [5, 40],
    [11, 60],
  ])('scales the points by the level (level %i -> %i)', (startLevel, points) => {
    // Escalation keeps ONE_CORNER_ENEMY passive with the same layout.
    const battle = new Battle(createRng(1), { levels: ONE_CORNER_ENEMY, startLevel });
    shootCornerEnemy(battle);
    expect(battle.score).toBe(points);
  });

  it('keeps the score through cleared and the next level', () => {
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS });
    shootCornerEnemy(battle);
    expect(battle.score).toBe(30);
    run(battle, EXPLOSION_TICKS);
    expect(battle.phase).toBe('cleared');
    expect(battle.score).toBe(30);
    run(battle, LEVEL_PAUSE_TICKS);
    expect(battle.level).toBe(2);
    expect(battle.phase).toBe('playing');
    expect(battle.score).toBe(30);
  });

  it('does not score in over', () => {
    const battle = overBattle();
    ramShip(battle);
    run(battle, 1);
    expect(battle.wave.enemies[0]!.isOut).toBe(true);
    expect(battle.score).toBe(0);
  });
});

describe('Battle extra lives', () => {
  it('uses levels where one kill is worth exactly 5000', () => {
    expect(killPoints({ kind: 'drone', inFlight: false }, DRONE_5000_LEVEL)).toBe(5000);
    expect(killPoints({ kind: 'drone', inFlight: false }, DRONE_5000_LEVEL - 1)).toBe(4990);
    expect(killPoints({ kind: 'striker', inFlight: true }, STRIKER_RAM_5000_LEVEL)).toBe(5000);
    expect(killPoints({ kind: 'striker', inFlight: true }, STRIKER_RAM_5000_LEVEL - 1)).toBe(4990);
  });

  it('gives a life when the score crosses 5000', () => {
    const battle = new Battle(createRng(1), {
      levels: ONE_CORNER_ENEMY,
      startLevel: DRONE_5000_LEVEL,
    });
    shootCornerEnemy(battle);
    expect(battle.score).toBe(5000);
    expect(battle.player.lives).toBe(START_LIVES + 1);
  });

  it('does not go over MAX_LIVES', () => {
    const battle = new Battle(createRng(1), {
      levels: ONE_CORNER_ENEMY,
      startLevel: DRONE_5000_LEVEL,
      lives: MAX_LIVES,
    });
    shootCornerEnemy(battle);
    expect(battle.score).toBe(5000);
    expect(battle.player.lives).toBe(MAX_LIVES);
  });

  it('charges a lost ship before the extra life', () => {
    const battle = new Battle(createRng(1), {
      levels: [passiveLevel(['S..........'])],
      startLevel: STRIKER_RAM_5000_LEVEL,
      lives: MAX_LIVES,
    });
    ramShip(battle);
    battle.update(TICK_SECONDS, IDLE);
    expect(battle.player.state).toBe('down');
    expect(battle.score).toBe(5000);
    expect(battle.player.lives).toBe(MAX_LIVES); // 5 -> 4 -> 5
  });

  it('an extra life in down at 0 lives cancels game over', () => {
    const battle = new Battle(createRng(1), {
      levels: ONE_CORNER_ENEMY,
      startLevel: DRONE_5000_LEVEL,
      lives: 1,
    });
    battle.player.ship.x = 40; // shot column x = 47
    battle.update(TICK_SECONDS, FIRE); // the shot leaves the live ship
    battle.player.hit(); // the last ship is lost with the shot in flight
    expect(battle.player.isLost).toBe(true);
    onlyShot(battle.player)!.y = 42;
    battle.update(TICK_SECONDS, IDLE); // stateTicks = 1: the shot hits, 5000 points
    expect(battle.wave.enemies[0]!.state).toBe('exploding');
    expect(battle.score).toBe(5000);
    expect(battle.player.lives).toBe(1);
    expect(battle.player.isLost).toBe(false);
    run(battle, GAME_OVER_DELAY_TICKS - 2);
    expect(battle.player.state).toBe('down');
    run(battle, 1); // DOWN_TICKS since the hit
    expect(battle.player.state).toBe('invulnerable');
    expect(battle.phase).not.toBe('over');
    run(battle, GAME_OVER_DELAY_TICKS);
    expect(battle.phase).not.toBe('over');
  });
});

/** Battle with the bonus field on a stub rng: spawn tick 300, dir -1 (x = 244), BONUS_KINDS[0]. */
function bonusBattle(opts: BattleOptions = {}): Battle {
  return new Battle(createRng(1), { levels: ONE_CORNER_ENEMY, bonuses: { rng: () => 0 }, ...opts });
}

/** Runs the passive level up to the asteroid's spawn tick; returns the asteroid. */
function spawnAsteroid(battle: Battle): Asteroid {
  run(battle, ASTEROID_SPAWN_MIN_TICKS);
  const asteroid = battle.bonuses!.asteroid;
  expect(asteroid).not.toBeNull();
  return asteroid!;
}

/** Puts the asteroid over the shot with a margin for this tick's moves (shot -4 y, asteroid +1 y, -1/2 x). */
function asteroidOverShot(asteroid: Asteroid, shot: Shot): void {
  asteroid.x = shot.x - 5;
  asteroid.y = shot.y - 10;
}

/** Fires one shot from the idle ship (one tick) and returns it. */
function fire(battle: Battle): Shot {
  battle.update(TICK_SECONDS, FIRE);
  const shot = onlyShot(battle.player);
  expect(shot).not.toBeNull();
  return shot!;
}

/** asteroidPoints is exactly 5000 here (490 gives 4990). */
const ASTEROID_5000_LEVEL = 491;

describe('Battle asteroid', () => {
  it('has no bonus field without opts.bonuses', () => {
    expect(new Battle(createRng(1)).bonuses).toBeNull();
  });

  it('starts the first level of the field in the constructor', () => {
    const field = bonusBattle().bonuses!;
    expect(field.spawnTick).toBe(300);
    expect(field.levelTicks).toBe(0);
    expect(field.asteroid).toBeNull();
  });

  it('spawns the asteroid on the spawn tick of playing', () => {
    const battle = bonusBattle();
    run(battle, 299);
    expect(battle.bonuses!.asteroid).toBeNull();
    run(battle, 1);
    const asteroid = battle.bonuses!.asteroid!;
    expect(asteroid).not.toBeNull();
    expect(asteroid.x).toBe(244);
    expect(asteroid.y).toBe(-ASTEROID_SIZE);
    expect(asteroid.dir).toBe(-1);
    expect(asteroid.bonus).toBe(BONUS_KINDS[0]);
    expect(asteroid.state).toBe('flying');
  });

  it('does not touch the battle rng', () => {
    const plain = new Battle(createRng(7));
    const withBonuses = new Battle(createRng(7), { bonuses: { rng: createRng(99) } });
    run(plain, 1200);
    run(withBonuses, 1200);
    const snapshot = (b: Battle) => ({
      enemies: b.wave.enemies.map((e) => [e.x, e.y, e.state]),
      shots: b.wave.shots.length,
      state: b.player.state,
      lives: b.player.lives,
      phase: b.phase,
    });
    expect(snapshot(withBonuses)).toEqual(snapshot(plain));
  });

  it('a shot breaks the asteroid through update() and scores asteroidPoints', () => {
    const battle = bonusBattle();
    const asteroid = spawnAsteroid(battle);
    const shot = fire(battle);
    asteroidOverShot(asteroid, shot);
    battle.update(TICK_SECONDS, IDLE);
    expect(battle.score).toBe(asteroidPoints(1));
    expect(battle.score).toBe(100);
    expect(battle.player.shots).toEqual([]);
    expect(asteroid.state).toBe('exploding');
  });

  it('scales the asteroid points by the level', () => {
    const battle = bonusBattle({ startLevel: 5 });
    const asteroid = spawnAsteroid(battle);
    asteroidOverShot(asteroid, fire(battle));
    battle.update(TICK_SECONDS, IDLE);
    expect(battle.score).toBe(asteroidPoints(5));
    expect(battle.score).toBe(140);
  });

  it('an enemy goes first when one shot covers both', () => {
    const battle = bonusBattle();
    const asteroid = spawnAsteroid(battle);
    const enemy = battle.wave.enemies[0]!;
    battle.player.ship.x = Math.floor(enemy.x) - 2; // shot column floor(enemy.x) + 5
    const shot = fire(battle);
    shot.y = enemy.y + 8;
    asteroidOverShot(asteroid, shot);
    battle.update(TICK_SECONDS, IDLE);
    expect(enemy.state).toBe('exploding');
    expect(asteroid.state).toBe('flying');
    expect(battle.score).toBe(killPoints({ kind: 'drone', inFlight: false }, 1));
    expect(battle.score).toBe(30);
  });

  it('passes through the ship harmlessly', () => {
    const battle = bonusBattle();
    const asteroid = spawnAsteroid(battle);
    asteroid.x = battle.player.ship.x;
    asteroid.y = SHIP_Y - 2;
    run(battle, 10);
    expect(battle.player.state).toBe('active');
    expect(battle.player.lives).toBe(START_LIVES);
    expect(battle.score).toBe(0);
    expect(asteroid.state).toBe('flying');
  });

  it('does not count ticks or spawn in cleared; the next level draws a new spawn tick', () => {
    let calls = 0;
    const rng = () => {
      calls++;
      return 0;
    };
    const battle = new Battle(createRng(1), { levels: TWO_LEVELS, bonuses: { rng } });
    battle.wave.enemies[0]!.kill();
    run(battle, EXPLOSION_TICKS);
    expect(battle.phase).toBe('cleared');
    const field = battle.bonuses!;
    const ticks = field.levelTicks;
    run(battle, LEVEL_PAUSE_TICKS - 1);
    expect(battle.phase).toBe('cleared');
    expect(field.levelTicks).toBe(ticks);
    expect(field.asteroid).toBeNull();
    run(battle, 1);
    expect(battle.level).toBe(2);
    expect(battle.phase).toBe('playing');
    expect(field.spawnTick).toBe(300);
    expect(field.levelTicks).toBe(0);
    expect(calls).toBe(2); // the constructor and the new level
  });

  it('brings an unshot asteroid back after the delay; a level change cancels the wait', () => {
    const flight = SCREEN_HEIGHT + ASTEROID_SIZE;
    // rng = 0: retry delay = the window's low end.
    const battle = bonusBattle();
    const first = spawnAsteroid(battle); // update 300
    run(battle, flight);
    expect(first.state).toBe('gone');
    const field = battle.bonuses!;
    expect(field.asteroid).toBeNull();
    expect(field.levelTicks).toBe(ASTEROID_SPAWN_MIN_TICKS + flight);
    expect(field.spawnTick).toBe(field.levelTicks + ASTEROID_SPAWN_MIN_TICKS);
    run(battle, ASTEROID_SPAWN_MIN_TICKS - 1);
    expect(field.asteroid).toBeNull();
    run(battle, 1);
    expect(field.asteroid).not.toBeNull();
    expect(field.asteroid).not.toBe(first);

    let calls = 0;
    const rng = () => {
      calls++;
      return 0;
    };
    const other = bonusBattle({ bonuses: { rng } });
    spawnAsteroid(other);
    run(other, flight);
    const waiting = other.bonuses!;
    expect(waiting.retryBonus).not.toBeNull();
    clearWave(other); // the enemy dies while the retry waits
    expect(other.level).toBe(2);
    expect(other.phase).toBe('playing');
    expect(waiting.asteroid).toBeNull();
    expect(waiting.retryBonus).toBeNull();
    expect(waiting.spawnTick).toBe(300);
    expect(waiting.levelTicks).toBe(0);
    expect(calls).toBe(6); // constructor 1 + spawn 3 + retry delay 1 + startLevel 1
  });

  it('a flying asteroid survives the level change', () => {
    const battle = bonusBattle();
    const asteroid = spawnAsteroid(battle);
    battle.wave.enemies[0]!.kill();
    run(battle, EXPLOSION_TICKS + LEVEL_PAUSE_TICKS);
    expect(battle.level).toBe(2);
    expect(battle.bonuses!.asteroid).toBe(asteroid);
    expect(asteroid.state).toBe('flying');
  });

  it('can be shot down in cleared, with points', () => {
    const battle = bonusBattle();
    const asteroid = spawnAsteroid(battle);
    battle.wave.enemies[0]!.kill();
    run(battle, EXPLOSION_TICKS);
    expect(battle.phase).toBe('cleared');
    asteroidOverShot(asteroid, fire(battle));
    battle.update(TICK_SECONDS, IDLE);
    expect(asteroid.state).toBe('exploding');
    expect(battle.score).toBe(100);
    expect(battle.phase).toBe('cleared');
  });

  it('is not hit in over', () => {
    const battle = bonusBattle({ lives: 1 });
    const asteroid = spawnAsteroid(battle);
    fire(battle);
    battle.player.hit();
    for (let i = 0; i < GAME_OVER_DELAY_TICKS; i++) {
      onlyShot(battle.player)!.y = 200; // keeps the shot on screen
      battle.update(TICK_SECONDS, IDLE);
    }
    expect(battle.phase).toBe('over');
    const shot = onlyShot(battle.player)!;
    asteroidOverShot(asteroid, shot);
    battle.update(TICK_SECONDS, IDLE);
    expect(asteroid.state).toBe('flying');
    expect(onlyShot(battle.player)).toBe(shot);
    expect(battle.score).toBe(0);
  });

  it('uses a level where the asteroid is worth exactly 5000', () => {
    expect(asteroidPoints(ASTEROID_5000_LEVEL)).toBe(5000);
    expect(asteroidPoints(ASTEROID_5000_LEVEL - 1)).toBe(4990);
  });

  it('asteroid points give an extra life at 5000', () => {
    const battle = bonusBattle({ startLevel: ASTEROID_5000_LEVEL });
    const asteroid = spawnAsteroid(battle);
    asteroidOverShot(asteroid, fire(battle));
    battle.update(TICK_SECONDS, IDLE);
    expect(battle.score).toBe(5000);
    expect(battle.player.lives).toBe(START_LIVES + 1);
  });
});

/** Bonus rng: spawn tick 300, dir -1, offset 0, then the given kind; 0 afterwards. */
function kindRng(kind: BonusKind): Rng {
  let calls = 0;
  const pick = (BONUS_KINDS.indexOf(kind) + 0.5) / BONUS_KINDS.length;
  return () => (++calls === 4 ? pick : 0);
}

/** Puts the asteroid over the fresh shot low enough that its capsule drops onto the ship. */
function asteroidAtShip(asteroid: Asteroid, shot: Shot): void {
  asteroid.x = shot.x - 5;
  asteroid.y = shot.y - 6; // after this tick: asteroid 199, shot 200, capsule 201
}

/**
 * Spawns the asteroid, breaks it over a fresh shot (capsule at 123, 197), then idles until
 * the ship catches the capsule (at y = 201, four ticks later).
 */
function catchCapsule(battle: Battle): void {
  asteroidOverShot(spawnAsteroid(battle), fire(battle));
  battle.update(TICK_SECONDS, IDLE);
  expect(battle.bonuses!.capsule).not.toBeNull();
  for (let i = 0; i < 10 && battle.bonuses!.capsule; i++) battle.update(TICK_SECONDS, IDLE);
  expect(battle.bonuses!.capsule).toBeNull();
}

/** asteroidPoints is exactly 4500 here: + BONUS_FALLBACK_POINTS reaches 5000. */
const ASTEROID_4500_LEVEL = 441;

describe('Battle capsule', () => {
  it('drops from the broken asteroid and falls without touching the ship', () => {
    const battle = bonusBattle();
    const asteroid = spawnAsteroid(battle);
    asteroidOverShot(asteroid, fire(battle));
    battle.update(TICK_SECONDS, IDLE);
    const capsule = battle.bonuses!.capsule!;
    expect(capsule).not.toBeNull();
    expect(capsule.x).toBe(123);
    expect(capsule.y).toBe(197);
    expect(capsule.kind).toBe(asteroid.bonus);
    battle.update(TICK_SECONDS, IDLE);
    expect(capsule.y).toBe(198);
    run(battle, 2);
    expect(battle.bonuses!.capsule).toBe(capsule); // y = 200: touches the ship, no overlap yet
    expect(battle.player.lives).toBe(START_LIVES);
  });

  it('life: +1 life', () => {
    const battle = bonusBattle();
    catchCapsule(battle);
    expect(battle.player.lives).toBe(START_LIVES + 1);
    expect(battle.score).toBe(100);
  });

  it('life at MAX_LIVES: BONUS_FALLBACK_POINTS instead', () => {
    const battle = bonusBattle({ lives: MAX_LIVES });
    catchCapsule(battle);
    expect(battle.player.lives).toBe(MAX_LIVES);
    expect(battle.score).toBe(100 + BONUS_FALLBACK_POINTS);
  });

  it('fastShot: the next shots are fast', () => {
    const battle = bonusBattle({ bonuses: { rng: kindRng('fastShot') } });
    catchCapsule(battle);
    expect(battle.player.powerUps.fastShot).toBe(true);
    expect(battle.score).toBe(100);
    expect(fire(battle).speed).toBe(FAST_SHOT_SPEED);
  });

  it('doubleShot: two shots in flight', () => {
    const battle = bonusBattle({ bonuses: { rng: kindRng('doubleShot') } });
    catchCapsule(battle);
    expect(battle.player.powerUps.doubleShot).toBe(true);
    expect(battle.score).toBe(100);
    battle.update(TICK_SECONDS, FIRE);
    battle.update(TICK_SECONDS, IDLE);
    battle.update(TICK_SECONDS, FIRE);
    expect(battle.player.shots).toHaveLength(2);
  });

  it.each(['fastShot', 'doubleShot'] as const)(
    'a %s already on gives BONUS_FALLBACK_POINTS instead',
    (kind) => {
      const battle = bonusBattle({ bonuses: { rng: kindRng(kind) } });
      battle.player.grantPowerUp(kind);
      const powerUps = battle.player.powerUps;
      catchCapsule(battle);
      expect(battle.score).toBe(100 + BONUS_FALLBACK_POINTS);
      expect(battle.score).toBe(600);
      expect(battle.player.powerUps).toEqual(powerUps);
      expect(battle.player.lives).toBe(START_LIVES);
    },
  );

  it('power-ups survive the loss of a ship', () => {
    const battle = bonusBattle({ bonuses: { rng: kindRng('fastShot') } });
    catchCapsule(battle);
    battle.player.hit();
    run(battle, DOWN_TICKS);
    expect(battle.player.state).toBe('invulnerable');
    expect(battle.player.powerUps.fastShot).toBe(true);
    expect(fire(battle).speed).toBe(FAST_SHOT_SPEED);
  });

  it('power-ups survive the level change', () => {
    const battle = bonusBattle({ bonuses: { rng: kindRng('doubleShot') } });
    const player = battle.player;
    catchCapsule(battle);
    battle.wave.enemies[0]!.kill();
    run(battle, EXPLOSION_TICKS + LEVEL_PAUSE_TICKS);
    expect(battle.level).toBe(2);
    expect(battle.player).toBe(player);
    expect(battle.player.powerUps.doubleShot).toBe(true);
  });

  it('a ship lost on the touching tick does not take it; the capsule falls away', () => {
    const battle = bonusBattle();
    asteroidOverShot(spawnAsteroid(battle), fire(battle));
    battle.update(TICK_SECONDS, IDLE);
    const capsule = battle.bonuses!.capsule!;
    capsule.y = SHIP_Y - CAPSULE_SIZE; // overlaps the ship from the next update
    ramShip(battle);
    battle.update(TICK_SECONDS, IDLE);
    expect(battle.player.state).toBe('down');
    expect(battle.player.lives).toBe(START_LIVES - 1);
    expect(battle.bonuses!.capsule).toBe(capsule);
    expect(capsule.y).toBe(SHIP_Y - CAPSULE_SIZE + 1);
    run(battle, SCREEN_HEIGHT);
    expect(battle.bonuses!.capsule).toBeNull();
    expect(battle.player.lives).toBe(START_LIVES - 1);
  });

  it('is caught in cleared', () => {
    const battle = bonusBattle();
    const asteroid = spawnAsteroid(battle);
    battle.wave.enemies[0]!.kill();
    run(battle, EXPLOSION_TICKS);
    expect(battle.phase).toBe('cleared');
    asteroidOverShot(asteroid, fire(battle));
    battle.update(TICK_SECONDS, IDLE);
    expect(battle.bonuses!.capsule).not.toBeNull();
    for (let i = 0; i < 10 && battle.bonuses!.capsule; i++) battle.update(TICK_SECONDS, IDLE);
    expect(battle.bonuses!.capsule).toBeNull();
    expect(battle.player.lives).toBe(START_LIVES + 1);
    expect(battle.phase).toBe('cleared');
  });

  it('is not caught in over and falls away', () => {
    const battle = bonusBattle({ lives: 1 });
    asteroidOverShot(spawnAsteroid(battle), fire(battle));
    battle.update(TICK_SECONDS, IDLE);
    const capsule = battle.bonuses!.capsule!;
    battle.player.hit();
    for (let i = 0; i < GAME_OVER_DELAY_TICKS; i++) {
      capsule.y = 100; // keeps the capsule on screen
      battle.update(TICK_SECONDS, IDLE);
    }
    expect(battle.phase).toBe('over');
    capsule.y = SHIP_Y;
    battle.update(TICK_SECONDS, IDLE);
    expect(battle.bonuses!.capsule).toBe(capsule);
    expect(capsule.y).toBe(SHIP_Y + 1);
    run(battle, SCREEN_HEIGHT);
    expect(battle.bonuses!.capsule).toBeNull();
    expect(battle.score).toBe(100);
    expect(battle.player.lives).toBe(0);
  });

  it('uses a level where the asteroid is worth exactly 4500', () => {
    expect(asteroidPoints(ASTEROID_4500_LEVEL)).toBe(4500);
    expect(asteroidPoints(ASTEROID_4500_LEVEL - 1)).toBeLessThan(4500);
  });

  it('BONUS_FALLBACK_POINTS cross an extra-life threshold', () => {
    const battle = bonusBattle({
      startLevel: ASTEROID_4500_LEVEL,
      bonuses: { rng: kindRng('fastShot') },
    });
    battle.player.grantPowerUp('fastShot');
    catchCapsule(battle);
    expect(battle.score).toBe(5000);
    expect(battle.player.lives).toBe(START_LIVES + 1);
  });

  it('an asteroid broken at the ship height gives its bonus in the same tick', () => {
    const battle = bonusBattle();
    const asteroid = spawnAsteroid(battle);
    asteroidAtShip(asteroid, fire(battle));
    battle.update(TICK_SECONDS, IDLE);
    expect(asteroid.state).toBe('exploding');
    expect(battle.bonuses!.capsule).toBeNull();
    expect(battle.player.lives).toBe(START_LIVES + 1);
    expect(battle.score).toBe(100);
  });

  it('applies the bonus after the asteroid points: L is useless once they gave the 5th life', () => {
    const battle = bonusBattle({ startLevel: ASTEROID_5000_LEVEL, lives: MAX_LIVES - 1 });
    const asteroid = spawnAsteroid(battle);
    asteroidAtShip(asteroid, fire(battle));
    battle.update(TICK_SECONDS, IDLE);
    expect(battle.bonuses!.capsule).toBeNull();
    expect(battle.score).toBe(5000 + BONUS_FALLBACK_POINTS);
    expect(battle.player.lives).toBe(MAX_LIVES);
  });
});
