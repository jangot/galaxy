/** Power-ups that stay with the player until the game ends (owner decision В6). */
export type PowerUpKind = 'fastShot' | 'doubleShot';
/** What a capsule can carry: an extra life or a power-up. */
export type BonusKind = 'life' | PowerUpKind;

/** Fixed order for picking a bonus with the rng (index randomInt(rng, 0, BONUS_KINDS.length)). */
export const BONUS_KINDS: readonly BonusKind[] = ['life', 'fastShot', 'doubleShot'];

/** Snapshot of the enabled power-ups: on/off, not levels (speeds do not stack, В6). */
export interface PowerUps {
  readonly fastShot: boolean;
  readonly doubleShot: boolean;
}

export const NO_POWER_UPS: PowerUps = { fastShot: false, doubleShot: false };
