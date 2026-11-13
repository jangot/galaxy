import type { Rng } from '../engine/rng';
import type { BonusKind } from './bonus';
import { BonusField } from './bonus-field';
import { resolveBonusCollisions, resolveCollisions } from './collisions';
import type { LevelConfig } from './levels';
import { levelConfig } from './levels';
import type { PlayerIntent } from './player';
import { Player, START_SHIELD } from './player';
import { asteroidPoints, BONUS_FALLBACK_POINTS, extraShieldsEarned, killPoints } from './score';
import { SHIP_WIDTH } from './ship';
import { Wave } from './wave';

/**
 * playing: the wave is alive; cleared: the pause before the next level's wave;
 * over: the ship is lost (hit without a shield) - terminal, the wave keeps flying, no collisions.
 */
export type BattlePhase = 'playing' | 'cleared' | 'over';
/** Pause between a cleared wave and the next one, ticks (owner decision В8: 1.5 s, no caption). */
export const LEVEL_PAUSE_TICKS = 90;
/** Ticks from the fatal hit (no shield) to over (feature 005, В3: 1 s); > EXPLOSION_TICKS. */
export const GAME_OVER_DELAY_TICKS = 60;

export interface BonusOptions {
  /** The bonus field's own generator: never shifts the wave's dive choices. */
  readonly rng: Rng;
}

export interface BattleOptions {
  /** 1-based level to start from; defaults to 1. Must be an integer >= 1 (levelConfig throws). */
  readonly startLevel?: number;
  /** Level table; defaults to LEVELS. Tests inject small tables from test-levels.ts. */
  readonly levels?: readonly LevelConfig[];
  /** Starting shield, default START_SHIELD; tests use 0 for a quick game over. Player validates it. */
  readonly shield?: number;
  /** Asteroids and bonuses; absent = none (old tests, test tables). PlayScene always passes it. */
  readonly bonuses?: BonusOptions;
}

/**
 * Battle aggregate: everything that happens on the play field, without input or canvas.
 * Holds the player, the current level and its enemy wave, the score (killPoints per kill,
 * see score.ts) and a shield level for each score threshold (extraShieldsEarned, capped by
 * MAX_SHIELD, none while down), and the phase:
 * playing -> (every enemy dead) -> cleared -> (LEVEL_PAUSE_TICKS) -> playing on the next level;
 * playing | cleared -> (ship lost, GAME_OVER_DELAY_TICKS) -> over, terminal; a threshold
 * crossed while the ship is down does not cancel it (feature 008, В7).
 * Past the end of the level table levelConfig escalates the last level
 * (shorter dive timers, see levels.ts).
 * Optional bonus field (opts.bonuses, own rng): one asteroid per level (an unshot one that
 * leaves comes back with the same bonus after a delay from the spawn window, until shot down
 * or the level changes), worth asteroidPoints when shot down; it drops a capsule, and the
 * ship catching it gets the bonus (applyBonus) or BONUS_FALLBACK_POINTS instead of a useless
 * one; a new level draws its spawn tick and cancels a waiting retry.
 * The rng is the battle's own generator, separate from the scene's (starfield) one.
 */
export class Battle {
  readonly player: Player;
  private currentWave: Wave;
  private currentLevel: number;
  private currentPhase: BattlePhase = 'playing';
  private ticksInPhase = 0;
  private currentScore = 0;
  private readonly levels: readonly LevelConfig[] | undefined;
  private readonly bonusField: BonusField | null;

  constructor(
    private readonly rng: Rng,
    opts: BattleOptions = {},
  ) {
    this.player = new Player(undefined, opts.shield ?? START_SHIELD);
    this.levels = opts.levels;
    this.currentLevel = opts.startLevel ?? 1;
    this.currentWave = this.createWave();
    // Only the bonus rng is called here: the battle rng sees the same calls as without bonuses.
    this.bonusField = opts.bonuses ? new BonusField(opts.bonuses.rng) : null;
    this.bonusField?.startLevel();
  }

  get level(): number {
    return this.currentLevel;
  }

  get wave(): Wave {
    return this.currentWave;
  }

  /** The asteroid field; null when opts.bonuses is absent. For the renderer and tests. */
  get bonuses(): BonusField | null {
    return this.bonusField;
  }

  get phase(): BattlePhase {
    return this.currentPhase;
  }

  /**
   * Integer >= 0, starts at 0; grows by kills during 'playing', by a shot-down asteroid
   * (asteroidPoints) and BONUS_FALLBACK_POINTS for a useless caught bonus, during 'playing'
   * or 'cleared'.
   */
  get score(): number {
    return this.currentScore;
  }

  /** Ticks since entering the current phase, any phase: 0 after the update of the transition. */
  get phaseTicks(): number {
    return this.ticksInPhase;
  }

