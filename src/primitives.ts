import type { StorageAdapter, CacheEntry, EntriesResult, QueryPromise } from './types.js';
import { parseDuration, type Duration } from './duration.js';

export interface PrimitivesOptions {
  adapter: StorageAdapter;
  prefix?: string;
  defaultTtl?: Duration;
  defaultGrace?: Duration | false;
  verifyPercent?: number;
}

export interface SetOptions {
  tags: string[][];
  ttl: Duration;
  grace?: Duration | false;
}

export interface RefreshResult<T> {
  old: T;
  new: T;
  changed: boolean;
}

export interface QueryOptions<T> {
  key: string;
  tags: string[][];
  fn: () => Promise<T>;
  ttl?: Duration;
  grace?: Duration | false;
  onRefresh?: (result: RefreshResult<T>) => void;
}

export interface Primitives {
  /** Execute a cached query with stampede protection, TTL, grace/SWR, and verification. */
  query<T>(options: QueryOptions<T>): Promise<T>;
  /** Raw get - returns null if expired/invalidated. Escape hatch for full control. */
  get<T>(key: string): Promise<T | null>;
  /** Raw set. Escape hatch for full control. */
  set<T>(key: string, value: T, options: SetOptions): Promise<void>;
  /** Raw delete. Escape hatch for full control. */
  del(key: string): Promise<void>;
  /** Invalidate cache entries by tags. */
  invalidate(tags: string[][], exact?: boolean): Promise<void>;
  /** Clear all cached data. */
  clear(): Promise<void>;
  /** Disconnect the adapter. */
  disconnect(): Promise<void>;
}

const DEFAULT_TTL = '30s';

/**
 * Simple string hash function (djb2 algorithm).
 * Browser-compatible, no external dependencies.
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Create a QueryPromise that lazily executes either value or entries fetch.
 */
function _createQueryPromise<T>(
  valueFn: () => Promise<T>,
  entriesFn: () => Promise<EntriesResult<T>>
): QueryPromise<T> {
  let valuePromise: Promise<T> | null = null;
  let entriesPromise: Promise<EntriesResult<T>> | null = null;

  return {
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): PromiseLike<TResult1 | TResult2> {
      if (!valuePromise) {
        valuePromise = valueFn();
      }
      return valuePromise.then(onfulfilled, onrejected);
    },
    get entries(): PromiseLike<EntriesResult<T>> {
      if (!entriesPromise) {
        entriesPromise = entriesFn();
      }
      return entriesPromise;
    },
  };
}

/**
 * Create the cache primitives - the axiomatic operations for caching.
 *
 * @example
 * ```typescript
 * const cache = createPrimitives({
 *   adapter: new MemoryAdapter(),
 *   defaultTtl: '1m',
 *   defaultGrace: '5m',
 * });
 *
 * // The main operation - cached query with all amenities
 * const user = await cache.query({
 *   key: 'user:123',
 *   tags: [['users', '123']],
 *   fn: () => fetchUser('123'),
 * });
 *
 * // Invalidate
 * await cache.invalidate([['users', '123']]);
 *
 * // Raw escape hatches
 * await cache.set('manual-key', data, { tags: [...], ttl: '1h' });
 * const data = await cache.get('manual-key');
 * ```
 */
