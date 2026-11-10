import { describe, expect, it } from 'vitest';
import { Input } from './input';

describe('Input', () => {
  it('reports pressed only on the first tick', () => {
    const input = new Input();
    input.press('fire');
    expect(input.pressed('fire')).toBe(true);
    expect(input.isDown('fire')).toBe(true);
    input.endTick();
    expect(input.pressed('fire')).toBe(false);
    expect(input.isDown('fire')).toBe(true);
  });

  it('does not re-trigger pressed on key repeat', () => {
    const input = new Input();
    input.press('fire');
    input.endTick();
    input.press('fire', true);
    expect(input.pressed('fire')).toBe(false);
  });

  it('release clears held state', () => {
    const input = new Input();
    input.press('left');
    input.release('left');
    expect(input.isDown('left')).toBe(false);
  });
});
