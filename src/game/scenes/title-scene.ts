import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../config';
import type { Input } from '../../engine/input';
import type { Rng } from '../../engine/rng';
import type { Scene } from '../../engine/scene';
import { Starfield } from '../starfield';

/** Placeholder title screen: starfield + caption. Real menu comes in a separate task. */
export class TitleScene implements Scene {
  private readonly starfield: Starfield;
  private ticks = 0;

  constructor(rng: Rng) {
    this.starfield = new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, rng);
  }

  update(dt: number, _input: Input): void {
    this.ticks++;
    this.starfield.update(dt);
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.starfield.render(ctx);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#ff5a3c';
    ctx.fillText('GALAXY', SCREEN_WIDTH / 2, 90);
    if (Math.floor(this.ticks / 30) % 2 === 0) {
      ctx.font = '8px monospace';
      ctx.fillStyle = '#b884ff';
      ctx.fillText('PRESS ENTER', SCREEN_WIDTH / 2, 150);
    }
  }
}
