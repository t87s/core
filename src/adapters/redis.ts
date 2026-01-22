import type { Redis } from 'ioredis';
import type { StorageAdapter, CacheEntry } from '../types.js';
import { serializeTag } from '../tags.js';

export interface RedisAdapterOptions {
  client: Redis;
  prefix?: string;
}

/**
 * Redis storage adapter using ioredis.
 */
export class RedisAdapter implements StorageAdapter {
  private client: Redis;
  private prefix: string;

  constructor(options: RedisAdapterOptions) {
    this.client = options.client;
    this.prefix = options.prefix ?? 't87s';
  }

  private cacheKey(key: string): string {
    return `${this.prefix}:c:${key}`;
  }

  private tagKey(tag: string[]): string {
    return `${this.prefix}:t:${serializeTag(tag)}`;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    throw new Error('Not implemented');
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    throw new Error('Not implemented');
  }

  async delete(key: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async getTagInvalidationTime(tag: string[]): Promise<number | null> {
    throw new Error('Not implemented');
  }

  async setTagInvalidationTime(tag: string[], timestamp: number): Promise<void> {
    throw new Error('Not implemented');
  }

  async clear(): Promise<void> {
    throw new Error('Not implemented');
  }

  async disconnect(): Promise<void> {
    // No-op: user manages client lifecycle
  }
}
