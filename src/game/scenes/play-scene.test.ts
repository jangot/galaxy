import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT, SCREEN_WIDTH, TICK_SECONDS } from '../../config';
import { Input } from '../../engine/input';
import { createRng } from '../../engine/rng';
import type { Scene } from '../../engine/scene';
import { memoryStorage } from '../../engine/storage';
import { HUD_RECORD_COLOR } from '../art';
import { Battle, GAME_OVER_DELAY_TICKS } from '../battle';
import { BONUS_KINDS } from '../bonus';
import { ASTEROID_SPAWN_MAX_TICKS, ASTEROID_SPAWN_MIN_TICKS } from '../bonus-field';
import { recorder } from '../canvas-test-utils';
import { snapshotBattle } from '../dev-snapshot';
import { drawGameOver } from '../game-over-render';
import { HIGH_SCORE_KEY, HighScoreStore } from '../high-score';
import { HI_ZONE, HUD_VALUE_Y, hudView } from '../hud';
import { drawHud } from '../hud-render';
import { Player } from '../player';
import { SHIP_SPEED, SHIP_WIDTH, SHIP_Y, Ship } from '../ship';
import { SHOT_HEIGHT, SHOT_SPEED } from '../shot';
import { Starfield } from '../starfield';
import { ONE_CORNER_ENEMY, TWO_LEVELS } from '../test-levels';
import { PlayScene } from './play-scene';
import { step } from './scene-test-utils';
import { onlyShot } from '../test-shots';

const STEP = SHIP_SPEED * TICK_SECONDS;
/** Ticks after launch while the shot is still on screen (y reaches exactly 0). */
const TICKS_ON_SCREEN = (SHIP_Y - SHOT_HEIGHT) / (SHOT_SPEED * TICK_SECONDS);

/** One enemy far from the ship's shot column, so ship and shot tests are not disturbed by hits. */
function newScene(): PlayScene {
  return new PlayScene(createRng(1), undefined, { levels: ONE_CORNER_ENEMY });
}

/** Quick game over: no shield, a manual hit, then the delay. */
function overScene(exit?: () => Scene): PlayScene {
  const scene = new PlayScene(
    createRng(1),
    undefined,
    { levels: ONE_CORNER_ENEMY, shield: 0 },
    exit,
  );
  scene.battle.player.hit();
  step(scene, new Input(), GAME_OVER_DELAY_TICKS);
  expect(scene.battle.phase).toBe('over');
  return scene;
}

/** A stub scene and a spy factory returning it. */
function spyExit(): { exit: () => Scene; target: Scene; calls: () => number } {
  const target: Scene = { update: () => undefined, render: () => undefined };
  let n = 0;
  return {
    exit: () => {
      n++;
      return target;
    },
    target,
    calls: () => n,
  };
}

