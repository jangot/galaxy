import { describe, expect, it } from 'vitest';
import { TICK_SECONDS } from '../config';
import { Input } from '../engine/input';
import type { PlayerIntent } from './player';
import { DOWN_TICKS, INVULNERABLE_TICKS, Player, readIntent } from './player';
import { SHIP_SPEED, SHIP_START_X, SHIP_WIDTH, Ship } from './ship';
import type { Shot } from './shot';
import { SHOT_HEIGHT, SHOT_SPEED, SHOT_WIDTH } from './shot';

const STEP = SHIP_SPEED * TICK_SECONDS;
const SHOT_STEP = SHOT_SPEED * TICK_SECONDS;
const IDLE = { move: 0, fire: false } as const;
const FIRE = { move: 0, fire: true } as const;
const RIGHT = { move: 1, fire: false } as const;
const RIGHT_FIRE = { move: 1, fire: true } as const;
/** A shot y that leaves the screen on the next tick. */
const LAST_ON_SCREEN_Y = -SHOT_HEIGHT + 1;

function requireShot(player: Player): Shot {
  const { shot } = player;
  if (!shot) throw new Error('expected a shot in flight');
  return shot;
}

/** Where a shot from this ship must appear. */
function muzzleOf(ship: Ship): { x: number; y: number } {
  return {
    x: ship.x + Math.floor(SHIP_WIDTH / 2) - Math.floor(SHOT_WIDTH / 2),
    y: ship.y - SHOT_HEIGHT,
  };
}

function run(player: Player, n: number, intent: PlayerIntent = IDLE): void {
  for (let i = 0; i < n; i++) player.update(TICK_SECONDS, intent);
}

/** A player off center (x = 40) that has just been hit: respawn at SHIP_START_X is visible. */
function downPlayer(): Player {
  const player = new Player(new Ship(40));
  player.hit();
  return player;
}

describe('readIntent', () => {
  it('is idle when nothing is held', () => {
    expect(readIntent(new Input())).toEqual({ move: 0, fire: false });
  });

  it('moves left when only left is held', () => {
    const input = new Input();
    input.press('left');
    expect(readIntent(input).move).toBe(-1);
  });

  it('moves right when only right is held', () => {
    const input = new Input();
    input.press('right');
    expect(readIntent(input).move).toBe(1);
  });

  it('cancels out when both directions are held', () => {
    const input = new Input();
    input.press('left');
    input.press('right');
    expect(readIntent(input).move).toBe(0);
  });

  it('fires only on the tick the fire key went down', () => {
    const input = new Input();
    input.press('fire');
    expect(readIntent(input).fire).toBe(true);
    input.endTick();
    expect(readIntent(input).fire).toBe(false);
  });
});

describe('Player', () => {
  it('creates a ship at the start position by default', () => {
    expect(new Player().ship.x).toBe(new Ship().x);
  });

  it('uses the ship it is given', () => {
    const ship = new Ship(50);
    expect(new Player(ship).ship).toBe(ship);
  });

  it('moves the ship according to the intent', () => {
    const player = new Player(new Ship(100));
    player.update(TICK_SECONDS, { move: 1, fire: false });
    expect(player.ship.x).toBe(100 + STEP);
    player.update(TICK_SECONDS, { move: -1, fire: false });
    expect(player.ship.x).toBe(100);
    player.update(TICK_SECONDS, { move: 0, fire: false });
    expect(player.ship.x).toBe(100);
  });
});

