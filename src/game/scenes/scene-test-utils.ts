import { TICK_SECONDS } from '../../config';
import type { Input } from '../../engine/input';
import type { Scene } from '../../engine/scene';

/**
 * Test-only helper. Runs n ticks exactly like main.ts:
 * update -> switch scene if one was returned -> input.endTick().
 * Returns the current scene after the last tick.
 */
export function step(scene: Scene, input: Input, n = 1): Scene {
  let current = scene;
  for (let i = 0; i < n; i++) {
    const next = current.update(TICK_SECONDS, input);
    if (next) current = next;
    input.endTick();
  }
  return current;
}
