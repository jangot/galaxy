export interface StepResult {
  /** How many fixed ticks to simulate this frame. */
  steps: number;
  /** Leftover time carried to the next frame, in seconds. */
  accumulator: number;
}

/**
 * Pure fixed-timestep accumulator. Clamps the number of steps per frame so a long
 * pause (tab switch, debugger) does not cause a "spiral of death".
 */
export function accumulate(
  accumulator: number,
  frameSeconds: number,
  tickSeconds: number,
  maxSteps = 5,
): StepResult {
  let acc = accumulator + Math.max(0, frameSeconds);
  let steps = Math.floor(acc / tickSeconds);
  if (steps > maxSteps) {
    steps = maxSteps;
    acc = 0;
  } else {
    acc -= steps * tickSeconds;
  }
  return { steps, accumulator: acc };
}

export interface LoopCallbacks {
  update(tickSeconds: number): void;
  render(): void;
}

/** requestAnimationFrame-driven loop with fixed-step updates. */
export class GameLoop {
  private accumulator = 0;
  private lastTime: number | null = null;
  private rafId: number | null = null;

  constructor(
    private readonly tickSeconds: number,
    private readonly callbacks: LoopCallbacks,
  ) {}

  start(): void {
    if (this.rafId !== null) return;
    this.lastTime = null;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private readonly frame = (time: number): void => {
    const frameSeconds = this.lastTime === null ? 0 : (time - this.lastTime) / 1000;
    this.lastTime = time;
    const { steps, accumulator } = accumulate(this.accumulator, frameSeconds, this.tickSeconds);
    this.accumulator = accumulator;
    for (let i = 0; i < steps; i++) this.callbacks.update(this.tickSeconds);
    this.callbacks.render();
    this.rafId = requestAnimationFrame(this.frame);
  };
}
