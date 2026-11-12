import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT, SCREEN_WIDTH, TICK_SECONDS } from '../config';
import type { Rng } from '../engine/rng';
import { createRng } from '../engine/rng';
import { ASTEROID_SIZE, ASTEROID_SPAWN_OFFSET_MAX } from './asteroid';
import { BONUS_KINDS } from './bonus';
import {
  ASTEROID_SPAWN_MAX_TICKS,
  ASTEROID_SPAWN_MIN_TICKS,
  ASTEROID_SPAWN_WINDOW,
  BonusField,
} from './bonus-field';
import { LEVEL_PAUSE_TICKS } from './battle';
import { CAPSULE_SIZE } from './capsule';
import { EXPLOSION_TICKS } from './enemy';

/** Returns the values in order, then throws: catches an unexpected extra call. */
function queued(...values: number[]): { rng: Rng; calls: () => number } {
  let calls = 0;
  return {
    rng: () => {
      const v = values[calls++];
      if (v === undefined) throw new Error(`unexpected rng call #${calls}`);
      return v;
    },
    calls: () => calls,
  };
}

/** Constant value, counts calls (as `counting` in attack-director.test.ts). */
function counting(v = 0.5): { rng: Rng; calls: () => number } {
  let calls = 0;
  return {
    rng: () => {
      calls++;
      return v;
    },
    calls: () => calls,
  };
}

const ALMOST_ONE = 1 - 2 ** -53;
const FLIGHT_TICKS = SCREEN_HEIGHT + ASTEROID_SIZE;
const ONE_TICK = { minTicks: 1, maxTicks: 1 };

function step(f: BonusField, spawning = true, n = 1): void {
  for (let i = 0; i < n; i++) f.update(TICK_SECONDS, spawning);
}

describe('spawn window', () => {
  it('is 300..900 ticks (В9)', () => {
    expect(ASTEROID_SPAWN_MIN_TICKS).toBe(300);
    expect(ASTEROID_SPAWN_MAX_TICKS).toBe(900);
    expect(ASTEROID_SPAWN_WINDOW).toEqual({
      minTicks: ASTEROID_SPAWN_MIN_TICKS,
      maxTicks: ASTEROID_SPAWN_MAX_TICKS,
    });
  });

  it.each([
    [0, 5],
    [1.5, 5],
    [1, 5.5],
    [6, 5],
  ])('rejects the window %d..%d', (minTicks, maxTicks) => {
    expect(() => new BonusField(counting().rng, { minTicks, maxTicks })).toThrow(RangeError);
  });

  it('accepts 1..1 and the default window', () => {
    expect(() => new BonusField(counting().rng, ONE_TICK)).not.toThrow();
    expect(() => new BonusField(counting().rng)).not.toThrow();
  });
});

