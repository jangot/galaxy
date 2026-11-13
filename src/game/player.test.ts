import { describe, expect, it } from 'vitest';
import { TICK_SECONDS } from '../config';
import { Input } from '../engine/input';
import { NO_POWER_UPS } from './bonus';
import type { PlayerIntent } from './player';
import { INVULNERABLE_TICKS, MAX_SHIELD, Player, readIntent, START_SHIELD } from './player';
import { SHIP_SPEED, SHIP_WIDTH, Ship } from './ship';
import { FAST_SHOT_SPEED, SHOT_HEIGHT, SHOT_SPEED, SHOT_WIDTH, Shot } from './shot';
import { onlyShot } from './test-shots';

const STEP = SHIP_SPEED * TICK_SECONDS;
const SHOT_STEP = SHOT_SPEED * TICK_SECONDS;
const IDLE = { move: 0, fire: false } as const;
const FIRE = { move: 0, fire: true } as const;
const RIGHT = { move: 1, fire: false } as const;
const RIGHT_FIRE = { move: 1, fire: true } as const;
/** A shot y that leaves the screen on the next tick. */
const LAST_ON_SCREEN_Y = -SHOT_HEIGHT + 1;

function requireShot(player: Player): Shot {
  const shot = onlyShot(player);
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

/** A player off center (x = 40) with no shield, just hit: down for good. */
function downPlayer(): Player {
  const player = new Player(new Ship(40), 0);
  player.hit();
  return player;
}

/** A player off center (x = 40) just hit with the default shield: invulnerable in place. */
function shieldHitPlayer(): Player {
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
    expect(onlyShot(new Player())).toBeNull();
  });

  it('does not fire without the fire intent', () => {
    const player = new Player();
    player.update(TICK_SECONDS, IDLE);
    expect(onlyShot(player)).toBeNull();
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
    expect(onlyShot(player)).toBe(first);
    expect(first.y).toBe(y0 - SHOT_STEP);
  });

  it('does not buffer fire pressed during flight', () => {
    const player = new Player();
    player.update(TICK_SECONDS, FIRE);
    player.update(TICK_SECONDS, FIRE);
    requireShot(player).y = LAST_ON_SCREEN_Y;
    player.update(TICK_SECONDS, IDLE);
    expect(onlyShot(player)).toBeNull();
    player.update(TICK_SECONDS, IDLE);
    expect(onlyShot(player)).toBeNull();
  });

  it('drops the shot once it leaves the screen', () => {
    const player = new Player();
    player.update(TICK_SECONDS, FIRE);
    requireShot(player).y = LAST_ON_SCREEN_Y;
    player.update(TICK_SECONDS, IDLE);
    expect(onlyShot(player)).toBeNull();
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
    player.removeShot(first);
    expect(onlyShot(player)).toBeNull();
    player.update(TICK_SECONDS, FIRE);
    const second = requireShot(player);
    expect(second).not.toBe(first);
    expect({ x: second.x, y: second.y }).toEqual(muzzleOf(player.ship));
  });

  it('removeShot() ignores an unknown shot', () => {
    const player = new Player();
    player.removeShot(new Shot(0, 0));
    expect(onlyShot(player)).toBeNull();
    player.update(TICK_SECONDS, FIRE);
    const shot = requireShot(player);
    player.removeShot(new Shot(0, 0));
    expect(onlyShot(player)).toBe(shot);
  });
});

