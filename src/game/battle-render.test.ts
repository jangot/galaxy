import { describe, expect, it } from 'vitest';
import { TICK_SECONDS } from '../config';
import { createRng } from '../engine/rng';
import { SHIELD_COLORS, SHIELD_OFFSET_Y, SHIELD_SPRITES, SHIP_SPRITE, SHOT_COLOR } from './art';
import type { BattleOptions } from './battle';
import { Battle, GAME_OVER_DELAY_TICKS } from './battle';
import { ASTEROID_SPRITE, CAPSULE_SPRITES } from './bonus-art';
import { ASTEROID_SPAWN_MIN_TICKS } from './bonus-field';
import { BLINK_TICKS, drawBattle } from './battle-render';
import type { FillCall } from './canvas-test-utils';
import type { Rect } from './collisions';
import { recorder } from './canvas-test-utils';
import { ENEMY_KINDS, EXPLOSION_FRAME_TICKS, EXPLOSION_TICKS, PEEL_SEGMENTS } from './enemy';
import { DRONE_SPRITE, ENEMY_SHOT_COLOR, EXPLOSION_FRAMES } from './enemy-art';
import { ENEMY_SHOT_HEIGHT, ENEMY_SHOT_WIDTH } from './enemy-shot';
import type { PlayerIntent } from './player';
import { INVULNERABLE_TICKS, MAX_SHIELD, START_SHIELD } from './player';
import { SHIP_HEIGHT, SHIP_START_X, SHIP_WIDTH, SHIP_Y } from './ship';
import { SHOT_HEIGHT, SHOT_WIDTH } from './shot';
import type { Sprite } from './sprite';
import { diveOrder, ONE_CORNER_ENEMY } from './test-levels';
import { onlyShot } from './test-shots';

/** Expected calls for a sprite at (x, y), built from the pixel data, not via drawSprite. */
function spriteCalls(sprite: Sprite, x: number, y: number): FillCall[] {
  const calls: FillCall[] = [];
  for (let row = 0; row < sprite.height; row++) {
    for (let col = 0; col < sprite.width; col++) {
      const color = sprite.pixels[row * sprite.width + col];
      if (color != null) calls.push({ fillStyle: color, x: x + col, y: y + row, w: 1, h: 1 });
    }
  }
  return calls;
}

/** Expected calls for the shield arc of `shield` above a ship at (x, y); none at 0. */
function shieldCalls(x: number, y: number, shield: number): FillCall[] {
  const arc = SHIELD_SPRITES[shield];
  return arc ? spriteCalls(arc, x, y + SHIELD_OFFSET_Y) : [];
}

/** Expected calls for the ship at (x, y) and its shield arc (default START_SHIELD), in draw order. */
function shipCalls(x: number, y: number, shield: number = START_SHIELD): FillCall[] {
  return [...spriteCalls(SHIP_SPRITE, x, y), ...shieldCalls(x, y, shield)];
}

/** Expected calls for every enemy of the wave, in wave order. */
function enemyCalls(battle: Battle): FillCall[] {
  return battle.wave.enemies.flatMap((e) =>
    spriteCalls(ENEMY_KINDS[e.kind].sprite, Math.floor(e.x), Math.floor(e.y)),
  );
}

function opaquePixels(sprite: Sprite): number {
  return sprite.pixels.filter((p) => p != null).length;
}

function newBattle(opts: BattleOptions = {}): Battle {
  return new Battle(createRng(1), { levels: ONE_CORNER_ENEMY, ...opts });
}

const FIRE: PlayerIntent = { move: 0, fire: true };
const RIGHT: PlayerIntent = { move: 1, fire: false };
const IDLE: PlayerIntent = { move: 0, fire: false };

/** Expected calls for an explosion frame centered in the rectangle (an enemy, the asteroid). */
function explosionCalls(rect: Rect, frame: Sprite): FillCall[] {
  return spriteCalls(
    frame,
    Math.floor(rect.x) + Math.floor((rect.width - frame.width) / 2),
    Math.floor(rect.y) + Math.floor((rect.height - frame.height) / 2),
  );
}

/** A one-enemy battle with the bonus field on a stub rng: the asteroid spawns on tick 300. */
function bonusBattle(): Battle {
  return new Battle(createRng(1), { levels: ONE_CORNER_ENEMY, bonuses: { rng: () => 0 } });
}

