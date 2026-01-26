import { bench, describe, beforeAll, afterAll } from 'vitest';
import { T87s, UpstashAdapter, CloudAdapter, defineTags } from '@t87s/core';
import { Redis } from '@upstash/redis';

// Environment variables
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const T87S_CLOUD_URL = process.env.T87S_CLOUD_URL || 'https://t87s-cloud.mike-solomon.workers.dev';
const T87S_API_KEY = process.env.T87S_API_KEY || 't87s_bench_test_key';

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  throw new Error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
}

// Shared tag definitions - identical for both adapters
const tags = defineTags({
  user: (id: string) => ['user', id],
});

let t87sUpstash: T87s;
let t87sCloud: T87s;
let getUserUpstash: (id: string) => Promise<{ id: string; name: string }>;
let getUserCloud: (id: string) => Promise<{ id: string; name: string }>;

beforeAll(async () => {
  const redis = new Redis({ url: UPSTASH_URL!, token: UPSTASH_TOKEN! });

  // Clear old benchmark data from Upstash
  const keys = await redis.keys('bench:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }

  // t87s with UpstashAdapter - direct to Upstash
  const upstashAdapter = new UpstashAdapter({
    client: redis,
    prefix: 'bench:upstash',
  });
  t87sUpstash = new T87s({ adapter: upstashAdapter, prefix: 'bench:upstash' });

  // t87s with CloudAdapter - through t87s Cloud (Cloudflare)
  const cloudAdapter = new CloudAdapter({
    baseUrl: T87S_CLOUD_URL,
    apiKey: T87S_API_KEY,
  });
  t87sCloud = new T87s({ adapter: cloudAdapter, prefix: 'bench:cloud' });

  // Identical query definitions - only adapter differs
  getUserUpstash = t87sUpstash.query(function getUser(id: string) {
    return {
      tags: [tags.user(id)],
      fn: async () => ({ id, name: 'Test User' }),
    };
  });

  getUserCloud = t87sCloud.query(function getUser(id: string) {
    return {
      tags: [tags.user(id)],
      fn: async () => ({ id, name: 'Test User' }),
    };
  });

  // Warm up both caches
  await getUserUpstash('warmup');
  await getUserCloud('warmup');
});

afterAll(async () => {
  await t87sUpstash.clear();
  await t87sCloud.disconnect();
});

// ============================================
// Cache Hit: Value already in remote cache
// Same t87s code, only adapter differs
// ============================================

describe('Cache Hit (same t87s query, different adapter)', () => {
  bench('t87s + UpstashAdapter', async () => {
    await getUserUpstash('warmup');
  });

  bench('t87s + CloudAdapter', async () => {
    await getUserCloud('warmup');
  });
});

// ============================================
// Cache Miss: Must fetch + store
// Same t87s code, only adapter differs
// ============================================

describe('Cache Miss (same t87s query, different adapter)', () => {
  let upstashCounter = 0;
  let cloudCounter = 0;

  bench('t87s + UpstashAdapter', async () => {
    await getUserUpstash(`miss-${upstashCounter++}`);
  });

  bench('t87s + CloudAdapter', async () => {
    await getUserCloud(`miss-${cloudCounter++}`);
  });
});
