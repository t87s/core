import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import Redis from 'ioredis';
import { T87s } from './client.js';
import { RedisAdapter } from './adapters/redis.js';
import { defineTags } from './tags.js';

describe('T87s with RedisAdapter', () => {
  let container: StartedTestContainer;
  let redis: Redis;
  let t87s: T87s;

  const tags = defineTags({
    user: (id: string) => ['user', id],
    userPosts: (id: string) => ['user', id, 'posts'],
  });

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();

    redis = new Redis({
      host: container.getHost(),
      port: container.getMappedPort(6379),
    });
  }, 60000);

  afterAll(async () => {
    await redis.quit();
    await container.stop();
  });

  beforeEach(async () => {
    const adapter = new RedisAdapter({ client: redis });
    await adapter.clear();
    t87s = new T87s({ adapter });
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

  it('should support exact invalidation', async () => {
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

    const updateUserExact = t87s.mutation(async (id: string) => {
      return { result: { success: true }, invalidates: [tags.user(id)], exact: true };
    });

    // Cache both
    await getUser('1');
    await getPosts('1');

    // Exact invalidation - should only invalidate user, not posts
    await updateUserExact('1');

    await getUser('1');
    await getPosts('1');
    expect(userCount).toBe(2);
    expect(postsCount).toBe(1); // Still cached!
  });
});
