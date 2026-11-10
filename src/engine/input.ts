export type Action = 'left' | 'right' | 'up' | 'down' | 'fire' | 'start';

const DEFAULT_BINDINGS: Record<string, Action> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'fire',
  KeyZ: 'fire',
  Enter: 'start',
};

/**
 * Keyboard state sampled per fixed tick. `pressed` is true only on the tick the key went down.
 * Call `endTick()` after every update tick.
 */
export class Input {
  private readonly held = new Set<Action>();
  private readonly justPressed = new Set<Action>();

  constructor(private readonly bindings: Record<string, Action> = DEFAULT_BINDINGS) {}

  attach(target: Window): void {
    target.addEventListener('keydown', (e) => {
      const action = this.bindings[e.code];
      if (!action) return;
      e.preventDefault();
      this.press(action, e.repeat);
    });
    target.addEventListener('keyup', (e) => {
      const action = this.bindings[e.code];
      if (action) this.release(action);
    });
    target.addEventListener('blur', () => this.held.clear());
  }

  press(action: Action, repeat = false): void {
    if (!repeat && !this.held.has(action)) this.justPressed.add(action);
    this.held.add(action);
  }

  release(action: Action): void {
    this.held.delete(action);
  }

  isDown(action: Action): boolean {
    return this.held.has(action);
  }

  pressed(action: Action): boolean {
    return this.justPressed.has(action);
  }

  endTick(): void {
    this.justPressed.clear();
  }
}
