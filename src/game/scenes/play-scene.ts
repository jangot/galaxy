import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../config';
import type { Input } from '../../engine/input';
import { createRng, type Rng } from '../../engine/rng';
import type { Scene } from '../../engine/scene';
import { memoryStorage } from '../../engine/storage';
import type { BattleOptions } from '../battle';
import { Battle } from '../battle';
import { drawBattle } from '../battle-render';
import { drawGameOver } from '../game-over-render';
import { HighScoreStore } from '../high-score';
import type { HudRecord } from '../hud';
import { hudView } from '../hud';
import { drawHud } from '../hud-render';
import { readIntent } from '../player';
import { Starfield } from '../starfield';

/** Mixed into the battle seed for the bonus field's generator; the scene rng is not touched. */
const BONUS_SEED_SALT = 0x9e3779b9;

/** Gameplay screen: starfield background, the battle and the HUD on top. */
export class PlayScene implements Scene {
  /** Exposed for tests. */
  readonly battle: Battle;
  /** Exposed for tests. */
  readonly starfield: Starfield;
  /** Exposed for tests: the same store must travel to the next game through exit. */
  readonly records: HighScoreStore;
  /** records.best after refresh() in the constructor: beating it makes a new record. */
  private readonly recordAtStart: number;

  /**
   * Pass the title's starfield to keep the stars continuous. opts go to the Battle; bonuses
   * default to a generator derived from the battle seed (a passed opts.bonuses is kept).
   * exit: where Enter leads after game over; without it the scene stays on the caption.
   * records: the session's record store, shared by the title and every game; without it - a
   * fresh in-memory one (tests).
   */
  constructor(
    rng: Rng,
    starfield?: Starfield,
    opts?: BattleOptions,
    private readonly exit?: () => Scene,
    records?: HighScoreStore,
  ) {
    // Stars first, then the battle seed: the star layout for a given seed stays as before.
    this.starfield = starfield ?? new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, rng);
    // The battle gets its own generator so background changes never shift enemy behavior;
    // the bonus seed is derived from it, so the scene rng makes exactly the calls it made
    // before bonuses (the stars' restarts keep their x).
    const battleSeed = Math.floor(rng() * 2 ** 32);
    this.battle = new Battle(createRng(battleSeed), {
      ...opts,
      bonuses: opts?.bonuses ?? { rng: createRng((battleSeed ^ BONUS_SEED_SALT) >>> 0) },
    });
    // The record spends no rng: stars and the battle stay as they were for a given seed.
    this.records = records ?? new HighScoreStore(memoryStorage());
    this.records.refresh(); // a higher record from another tab counts from this game on
    this.recordAtStart = this.records.best;
  }

  update(dt: number, input: Input): Scene | void {
    this.starfield.update(dt);
    this.battle.update(dt, readIntent(input));
    // Written at once on every rise (В3), before a possible exit in this same tick.
    this.records.submit(this.battle.score);
    // After the battle tick: Enter on the very tick of entering over already counts.
    if (this.battle.phase === 'over' && input.pressed('start') && this.exit) {
      return this.exit();
    }
  }

  /** The record as the HUD sees it; used by render and the dev snapshot. */
  hudRecord(): HudRecord {
    return { best: this.records.best, atStart: this.recordAtStart };
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.starfield.render(ctx);
    drawBattle(ctx, this.battle);
    drawHud(ctx, hudView(this.battle, this.hudRecord())); // opaque panel over the battle: covers what flies under it
    if (this.battle.phase === 'over') drawGameOver(ctx, this.battle.phaseTicks); // over everything
  }
}
