import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../config';
import { HUD_LABEL_COLOR, HUD_VALUE_COLOR } from './art';
import type { FillCall } from './canvas-test-utils';
import { recorder } from './canvas-test-utils';
import { drawText, GLYPH_HEIGHT, textWidth } from './font';
import {
  centeredX,
  drawGameOver,
  GAME_OVER_BACKDROP,
  GAME_OVER_BACKDROP_PAD,
  GAME_OVER_TEXT,
  GAME_OVER_Y,
  isPromptVisible,
  PRESS_ENTER_TEXT,
  PRESS_ENTER_Y,
} from './game-over-render';
import { HUD_HEIGHT } from './hud';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BLACK = '#000';

function rowRect(text: string, y: number, pad = 0): Rect {
  return {
    x: centeredX(text) - pad,
    y: y - pad,
    w: textWidth(text) + 2 * pad,
    h: GLYPH_HEIGHT + 2 * pad,
  };
}

function inside(call: FillCall, r: Rect): boolean {
  return (
    call.x >= r.x && call.y >= r.y && call.x + call.w <= r.x + r.w && call.y + call.h <= r.y + r.h
  );
}

const CAPTION = rowRect(GAME_OVER_TEXT, GAME_OVER_Y);
const PROMPT = rowRect(PRESS_ENTER_TEXT, PRESS_ENTER_Y);
const CAPTION_PAD = rowRect(GAME_OVER_TEXT, GAME_OVER_Y, GAME_OVER_BACKDROP_PAD);
const PROMPT_PAD = rowRect(PRESS_ENTER_TEXT, PRESS_ENTER_Y, GAME_OVER_BACKDROP_PAD);

function draw(phaseTicks: number, backdrop?: boolean): FillCall[] {
  const { ctx, calls } = recorder();
  if (backdrop === undefined) drawGameOver(ctx, phaseTicks);
  else drawGameOver(ctx, phaseTicks, backdrop);
  return calls;
}

describe('centeredX', () => {
  it('centers both rows by the text width, in whole pixels', () => {
    for (const text of [GAME_OVER_TEXT, PRESS_ENTER_TEXT]) {
      expect(centeredX(text)).toBe(Math.floor((SCREEN_WIDTH - textWidth(text)) / 2));
      expect(Number.isInteger(centeredX(text))).toBe(true);
    }
    expect(centeredX(GAME_OVER_TEXT)).toBe(92);
    expect(centeredX(PRESS_ENTER_TEXT)).toBe(84);
  });
});

describe('game over layout', () => {
  it('keeps both rows (with the backdrop margin) on screen and below the HUD', () => {
    for (const r of [CAPTION_PAD, PROMPT_PAD]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(SCREEN_WIDTH);
      expect(r.y).toBeGreaterThanOrEqual(HUD_HEIGHT);
      expect(r.y + r.h).toBeLessThanOrEqual(SCREEN_HEIGHT);
    }
  });

  it('puts the caption above the prompt without overlap', () => {
    expect(CAPTION_PAD.y + CAPTION_PAD.h).toBeLessThanOrEqual(PROMPT_PAD.y);
    expect(Number.isInteger(GAME_OVER_Y)).toBe(true);
    expect(Number.isInteger(PRESS_ENTER_Y)).toBe(true);
  });
});

describe('isPromptVisible', () => {
  it('blinks every 30 ticks, shown first', () => {
    expect(isPromptVisible(0)).toBe(true);
    expect(isPromptVisible(29)).toBe(true);
    expect(isPromptVisible(30)).toBe(false);
    expect(isPromptVisible(59)).toBe(false);
    expect(isPromptVisible(60)).toBe(true);
  });
});

describe('drawGameOver', () => {
  it('draws both rows in their colors without a backdrop', () => {
    const calls = draw(0, false);
    expect(calls.length).toBeGreaterThan(0);
    let caption = 0;
    let prompt = 0;
    for (const c of calls) {
      expect(c.w).toBe(1);
      expect(c.h).toBe(1);
      expect(c.fillStyle).not.toBe(BLACK);
      if (inside(c, CAPTION)) {
        expect(c.fillStyle).toBe(HUD_LABEL_COLOR);
        caption++;
      } else {
        expect(inside(c, PROMPT)).toBe(true);
        expect(c.fillStyle).toBe(HUD_VALUE_COLOR);
        prompt++;
      }
    }
    expect(caption).toBeGreaterThan(0);
    expect(prompt).toBeGreaterThan(0);
  });

  it('draws exactly the font text at the row positions', () => {
    const expected = recorder();
    drawText(expected.ctx, GAME_OVER_TEXT, centeredX(GAME_OVER_TEXT), GAME_OVER_Y, HUD_LABEL_COLOR);
    drawText(
      expected.ctx,
      PRESS_ENTER_TEXT,
      centeredX(PRESS_ENTER_TEXT),
      PRESS_ENTER_Y,
      HUD_VALUE_COLOR,
    );
    expect(draw(0, false)).toEqual(expected.calls);
  });

  it('hides the prompt on the blink-off tick', () => {
    const calls = draw(30, false);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(inside(c, CAPTION)).toBe(true);
    expect(calls.some((c) => inside(c, PROMPT))).toBe(false);
  });

  it('draws a padded black box under each row before its text', () => {
    const calls = draw(0, true);
    const boxes = calls.filter((c) => c.fillStyle === BLACK);
    expect(boxes).toHaveLength(2);
    const captionBox = calls.findIndex((c) => c.fillStyle === BLACK);
    const promptBox = calls.findIndex((c, i) => i > captionBox && c.fillStyle === BLACK);
    expect(calls[captionBox]).toMatchObject(CAPTION_PAD);
    expect(calls[promptBox]).toMatchObject(PROMPT_PAD);

    const captionText = calls.filter((c) => c.fillStyle === HUD_LABEL_COLOR);
    const promptText = calls.filter((c) => c.fillStyle === HUD_VALUE_COLOR);
    expect(captionText.length).toBeGreaterThan(0);
    expect(promptText.length).toBeGreaterThan(0);
    expect(captionBox).toBeLessThan(calls.indexOf(captionText[0]!));
    expect(promptBox).toBeLessThan(calls.indexOf(promptText[0]!));
    for (const c of captionText) expect(inside(c, CAPTION_PAD)).toBe(true);
    for (const c of promptText) expect(inside(c, PROMPT_PAD)).toBe(true);
  });

  it('keeps the prompt backdrop while the prompt is hidden', () => {
    const calls = draw(30, true);
    const boxes = calls.filter((c) => c.fillStyle === BLACK);
    expect(boxes).toHaveLength(2);
    expect(boxes[1]).toMatchObject(PROMPT_PAD);
    expect(calls.some((c) => c.fillStyle === HUD_VALUE_COLOR)).toBe(false);
  });

  it('uses GAME_OVER_BACKDROP by default', () => {
    expect(draw(0)).toEqual(draw(0, GAME_OVER_BACKDROP));
  });
});
