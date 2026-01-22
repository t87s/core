/**
 * Opaque type for tags. Created via defineTags() to ensure type safety.
 * The internal structure is a string array, but consumers can't construct it directly.
 */
declare const TAG_BRAND: unique symbol;
export type Tag = string[] & { readonly [TAG_BRAND]: true };

/**
 * A cached entry stored by adapters.
 */
export interface CacheEntry<T> {
  /** The cached value */
  value: T;
  /** Tags this entry depends on (for invalidation) */
  tags: string[][];
  /** When this entry was created (unix ms) */
  createdAt: number;
  /** When this entry expires (unix ms) */
  expiresAt: number;
  /** When the grace period ends (unix ms), or null if no grace */
  graceUntil: number | null;
}

/**
 * Options for T87s client initialization.
 */
export interface T87sOptions {
  /** The storage adapter to use */
  adapter: StorageAdapter;
  /** Optional prefix for all cache keys */
  prefix?: string;
  /** Default TTL for queries (default: '30s') */
  defaultTtl?: Duration;
  /** Default grace period for queries (default: false) */
  defaultGrace?: Duration | false;
}

/**
 * Duration can be a number (milliseconds) or a human-readable string.
 * Examples: 1000, '1s', '5m', '1h', '1d'
 */
export type Duration = number | string;

/**
 * Options returned from a query factory.
 */
export interface QueryConfig<T> {
  /** Tags this query depends on */
  tags: Tag[];
  /** The factory function to fetch the data */
  fn: () => Promise<T>;
  /** Time to live (default: '30s') */
  ttl?: Duration;
  /** Grace period - serve stale if factory fails (default: false) */
  grace?: Duration | false;
}

/**
 * Result returned from a mutation function.
 */
export interface MutationResult<T> {
  /** The result to return to the caller */
  result: T;
  /** Tags to invalidate */
  invalidates: Tag[];
  /** If true, only exact tag matches are invalidated (no prefix matching) */
  exact?: boolean;
}

/**
 * Storage adapter interface. Adapters handle the actual storage and retrieval.
 * The core library handles stampede protection and grace logic.
 */
export interface StorageAdapter {
  /**
   * Get a cached entry by key.
   * Returns null if not found or expired beyond grace period.
   */
  get<T>(key: string): Promise<CacheEntry<T> | null>;

  /**
   * Store a cached entry.
   */
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>;

  /**
   * Delete a cached entry by key.
   */
  delete(key: string): Promise<void>;

  /**
   * Get the invalidation timestamp for a tag.
   * Returns null if the tag has never been invalidated.
   */
  getTagInvalidationTime(tag: string[]): Promise<number | null>;

  /**
   * Set the invalidation timestamp for a tag.
   */
  setTagInvalidationTime(tag: string[], timestamp: number): Promise<void>;

  /**
   * Clear all cached entries (and optionally tag timestamps).
   */
  clear(): Promise<void>;

  /**
   * Disconnect and clean up resources.
   */
  disconnect(): Promise<void>;
}
