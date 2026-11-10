import type { Input } from './input';

/** A game screen (title, play, game over...). Scenes switch by returning the next scene. */
export interface Scene {
  /** Advance one fixed tick. Return another scene to switch to it. */
  update(dt: number, input: Input): Scene | void;
  render(ctx: CanvasRenderingContext2D): void;
}