describe('drawBattle', () => {
  it('draws the enemies, then the ship, when there is no shot', () => {
    const battle = newBattle();
    const { ctx, calls } = recorder();
    drawBattle(ctx, battle);
    expect(calls).toEqual([...enemyCalls(battle), ...shipCalls(battle.player.ship.x, SHIP_Y)]);
  });

  it('draws the shot first, then the enemies, then the ship', () => {
    const battle = newBattle();
    battle.update(TICK_SECONDS, FIRE);
    const shot = onlyShot(battle.player);
    expect(shot).not.toBeNull();
    const { ctx, calls } = recorder();
    drawBattle(ctx, battle);
    expect(calls).toEqual([
      { fillStyle: SHOT_COLOR, x: shot!.x, y: shot!.y, w: SHOT_WIDTH, h: SHOT_HEIGHT },
      ...enemyCalls(battle),
      ...shipCalls(battle.player.ship.x, SHIP_Y),
    ]);
  });

  it('with doubleShot draws both shots in shots order, then the enemies, then the ship', () => {
    const battle = newBattle();
    battle.player.grantPowerUp('doubleShot');
    battle.update(TICK_SECONDS, FIRE);
    battle.player.ship.x = 60;
    battle.update(TICK_SECONDS, FIRE);
    const shots = battle.player.shots;
    expect(shots).toHaveLength(2);
    expect(shots[0]!.x).not.toBe(shots[1]!.x);
    const { ctx, calls } = recorder();
    drawBattle(ctx, battle);
    expect(calls).toEqual([
      ...shots.map((s) => ({
        fillStyle: SHOT_COLOR,
        x: s.x,
        y: s.y,
        w: SHOT_WIDTH,
        h: SHOT_HEIGHT,
      })),
      ...enemyCalls(battle),
      ...shipCalls(battle.player.ship.x, SHIP_Y),
    ]);
  });

  it('moves the ship calls together with the ship', () => {
    const battle = newBattle();
    const x0 = battle.player.ship.x;
    for (let i = 0; i < 5; i++) battle.update(TICK_SECONDS, RIGHT);
    expect(battle.player.ship.x).not.toBe(x0);
    const { ctx, calls } = recorder();
    drawBattle(ctx, battle);
    expect(calls).toEqual([...enemyCalls(battle), ...shipCalls(battle.player.ship.x, SHIP_Y)]);
  });

  it('floors fractional coordinates', () => {
    const battle = newBattle();
    battle.update(TICK_SECONDS, FIRE);
    const shot = onlyShot(battle.player)!;
    shot.y += 0.5;
    battle.player.ship.x = 10.5;
    const { ctx, calls } = recorder();
    drawBattle(ctx, battle);
    expect(calls).toEqual([
      {
        fillStyle: SHOT_COLOR,
        x: shot.x,
        y: Math.floor(shot.y),
        w: SHOT_WIDTH,
        h: SHOT_HEIGHT,
      },
      ...enemyCalls(battle),
      ...shipCalls(10, SHIP_Y),
    ]);
  });

  it('floors fractional enemy coordinates', () => {
    const battle = newBattle();
    const enemy = battle.wave.enemies[0]!;
    // Only update() rewrites the position, so draw without updating.
    enemy.x = 42.75;
    enemy.y = 34.5;
    const { ctx, calls } = recorder();
    drawBattle(ctx, battle);
    expect(calls).toEqual([
      ...spriteCalls(DRONE_SPRITE, 42, 34),
      ...shipCalls(battle.player.ship.x, SHIP_Y),
    ]);
  });

  it('draws every enemy of the default wave', () => {
    const battle = new Battle(createRng(1));
    expect(battle.wave.enemies).toHaveLength(28);
    const { ctx, calls } = recorder();
    drawBattle(ctx, battle);
    const enemyPixels = battle.wave.enemies.reduce(
      (sum, e) => sum + opaquePixels(ENEMY_KINDS[e.kind].sprite),
      0,
    );
    expect(calls).toHaveLength(
      enemyPixels + opaquePixels(SHIP_SPRITE) + opaquePixels(SHIELD_SPRITES[START_SHIELD]!),
    );
  });
});