describe('Player shot', () => {
  it('starts with no shot', () => {
    expect(new Player().shot).toBeNull();
  });

  it('does not fire without the fire intent', () => {
    const player = new Player();
    player.update(TICK_SECONDS, IDLE);
    expect(player.shot).toBeNull();
  });

  it('launches a shot from the nose, not moved on the launch tick', () => {
    const player = new Player();
    player.update(TICK_SECONDS, FIRE);
    const shot = requireShot(player);
    expect({ x: shot.x, y: shot.y }).toEqual(muzzleOf(player.ship));
  });

  it('launches from the ship position after this tick move', () => {
    const player = new Player(new Ship(100));
    player.update(TICK_SECONDS, { move: 1, fire: true });
    expect(player.ship.x).toBe(100 + STEP);
    expect(requireShot(player).x).toBe(muzzleOf(player.ship).x);
  });

  it('ignores fire while a shot is in flight', () => {
    const player = new Player();
    player.update(TICK_SECONDS, FIRE);
    const first = requireShot(player);
    const y0 = first.y;
    player.update(TICK_SECONDS, FIRE);
    expect(player.shot).toBe(first);
    expect(first.y).toBe(y0 - SHOT_STEP);
  });

  it('does not buffer fire pressed during flight', () => {
    const player = new Player();
    player.update(TICK_SECONDS, FIRE);
    player.update(TICK_SECONDS, FIRE);
    requireShot(player).y = LAST_ON_SCREEN_Y;
    player.update(TICK_SECONDS, IDLE);
    expect(player.shot).toBeNull();
    player.update(TICK_SECONDS, IDLE);
    expect(player.shot).toBeNull();
  });

  it('drops the shot once it leaves the screen', () => {
    const player = new Player();
    player.update(TICK_SECONDS, FIRE);
    requireShot(player).y = LAST_ON_SCREEN_Y;
    player.update(TICK_SECONDS, IDLE);
    expect(player.shot).toBeNull();
  });

  it('keeps the shot while any part of it is on screen', () => {
    const player = new Player();
    player.update(TICK_SECONDS, FIRE);
    requireShot(player).y = LAST_ON_SCREEN_Y + SHOT_STEP;
    player.update(TICK_SECONDS, IDLE);
    expect(requireShot(player).y).toBe(LAST_ON_SCREEN_Y);
  });

  it('can fire again on the tick the old shot leaves the screen', () => {
    const player = new Player();
    player.update(TICK_SECONDS, FIRE);
    const first = requireShot(player);
    first.y = LAST_ON_SCREEN_Y;
    player.update(TICK_SECONDS, FIRE);
    const second = requireShot(player);
    expect(second).not.toBe(first);
    expect({ x: second.x, y: second.y }).toEqual(muzzleOf(player.ship));
  });

  it('does not follow the ship', () => {
    const player = new Player(new Ship(100));
    player.update(TICK_SECONDS, FIRE);
    const x = requireShot(player).x;
    for (let i = 0; i < 5; i++) player.update(TICK_SECONDS, { move: 1, fire: false });
    expect(requireShot(player).x).toBe(x);
    expect(player.ship.x).toBe(100 + 5 * STEP);
  });

  it('removeShot() drops the shot; the next fire launches a new one from the nose', () => {
    const player = new Player();
    player.update(TICK_SECONDS, FIRE);
    const first = requireShot(player);
    player.removeShot();
    expect(player.shot).toBeNull();
    player.update(TICK_SECONDS, FIRE);
    const second = requireShot(player);
    expect(second).not.toBe(first);
    expect({ x: second.x, y: second.y }).toEqual(muzzleOf(player.ship));
  });

  it('removeShot() without a shot does nothing', () => {
    const player = new Player();
    player.removeShot();
    expect(player.shot).toBeNull();
  });
});

