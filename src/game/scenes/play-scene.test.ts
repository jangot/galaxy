import { describe, expect, it } from 'vitest';
import { SCREEN_WIDTH, TICK_SECONDS } from '../../config';
import { Input } from '../../engine/input';
import { createRng } from '../../engine/rng';
import { Battle } from '../battle';
import { Player } from '../player';
import { SHIP_SPEED, SHIP_WIDTH, SHIP_Y, Ship } from '../ship';
import { SHOT_HEIGHT, SHOT_SPEED } from '../shot';
import { ONE_CORNER_ENEMY, TWO_LEVELS } from '../test-levels';
import { PlayScene } from './play-scene';
import { step } from './scene-test-utils';

const STEP = SHIP_SPEED * TICK_SECONDS;
/** Ticks after launch while the shot is still on screen (y reaches exactly 0). */
const TICKS_ON_SCREEN = (SHIP_Y - SHOT_HEIGHT) / (SHOT_SPEED * TICK_SECONDS);

/** One enemy far from the ship's shot column, so ship and shot tests are not disturbed by hits. */
function newScene(): PlayScene {
  return new PlayScene(createRng(1), undefined, { levels: ONE_CORNER_ENEMY });
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
    expect(scene.battle.player.shot).toBeNull();
  });

  it('fires when the fire key goes down', () => {
    const scene = newScene();
    const input = new Input();
    input.press('fire');
    step(scene, input, 1);
    expect(scene.battle.player.shot).not.toBeNull();
  });

  it('does not autofire while the key is held, fires again on a new press', () => {
    const scene = newScene();
    const input = new Input();
    input.press('fire');
    step(scene, input, 1);
    const first = scene.battle.player.shot;
    expect(first).not.toBeNull();
    step(scene, input, TICKS_ON_SCREEN);
    expect(scene.battle.player.shot).toBe(first);
    step(scene, input, 1);
    expect(scene.battle.player.shot).toBeNull();
    step(scene, input, 30);
    expect(scene.battle.player.shot).toBeNull();

    input.release('fire');
    input.press('fire');
    step(scene, input, 1);
    expect(scene.battle.player.shot).not.toBeNull();
    expect(scene.battle.player.shot).not.toBe(first);
  });

  it('ignores a press while the shot is in flight', () => {
    const scene = newScene();
    const input = new Input();
    input.press('fire');
    step(scene, input, 1);
    const first = scene.battle.player.shot;
    step(scene, input, 10);
    input.release('fire');
    input.press('fire');
    step(scene, input, 1);
    expect(scene.battle.player.shot).toBe(first);
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
    expect(scene.battle.player.shot).not.toBeNull();
    expect(scene.battle.player.shot!.x).toBe(57);
    expect(enemy.state).toBe('formation');
    step(scene, input, 1);
    expect(scene.battle.player.shot).toBeNull();
    expect(enemy.state).toBe('exploding');
  });
});