describe('drawBattle explosions', () => {
  it('draws explosion frame 0 centered in the enemy right after kill()', () => {
    const battle = newBattle();
    const enemy = battle.wave.enemies[0]!;
    enemy.kill();
    const frame = EXPLOSION_FRAMES[0]!;
    const { ctx, calls } = recorder();
    drawBattle(ctx, battle);
    // An 11×9 frame over the 11×8 drone at (42, 34) lands at (42, 33).
    expect(explosionCalls(enemy, frame)).toEqual(spriteCalls(frame, 42, 33));
    expect(calls).toEqual([
      ...explosionCalls(enemy, frame),
      ...shipCalls(battle.player.ship.x, SHIP_Y),
    ]);
  });

  it('switches to frame 1 after EXPLOSION_FRAME_TICKS, in the same place', () => {
    const battle = newBattle();
    const enemy = battle.wave.enemies[0]!;
    enemy.kill();
    const { x, y } = enemy;
    for (let i = 0; i < EXPLOSION_FRAME_TICKS; i++) battle.update(TICK_SECONDS, IDLE);
    expect(enemy.x).toBe(x);
    expect(enemy.y).toBe(y);
    const frame = EXPLOSION_FRAMES[1]!;
    const { ctx, calls } = recorder();
    drawBattle(ctx, battle);
    // A 13×9 frame over the 11×8 drone at (42, 34) lands at (41, 33).
    expect(explosionCalls(enemy, frame)).toEqual(spriteCalls(frame, 41, 33));
    expect(calls).toEqual([
      ...explosionCalls(enemy, frame),
      ...shipCalls(battle.player.ship.x, SHIP_Y),
    ]);
  });

  it('still draws frame 1 on the last explosion tick', () => {
    const battle = newBattle();
    const enemy = battle.wave.enemies[0]!;
    enemy.kill();
    for (let i = 0; i < EXPLOSION_TICKS - 1; i++) battle.update(TICK_SECONDS, IDLE);
    expect(enemy.state).toBe('exploding');
    expect(enemy.stateTicks).toBe(EXPLOSION_TICKS - 1);
    const { ctx, calls } = recorder();
    drawBattle(ctx, battle);
    expect(calls).toEqual([
      ...explosionCalls(enemy, EXPLOSION_FRAMES[1]!),
      ...shipCalls(battle.player.ship.x, SHIP_Y),
    ]);
  });

  it('draws nothing for a dead enemy', () => {
    const battle = newBattle();
    const enemy = battle.wave.enemies[0]!;
    enemy.kill();
    for (let i = 0; i < EXPLOSION_TICKS; i++) battle.update(TICK_SECONDS, IDLE);
    expect(enemy.state).toBe('dead');
    const { ctx, calls } = recorder();
    drawBattle(ctx, battle);
    expect(calls).toEqual(shipCalls(battle.player.ship.x, SHIP_Y));
  });
});

function run(battle: Battle, n: number, intent: PlayerIntent = IDLE): void {
  for (let i = 0; i < n; i++) battle.update(TICK_SECONDS, intent);
}

/** Expected calls for an explosion frame centered in the ship's 15 x 16 rectangle. */
function shipExplosionCalls(battle: Battle, frame: Sprite): FillCall[] {
  return spriteCalls(
    frame,
    Math.floor(battle.player.ship.x) + Math.floor((SHIP_WIDTH - frame.width) / 2),
    SHIP_Y + Math.floor((SHIP_HEIGHT - frame.height) / 2),
  );
}

function draw(battle: Battle): FillCall[] {
  const { ctx, calls } = recorder();
  drawBattle(ctx, battle);
  return calls;
}

