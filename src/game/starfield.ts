import { randomInt, type Rng } from '../engine/rng';

export interface Star {
  x: number;
  y: number;
  color: string;
  /** Blink phase offset in ticks. */
  phase: number;
}

const STAR_COLORS = ['#ffffff', '#ff5a3c', '#5ad15a', '#b884ff', '#ffd36b', '#5ab4ff'];
const BLINK_PERIOD_TICKS = 48;

/** Sparse multicolor background stars scrolling down and blinking. */
export class Starfield {
  readonly stars: Star[] = [];
  private tick = 0;

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly rng: Rng,
    count = 48,
    /** Pixels per second. */
    private readonly speed = 24,
  ) {
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: randomInt(rng, 0, width),
        y: randomInt(rng, 0, height),
        color: STAR_COLORS[randomInt(rng, 0, STAR_COLORS.length)] ?? '#ffffff',
        phase: randomInt(rng, 0, BLINK_PERIOD_TICKS),
      });
    }
  }

  update(dt: number): void {
    this.tick++;
    for (const star of this.stars) {
      star.y += this.speed * dt;
      if (star.y >= this.height) {
        star.y -= this.height;
        star.x = randomInt(this.rng, 0, this.width);
      }
    }
  }

  isVisible(star: Star): boolean {
    return (this.tick + star.phase) % BLINK_PERIOD_TICKS < BLINK_PERIOD_TICKS * 0.75;
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const star of this.stars) {
      if (!this.isVisible(star)) continue;
      ctx.fillStyle = star.color;
      ctx.fillRect(Math.floor(star.x), Math.floor(star.y), 1, 1);
    }
  }
}