describe('PlayScene', () => {
  it('places the ship at the start position', () => {
    const scene = newScene();
    expect(scene.battle).toBeInstanceOf(Battle);
    expect(scene.battle.player).toBeInstanceOf(Player);
    expect(scene.battle.player.ship.x).toBe(new Ship().x);
    expect(scene.battle.player.ship.y).toBe(SHIP_Y);
  });

  it('stays still when both directions are held', () => {
    const scene = newScene();
    const { x, y } = scene.battle.player.ship;
    const input = new Input();
    input.press('left');
    input.press('right');
    step(scene, input, 30);
    expect(scene.battle.player.ship.x).toBe(x);
    expect(scene.battle.player.ship.y).toBe(y);
  });

  it('drives the ship right while the key is held', () => {
    const scene = newScene();
    const x0 = scene.battle.player.ship.x;
    const input = new Input();
    input.press('right');
    step(scene, input, 10);
    expect(scene.battle.player.ship.x).toBe(x0 + 10 * STEP);
  });

  it('drives the ship left while the key is held', () => {
    const scene = newScene();
    const x0 = scene.battle.player.ship.x;
    const input = new Input();
    input.press('left');
    step(scene, input, 10);
    expect(scene.battle.player.ship.x).toBe(x0 - 10 * STEP);
  });

  it('stops at once when the key is released', () => {
    const scene = newScene();
    const input = new Input();
    input.press('right');
    step(scene, input, 10);
    const x = scene.battle.player.ship.x;
    input.release('right');
    step(scene, input, 10);
    expect(scene.battle.player.ship.x).toBe(x);
  });

  it('stops at the right edge', () => {
    const scene = newScene();
    const input = new Input();
    input.press('right');
    step(scene, input, 200);
    expect(scene.battle.player.ship.x).toBe(SCREEN_WIDTH - SHIP_WIDTH);
  });

  it('does not fire without the fire key', () => {
    const scene = newScene();
    step(scene, new Input(), 10);
    expect(onlyShot(scene.battle.player)).toBeNull();
  });

  it('fires when the fire key goes down', () => {
    const scene = newScene();
    const input = new Input();
    input.press('fire');
    step(scene, input, 1);
    expect(onlyShot(scene.battle.player)).not.toBeNull();
  });

  it('does not autofire while the key is held, fires again on a new press', () => {
    const scene = newScene();
    const input = new Input();
    input.press('fire');
    step(scene, input, 1);
    const first = onlyShot(scene.battle.player);
    expect(first).not.toBeNull();
    step(scene, input, TICKS_ON_SCREEN);
    expect(onlyShot(scene.battle.player)).toBe(first);
    step(scene, input, 1);
    expect(onlyShot(scene.battle.player)).toBeNull();
    step(scene, input, 30);
    expect(onlyShot(scene.battle.player)).toBeNull();

    input.release('fire');
    input.press('fire');
    step(scene, input, 1);
    expect(onlyShot(scene.battle.player)).not.toBeNull();
    expect(onlyShot(scene.battle.player)).not.toBe(first);
  });

  it('ignores a press while the shot is in flight', () => {
    const scene = newScene();
    const input = new Input();
    input.press('fire');
    step(scene, input, 1);
    const first = onlyShot(scene.battle.player);
    step(scene, input, 10);
    input.release('fire');
    input.press('fire');
    step(scene, input, 1);
    expect(onlyShot(scene.battle.player)).toBe(first);
  });

  it('builds the level 1 wave', () => {
    expect(new PlayScene(createRng(1)).battle.wave.enemies.length).toBe(28);
  });

  it('passes battle options', () => {
    const scene = new PlayScene(createRng(1), undefined, { levels: TWO_LEVELS, startLevel: 2 });
    expect(scene.battle.level).toBe(2);
    expect(scene.battle.wave.enemies).toHaveLength(2);
  });

  it('shoots down an enemy', () => {
    // Ship at x = 50: the shot flies in column x = 57. Fire is down before tick 1, so the shot
    // appears in tick 1 at y = 204 and in tick k stands at y = 204 - 4(k - 1).
    // The enemy spans y = 34 … 42: tick 41 (y = 44) misses, tick 42 (y = 40) hits.
    // By tick 42 the formation has swayed 42 × 0.25 = 10.5 px: the enemy spans x = 52 … 62.
    const scene = newScene();
    scene.battle.player.ship.x = 50;
    const enemy = scene.battle.wave.enemies[0]!;
    const input = new Input();
    input.press('fire');
    step(scene, input, 41);
    expect(onlyShot(scene.battle.player)).not.toBeNull();
    expect(onlyShot(scene.battle.player)!.x).toBe(57);
    expect(enemy.state).toBe('formation');
    step(scene, input, 1);
    expect(onlyShot(scene.battle.player)).toBeNull();
    expect(enemy.state).toBe('exploding');
  });

  describe('game over', () => {
    it('leaves to the exit scene on start', () => {
      const spy = spyExit();
      const scene = overScene(spy.exit);
      const input = new Input();
      input.press('start');
      expect(step(scene, input)).toBe(spy.target);
      expect(spy.calls()).toBe(1);
    });

    it('counts start on the very tick of entering over', () => {
      const spy = spyExit();
      const scene = new PlayScene(
        createRng(1),
        undefined,
        { levels: ONE_CORNER_ENEMY, shield: 0 },
        spy.exit,
      );
      scene.battle.player.hit();
      const input = new Input();
      step(scene, input, GAME_OVER_DELAY_TICKS - 1);
      expect(scene.battle.phase).toBe('playing');
      input.press('start');
      expect(step(scene, input)).toBe(spy.target);
      expect(scene.battle.phase).toBe('over');
      expect(scene.battle.phaseTicks).toBe(0);
    });

    it('ignores start while playing', () => {
      const spy = spyExit();
      const scene = new PlayScene(createRng(1), undefined, { levels: ONE_CORNER_ENEMY }, spy.exit);
      const input = new Input();
      input.press('start');
      expect(step(scene, input)).toBe(scene);
      expect(scene.battle.phase).toBe('playing');
      expect(spy.calls()).toBe(0);
    });

    it('stays on the caption without an exit', () => {
      const scene = overScene();
      const input = new Input();
      input.press('start');
      expect(step(scene, input)).toBe(scene);
    });

    it('draws the caption last in over', () => {
      const scene = overScene();
      const expected = recorder();
      drawGameOver(expected.ctx, scene.battle.phaseTicks);
      const n = expected.calls.length;
      expect(n).toBeGreaterThan(0);
      const { ctx, calls } = recorder();
      scene.render(ctx);
      expect(calls.slice(-n)).toEqual(expected.calls);
    });

    it('does not draw the caption while playing', () => {
      const scene = newScene();
      const expected = recorder();
      drawGameOver(expected.ctx, scene.battle.phaseTicks);
      const n = expected.calls.length;
      const { ctx, calls } = recorder();
      scene.render(ctx);
      expect(calls.slice(-n)).not.toEqual(expected.calls);
    });
  });
});

