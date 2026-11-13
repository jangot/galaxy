import {
  HUD_LABEL_COLOR,
  HUD_RECORD_COLOR,
  HUD_VALUE_COLOR,
  HUD_WINDOW_COLOR,
  PANEL_BEVEL_COLOR,
  PANEL_EDGE_COLOR,
  PANEL_PLATE_COLOR,
  PANEL_RIVET_COLOR,
  SHIELD_COLORS,
  SHIELD_GAUGE_EMPTY_COLOR,
} from './art';
import type { PowerUps } from './bonus';
import { CAPSULE_OFF_SPRITES, CAPSULE_SPRITES } from './bonus-art';
import { drawText } from './font';
import type { HudView, HudZone } from './hud';
import {
  formatLevel,
  formatScore,
  HI_LABEL,
  HI_ZONE,
  HUD_LABEL_Y,
  HUD_VALUE_Y,
  HUD_WINDOWS,
  LEVEL_LABEL,
  LEVEL_ZONE,
  levelValueX,
  PANEL_BEVEL_HEIGHT,
  PANEL_EDGE_HEIGHT,
  PANEL_RIVETS,
  PANEL_ZONE,
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
 * Draws the top HUD over the scene: the panel plate first (it covers the stars and anything
 * flying under it), then the sections - score, record (HI), level, shield gauge, power-up lamps.
 * Each section draws only inside its own zone (see hud.ts); a new section adds a drawX here.
 */
export function drawHud(ctx: CanvasRenderingContext2D, view: HudView): void {
  drawPanel(ctx);
  drawScore(ctx, view.score);
  drawHighScore(ctx, view.highScore, view.newRecord);
  drawLevel(ctx, view.level);
  drawShield(ctx, view.shield);
  drawPowerUps(ctx, view.powerUps);
}

/**
 * Plate, top edge, bottom bevel, windows, rivets; only inside PANEL_ZONE. The first fillRect
 * is the whole plate. Static: same calls every frame. Exported for the HUD render tests.
 */
export function drawPanel(ctx: CanvasRenderingContext2D): void {
  const { x, y, width, height } = PANEL_ZONE;
  ctx.fillStyle = PANEL_PLATE_COLOR;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = PANEL_EDGE_COLOR;
  ctx.fillRect(x, y, width, PANEL_EDGE_HEIGHT);
  ctx.fillStyle = PANEL_BEVEL_COLOR;
  ctx.fillRect(x, y + height - PANEL_BEVEL_HEIGHT, width, PANEL_BEVEL_HEIGHT);
  ctx.fillStyle = HUD_WINDOW_COLOR;
  for (const w of HUD_WINDOWS) ctx.fillRect(w.x, w.y, w.width, w.height);
  ctx.fillStyle = PANEL_RIVET_COLOR;
  for (const r of PANEL_RIVETS) ctx.fillRect(r.x, r.y, 1, 1);
}

/** Label on the label row at the zone's left edge, value under it at valueX. */
function drawLabeled(
  ctx: CanvasRenderingContext2D,
  zone: HudZone,
  label: string,
  value: string,
  valueX: number,
  valueColor: string = HUD_VALUE_COLOR,
): void {
  drawText(ctx, label, zone.x, HUD_LABEL_Y, HUD_LABEL_COLOR);
  drawText(ctx, value, valueX, HUD_VALUE_Y, valueColor);
}

/** Score is left-aligned under its label. */
function drawScore(ctx: CanvasRenderingContext2D, score: number): void {
  drawLabeled(ctx, SCORE_ZONE, SCORE_LABEL, formatScore(score), SCORE_ZONE.x);
}

/** Record is left-aligned under HI like the score; HUD_RECORD_COLOR while beaten, no blinking. */
function drawHighScore(ctx: CanvasRenderingContext2D, highScore: number, newRecord: boolean): void {
  const color = newRecord ? HUD_RECORD_COLOR : HUD_VALUE_COLOR;
  drawLabeled(ctx, HI_ZONE, HI_LABEL, formatScore(highScore), HI_ZONE.x, color);
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

/**
 * A lamp per power-up slot: lit (the capsule sprite, as on the field) when enabled, unlit
 * (CAPSULE_OFF_SPRITES) otherwise (В7). Slots are fixed: a lamp never moves.
 */
function drawPowerUps(ctx: CanvasRenderingContext2D, powerUps: PowerUps): void {
  for (const kind of POWER_UP_SLOT_KINDS) {
    const sprite = powerUps[kind] ? CAPSULE_SPRITES[kind] : CAPSULE_OFF_SPRITES[kind];
    drawSprite(ctx, sprite, POWER_UP_SLOT_X[kind], POWER_UPS_ZONE.y);
  }
}
