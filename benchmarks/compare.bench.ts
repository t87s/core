import { bench, describe, beforeAll, afterAll } from 'vitest';
import { T87s, CloudAdapter, defineTags } from '@t87s/core';
import { Redis } from '@upstash/redis';

// Environment variables
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const T87S_CLOUD_URL = process.env.T87S_CLOUD_URL || 'https://t87s-cloud.mike-solomon.workers.dev';
const T87S_API_KEY = process.env.T87S_API_KEY || 't87s_bench_test_key';

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  throw new Error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
}

const tags = defineTags({
  user: (id: string) => ['user', id],
});

let redis: Redis;
let t87sCloud: T87s;
let getUserCloud: (id: string) => Promise<{ id: string; name: string }>;

beforeAll(async () => {
  // Raw Upstash client
  redis = new Redis({ url: UPSTASH_URL!, token: UPSTASH_TOKEN! });

  // Clear old benchmark data
  const keys = await redis.keys('bench:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }

  // Seed Upstash with test data for "cache hit" comparison
  await redis.set('bench:upstash:user:warmup', { id: 'warmup', name: 'Test User' });

  // t87s with CloudAdapter
  const cloudAdapter = new CloudAdapter({
    baseUrl: T87S_CLOUD_URL,
    apiKey: T87S_API_KEY,
  });
  t87sCloud = new T87s({ adapter: cloudAdapter, prefix: 'bench:cloud' });
  getUserCloud = t87sCloud.query((id: string) => ({
    tags: [tags.user(id)],
    fn: async () => ({ id, name: 'Test User' }), // Simulates DB call
  }));

  // Warm up cloud cache
  await getUserCloud('warmup');
});

afterAll(async () => {
  const keys = await redis.keys('bench:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  await t87sCloud.disconnect();
});

// ============================================
// Cache Hit: Value already in remote cache
// ============================================

describe('Cache Hit (value already in remote cache)', () => {
  bench('Raw Upstash GET', async () => {
    await redis.get('bench:upstash:user:warmup');
  });

  bench('t87s CloudAdapter', async () => {
    await getUserCloud('warmup');
  });
});

// ============================================
// Cache Miss: Must fetch + store
// ============================================

describe('Cache Miss (fetch + store in remote)', () => {
  let upstashCounter = 0;
  let cloudCounter = 0;

  bench('Raw Upstash SET', async () => {
    await redis.set(`bench:upstash:miss:${upstashCounter++}`, { id: 'test', name: 'Test' });
  });

  bench('t87s CloudAdapter', async () => {
    await getUserCloud(`miss-${cloudCounter++}`);
  });
});
