import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT, SCREEN_WIDTH, TICK_SECONDS } from '../config';
import type { EnemyEnv } from './enemy';
import {
  DRONE_RETARGET_TICKS,
  Enemy,
  ENEMY_FIRE_INTERVAL_TICKS,
  ENEMY_KINDS,
  EXPLOSION_FRAME_TICKS,
  EXPLOSION_TICKS,
  PEEL_SEGMENTS,
  STRIKER_TURN_TICKS,
} from './enemy';
import { DRONE_SPRITE, EXPLOSION_FRAMES, RAIDER_SPRITE, STRIKER_SPRITE } from './enemy-art';
import { CELL_HEIGHT, CELL_WIDTH, Formation, SWAY_RANGE } from './formation';
import type { EnemyKind } from './levels';
import { SHIP_Y } from './ship';
import { EVASION_CASES, EVASION_START, runEvasion } from './test-evasion';
import { diveOrder } from './test-levels';

const ENV: EnemyEnv = { diveSpeed: 60, targetX: null };

describe('Enemy', () => {
  it.each(['drone', 'striker', 'raider'] as const)('%s starts in its slot', (kind) => {
    const formation = new Formation(10, 3, 15);
    const slot = { row: 1, col: 4, kind, group: null };
    const enemy = new Enemy(slot, formation);
    const { sprite } = ENEMY_KINDS[kind];
    expect(enemy.width).toBe(sprite.width);
    expect(enemy.height).toBe(sprite.height);
    expect(enemy.kind).toBe(kind);
    expect(enemy.slot).toBe(slot);
    expect(enemy.x).toBe(formation.slotX(4, enemy.width));
    expect(enemy.y).toBe(formation.slotY(1, enemy.height));
    expect(enemy.state).toBe('formation');
  });

  it('update() puts the enemy back into its slot', () => {
    const formation = new Formation(10, 3, 15);
    const enemy = new Enemy({ row: 1, col: 4, kind: 'drone', group: null }, formation);
    enemy.x += 5;
    enemy.y -= 3;
    enemy.update(TICK_SECONDS, ENV);
    expect(enemy.x).toBe(formation.slotX(4, enemy.width));
    expect(enemy.y).toBe(formation.slotY(1, enemy.height));
  });

  it('in formation follows the sway', () => {
    const formation = new Formation(10, 3, 15);
    const enemy = new Enemy({ row: 1, col: 4, kind: 'drone', group: null }, formation);
    const x0 = enemy.x;
    const y0 = enemy.y;
    for (let i = 0; i < 4; i++) formation.update(TICK_SECONDS);
    enemy.update(TICK_SECONDS, ENV);
    expect(enemy.x).toBe(formation.slotX(4, enemy.width));
    expect(enemy.x).toBe(x0 + 1);
    expect(enemy.y).toBe(y0);
  });
});

describe('ENEMY_KINDS sprites', () => {
  it.each(Object.entries(ENEMY_KINDS))('%s sprite fits the formation cell', (_kind, spec) => {
    const { width, height } = spec.sprite;
    expect(width % 2).toBe(1);
    expect(width).toBeLessThanOrEqual(13);
    expect(height).toBeLessThanOrEqual(10);
    expect(width).toBeLessThanOrEqual(CELL_WIDTH);
    expect(height).toBeLessThanOrEqual(CELL_HEIGHT);
  });

  it('enemy kinds look different', () => {
    const sprites = [DRONE_SPRITE, STRIKER_SPRITE, RAIDER_SPRITE];
    for (let i = 0; i < sprites.length; i++) {
      for (let j = i + 1; j < sprites.length; j++) {
        expect(sprites[i]!.pixels).not.toEqual(sprites[j]!.pixels);
      }
    }
  });
});

function newEnemy(): { enemy: Enemy; formation: Formation } {
  const formation = new Formation(10, 3, 15);
  return { enemy: new Enemy({ row: 1, col: 4, kind: 'drone', group: null }, formation), formation };
}

function newEnemyOf(kind: EnemyKind): { enemy: Enemy; formation: Formation } {
  const formation = new Formation(10, 3, 15);
  return { enemy: new Enemy({ row: 1, col: 4, kind, group: null }, formation), formation };
}

const aimAt = (targetX: number | null, diveSpeed = 60): EnemyEnv => ({ diveSpeed, targetX });
const centerX = (e: Enemy): number => e.x + Math.floor(e.width / 2);

