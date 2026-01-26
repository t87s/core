import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import Redis from 'ioredis';
import { RedisAdapter } from './redis.js';
import type { CacheEntry } from '../types.js';

describe('RedisAdapter integration', () => {
  let container: StartedTestContainer;
  let redis: Redis;
  let adapter: RedisAdapter;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();

    redis = new Redis({
      host: container.getHost(),
      port: container.getMappedPort(6379),
    });

    adapter = new RedisAdapter({ client: redis, prefix: 'test' });
  }, 60000);

  afterAll(async () => {
    await redis.quit();
    await container.stop();
  });

  beforeEach(async () => {
    await adapter.clear();
  });

  it('should store and retrieve cache entry', async () => {
    const entry: CacheEntry<{ name: string }> = {
      value: { name: 'Alice' },
      tags: [['user', '1']],
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
      graceUntil: null,
    };

    await adapter.set('user:1', entry);
    const result = await adapter.get<{ name: string }>('user:1');

    expect(result).toEqual(entry);
  });

  it('should return null for missing key', async () => {
    const result = await adapter.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should delete cache entry', async () => {
    const entry: CacheEntry<string> = {
      value: 'test',
      tags: [],
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
      graceUntil: null,
    };

    await adapter.set('key', entry);
    await adapter.delete('key');
    const result = await adapter.get('key');

    expect(result).toBeNull();
  });

  it('should store and retrieve tag invalidation time', async () => {
    const timestamp = Date.now();

    await adapter.setTagInvalidationTime(['user', '1'], timestamp);
    const result = await adapter.getTagInvalidationTime(['user', '1']);

    expect(result).toBe(timestamp);
  });

  it('should return null for missing tag', async () => {
    const result = await adapter.getTagInvalidationTime(['nonexistent']);
    expect(result).toBeNull();
  });

  it('should clear all entries', async () => {
    const entry: CacheEntry<string> = {
      value: 'test',
      tags: [],
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
      graceUntil: null,
    };

    await adapter.set('key1', entry);
    await adapter.set('key2', entry);
    await adapter.setTagInvalidationTime(['tag'], Date.now());

    await adapter.clear();

    expect(await adapter.get('key1')).toBeNull();
    expect(await adapter.get('key2')).toBeNull();
    expect(await adapter.getTagInvalidationTime(['tag'])).toBeNull();
  });

  it('should respect TTL expiration', async () => {
    const entry: CacheEntry<string> = {
      value: 'test',
      tags: [],
      createdAt: Date.now(),
      expiresAt: Date.now() + 100, // 100ms TTL
      graceUntil: null,
    };

    await adapter.set('expiring', entry);

    // Should exist immediately
    expect(await adapter.get('expiring')).not.toBeNull();

    // Wait for expiration
    await new Promise((r) => setTimeout(r, 150));

    // Should be gone
    expect(await adapter.get('expiring')).toBeNull();
  });
});
