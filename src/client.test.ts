import { describe, it, expect, beforeEach } from 'vitest';
import { T87s, MemoryAdapter, defineTags } from './index.js';

describe('T87s', () => {
  let t87s: T87s;

  const tags = defineTags({
    user: (id: string) => ['user', id],
    userPosts: (id: string) => ['user', id, 'posts'],
    team: (id: string) => ['team', id],
  });

  beforeEach(() => {
    t87s = new T87s({ adapter: new MemoryAdapter() });
  });

  describe('query', () => {
    it('should cache the result of a query', async () => {
      let callCount = 0;

      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        fn: async () => {
          callCount++;
          return { id, name: 'Alice' };
        },
      }));

      // First call - should execute factory
      const result1 = await getUser('123');
      expect(result1).toEqual({ id: '123', name: 'Alice' });
      expect(callCount).toBe(1);

      // Second call - should return cached
      const result2 = await getUser('123');
      expect(result2).toEqual({ id: '123', name: 'Alice' });
      expect(callCount).toBe(1); // Still 1, no new call

      // Different args - should execute factory
      const result3 = await getUser('456');
      expect(result3).toEqual({ id: '456', name: 'Alice' });
      expect(callCount).toBe(2);
    });

    it('should handle stampede protection', async () => {
      let callCount = 0;

      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        fn: async () => {
          callCount++;
          await new Promise((r) => setTimeout(r, 50)); // Simulate slow fetch
          return { id, name: 'Alice' };
        },
      }));

      // Fire 10 concurrent requests for the same key
      const promises = Array.from({ length: 10 }, () => getUser('123'));
      const results = await Promise.all(promises);

      // All should return the same result
      for (const result of results) {
        expect(result).toEqual({ id: '123', name: 'Alice' });
      }

      // But only one factory call should have been made
      expect(callCount).toBe(1);
    });
  });

  describe('mutation', () => {
    it('should invalidate tags after mutation', async () => {
      let callCount = 0;

      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        fn: async () => {
          callCount++;
          return { id, name: `User ${callCount}` };
        },
      }));

      const updateUser = t87s.mutation(async (id: string, name: string) => {
        return { result: { id, name }, invalidates: [tags.user(id)] };
      });

      // First call - should execute factory
      const result1 = await getUser('123');
      expect(result1.name).toBe('User 1');
      expect(callCount).toBe(1);

      // Second call - should return cached
      const result2 = await getUser('123');
      expect(result2.name).toBe('User 1');
      expect(callCount).toBe(1);

      // Mutate - should invalidate
      await updateUser('123', 'Alice');

      // Third call - should execute factory again (cache invalidated)
      const result3 = await getUser('123');
      expect(result3.name).toBe('User 2');
      expect(callCount).toBe(2);
    });

    it('should invalidate child tags with prefix matching', async () => {
      let userCallCount = 0;
      let postsCallCount = 0;

      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        fn: async () => {
          userCallCount++;
          return { id, name: 'Alice' };
        },
      }));

      const getUserPosts = t87s.query((id: string) => ({
        tags: [tags.userPosts(id)],
        fn: async () => {
          postsCallCount++;
          return [{ id: '1', title: 'Post 1' }];
        },
      }));

      const updateUser = t87s.mutation(async (id: string) => {
        return { result: { success: true }, invalidates: [tags.user(id)] };
      });

      // Cache both queries
      await getUser('123');
      await getUserPosts('123');
      expect(userCallCount).toBe(1);
      expect(postsCallCount).toBe(1);

      // Verify cached
      await getUser('123');
      await getUserPosts('123');
      expect(userCallCount).toBe(1);
      expect(postsCallCount).toBe(1);

      // Invalidate user tag - should also invalidate userPosts (prefix match)
      await updateUser('123');

      // Both should refetch
      await getUser('123');
      await getUserPosts('123');
      expect(userCallCount).toBe(2);
      expect(postsCallCount).toBe(2);
    });
  });

  describe('defineTags', () => {
    it('should create type-safe tag factories', () => {
      const myTags = defineTags({
        user: (id: string) => ['user', id],
        post: (userId: string, postId: number) => ['user', userId, 'post', postId],
      });

      const userTag = myTags.user('123');
      expect(userTag).toEqual(['user', '123']);

      const postTag = myTags.post('123', 456);
      expect(postTag).toEqual(['user', '123', 'post', '456']);
    });
  });

  describe('grace periods', () => {
    it('should serve stale data when factory fails during grace period', async () => {
      let callCount = 0;
      let shouldFail = false;

      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        ttl: '100ms',
        grace: '1h',
        fn: async () => {
          callCount++;
          if (shouldFail) {
            throw new Error('DB is down');
          }
          return { id, name: `User ${callCount}` };
        },
      }));

      // First call - success
      const result1 = await getUser('123');
      expect(result1.name).toBe('User 1');
      expect(callCount).toBe(1);

      // Wait for TTL to expire
      await new Promise((r) => setTimeout(r, 150));

      // Make factory fail
      shouldFail = true;

      // Should return stale data (within grace period)
      const result2 = await getUser('123');
      expect(result2.name).toBe('User 1'); // Still the old value
      expect(callCount).toBe(2); // Factory was called, but failed
    });
  });
});