describe('Enemy states', () => {
  it('is alive in formation; kill() starts the explosion', () => {
    const { enemy } = newEnemy();
    expect(enemy.isAlive).toBe(true);
    enemy.kill();
    expect(enemy.state).toBe('exploding');
    expect(enemy.stateTicks).toBe(0);
    expect(enemy.isAlive).toBe(false);
  });

  it('counts stateTicks in formation, starting at 0', () => {
    const { enemy } = newEnemy();
    expect(enemy.stateTicks).toBe(0);
    enemy.update(TICK_SECONDS, ENV);
    expect(enemy.stateTicks).toBe(1);
    enemy.update(TICK_SECONDS, ENV);
    expect(enemy.stateTicks).toBe(2);
  });

  it('stands still while exploding', () => {
    const { enemy, formation } = newEnemy();
    const { x, y } = enemy;
    enemy.kill();
    for (let i = 0; i < 8; i++) formation.update(TICK_SECONDS);
    enemy.update(TICK_SECONDS, ENV);
    expect(formation.slotX(4, enemy.width)).not.toBe(x);
    expect(enemy.x).toBe(x);
    expect(enemy.y).toBe(y);
  });

  it('becomes dead exactly after EXPLOSION_TICKS updates', () => {
    const { enemy } = newEnemy();
    enemy.kill();
    for (let i = 0; i < EXPLOSION_TICKS - 1; i++) enemy.update(TICK_SECONDS, ENV);
    expect(enemy.state).toBe('exploding');
    expect(enemy.stateTicks).toBe(EXPLOSION_TICKS - 1);
    enemy.update(TICK_SECONDS, ENV);
    expect(enemy.state).toBe('dead');
    expect(enemy.isAlive).toBe(false);
  });

  it('ignores kill() while exploding or dead', () => {
    const { enemy } = newEnemy();
    enemy.kill();
    for (let i = 0; i < 3; i++) enemy.update(TICK_SECONDS, ENV);
    enemy.kill();
    expect(enemy.state).toBe('exploding');
    expect(enemy.stateTicks).toBe(3);
    for (let i = 0; i < EXPLOSION_TICKS; i++) enemy.update(TICK_SECONDS, ENV);
    expect(enemy.state).toBe('dead');
    enemy.kill();
    expect(enemy.state).toBe('dead');
  });

  it('does not move when dead', () => {
    const { enemy, formation } = newEnemy();
    enemy.kill();
    for (let i = 0; i < EXPLOSION_TICKS; i++) enemy.update(TICK_SECONDS, ENV);
    expect(enemy.state).toBe('dead');
    const { x, y } = enemy;
    for (let i = 0; i < 8; i++) formation.update(TICK_SECONDS);
    enemy.update(TICK_SECONDS, ENV);
    expect(enemy.x).toBe(x);
    expect(enemy.y).toBe(y);
  });
});

describe('EXPLOSION_FRAMES', () => {
  it('has 2 frames that fit the enemy size limits', () => {
    expect(EXPLOSION_FRAMES).toHaveLength(2);
    for (const frame of EXPLOSION_FRAMES) {
      expect(frame.width % 2).toBe(1);
      expect(frame.width).toBeLessThanOrEqual(13);
      expect(frame.height).toBeLessThanOrEqual(10);
    }
  });

  it('frames look different', () => {
    expect(EXPLOSION_FRAMES[0]!.pixels).not.toEqual(EXPLOSION_FRAMES[1]!.pixels);
  });

  it('lasts frames × frame ticks = 16 ticks', () => {
    expect(EXPLOSION_TICKS).toBe(EXPLOSION_FRAMES.length * EXPLOSION_FRAME_TICKS);
    expect(EXPLOSION_TICKS).toBe(16);
  });
});

/** Peel length, ticks. */
const P = PEEL_SEGMENTS.reduce((sum, s) => sum + s.ticks, 0);

function step(enemy: Enemy, n: number, env: EnemyEnv = ENV): void {
  for (let i = 0; i < n; i++) enemy.update(TICK_SECONDS, env);
}

/** Dives, finishes the peel and drops past the bottom: the enemy is now 'returning'. */
function toReturning(enemy: Enemy): void {
  enemy.startDive(diveOrder({ sortieId: 7 }));
  step(enemy, P);
  enemy.y = SCREEN_HEIGHT - 1;
  step(enemy, 1);
  if (enemy.state !== 'returning') throw new Error('expected returning');
}

