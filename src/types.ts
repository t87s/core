import type { Tag } from './tags.js';
import type { Duration } from './duration.js';

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
}

/**
 * Options for T87s client initialization.
 */
export interface T87sOptions {
  adapter: StorageAdapter;
  prefix?: string;
  defaultTtl?: Duration;
  defaultGrace?: Duration | false;
}

/**
 * Configuration returned from a query factory.
 */
export interface QueryConfig<T> {
  tags: Tag[];
  fn: () => Promise<T>;
  ttl?: Duration;
  grace?: Duration | false;
}

/**
 * Result returned from a mutation function.
 */
export interface MutationResult<T> {
  result: T;
  invalidates: Tag[];
  exact?: boolean;
}

/**
 * Callback to fetch fresh data for cache verification.
 * Called with the cache key and the cached value, should return fresh data.
 */
export type VerifyCallback<T = unknown> = (key: string, cachedValue: T) => Promise<T>;

// Re-export for convenience
export type { Tag } from './tags.js';
export type { Duration } from './duration.js';
