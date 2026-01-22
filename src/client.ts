import type { T87sOptions, StorageAdapter, QueryConfig, MutationResult, CacheEntry } from './types.js';
import { parseDuration } from './duration.js';

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

function generateCacheKey(prefix: string, fnName: string, args: unknown[]): string {
  const argsHash = simpleHash(JSON.stringify(args));
  return `${prefix}:${fnName}:${argsHash}`;
}

export class T87s {
  private adapter: StorageAdapter;
  private prefix: string;
  private defaultTtl: number;
  private defaultGrace: number | false;
  private queryCounter = 0;
  private inFlight = new Map<string, Promise<unknown>>();

  constructor(options: T87sOptions) {
    this.adapter = options.adapter;
    this.prefix = options.prefix ?? 't87s';
    this.defaultTtl = parseDuration(options.defaultTtl ?? DEFAULT_TTL);
    this.defaultGrace = options.defaultGrace === undefined || options.defaultGrace === false
      ? false
      : parseDuration(options.defaultGrace);
  }

  query<TArgs extends unknown[], TResult>(
    factory: (...args: TArgs) => QueryConfig<TResult>
  ): (...args: TArgs) => Promise<TResult> {
    const fnName = factory.name || `query_${++this.queryCounter}`;

    return async (...args: TArgs): Promise<TResult> => {
      const config = factory(...args);
      const cacheKey = generateCacheKey(this.prefix, fnName, args);

      // Check for in-flight request (stampede protection)
      const inFlight = this.inFlight.get(cacheKey);
      if (inFlight) {
        return inFlight as Promise<TResult>;
      }

      // Create promise that checks cache then fetches if needed
      const promise = this.getOrFetch<TResult>(cacheKey, config);
      this.inFlight.set(cacheKey, promise);

      try {
        return await promise;
      } finally {
        this.inFlight.delete(cacheKey);
      }
    };
  }

  mutation<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<MutationResult<TResult>>
  ): (...args: TArgs) => Promise<TResult> {
    return async (...args: TArgs): Promise<TResult> => {
      const { result, invalidates, exact = false } = await fn(...args);
      const now = Date.now();

      for (const tag of invalidates) {
        await this.invalidateTag(tag as unknown as string[], now, exact);
      }

      return result;
    };
  }

  private async invalidateTag(tag: string[], timestamp: number, exact: boolean): Promise<void> {
    if (exact) {
      // For exact mode, add a suffix that won't match prefixes
      const exactTag = [...tag, '__exact__'];
      await this.adapter.setTagInvalidationTime(exactTag, timestamp);
    } else {
      await this.adapter.setTagInvalidationTime(tag, timestamp);
    }
  }

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

  private async getOrFetch<TResult>(
    cacheKey: string,
    config: QueryConfig<TResult>
  ): Promise<TResult> {
    const now = Date.now();

    // Check cache
    const cached = await this.adapter.get<TResult>(cacheKey);
    if (cached && cached.expiresAt > now) {
      const isStale = await this.isEntryStale(cached);
      if (!isStale) {
        return cached.value;
      }
    }

    // Fetch and cache
    const ttl = parseDuration(config.ttl ?? this.defaultTtl);
    const value = await config.fn();

    const entry: CacheEntry<TResult> = {
      value,
      tags: config.tags.map((t) => t as unknown as string[]),
      createdAt: now,
      expiresAt: now + ttl,
      graceUntil: null,
    };

    await this.adapter.set(cacheKey, entry);
    return value;
  }
}