describe('Enemy dive', () => {
  it('startDive() leaves the formation without moving on that tick', () => {
    const { enemy } = newEnemy();
    const { x, y } = enemy;
    enemy.startDive(diveOrder({ sortieId: 7 }));
    expect(enemy.state).toBe('diving');
    expect(enemy.stateTicks).toBe(0);
    expect(enemy.isOut).toBe(true);
    expect(enemy.isAlive).toBe(true);
    expect(enemy.sortieId).toBe(7);
    expect(enemy.x).toBe(x);
    expect(enemy.y).toBe(y);
  });

  it('is not out and has no sortie in formation', () => {
    const { enemy } = newEnemy();
    expect(enemy.isOut).toBe(false);
    expect(enemy.sortieId).toBeNull();
  });

  it('takes the first peel step on the next update', () => {
    const { enemy } = newEnemy();
    const { x, y } = enemy;
    enemy.startDive(diveOrder());
    step(enemy, 1);
    expect(enemy.x).toBe(x + PEEL_SEGMENTS[0]!.vx);
    expect(enemy.y).toBe(y + PEEL_SEGMENTS[0]!.vy);
    expect(enemy.x).toBe(x + 1);
    expect(enemy.y).toBe(y - 1);
  });

  it('starts with a 14-tick peel', () => {
    expect(P).toBe(14);
  });

  it.each([-1, 1] as const)('peel with side %i moves by the sum of the segments', (side) => {
    const { enemy } = newEnemy();
    const { x, y } = enemy;
    const dx = PEEL_SEGMENTS.reduce((sum, s) => sum + s.vx * s.ticks, 0);
    const dy = PEEL_SEGMENTS.reduce((sum, s) => sum + s.vy * s.ticks, 0);
    enemy.startDive(diveOrder({ side }));
    step(enemy, P);
    expect(enemy.state).toBe('diving');
    expect(enemy.x).toBe(x + side * dx);
    expect(enemy.y).toBe(y + dy);
  });

  it.each([
    [-1, 3, 0],
    [1, SCREEN_WIDTH - 11 - 3, SCREEN_WIDTH - 11],
  ] as const)('clamps X during the peel (side %i)', (side, startX, endX) => {
    const { enemy } = newEnemy();
    expect(enemy.width).toBe(11);
    enemy.startDive(diveOrder({ side }));
    enemy.x = startX;
    for (let i = 0; i < P; i++) {
      step(enemy, 1);
      expect(enemy.x).toBeGreaterThanOrEqual(0);
      expect(enemy.x).toBeLessThanOrEqual(SCREEN_WIDTH - enemy.width);
    }
    expect(enemy.x).toBe(endX);
  });

  it('the leftmost enemy of a fully swayed formation stays on screen', () => {
    const formation = new Formation(10, 3, 15);
    const enemy = new Enemy({ row: 1, col: 0, kind: 'drone', group: null }, formation);
    let ticks = 0;
    do {
      formation.update(TICK_SECONDS);
      step(enemy, 1);
      ticks++;
    } while (formation.offset !== -SWAY_RANGE && ticks < 1000);
    expect(formation.offset).toBe(-SWAY_RANGE);
    enemy.startDive(diveOrder({ side: -1 }));
    for (let i = 0; i < P; i++) {
      formation.update(TICK_SECONDS);
      step(enemy, 1);
      expect(enemy.x).toBeGreaterThanOrEqual(0);
    }
  });

  it.each([60, 90, 120])('descends straight down at %i px/s after the peel', (diveSpeed) => {
    const { enemy } = newEnemy();
    const env: EnemyEnv = { diveSpeed, targetX: null };
    enemy.startDive(diveOrder());
    step(enemy, P, env);
    const { x, y } = enemy;
    step(enemy, 1, env);
    expect(enemy.y).toBe(y + diveSpeed * TICK_SECONDS);
    expect(enemy.y).toBe(y + diveSpeed / 60);
    expect(enemy.x).toBe(x);
  });

  it('reappears above its slot after passing the bottom', () => {
    const { enemy, formation } = newEnemy();
    enemy.startDive(diveOrder({ sortieId: 7 }));
    step(enemy, P);
    enemy.y = SCREEN_HEIGHT - 2;
    step(enemy, 1);
    expect(enemy.state).toBe('diving');
    step(enemy, 1);
    expect(enemy.state).toBe('returning');
    expect(enemy.stateTicks).toBe(0);
    expect(enemy.y).toBe(-enemy.height);
    expect(enemy.x).toBe(formation.slotX(4, enemy.width));
    expect(enemy.isOut).toBe(true);
    expect(enemy.isAlive).toBe(true);
    expect(enemy.sortieId).toBe(7);
  });

  it('drops back into its slot and follows the formation again', () => {
    const { enemy, formation } = newEnemy();
    toReturning(enemy);
    const slotY = formation.slotY(1, enemy.height);
    step(enemy, slotY + enemy.height - 1);
    expect(enemy.state).toBe('returning');
    step(enemy, 1);
    expect(enemy.state).toBe('formation');
    expect(enemy.x).toBe(formation.slotX(4, enemy.width));
    expect(enemy.y).toBe(slotY);
    expect(enemy.sortieId).toBeNull();
    expect(enemy.isOut).toBe(false);
    expect(enemy.stateTicks).toBe(0);
    for (let i = 0; i < 4; i++) formation.update(TICK_SECONDS);
    step(enemy, 1);
    expect(enemy.x).toBe(formation.slotX(4, enemy.width));
  });

  it('steers on X towards a slot that moved away and never sinks below slotY', () => {
    const { enemy, formation } = newEnemy();
    toReturning(enemy);
    const slotX = formation.slotX(4, enemy.width);
    const slotY = formation.slotY(1, enemy.height);
    enemy.x = slotX - 30;
    enemy.y = slotY - 5;
    for (let i = 1; i < 30; i++) {
      step(enemy, 1);
      expect(enemy.state).toBe('returning');
      expect(enemy.y).toBeLessThanOrEqual(slotY);
      expect(enemy.y).toBe(Math.min(slotY - 5 + i, slotY));
      expect(enemy.x).toBe(slotX - 30 + i);
    }
    step(enemy, 1);
    expect(enemy.state).toBe('formation');
    expect(enemy.x).toBe(slotX);
    expect(enemy.y).toBe(slotY);
  });

  it('catches up with a fast-swaying slot', () => {
    const formation = new Formation(10, 3, 30);
    const enemy = new Enemy({ row: 1, col: 4, kind: 'drone', group: null }, formation);
    toReturning(enemy);
    let ticks = 0;
    while (enemy.state === 'returning' && ticks < 1000) {
      formation.update(TICK_SECONDS);
      step(enemy, 1);
      expect(enemy.y).toBeLessThanOrEqual(formation.slotY(1, enemy.height));
      ticks++;
    }
    expect(enemy.state).toBe('formation');
    expect(enemy.x).toBe(formation.slotX(4, enemy.width));
    expect(enemy.y).toBe(formation.slotY(1, enemy.height));
  });

  it('completes a full sortie on a still formation in a finite number of ticks', () => {
    const { enemy, formation } = newEnemy();
    enemy.startDive(diveOrder({ side: -1 }));
    let ticks = 0;
    while (enemy.state !== 'formation' && ticks < 10_000) {
      step(enemy, 1);
      ticks++;
    }
    expect(enemy.state).toBe('formation');
    // Drone of row 1 at 1 px/tick: peel 14 + descend 192 + return 54.
    expect(ticks).toBe(14 + 192 + 54);
    expect(enemy.x).toBe(formation.slotX(4, enemy.width));
    expect(enemy.y).toBe(formation.slotY(1, enemy.height));
  });

  it.each([
    [
      'peel',
      (e: Enemy) => {
        e.startDive(diveOrder());
        step(e, 3);
      },
    ],
    [
      'descend',
      (e: Enemy) => {
        e.startDive(diveOrder());
        step(e, P + 3);
      },
    ],
    [
      'returning',
      (e: Enemy) => {
        toReturning(e);
        step(e, 2);
      },
    ],
  ] as const)('kill() during %s explodes where it was hit', (_phase, setup) => {
    const { enemy } = newEnemy();
    setup(enemy);
    const { x, y } = enemy;
    enemy.kill();
    expect(enemy.state).toBe('exploding');
    expect(enemy.sortieId).toBeNull();
    expect(enemy.isOut).toBe(false);
    expect(enemy.isAlive).toBe(false);
    step(enemy, EXPLOSION_TICKS - 1);
    expect(enemy.x).toBe(x);
    expect(enemy.y).toBe(y);
    step(enemy, 1);
    expect(enemy.state).toBe('dead');
  });

  it('ignores startDive() outside the formation', () => {
    const { enemy } = newEnemy();
    enemy.startDive(diveOrder({ sortieId: 7 }));
    step(enemy, 2);
    enemy.startDive(diveOrder({ sortieId: 9, side: -1 }));
    expect(enemy.state).toBe('diving');
    expect(enemy.sortieId).toBe(7);
    expect(enemy.stateTicks).toBe(2);

    const returning = newEnemy().enemy;
    toReturning(returning);
    returning.startDive(diveOrder({ sortieId: 9, side: -1 }));
    expect(returning.state).toBe('returning');
    expect(returning.sortieId).toBe(7);
    expect(returning.stateTicks).toBe(0);

    const hit = newEnemy().enemy;
    hit.kill();
    hit.startDive(diveOrder({ sortieId: 9, side: -1 }));
    expect(hit.state).toBe('exploding');
    step(hit, EXPLOSION_TICKS);
    hit.startDive(diveOrder({ sortieId: 9, side: -1 }));
    expect(hit.state).toBe('dead');
    expect(hit.sortieId).toBeNull();
  });
});

