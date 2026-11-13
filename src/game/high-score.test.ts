import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '../engine/storage';
import { memoryStorage, safeStorage } from '../engine/storage';
import { HIGH_SCORE_KEY, HighScoreStore, parseHighScore } from './high-score';

/** memoryStorage with call counters. */
function countingStorage(initial?: Record<string, string>): KeyValueStorage & {
  gets: number;
  sets: number;
} {
  const inner = memoryStorage(initial);
  const storage = {
    gets: 0,
    sets: 0,
    getItem(key: string): string | null {
      storage.gets++;
      return inner.getItem(key);
    },
    setItem(key: string, value: string): void {
      storage.sets++;
      inner.setItem(key, value);
    },
  };
  return storage;
}

describe('parseHighScore', () => {
  it.each<[string | null, number]>([
    [null, 0],
    ['', 0],
    ['0', 0],
    ['42', 42],
    ['007', 7],
    ['-5', 0],
    ['1.5', 0],
    ['1e3', 0],
    [' 42', 0],
    ['42 ', 0],
    ['abc', 0],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
    ['9007199254740993', 0],
  ])('%j -> %d', (raw, expected) => {
    expect(parseHighScore(raw)).toBe(expected);
  });
});

describe('HighScoreStore', () => {
  it('reads best from the storage', () => {
    expect(new HighScoreStore(memoryStorage({ [HIGH_SCORE_KEY]: '500' })).best).toBe(500);
  });

  it('starts at 0 on an empty storage or garbage', () => {
    expect(new HighScoreStore(memoryStorage()).best).toBe(0);
    expect(new HighScoreStore(memoryStorage({ [HIGH_SCORE_KEY]: 'junk' })).best).toBe(0);
  });

  it('uses galaxy.highScore as the default key', () => {
    expect(HIGH_SCORE_KEY).toBe('galaxy.highScore');
    const storage = memoryStorage();
    new HighScoreStore(storage).submit(10);
    expect(storage.getItem('galaxy.highScore')).toBe('10');
  });

  it('reads and writes under a custom key', () => {
    const storage = memoryStorage({ other: '70' });
    const store = new HighScoreStore(storage, 'other');
    expect(store.best).toBe(70);
    store.submit(80);
    expect(storage.getItem('other')).toBe('80');
    expect(storage.getItem(HIGH_SCORE_KEY)).toBeNull();
  });

  it('submit of a higher score writes it once and returns true', () => {
    const storage = countingStorage({ [HIGH_SCORE_KEY]: '100' });
    const store = new HighScoreStore(storage);
    expect(store.submit(150)).toBe(true);
    expect(store.best).toBe(150);
    expect(storage.getItem(HIGH_SCORE_KEY)).toBe('150');
    expect(storage.sets).toBe(1);
  });

  it.each([100, 50])('submit(%d) at best 100: false, no read and no write', (score) => {
    const storage = countingStorage({ [HIGH_SCORE_KEY]: '100' });
    const store = new HighScoreStore(storage);
    const gets = storage.gets;
    expect(store.submit(score)).toBe(false);
    expect(storage.gets).toBe(gets);
    expect(storage.sets).toBe(0);
    expect(store.best).toBe(100);
  });

  it('keeps a higher record written by another tab', () => {
    const storage = memoryStorage({ [HIGH_SCORE_KEY]: '100' });
    const store = new HighScoreStore(storage);
    storage.setItem(HIGH_SCORE_KEY, '900');
    expect(store.submit(200)).toBe(true);
    expect(storage.getItem(HIGH_SCORE_KEY)).toBe('900');
    expect(store.best).toBe(900);
    expect(store.submit(500)).toBe(false);
  });

  it('refresh pulls a higher record and never lowers best', () => {
    const storage = memoryStorage({ [HIGH_SCORE_KEY]: '100' });
    const store = new HighScoreStore(storage);
    storage.setItem(HIGH_SCORE_KEY, '300');
    store.refresh();
    expect(store.best).toBe(300);
    storage.setItem(HIGH_SCORE_KEY, '50');
    store.refresh();
    expect(store.best).toBe(300);
    storage.setItem(HIGH_SCORE_KEY, 'junk');
    store.refresh();
    expect(store.best).toBe(300);
  });

  it('keeps the record in memory over a broken storage', () => {
    const store = new HighScoreStore(
      safeStorage(() => {
        throw new Error('SecurityError');
      }),
    );
    expect(store.best).toBe(0);
    expect(store.submit(300)).toBe(true);
    expect(store.best).toBe(300);
    store.refresh();
    expect(store.best).toBe(300);
    expect(store.submit(200)).toBe(false);
  });
});
