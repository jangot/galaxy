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

/** Gameplay screen: starfield background, the battle and the HUD on top. */
export class PlayScene implements Scene {
  /** Exposed for tests. */
  readonly battle: Battle;
  /** Exposed for tests. */
  readonly starfield: Starfield;

  /**
   * Pass the title's starfield to keep the stars continuous; opts go to the Battle as is.
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
    // The battle gets its own generator so background changes never shift enemy behavior.
    this.battle = new Battle(createRng(Math.floor(rng() * 2 ** 32)), opts);
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