/**
 * A kind's enemy after the peel (side = 1, still formation): x = 128 / 127, center 133.
 * striker: vx = side on descend tick 1 (continues the arc).
 */
function afterPeel(kind: EnemyKind, env: EnemyEnv = ENV): Enemy {
  const { enemy } = newEnemyOf(kind);
  enemy.startDive(diveOrder());
  step(enemy, P, env);
  return enemy;
}

describe('Enemy aim', () => {
  it('kind profiles: drone re-aims every DRONE_RETARGET_TICKS = 30 ticks, striker every tick with STRIKER_TURN_TICKS = 8 inertia, raider once', () => {
    expect(DRONE_RETARGET_TICKS).toBe(30);
    expect(STRIKER_TURN_TICKS).toBe(8);
    expect(ENEMY_KINDS.drone.steer).toEqual({
      retargetTicks: DRONE_RETARGET_TICKS,
      turnTicks: 0,
      maxVx: 1,
    });
    expect(ENEMY_KINDS.striker.steer).toEqual({
      retargetTicks: 1,
      turnTicks: STRIKER_TURN_TICKS,
      maxVx: 1,
    });
    expect(ENEMY_KINDS.raider.steer).toEqual({ retargetTicks: null, turnTicks: 0, maxVx: 1 });
  });

  it.each(['drone', 'striker', 'raider'] as const)(
    '%s peel does not depend on the target',
    (kind) => {
      const a = afterPeel(kind, aimAt(0));
      const b = afterPeel(kind, aimAt(null));
      expect(centerX(a)).toBe(133);
      expect(a.x).toBe(b.x);
      expect(a.y).toBe(b.y);
    },
  );

  it('fixed takes the target on the first descend tick and keeps it', () => {
    const enemy = afterPeel('raider', aimAt(250));
    expect(enemy.x).toBe(127);
    step(enemy, 1, aimAt(100));
    expect(enemy.x).toBe(126);
    for (let i = 1; i <= 10; i++) {
      step(enemy, 1, aimAt(250));
      expect(enemy.x).toBe(126 - i);
    }
    expect(enemy.x).toBe(116);
  });

  it('fixed reaches its target and then flies straight down', () => {
    const enemy = afterPeel('raider');
    for (let i = 1; i <= 20; i++) {
      const y = enemy.y;
      step(enemy, 1, aimAt(123));
      expect(enemy.x).toBe(i <= 10 ? 127 - i : 117);
      expect(enemy.y).toBe(y + 1);
    }
    expect(centerX(enemy)).toBe(123);
  });

  it('fixed with no target on the first descend tick flies straight down', () => {
    const enemy = afterPeel('raider');
    step(enemy, 1, aimAt(null));
    for (let i = 0; i < 30; i++) {
      step(enemy, 1, aimAt(0));
      expect(enemy.x).toBe(127);
    }
  });

  it('fixed does not reuse the target of the previous sortie', () => {
    const { enemy } = newEnemyOf('raider');
    enemy.startDive(diveOrder());
    step(enemy, P + 1, aimAt(100));
    let ticks = 0;
    while (enemy.state !== 'formation' && ticks < 10_000) {
      step(enemy, 1, aimAt(100));
      ticks++;
    }
    expect(enemy.state).toBe('formation');
    enemy.startDive(diveOrder({ sortieId: 2 }));
    step(enemy, P);
    expect(enemy.x).toBe(127);
    step(enemy, 1, aimAt(null));
    for (let i = 0; i < 10; i++) {
      step(enemy, 1, aimAt(100));
      expect(enemy.x).toBe(127);
    }
  });

  it('drone keeps its target for DRONE_RETARGET_TICKS ticks, then takes a new one', () => {
    const N = DRONE_RETARGET_TICKS;
    const enemy = afterPeel('drone');
    expect(enemy.x).toBe(128);
    step(enemy, 1, aimAt(200)); // d = 1: aims right
    expect(enemy.vx).toBe(1);
    expect(enemy.x).toBe(129);
    for (let d = 2; d <= N; d++) {
      step(enemy, 1, aimAt(0)); // the ship went left, but the old aim holds
      expect(enemy.vx).toBe(1);
      expect(enemy.x).toBe(128 + d);
    }
    step(enemy, 1, aimAt(0)); // d = 1 + N: re-aim
    expect(enemy.vx).toBe(-1);
    expect(enemy.x).toBe(127 + N);
  });

  it('drone with no target on the first descend tick picks the ship up on the next re-aim', () => {
    const N = DRONE_RETARGET_TICKS;
    const enemy = afterPeel('drone');
    step(enemy, 1, aimAt(null)); // d = 1: the ship is down
    expect(enemy.x).toBe(128);
    for (let d = 2; d <= N; d++) {
      step(enemy, 1, aimAt(100)); // the ship is back, not a re-aim tick yet
      expect(enemy.vx).toBe(0);
      expect(enemy.x).toBe(128);
    }
    step(enemy, 1, aimAt(100)); // d = 1 + N: picks the ship up
    expect(enemy.vx).toBe(-1);
    expect(enemy.x).toBe(127);
    step(enemy, 1, aimAt(null)); // not a re-aim tick: keeps the new aim
    expect(enemy.x).toBe(126);
  });

  it('drone stops steering when the ship is down on a re-aim tick', () => {
    const N = DRONE_RETARGET_TICKS;
    const enemy = afterPeel('drone');
    step(enemy, N, aimAt(0)); // d = 1 ... N: flies left
    expect(enemy.x).toBe(128 - N);
    step(enemy, 1, aimAt(null)); // d = 1 + N: no target
    expect(enemy.vx).toBe(0);
    for (let i = 0; i < 10; i++) {
      const y = enemy.y;
      step(enemy, 1, aimAt(0));
      expect(enemy.x).toBe(128 - N);
      expect(enemy.y).toBe(y + 1);
    }
  });

  it.each([
    [128.25, 133],
    [128.75, 133],
    [128.75, 134],
  ])('does not jitter over the target with a fractional center (x %s, target %i)', (x, target) => {
    const enemy = afterPeel('drone');
    enemy.x = x;
    step(enemy, 20, aimAt(target));
    expect(enemy.x).toBe(x);
  });

  it('steps once to a target 1 px away and stays', () => {
    const enemy = afterPeel('drone');
    enemy.x = 128;
    step(enemy, 1, aimAt(134));
    expect(enemy.x).toBe(129);
    step(enemy, 10, aimAt(134));
    expect(enemy.x).toBe(129);
  });

  it.each([60, 90, 120])('Y step at %i px/s does not depend on steering', (diveSpeed) => {
    const enemy = afterPeel('drone', aimAt(0, diveSpeed));
    for (let i = 0; i < 5; i++) {
      const { x, y } = enemy;
      step(enemy, 1, aimAt(0, diveSpeed));
      expect(enemy.y).toBe(y + diveSpeed / 60);
      expect(enemy.x).toBe(x - 1);
    }
  });

  it.each([
    [0, 0],
    [255, SCREEN_WIDTH - 11],
  ] as const)('stays on screen while aiming at the edge (target %i)', (target, endX) => {
    const enemy = afterPeel('drone');
    expect(enemy.width).toBe(11);
    enemy.x = target === 0 ? 3 : SCREEN_WIDTH - enemy.width - 3;
    for (let i = 0; i < 10; i++) {
      step(enemy, 1, aimAt(target));
      expect(enemy.x).toBeGreaterThanOrEqual(0);
      expect(enemy.x).toBeLessThanOrEqual(SCREEN_WIDTH - enemy.width);
    }
    expect(enemy.x).toBe(endX);
  });

  it('measures the gap from the center of its own sprite', () => {
    const drone = afterPeel('drone');
    const raider = afterPeel('raider');
    drone.x = 100;
    raider.x = 100;
    step(drone, 5, aimAt(105));
    step(raider, 1, aimAt(105));
    expect(raider.x).toBe(99);
    step(raider, 4, aimAt(105));
    expect(drone.x).toBe(100);
    expect(raider.x).toBe(99);
  });
});

