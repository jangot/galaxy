import { HUD_LABEL_COLOR, HUD_VALUE_COLOR, SHIELD_COLORS, SHIELD_GAUGE_EMPTY_COLOR } from './art';
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
  POWER_UP_SLOT_KINDS,
  POWER_UP_SLOT_X,
  POWER_UPS_ZONE,
  SCORE_LABEL,
  SCORE_ZONE,
  SHIELD_SEGMENT_HEIGHT,
  SHIELD_SEGMENT_WIDTH,
  SHIELD_SEGMENT_Y,
  shieldSegmentX,
} from './hud';
import { MAX_SHIELD } from './player';
import { drawSprite } from './sprite';

/**
 * Draws the top HUD over the scene, no background: score, level, shield gauge, power-ups
 * sections.
 * Each section draws only inside its own zone (see hud.ts); a new section adds a drawX here.
 */
export function drawHud(ctx: CanvasRenderingContext2D, view: HudView): void {
  drawScore(ctx, view.score);
  drawLevel(ctx, view.level);
  drawShield(ctx, view.shield);
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

/**
 * Shield gauge: MAX_SHIELD segments left to right; the first `shield` are filled with the
 * current level's color (the whole gauge in one color, like the arc), the rest are empty.
 * Always drawn, all empty at shield 0. Not blinking: it shows the value, not the ship.
 */
function drawShield(ctx: CanvasRenderingContext2D, shield: number): void {
  const filled = SHIELD_COLORS[shield] ?? SHIELD_GAUGE_EMPTY_COLOR;
  for (let i = 0; i < MAX_SHIELD; i++) {
    ctx.fillStyle = i < shield ? filled : SHIELD_GAUGE_EMPTY_COLOR;
    ctx.fillRect(shieldSegmentX(i), SHIELD_SEGMENT_Y, SHIELD_SEGMENT_WIDTH, SHIELD_SEGMENT_HEIGHT);
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
