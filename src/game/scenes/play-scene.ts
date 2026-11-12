import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../config';
import type { Input } from '../../engine/input';
import { createRng, type Rng } from '../../engine/rng';
import type { Scene } from '../../engine/scene';
import type { BattleOptions } from '../battle';
import { Battle } from '../battle';
import { drawBattle } from '../battle-render';
import { drawGameOver } from '../game-over-render';
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

  /**
   * Pass the title's starfield to keep the stars continuous. opts go to the Battle; bonuses
   * default to a generator derived from the battle seed (a passed opts.bonuses is kept).
   * exit: where Enter leads after game over; without it the scene stays on the caption.
   */
  constructor(
    rng: Rng,
    starfield?: Starfield,
    opts?: BattleOptions,
    private readonly exit?: () => Scene,
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
  }

  update(dt: number, input: Input): Scene | void {
    this.starfield.update(dt);
    this.battle.update(dt, readIntent(input));
    // After the battle tick: Enter on the very tick of entering over already counts.
    if (this.battle.phase === 'over' && input.pressed('start') && this.exit) {
      return this.exit();
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.starfield.render(ctx);
    drawBattle(ctx, this.battle);
    drawHud(ctx, hudView(this.battle)); // no background: text over the battle
    if (this.battle.phase === 'over') drawGameOver(ctx, this.battle.phaseTicks); // over everything
  }
}
