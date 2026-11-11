import { describe, expect, it } from 'vitest';
import { Input } from '../../engine/input';
import { createRng } from '../../engine/rng';
import { PlayScene } from './play-scene';
import { step } from './scene-test-utils';
import { TitleScene } from './title-scene';

describe('TitleScene', () => {
  it('stays on the title without start', () => {
    const title = new TitleScene(createRng(1));
    const input = new Input();
    expect(step(title, input)).toBe(title);
    expect(step(title, input, 60)).toBe(title);
  });

  it('switches to PlayScene on start', () => {
    const title = new TitleScene(createRng(1));
    const input = new Input();
    input.press('start');
    expect(step(title, input)).toBeInstanceOf(PlayScene);
  });

  it('consumes the start press after the tick', () => {
    const input = new Input();
    input.press('start');
    step(new TitleScene(createRng(1)), input);
    expect(input.pressed('start')).toBe(false);
  });
});