describe('Player power-ups', () => {
  const FAST_STEP = FAST_SHOT_SPEED * TICK_SECONDS;

  function doublePlayer(): Player {
    const player = new Player();
    player.grantPowerUp('doubleShot');
    return player;
  }

  it('starts with no power-ups, one shot slot and no shots', () => {
    const player = new Player();
    expect(player.powerUps).toEqual(NO_POWER_UPS);
    expect(player.maxShots).toBe(1);
    expect(player.shots).toEqual([]);
  });

  it('doubleShot gives a second shot slot', () => {
    const player = new Player();
    expect(player.grantPowerUp('doubleShot')).toBe(true);
    expect(player.maxShots).toBe(2);
    expect(player.powerUps.doubleShot).toBe(true);
  });

  it('with doubleShot fires two shots, oldest first, and ignores a third fire', () => {
    const player = doublePlayer();
    player.update(TICK_SECONDS, FIRE);
    player.update(TICK_SECONDS, FIRE);
    expect(player.shots).toHaveLength(2);
    const [first, second] = player.shots;
    expect(first!.y).toBeLessThan(second!.y);
    player.update(TICK_SECONDS, FIRE);
    expect(player.shots).toEqual([first, second]);
  });

  it('with doubleShot fires again on the tick the oldest shot leaves the screen', () => {
    const player = doublePlayer();
    player.update(TICK_SECONDS, FIRE);
    player.update(TICK_SECONDS, FIRE);
    const [first, second] = player.shots;
    first!.y = LAST_ON_SCREEN_Y;
    player.update(TICK_SECONDS, FIRE);
    expect(player.shots).toHaveLength(2);
    expect(player.shots[0]).toBe(second);
    expect(player.shots[1]).not.toBe(first);
    expect({ x: player.shots[1]!.x, y: player.shots[1]!.y }).toEqual(muzzleOf(player.ship));
  });

  it('fastShot speeds up the next shots, not the one in flight', () => {
    const player = new Player();
    player.update(TICK_SECONDS, FIRE);
    const old = requireShot(player);
    expect(player.grantPowerUp('fastShot')).toBe(true);
    const y0 = old.y;
    player.update(TICK_SECONDS, IDLE);
    expect(old.y).toBe(y0 - SHOT_STEP);
    player.removeShot(old);
    player.update(TICK_SECONDS, FIRE);
    const fast = requireShot(player);
    expect(fast.speed).toBe(FAST_SHOT_SPEED);
    const y1 = fast.y;
    player.update(TICK_SECONDS, IDLE);
    expect(fast.y).toBe(y1 - FAST_STEP);
  });

  it('a repeated grant is a no-op and keeps the same snapshot', () => {
    const player = new Player();
    player.grantPowerUp('fastShot');
    const snapshot = player.powerUps;
    expect(player.grantPowerUp('fastShot')).toBe(false);
    expect(player.powerUps).toBe(snapshot);
  });

  it('a grant replaces the snapshot instead of mutating it', () => {
    const player = new Player();
    const before = player.powerUps;
    player.grantPowerUp('fastShot');
    expect(before.fastShot).toBe(false);
    expect(player.powerUps).not.toBe(before);
    expect(player.powerUps.fastShot).toBe(true);
  });

  it('can be granted while down', () => {
    const player = downPlayer();
    expect(player.grantPowerUp('doubleShot')).toBe(true);
    expect(player.powerUps.doubleShot).toBe(true);
  });

  it('hit() keeps the power-ups', () => {
    const player = new Player();
    player.grantPowerUp('fastShot');
    player.grantPowerUp('doubleShot');
    const snapshot = player.powerUps;
    player.hit();
    expect(player.state).toBe('invulnerable');
    expect(player.powerUps).toBe(snapshot);
    player.update(TICK_SECONDS, FIRE);
    player.update(TICK_SECONDS, FIRE);
    expect(player.shots).toHaveLength(2);
    for (const shot of player.shots) expect(shot.speed).toBe(FAST_SHOT_SPEED);
  });

  it('removeShot(shot) removes exactly that shot; an unknown shot changes nothing', () => {
    const player = doublePlayer();
    player.update(TICK_SECONDS, FIRE);
    player.update(TICK_SECONDS, FIRE);
    const [first, second] = player.shots;
    player.removeShot(first!);
    expect(player.shots).toEqual([second]);
    const shots = player.shots;
    player.removeShot(new Shot(0, 0));
    expect(player.shots).toEqual(shots);
  });

  it('replaces the shots array instead of mutating it', () => {
    const player = doublePlayer();
    player.update(TICK_SECONDS, FIRE);
    const beforeFire = player.shots;
    player.update(TICK_SECONDS, FIRE);
    expect(beforeFire).toHaveLength(1);
    expect(player.shots).toHaveLength(2);

    const before = player.shots;
    player.removeShot(before[0]!);
    expect(before).toHaveLength(2);
    expect(player.shots).not.toBe(before);
    expect(player.shots).toHaveLength(1);

    const beforeOffscreen = player.shots;
    beforeOffscreen[0]!.y = LAST_ON_SCREEN_Y;
    player.update(TICK_SECONDS, IDLE);
    expect(beforeOffscreen).toHaveLength(1);
    expect(player.shots).toHaveLength(0);
  });

  it('while down all shots in flight keep flying and no new ones launch', () => {
    const player = new Player(undefined, 0);
    player.grantPowerUp('doubleShot');
    player.update(TICK_SECONDS, FIRE);
    player.update(TICK_SECONDS, FIRE);
    const [first, second] = player.shots;
    const y1 = first!.y;
    const y2 = second!.y;
    player.hit();
    expect(player.state).toBe('down');
    player.update(TICK_SECONDS, FIRE);
    expect(player.shots).toEqual([first, second]);
    expect(first!.y).toBe(y1 - SHOT_STEP);
    expect(second!.y).toBe(y2 - SHOT_STEP);
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
    expect(onlyShot(player)).toBeNull();
  });

  it('keeps the shot on hit() and lets it fly while down until it leaves the screen', () => {
    const player = new Player(new Ship(40), 0);
    player.update(TICK_SECONDS, FIRE);
    const shot = requireShot(player);
    player.hit();
    expect(player.state).toBe('down');
    expect(onlyShot(player)).toBe(shot);
    const y0 = shot.y;
    player.update(TICK_SECONDS, IDLE);
    expect(shot.y).toBe(y0 - SHOT_STEP);
    shot.y = LAST_ON_SCREEN_Y;
    player.update(TICK_SECONDS, IDLE);
    expect(onlyShot(player)).toBeNull();
  });

  it('hit() with a shield: shield - 1, invulnerable in place', () => {
    const player = shieldHitPlayer();
    expect(player.state).toBe('invulnerable');
    expect(player.stateTicks).toBe(0);
    expect(player.shield).toBe(START_SHIELD - 1);
    expect(player.canBeHit).toBe(false);
    expect(player.canBeTargeted).toBe(true);
    expect(player.ship.x).toBe(40);
  });

  it('keeps the shot in flight on a shield hit', () => {
    const player = new Player(new Ship(40));
    player.update(TICK_SECONDS, FIRE);
    const shot = requireShot(player);
    player.hit();
    expect(player.state).toBe('invulnerable');
    expect(onlyShot(player)).toBe(shot);
    const y0 = shot.y;
    player.update(TICK_SECONDS, IDLE);
    expect(onlyShot(player)).toBe(shot);
    expect(shot.y).toBe(y0 - SHOT_STEP);
  });

  it('stays down for good, whatever the ticks', () => {
    const player = downPlayer();
    run(player, 5000, RIGHT_FIRE);
    expect(player.state).toBe('down');
    expect(player.stateTicks).toBe(5000);
    expect(player.ship.x).toBe(40);
    expect(onlyShot(player)).toBeNull();
  });

  it('moves and fires while invulnerable', () => {
    const player = shieldHitPlayer();
    player.update(TICK_SECONDS, RIGHT);
    expect(player.ship.x).toBe(40 + STEP);
    player.update(TICK_SECONDS, FIRE);
    expect(player.state).toBe('invulnerable');
    expect(onlyShot(player)).not.toBeNull();
  });

  it('becomes active INVULNERABLE_TICKS after a shield hit', () => {
    const player = shieldHitPlayer();
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
    expect(player.shield).toBe(0);
  });

  it('hit() while invulnerable does nothing', () => {
    const player = shieldHitPlayer();
    run(player, 10);
    const x = player.ship.x;
    player.hit();
    expect(player.state).toBe('invulnerable');
    expect(player.stateTicks).toBe(10);
    expect(player.shield).toBe(START_SHIELD - 1);
    expect(player.ship.x).toBe(x);
    run(player, INVULNERABLE_TICKS - 10);
    expect(player.state).toBe('active');
  });

  it('can be hit again once active', () => {
    const player = shieldHitPlayer();
    run(player, INVULNERABLE_TICKS);
    expect(player.state).toBe('active');
    player.hit();
    expect(player.state).toBe('invulnerable');
    expect(player.shield).toBe(START_SHIELD - 2);
  });
});

