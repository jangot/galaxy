import { describe, expect, it, vi } from 'vitest';
import { TICK_SECONDS } from '../config';
import { ACTIONS, Input } from '../engine/input';
import { createRng } from '../engine/rng';
import type { Scene } from '../engine/scene';
import type { LoopControl } from './dev-hooks';
import { createDevHooks } from './dev-hooks';
import { SHIP_SPEED } from './ship';
import { TitleScene } from './scenes/title-scene';

/** A loop stand-in: just the paused flag. */
function fakeLoop(paused = false): LoopControl & { paused: boolean } {
  return {
    paused,
    pause() {
      this.paused = true;
    },
    resume() {
      this.paused = false;
    },
  };
}

/** Hooks on spies: no scene logic. */
function fakeHooks() {
  const tick = vi.fn();
  const render = vi.fn();
  const loop = fakeLoop();
  const hooks = createDevHooks({
    tick,
    render,
    input: new Input(),
    loop,
    getScene: () => new TitleScene(createRng(1)),
    getTicks: () => 0,
  });
  return { hooks, tick, render, loop };
}

/** Wired like main.ts: one tick path (update -> switch scene -> endTick), paused loop. */
function realHooks(seed = 1) {
  const input = new Input();
  let scene: Scene = new TitleScene(createRng(seed));
  let ticks = 0;
  const hooks = createDevHooks({
    tick() {
      const next = scene.update(TICK_SECONDS, input);
      if (next) scene = next;
      input.endTick();
      ticks++;
    },
    render() {},
    input,
    loop: fakeLoop(true),
    getScene: () => scene,
    getTicks: () => ticks,
  });
  return { hooks, input };
}

/** From the title into a battle with one Enter. */
function startGame(hooks: ReturnType<typeof realHooks>['hooks']): void {
  hooks.press('start');
  hooks.step(1);
  hooks.release('start');
}

describe('createDevHooks on fakes', () => {
  it('step(n) runs n ticks and renders once', () => {
    const { hooks, tick, render } = fakeHooks();
    hooks.step(5);
    expect(tick).toHaveBeenCalledTimes(5);
    expect(render).toHaveBeenCalledTimes(1);
    hooks.step();
    expect(tick).toHaveBeenCalledTimes(6);
  });

  it.each([0, -1, 1.5, NaN])('step(%s) throws RangeError without ticking', (n) => {
    const { hooks, tick } = fakeHooks();
    expect(() => hooks.step(n)).toThrow(RangeError);
    expect(tick).not.toHaveBeenCalled();
  });

  it('rejects unknown action names', () => {
    const { hooks } = fakeHooks();
    expect(() => hooks.press('jump')).toThrow(TypeError);
    expect(() => hooks.release('Space')).toThrow(TypeError);
    expect(hooks.actions).toEqual(ACTIONS);
  });

  it('proxies pause/resume to the loop', () => {
    const { hooks, loop } = fakeHooks();
    expect(hooks.state().paused).toBe(false);
    hooks.pause();
    expect(loop.paused).toBe(true);
    expect(hooks.state().paused).toBe(true);
    hooks.resume();
    expect(loop.paused).toBe(false);
    expect(hooks.state().paused).toBe(false);
  });
});

describe('createDevHooks on the game', () => {
  it('starts a game with start and returns the state from step', () => {
    const { hooks } = realHooks();
    expect(hooks.state().scene).toBe('title');
    hooks.press('start');
    const s = hooks.step(1);
    expect(s.scene).toBe('play');
    expect(s).toEqual(hooks.state());
  });

  it('fires once per press, no autofire', () => {
    const { hooks } = realHooks();
    startGame(hooks);
    hooks.press('fire');
    expect(hooks.step(1).battle!.player.shots).toHaveLength(1);
    expect(hooks.step(1).battle!.player.shots).toHaveLength(1);
  });

  it('a new press after the shot leaves fires again', () => {
    const { hooks } = realHooks();
    startGame(hooks);
    hooks.press('fire');
    const first = hooks.step(1).battle!.player.shots[0]!;
    hooks.release('fire');
    // Let the first shot leave the screen.
    let s = hooks.step(1);
    for (let i = 0; i < 120 && s.battle!.player.shots.length > 0; i++) s = hooks.step(1);
    expect(s.battle!.player.shots).toHaveLength(0);
    hooks.press('fire');
    const second = hooks.step(1).battle!.player.shots;
    expect(second).toHaveLength(1);
    expect(second[0]!.y).toBe(first.y);
  });

  it('keeps pressed keys held through a blur in step', () => {
    const { hooks, input } = realHooks();
    startGame(hooks);
    const x0 = hooks.state().battle!.player.x;
    hooks.press('right');
    input.release('right'); // what a window blur does to the input
    const x1 = hooks.step(10).battle!.player.x;
    expect(x1).toBeCloseTo(x0 + 10 * SHIP_SPEED * TICK_SECONDS);
  });

  it('a blur does not make a new press', () => {
    const { hooks, input } = realHooks();
    startGame(hooks);
    hooks.press('fire');
    const firstY = hooks.step(1).battle!.player.shots[0]!.y;
    input.release('fire');
    const shots = hooks.step(5).battle!.player.shots;
    expect(shots).toHaveLength(1);
    expect(shots[0]!.y).toBeLessThan(firstY);
  });

  it('counts ticks', () => {
    const { hooks } = realHooks();
    expect(hooks.state().tick).toBe(0);
    expect(hooks.step(7).tick).toBe(7);
    expect(hooks.step().tick).toBe(8);
  });

  it('is deterministic for the same seed and commands', () => {
    const run = () => {
      const { hooks } = realHooks(42);
      hooks.step(30);
      hooks.press('start');
      hooks.step(1);
      hooks.release('start');
      hooks.press('left');
      hooks.step(300);
      return hooks.state();
    };
    const a = run();
    expect(a.scene).not.toBe('title');
    expect(run()).toEqual(a);
  });
});
