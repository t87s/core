import type { StorageAdapter, CacheEntry } from '../types.js';
import { serializeTag } from '../tags.js';

export interface MemoryAdapterOptions {
  maxItems?: number;
}

/**
 * In-memory storage adapter with LRU eviction.
 */
export class MemoryAdapter implements StorageAdapter {
  private cache = new Map<string, CacheEntry<unknown>>();
  private tagInvalidations = new Map<string, number>();
  private lruOrder: string[] = [];
  private maxItems: number;

  constructor(options: MemoryAdapterOptions = {}) {
    this.maxItems = options.maxItems ?? Infinity;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Update LRU order
    this.touchLru(key);

    return entry as CacheEntry<T>;
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    // Evict if needed
    while (this.cache.size >= this.maxItems && !this.cache.has(key)) {
      const oldest = this.lruOrder.shift();
      if (oldest) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, entry);
    this.touchLru(key);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    this.lruOrder = this.lruOrder.filter((k) => k !== key);
  }

  async getTagInvalidationTime(tag: string[]): Promise<number | null> {
    const key = serializeTag(tag);
    return this.tagInvalidations.get(key) ?? null;
  }

  async setTagInvalidationTime(tag: string[], timestamp: number): Promise<void> {
    const key = serializeTag(tag);
    this.tagInvalidations.set(key, timestamp);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.tagInvalidations.clear();
    this.lruOrder = [];
  }

  async disconnect(): Promise<void> {
    await this.clear();
  }

  private touchLru(key: string): void {
    this.lruOrder = this.lruOrder.filter((k) => k !== key);
    this.lruOrder.push(key);
  }
}
