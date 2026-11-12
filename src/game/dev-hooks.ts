import type { Action, Input } from '../engine/input';
import { ACTIONS } from '../engine/input';
import type { Scene } from '../engine/scene';
import type { GalaxySnapshot } from './dev-snapshot';
import { snapshotScene } from './dev-snapshot';

/**
 * Dev-only window.__galaxy for the browser QA agent (see second-brain/architecture/dev-hooks.md).
 * Built from what main.ts passes in; never touches window itself, so it runs in node tests.
 */

/** What the loop exposes; GameLoop fits it structurally. */
export interface LoopControl {
  readonly paused: boolean;
  pause(): void;
  resume(): void;
}

export interface DevHookDeps {
  /** One simulation tick exactly as the loop runs it (update -> scene switch -> endTick). */
  tick(): void;
  render(): void;
  readonly input: Input;
  readonly loop: LoopControl;
  getScene(): Scene;
  getTicks(): number;
}

export interface GalaxyDevHooks {
  /** Runs n >= 1 ticks synchronously, renders once, returns state(). */
  step(n?: number): GalaxySnapshot;
  /** Holds an action (left/right/up/down/fire/start) until release(). */
  press(action: string): void;
  release(action: string): void;
  pause(): void;
  resume(): void;
  state(): GalaxySnapshot;
  /** Accepted action names. */
  readonly actions: readonly Action[];
}

declare global {
  interface Window {
    /** Dev builds only (import.meta.env.DEV). */
    __galaxy?: GalaxyDevHooks;
  }
}

function toAction(name: string): Action {
  if ((ACTIONS as readonly string[]).includes(name)) return name as Action;
  throw new TypeError(`Unknown action "${name}", expected one of: ${ACTIONS.join(', ')}`);
}

export function createDevHooks(deps: DevHookDeps): GalaxyDevHooks {
  /** Actions held through press(): restored before every step tick (window blur clears input). */
  const held = new Set<Action>();
  const state = (): GalaxySnapshot =>
    snapshotScene(deps.getScene(), { tick: deps.getTicks(), paused: deps.loop.paused });
  return {
    step(n = 1) {
      if (!Number.isInteger(n) || n < 1) {
        throw new RangeError(`step(n): n must be an integer >= 1, got ${n}`);
      }
      for (let i = 0; i < n; i++) {
        // repeat = true: back to held without a new "pressed" (no extra shot after a blur).
        for (const action of held) deps.input.press(action, true);
        deps.tick();
      }
      deps.render();
      return state();
    },
    press(name) {
      const action = toAction(name);
      held.add(action);
      deps.input.press(action);
    },
    release(name) {
      const action = toAction(name);
      held.delete(action);
      deps.input.release(action);
    },
    pause: () => deps.loop.pause(),
    resume: () => deps.loop.resume(),
    state,
    actions: ACTIONS,
  };
}