describe('drawBattle ship states', () => {
  it('the ship explosion ends before game over', () => {
    expect(EXPLOSION_TICKS).toBeLessThan(GAME_OVER_DELAY_TICKS);
  });

  it('draws explosion frame 0 centered in the ship on the hit tick', () => {
    const battle = newBattle({ shield: 0 });
    battle.player.hit();
    const frame = EXPLOSION_FRAMES[0]!;
    // An 11x9 frame over the 15x16 ship at (120, 208) lands at (122, 211).
    expect(shipExplosionCalls(battle, frame)).toEqual(spriteCalls(frame, 122, 211));
    expect(draw(battle)).toEqual([...enemyCalls(battle), ...shipExplosionCalls(battle, frame)]);
  });

  it('switches to frame 1 after EXPLOSION_FRAME_TICKS', () => {
    const battle = newBattle({ shield: 0 });
    battle.player.hit();
    run(battle, EXPLOSION_FRAME_TICKS);
    const frame = EXPLOSION_FRAMES[1]!;
    // A 13x9 frame lands at (121, 211).
    expect(shipExplosionCalls(battle, frame)).toEqual(spriteCalls(frame, 121, 211));
    expect(draw(battle)).toEqual([...enemyCalls(battle), ...shipExplosionCalls(battle, frame)]);
  });

  it('draws frame 1 on the last explosion tick, then no ship', () => {
    const battle = newBattle({ shield: 0 });
    battle.player.hit();
    run(battle, EXPLOSION_TICKS - 1);
    expect(draw(battle)).toEqual([
      ...enemyCalls(battle),
      ...shipExplosionCalls(battle, EXPLOSION_FRAMES[1]!),
    ]);
    run(battle, 1);
    expect(battle.player.state).toBe('down');
    expect(draw(battle)).toEqual(enemyCalls(battle));
  });

  it('draws the player shot while the ship is down', () => {
    const battle = newBattle({ shield: 0 });
    battle.update(TICK_SECONDS, FIRE);
    battle.player.hit();
    battle.update(TICK_SECONDS, IDLE);
    const shot = onlyShot(battle.player)!;
    expect(shot).not.toBeNull();
    expect(battle.player.stateTicks).toBe(1);
    expect(draw(battle)).toEqual([
      { fillStyle: SHOT_COLOR, x: shot.x, y: shot.y, w: SHOT_WIDTH, h: SHOT_HEIGHT },
      ...enemyCalls(battle),
      ...shipExplosionCalls(battle, EXPLOSION_FRAMES[0]!),
    ]);
  });

  it('blinks the ship where it was hit: shown, hidden, shown', () => {
    const battle = newBattle();
    battle.player.ship.x = 40;
    battle.player.hit();
    expect(battle.player.state).toBe('invulnerable');
    expect(battle.player.shield).toBe(1);
    expect(battle.player.stateTicks).toBe(0);
    expect(draw(battle)).toEqual([...enemyCalls(battle), ...shipCalls(40, SHIP_Y, 1)]);
    run(battle, BLINK_TICKS);
    expect(draw(battle)).toEqual(enemyCalls(battle));
    run(battle, BLINK_TICKS);
    expect(draw(battle)).toEqual([...enemyCalls(battle), ...shipCalls(40, SHIP_Y, 1)]);
  });

  it('draws the ship again once active, where blinking would hide it', () => {
    // The last invulnerable tick (119) falls in an odd (hidden) blink period: 116-119 hidden, 120 active.
    expect(Math.floor((INVULNERABLE_TICKS - 1) / BLINK_TICKS) % 2).toBe(1);
    const battle = newBattle();
    battle.player.hit();
    run(battle, INVULNERABLE_TICKS - 1);
    expect(battle.player.state).toBe('invulnerable');
    expect(draw(battle)).toEqual(enemyCalls(battle));
    run(battle, 1);
    expect(battle.player.state).toBe('active');
    expect(draw(battle)).toEqual([...enemyCalls(battle), ...shipCalls(SHIP_START_X, SHIP_Y, 1)]);
  });
});

describe('drawBattle shield arc', () => {
  it('draws the arc after the ship, above it, in the level color, for every level', () => {
    for (let k = 1; k <= MAX_SHIELD; k++) {
      const battle = newBattle({ shield: k });
      const x = battle.player.ship.x;
      const calls = draw(battle);
      expect(calls).toEqual([...enemyCalls(battle), ...shipCalls(x, SHIP_Y, k)]);
      const arc = calls.slice(-opaquePixels(SHIELD_SPRITES[k]!));
      expect(arc.every((c) => c.fillStyle === SHIELD_COLORS[k])).toBe(true);
      expect(Math.min(...arc.map((c) => c.y))).toBe(SHIP_Y + SHIELD_OFFSET_Y);
    }
  });

  it('draws no arc at shield 0', () => {
    const battle = newBattle({ shield: 0 });
    expect(draw(battle)).toEqual([
      ...enemyCalls(battle),
      ...spriteCalls(SHIP_SPRITE, battle.player.ship.x, SHIP_Y),
    ]);
  });

  it('draws no arc while the ship is down', () => {
    const battle = newBattle({ shield: 0 });
    battle.player.hit();
    expect(battle.player.state).toBe('down');
    // Exact list: the enemy (drone green = level 5 color) sits above SHIP_Y, so no color filter.
    expect(draw(battle)).toEqual([
      ...enemyCalls(battle),
      ...shipExplosionCalls(battle, EXPLOSION_FRAMES[0]!),
    ]);
  });

  it('hides the arc together with the ship in the hidden blink phase', () => {
    const battle = newBattle();
    battle.player.hit();
    run(battle, BLINK_TICKS);
    expect(battle.player.state).toBe('invulnerable');
    expect(battle.player.shield).toBe(1);
    expect(draw(battle)).toEqual(enemyCalls(battle));
  });

  it('recolors the arc on the hit tick', () => {
    const battle = newBattle({ shield: 3 });
    battle.player.ship.x = 40;
    battle.player.hit();
    expect(battle.player.shield).toBe(2);
    expect(draw(battle)).toEqual([...enemyCalls(battle), ...shipCalls(40, SHIP_Y, 2)]);
  });

  it('a hit at shield 1 leaves the blinking ship without an arc', () => {
    const battle = newBattle({ shield: 1 });
    battle.player.ship.x = 40;
    battle.player.hit();
    expect(battle.player.state).toBe('invulnerable');
    expect(battle.player.shield).toBe(0);
    expect(draw(battle)).toEqual([...enemyCalls(battle), ...shipCalls(40, SHIP_Y, 0)]);
  });
});

