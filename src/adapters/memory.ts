import type { CacheEntry, StorageAdapter } from '../types.js';
import { serializeTag, isTagPrefix, deserializeTag } from '../tags.js';

export interface MemoryAdapterOptions {
  /** Maximum size in bytes (approximate). Uses LRU eviction when exceeded. */
  maxSize?: number | string;
  /** Maximum number of items. Uses LRU eviction when exceeded. */
  maxItems?: number;
}

interface StoredEntry<T> {
  entry: CacheEntry<T>;
  size: number;
  lastAccess: number;
}

/**
 * In-memory cache adapter for local development.
 * Fast, single-process, no persistence.
 */
export class MemoryAdapter implements StorageAdapter {
  private cache = new Map<string, StoredEntry<unknown>>();
  private tagInvalidations = new Map<string, number>();
  private currentSize = 0;
  private maxSize: number;
  private maxItems: number;

  constructor(options: MemoryAdapterOptions = {}) {
    this.maxSize = this.parseSize(options.maxSize ?? Infinity);
    this.maxItems = options.maxItems ?? Infinity;
  }

  private parseSize(size: number | string): number {
    if (typeof size === 'number') return size;

    const match = size.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i);
    if (!match) {
      throw new Error(`Invalid size format: "${size}". Expected number or string like "100mb".`);
    }

    const value = parseFloat(match[1]!);
    const unit = match[2]!.toLowerCase();

    const multipliers: Record<string, number> = {
      b: 1,
      kb: 1024,
      mb: 1024 * 1024,
      gb: 1024 * 1024 * 1024,
    };

    return Math.floor(value * multipliers[unit]!);
  }

  private estimateSize(value: unknown): number {
    // Rough estimate of JSON size
    return JSON.stringify(value).length * 2; // *2 for UTF-16
  }

  private evictIfNeeded(): void {
    // Evict oldest entries until under limits
    while (this.cache.size > this.maxItems || this.currentSize > this.maxSize) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, stored] of this.cache) {
        if (stored.lastAccess < oldestTime) {
          oldestTime = stored.lastAccess;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        const stored = this.cache.get(oldestKey);
        if (stored) {
          this.currentSize -= stored.size;
          this.cache.delete(oldestKey);
        }
      } else {
        break;
      }
    }
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const stored = this.cache.get(key) as StoredEntry<T> | undefined;
    if (!stored) return null;

    const now = Date.now();

    // Check if expired beyond grace period
    if (stored.entry.graceUntil !== null && now > stored.entry.graceUntil) {
      this.cache.delete(key);
      this.currentSize -= stored.size;
      return null;
    }

    if (stored.entry.expiresAt < now && stored.entry.graceUntil === null) {
      this.cache.delete(key);
      this.currentSize -= stored.size;
      return null;
    }

    // Update last access time for LRU
    stored.lastAccess = now;

    return stored.entry;
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    const size = this.estimateSize(entry);

    // Remove old entry if exists
    const existing = this.cache.get(key);
    if (existing) {
      this.currentSize -= existing.size;
    }

    // Store new entry
    this.cache.set(key, {
      entry: entry as CacheEntry<unknown>,
      size,
      lastAccess: Date.now(),
    });
    this.currentSize += size;

    // Evict if over limits
    this.evictIfNeeded();
  }

  async delete(key: string): Promise<void> {
    const stored = this.cache.get(key);
    if (stored) {
      this.currentSize -= stored.size;
      this.cache.delete(key);
    }
  }

  async getTagInvalidationTime(tag: string[]): Promise<number | null> {
    const key = serializeTag(tag);
    return this.tagInvalidations.get(key) ?? null;
  }

  async setTagInvalidationTime(tag: string[], timestamp: number): Promise<void> {
    const key = serializeTag(tag);
    this.tagInvalidations.set(key, timestamp);
  }

  /**
   * Check if an entry is stale based on tag invalidation times.
   * An entry is stale if any of its tags were invalidated after it was created.
   * Also checks prefix matches.
   */
  async isEntryStale(entry: CacheEntry<unknown>): Promise<boolean> {
    for (const entryTag of entry.tags) {
      // Check exact tag match
      const invalidationTime = await this.getTagInvalidationTime(entryTag);
      if (invalidationTime !== null && invalidationTime > entry.createdAt) {
        return true;
      }

      // Check prefix matches (any parent tag that was invalidated)
      for (const [tagKey, time] of this.tagInvalidations) {
        const tag = deserializeTag(tagKey);
        if (isTagPrefix(tag, entryTag) && time > entry.createdAt) {
          return true;
        }
      }
    }

    return false;
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.tagInvalidations.clear();
    this.currentSize = 0;
  }

  async disconnect(): Promise<void> {
    // No-op for memory adapter
    this.cache.clear();
    this.tagInvalidations.clear();
    this.currentSize = 0;
  }

  /**
   * Get stats about the cache (useful for debugging).
   */
  getStats(): { items: number; size: number; maxSize: number; maxItems: number } {
    return {
      items: this.cache.size,
      size: this.currentSize,
      maxSize: this.maxSize,
      maxItems: this.maxItems,
    };
  }
}
