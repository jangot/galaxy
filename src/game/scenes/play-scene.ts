import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../config';
import type { Input } from '../../engine/input';
import type { Rng } from '../../engine/rng';
import type { Scene } from '../../engine/scene';
import { SHIP_SPRITE, SHOT_COLOR } from '../art';
import { Player, readIntent } from '../player';
import { SHOT_HEIGHT, SHOT_WIDTH } from '../shot';
import { drawSprite } from '../sprite';
import { Starfield } from '../starfield';

/** Gameplay screen: starfield, the player ship and its shot. */
export class PlayScene implements Scene {
  /** Exposed for tests. */
  readonly player = new Player();
  private readonly starfield: Starfield;

  /** Pass the title's starfield to keep the stars continuous across the switch. */
  constructor(rng: Rng, starfield?: Starfield) {
    this.starfield = starfield ?? new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, rng);
  }

  update(dt: number, input: Input): void {
    this.starfield.update(dt);
    this.player.update(dt, readIntent(input));
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.starfield.render(ctx);
    const { ship, shot } = this.player;
    if (shot) {
      ctx.fillStyle = SHOT_COLOR;
      ctx.fillRect(Math.floor(shot.x), Math.floor(shot.y), SHOT_WIDTH, SHOT_HEIGHT);
    }
    drawSprite(ctx, SHIP_SPRITE, Math.floor(ship.x), Math.floor(ship.y));
  }
}