describe('drawBattle enemy shots', () => {
  const P = PEEL_SEGMENTS.reduce((sum, s) => sum + s.ticks, 0);

  /** The only enemy dives with one shot; its shot appears on the last of P + 1 ticks. */
  function battleWithEnemyShot(lastIntent: PlayerIntent = IDLE, battle = newBattle()): Battle {
    battle.wave.enemies[0]!.startDive(diveOrder({ shots: 1 }));
    run(battle, P);
    battle.update(TICK_SECONDS, lastIntent);
    expect(battle.wave.shots).toHaveLength(1);
    return battle;
  }

  it('draws the enemy shots first', () => {
    const battle = battleWithEnemyShot();
    const s = battle.wave.shots[0]!;
    expect(draw(battle)).toEqual([
      {
        fillStyle: ENEMY_SHOT_COLOR,
        x: Math.floor(s.x),
        y: Math.floor(s.y),
        w: ENEMY_SHOT_WIDTH,
        h: ENEMY_SHOT_HEIGHT,
      },
      ...enemyCalls(battle),
      ...shipCalls(battle.player.ship.x, SHIP_Y),
    ]);
  });

  it('draws enemy shots, the player shot, enemies, then the ship', () => {
    const battle = battleWithEnemyShot(FIRE);
    const s = battle.wave.shots[0]!;
    const shot = onlyShot(battle.player)!;
    expect(shot).not.toBeNull();
    expect(draw(battle)).toEqual([
      {
        fillStyle: ENEMY_SHOT_COLOR,
        x: Math.floor(s.x),
        y: Math.floor(s.y),
        w: ENEMY_SHOT_WIDTH,
        h: ENEMY_SHOT_HEIGHT,
      },
      {
        fillStyle: SHOT_COLOR,
        x: Math.floor(shot.x),
        y: Math.floor(shot.y),
        w: SHOT_WIDTH,
        h: SHOT_HEIGHT,
      },
      ...enemyCalls(battle),
      ...shipCalls(battle.player.ship.x, SHIP_Y),
    ]);
  });

  it('draws the asteroid behind everything: asteroid, enemy shots, player shot, enemies, ship', () => {
    const battle = battleWithEnemyShot(FIRE, asteroidBattle());
    const asteroid = battle.bonuses!.asteroid!;
    expect(asteroid.state).toBe('flying');
    const s = battle.wave.shots[0]!;
    const shot = onlyShot(battle.player)!;
    expect(shot).not.toBeNull();
    expect(draw(battle)).toEqual([
      ...spriteCalls(ASTEROID_SPRITE, Math.floor(asteroid.x), Math.floor(asteroid.y)),
      {
        fillStyle: ENEMY_SHOT_COLOR,
        x: Math.floor(s.x),
        y: Math.floor(s.y),
        w: ENEMY_SHOT_WIDTH,
        h: ENEMY_SHOT_HEIGHT,
      },
      {
        fillStyle: SHOT_COLOR,
        x: Math.floor(shot.x),
        y: Math.floor(shot.y),
        w: SHOT_WIDTH,
        h: SHOT_HEIGHT,
      },
      ...enemyCalls(battle),
      ...shipCalls(battle.player.ship.x, SHIP_Y),
    ]);
  });

  it('draws the capsule over the asteroid explosion and under the enemy shots', () => {
    const battle = battleWithEnemyShot(FIRE, asteroidBattle());
    const asteroid = battle.bonuses!.asteroid!;
    expect(battle.bonuses!.hitAsteroid()).toBe(true);
    const capsule = battle.bonuses!.capsule!;
    const s = battle.wave.shots[0]!;
    const shot = onlyShot(battle.player)!;
    expect(shot).not.toBeNull();
    expect(draw(battle)).toEqual([
      ...explosionCalls(asteroid, EXPLOSION_FRAMES[0]!),
      ...spriteCalls(CAPSULE_SPRITES[capsule.kind], capsule.x, capsule.y),
      {
        fillStyle: ENEMY_SHOT_COLOR,
        x: Math.floor(s.x),
        y: Math.floor(s.y),
        w: ENEMY_SHOT_WIDTH,
        h: ENEMY_SHOT_HEIGHT,
      },
      {
        fillStyle: SHOT_COLOR,
        x: Math.floor(shot.x),
        y: Math.floor(shot.y),
        w: SHOT_WIDTH,
        h: SHOT_HEIGHT,
      },
      ...enemyCalls(battle),
      ...shipCalls(battle.player.ship.x, SHIP_Y),
    ]);
  });

  it('the enemy shot color differs from the player shot and the ship', () => {
    expect(ENEMY_SHOT_COLOR).not.toBe(SHOT_COLOR);
    expect(SHIP_SPRITE.pixels).not.toContain(ENEMY_SHOT_COLOR);
  });
});

