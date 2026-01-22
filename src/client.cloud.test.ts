import { describe, it, expect, beforeEach } from 'vitest';
import { T87s } from './client.js';
import { CloudAdapter } from './adapters/cloud.js';
import { defineTags } from './tags.js';

// Skip if no API key provided
const API_KEY = process.env.T87S_API_KEY ?? 't87s_dev_test_key_12345';
const BASE_URL = process.env.T87S_BASE_URL ?? 'https://t87s-cloud.mike-solomon.workers.dev';

describe('T87s with CloudAdapter (E2E)', () => {
  let t87s: T87s;
  let testPrefix: string;

  const tags = defineTags({
    user: (id: string) => ['user', id],
    userPosts: (id: string) => ['user', id, 'posts'],
  });

  beforeEach(async () => {
    // Use unique prefix per test run to avoid cache collision
    testPrefix = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const adapter = new CloudAdapter({ apiKey: API_KEY, baseUrl: BASE_URL });
    await adapter.clear();
    t87s = new T87s({ adapter, prefix: testPrefix });
  });

  it('should cache query results', async () => {
    let callCount = 0;

    const getUser = t87s.query((id: string) => ({
      tags: [tags.user(id)],
      fn: async () => {
        callCount++;
        return { id, name: 'Alice' };
      },
    }));

    const result1 = await getUser('1');
    expect(result1).toEqual({ id: '1', name: 'Alice' });
    expect(callCount).toBe(1);

    const result2 = await getUser('1');
    expect(result2).toEqual({ id: '1', name: 'Alice' });
    expect(callCount).toBe(1); // Cached
  });

  it('should invalidate by tag', async () => {
    let callCount = 0;

    const getUser = t87s.query((id: string) => ({
      tags: [tags.user(id)],
      fn: async () => {
        callCount++;
        return { id, count: callCount };
      },
    }));

    const updateUser = t87s.mutation(async (id: string) => {
      return { result: { success: true }, invalidates: [tags.user(id)] };
    });

    await getUser('1');
    expect(callCount).toBe(1);

    await updateUser('1');
    await getUser('1');
    expect(callCount).toBe(2);
  });

  it('should support prefix-matching invalidation', async () => {
    let userCount = 0;
    let postsCount = 0;

    const getUser = t87s.query((id: string) => ({
      tags: [tags.user(id)],
      fn: async () => ({ id, count: ++userCount }),
    }));

    const getPosts = t87s.query((id: string) => ({
      tags: [tags.userPosts(id)],
      fn: async () => ({ posts: [], count: ++postsCount }),
    }));

    const updateUser = t87s.mutation(async (id: string) => {
      return { result: { success: true }, invalidates: [tags.user(id)] };
    });

    // Cache both
    await getUser('1');
    await getPosts('1');
    expect(userCount).toBe(1);
    expect(postsCount).toBe(1);

    // Invalidate parent tag - should invalidate both
    await updateUser('1');

    await getUser('1');
    await getPosts('1');
    expect(userCount).toBe(2);
    expect(postsCount).toBe(2);
  });
});
