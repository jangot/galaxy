import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT, SCREEN_WIDTH, TICK_SECONDS } from '../../config';
import { Input } from '../../engine/input';
import { createRng } from '../../engine/rng';
import type { Scene } from '../../engine/scene';
import { Battle, GAME_OVER_DELAY_TICKS } from '../battle';
import { BONUS_KINDS } from '../bonus';
import { ASTEROID_SPAWN_MAX_TICKS, ASTEROID_SPAWN_MIN_TICKS } from '../bonus-field';
import { recorder } from '../canvas-test-utils';
import { drawGameOver } from '../game-over-render';
import { Player } from '../player';
import { SHIP_SPEED, SHIP_WIDTH, SHIP_Y, Ship } from '../ship';
import { SHOT_HEIGHT, SHOT_SPEED } from '../shot';
import { Starfield } from '../starfield';
import { ONE_CORNER_ENEMY, TWO_LEVELS } from '../test-levels';
import { PlayScene } from './play-scene';
import { step } from './scene-test-utils';
import { onlyShot } from '../test-shots';

const STEP = SHIP_SPEED * TICK_SECONDS;
/** Ticks after launch while the shot is still on screen (y reaches exactly 0). */
const TICKS_ON_SCREEN = (SHIP_Y - SHOT_HEIGHT) / (SHOT_SPEED * TICK_SECONDS);

/** One enemy far from the ship's shot column, so ship and shot tests are not disturbed by hits. */
function newScene(): PlayScene {
  return new PlayScene(createRng(1), undefined, { levels: ONE_CORNER_ENEMY });
}

/** Quick game over: one life, a manual hit, then the delay. */
function overScene(exit?: () => Scene): PlayScene {
  const scene = new PlayScene(
    createRng(1),
    undefined,
    { levels: ONE_CORNER_ENEMY, lives: 1 },
    exit,
  );
  scene.battle.player.hit();
  step(scene, new Input(), GAME_OVER_DELAY_TICKS);
  expect(scene.battle.phase).toBe('over');
  return scene;
}

/** A stub scene and a spy factory returning it. */
function spyExit(): { exit: () => Scene; target: Scene; calls: () => number } {
  const target: Scene = { update: () => undefined, render: () => undefined };
  let n = 0;
  return {
    exit: () => {
      n++;
      return target;
    },
    target,
    calls: () => n,
  };
}

