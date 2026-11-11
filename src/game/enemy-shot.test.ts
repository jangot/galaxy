import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT, TICK_SECONDS } from '../config';
import { ENEMY_SHOT_HEIGHT, ENEMY_SHOT_SPEED, ENEMY_SHOT_WIDTH, EnemyShot } from './enemy-shot';

describe('EnemyShot', () => {
  it('moves down 4 px per tick and keeps its x', () => {
    const shot = new EnemyShot(10, 20);
    shot.update(TICK_SECONDS);
    expect(shot.y).toBe(24);
    expect(shot.x).toBe(10);
    shot.update(TICK_SECONDS);
    expect(shot.y).toBe(28);
    expect(shot.x).toBe(10);
  });

  it('is offscreen once its top reaches the bottom edge', () => {
    const shot = new EnemyShot(10, 0);
    shot.y = SCREEN_HEIGHT - 1;
    expect(shot.isOffscreen).toBe(false);
    shot.y = SCREEN_HEIGHT;
    expect(shot.isOffscreen).toBe(true);
  });

  it('has a whole speed of 4 px/tick and a 1x4 size', () => {
    expect(Number.isInteger(ENEMY_SHOT_SPEED * TICK_SECONDS)).toBe(true);
    expect(ENEMY_SHOT_SPEED * TICK_SECONDS).toBe(4);
    expect(ENEMY_SHOT_WIDTH).toBe(1);
    expect(ENEMY_SHOT_HEIGHT).toBe(4);
  });
});
