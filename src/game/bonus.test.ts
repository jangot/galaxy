import { describe, expect, it } from 'vitest';
import { BONUS_KINDS, NO_POWER_UPS } from './bonus';

describe('bonus kinds', () => {
  it('lists the kinds in a fixed order (the rng picks by index)', () => {
    expect(BONUS_KINDS).toEqual(['shield', 'fastShot', 'doubleShot']);
  });

  it('starts with every power-up off', () => {
    expect(NO_POWER_UPS).toEqual({ fastShot: false, doubleShot: false });
  });
});
