import type { StorageAdapter, CacheEntry } from './types.js';
import { parseDuration, type Duration } from './duration.js';

export interface PrimitivesOptions {
  adapter: StorageAdapter;
  prefix?: string;
}

export interface SetOptions {
  tags: string[][];
  ttl: Duration;
  grace?: Duration | false;
}

export interface Primitives {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options: SetOptions): Promise<void>;
  del(key: string): Promise<void>;
  invalidate(tags: string[][], exact?: boolean): Promise<void>;
  clear(): Promise<void>;
  disconnect(): Promise<void>;
}

export function createPrimitives(options: PrimitivesOptions): Primitives {
  const adapter = options.adapter;
  const prefix = options.prefix ?? 't87s';

  const prefixKey = (key: string) => `${prefix}:${key}`;

  return {
    async get<T>(key: string): Promise<T | null> {
      const entry = await adapter.get<T>(prefixKey(key));
      if (!entry) return null;

      const now = Date.now();

      // Check if expired
      if (entry.expiresAt <= now) {
        // Check grace
        if (entry.graceUntil === null || entry.graceUntil <= now) {
          return null;
        }
      }

      // Check tag invalidation
      for (const tag of entry.tags) {
        for (let len = 1; len <= tag.length; len++) {
          const tagPrefix = tag.slice(0, len);
          const invalidation = await adapter.getTagInvalidationTime(tagPrefix);
          if (invalidation !== null && invalidation >= entry.createdAt) {
            return null;
          }
        }
        // Check exact
        const exactTag = [...tag, '__exact__'];
        const exactInvalidation = await adapter.getTagInvalidationTime(exactTag);
        if (exactInvalidation !== null && exactInvalidation >= entry.createdAt) {
          return null;
        }
      }

      return entry.value;
    },

    async set<T>(key: string, value: T, setOptions: SetOptions): Promise<void> {
      const ttl = parseDuration(setOptions.ttl);
      const grace = setOptions.grace === false ? false : parseDuration(setOptions.grace ?? 0);
      const now = Date.now();

      const entry: CacheEntry<T> = {
        value,
        tags: setOptions.tags,
        createdAt: now,
        expiresAt: now + ttl,
        graceUntil: grace === false ? null : now + ttl + grace,
      };

      await adapter.set(prefixKey(key), entry);
    },

    async del(key: string): Promise<void> {
      await adapter.delete(prefixKey(key));
    },

    async invalidate(tags: string[][], exact = false): Promise<void> {
      const now = Date.now();
      for (const tag of tags) {
        if (exact) {
          const exactTag = [...tag, '__exact__'];
          await adapter.setTagInvalidationTime(exactTag, now);
        } else {
          await adapter.setTagInvalidationTime(tag, now);
        }
      }
    },

    async clear(): Promise<void> {
      await adapter.clear();
    },

    async disconnect(): Promise<void> {
      await adapter.disconnect();
    },
  };
}