describe('Enemy vx', () => {
  it('is 0 in the formation and on every peel tick, though x moves', () => {
    const { enemy } = newEnemyOf('striker');
    expect(enemy.vx).toBe(0);
    enemy.startDive(diveOrder());
    const x0 = enemy.x;
    for (let i = 0; i < P; i++) {
      step(enemy, 1, aimAt(0));
      expect(enemy.vx).toBe(0);
    }
    expect(enemy.x).not.toBe(x0);
  });

  it('in descend equals the actual x shift of every tick (striker, with inertia)', () => {
    const enemy = afterPeel('striker');
    const targets: readonly (number | null)[] = [
      ...Array<number>(20).fill(0),
      ...Array<number>(20).fill(250),
      ...Array<null>(20).fill(null),
      ...Array<number>(10).fill(0),
    ];
    const seen = new Set<number>();
    for (const target of targets) {
      const x = enemy.x;
      step(enemy, 1, aimAt(target));
      expect(enemy.x - x).toBe(enemy.vx);
      seen.add(enemy.vx);
    }
    expect(seen).toEqual(new Set([-1, 0, 1])); // the run really turned both ways
  });

  it('is 0 after leaving past the bottom', () => {
    const enemy = afterPeel('drone');
    step(enemy, 1, aimAt(0));
    expect(enemy.vx).toBe(-1);
    enemy.y = SCREEN_HEIGHT - 1;
    step(enemy, 1, aimAt(0));
    expect(enemy.state).toBe('returning');
    expect(enemy.vx).toBe(0);
  });

  it('is 0 after kill() in descend', () => {
    const enemy = afterPeel('drone');
    step(enemy, 1, aimAt(0));
    expect(enemy.vx).toBe(-1);
    enemy.kill();
    expect(enemy.state).toBe('exploding');
    expect(enemy.vx).toBe(0);
  });

  it.each([
    { side: 1, target: 0, dir: -1, edge: 'left' },
    { side: -1, target: 255, dir: 1, edge: 'right' },
  ] as const)('overshooting into the $edge screen edge zeroes vx', ({ side, target, dir }) => {
    const { enemy } = newEnemyOf('striker');
    enemy.startDive(diveOrder({ side }));
    step(enemy, P);
    const edgeX = dir > 0 ? SCREEN_WIDTH - enemy.width : 0;
    for (let i = 0; enemy.x !== edgeX; i++) {
      if (i >= 400) throw new Error('never reached the edge');
      step(enemy, 1, aimAt(target));
    }
    expect(enemy.vx).toBe(dir); // arrived at full speed, by its own steering
    for (let i = 0; i < STRIKER_TURN_TICKS; i++) {
      step(enemy, 1, aimAt(target));
      expect(enemy.x).toBe(edgeX);
      expect(enemy.vx).toBe(0);
    }
    expect(enemy.state).toBe('diving');
  });
});

