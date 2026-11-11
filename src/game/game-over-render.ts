import { SCREEN_WIDTH } from '../config';
import { HUD_LABEL_COLOR, HUD_VALUE_COLOR } from './art';
import { drawText, GLYPH_HEIGHT, textWidth } from './font';

export const GAME_OVER_TEXT = 'GAME OVER';
export const PRESS_ENTER_TEXT = 'PRESS ENTER';
/** Top of the caption row, logical px: about the middle of the play field (below the HUD). */
export const GAME_OVER_Y = 112;
/** Top of the prompt row: two font rows (2 × 8 px) below the caption. */
export const PRESS_ENTER_Y = GAME_OVER_Y + 16;
/** Prompt blinks: shown BLINK ticks, hidden BLINK ticks; shown on phaseTicks = 0. */
export const PRESS_ENTER_BLINK_TICKS = 30; // as the title's PRESS ENTER
/** Black box under each row; off by default, the owner decides on visual acceptance. */
export const GAME_OVER_BACKDROP = false;
/** Backdrop margin around a row on every side, px. */
export const GAME_OVER_BACKDROP_PAD = 2;

const BACKDROP_COLOR = '#000';

/** floor((SCREEN_WIDTH - textWidth(text)) / 2); textWidth includes the trailing cell gap. */
export function centeredX(text: string): number {
  return Math.floor((SCREEN_WIDTH - textWidth(text)) / 2);
}

export function isPromptVisible(phaseTicks: number): boolean {
  return Math.floor(phaseTicks / PRESS_ENTER_BLINK_TICKS) % 2 === 0;
}

function drawBackdrop(ctx: CanvasRenderingContext2D, text: string, y: number): void {
  const pad = GAME_OVER_BACKDROP_PAD;
  ctx.fillStyle = BACKDROP_COLOR;
  ctx.fillRect(centeredX(text) - pad, y - pad, textWidth(text) + 2 * pad, GLYPH_HEIGHT + 2 * pad);
}

/**
 * Game over caption over the field and the HUD: GAME OVER (label color) and a blinking
 * PRESS ENTER (value color), both centered by X. The backdrop of a row is drawn before its
 * text; the prompt's backdrop stays while the prompt itself is hidden by the blink.
 */
export function drawGameOver(
  ctx: CanvasRenderingContext2D,
  phaseTicks: number,
  backdrop: boolean = GAME_OVER_BACKDROP,
): void {
  if (backdrop) drawBackdrop(ctx, GAME_OVER_TEXT, GAME_OVER_Y);
  drawText(ctx, GAME_OVER_TEXT, centeredX(GAME_OVER_TEXT), GAME_OVER_Y, HUD_LABEL_COLOR);
  if (backdrop) drawBackdrop(ctx, PRESS_ENTER_TEXT, PRESS_ENTER_Y);
  if (isPromptVisible(phaseTicks)) {
    drawText(ctx, PRESS_ENTER_TEXT, centeredX(PRESS_ENTER_TEXT), PRESS_ENTER_Y, HUD_VALUE_COLOR);
  }
}
