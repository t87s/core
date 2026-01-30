import type { StorageAdapter, CacheEntry } from './types.js';
import { parseDuration, type Duration } from './duration.js';

export interface CacheEngineOptions {
  adapter: StorageAdapter;
  prefix?: string;
  defaultTtl?: Duration;
  defaultGrace?: Duration | false;
  verifyPercent?: number;
}

export interface QueryOptions<T> {
  key: string;
  tags: string[][];
  fn: () => Promise<T>;
  ttl?: Duration;
  grace?: Duration | false;
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
 * CacheEngine is the core caching logic extracted from T87s.
 * It handles all caching operations: stampede protection, TTL, grace/SWR,
 * hierarchical tag invalidation, verification sampling, and error handling.
 */
export class CacheEngine {
  private adapter: StorageAdapter;
  private prefix: string;
  private defaultTtl: number;
  private defaultGrace: number | false;
  private verifyPercent: number;
  private inFlight = new Map<string, Promise<unknown>>();

  constructor(options: CacheEngineOptions) {
    this.adapter = options.adapter;
    this.prefix = options.prefix ?? 't87s';
    this.defaultTtl = parseDuration(options.defaultTtl ?? DEFAULT_TTL);
    this.defaultGrace =
      options.defaultGrace === undefined || options.defaultGrace === false
        ? false
        : parseDuration(options.defaultGrace);
    this.verifyPercent = options.verifyPercent ?? 0.1;
    if (this.verifyPercent < 0 || this.verifyPercent > 1) {
      throw new Error('verifyPercent must be between 0 and 1');
    }
  }

  /**
   * Execute a cached query.
   * Handles stampede protection, TTL, grace periods, and tag-based invalidation.
   */
  async query<T>(options: QueryOptions<T>): Promise<T> {
    const cacheKey = `${this.prefix}:${options.key}`;

    // Stampede protection - check for in-flight request
    const inFlight = this.inFlight.get(cacheKey);
    if (inFlight) {
      return inFlight as Promise<T>;
    }

    const promise = this.getOrFetch<T>(cacheKey, options);
    this.inFlight.set(cacheKey, promise);

    try {
      return await promise;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  /**
   * Invalidate cache entries by tags.
   * @param tags - Array of tag arrays to invalidate
   * @param exact - If true, only invalidates exact tag matches (not hierarchical)
   */
  async invalidate(tags: string[][], exact = false): Promise<void> {
    const now = Date.now();
    for (const tag of tags) {
      if (exact) {
        // For exact mode, add a suffix that won't match prefixes
        const exactTag = [...tag, '__exact__'];
        await this.adapter.setTagInvalidationTime(exactTag, now);
      } else {
        await this.adapter.setTagInvalidationTime(tag, now);
      }
    }
  }

  /**
   * Clear all cached data.
   */
  async clear(): Promise<void> {
    await this.adapter.clear();
  }

  /**
   * Disconnect the adapter.
   */
  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
  }

  // =========================================================================
  // Private methods (ported from T87s)
  // =========================================================================

  /**
   * Check if a cache entry is stale based on tag invalidation times.
   * Supports hierarchical tag invalidation.
   */
  private async isEntryStale(entry: CacheEntry<unknown>): Promise<boolean> {
    for (const entryTag of entry.tags) {
      // Check exact invalidation (with marker)
      const exactTag = [...entryTag, '__exact__'];
      const exactInvalidation = await this.adapter.getTagInvalidationTime(exactTag);
      if (exactInvalidation !== null && exactInvalidation >= entry.createdAt) {
        return true;
      }

      // Check prefix invalidations (all possible parent prefixes)
      for (let len = 1; len <= entryTag.length; len++) {
        const prefix = entryTag.slice(0, len);
        const invalidation = await this.adapter.getTagInvalidationTime(prefix);
        if (invalidation !== null && invalidation >= entry.createdAt) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Determine if we should verify this cache hit.
   * Only verifies if adapter supports reporting (CloudAdapter).
   */
  private shouldVerify(): boolean {
    if (!this.adapter.reportVerification) return false;
    if (this.verifyPercent <= 0) return false;
    if (this.verifyPercent >= 1) return true;
    return Math.random() < this.verifyPercent;
  }

  /**
   * Run verification in background - compares cached value to fresh value.
   */
  private async runVerification<T>(
    cacheKey: string,
    fn: () => Promise<T>,
    cachedValue: T
  ): Promise<void> {
    try {
      const freshValue = await fn();
      const cachedHash = simpleHash(JSON.stringify(cachedValue));
      const freshHash = simpleHash(JSON.stringify(freshValue));
      const isStale = cachedHash !== freshHash;
      await this.adapter.reportVerification!(cacheKey, isStale, cachedHash, freshHash);
    } catch {
      // Silently ignore verification errors
    }
  }

  /**
   * Get value from cache or fetch if not available/stale.
   */
  private async getOrFetch<T>(cacheKey: string, options: QueryOptions<T>): Promise<T> {
    const now = Date.now();

    // Check cache
    const cached = await this.adapter.get<T>(cacheKey);
    if (cached) {
      const isStale = await this.isEntryStale(cached);

      if (!isStale && cached.expiresAt > now) {
        // Fresh hit - potentially verify in background
        if (this.shouldVerify()) {
          this.runVerification(cacheKey, options.fn, cached.value).catch(() => {});
        }
        return cached.value;
      }

      // Check grace period (SWR)
      if (cached.graceUntil !== null && cached.graceUntil > now) {
        // Stale but within grace - return stale, refresh in background
        this.refreshInBackground(cacheKey, options);
        return cached.value;
      }
    }

    // Outside grace or no cache - fetch synchronously
    return await this.fetchAndCache(cacheKey, options, cached ?? undefined);
  }

  /**
   * Fetch fresh data and cache it.
   * If fetch fails and we have a graced entry, return the stale value.
   */
  private async fetchAndCache<T>(
    cacheKey: string,
    options: QueryOptions<T>,
    staleEntry?: CacheEntry<T>
  ): Promise<T> {
    const ttl = parseDuration(options.ttl ?? this.defaultTtl);
    const grace =
      options.grace === false || options.grace === undefined
        ? this.defaultGrace
        : parseDuration(options.grace);
    const now = Date.now();

    try {
      const value = await options.fn();

      const entry: CacheEntry<T> = {
        value,
        tags: options.tags,
        createdAt: now,
        expiresAt: now + ttl,
        graceUntil: grace === false ? null : now + ttl + grace,
      };

      await this.adapter.set(cacheKey, entry);
      return value;
    } catch (error) {
      // Error handling with grace - return stale if available
      if (staleEntry && staleEntry.graceUntil !== null && staleEntry.graceUntil > now) {
        return staleEntry.value;
      }
      throw error;
    }
  }

  /**
   * Refresh cache in background (SWR pattern).
   */
  private refreshInBackground<T>(cacheKey: string, options: QueryOptions<T>): void {
    this.fetchAndCache(cacheKey, options).catch(() => {
      // Ignore errors - graced value continues to be served
    });
  }
}