describe('BonusField', () => {
  it('never spawns without startLevel and does not touch the rng', () => {
    const { rng, calls } = counting();
    const f = new BonusField(rng);
    expect(calls()).toBe(0);
    step(f, true, 1000);
    expect(f.asteroid).toBeNull();
    expect(f.spawnTick).toBeNull();
    expect(calls()).toBe(0);
  });

  it('draws the spawn tick in 300..900 with one rng call', () => {
    const low = queued(0);
    const a = new BonusField(low.rng);
    a.startLevel();
    expect(a.spawnTick).toBe(300);
    expect(a.levelTicks).toBe(0);
    expect(low.calls()).toBe(1);

    const high = queued(ALMOST_ONE);
    const b = new BonusField(high.rng);
    b.startLevel();
    expect(b.spawnTick).toBe(900);
    expect(high.calls()).toBe(1);
  });

  it('spawns on the update where levelTicks reaches spawnTick, once per level', () => {
    const { rng, calls } = queued(0, 0.75, 0, 0);
    const f = new BonusField(rng);
    f.startLevel();
    step(f, true, 299);
    expect(f.asteroid).toBeNull();
    expect(f.levelTicks).toBe(299);
    expect(calls()).toBe(1);

    step(f);
    const a = f.asteroid;
    expect(a).not.toBeNull();
    expect(a!.y).toBe(-ASTEROID_SIZE);
    expect(a!.state).toBe('flying');
    expect(f.spawnTick).toBeNull();
    expect(calls()).toBe(4);

    for (let i = 0; i < 1000; i++) {
      step(f);
      expect(f.asteroid === null || f.asteroid === a).toBe(true);
    }
    expect(f.asteroid).toBeNull();
    expect(calls()).toBe(4);
  });

  it('calls the rng in the order dir, offset, bonus on spawn', () => {
    const left = queued(0, 0.25, 0, 0.5);
    const f = new BonusField(left.rng, ONE_TICK);
    f.startLevel();
    step(f);
    expect(f.asteroid!.dir).toBe(-1);
    expect(f.asteroid!.x).toBe(SCREEN_WIDTH - ASTEROID_SIZE - 0);
    expect(f.asteroid!.bonus).toBe(BONUS_KINDS[1]);
    expect(f.asteroid!.bonus).toBe('fastShot');
    expect(left.calls()).toBe(4);

    const right = queued(0, 0.75, ALMOST_ONE, ALMOST_ONE);
    const g = new BonusField(right.rng, ONE_TICK);
    g.startLevel();
    step(g);
    expect(g.asteroid!.dir).toBe(1);
    expect(g.asteroid!.x).toBe(ASTEROID_SPAWN_OFFSET_MAX);
    expect(g.asteroid!.bonus).toBe('doubleShot');
    expect(right.calls()).toBe(4);
  });

  it('does not count level ticks or spawn while not spawning, but keeps the asteroid flying', () => {
    const f = new BonusField(counting().rng, { minTicks: 5, maxTicks: 5 });
    f.startLevel();
    step(f, true, 4);
    step(f, false, 100);
    expect(f.levelTicks).toBe(4);
    expect(f.asteroid).toBeNull();
    step(f);
    const a = f.asteroid!;
    expect(a).not.toBeNull();
    const y = a.y;
    step(f, false, 10);
    expect(f.levelTicks).toBe(5);
    expect(a.y).toBe(y + 10);
  });

  it('redraws the spawn tick on startLevel before the spawn', () => {
    const { rng } = queued(ALMOST_ONE, 0, 0.5, 0, 0);
    const f = new BonusField(rng);
    f.startLevel();
    expect(f.spawnTick).toBe(900);
    step(f, true, 100);
    f.startLevel();
    expect(f.spawnTick).toBe(300);
    expect(f.levelTicks).toBe(0);
    step(f, true, 299);
    expect(f.asteroid).toBeNull();
    step(f);
    expect(f.asteroid).not.toBeNull();
  });

  it('has no asteroid on a level cleared before its spawn tick', () => {
    const { rng } = queued(ALMOST_ONE, 0);
    const f = new BonusField(rng);
    f.startLevel();
    for (let i = 0; i < 500; i++) {
      step(f);
      expect(f.asteroid).toBeNull();
    }
    f.startLevel();
    expect(f.asteroid).toBeNull();
    expect(f.spawnTick).toBe(300);
  });

  it('keeps a flying asteroid through startLevel', () => {
    const f = new BonusField(counting().rng, ONE_TICK);
    f.startLevel();
    step(f, true, 5);
    const a = f.asteroid!;
    const { x, y, state } = a;
    f.startLevel();
    expect(f.asteroid).toBe(a);
    expect(a.x).toBe(x);
    expect(a.y).toBe(y);
    expect(a.state).toBe(state);
  });

  it('delays the spawn while the field is busy with a flying asteroid', () => {
    const { rng, calls } = counting(0.5);
    const f = new BonusField(rng, ONE_TICK);
    f.startLevel();
    step(f);
    const a = f.asteroid!;
    f.startLevel();
    expect(f.spawnTick).toBe(1);
    const before = calls();

    let updates = 0;
    for (;;) {
      step(f);
      updates++;
      if (a.state === 'gone') break;
      expect(f.asteroid).toBe(a);
      expect(f.spawnTick).toBe(1);
      expect(calls()).toBe(before);
    }
    expect(updates).toBe(FLIGHT_TICKS);
    const b = f.asteroid!;
    expect(b).not.toBeNull();
    expect(b).not.toBe(a);
    expect(b.y).toBe(-ASTEROID_SIZE);
    expect(f.spawnTick).toBeNull();
    expect(calls()).toBe(before + 3);
  });

  it('delays the spawn while the asteroid explodes', () => {
    const f = new BonusField(counting().rng, ONE_TICK);
    f.startLevel();
    step(f);
    const a = f.asteroid!;
    expect(f.hitAsteroid()).toBe(true);
    // The capsule would keep the field busy too; take it so only the explosion is left.
    expect(f.takeCapsule()).toBe(a.bonus);
    f.startLevel();
    step(f, true, EXPLOSION_TICKS - 1);
    expect(f.asteroid).toBe(a);
    expect(a.state).toBe('exploding');
    step(f);
    expect(f.asteroid).not.toBeNull();
    expect(f.asteroid).not.toBe(a);
    expect(f.spawnTick).toBeNull();
  });

  it('keeps a delayed spawn waiting while not spawning', () => {
    const f = new BonusField(counting().rng, ONE_TICK);
    f.startLevel();
    step(f);
    const a = f.asteroid!;
    f.startLevel();
    step(f, false, FLIGHT_TICKS);
    expect(a.state).toBe('gone');
    expect(f.asteroid).toBeNull();
    expect(f.spawnTick).toBe(1);
    expect(f.levelTicks).toBe(0);
    step(f, false, 10);
    expect(f.asteroid).toBeNull();
    step(f);
    expect(f.asteroid).not.toBeNull();
    expect(f.asteroid).not.toBe(a);
  });

  it('redraws the spawn tick on startLevel while waiting for a busy field', () => {
    const { rng, calls } = counting();
    const f = new BonusField(rng, ONE_TICK);
    f.startLevel();
    step(f);
    const a = f.asteroid!;
    f.startLevel();
    step(f, true, 10);
    expect(f.spawnTick).toBe(1);
    const before = calls();
    f.startLevel();
    expect(calls()).toBe(before + 1);
    expect(f.levelTicks).toBe(0);
    expect(f.spawnTick).toBe(1);
    expect(f.asteroid).toBe(a);
  });

  it('hits only a flying asteroid and drops it after the explosion', () => {
    const f = new BonusField(counting().rng, ONE_TICK);
    expect(f.hitAsteroid()).toBe(false);
    f.startLevel();
    step(f);
    expect(f.hitAsteroid()).toBe(true);
    expect(f.asteroid!.state).toBe('exploding');
    expect(f.hitAsteroid()).toBe(false);
    step(f, true, EXPLOSION_TICKS);
    expect(f.asteroid).toBeNull();
  });

  it('drops an asteroid that left below the screen in the same update', () => {
    const f = new BonusField(counting().rng, ONE_TICK);
    f.startLevel();
    step(f);
    const a = f.asteroid!;
    step(f, true, FLIGHT_TICKS - 1);
    expect(f.asteroid).toBe(a);
    step(f);
    expect(a.state).toBe('gone');
    expect(f.asteroid).toBeNull();
  });

  it.each([1, 42, 2024])('is deterministic for seed %i', (seed) => {
    const fields = [new BonusField(createRng(seed)), new BonusField(createRng(seed))] as const;
    const spawns = fields.map((f) => {
      f.startLevel();
      const spawnTick = f.spawnTick;
      for (let i = 1; i <= 900; i++) {
        step(f);
        const a = f.asteroid;
        if (a) return { spawnTick, tick: i, dir: a.dir, x: a.x, bonus: a.bonus };
      }
      return null;
    });
    expect(spawns[0]).not.toBeNull();
    expect(spawns[0]!.tick).toBe(spawns[0]!.spawnTick);
    expect(spawns[1]).toEqual(spawns[0]);
  });
});

