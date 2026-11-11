import type { Rng } from '../engine/rng';
import { randomInt } from '../engine/rng';
import type { DiveOrder, Enemy } from './enemy';
import { CELL_WIDTH } from './formation';
import type { LevelConfig } from './levels';

/** Who flies out and with which orders; members are ordered by column; members[i] gets orders[i]. */
export interface Sortie {
  readonly members: readonly Enemy[];
  readonly orders: readonly DiveOrder[];
}

interface Candidate {
  readonly row: number;
  /** Leftmost column of the candidate: the order key within a row. */
  readonly col: number;
  /** Ordered by column, left to right. A solo candidate has one member. */
  readonly members: readonly Enemy[];
  readonly side: -1 | 1;
  readonly shots: number;
}

/**
 * Pure. Solo candidates: for each row the leftmost (side -1), then the rightmost (side +1)
 * non-raider enemy still in 'formation', so a diver never flies through its neighbours.
 * A row with a single such enemy gives one candidate; it peels to its half of the formation
 * (exact middle -> right). Group candidates: each raider group whose alive members are all in
 * 'formation' flies out whole, side by the center of its alive members (exact middle -> right).
 * Candidates are ordered by row (top to bottom), then by their leftmost column. Uniform pick
 * via rng; null (rng untouched) when nobody can go. Shots: config.diverShots for drone/striker,
 * config.raiderShots for raiders. The leader of a sortie is its outermost member towards side;
 * each member aims at the anchor + (its col - leader col) * CELL_WIDTH (0 for solo dives).
 */
export function selectSortie(
  enemies: readonly Enemy[],
  cols: number,
  config: LevelConfig,
  sortieId: number,
  rng: Rng,
): Sortie | null {
  const candidates = [
    ...edgeCandidates(enemies, cols, config.diverShots),
    ...groupCandidates(enemies, cols, config.raiderShots),
  ].sort((a, b) => a.row - b.row || a.col - b.col);
  if (candidates.length === 0) return null;
  const pick = candidates[randomInt(rng, 0, candidates.length)]!;
  return { members: pick.members, orders: ordersFor(pick, sortieId) };
}

/**
 * Orders of a candidate's members. The leader is the outermost member towards side
 * (its own offset is 0); every member aims at the anchor + (its col - leader col) * CELL_WIDTH.
 */
function ordersFor({ members, side, shots }: Candidate, sortieId: number): DiveOrder[] {
  const leader = side === -1 ? members[0]! : members[members.length - 1]!;
  const offsets = members.map((m) => (m.slot.col - leader.slot.col) * CELL_WIDTH);
  const groupMinOffsetX = Math.min(...offsets);
  const groupMaxOffsetX = Math.max(...offsets);
  return offsets.map((aimOffsetX) => ({
    sortieId,
    side,
    shots,
    aimOffsetX,
    groupMinOffsetX,
    groupMaxOffsetX,
  }));
}

/** Row edges among non-raider enemies in 'formation' (raiders have their own group candidates). */
function edgeCandidates(enemies: readonly Enemy[], cols: number, shots: number): Candidate[] {
  // Indexed by row; independent of the order of `enemies`.
  const rows: { left: Enemy; right: Enemy }[] = [];
  for (const enemy of enemies) {
    if (enemy.state !== 'formation' || enemy.slot.group !== null) continue;
    const edges = rows[enemy.slot.row];
    if (!edges) {
      rows[enemy.slot.row] = { left: enemy, right: enemy };
    } else if (enemy.slot.col < edges.left.slot.col) {
      edges.left = enemy;
    } else if (enemy.slot.col > edges.right.slot.col) {
      edges.right = enemy;
    }
  }
  const candidates: Candidate[] = [];
  const solo = (enemy: Enemy, side: -1 | 1): Candidate => ({
    row: enemy.slot.row,
    col: enemy.slot.col,
    members: [enemy],
    side,
    shots,
  });
  rows.forEach(({ left, right }) => {
    // forEach skips the holes of rows with nobody in formation.
    if (left === right) {
      candidates.push(solo(left, 2 * left.slot.col + 1 < cols ? -1 : 1));
    } else {
      candidates.push(solo(left, -1), solo(right, 1));
    }
  });
  return candidates;
}

/**
 * One candidate per raider group whose alive members are all in 'formation' (a group flies
 * out whole or not at all). Exploding/dead members are left out; a group with no alive
 * members gives nothing. side - by the center of the alive members (exact middle -> right).
 */
function groupCandidates(enemies: readonly Enemy[], cols: number, shots: number): Candidate[] {
  const groups = new Map<number, Enemy[]>();
  for (const enemy of enemies) {
    const { group } = enemy.slot;
    if (group === null || !enemy.isAlive) continue;
    const members = groups.get(group);
    if (members) members.push(enemy);
    else groups.set(group, [enemy]);
  }
  const candidates: Candidate[] = [];
  for (const members of groups.values()) {
    if (members.some((m) => m.state !== 'formation')) continue;
    members.sort((a, b) => a.slot.col - b.slot.col);
    const first = members[0]!.slot.col;
    const last = members[members.length - 1]!.slot.col;
    candidates.push({
      row: members[0]!.slot.row,
      col: first,
      members,
      side: first + last + 1 < cols ? -1 : 1,
      shots,
    });
  }
  return candidates;
}

/** Number of distinct sorties out of the formation right now. */
function activeSorties(enemies: readonly Enemy[]): number {
  const ids = new Set<number>();
  for (const enemy of enemies) if (enemy.sortieId !== null) ids.add(enemy.sortieId);
  return ids.size;
}

/**
 * When dives start. timer counts whole ticks down from firstDiveDelayTicks; at 0 a sortie is
 * launched if fewer than maxSorties are out and someone can go, then timer = diveIntervalTicks.
 * Otherwise it waits at 0 and launches on the first tick it can. At most one sortie per tick.
 */
export class AttackDirector {
  private timer: number;
  private nextSortieId = 1;

  constructor(private readonly config: LevelConfig) {
    this.timer = config.firstDiveDelayTicks;
  }

  /** Runs after the enemies have moved this tick: a launched enemy stands in this tick's slot. */
  update(enemies: readonly Enemy[], cols: number, rng: Rng): void {
    if (this.timer > 0) this.timer--;
    if (this.timer > 0) return;
    if (activeSorties(enemies) >= this.config.maxSorties) return;
    const sortie = selectSortie(enemies, cols, this.config, this.nextSortieId, rng);
    if (!sortie) return;
    sortie.members.forEach((member, i) => member.startDive(sortie.orders[i]!));
    this.nextSortieId++;
    this.timer = this.config.diveIntervalTicks;
  }
}
