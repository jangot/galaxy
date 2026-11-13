import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../config';
import type { Input } from '../../engine/input';
import type { Rng } from '../../engine/rng';
import type { Scene } from '../../engine/scene';
import { memoryStorage } from '../../engine/storage';
import type { BattleOptions } from '../battle';
import { HighScoreStore } from '../high-score';
import { Starfield } from '../starfield';
import { PlayScene } from './play-scene';

/** How a new game starts: level and shield (dev builds pass ?level / ?shield). */
export type GameStart = Pick<BattleOptions, 'startLevel' | 'shield'>;

/** Placeholder title screen: starfield + caption. Real menu comes in a separate task. */
export class TitleScene implements Scene {
  /** Exposed for tests. */
  readonly starfield: Starfield;
  /** Exposed for tests: the same store must reach PlayScene and the next TitleScene. */
  readonly records: HighScoreStore;
  private ticks = 0;

  constructor(
    private readonly rng: Rng,
    /** undefined fields = level 1, START_SHIELD. Kept across a restart after game over. */
    private readonly start: GameStart = {},
    /** Continue the stars when coming back from a game; undefined = new ones from rng. */
    starfield?: Starfield,
    /** The session's record store (main.ts); undefined = a fresh in-memory one (tests). */
    records?: HighScoreStore,
  ) {
    this.starfield = starfield ?? new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, rng);
    this.records = records ?? new HighScoreStore(memoryStorage());
  }

  update(dt: number, input: Input): Scene | void {
    this.ticks++;
    this.starfield.update(dt);
    if (input.pressed('start')) {
      // The factory lives here, so play-scene never imports title-scene (no module cycle).
      const exit = (): Scene => new TitleScene(this.rng, this.start, this.starfield, this.records);
      return new PlayScene(this.rng, this.starfield, { ...this.start }, exit, this.records);
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
