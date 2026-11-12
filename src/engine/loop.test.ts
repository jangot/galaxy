import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoopOptions } from './loop';
import { accumulate, GameLoop } from './loop';

const TICK = 1 / 60;

describe('accumulate', () => {
  it('runs one step per tick-length frame', () => {
    const r = accumulate(0, TICK, TICK);
    expect(r.steps).toBe(1);
    expect(r.accumulator).toBeCloseTo(0);
  });

  it('carries leftover time to the next frame', () => {
    const r = accumulate(0, TICK * 1.5, TICK);
    expect(r.steps).toBe(1);
    expect(r.accumulator).toBeCloseTo(TICK * 0.5);
  });

  it('clamps steps after a long pause and drops the backlog', () => {
    const r = accumulate(0, 10, TICK, 5);
    expect(r.steps).toBe(5);
    expect(r.accumulator).toBe(0);
  });

  it('ignores negative frame time', () => {
    expect(accumulate(0, -1, TICK).steps).toBe(0);
  });
});

describe('GameLoop', () => {
  let frameCb: FrameRequestCallback | null = null;

  beforeEach(() => {
    frameCb = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frameCb = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Starts a loop with spy callbacks; frame(ms) runs the pending animation frame. */
  function setup(opts?: LoopOptions) {
    const update = vi.fn();
    const render = vi.fn();
    const loop = new GameLoop(TICK, { update, render }, opts);
    loop.start();
    const frame = (ms: number): void => {
      const cb = frameCb;
      if (!cb) throw new Error('no frame requested');
      cb(ms);
    };
    return { loop, update, render, frame };
  }

  it('runs fixed ticks and renders every frame', () => {
    const { loop, update, render, frame } = setup();
    expect(loop.paused).toBe(false);
    frame(0);
    frame(1000 / 60);
    frame(2000 / 60);
    expect(update).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledTimes(3);
  });

  it('starts paused: renders, never ticks', () => {
    const { loop, update, render, frame } = setup({ paused: true });
    expect(loop.paused).toBe(true);
    frame(0);
    frame(1000 / 60);
    frame(5000);
    frame(20000);
    expect(update).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(4);
  });

  it('drops the paused time on resume', () => {
    const { loop, update, frame } = setup({ paused: true });
    frame(0);
    frame(10000);
    loop.resume();
    expect(loop.paused).toBe(false);
    frame(10500);
    expect(update).not.toHaveBeenCalled();
    frame(10500 + 1.01 * (1000 / 60));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('drops the accumulator leftover on pause', () => {
    const { loop, update, frame } = setup();
    frame(0);
    frame(1.9 * (1000 / 60)); // 1 tick + 0.9 tick left over
    expect(update).toHaveBeenCalledTimes(1);
    loop.pause();
    frame(3000);
    loop.resume();
    frame(4000);
    frame(4000 + 0.5 * (1000 / 60)); // the old 0.9 would add up to a tick here
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('resume() without a pause does nothing', () => {
    const { loop, update, frame } = setup();
    frame(0);
    frame(0.9 * (1000 / 60));
    loop.resume();
    frame(1.1 * (1000 / 60));
    expect(update).toHaveBeenCalledTimes(1);
  });
});