  /**
   * Tick order: player -> wave (aims at the ship's center of this tick, null while the ship
   * is down) -> bonus field (moves; an asteroid that left unshot schedules its retry; counts
   * the level tick and spawns, new asteroid or retry, only in playing) -> enemy collisions and scoring (playing only) -> bonus collisions, asteroid points and the
   * caught bonus (playing and cleared; enemies go first, so a shot that killed an enemy cannot
   * hit the asteroid) -> phase. Points of the tick: kills -> asteroid -> capsule bonus. In
   * over nothing collides; points use the level of this tick.
   */
  update(dt: number, intent: PlayerIntent): void {
    this.player.update(dt, intent);
    // No target while the ship is down: strikers shed their lateral speed within
    // STRIKER_TURN_TICKS ticks and then fly straight down; drones stop steering until a
    // re-aim tick finds the ship again.
    const { ship } = this.player;
    const targetX = this.player.canBeTargeted ? ship.x + Math.floor(SHIP_WIDTH / 2) : null;
    this.currentWave.update(dt, targetX);
    this.bonusField?.update(dt, this.currentPhase === 'playing');
    if (this.currentPhase === 'playing') {
      for (const kill of resolveCollisions(this.player, this.currentWave)) {
        this.addScore(killPoints(kill, this.currentLevel));
      }
    }
    if (this.bonusField && this.currentPhase !== 'over') {
      const { asteroidBroken, collected } = resolveBonusCollisions(this.player, this.bonusField);
      if (asteroidBroken) this.addScore(asteroidPoints(this.currentLevel));
      if (collected !== null) this.applyBonus(collected);
    }
    this.updatePhase();
  }

  /**
   * The only place the score changes. Each shield threshold crossed by these points gives
   * player.addShield() (lost over MAX_SHIELD or while down; the threshold still counts). Runs
   * after resolveCollisions; within the tick the order is kills -> asteroid -> capsule bonus,
   * so this tick's hit is charged first: at MAX_SHIELD a ram that crosses a threshold goes
   * 5 -> 4 -> 5, at shield 0 it is down and the game is over.
   */
  private addScore(points: number): void {
    const before = this.currentScore;
    this.currentScore += points;
    for (let i = extraShieldsEarned(before, this.currentScore); i > 0; i--) this.player.addShield();
  }

  /**
   * A caught capsule (feature 006 В6, В8; feature 008 В5): shield - addShield(); a power-up -
   * turned on if it is off. Useless (L at MAX_SHIELD, the power-up already on) -
   * BONUS_FALLBACK_POINTS instead. Decided by the state at this moment: after the kills and
   * the asteroid points of the tick (a shield level just won by them can make L useless).
   * addShield() is false only at the cap here: a down ship catches no capsule (collisions.ts).
   */
  private applyBonus(kind: BonusKind): void {
    if (kind === 'shield') {
      if (!this.player.addShield()) this.addScore(BONUS_FALLBACK_POINTS);
      return;
    }
    if (this.player.powerUps[kind]) this.addScore(BONUS_FALLBACK_POINTS);
    else this.player.grantPowerUp(kind);
  }

  /**
   * Counts the tick, then checks in order (each transition sets phaseTicks = 0):
   * 1. playing | cleared -> over once the ship is lost and GAME_OVER_DELAY_TICKS have passed
   *    since the fatal hit; checked first, so the level never changes after the loss;
   * 2. playing -> cleared once every enemy is dead (enemy shots still in flight are removed);
   * 3. cleared -> playing with the next level's wave (and the bonus field's next level) when phaseTicks reaches LEVEL_PAUSE_TICKS.
   * over is terminal. The new wave is drawn this tick at its start positions and first
   * updated next tick.
   */
  private updatePhase(): void {
    this.ticksInPhase++;
    if (this.currentPhase === 'over') return;
    if (this.player.isLost && this.player.stateTicks >= GAME_OVER_DELAY_TICKS) {
      this.enterPhase('over');
      return;
    }
    if (this.currentPhase === 'playing') {
      if (this.currentWave.isCleared) {
        this.enterPhase('cleared');
        this.currentWave.clearShots();
      }
      return;
    }
    if (this.ticksInPhase === LEVEL_PAUSE_TICKS) {
      this.currentLevel++;
      this.currentWave = this.createWave();
      this.bonusField?.startLevel();
      this.enterPhase('playing');
    }
  }

  private enterPhase(phase: BattlePhase): void {
    this.currentPhase = phase;
    this.ticksInPhase = 0;
  }

  private createWave(): Wave {
    return new Wave(levelConfig(this.currentLevel, this.levels), this.rng);
  }
}