describe('BonusField capsule', () => {
  /** A field with a fresh asteroid (spawned this update, y = -ASTEROID_SIZE). */
  function spawned(rng: Rng = counting().rng): BonusField {
    const f = new BonusField(rng, ONE_TICK);
    f.startLevel();
    step(f);
    return f;
  }

  it('drops a capsule of the asteroid bonus centered in its floored rectangle', () => {
    const { rng, calls } = counting();
    const f = spawned(rng);
    const a = f.asteroid!;
    expect(a.y).toBe(-ASTEROID_SIZE);
    a.x = 100.5;
    a.y = 50;
    const before = calls();
    expect(f.capsule).toBeNull();
    expect(f.hitAsteroid()).toBe(true);
    const c = f.capsule!;
    expect(c).not.toBeNull();
    expect(c.x).toBe(102);
    expect(c.y).toBe(52);
    expect(c.x).toBe(Math.floor(a.x) + (ASTEROID_SIZE - CAPSULE_SIZE) / 2);
    expect(c.kind).toBe(a.bonus);
    expect(c.width).toBe(CAPSULE_SIZE);
    expect(calls()).toBe(before);
  });

  it.each(BONUS_KINDS.map((kind, i) => [kind, i] as const))(
    'drops a %s capsule from an asteroid with that bonus (index %i)',
    (kind, i) => {
      const f = spawned(queued(0, 0, 0, (i + 0.5) / BONUS_KINDS.length).rng);
      expect(f.asteroid!.bonus).toBe(kind);
      f.hitAsteroid();
      expect(f.capsule!.kind).toBe(kind);
    },
  );

  it('has no capsule without a hit; a second hit on the exploding asteroid drops nothing', () => {
    const f = spawned();
    step(f, true, 10);
    expect(f.capsule).toBeNull();
    expect(f.hitAsteroid()).toBe(true);
    const c = f.capsule;
    expect(f.hitAsteroid()).toBe(false);
    expect(f.capsule).toBe(c);
  });

  it('does not move on the drop tick, then falls 1 px a tick while the asteroid explodes', () => {
    const f = spawned();
    const a = f.asteroid!;
    f.hitAsteroid();
    const c = f.capsule!;
    const { x, y } = c;
    step(f);
    expect(f.capsule).toBe(c);
    expect(c.y).toBe(y + 1);
    expect(c.x).toBe(x);
    expect(a.state).toBe('exploding');
    expect(a.stateTicks).toBe(1);
  });

  it('drops the capsule in the update it leaves below the screen', () => {
    const f = spawned();
    f.hitAsteroid();
    const c = f.capsule!;
    c.y = SCREEN_HEIGHT - 2;
    step(f);
    expect(f.capsule).toBe(c);
    step(f);
    expect(f.capsule).toBeNull();

    const g = spawned();
    g.hitAsteroid();
    g.capsule!.y = SCREEN_HEIGHT - 1;
    step(g);
    expect(g.capsule).toBeNull();
  });

  it('takeCapsule returns the kind once and leaves the asteroid exploding', () => {
    const f = spawned();
    expect(f.takeCapsule()).toBeNull();
    const a = f.asteroid!;
    f.hitAsteroid();
    expect(f.takeCapsule()).toBe(a.bonus);
    expect(f.capsule).toBeNull();
    expect(f.takeCapsule()).toBeNull();
    expect(f.asteroid).toBe(a);
    expect(a.state).toBe('exploding');
    step(f);
    expect(a.stateTicks).toBe(1);
  });

  it('delays the spawn while the capsule is on the field', () => {
    const { rng, calls } = counting();
    const f = spawned(rng);
    f.hitAsteroid();
    const c = f.capsule!;
    expect(c.y).toBe(-10);
    f.startLevel();
    const before = calls();
    step(f, true, EXPLOSION_TICKS);
    expect(f.asteroid).toBeNull();
    expect(f.capsule).toBe(c);
    expect(f.spawnTick).toBe(1);
    expect(calls()).toBe(before);
    step(f, true, SCREEN_HEIGHT - 1 - -10 - EXPLOSION_TICKS);
    expect(c.y).toBe(SCREEN_HEIGHT - 1);
    expect(f.capsule).toBe(c);
    expect(f.asteroid).toBeNull();
    expect(f.spawnTick).toBe(1);
    step(f);
    expect(f.capsule).toBeNull();
    expect(f.asteroid).not.toBeNull();
    expect(f.asteroid!.y).toBe(-ASTEROID_SIZE);
    expect(f.spawnTick).toBeNull();
  });

  it('moves the capsule while not spawning', () => {
    const f = spawned();
    f.hitAsteroid();
    const c = f.capsule!;
    const { y } = c;
    step(f, false);
    expect(c.y).toBe(y + 1);
  });

  it('is empty again before the next level could spawn, hit or not', () => {
    /** Updates from the spawn to an empty field; hitAfter null - never hit. */
    function lifetime(hitAfter: number | null): number {
      const f = new BonusField(counting().rng, ONE_TICK);
      f.startLevel();
      step(f);
      expect(f.asteroid).not.toBeNull();
      let updates = 0;
      if (hitAfter !== null) {
        step(f, true, hitAfter);
        updates += hitAfter;
        expect(f.asteroid!.state).toBe('flying');
        expect(f.hitAsteroid()).toBe(true);
      }
      while (f.asteroid !== null || f.capsule !== null) {
        if (updates >= 10_000) throw new Error('the field never empties');
        step(f, false);
        updates++;
      }
      return updates;
    }

    let max = lifetime(null);
    for (let k = 0; k < FLIGHT_TICKS; k++) max = Math.max(max, lifetime(k));
    expect(max).toBeLessThan(LEVEL_PAUSE_TICKS + ASTEROID_SPAWN_MIN_TICKS);
  });
});
