import { describe, expect, it } from 'vitest';
import { Input } from '../engine/input';
import { createRng } from '../engine/rng';
import { GAME_OVER_DELAY_TICKS } from './battle';
import { BONUS_KINDS } from './bonus';
import { ASTEROID_SPAWN_MAX_TICKS, ASTEROID_SPAWN_MIN_TICKS } from './bonus-field';
import { snapshotScene } from './dev-snapshot';
import { EXPLOSION_TICKS } from './enemy';
import { SHIP_Y } from './ship';
import { PlayScene } from './scenes/play-scene';
import { step } from './scenes/scene-test-utils';
import { TitleScene } from './scenes/title-scene';
import { ONE_CORNER_ENEMY, passiveLevel } from './test-levels';

const META = { tick: 0, paused: false };
const snap = (scene: PlayScene | TitleScene) => snapshotScene(scene, META);
/** The battle part of a snapshot; fails the test when it is null. */
function battleOf(scene: PlayScene) {
  const b = snap(scene).battle;
  if (!b) throw new Error('expected a battle snapshot');
  return b;
}

/** Passive PlayScene with one corner enemy, ticked until its asteroid spawns. */
function sceneWithAsteroid(): PlayScene {
  const scene = new PlayScene(createRng(1), undefined, { levels: ONE_CORNER_ENEMY });
  const spawnTick = scene.battle.bonuses?.spawnTick;
  if (spawnTick == null) throw new Error('expected a spawn tick');
  step(scene, new Input(), spawnTick);
  return scene;
}

describe('snapshotScene', () => {
  it('describes the title', () => {
    const s = snapshotScene(new TitleScene(createRng(1)), { tick: 42, paused: true });
    expect(s).toEqual({ tick: 42, paused: true, scene: 'title', battle: null });
  });

  it('describes a fresh battle', () => {
    const s = snap(new PlayScene(createRng(1)));
    expect(s.scene).toBe('play');
    const b = s.battle!;
    expect(b.level).toBe(1);
    expect(b.phase).toBe('playing');
    expect(b.score).toBe(0);
    expect(b.lives).toBe(3);
    expect(b.enemies.alive).toBe(28);
    expect(b.enemies.list).toHaveLength(28);
    expect(b.enemies.shots).toEqual([]);
    expect(b.player.state).toBe('active');
    expect(b.player.y).toBe(SHIP_Y);
    expect(b.player.powerUps).toEqual({ fastShot: false, doubleShot: false });
    expect(b.player.shots).toEqual([]);
    expect(b.player.maxShots).toBe(1);
    expect(b.bonuses).not.toBeNull();
    expect(b.bonuses!.asteroid).toBeNull();
    expect(b.bonuses!.capsule).toBeNull();
    expect(b.bonuses!.spawnTick).toBeGreaterThanOrEqual(ASTEROID_SPAWN_MIN_TICKS);
    expect(b.bonuses!.spawnTick).toBeLessThanOrEqual(ASTEROID_SPAWN_MAX_TICKS);
  });

  it('shows a hit: one life less, the ship down', () => {
    const scene = new PlayScene(createRng(1));
    scene.battle.player.hit();
    step(scene, new Input());
    const b = battleOf(scene);
    expect(b.lives).toBe(2);
    expect(b.player.state).toBe('down');
  });

  it("names game over 'over'", () => {
    const scene = new PlayScene(createRng(1), undefined, { lives: 1 });
    scene.battle.player.hit();
    step(scene, new Input(), GAME_OVER_DELAY_TICKS);
    const s = snap(scene);
    expect(s.scene).toBe('over');
    expect(s.battle!.phase).toBe('over');
    expect(s.battle!.player.isLost).toBe(true);
  });

  it("lists the player's shots", () => {
    const scene = new PlayScene(createRng(1));
    const input = new Input();
    input.press('fire');
    step(scene, input);
    const { shots } = battleOf(scene).player;
    expect(shots).toHaveLength(1);
    expect(shots[0]).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
      speed: expect.any(Number),
    });
  });

  it('drops dead enemies from the list; exploding ones are listed but not alive', () => {
    const scene = new PlayScene(createRng(1), undefined, {
      levels: [passiveLevel(['D.........D'])],
    });
    scene.battle.wave.enemies[0]!.kill();
    let b = battleOf(scene);
    expect(b.enemies.alive).toBe(1);
    expect(b.enemies.list.map((e) => e.state)).toEqual(['exploding', 'formation']);
    step(scene, new Input(), EXPLOSION_TICKS);
    b = battleOf(scene);
    expect(b.enemies.alive).toBe(1);
    expect(b.enemies.list).toHaveLength(1);
    expect(b.enemies.list[0]).toMatchObject({ kind: 'drone', row: 0, col: 10 });
  });

  it('shows the asteroid once it spawns', () => {
    const { asteroid } = battleOf(sceneWithAsteroid()).bonuses!;
    expect(asteroid).not.toBeNull();
    expect(BONUS_KINDS).toContain(asteroid!.bonus);
    expect(asteroid!.state).toBe('flying');
    expect([-1, 1]).toContain(asteroid!.dir);
  });

  it('is plain JSON', () => {
    const title = snap(new TitleScene(createRng(1)));
    expect(JSON.parse(JSON.stringify(title))).toEqual(title);
    const play = snap(sceneWithAsteroid());
    expect(JSON.parse(JSON.stringify(play))).toEqual(play);
  });

  it('holds copies, not live objects', () => {
    const scene = sceneWithAsteroid();
    const input = new Input();
    input.press('fire');
    step(scene, input);
    const s = snap(scene);
    const saved = JSON.stringify(s);
    input.press('right');
    step(scene, input, 10);
    expect(JSON.stringify(s)).toBe(saved);
    expect(JSON.stringify(snap(scene))).not.toBe(saved);
  });
});
