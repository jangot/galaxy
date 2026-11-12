import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../config';
import { Input } from '../../engine/input';
import { createRng } from '../../engine/rng';
import { START_LIVES } from '../player';
import { Starfield } from '../starfield';
import { PlayScene } from './play-scene';
import { step } from './scene-test-utils';
import { TitleScene } from './title-scene';

/** Start a game from the title with Enter; the key is released afterwards. */
function startGame(title: TitleScene, input: Input): PlayScene {
  input.press('start');
  const next = step(title, input);
  input.release('start');
  expect(next).toBeInstanceOf(PlayScene);
  return next as PlayScene;
}

/** Hit the ship whenever it can be hit until game over; the limit makes a hang fail. */
function loseGame(game: PlayScene, input: Input): void {
  // Expected about 420 ticks: 2 × (down 60 + invulnerable 120) + 60.
  for (let i = 0; i < 600 && game.battle.phase !== 'over'; i++) {
    if (game.battle.player.canBeHit) game.battle.player.hit();
    expect(step(game, input)).toBe(game);
  }
  expect(game.battle.phase).toBe('over');
}

/** Enter on the game over caption; returns the title it leads to. */
function backToTitle(game: PlayScene, input: Input): TitleScene {
  input.press('start');
  const back = step(game, input);
  input.release('start');
  expect(back).toBeInstanceOf(TitleScene);
  return back as TitleScene;
}

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

  it('starts the game from the given level', () => {
    const input = new Input();
    input.press('start');
    const next = step(new TitleScene(createRng(1), { startLevel: 2 }), input);
    expect(next).toBeInstanceOf(PlayScene);
    expect((next as PlayScene).battle.level).toBe(2);
  });

  it('starts from level 1 without a start level', () => {
    const input = new Input();
    input.press('start');
    const next = step(new TitleScene(createRng(1)), input);
    expect((next as PlayScene).battle.level).toBe(1);
  });

  it('continues the given starfield and hands it to the game', () => {
    const sf = new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, createRng(2));
    const title = new TitleScene(createRng(1), undefined, sf);
    expect(title.starfield).toBe(sf);
    expect(startGame(title, new Input()).starfield).toBe(sf);
  });

  it('hands its own starfield to the game', () => {
    const title = new TitleScene(createRng(1));
    expect(startGame(title, new Input()).starfield).toBe(title.starfield);
  });

  it('runs a full cycle: start -> game over -> title -> new game', () => {
    const input = new Input();
    const title = new TitleScene(createRng(1));
    const stars = title.starfield;
    const game = startGame(title, input);
    loseGame(game, input);

    const back = backToTitle(game, input);
    expect(back.starfield).toBe(stars);
    // The Enter that led back is consumed: the title stays.
    expect(step(back, input)).toBe(back);

    const next = startGame(back, input);
    expect(next).not.toBe(game);
    expect(next.starfield).toBe(stars);
    expect(next.battle.level).toBe(1);
    expect(next.battle.player.lives).toBe(START_LIVES);
    expect(next.battle.phase).toBe('playing');
    expect(next.battle.score).toBe(0);
  });

  it('keeps the start level across a restart', () => {
    const input = new Input();
    const game = startGame(new TitleScene(createRng(1), { startLevel: 2 }), input);
    expect(game.battle.level).toBe(2);
    loseGame(game, input);
    const next = startGame(backToTitle(game, input), input);
    expect(next.battle.level).toBe(2);
  });

  it('starts the game with the given lives and keeps them across a restart', () => {
    const input = new Input();
    const game = startGame(new TitleScene(createRng(1), { lives: 1 }), input);
    expect(game.battle.player.lives).toBe(1);
    loseGame(game, input);
    const next = startGame(backToTitle(game, input), input);
    expect(next.battle.player.lives).toBe(1);
  });

  it('combines the start level and lives', () => {
    const game = startGame(new TitleScene(createRng(1), { startLevel: 2, lives: 5 }), new Input());
    expect(game.battle.level).toBe(2);
    expect(game.battle.player.lives).toBe(5);
  });
});