describe('PlayScene', () => {
  it('places the ship at the start position', () => {
    const scene = newScene();
    expect(scene.battle).toBeInstanceOf(Battle);
    expect(scene.battle.player).toBeInstanceOf(Player);
    expect(scene.battle.player.ship.x).toBe(new Ship().x);
    expect(scene.battle.player.ship.y).toBe(SHIP_Y);
  });

  it('stays still when both directions are held', () => {
    const scene = newScene();
    const { x, y } = scene.battle.player.ship;
    const input = new Input();
    input.press('left');
    input.press('right');
    step(scene, input, 30);
    expect(scene.battle.player.ship.x).toBe(x);
    expect(scene.battle.player.ship.y).toBe(y);
  });

  it('drives the ship right while the key is held', () => {
    const scene = newScene();
    const x0 = scene.battle.player.ship.x;
    const input = new Input();
    input.press('right');
    step(scene, input, 10);
    expect(scene.battle.player.ship.x).toBe(x0 + 10 * STEP);
  });

  it('drives the ship left while the key is held', () => {
    const scene = newScene();
    const x0 = scene.battle.player.ship.x;
    const input = new Input();
    input.press('left');
    step(scene, input, 10);
    expect(scene.battle.player.ship.x).toBe(x0 - 10 * STEP);
  });

  it('stops at once when the key is released', () => {
    const scene = newScene();
    const input = new Input();
    input.press('right');
    step(scene, input, 10);
    const x = scene.battle.player.ship.x;
    input.release('right');
    step(scene, input, 10);
    expect(scene.battle.player.ship.x).toBe(x);
  });

  it('stops at the right edge', () => {
    const scene = newScene();
    const input = new Input();
    input.press('right');
    step(scene, input, 200);
    expect(scene.battle.player.ship.x).toBe(SCREEN_WIDTH - SHIP_WIDTH);
  });

  it('does not fire without the fire key', () => {
    const scene = newScene();
    step(scene, new Input(), 10);
    expect(onlyShot(scene.battle.player)).toBeNull();
  });

  it('fires when the fire key goes down', () => {
    const scene = newScene();
    const input = new Input();
    input.press('fire');
    step(scene, input, 1);
    expect(onlyShot(scene.battle.player)).not.toBeNull();
  });

  it('does not autofire while the key is held, fires again on a new press', () => {
    const scene = newScene();
    const input = new Input();
    input.press('fire');
    step(scene, input, 1);
    const first = onlyShot(scene.battle.player);
    expect(first).not.toBeNull();
    step(scene, input, TICKS_ON_SCREEN);
    expect(onlyShot(scene.battle.player)).toBe(first);
    step(scene, input, 1);
    expect(onlyShot(scene.battle.player)).toBeNull();
    step(scene, input, 30);
    expect(onlyShot(scene.battle.player)).toBeNull();

    input.release('fire');
    input.press('fire');
    step(scene, input, 1);
    expect(onlyShot(scene.battle.player)).not.toBeNull();
    expect(onlyShot(scene.battle.player)).not.toBe(first);
  });

  it('ignores a press while the shot is in flight', () => {
    const scene = newScene();
    const input = new Input();
    input.press('fire');
    step(scene, input, 1);
    const first = onlyShot(scene.battle.player);
    step(scene, input, 10);
    input.release('fire');
    input.press('fire');
    step(scene, input, 1);
    expect(onlyShot(scene.battle.player)).toBe(first);
  });

  it('builds the level 1 wave', () => {
    expect(new PlayScene(createRng(1)).battle.wave.enemies.length).toBe(28);
  });

  it('passes battle options', () => {
    const scene = new PlayScene(createRng(1), undefined, { levels: TWO_LEVELS, startLevel: 2 });
    expect(scene.battle.level).toBe(2);
    expect(scene.battle.wave.enemies).toHaveLength(2);
  });

  it('shoots down an enemy', () => {
    // Ship at x = 50: the shot flies in column x = 57. Fire is down before tick 1, so the shot
    // appears in tick 1 at y = 204 and in tick k stands at y = 204 - 4(k - 1).
    // The enemy spans y = 34 … 42: tick 41 (y = 44) misses, tick 42 (y = 40) hits.
    // By tick 42 the formation has swayed 42 × 0.25 = 10.5 px: the enemy spans x = 52 … 62.
    const scene = newScene();
    scene.battle.player.ship.x = 50;
    const enemy = scene.battle.wave.enemies[0]!;
    const input = new Input();
    input.press('fire');
    step(scene, input, 41);
    expect(onlyShot(scene.battle.player)).not.toBeNull();
    expect(onlyShot(scene.battle.player)!.x).toBe(57);
    expect(enemy.state).toBe('formation');
    step(scene, input, 1);
    expect(onlyShot(scene.battle.player)).toBeNull();
    expect(enemy.state).toBe('exploding');
  });

  describe('game over', () => {
    it('leaves to the exit scene on start', () => {
      const spy = spyExit();
      const scene = overScene(spy.exit);
      const input = new Input();
      input.press('start');
      expect(step(scene, input)).toBe(spy.target);
      expect(spy.calls()).toBe(1);
    });

    it('counts start on the very tick of entering over', () => {
      const spy = spyExit();
      const scene = new PlayScene(
        createRng(1),
        undefined,
        { levels: ONE_CORNER_ENEMY, lives: 1 },
        spy.exit,
      );
      scene.battle.player.hit();
      const input = new Input();
      step(scene, input, GAME_OVER_DELAY_TICKS - 1);
      expect(scene.battle.phase).toBe('playing');
      input.press('start');
      expect(step(scene, input)).toBe(spy.target);
      expect(scene.battle.phase).toBe('over');
      expect(scene.battle.phaseTicks).toBe(0);
    });

    it('ignores start while playing', () => {
      const spy = spyExit();
      const scene = new PlayScene(createRng(1), undefined, { levels: ONE_CORNER_ENEMY }, spy.exit);
      const input = new Input();
      input.press('start');
      expect(step(scene, input)).toBe(scene);
      expect(scene.battle.phase).toBe('playing');
      expect(spy.calls()).toBe(0);
    });

    it('stays on the caption without an exit', () => {
      const scene = overScene();
      const input = new Input();
      input.press('start');
      expect(step(scene, input)).toBe(scene);
    });

    it('draws the caption last in over', () => {
      const scene = overScene();
      const expected = recorder();
      drawGameOver(expected.ctx, scene.battle.phaseTicks);
      const n = expected.calls.length;
      expect(n).toBeGreaterThan(0);
      const { ctx, calls } = recorder();
      scene.render(ctx);
      expect(calls.slice(-n)).toEqual(expected.calls);
    });

    it('does not draw the caption while playing', () => {
      const scene = newScene();
      const expected = recorder();
      drawGameOver(expected.ctx, scene.battle.phaseTicks);
      const n = expected.calls.length;
      const { ctx, calls } = recorder();
      scene.render(ctx);
      expect(calls.slice(-n)).not.toEqual(expected.calls);
    });
  });
});

