/**
 * A cached entry stored by adapters.
 */
export interface CacheEntry<T> {
  value: T;
  tags: string[][];
  createdAt: number;
  expiresAt: number;
  graceUntil: number | null;
}

/**
 * Result from a query with cache metadata.
 */
export interface EntriesResult<T> {
  /** The cache entry before this query (null if cache miss) */
  before: CacheEntry<T> | null;
  /** The cache entry after this query (always present) */
  after: CacheEntry<T>;
}

/**
 * Storage adapter interface.
 */
export interface StorageAdapter {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>;
  delete(key: string): Promise<void>;
  getTagInvalidationTime(tag: string[]): Promise<number | null>;
  setTagInvalidationTime(tag: string[], timestamp: number): Promise<void>;
  clear(): Promise<void>;
  disconnect(): Promise<void>;
  /** Report verification result (staleness detection). Only implemented by CloudAdapter. */
  reportVerification?(
    key: string,
    isStale: boolean,
    cachedHash: string,
    freshHash: string
  ): Promise<void>;
}

// Re-export for convenience
export type { Duration } from './duration.js';
