import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT, SCREEN_WIDTH, TICK_SECONDS } from '../config';
import { SHIP_SPRITE } from './art';
import { SHIP_HEIGHT, SHIP_SPEED, SHIP_START_X, SHIP_WIDTH, SHIP_Y, Ship } from './ship';
import { FAST_SHOT_SPEED, SHOT_HEIGHT, SHOT_SPEED, SHOT_WIDTH } from './shot';

const STEP = SHIP_SPEED * TICK_SECONDS;
const MAX_X = SCREEN_WIDTH - SHIP_WIDTH;
const NOSE_OFFSET = Math.floor(SHIP_WIDTH / 2) - Math.floor(SHOT_WIDTH / 2);

describe('Ship', () => {
  it('derives its size from the sprite', () => {
    expect(SHIP_WIDTH).toBe(SHIP_SPRITE.width);
    expect(SHIP_HEIGHT).toBe(SHIP_SPRITE.height);
  });

  it('uses a 15x16 sprite', () => {
    expect(SHIP_SPRITE.width).toBe(15);
    expect(SHIP_SPRITE.height).toBe(16);
  });

  it('has an odd width so the nose sits on the center column', () => {
    expect(SHIP_WIDTH % 2).toBe(1);
    expect(SHIP_SPRITE.pixels[Math.floor(SHIP_WIDTH / 2)]).not.toBeNull();
  });

  it('starts horizontally centered at SHIP_Y', () => {
    const ship = new Ship();
    expect(ship.x).toBe(Math.floor((SCREEN_WIDTH - SHIP_WIDTH) / 2));
    expect(SHIP_START_X).toBe(120);
    expect(ship.x).toBe(SHIP_START_X);
    expect(ship.y).toBe(SHIP_Y);
  });

  it('fits entirely on screen', () => {
    const ship = new Ship();
    expect(ship.x).toBeGreaterThanOrEqual(0);
    expect(ship.x + SHIP_WIDTH).toBeLessThanOrEqual(SCREEN_WIDTH);
    expect(SHIP_Y + SHIP_HEIGHT).toBeLessThanOrEqual(SCREEN_HEIGHT);
  });

  it('takes x from the constructor argument', () => {
    expect(new Ship(37).x).toBe(37);
  });

  it('moves a whole number of pixels per tick (ADR 002)', () => {
    expect(Number.isInteger(STEP)).toBe(true);
  });

  it('moves right by one step per tick', () => {
    const ship = new Ship(100);
    ship.update(TICK_SECONDS, 1);
    expect(ship.x).toBe(100 + STEP);
  });

  it('moves left by one step per tick', () => {
    const ship = new Ship(100);
    ship.update(TICK_SECONDS, -1);
    expect(ship.x).toBe(100 - STEP);
  });

  it('stays put when there is no movement', () => {
    const ship = new Ship(100);
    ship.update(TICK_SECONDS, 0);
    expect(ship.x).toBe(100);
  });

  it('never changes y while moving', () => {
    const ship = new Ship(100);
    ship.update(TICK_SECONDS, 1);
    ship.update(TICK_SECONDS, -1);
    expect(ship.y).toBe(SHIP_Y);
  });

  it('cuts a step past the left edge to the edge', () => {
    const ship = new Ship(1);
    ship.update(TICK_SECONDS, -1);
    expect(ship.x).toBe(0);
  });

  it('cuts a step past the right edge to the edge', () => {
    const ship = new Ship(MAX_X - 1);
    ship.update(TICK_SECONDS, 1);
    expect(ship.x).toBe(MAX_X);
  });

  it('stays at the left edge when pushed into it', () => {
    const ship = new Ship(0);
    for (let i = 0; i < 5; i++) ship.update(TICK_SECONDS, -1);
    expect(ship.x).toBe(0);
  });

  it('stays at the right edge when pushed into it', () => {
    const ship = new Ship(MAX_X);
    for (let i = 0; i < 5; i++) ship.update(TICK_SECONDS, 1);
    expect(ship.x).toBe(MAX_X);
  });

  it('spawns a shot centered on the nose, right above the ship', () => {
    const ship = new Ship(100);
    const shot = ship.spawnShot();
    expect(shot.x).toBe(100 + NOSE_OFFSET);
    expect(shot.y + SHOT_HEIGHT).toBe(ship.y);
  });

  it('spawns a shot from the nose of the start ship', () => {
    const ship = new Ship();
    const shot = ship.spawnShot();
    expect(shot.x).toBe(ship.x + NOSE_OFFSET);
    expect(shot.y).toBe(SHIP_Y - SHOT_HEIGHT);
  });

  it('spawns a shot fully on screen at both edges', () => {
    for (const x of [0, MAX_X]) {
      const ship = new Ship(x);
      const shot = ship.spawnShot();
      expect(shot.x).toBe(x + NOSE_OFFSET);
      expect(shot.x).toBeGreaterThanOrEqual(0);
      expect(shot.x + SHOT_WIDTH).toBeLessThanOrEqual(SCREEN_WIDTH);
    }
  });

  it('returns a new shot on every call', () => {
    const ship = new Ship();
    expect(ship.spawnShot()).not.toBe(ship.spawnShot());
  });

  it('spawns a shot at SHOT_SPEED by default', () => {
    expect(new Ship().spawnShot().speed).toBe(SHOT_SPEED);
  });

  it('spawns a shot at the given speed from the same spot', () => {
    const ship = new Ship(100);
    const plain = ship.spawnShot();
    const fast = ship.spawnShot(FAST_SHOT_SPEED);
    expect(fast.speed).toBe(FAST_SHOT_SPEED);
    expect({ x: fast.x, y: fast.y }).toEqual({ x: plain.x, y: plain.y });
  });
});
