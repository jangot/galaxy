import { describe, expect, it, vi } from 'vitest';
import type { StorageBacking } from './storage';
import { memoryStorage, safeStorage } from './storage';

function fakeBacking(): StorageBacking {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

describe('memoryStorage', () => {
  it('returns null for a missing key', () => {
    expect(memoryStorage().getItem('a')).toBeNull();
  });

  it('reads back what was written and overwrites', () => {
    const storage = memoryStorage();
    storage.setItem('a', '1');
    expect(storage.getItem('a')).toBe('1');
    storage.setItem('a', '2');
    expect(storage.getItem('a')).toBe('2');
  });

  it('sees the initial values at once', () => {
    expect(memoryStorage({ a: 'x' }).getItem('a')).toBe('x');
  });

  it('two instances do not share data', () => {
    const a = memoryStorage();
    const b = memoryStorage();
    a.setItem('k', 'v');
    expect(b.getItem('k')).toBeNull();
  });

  it('is not affected by changing the initial object later', () => {
    const initial: Record<string, string> = { a: '1' };
    const storage = memoryStorage(initial);
    initial.a = '2';
    initial.b = '3';
    expect(storage.getItem('a')).toBe('1');
    expect(storage.getItem('b')).toBeNull();
  });
});

describe('safeStorage', () => {
  it('writes and reads through the backing store', () => {
    const backing = fakeBacking();
    const storage = safeStorage(() => backing);
    storage.setItem('a', '1');
    expect(backing.getItem('a')).toBe('1');
    expect(storage.getItem('a')).toBe('1');
  });

  it('returns null for a missing key', () => {
    expect(safeStorage(() => fakeBacking()).getItem('a')).toBeNull();
  });

  it('survives a getBacking that throws (SecurityError)', () => {
    const getBacking = vi.fn((): StorageBacking => {
      throw new Error('SecurityError');
    });
    const storage = safeStorage(getBacking);
    expect(getBacking).not.toHaveBeenCalled();
    expect(storage.getItem('a')).toBeNull();
    expect(() => storage.setItem('a', '1')).not.toThrow();
  });

  it('survives a backing store whose getItem / setItem throw', () => {
    const broken: StorageBacking = {
      getItem: () => {
        throw new Error('unreadable');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const storage = safeStorage(() => broken);
    expect(storage.getItem('a')).toBeNull();
    expect(() => storage.setItem('a', '1')).not.toThrow();
  });
});
