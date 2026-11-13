/** Minimal string key-value storage; implementations never throw. */
export interface KeyValueStorage {
  /** null when missing or unreadable. */
  getItem(key: string): string | null;
  /** Silently ignored when the backing store refuses (quota, security). */
  setItem(key: string, value: string): void;
}

/** The part of the DOM Storage that safeStorage uses. */
export type StorageBacking = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Wraps a browser Storage. getBacking is called on every access inside try/catch: merely
 * reading window.localStorage may throw (SecurityError). Any exception = missing value /
 * ignored write.
 */
export function safeStorage(getBacking: () => StorageBacking): KeyValueStorage {
  return {
    getItem(key) {
      try {
        return getBacking().getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        getBacking().setItem(key, value);
      } catch {
        // quota exceeded or storage disabled: the value lives only in the caller's memory
      }
    },
  };
}

/** In-memory storage for tests and as a fallback. */
export function memoryStorage(initial: Readonly<Record<string, string>> = {}): KeyValueStorage {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}
