import { describe, expect, it } from 'vitest';
import { HUD_WINDOW_COLOR, SHOT_COLOR } from './art';
import { ASTEROID_SIZE } from './asteroid';
import type { PowerUpKind } from './bonus';
import { BONUS_KINDS, NO_POWER_UPS } from './bonus';
import { ASTEROID_SPRITE, CAPSULE_OFF_SPRITES, CAPSULE_SPRITES } from './bonus-art';
import { CAPSULE_SIZE } from './capsule';
import { ENEMY_SHOT_COLOR } from './enemy-art';
import type { Sprite } from './sprite';

describe('ASTEROID_SPRITE', () => {
  it('is 12×12, the asteroid hitbox', () => {
    expect(ASTEROID_SPRITE.width).toBe(12);
    expect(ASTEROID_SPRITE.height).toBe(12);
    expect(ASTEROID_SPRITE.width).toBe(ASTEROID_SIZE);
    expect(ASTEROID_SPRITE.height).toBe(ASTEROID_SIZE);
  });

  it('has opaque pixels', () => {
    expect(ASTEROID_SPRITE.pixels.some((p) => p !== null)).toBe(true);
  });

  it('does not use the shot colors, so shots over it stay visible', () => {
    expect(ASTEROID_SPRITE.pixels).not.toContain(SHOT_COLOR);
    expect(ASTEROID_SPRITE.pixels).not.toContain(ENEMY_SHOT_COLOR);
  });
});

describe('CAPSULE_SPRITES', () => {
  it('has a sprite for every bonus kind, in BONUS_KINDS order', () => {
    expect(Object.keys(CAPSULE_SPRITES)).toEqual([...BONUS_KINDS]);
  });

  it.each(BONUS_KINDS)('%s is 8×8, the capsule hitbox', (kind) => {
    const sprite = CAPSULE_SPRITES[kind];
    expect(sprite.width).toBe(8);
    expect(sprite.height).toBe(8);
    expect(sprite.width).toBe(CAPSULE_SIZE);
    expect(sprite.height).toBe(CAPSULE_SIZE);
  });

  it.each(BONUS_KINDS)('%s has opaque pixels and no shot colors', (kind) => {
    const { pixels } = CAPSULE_SPRITES[kind];
    expect(pixels.some((p) => p !== null)).toBe(true);
    expect(pixels).not.toContain(SHOT_COLOR);
    expect(pixels).not.toContain(ENEMY_SHOT_COLOR);
  });

  it('differs between kinds', () => {
    for (let i = 0; i < BONUS_KINDS.length; i++) {
      for (let j = i + 1; j < BONUS_KINDS.length; j++) {
        const a = CAPSULE_SPRITES[BONUS_KINDS[i]!].pixels;
        const b = CAPSULE_SPRITES[BONUS_KINDS[j]!].pixels;
        expect(a).not.toEqual(b);
      }
    }
  });
});

const POWER_UP_KINDS = Object.keys(NO_POWER_UPS) as PowerUpKind[];
const colorsOf = (s: Sprite): Set<string> =>
  new Set(s.pixels.filter((p): p is string => p !== null));

describe('CAPSULE_OFF_SPRITES', () => {
  it('has an unlit lamp for every power-up kind', () => {
    expect(Object.keys(CAPSULE_OFF_SPRITES).sort()).toEqual([...POWER_UP_KINDS].sort());
  });

  it.each(POWER_UP_KINDS)('%s is the size of the lit capsule (8×8)', (kind) => {
    expect(CAPSULE_OFF_SPRITES[kind].width).toBe(CAPSULE_SPRITES[kind].width);
    expect(CAPSULE_OFF_SPRITES[kind].height).toBe(CAPSULE_SPRITES[kind].height);
  });

  it.each(POWER_UP_KINDS)('%s has the lit capsule shape (same opaque pixels)', (kind) => {
    const off = CAPSULE_OFF_SPRITES[kind].pixels.map((p) => p !== null);
    const lit = CAPSULE_SPRITES[kind].pixels.map((p) => p !== null);
    expect(off).toEqual(lit);
  });

  it.each(POWER_UP_KINDS)('%s does not use the window black', (kind) => {
    expect(colorsOf(CAPSULE_OFF_SPRITES[kind]).has(HUD_WINDOW_COLOR)).toBe(false);
  });

  it.each(POWER_UP_KINDS)('%s shares no color with the lit capsule', (kind) => {
    const lit = colorsOf(CAPSULE_SPRITES[kind]);
    for (const c of colorsOf(CAPSULE_OFF_SPRITES[kind])) expect(lit.has(c), c).toBe(false);
  });

  it('differs between kinds', () => {
    expect(CAPSULE_OFF_SPRITES.fastShot.pixels).not.toEqual(CAPSULE_OFF_SPRITES.doubleShot.pixels);
  });
});
