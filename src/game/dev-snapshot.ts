import type { Scene } from '../engine/scene';
import type { AsteroidState } from './asteroid';
import type { Battle, BattlePhase } from './battle';
import type { BonusKind } from './bonus';
import type { EnemyState } from './enemy';
import type { EnemyKind } from './levels';
import type { ShipState } from './player';
import { PlayScene } from './scenes/play-scene';
import { TitleScene } from './scenes/title-scene';

/**
 * Dev-only plain-JSON view of the game for window.__galaxy.state()
 * (see second-brain/architecture/dev-hooks.md). Only primitives, arrays and objects; no
 * references to live game objects. Coordinates are raw (may be fractional).
 */
export type SnapshotSceneName = 'title' | 'play' | 'over' | 'unknown';

export interface GalaxySnapshot {
  /** Simulation ticks since page load (rAF and step). */
  readonly tick: number;
  readonly paused: boolean;
  /** 'over' = PlayScene with battle.phase === 'over' (game over is not a scene). */
  readonly scene: SnapshotSceneName;
  /** null on the title. */
  readonly battle: BattleSnapshot | null;
}

export interface ShotSnapshot {
  readonly x: number;
  readonly y: number;
}

export interface BattleSnapshot {
  readonly level: number;
  readonly phase: BattlePhase;
  readonly phaseTicks: number;
  readonly score: number;
  readonly lives: number;
  readonly player: {
    readonly x: number;
    readonly y: number;
    readonly state: ShipState;
    readonly stateTicks: number;
    readonly canBeHit: boolean;
    readonly isLost: boolean;
    readonly maxShots: number;
    readonly powerUps: { readonly fastShot: boolean; readonly doubleShot: boolean };
    readonly shots: readonly (ShotSnapshot & { readonly speed: number })[];
  };
  readonly enemies: {
    /** formation + diving + returning (exploding is not alive). */
    readonly alive: number;
    /** Every enemy except 'dead'. */
    readonly list: readonly {
      readonly kind: EnemyKind;
      readonly row: number;
      readonly col: number;
      readonly state: EnemyState;
      readonly stateTicks: number;
      readonly x: number;
      readonly y: number;
    }[];
    readonly shots: readonly ShotSnapshot[];
  };
  /** null when the battle has no bonus field (never in PlayScene). */
  readonly bonuses: {
    readonly asteroid: {
      readonly x: number;
      readonly y: number;
      readonly dir: -1 | 1;
      readonly bonus: BonusKind;
      readonly state: AsteroidState;
      readonly stateTicks: number;
    } | null;
    readonly capsule: { readonly kind: BonusKind; readonly x: number; readonly y: number } | null;
    /** Level tick of the next asteroid, new or retry (BonusField.spawnTick); null - nothing waits. */
    readonly spawnTick: number | null;
    /** Bonus of the waiting retry of an unshot asteroid; null - no retry waits. */
    readonly retryBonus: BonusKind | null;
    readonly levelTicks: number;
  } | null;
}

export function snapshotBattle(battle: Battle): BattleSnapshot {
  const { player, wave, bonuses } = battle;
  const asteroid = bonuses?.asteroid ?? null;
  const capsule = bonuses?.capsule ?? null;
  return {
    level: battle.level,
    phase: battle.phase,
    phaseTicks: battle.phaseTicks,
    score: battle.score,
    lives: player.lives,
    player: {
      x: player.ship.x,
      y: player.ship.y,
      state: player.state,
      stateTicks: player.stateTicks,
      canBeHit: player.canBeHit,
      isLost: player.isLost,
      maxShots: player.maxShots,
      powerUps: { fastShot: player.powerUps.fastShot, doubleShot: player.powerUps.doubleShot },
      shots: player.shots.map((s) => ({ x: s.x, y: s.y, speed: s.speed })),
    },
    enemies: {
      alive: wave.enemies.filter((e) => e.isAlive).length,
      list: wave.enemies
        .filter((e) => e.state !== 'dead')
        .map((e) => ({
          kind: e.kind,
          row: e.slot.row,
          col: e.slot.col,
          state: e.state,
          stateTicks: e.stateTicks,
          x: e.x,
          y: e.y,
        })),
      shots: wave.shots.map((s) => ({ x: s.x, y: s.y })),
    },
    bonuses: bonuses
      ? {
          asteroid: asteroid
            ? {
                x: asteroid.x,
                y: asteroid.y,
                dir: asteroid.dir,
                bonus: asteroid.bonus,
                state: asteroid.state,
                stateTicks: asteroid.stateTicks,
              }
            : null,
          capsule: capsule ? { kind: capsule.kind, x: capsule.x, y: capsule.y } : null,
          spawnTick: bonuses.spawnTick,
          retryBonus: bonuses.retryBonus,
          levelTicks: bonuses.levelTicks,
        }
      : null,
  };
}

export function snapshotScene(
  scene: Scene,
  meta: { readonly tick: number; readonly paused: boolean },
): GalaxySnapshot {
  const base = { tick: meta.tick, paused: meta.paused };
  if (scene instanceof PlayScene) {
    const battle = snapshotBattle(scene.battle);
    return { ...base, scene: battle.phase === 'over' ? 'over' : 'play', battle };
  }
  return { ...base, scene: scene instanceof TitleScene ? 'title' : 'unknown', battle: null };
}