describe('Enemy striker inertia', () => {
  const T = STRIKER_TURN_TICKS;

  it.each([
    [1, 0],
    [1, 250],
    [1, null],
    [-1, 0],
    [-1, 250],
    [-1, null],
  ] as const)('continues the peel arc on descend tick 1 (side %i, target %s)', (side, target) => {
    const { enemy } = newEnemyOf('striker');
    enemy.startDive(diveOrder({ side }));
    step(enemy, P);
    const x = enemy.x;
    step(enemy, 1, aimAt(target));
    expect(enemy.vx).toBe(side);
    expect(enemy.x - x).toBe(side);
  });

  it('reverses by the layout: T - 1 ticks on the old course, T ticks still, then back', () => {
    const enemy = afterPeel('striker'); // x = 127, the target is to the left
    const vxs: number[] = [];
    for (let d = 1; d <= 3 * T; d++) {
      step(enemy, 1, aimAt(0));
      vxs.push(enemy.vx);
    }
    expect(vxs).toEqual(vxs.map((_, i) => (i + 1 < T ? 1 : i + 1 < 2 * T ? 0 : -1)));
    expect(enemy.x).toBe(127 + (T - 1) - (T + 1));
  });

  it('wobbles within T - 1 px over a standing target', () => {
    const enemy = afterPeel('striker');
    const target = 160;
    let reached = false;
    let maxGap = 0;
    const dirs = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      step(enemy, 1, aimAt(target));
      if (enemy.state !== 'diving') break;
      if (Math.abs(centerX(enemy) - target) < 1) reached = true;
      if (!reached) continue;
      maxGap = Math.max(maxGap, Math.abs(centerX(enemy) - target));
      if (enemy.vx !== 0) dirs.add(enemy.vx);
    }
    expect(reached).toBe(true);
    expect(maxGap).toBeLessThanOrEqual(T - 1);
    expect(dirs).toEqual(new Set([-1, 1])); // it does wobble
  });

  it('sheds vx within T ticks when the target is gone, then flies straight down', () => {
    const enemy = afterPeel('striker');
    step(enemy, 20, aimAt(0)); // d = 16+: vx = -1
    expect(enemy.vx).toBe(-1);
    let n = 0;
    while (enemy.vx !== 0 && n <= T) {
      step(enemy, 1, aimAt(null));
      n++;
    }
    expect(n).toBeLessThanOrEqual(T);
    const x = enemy.x;
    for (let i = 0; i < 30; i++) {
      step(enemy, 1, aimAt(null));
      expect(enemy.vx).toBe(0);
      expect(enemy.x).toBe(x);
    }
  });

  it('starts the evasion scenario from EVASION_START', () => {
    const enemy = afterPeel('striker');
    expect({ x: enemy.x, y: enemy.y }).toEqual({ x: EVASION_START.x, y: EVASION_START.y });
  });

  it.each(EVASION_CASES)(
    'at $diveSpeed px/s rams a standing ship, misses a feint at y >= $turnY',
    ({ diveSpeed, turnY }) => {
      const standing = afterPeel('striker');
      const env = (t: number): EnemyEnv => aimAt(t, diveSpeed);
      expect(runEvasion(standing, (t) => step(standing, 1, env(t)), { move: 'stand' })).toBe('ram');
      const feinted = afterPeel('striker');
      expect(runEvasion(feinted, (t) => step(feinted, 1, env(t)), { move: 'feint', turnY })).toBe(
        'miss',
      );
    },
  );
});