describe('PlayScene bonuses', () => {
  it('gives the battle a bonus field with a spawn tick in the window, the same for one seed', () => {
    const a = new PlayScene(createRng(1));
    const b = new PlayScene(createRng(1));
    const field = a.battle.bonuses;
    expect(field).not.toBeNull();
    expect(field!.spawnTick).toBeGreaterThanOrEqual(ASTEROID_SPAWN_MIN_TICKS);
    expect(field!.spawnTick).toBeLessThanOrEqual(ASTEROID_SPAWN_MAX_TICKS);
    expect(b.battle.bonuses!.spawnTick).toBe(field!.spawnTick);
  });

  it('keeps a passed opts.bonuses', () => {
    const scene = new PlayScene(createRng(1), undefined, {
      levels: ONE_CORNER_ENEMY,
      bonuses: { rng: () => 0 },
    });
    const input = new Input();
    step(scene, input, 299);
    expect(scene.battle.bonuses!.asteroid).toBeNull();
    step(scene, input, 1);
    const asteroid = scene.battle.bonuses!.asteroid!;
    expect(asteroid).not.toBeNull();
    expect(asteroid.x).toBe(244);
    expect(asteroid.bonus).toBe(BONUS_KINDS[0]);
  });

  it('makes exactly the scene rng calls it made before bonuses', () => {
    const rng = createRng(1);
    new PlayScene(rng);
    const ref = createRng(1);
    new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, ref);
    ref();
    expect(rng()).toBe(ref());
  });

  it('for a given seed the stars and the battle go as before bonuses', () => {
    const scene = new PlayScene(createRng(1));
    // The old scheme: stars, then the battle seed, no bonus field.
    const ref = createRng(1);
    const refStars = new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, ref);
    const refBattle = new Battle(createRng(Math.floor(ref() * 2 ** 32)));
    const input = new Input();
    for (let i = 0; i < 1200; i++) {
      step(scene, input);
      refStars.update(TICK_SECONDS);
      refBattle.update(TICK_SECONDS, { move: 0, fire: false });
    }
    // 1200 ticks at 0.4 px/tick: every star has restarted at least once.
    expect(scene.starfield.stars).toEqual(refStars.stars);
    const enemies = (b: Battle) => b.wave.enemies.map((e) => [e.x, e.y, e.state]);
    expect(enemies(scene.battle)).toEqual(enemies(refBattle));
    expect(scene.battle.player.state).toBe(refBattle.player.state);
    expect(scene.battle.player.shield).toBe(refBattle.player.shield);
  });
});

/** Shoots down the corner enemy (see 'shoots down an enemy'): battle.score > 0 afterwards. */
function scoringScene(records?: HighScoreStore): PlayScene {
  const scene = new PlayScene(
    createRng(1),
    undefined,
    { levels: ONE_CORNER_ENEMY },
    undefined,
    records,
  );
  scene.battle.player.ship.x = 50;
  const input = new Input();
  input.press('fire');
  step(scene, input, 42);
  expect(scene.battle.wave.enemies[0]!.state).toBe('exploding');
  expect(scene.battle.score).toBeGreaterThan(0);
  return scene;
}