/** bonusBattle run up to the asteroid's spawn: it is flying at its start position. */
function asteroidBattle(): Battle {
  const battle = bonusBattle();
  run(battle, ASTEROID_SPAWN_MIN_TICKS);
  expect(battle.bonuses!.asteroid).not.toBeNull();
  return battle;
}

describe('drawBattle asteroid', () => {
  it('draws a flying asteroid at floored coordinates first, then enemies and the ship', () => {
    const battle = asteroidBattle();
    const asteroid = battle.bonuses!.asteroid!;
    asteroid.x = 100.5;
    asteroid.y = 50.75;
    expect(draw(battle)).toEqual([
      ...spriteCalls(ASTEROID_SPRITE, 100, 50),
      ...enemyCalls(battle),
      ...shipCalls(battle.player.ship.x, SHIP_Y),
    ]);
  });

  it('draws nothing extra before the asteroid spawns', () => {
    expect(draw(bonusBattle())).toEqual(draw(newBattle()));
  });

  it('an exploding asteroid shows the explosion frames centered in it', () => {
    const battle = asteroidBattle();
    const asteroid = battle.bonuses!.asteroid!;
    asteroid.hit();
    expect(draw(battle)).toEqual([
      ...explosionCalls(asteroid, EXPLOSION_FRAMES[0]!),
      ...enemyCalls(battle),
      ...shipCalls(battle.player.ship.x, SHIP_Y),
    ]);
    run(battle, EXPLOSION_FRAME_TICKS);
    expect(asteroid.state).toBe('exploding');
    expect(draw(battle)).toEqual([
      ...explosionCalls(asteroid, EXPLOSION_FRAMES[1]!),
      ...enemyCalls(battle),
      ...shipCalls(battle.player.ship.x, SHIP_Y),
    ]);
  });

  it('draws the capsule of the broken asteroid over its explosion, at floored coordinates', () => {
    const battle = asteroidBattle();
    const asteroid = battle.bonuses!.asteroid!;
    asteroid.x = 100.5;
    asteroid.y = 50;
    expect(battle.bonuses!.hitAsteroid()).toBe(true);
    // The stub rng () => 0 gives a 'shield' asteroid; the sprite follows capsule.kind.
    expect(battle.bonuses!.capsule!.kind).toBe(asteroid.bonus);
    expect(draw(battle)).toEqual([
      ...explosionCalls(asteroid, EXPLOSION_FRAMES[0]!),
      ...spriteCalls(CAPSULE_SPRITES[asteroid.bonus], 102, 52),
      ...enemyCalls(battle),
      ...shipCalls(battle.player.ship.x, SHIP_Y),
    ]);
  });

  it('draws the capsule alone once the asteroid is gone', () => {
    const battle = asteroidBattle();
    const asteroid = battle.bonuses!.asteroid!;
    asteroid.x = 100.5;
    asteroid.y = 50;
    battle.bonuses!.hitAsteroid();
    run(battle, EXPLOSION_TICKS);
    expect(battle.bonuses!.asteroid).toBeNull();
    expect(draw(battle)).toEqual([
      ...spriteCalls(CAPSULE_SPRITES[asteroid.bonus], 102, 52 + EXPLOSION_TICKS),
      ...enemyCalls(battle),
      ...shipCalls(battle.player.ship.x, SHIP_Y),
    ]);
  });
});