describe('PlayScene bonuses', () => {
  it('gives the battle a bonus field with a spawn tick in the window, the same for one seed', () => {
    const a = new PlayScene(createRng(1));
    const b = new PlayScene(createRng(1));
    const field = a.battle.bonuses;
    expect(field).not.toBeNull();
    expect(field!.spawnTick).toBeGreaterThanOrEqual(ASTEROID_SPAWN_MIN_TICKS);
    expect(field!.spawnTick).toBeLessThanOrEqual(ASTEROID_SPAWN_MAX_TICKS);
    expect(b.battle.bonuses!.spawnTick).toBe(field!.spawnTick);
  });

  it('keeps a passed opts.bonuses', () => {
    const scene = new PlayScene(createRng(1), undefined, {
      levels: ONE_CORNER_ENEMY,
      bonuses: { rng: () => 0 },
    });
    const input = new Input();
    step(scene, input, 299);
    expect(scene.battle.bonuses!.asteroid).toBeNull();
    step(scene, input, 1);
    const asteroid = scene.battle.bonuses!.asteroid!;
    expect(asteroid).not.toBeNull();
    expect(asteroid.x).toBe(244);
    expect(asteroid.bonus).toBe(BONUS_KINDS[0]);
  });

  it('makes exactly the scene rng calls it made before bonuses', () => {
    const rng = createRng(1);
    new PlayScene(rng);
    const ref = createRng(1);
    new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, ref);
    ref();
    expect(rng()).toBe(ref());
  });

  it('for a given seed the stars and the battle go as before bonuses', () => {
    const scene = new PlayScene(createRng(1));
    // The old scheme: stars, then the battle seed, no bonus field.
    const ref = createRng(1);
    const refStars = new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, ref);
    const refBattle = new Battle(createRng(Math.floor(ref() * 2 ** 32)));
    const input = new Input();
    for (let i = 0; i < 1200; i++) {
      step(scene, input);
      refStars.update(TICK_SECONDS);
      refBattle.update(TICK_SECONDS, { move: 0, fire: false });
    }
    // 1200 ticks at 0.4 px/tick: every star has restarted at least once.
    expect(scene.starfield.stars).toEqual(refStars.stars);
    const enemies = (b: Battle) => b.wave.enemies.map((e) => [e.x, e.y, e.state]);
    expect(enemies(scene.battle)).toEqual(enemies(refBattle));
    expect(scene.battle.player.state).toBe(refBattle.player.state);
    expect(scene.battle.player.lives).toBe(refBattle.player.lives);
  });
});
