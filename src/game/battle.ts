import type { Rng } from '../engine/rng';
import { resolveCollisions } from './collisions';
import type { LevelConfig } from './levels';
import { levelConfig } from './levels';
import type { PlayerIntent } from './player';
import { Player } from './player';
import { SHIP_WIDTH } from './ship';
import { Wave } from './wave';

/** playing: the wave is alive; cleared: the pause before the next level's wave. */
export type BattlePhase = 'playing' | 'cleared';
/** Pause between a cleared wave and the next one, ticks (owner decision В8: 1.5 s, no caption). */
export const LEVEL_PAUSE_TICKS = 90;

export interface BattleOptions {
  /** 1-based level to start from; defaults to 1. Must be an integer >= 1 (levelConfig throws). */
  readonly startLevel?: number;
  /** Level table; defaults to LEVELS. Tests inject small tables from test-levels.ts. */
  readonly levels?: readonly LevelConfig[];
}

/**
 * Battle aggregate: everything that happens on the play field, without input or canvas.
 * Holds the player, the current level and its enemy wave, and the phase:
 * playing -> (every enemy dead) -> cleared -> (LEVEL_PAUSE_TICKS) -> playing on the next level.
 * Past the end of the level table the last level repeats.
 * The rng is the battle's own generator, separate from the scene's (starfield) one.
 */
export class Battle {
  readonly player = new Player();
  private currentWave: Wave;
  private currentLevel: number;
  private currentPhase: BattlePhase = 'playing';
  private phaseTicks = 0;
  private readonly levels: readonly LevelConfig[] | undefined;

  constructor(
    private readonly rng: Rng,
    opts: BattleOptions = {},
  ) {
    this.levels = opts.levels;
    this.currentLevel = opts.startLevel ?? 1;
    this.currentWave = this.createWave();
  }

  get level(): number {
    return this.currentLevel;
  }

  get wave(): Wave {
    return this.currentWave;
  }

  get phase(): BattlePhase {
    return this.currentPhase;
  }

  /**
   * Tick order: player -> wave (aims at the ship's center of this tick, null while the ship
   * is down) -> collisions (playing only) -> phase.
   */
  update(dt: number, intent: PlayerIntent): void {
    this.player.update(dt, intent);
    // No target while the ship is down: strikers shed their lateral speed within
    // STRIKER_TURN_TICKS ticks and then fly straight down; drones stop steering until a
    // re-aim tick finds the ship again.
    const { ship } = this.player;
    const targetX = this.player.canBeTargeted ? ship.x + Math.floor(SHIP_WIDTH / 2) : null;
    this.currentWave.update(dt, targetX);
    if (this.currentPhase === 'playing') resolveCollisions(this.player, this.currentWave);
    this.updatePhase();
  }

  /**
   * playing -> cleared once every enemy is dead (phaseTicks = 0 on that tick; enemy shots
   * still in flight are removed); cleared -> playing with the next level's wave when phaseTicks
   * reaches LEVEL_PAUSE_TICKS.
   * The new wave is drawn this tick at its start positions and first updated next tick.
   */
  private updatePhase(): void {
    if (this.currentPhase === 'playing') {
      if (this.currentWave.isCleared) {
        this.currentPhase = 'cleared';
        this.phaseTicks = 0;
        this.currentWave.clearShots();
      }
      return;
    }
    this.phaseTicks++;
    if (this.phaseTicks === LEVEL_PAUSE_TICKS) {
      this.currentLevel++;
      this.currentWave = this.createWave();
      this.currentPhase = 'playing';
    }
  }

  private createWave(): Wave {
    return new Wave(levelConfig(this.currentLevel, this.levels), this.rng);
  }
}
