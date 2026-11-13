import type { KeyValueStorage } from '../engine/storage';

export const HIGH_SCORE_KEY = 'galaxy.highScore';

/** ASCII decimal digits only (no sign, dot, exponent, spaces). */
const DIGITS = /^\d+$/;

/** Decimal digits only, safe integer; anything else (null, sign, dot, exponent, spaces) -> 0. */
export function parseHighScore(raw: string | null): number {
  if (raw === null || !DIGITS.test(raw)) return 0;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : 0;
}

/**
 * The best score of the session, cached in memory and mirrored to the storage. best only
 * grows: a broken storage keeps the record in memory until the page reloads; garbage in the
 * storage reads as 0 and is overwritten by the first record.
 */
export class HighScoreStore {
  private value: number;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key: string = HIGH_SCORE_KEY,
  ) {
    this.value = this.stored();
  }

  get best(): number {
    return this.value;
  }

  /** Pulls a higher record written meanwhile (another tab); never lowers best. */
  refresh(): void {
    this.value = Math.max(this.value, this.stored());
  }

  /**
   * score > best: best = max(score, stored now), writes that same number, returns true.
   * Otherwise false, no read and no write. Expects an integer >= 0.
   */
  submit(score: number): boolean {
    if (score <= this.value) return false;
    const next = Math.max(score, this.stored());
    this.storage.setItem(this.key, String(next));
    this.value = next;
    return true;
  }

  private stored(): number {
    return parseHighScore(this.storage.getItem(this.key));
  }
}