/** Calls of a render that paint the HI value in HUD_RECORD_COLOR. */
function recordColorCalls(scene: PlayScene): number {
  const { ctx, calls } = recorder();
  scene.render(ctx);
  return calls.filter(
    (c) =>
      c.fillStyle === HUD_RECORD_COLOR &&
      c.y >= HUD_VALUE_Y &&
      c.x >= HI_ZONE.x &&
      c.x + c.w <= HI_ZONE.x + HI_ZONE.width &&
      c.y + c.h <= HI_ZONE.y + HI_ZONE.height,
  ).length;
}

describe('PlayScene record', () => {
  it('without records uses its own in-memory store', () => {
    const a = newScene();
    const b = newScene();
    expect(a.records.best).toBe(0);
    expect(a.records).not.toBe(b.records);
  });

  it('starts from the saved record', () => {
    const records = new HighScoreStore(memoryStorage({ [HIGH_SCORE_KEY]: '500' }));
    const scene = new PlayScene(createRng(1), undefined, undefined, undefined, records);
    expect(scene.records).toBe(records);
    expect(scene.hudRecord()).toEqual({ best: 500, atStart: 500 });
  });

  it('takes the record at start after refresh (another tab)', () => {
    const storage = memoryStorage();
    const records = new HighScoreStore(storage);
    storage.setItem(HIGH_SCORE_KEY, '700');
    const scene = new PlayScene(createRng(1), undefined, undefined, undefined, records);
    expect(scene.hudRecord().atStart).toBe(700);
    expect(scene.hudRecord().best).toBe(700);
  });

  it('writes a beaten record at once', () => {
    const storage = memoryStorage();
    const scene = scoringScene(new HighScoreStore(storage));
    const score = scene.battle.score;
    expect(storage.getItem(HIGH_SCORE_KEY)).toBe(String(score));
    expect(scene.records.best).toBe(score);
    expect(scene.hudRecord()).toEqual({ best: score, atStart: 0 });
    expect(hudView(scene.battle, scene.hudRecord()).newRecord).toBe(true);
  });

  it('leaves a record above the score alone', () => {
    const storage = memoryStorage({ [HIGH_SCORE_KEY]: '999999' });
    const scene = scoringScene(new HighScoreStore(storage));
    expect(storage.getItem(HIGH_SCORE_KEY)).toBe('999999');
    const view = hudView(scene.battle, scene.hudRecord());
    expect(view.newRecord).toBe(false);
    expect(view.highScore).toBe(999999);
  });

  it('spends no scene rng', () => {
    const rng = createRng(1);
    const records = new HighScoreStore(memoryStorage({ [HIGH_SCORE_KEY]: '500' }));
    new PlayScene(rng, undefined, undefined, undefined, records);
    const ref = createRng(1);
    new Starfield(SCREEN_WIDTH, SCREEN_HEIGHT, ref);
    ref();
    expect(rng()).toBe(ref());
  });

  it('does not change the battle', () => {
    const records = new HighScoreStore(memoryStorage({ [HIGH_SCORE_KEY]: '999999' }));
    const a = new PlayScene(createRng(1), undefined, undefined, undefined, records);
    const b = new PlayScene(createRng(1));
    const input = new Input();
    for (let i = 0; i < 300; i++) {
      if (i % 20 === 0) input.press('fire');
      if (i % 20 === 10) input.release('fire');
      a.update(TICK_SECONDS, input);
      b.update(TICK_SECONDS, input);
      input.endTick();
    }
    expect(snapshotBattle(a.battle)).toEqual(snapshotBattle(b.battle));
  });

  it('renders the HI value in the record color only after beating the record', () => {
    expect(recordColorCalls(scoringScene())).toBeGreaterThan(0);
    expect(recordColorCalls(newScene())).toBe(0);
  });
});

describe('PlayScene HUD', () => {
  it('draws the HUD panel last while playing, over the battle', () => {
    const scene = newScene();
    const hud = recorder();
    drawHud(hud.ctx, hudView(scene.battle, scene.hudRecord()));
    const { ctx, calls } = recorder();
    scene.render(ctx);
    expect(calls.slice(-hud.calls.length)).toEqual(hud.calls);
  });
});
