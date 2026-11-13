import { SHIELD_OFFSET_Y, SHIELD_SPRITES, SHIP_SPRITE, SHOT_COLOR } from './art';
import type { Asteroid } from './asteroid';
import type { Battle } from './battle';
import { ASTEROID_SPRITE, CAPSULE_SPRITES } from './bonus-art';
import type { Enemy } from './enemy';
import { ENEMY_KINDS, EXPLOSION_FRAME_TICKS, EXPLOSION_TICKS } from './enemy';
import { ENEMY_SHOT_COLOR, EXPLOSION_FRAMES } from './enemy-art';
import { ENEMY_SHOT_HEIGHT, ENEMY_SHOT_WIDTH } from './enemy-shot';
import type { Player } from './player';
import { SHIP_HEIGHT, SHIP_WIDTH } from './ship';
import { SHOT_HEIGHT, SHOT_WIDTH } from './shot';
import { drawSprite } from './sprite';

/** Invulnerable ship blinks: BLINK_TICKS shown, BLINK_TICKS hidden; shown on the entry tick. */
export const BLINK_TICKS = 4;

/**
 * Draws the battle entities, back to front: the asteroid, the capsule (over the asteroid's
 * explosion: it drops out of the debris), enemy shots, player shots (in shots order),
 * enemies, ship. The asteroid and the capsule are the back layer: every shot, enemy and the
 * ship are drawn over them (they are harmless and pass behind them).
 * No background.
 * Dead enemies are skipped, exploding ones show an explosion frame.
 * The ship: active - sprite and the shield arc (SHIELD_SPRITES[shield], none at 0); down -
 * explosion, then nothing; invulnerable - ship and arc blink together.
 * The player's shots are drawn in any ship state.
 */
export function drawBattle(ctx: CanvasRenderingContext2D, battle: Battle): void {
  const asteroid = battle.bonuses?.asteroid;
  if (asteroid) drawAsteroid(ctx, asteroid);
  const capsule = battle.bonuses?.capsule;
  if (capsule) {
    drawSprite(ctx, CAPSULE_SPRITES[capsule.kind], Math.floor(capsule.x), Math.floor(capsule.y));
  }
  for (const enemyShot of battle.wave.shots) {
    ctx.fillStyle = ENEMY_SHOT_COLOR;
    ctx.fillRect(
      Math.floor(enemyShot.x),
      Math.floor(enemyShot.y),
      ENEMY_SHOT_WIDTH,
      ENEMY_SHOT_HEIGHT,
    );
  }
  for (const shot of battle.player.shots) {
    ctx.fillStyle = SHOT_COLOR;
    ctx.fillRect(Math.floor(shot.x), Math.floor(shot.y), SHOT_WIDTH, SHOT_HEIGHT);
  }
  for (const enemy of battle.wave.enemies) drawEnemy(ctx, enemy);
  drawShip(ctx, battle.player);
}

/** flying: sprite; exploding: the frame for stateTicks, centered in it; gone: nothing. */
function drawAsteroid(ctx: CanvasRenderingContext2D, asteroid: Asteroid): void {
  const x = Math.floor(asteroid.x);
  const y = Math.floor(asteroid.y);
  if (asteroid.state === 'flying') {
    drawSprite(ctx, ASTEROID_SPRITE, x, y);
  } else if (asteroid.state === 'exploding') {
    drawExplosion(ctx, asteroid.stateTicks, x, y, asteroid.width, asteroid.height);
  }
}

/**
 * active: sprite and the shield arc; down: explosion for EXPLOSION_TICKS, then nothing
 * (no arc: shield is 0); invulnerable: the sprite and the arc blink together.
 */
function drawShip(ctx: CanvasRenderingContext2D, player: Player): void {
  const x = Math.floor(player.ship.x);
  const y = Math.floor(player.ship.y);
  const ticks = player.stateTicks;
  if (player.state === 'down') {
    if (ticks < EXPLOSION_TICKS) drawExplosion(ctx, ticks, x, y, SHIP_WIDTH, SHIP_HEIGHT);
    return;
  }
  if (player.state === 'invulnerable' && Math.floor(ticks / BLINK_TICKS) % 2 !== 0) return;
  drawSprite(ctx, SHIP_SPRITE, x, y);
  const arc = SHIELD_SPRITES[player.shield];
  if (arc) drawSprite(ctx, arc, x, y + SHIELD_OFFSET_Y);
}

/** dead: nothing; exploding: the frame for stateTicks, centered in the enemy; else its sprite. */
function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy): void {
  if (enemy.state === 'dead') return;
  const x = Math.floor(enemy.x);
  const y = Math.floor(enemy.y);
  if (enemy.state === 'exploding') {
    drawExplosion(ctx, enemy.stateTicks, x, y, enemy.width, enemy.height);
    return;
  }
  drawSprite(ctx, ENEMY_KINDS[enemy.kind].sprite, x, y);
}

/** Explosion frame for `ticks`, centered in the (x, y, width, height) rectangle. */
function drawExplosion(
  ctx: CanvasRenderingContext2D,
  ticks: number,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const frame = EXPLOSION_FRAMES[Math.floor(ticks / EXPLOSION_FRAME_TICKS)];
  if (!frame) return;
  // May stick out by a pixel for a narrower entity.
  drawSprite(
    ctx,
    frame,
    x + Math.floor((width - frame.width) / 2),
    y + Math.floor((height - frame.height) / 2),
  );
}