describe('PEEL_SEGMENTS', () => {
  it('follows the arc limits', () => {
    expect(PEEL_SEGMENTS.length).toBeGreaterThan(0);
    for (const s of PEEL_SEGMENTS) {
      expect(Number.isInteger(s.ticks)).toBe(true);
      expect(s.ticks).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(s.vx)).toBe(true);
      expect(Number.isInteger(s.vy)).toBe(true);
      expect(s.vx).toBeGreaterThanOrEqual(0);
    }
    expect(PEEL_SEGMENTS[0]!.vy).toBeLessThan(0);
    expect(PEEL_SEGMENTS[PEEL_SEGMENTS.length - 1]!.vy).toBeGreaterThan(0);
    expect(Math.max(...PEEL_SEGMENTS.map((s) => s.vy))).toBeLessThanOrEqual(3);
  });
});

/** stateTicks of the ticks on which update() returned true, over n updates. */
function fireTicks(enemy: Enemy, n: number, env: EnemyEnv = ENV): number[] {
  const ticks: number[] = [];
  for (let i = 0; i < n; i++) if (enemy.update(TICK_SECONDS, env)) ticks.push(enemy.stateTicks);
  return ticks;
}

/** Updates until the enemy leaves its current state (at most 10 000 ticks); true if it fired. */
function firesBeforeLeaving(enemy: Enemy, env: EnemyEnv = ENV): boolean {
  const state = enemy.state;
  let fired = false;
  for (let i = 0; i < 10_000 && enemy.state === state; i++) {
    if (enemy.update(TICK_SECONDS, env)) fired = true;
  }
  if (enemy.state === state) throw new Error(`still ${state}`);
  return fired;
}

/** A diving enemy of the given kind with the given shots. */
function diver(kind: EnemyKind, shots: number): Enemy {
  const { enemy } = newEnemyOf(kind);
  enemy.startDive(diveOrder({ shots }));
  return enemy;
}

/** From 'returning' back into the formation. */
function backToFormation(enemy: Enemy): void {
  for (let i = 0; i < 10_000 && enemy.state !== 'formation'; i++) step(enemy, 1);
  if (enemy.state !== 'formation') throw new Error('expected formation');
}

describe('Enemy fire', () => {
  const D = P + 1;
  const KINDS = ['drone', 'striker', 'raider'] as const;

  it('fires every ENEMY_FIRE_INTERVAL_TICKS = 20 ticks', () => {
    expect(ENEMY_FIRE_INTERVAL_TICKS).toBe(20);
  });

  it.each(KINDS)('%s with one shot fires once, on the first descend tick', (kind) => {
    const enemy = diver(kind, 1);
    expect(fireTicks(enemy, P)).toEqual([]);
    expect(fireTicks(enemy, 1)).toEqual([D]);
    expect(firesBeforeLeaving(enemy)).toBe(false);
    expect(enemy.state).toBe('returning');
  });

  it.each(KINDS)('%s with three shots fires on D, D + 20, D + 40', (kind) => {
    const enemy = diver(kind, 3);
    expect(fireTicks(enemy, P + 1 + 60)).toEqual([
      D,
      D + ENEMY_FIRE_INTERVAL_TICKS,
      D + 2 * ENEMY_FIRE_INTERVAL_TICKS,
    ]);
  });

  it.each(KINDS)('%s with no shots never fires', (kind) => {
    const enemy = diver(kind, 0);
    expect(firesBeforeLeaving(enemy)).toBe(false);
    expect(enemy.state).toBe('returning');
  });

  it.each(KINDS)('%s fires the same with and without a target', (kind) => {
    const a = diver(kind, 3);
    const b = diver(kind, 3);
    expect(fireTicks(a, P + 61, aimAt(null))).toEqual(fireTicks(b, P + 61, aimAt(30)));
  });

  it('fires when its bottom reaches SHIP_Y after the move', () => {
    const enemy = diver('drone', 1);
    step(enemy, P);
    enemy.y = SHIP_Y - enemy.height - 1;
    expect(fireTicks(enemy, 1)).toEqual([D]);
    expect(enemy.y + enemy.height).toBe(SHIP_Y);
  });

  it('does not fire once its bottom is below SHIP_Y after the move, and never later', () => {
    const enemy = diver('drone', 2);
    step(enemy, P);
    enemy.y = SHIP_Y - enemy.height;
    expect(fireTicks(enemy, 1)).toEqual([]);
    expect(enemy.y + enemy.height).toBe(SHIP_Y + 1);
    expect(fireTicks(enemy, ENEMY_FIRE_INTERVAL_TICKS)).toEqual([]);
  });

  it('does not fire on the tick it leaves past the bottom', () => {
    const enemy = diver('drone', 1);
    step(enemy, P);
    enemy.y = SCREEN_HEIGHT - 1;
    expect(enemy.update(TICK_SECONDS, ENV)).toBe(false);
    expect(enemy.state).toBe('returning');
  });

  it('never fires in formation, returning, exploding or dead', () => {
    const { enemy } = newEnemy();
    expect(fireTicks(enemy, 100)).toEqual([]);

    const returning = newEnemy().enemy;
    toReturning(returning);
    expect(firesBeforeLeaving(returning)).toBe(false);
    expect(returning.state).toBe('formation');

    const hit = diver('drone', 1);
    step(hit, P);
    hit.kill();
    expect(firesBeforeLeaving(hit)).toBe(false);
    expect(hit.state).toBe('dead');
    expect(fireTicks(hit, 10)).toEqual([]);
  });

  it("a new dive takes the new order's shots", () => {
    const enemy = diver('drone', 3);
    expect(fireTicks(enemy, D)).toEqual([D]);
    enemy.y = SCREEN_HEIGHT - 1;
    step(enemy, 1);
    expect(enemy.state).toBe('returning');
    backToFormation(enemy);
    enemy.startDive(diveOrder({ sortieId: 2, shots: 1 }));
    const ticks: number[] = [];
    for (let i = 0; i < 10_000 && enemy.state === 'diving'; i++) {
      if (enemy.update(TICK_SECONDS, ENV)) ticks.push(enemy.stateTicks);
    }
    expect(ticks).toEqual([D]);
  });

  it('shots left from a dive do not carry over to the next one', () => {
    const enemy = diver('drone', 1);
    expect(firesBeforeLeaving(enemy)).toBe(true);
    backToFormation(enemy);
    enemy.startDive(diveOrder({ sortieId: 2 }));
    expect(firesBeforeLeaving(enemy)).toBe(false);
  });
});

