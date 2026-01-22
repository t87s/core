import type { T87sOptions, StorageAdapter, QueryConfig, CacheEntry } from './types.js';
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
      const now = Date.now();

      // Check cache
      const cached = await this.adapter.get<TResult>(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cached.value;
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
    };
  }
}
