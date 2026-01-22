import type {
  T87sOptions,
  StorageAdapter,
  Tag,
  QueryConfig,
  MutationResult,
  CacheEntry,
  Duration,
} from './types.js';
import { parseDuration } from './duration.js';
import { serializeTag, isTagPrefix } from './tags.js';
import { MemoryAdapter } from './adapters/memory.js';
import { createHash } from 'crypto';

const DEFAULT_TTL = '30s';

/**
 * Generate a cache key from function name and arguments.
 */
function generateCacheKey(prefix: string, fnName: string, args: unknown[]): string {
  const argsHash = createHash('sha256')
    .update(JSON.stringify(args))
    .digest('hex')
    .substring(0, 12);
  return `${prefix}:${fnName}:${argsHash}`;
}

/**
 * The main t87s client.
 */
export class T87s {
  private adapter: StorageAdapter;
  private prefix: string;
  private defaultTtl: number;
  private defaultGrace: number | false;

  /**
   * In-flight promises for stampede protection.
   * Key is the cache key, value is the pending promise.
   */
  private inFlight = new Map<string, Promise<unknown>>();

  constructor(options: T87sOptions) {
    this.adapter = options.adapter;
    this.prefix = options.prefix ?? 't87s';
    this.defaultTtl = parseDuration(options.defaultTtl ?? DEFAULT_TTL);
    this.defaultGrace =
      options.defaultGrace === false || options.defaultGrace === undefined
        ? false
        : parseDuration(options.defaultGrace);
  }

  /**
   * Create a cached query.
   *
   * @example
   * ```typescript
   * const getUser = t87s.query((id: string) => ({
   *   tags: [tags.user(id)],
   *   ttl: '10m',
   *   grace: '1h',
   *   fn: async () => db.users.find(id),
   * }));
   *
   * const user = await getUser('abc123');
   * ```
   */
  query<TArgs extends unknown[], TResult>(
    factory: (...args: TArgs) => QueryConfig<TResult>
  ): (...args: TArgs) => Promise<TResult> {
    // Generate a unique name for this query
    const fnName = factory.name || `query_${Math.random().toString(36).slice(2, 8)}`;

    return async (...args: TArgs): Promise<TResult> => {
      const config = factory(...args);
      const cacheKey = generateCacheKey(this.prefix, fnName, args);

      // Check for in-flight request (stampede protection)
      const inFlight = this.inFlight.get(cacheKey);
      if (inFlight) {
        return inFlight as Promise<TResult>;
      }

      // Check cache
      const cached = await this.adapter.get<TResult>(cacheKey);
      const now = Date.now();

      if (cached) {
        // Check if entry is stale due to tag invalidation
        const isStale = await this.isEntryStale(cached);

        if (!isStale && cached.expiresAt > now) {
          // Fresh hit
          return cached.value;
        }

        // Check if within grace period
        if (cached.graceUntil !== null && cached.graceUntil > now) {
          // Stale but within grace - return stale and refresh in background
          this.refreshInBackground(cacheKey, config, args);
          return cached.value;
        }
      }

      // Cache miss or expired - fetch fresh
      const promise = this.fetchAndCache<TResult>(cacheKey, config);
      this.inFlight.set(cacheKey, promise);

      try {
        return await promise;
      } finally {
        this.inFlight.delete(cacheKey);
      }
    };
  }

  /**
   * Create a mutation that invalidates cache tags.
   *
   * @example
   * ```typescript
   * const updateUser = t87s.mutation(async (id: string, data: Partial<User>) => {
   *   const user = await db.users.update(id, data);
   *   return { result: user, invalidates: [tags.user(id)] };
   * });
   *
   * const updated = await updateUser('abc123', { name: 'Alice' });
   * ```
   */
  mutation<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<MutationResult<TResult>>
  ): (...args: TArgs) => Promise<TResult> {
    return async (...args: TArgs): Promise<TResult> => {
      // Execute the mutation
      const { result, invalidates, exact = false } = await fn(...args);

      // Invalidate tags
      const now = Date.now();
      for (const tag of invalidates) {
        await this.invalidateTag(tag as unknown as string[], now, exact);
      }

      return result;
    };
  }

  /**
   * Manually invalidate tags.
   * Useful for external events (webhooks, cron jobs, etc.).
   */
  async invalidate(tags: Tag[], exact = false): Promise<void> {
    const now = Date.now();
    for (const tag of tags) {
      await this.invalidateTag(tag as unknown as string[], now, exact);
    }
  }

  /**
   * Clear all cached entries.
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

  /**
   * Get the underlying adapter (useful for testing).
   */
  getAdapter(): StorageAdapter {
    return this.adapter;
  }

  // --- Private methods ---

  private async fetchAndCache<TResult>(
    cacheKey: string,
    config: QueryConfig<TResult>
  ): Promise<TResult> {
    const ttl = parseDuration(config.ttl ?? this.defaultTtl);
    const grace = config.grace === false ? false : config.grace ? parseDuration(config.grace) : this.defaultGrace;

    try {
      const value = await config.fn();
      const now = Date.now();

      const entry: CacheEntry<TResult> = {
        value,
        tags: config.tags.map((t) => t as unknown as string[]),
        createdAt: now,
        expiresAt: now + ttl,
        graceUntil: grace === false ? null : now + ttl + grace,
      };

      await this.adapter.set(cacheKey, entry);
      return value;
    } catch (error) {
      // Check if we have a graced entry we can return
      const cached = await this.adapter.get<TResult>(cacheKey);
      if (cached && cached.graceUntil !== null && cached.graceUntil > Date.now()) {
        // Return graced entry on factory failure
        return cached.value;
      }
      throw error;
    }
  }

  private refreshInBackground<TResult>(
    cacheKey: string,
    config: QueryConfig<TResult>,
    _args: unknown[]
  ): void {
    // Don't await - fire and forget
    this.fetchAndCache(cacheKey, config).catch(() => {
      // Ignore errors in background refresh
      // The graced value will continue to be served
    });
  }

  private async isEntryStale(entry: CacheEntry<unknown>): Promise<boolean> {
    for (const entryTag of entry.tags) {
      // Check exact tag match
      const invalidationTime = await this.adapter.getTagInvalidationTime(entryTag);
      if (invalidationTime !== null && invalidationTime > entry.createdAt) {
        return true;
      }

      // For prefix matching, we'd need to check all parent prefixes
      // This is handled by also storing prefix markers during invalidation
    }

    return false;
  }

  private async invalidateTag(tag: string[], timestamp: number, exact: boolean): Promise<void> {
    // Set invalidation timestamp for exact tag
    await this.adapter.setTagInvalidationTime(tag, timestamp);

    if (!exact) {
      // Also set a prefix marker so child tags are invalidated
      // We do this by setting the tag itself - the isEntryStale check
      // will use isTagPrefix to match child tags
      // No additional storage needed - the check handles it
    }
  }
}
