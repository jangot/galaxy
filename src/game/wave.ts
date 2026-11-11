import type { Rng } from '../engine/rng';
import { AttackDirector } from './attack-director';
import type { EnemyEnv } from './enemy';
import { Enemy } from './enemy';
import { EnemyShot } from './enemy-shot';
import { Formation } from './formation';
import type { LevelConfig } from './levels';
import { parseLayout } from './levels';

/** Enemy shots on screen at once (owner decision В2); a shot over the limit is lost. */
export const MAX_ENEMY_SHOTS = 4;

/**
 * One level's worth of enemies and their shots: built from a LevelConfig, thrown away as a
 * whole on level change.
 */
export class Wave {
  readonly formation: Formation;
  /** Same order as the layout slots: row-major, top to bottom, left to right. */
  readonly enemies: readonly Enemy[];
  private readonly director: AttackDirector;
  private readonly enemyShots: EnemyShot[] = [];

  /** The rng is the battle's: it picks who dives. */
  constructor(
    readonly config: LevelConfig,
    private readonly rng: Rng,
  ) {
    const layout = parseLayout(config.layout);
    this.formation = new Formation(layout.cols, layout.rows, config.swaySpeed);
    this.enemies = layout.slots.map((slot) => new Enemy(slot, this.formation));
    this.director = new AttackDirector(config);
  }

  /** True when every enemy is dead (explosions finished), not just hit. */
  get isCleared(): boolean {
    return this.enemies.every((e) => e.state === 'dead');
  }

  /** Enemy shots in creation order. A live view: copy it before mutating the wave in a loop. */
  get shots(): readonly EnemyShot[] {
    return this.enemyShots;
  }

  /**
   * Tick order: formation sway -> enemy shots fly, those past the bottom are removed ->
   * every enemy (reads this tick's slots and targetX; one that fires gets a shot from the
   * center of its bottom edge if fewer than MAX_ENEMY_SHOTS are out) -> attack director
   * (a newly launched enemy stands in this tick's slot and takes its first peel step next tick).
   * A new shot does not move on its first tick; a slot freed by a shot leaving is free this tick.
   * targetX: center X of the ship, or null when there is nothing to aim at.
   */
  update(dt: number, targetX: number | null): void {
    this.formation.update(dt);
    this.updateShots(dt);
    const env: EnemyEnv = { diveSpeed: this.config.diveSpeed, targetX };
    for (const enemy of this.enemies) {
      const fired = enemy.update(dt, env);
      if (fired && this.enemyShots.length < MAX_ENEMY_SHOTS) {
        this.enemyShots.push(shotFrom(enemy));
      }
    }
    this.director.update(this.enemies, this.formation.cols, this.rng);
  }

  /** Removes one shot (it hit the ship); unknown shots are ignored. */
  removeShot(shot: EnemyShot): void {
    const i = this.enemyShots.indexOf(shot);
    if (i >= 0) this.enemyShots.splice(i, 1);
  }

  /** Removes every enemy shot (the wave is cleared). */
  clearShots(): void {
    this.enemyShots.length = 0;
  }

  /** Moves the shots and drops those past the bottom, in place, keeping the order. */
  private updateShots(dt: number): void {
    let kept = 0;
    for (const shot of this.enemyShots) {
      shot.update(dt);
      if (!shot.isOffscreen) this.enemyShots[kept++] = shot;
    }
    this.enemyShots.length = kept;
  }
}

/** A shot under the center column of the drawn sprite, at the enemy's nose. */
function shotFrom(enemy: Enemy): EnemyShot {
  return new EnemyShot(Math.floor(enemy.x) + Math.floor(enemy.width / 2), enemy.y + enemy.height);
}