describe('Player shield', () => {
  it('starts with START_SHIELD = 2 and is not lost', () => {
    expect(START_SHIELD).toBe(2);
    const player = new Player();
    expect(player.shield).toBe(START_SHIELD);
    expect(player.isLost).toBe(false);
  });

  it('accepts the starting shield in the constructor', () => {
    expect(new Player(new Ship(), MAX_SHIELD).shield).toBe(MAX_SHIELD);
    expect(new Player(new Ship(), 0).shield).toBe(0);
  });

  it.each([-1, 1.5, NaN, MAX_SHIELD + 1])('rejects %s shield with a RangeError', (shield) => {
    expect(() => new Player(new Ship(), shield)).toThrow(RangeError);
  });

  it('addShield grows the shield up to MAX_SHIELD and returns false at the cap', () => {
    expect(MAX_SHIELD).toBe(5);
    const player = new Player(new Ship(), MAX_SHIELD - 1);
    expect(player.addShield()).toBe(true);
    expect(player.shield).toBe(MAX_SHIELD);
    expect(player.addShield()).toBe(false);
    expect(player.shield).toBe(MAX_SHIELD);
  });

  it('keeps the state and stateTicks on addShield in active and invulnerable', () => {
    const player = new Player();
    run(player, 3);
    player.addShield();
    expect(player.state).toBe('active');
    expect(player.stateTicks).toBe(3);
    player.hit();
    run(player, 5);
    expect(player.state).toBe('invulnerable');
    expect(player.stateTicks).toBe(5);
    player.addShield();
    expect(player.state).toBe('invulnerable');
    expect(player.stateTicks).toBe(5);
    expect(player.shield).toBe(START_SHIELD + 1); // 2 + 1 - 1 + 1
  });

  it('addShield does nothing while down', () => {
    const player = downPlayer();
    run(player, 10);
    expect(player.addShield()).toBe(false);
    expect(player.shield).toBe(0);
    expect(player.isLost).toBe(true);
    expect(player.state).toBe('down');
    expect(player.stateTicks).toBe(10);
    run(player, 5000);
    expect(player.state).toBe('down');
  });

  it('takes a level on the hit() call itself', () => {
    const player = new Player();
    player.hit();
    expect(player.shield).toBe(START_SHIELD - 1);
    expect(player.state).toBe('invulnerable');
  });

  it('takes no level on hit() while invulnerable or down', () => {
    const player = new Player();
    player.hit();
    player.hit();
    expect(player.shield).toBe(START_SHIELD - 1);
    expect(player.state).toBe('invulnerable');
    const down = downPlayer();
    down.hit();
    expect(down.shield).toBe(0);
    expect(down.state).toBe('down');
  });

  it('a hit at shield 1 drops it to 0 and still gives invulnerable', () => {
    const player = new Player(undefined, 1);
    player.hit();
    expect(player.shield).toBe(0);
    expect(player.state).toBe('invulnerable');
    expect(player.isLost).toBe(false);
  });

  it('survives START_SHIELD hits and is lost on the next one', () => {
    const player = new Player();
    for (let i = 0; i < START_SHIELD; i++) {
      player.hit();
      expect(player.state).toBe('invulnerable');
      run(player, INVULNERABLE_TICKS);
    }
    expect(player.state).toBe('active');
    expect(player.shield).toBe(0);
    player.hit();
    expect(player.state).toBe('down');
    expect(player.isLost).toBe(true);
  });

  it('survives MAX_SHIELD hits from the max and is lost on the 6th', () => {
    const player = new Player(undefined, MAX_SHIELD);
    for (let i = 0; i < MAX_SHIELD; i++) {
      player.hit();
      expect(player.state).toBe('invulnerable');
      run(player, INVULNERABLE_TICKS);
    }
    expect(player.state).toBe('active');
    expect(player.shield).toBe(0);
    player.hit();
    expect(player.state).toBe('down');
    expect(player.isLost).toBe(true);
  });

  it('stays down for good after the fatal hit', () => {
    const player = new Player(new Ship(40), 0);
    player.hit();
    expect(player.shield).toBe(0);
    expect(player.isLost).toBe(true);
    run(player, 1000, RIGHT_FIRE);
    expect(player.state).toBe('down');
    expect(player.canBeHit).toBe(false);
    expect(player.canBeTargeted).toBe(false);
    expect(player.ship.x).toBe(40);
    expect(onlyShot(player)).toBeNull();
    expect(player.stateTicks).toBe(1000);
    expect(player.shield).toBe(0);
  });

  it('lets the shot in flight fly on after the fatal hit', () => {
    const player = new Player(new Ship(40), 0);
    player.update(TICK_SECONDS, FIRE);
    const shot = requireShot(player);
    player.hit();
    expect(player.isLost).toBe(true);
    expect(onlyShot(player)).toBe(shot);
    const y0 = shot.y;
    player.update(TICK_SECONDS, IDLE);
    expect(shot.y).toBe(y0 - SHOT_STEP);
    shot.y = LAST_ON_SCREEN_Y;
    player.update(TICK_SECONDS, IDLE);
    expect(onlyShot(player)).toBeNull();
  });
});
