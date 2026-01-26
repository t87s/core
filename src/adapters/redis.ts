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
    const data = await this.client.get(this.cacheKey(key));
    if (data === null) {
      return null;
    }

    try {
      return JSON.parse(data) as CacheEntry<T>;
    } catch {
      // Invalid JSON - treat as cache miss
      return null;
    }
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    const expireAt = entry.graceUntil ?? entry.expiresAt;
    await this.client.set(this.cacheKey(key), JSON.stringify(entry), 'PXAT', expireAt);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.cacheKey(key));
  }

  async getTagInvalidationTime(tag: string[]): Promise<number | null> {
    const data = await this.client.get(this.tagKey(tag));
    if (data === null) {
      return null;
    }
    return parseInt(data, 10);
  }

  async setTagInvalidationTime(tag: string[], timestamp: number): Promise<void> {
    await this.client.set(this.tagKey(tag), timestamp.toString());
  }

  async clear(): Promise<void> {
    const pattern = `${this.prefix}:*`;
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  async disconnect(): Promise<void> {
    // No-op: user manages client lifecycle
  }
}