describe('Player ship state', () => {
  it('starts active, hittable and targetable', () => {
    const player = new Player();
    expect(player.state).toBe('active');
    expect(player.stateTicks).toBe(0);
    expect(player.canBeHit).toBe(true);
    expect(player.canBeTargeted).toBe(true);
  });

  it('hit() puts the ship down in place', () => {
    const player = downPlayer();
    expect(player.state).toBe('down');
    expect(player.stateTicks).toBe(0);
    expect(player.canBeHit).toBe(false);
    expect(player.canBeTargeted).toBe(false);
    expect(player.ship.x).toBe(40);
  });

  it('ignores the intent while down', () => {
    const player = downPlayer();
    player.update(TICK_SECONDS, RIGHT_FIRE);
    expect(player.ship.x).toBe(40);
    expect(player.shot).toBeNull();
  });

  it('keeps the shot on hit() and lets it fly while down until it leaves the screen', () => {
    const player = new Player(new Ship(40));
    player.update(TICK_SECONDS, FIRE);
    const shot = requireShot(player);
    player.hit();
    expect(player.shot).toBe(shot);
    const y0 = shot.y;
    player.update(TICK_SECONDS, IDLE);
    expect(shot.y).toBe(y0 - SHOT_STEP);
    shot.y = LAST_ON_SCREEN_Y;
    player.update(TICK_SECONDS, IDLE);
    expect(player.shot).toBeNull();
  });

  it('stays down for DOWN_TICKS - 1 updates', () => {
    const player = downPlayer();
    run(player, DOWN_TICKS - 1);
    expect(player.state).toBe('down');
    expect(player.stateTicks).toBe(DOWN_TICKS - 1);
    expect(player.ship.x).toBe(40);
  });

  it('respawns invulnerable at SHIP_START_X after DOWN_TICKS updates', () => {
    const player = downPlayer();
    run(player, DOWN_TICKS);
    expect(player.state).toBe('invulnerable');
    expect(player.stateTicks).toBe(0);
    expect(player.ship.x).toBe(SHIP_START_X);
    expect(player.canBeHit).toBe(false);
    expect(player.canBeTargeted).toBe(true);
  });

  it("applies the respawn tick's intent from SHIP_START_X", () => {
    const player = downPlayer();
    run(player, DOWN_TICKS - 1);
    player.update(TICK_SECONDS, RIGHT_FIRE);
    expect(player.state).toBe('invulnerable');
    expect(player.ship.x).toBe(SHIP_START_X + STEP);
    const shot = requireShot(player);
    expect({ x: shot.x, y: shot.y }).toEqual(muzzleOf(player.ship));
  });

  it('moves and fires while invulnerable', () => {
    const player = downPlayer();
    run(player, DOWN_TICKS);
    player.update(TICK_SECONDS, RIGHT);
    expect(player.ship.x).toBe(SHIP_START_X + STEP);
    player.update(TICK_SECONDS, FIRE);
    expect(player.state).toBe('invulnerable');
    expect(player.shot).not.toBeNull();
  });

  it('becomes active INVULNERABLE_TICKS after the respawn', () => {
    const player = downPlayer();
    run(player, DOWN_TICKS);
    run(player, INVULNERABLE_TICKS - 1);
    expect(player.state).toBe('invulnerable');
    expect(player.stateTicks).toBe(INVULNERABLE_TICKS - 1);
    player.update(TICK_SECONDS, IDLE);
    expect(player.state).toBe('active');
    expect(player.stateTicks).toBe(0);
    expect(player.canBeHit).toBe(true);
  });

  it('hit() while down does not restart the timer', () => {
    const player = downPlayer();
    run(player, 10);
    player.hit();
    expect(player.state).toBe('down');
    expect(player.stateTicks).toBe(10);
    run(player, DOWN_TICKS - 10);
    expect(player.state).toBe('invulnerable');
  });

  it('hit() while invulnerable does nothing', () => {
    const player = downPlayer();
    run(player, DOWN_TICKS);
    run(player, 10);
    const x = player.ship.x;
    player.hit();
    expect(player.state).toBe('invulnerable');
    expect(player.stateTicks).toBe(10);
    expect(player.ship.x).toBe(x);
    run(player, INVULNERABLE_TICKS - 10);
    expect(player.state).toBe('active');
  });

  it('can be hit again once active', () => {
    const player = downPlayer();
    run(player, DOWN_TICKS + INVULNERABLE_TICKS);
    expect(player.state).toBe('active');
    player.hit();
    expect(player.state).toBe('down');
  });
});