export function createPrimitives(options: PrimitivesOptions): Primitives {
  const adapter = options.adapter;
  const prefix = options.prefix ?? 't87s';
  const defaultTtl = parseDuration(options.defaultTtl ?? DEFAULT_TTL);
  const defaultGrace =
    options.defaultGrace === undefined || options.defaultGrace === false
      ? false
      : parseDuration(options.defaultGrace);
  const verifyPercent = options.verifyPercent ?? 0.1;

  if (verifyPercent < 0 || verifyPercent > 1) {
    throw new Error('verifyPercent must be between 0 and 1');
  }

  // Stampede protection - track in-flight requests
  const inFlight = new Map<string, Promise<unknown>>();

  const prefixKey = (key: string) => `${prefix}:${key}`;

  // =========================================================================
  // Internal helpers
  // =========================================================================

  async function isEntryStale(entry: CacheEntry<unknown>): Promise<boolean> {
    for (const entryTag of entry.tags) {
      // Check exact invalidation (with marker)
      const exactTag = [...entryTag, '__exact__'];
      const exactInvalidation = await adapter.getTagInvalidationTime(exactTag);
      if (exactInvalidation !== null && exactInvalidation >= entry.createdAt) {
        return true;
      }

      // Check prefix invalidations (all possible parent prefixes)
      for (let len = 1; len <= entryTag.length; len++) {
        const tagPrefix = entryTag.slice(0, len);
        const invalidation = await adapter.getTagInvalidationTime(tagPrefix);
        if (invalidation !== null && invalidation >= entry.createdAt) {
          return true;
        }
      }
    }
    return false;
  }

  function shouldVerify(): boolean {
    if (!adapter.reportVerification) return false;
    if (verifyPercent <= 0) return false;
    if (verifyPercent >= 1) return true;
    return Math.random() < verifyPercent;
  }

  async function runVerification<T>(
    cacheKey: string,
    fn: () => Promise<T>,
    cachedValue: T
  ): Promise<void> {
    try {
      const freshValue = await fn();
      const cachedHash = simpleHash(JSON.stringify(cachedValue));
      const freshHash = simpleHash(JSON.stringify(freshValue));
      const isStale = cachedHash !== freshHash;
      await adapter.reportVerification!(cacheKey, isStale, cachedHash, freshHash);
    } catch {
      // Silently ignore verification errors
    }
  }

  async function fetchAndCache<T>(
    cacheKey: string,
    queryOpts: QueryOptions<T>,
    staleEntry?: CacheEntry<T>
  ): Promise<CacheEntry<T>> {
    const ttl = parseDuration(queryOpts.ttl ?? defaultTtl);
    const grace =
      queryOpts.grace === false || queryOpts.grace === undefined
        ? defaultGrace
        : parseDuration(queryOpts.grace);
    const now = Date.now();

    try {
      const value = await queryOpts.fn();

      const entry: CacheEntry<T> = {
        value,
        tags: queryOpts.tags,
        createdAt: now,
        expiresAt: now + ttl,
        graceUntil: grace === false ? null : now + ttl + grace,
      };

      await adapter.set(cacheKey, entry);
      return entry;
    } catch (error) {
      // Error handling with grace - return stale if available
      if (staleEntry && staleEntry.graceUntil !== null && staleEntry.graceUntil > now) {
        return staleEntry;
      }
      throw error;
    }
  }

  function refreshInBackground<T>(
    cacheKey: string,
    queryOpts: QueryOptions<T>,
    staleValue: T
  ): void {
    fetchAndCache(cacheKey, queryOpts)
      .then((freshEntry) => {
        const freshValue = freshEntry.value;
        const cachedHash = simpleHash(JSON.stringify(staleValue));
        const freshHash = simpleHash(JSON.stringify(freshValue));
        const changed = cachedHash !== freshHash;

        // Report verification (SWR is 100% verification opportunity)
        if (adapter.reportVerification) {
          adapter.reportVerification(cacheKey, changed, cachedHash, freshHash).catch(() => {});
        }

        // Fire user callback
        if (queryOpts.onRefresh) {
          try {
            queryOpts.onRefresh({ old: staleValue, new: freshValue, changed });
          } catch {
            // Swallow callback errors
          }
        }
      })
      .catch(() => {
        // Ignore errors - graced value continues to be served
      });
  }

  async function getOrFetch<T>(cacheKey: string, queryOpts: QueryOptions<T>): Promise<T> {
    const result = await getOrFetchWithEntries(cacheKey, queryOpts);
    return result.after.value;
  }

  async function getOrFetchWithEntries<T>(
    cacheKey: string,
    queryOpts: QueryOptions<T>
  ): Promise<EntriesResult<T>> {
    const now = Date.now();

    // Check cache
    const cached = await adapter.get<T>(cacheKey);
    if (cached) {
      const stale = await isEntryStale(cached);

      if (!stale && cached.expiresAt > now) {
        // Fresh hit - potentially verify in background
        if (shouldVerify()) {
          runVerification(cacheKey, queryOpts.fn, cached.value).catch(() => {});
        }
        return { before: cached, after: cached };
      }

      // Check grace period (SWR)
      if (cached.graceUntil !== null && cached.graceUntil > now) {
        // Stale but within grace - return stale, refresh in background
        refreshInBackground(cacheKey, queryOpts, cached.value);
        return { before: cached, after: cached };
      }
    }

    // Outside grace or no cache - fetch synchronously
    const newEntry = await fetchAndCache(cacheKey, queryOpts, cached ?? undefined);
    return { before: cached, after: newEntry };
  }

  // =========================================================================
  // Public API
  // =========================================================================

  return {
    async query<T>(queryOpts: QueryOptions<T>): Promise<T> {
      const cacheKey = prefixKey(queryOpts.key);

      // Stampede protection - check for in-flight request
      const existing = inFlight.get(cacheKey);
      if (existing) {
        return existing as Promise<T>;
      }

      const promise = getOrFetch<T>(cacheKey, queryOpts);
      inFlight.set(cacheKey, promise);

      try {
        return await promise;
      } finally {
        inFlight.delete(cacheKey);
      }
    },

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
      if (await isEntryStale(entry)) {
        return null;
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
