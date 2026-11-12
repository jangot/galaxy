import { HUD_LABEL_COLOR, HUD_VALUE_COLOR, LIFE_ICON_SPRITE } from './art';
import type { PowerUps } from './bonus';
import { CAPSULE_SPRITES } from './bonus-art';
import { drawText } from './font';
import type { HudView, HudZone } from './hud';
import {
  formatLevel,
  formatScore,
  HUD_LABEL_Y,
  HUD_VALUE_Y,
  LEVEL_LABEL,
  LEVEL_ZONE,
  levelValueX,
  LIFE_ICON_STEP,
  LIVES_ICON_SLOTS,
  LIVES_ZONE,
  POWER_UP_SLOT_KINDS,
  POWER_UP_SLOT_X,
  POWER_UPS_ZONE,
  SCORE_LABEL,
  SCORE_ZONE,
} from './hud';
import { drawSprite } from './sprite';

/**
 * Draws the top HUD over the scene, no background: score, level, lives, power-ups sections.
 * Each section draws only inside its own zone (see hud.ts); a new section adds a drawX here.
 */
export function drawHud(ctx: CanvasRenderingContext2D, view: HudView): void {
  drawScore(ctx, view.score);
  drawLevel(ctx, view.level);
  drawLives(ctx, view.lives);
  drawPowerUps(ctx, view.powerUps);
}

/** Label on the label row at the zone's left edge, value under it at valueX. */
function drawLabeled(
  ctx: CanvasRenderingContext2D,
  zone: HudZone,
  label: string,
  value: string,
  valueX: number,
): void {
  drawText(ctx, label, zone.x, HUD_LABEL_Y, HUD_LABEL_COLOR);
  drawText(ctx, value, valueX, HUD_VALUE_Y, HUD_VALUE_COLOR);
}

/** Score is left-aligned under its label. */
function drawScore(ctx: CanvasRenderingContext2D, score: number): void {
  drawLabeled(ctx, SCORE_ZONE, SCORE_LABEL, formatScore(score), SCORE_ZONE.x);
}

/** Level number is centered under its label. */
function drawLevel(ctx: CanvasRenderingContext2D, level: number): void {
  const text = formatLevel(level);
  drawLabeled(ctx, LEVEL_ZONE, LEVEL_LABEL, text, levelValueX(text));
}

/** Icons from the zone's right edge leftwards; icon 0 is the rightmost. At most LIVES_ICON_SLOTS. */
function drawLives(ctx: CanvasRenderingContext2D, lives: number): void {
  const rightmostX = LIVES_ZONE.x + LIVES_ZONE.width - LIFE_ICON_SPRITE.width;
  const count = Math.min(lives, LIVES_ICON_SLOTS);
  for (let i = 0; i < count; i++) {
    drawSprite(ctx, LIFE_ICON_SPRITE, rightmostX - i * LIFE_ICON_STEP, LIVES_ZONE.y);
  }
}

/** Each enabled power-up as its capsule sprite in its fixed slot; a disabled one leaves it empty. */
function drawPowerUps(ctx: CanvasRenderingContext2D, powerUps: PowerUps): void {
  for (const kind of POWER_UP_SLOT_KINDS) {
    if (powerUps[kind]) {
      drawSprite(ctx, CAPSULE_SPRITES[kind], POWER_UP_SLOT_X[kind], POWER_UPS_ZONE.y);
    }
  }
}
