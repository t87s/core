import type { Redis } from '@upstash/redis';
import type { StorageAdapter, CacheEntry } from '../types.js';
import { serializeTag } from '../tags.js';

export interface UpstashAdapterOptions {
  client: Redis;
  prefix?: string;
}

/**
 * Upstash Redis storage adapter using @upstash/redis REST client.
 */
export class UpstashAdapter implements StorageAdapter {
  private client: Redis;
  private prefix: string;

  constructor(options: UpstashAdapterOptions) {
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
    const data = await this.client.get<CacheEntry<T>>(this.cacheKey(key));
    if (data === null) {
      return null;
    }
    // Upstash REST client returns parsed JSON directly
    return data;
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    const expireAt = entry.graceUntil ?? entry.expiresAt;
    // Upstash REST API uses object syntax for options
    await this.client.set(this.cacheKey(key), JSON.stringify(entry), {
      pxat: expireAt,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.cacheKey(key));
  }

  async getTagInvalidationTime(tag: string[]): Promise<number | null> {
    const data = await this.client.get<string>(this.tagKey(tag));
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
    let cursor: number | string = 0;

    do {
      // Upstash scan returns [cursor, keys]
      const [nextCursor, keys] = await this.client.scan(cursor, {
        match: pattern,
        count: 1000,
      }) as [number | string, string[]];
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== 0 && cursor !== '0');
  }

  async disconnect(): Promise<void> {
    // No-op: Upstash REST client doesn't maintain persistent connections
  }
}
