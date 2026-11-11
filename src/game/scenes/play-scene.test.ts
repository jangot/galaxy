import { describe, expect, it } from 'vitest';
import { SCREEN_WIDTH, TICK_SECONDS } from '../../config';
import { Input } from '../../engine/input';
import { createRng } from '../../engine/rng';
import { Player } from '../player';
import { SHIP_SPEED, SHIP_WIDTH, SHIP_Y, Ship } from '../ship';
import { SHOT_HEIGHT, SHOT_SPEED } from '../shot';
import { PlayScene } from './play-scene';
import { step } from './scene-test-utils';

const STEP = SHIP_SPEED * TICK_SECONDS;
/** Ticks after launch while the shot is still on screen (y reaches exactly 0). */
const TICKS_ON_SCREEN = (SHIP_Y - SHOT_HEIGHT) / (SHOT_SPEED * TICK_SECONDS);

describe('PlayScene', () => {
  it('places the ship at the start position', () => {
    const scene = new PlayScene(createRng(1));
    expect(scene.player).toBeInstanceOf(Player);
    expect(scene.player.ship.x).toBe(new Ship().x);
    expect(scene.player.ship.y).toBe(SHIP_Y);
  });

  it('stays still when both directions are held', () => {
    const scene = new PlayScene(createRng(1));
    const { x, y } = scene.player.ship;
    const input = new Input();
    input.press('left');
    input.press('right');
    step(scene, input, 30);
    expect(scene.player.ship.x).toBe(x);
    expect(scene.player.ship.y).toBe(y);
  });

  it('drives the ship right while the key is held', () => {
    const scene = new PlayScene(createRng(1));
    const x0 = scene.player.ship.x;
    const input = new Input();
    input.press('right');
    step(scene, input, 10);
    expect(scene.player.ship.x).toBe(x0 + 10 * STEP);
  });

  it('drives the ship left while the key is held', () => {
    const scene = new PlayScene(createRng(1));
    const x0 = scene.player.ship.x;
    const input = new Input();
    input.press('left');
    step(scene, input, 10);
    expect(scene.player.ship.x).toBe(x0 - 10 * STEP);
  });

  it('stops at once when the key is released', () => {
    const scene = new PlayScene(createRng(1));
    const input = new Input();
    input.press('right');
    step(scene, input, 10);
    const x = scene.player.ship.x;
    input.release('right');
    step(scene, input, 10);
    expect(scene.player.ship.x).toBe(x);
  });

  it('stops at the right edge', () => {
    const scene = new PlayScene(createRng(1));
    const input = new Input();
    input.press('right');
    step(scene, input, 200);
    expect(scene.player.ship.x).toBe(SCREEN_WIDTH - SHIP_WIDTH);
  });

  it('does not fire without the fire key', () => {
    const scene = new PlayScene(createRng(1));
    step(scene, new Input(), 10);
    expect(scene.player.shot).toBeNull();
  });

  it('fires when the fire key goes down', () => {
    const scene = new PlayScene(createRng(1));
    const input = new Input();
    input.press('fire');
    step(scene, input, 1);
    expect(scene.player.shot).not.toBeNull();
  });

  it('does not autofire while the key is held, fires again on a new press', () => {
    const scene = new PlayScene(createRng(1));
    const input = new Input();
    input.press('fire');
    step(scene, input, 1);
    const first = scene.player.shot;
    expect(first).not.toBeNull();
    step(scene, input, TICKS_ON_SCREEN);
    expect(scene.player.shot).toBe(first);
    step(scene, input, 1);
    expect(scene.player.shot).toBeNull();
    step(scene, input, 30);
    expect(scene.player.shot).toBeNull();

    input.release('fire');
    input.press('fire');
    step(scene, input, 1);
    expect(scene.player.shot).not.toBeNull();
    expect(scene.player.shot).not.toBe(first);
  });

  it('ignores a press while the shot is in flight', () => {
    const scene = new PlayScene(createRng(1));
    const input = new Input();
    input.press('fire');
    step(scene, input, 1);
    const first = scene.player.shot;
    step(scene, input, 10);
    input.release('fire');
    input.press('fire');
    step(scene, input, 1);
    expect(scene.player.shot).toBe(first);
  });
});