/** Raiders at the given columns of row 0, sharing one formation, all launched on one tick. */
function launchGroup(cols: readonly number[], side: -1 | 1): Enemy[] {
  const formation = new Formation(10, 1, 15);
  const leader = side === -1 ? cols[0]! : cols[cols.length - 1]!;
  const offsets = cols.map((c) => (c - leader) * CELL_WIDTH);
  const groupMinOffsetX = Math.min(...offsets);
  const groupMaxOffsetX = Math.max(...offsets);
  return cols.map((col, i) => {
    const e = new Enemy({ row: 0, col, kind: 'raider', group: 0 }, formation);
    e.startDive(diveOrder({ side, aimOffsetX: offsets[i]!, groupMinOffsetX, groupMaxOffsetX }));
    return e;
  });
}

/** One tick for every member with the same env. */
function stepAll(members: readonly Enemy[], env: EnemyEnv): void {
  for (const m of members) m.update(TICK_SECONDS, env);
}

/**
 * Runs the group with env until a member leaves 'diving'; on every descend tick checks the
 * spacing and the screen bounds. Returns the members' center X on the last all-diving tick.
 */
function flyGroup(members: readonly Enemy[], env: EnemyEnv): number[] {
  let centers = members.map(centerX);
  for (let tick = 1; tick < 10_000; tick++) {
    stepAll(members, env);
    if (members.some((m) => m.state !== 'diving')) return centers;
    centers = members.map(centerX);
    if (tick > P) {
      for (let i = 1; i < members.length; i++) {
        expect(members[i]!.x - members[i - 1]!.x).toBe(CELL_WIDTH);
      }
      for (const m of members) {
        expect(m.x).toBeGreaterThanOrEqual(0);
        expect(m.x).toBeLessThanOrEqual(SCREEN_WIDTH - m.width);
      }
    }
  }
  throw new Error('group never left the dive');
}

describe('Enemy group aim', () => {
  const W = RAIDER_SPRITE.width;
  const HALF = Math.floor(W / 2);

  it('near the right edge the whole group shifts left and keeps its spacing', () => {
    const group = launchGroup([1, 2, 3], -1);
    const hi = SCREEN_WIDTH - W + HALF - 32;
    const centers = flyGroup(group, aimAt(248));
    expect(centers).toEqual([hi, hi + 16, hi + 32]);
    expect(centers[2]! - HALF).toBe(SCREEN_WIDTH - W);
  });

  it('near the left edge the whole group shifts right and keeps its spacing', () => {
    const group = launchGroup([6, 7, 8], 1);
    const lo = HALF + 32;
    const centers = flyGroup(group, aimAt(7));
    expect(centers).toEqual([lo - 32, lo - 16, lo]);
    expect(centers[0]! - HALF).toBe(0);
  });

  it('away from the edges each member aims at the target plus its offset', () => {
    const group = launchGroup([1, 2, 3], -1);
    expect(flyGroup(group, aimAt(100))).toEqual([100, 116, 132]);
  });

  it('with no target on the first descend tick all members fly straight down', () => {
    const group = launchGroup([1, 2, 3], -1);
    for (let i = 0; i < P; i++) stepAll(group, aimAt(100));
    stepAll(group, aimAt(null));
    const xs = group.map((m) => m.x);
    for (let i = 0; i < 50; i++) {
      stepAll(group, aimAt(100));
      expect(group.map((m) => m.x)).toEqual(xs);
    }
  });

  it('every kind reads the group offsets: a striker aims at the target plus its offset', () => {
    const plain = afterPeel('striker');
    const { enemy: offset } = newEnemyOf('striker');
    offset.startDive(diveOrder({ aimOffsetX: 32, groupMinOffsetX: 0, groupMaxOffsetX: 32 }));
    step(offset, P);
    expect(offset.x).toBe(plain.x);
    for (let i = 0; i < 60; i++) {
      const target = i < 30 ? 60 : 150;
      step(plain, 1, aimAt(target + 32));
      step(offset, 1, aimAt(target));
      expect(offset.x).toBe(plain.x);
    }
    expect(centerX(offset)).toBe(133);
    expect(offset.state).toBe('diving');
  });

  it('a new dive does not keep the offsets of the previous order', () => {
    const { enemy } = newEnemyOf('raider');
    enemy.startDive(diveOrder({ aimOffsetX: 32, groupMinOffsetX: 0, groupMaxOffsetX: 32 }));
    for (let i = 0; i < 10_000 && enemy.state !== 'formation'; i++) step(enemy, 1, aimAt(100));
    expect(enemy.state).toBe('formation');
    enemy.startDive(diveOrder({ sortieId: 2 }));
    step(enemy, P);
    for (let i = 0; i < 100; i++) step(enemy, 1, aimAt(100));
    expect(centerX(enemy)).toBe(100);
  });
});
