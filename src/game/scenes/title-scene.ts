import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../config';
import type { Input } from '../../engine/input';
import type { Rng } from '../../engine/rng';
import type { Scene } from '../../engine/scene';
import { Starfield } from '../starfield';
import { PlayScene } from './play-scene';

/** Placeholder title screen: starfield + caption. Real menu comes in a separate task. */
export class TitleScene implements Scene {
  /** Exposed for tests. */
  readonly starfield: Starfield;
  private ticks = 0;

  constructor(
    private readonly rng: Rng,
    /** Level the game starts from; undefined = 1. Dev builds pass ?level=N. */
    private readonly startLevel?: number,
    /** Continue the stars when coming back from a game; undefined = new ones from rng. */
    starfield?: Starfield,
  ) {
    this.starfield = starfield ?? new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, rng);
  }

  update(dt: number, input: Input): Scene | void {
    this.ticks++;
    this.starfield.update(dt);
    if (input.pressed('start')) {
      // The factory lives here, so play-scene never imports title-scene (no module cycle).
      const exit = (): Scene => new TitleScene(this.rng, this.startLevel, this.starfield);
      return new PlayScene(this.rng, this.starfield, { startLevel: this.startLevel }, exit);
    }
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
