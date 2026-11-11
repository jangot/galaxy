import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../config';
import type { Input } from '../../engine/input';
import { createRng, type Rng } from '../../engine/rng';
import type { Scene } from '../../engine/scene';
import type { BattleOptions } from '../battle';
import { Battle } from '../battle';
import { drawBattle } from '../battle-render';
import { hudView } from '../hud';
import { drawHud } from '../hud-render';
import { readIntent } from '../player';
import { Starfield } from '../starfield';

/** Gameplay screen: starfield background, the battle and the HUD on top. */
export class PlayScene implements Scene {
  /** Exposed for tests. */
  readonly battle: Battle;
  private readonly starfield: Starfield;

  /** Pass the title's starfield to keep the stars continuous; opts go to the Battle as is. */
  constructor(rng: Rng, starfield?: Starfield, opts?: BattleOptions) {
    // Stars first, then the battle seed: the star layout for a given seed stays as before.
    this.starfield = starfield ?? new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, rng);
    // The battle gets its own generator so background changes never shift enemy behavior.
    this.battle = new Battle(createRng(Math.floor(rng() * 2 ** 32)), opts);
  }

  update(dt: number, input: Input): void {
    this.starfield.update(dt);
    this.battle.update(dt, readIntent(input));
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.starfield.render(ctx);
    drawBattle(ctx, this.battle);
    drawHud(ctx, hudView(this.battle)); // last, no background: text over the battle
  }
}
