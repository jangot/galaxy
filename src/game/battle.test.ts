import { describe, expect, it } from 'vitest';
import { TICK_SECONDS } from '../config';
import { createRng } from '../engine/rng';
import { Battle, GAME_OVER_DELAY_TICKS, LEVEL_PAUSE_TICKS } from './battle';
import { EXPLOSION_TICKS, PEEL_SEGMENTS, STRIKER_TURN_TICKS } from './enemy';
import { LEVELS } from './levels';
import type { PlayerIntent } from './player';
import { MAX_LIVES, START_LIVES } from './player';
import { killPoints } from './score';
import { SHIP_SPEED, SHIP_WIDTH, SHIP_Y } from './ship';
import { diveOrder, ONE_CORNER_ENEMY, passiveLevel, TWO_LEVELS } from './test-levels';

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
  battle.player.shot!.y = 42;
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
    expect(battle.player.shot).not.toBeNull();
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
    const shot = battle.player.shot;
    expect(shot).not.toBeNull();
    const y0 = shot!.y;
    run(battle, 1);
    expect(battle.player.shot).toBe(shot);
    expect(shot!.y).toBeLessThan(y0);
  });

  it('shoots down an enemy through update()', () => {
    const battle = new Battle(createRng(1), { levels: ONE_CORNER_ENEMY });
    const enemy = battle.wave.enemies[0]!;
    battle.player.ship.x = 40; // shot column x = 47
    battle.update(TICK_SECONDS, FIRE);
    const shot = battle.player.shot;
    expect(shot).not.toBeNull();
    expect(shot!.x).toBe(47);
    shot!.y = 42; // touches the enemy's bottom (y = 34 … 42): no hit yet
    // Fire is ignored: the shot is in flight. It moves to y = 38 and hits the enemy,
    // which sits at x = 42 … 52 with offset 0.5.
    battle.update(TICK_SECONDS, FIRE);
    expect(battle.player.shot).toBeNull();
    expect(enemy.state).toBe('exploding');
    expect(enemy.stateTicks).toBe(0);
    // The slot is free from the next tick.
    battle.update(TICK_SECONDS, FIRE);
    expect(battle.player.shot).not.toBeNull();
    expect(battle.player.shot).not.toBe(shot);
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
    battle.player.shot!.y = 42;
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
    battle.player.shot!.y = 42;
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
