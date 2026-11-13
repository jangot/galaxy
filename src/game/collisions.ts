import type { BonusKind } from './bonus';
import type { BonusField } from './bonus-field';
import type { Enemy } from './enemy';
import { ENEMY_SHOT_HEIGHT, ENEMY_SHOT_WIDTH } from './enemy-shot';
import type { EnemyKind } from './levels';
import type { Player } from './player';
import { SHIP_HEIGHT, SHIP_WIDTH } from './ship';
import { SHOT_HEIGHT, SHOT_WIDTH } from './shot';
import type { Wave } from './wave';

/** An enemy killed this tick; captured before kill() changes its state. */
export interface Kill {
  readonly kind: EnemyKind;
  /** enemy.isOut at the moment of the hit (diving or returning); always true for a ram. */
  readonly inFlight: boolean;
}

/** Axis-aligned rectangle, top-left corner + size, logical pixels. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Strict AABB on the pixel grid: positions are floored (as the renderer does), sizes are whole.
 * Touching edges do not overlap.
 */
export function overlaps(a: Rect, b: Rect): boolean {
  const ax = Math.floor(a.x);
  const ay = Math.floor(a.y);
  const bx = Math.floor(b.x);
  const by = Math.floor(b.y);
  return ax < bx + b.width && bx < ax + a.width && ay < by + b.height && by < ay + a.height;
}

/**
 * Runs after everything has moved this tick, during 'playing' only. Rules in order:
 * 1. Each player shot, in player.shots order, kills one alive enemy (in formation or in flight)
 *    it overlaps - the lowest one (largest y + height; on a tie the smaller index in
 *    wave.enemies) - and is removed. An enemy killed by an earlier shot is already exploding,
 *    so a later shot over it flies on.
 * 2. Enemy shot: while the ship can be hit, the first shot in wave.shots order that overlaps
 *    the ship is removed and the ship is hit; at most one per tick.
 * 3. Ram: while the ship can be hit, the first enemy out of the formation (diving/returning)
 *    in wave.enemies order that overlaps the ship is killed and the ship is hit; one hit per tick.
 * A hit is player.hit(): it takes a shield level (the ship blinks, invulnerable) or, with no
 * shield, puts the ship down.
 * Rule 1 goes first: an enemy shot down this tick is already exploding and cannot ram.
 * Rules 2 and 3 share one hit per tick: after a shot hit the ship can no longer be hit, so a
 * would-be rammer survives and flies on. Player and enemy shots never interact.
 * Returns this tick's kills in the order they happened (rule 1 before rule 3, at most three: two shots and
 * a ram);
 * enemy shots kill no enemies.
 */
export function resolveCollisions(player: Player, wave: Wave): readonly Kill[] {
  const kills: Kill[] = [];
  hitByPlayerShot(player, wave, kills);
  hitByEnemyShot(player, wave);
  ram(player, wave, kills);
  return kills;
}

/** What resolveBonusCollisions did this tick. */
export interface BonusEvents {
  /** A player shot broke the flying asteroid. */
  readonly asteroidBroken: boolean;
  /** The bonus caught by the ship this tick, null if none. */
  readonly collected: BonusKind | null;
}

/**
 * Bonus things vs the player, after resolveCollisions in the same tick (enemies first: a shot
 * that killed an enemy is already removed). Runs in 'playing' and 'cleared'.
 * While the asteroid is flying, the first shot in player.shots order that overlaps it is
 * removed and the asteroid is hit; at most one hit a tick (it is exploding afterwards, a later
 * shot flies on). The ship, enemies and enemy shots never interact with the asteroid.
 * Then, while the ship is not down (active or invulnerable), a capsule overlapping it is
 * taken (field.takeCapsule()); a capsule dropped by this tick's hit is checked too, so an
 * asteroid broken at the ship's height gives its bonus at once. Shots (player and enemy) pass
 * through the capsule.
 */
export function resolveBonusCollisions(player: Player, field: BonusField): BonusEvents {
  // (a) first: a capsule dropped by this hit is checked in (b) the same tick.
  const asteroidBroken = hitAsteroid(player, field);
  return { asteroidBroken, collected: catchCapsule(player, field) };
}

/** The ship (active or invulnerable, not down) overlapping the capsule takes it. */
function catchCapsule(player: Player, field: BonusField): BonusKind | null {
  const { capsule } = field;
  if (capsule === null || player.state === 'down') return null;
  if (!overlaps(shipRect(player), capsule)) return null;
  return field.takeCapsule();
}

function hitAsteroid(player: Player, field: BonusField): boolean {
  const { asteroid } = field;
  if (asteroid === null || asteroid.state !== 'flying') return false;
  for (const shot of player.shots) {
    const shotRect: Rect = { x: shot.x, y: shot.y, width: SHOT_WIDTH, height: SHOT_HEIGHT };
    if (!overlaps(shotRect, asteroid)) continue;
    player.removeShot(shot);
    return field.hitAsteroid();
  }
  return false;
}

function hitByPlayerShot(player: Player, wave: Wave, kills: Kill[]): void {
  // Safe to remove inside the loop: removeShot replaces player.shots, never mutates it.
  for (const shot of player.shots) {
    const shotRect: Rect = { x: shot.x, y: shot.y, width: SHOT_WIDTH, height: SHOT_HEIGHT };
    let target: Enemy | null = null;
    for (const enemy of wave.enemies) {
      if (!enemy.isAlive || !overlaps(shotRect, enemy)) continue;
      // Strict '>' keeps the earlier enemy on a tie.
      if (target === null || enemy.y + enemy.height > target.y + target.height) target = enemy;
    }
    if (target) {
      // Record before kill(): afterwards the enemy is exploding and isOut is false.
      kills.push({ kind: target.kind, inFlight: target.isOut });
      target.kill();
      player.removeShot(shot);
    }
  }
}

function hitByEnemyShot(player: Player, wave: Wave): void {
  if (!player.canBeHit) return;
  const ship = shipRect(player);
  for (const shot of wave.shots) {
    const rect: Rect = { x: shot.x, y: shot.y, width: ENEMY_SHOT_WIDTH, height: ENEMY_SHOT_HEIGHT };
    if (!overlaps(ship, rect)) continue;
    wave.removeShot(shot);
    player.hit();
    return; // the loop stops right after the removal
  }
}

function ram(player: Player, wave: Wave, kills: Kill[]): void {
  if (!player.canBeHit) return;
  const ship = shipRect(player);
  for (const enemy of wave.enemies) {
    // isOut implies alive: exploding/dead and formation enemies never ram.
    if (!enemy.isOut || !overlaps(ship, enemy)) continue;
    kills.push({ kind: enemy.kind, inFlight: true }); // a ram is always in flight: only isOut enemies ram
    enemy.kill();
    player.hit();
    return;
  }
}

/** The ship's hitbox: its sprite rectangle. */
function shipRect(player: Player): Rect {
  const { ship } = player;
  return { x: ship.x, y: ship.y, width: SHIP_WIDTH, height: SHIP_HEIGHT };
}
