import { describe, it, expect, beforeEach, vi } from 'vitest';
import { T87s } from './client.js';
import { MemoryAdapter } from './adapters/memory.js';
import { defineTags } from './tags.js';
import type { StorageAdapter } from './types.js';

function createMockAdapterWithVerification() {
  const store = new Map<string, unknown>();
  const tagTimes = new Map<string, number>();
  const reportVerification = vi.fn();

  const adapter: StorageAdapter = {
    async get<T>(key: string) {
      return (store.get(key) as T) ?? null;
    },
    async set<T>(key: string, entry: T) {
      store.set(key, entry);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async getTagInvalidationTime(tag: string[]) {
      return tagTimes.get(tag.join(':')) ?? null;
    },
    async setTagInvalidationTime(tag: string[], time: number) {
      tagTimes.set(tag.join(':'), time);
    },
    async clear() {
      store.clear();
      tagTimes.clear();
    },
    async disconnect() {},
    reportVerification,
  };

  return { adapter, reportVerification, store };
}

describe('T87s', () => {
  let t87s: T87s;

  const tags = defineTags({
    user: (id: string) => ['user', id],
    userPosts: (id: string) => ['user', id, 'posts'],
  });

  beforeEach(() => {
    t87s = new T87s({ adapter: new MemoryAdapter() });
  });

  describe('query - basic caching', () => {
    it('should cache the result of a query', async () => {
      let callCount = 0;

      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        fn: async () => {
          callCount++;
          return { id, name: 'Alice' };
        },
      }));

      const result1 = await getUser('123');
      expect(result1).toEqual({ id: '123', name: 'Alice' });
      expect(callCount).toBe(1);

      const result2 = await getUser('123');
      expect(result2).toEqual({ id: '123', name: 'Alice' });
      expect(callCount).toBe(1); // Still 1, cached

      const result3 = await getUser('456');
      expect(result3).toEqual({ id: '456', name: 'Alice' });
      expect(callCount).toBe(2); // Different args
    });
  });

  describe('query - stampede protection', () => {
    it('should coalesce concurrent requests for same key', async () => {
      let callCount = 0;

      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        fn: async () => {
          callCount++;
          await new Promise((r) => setTimeout(r, 50));
          return { id, name: 'Alice' };
        },
      }));

      // Fire 10 concurrent requests
      const promises = Array.from({ length: 10 }, () => getUser('123'));
      const results = await Promise.all(promises);

      // All should get same result
      for (const result of results) {
        expect(result).toEqual({ id: '123', name: 'Alice' });
      }

      // But only one factory call
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

      // First call - factory executes
      const result1 = await getUser('123');
      expect(result1.name).toBe('User 1');
      expect(callCount).toBe(1);

      // Second call - cached
      const result2 = await getUser('123');
      expect(result2.name).toBe('User 1');
      expect(callCount).toBe(1);

      // Mutate - invalidates tag
      await updateUser('123', 'Alice');

      // Third call - factory executes again
      const result3 = await getUser('123');
      expect(result3.name).toBe('User 2');
      expect(callCount).toBe(2);
    });
  });

  describe('prefix matching', () => {
    it('should invalidate child tags when parent is invalidated', async () => {
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

      // Cache both
      await getUser('123');
      await getUserPosts('123');
      expect(userCallCount).toBe(1);
      expect(postsCallCount).toBe(1);

      // Verify cached
      await getUser('123');
      await getUserPosts('123');
      expect(userCallCount).toBe(1);
      expect(postsCallCount).toBe(1);

      // Invalidate user tag - should also invalidate userPosts
      await updateUser('123');

      // Both should refetch
      await getUser('123');
      await getUserPosts('123');
      expect(userCallCount).toBe(2);
      expect(postsCallCount).toBe(2);
    });

    it('should NOT invalidate child tags when exact=true', async () => {
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

      const updateUserExact = t87s.mutation(async (id: string) => {
        return { result: { success: true }, invalidates: [tags.user(id)], exact: true };
      });

      // Cache both
      await getUser('123');
      await getUserPosts('123');

      // Invalidate with exact=true
      await updateUserExact('123');

      // Only user should refetch, not posts
      await getUser('123');
      await getUserPosts('123');
      expect(userCallCount).toBe(2);
      expect(postsCallCount).toBe(1); // Still 1!
    });
  });

  describe('manual invalidation', () => {
    it('should allow manual tag invalidation', async () => {
      let callCount = 0;

      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        fn: async () => {
          callCount++;
          return { id, name: `User ${callCount}` };
        },
      }));

      await getUser('123');
      expect(callCount).toBe(1);

      await t87s.invalidate([tags.user('123')]);

      await getUser('123');
      expect(callCount).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all cached data', async () => {
      let callCount = 0;

      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        fn: async () => {
          callCount++;
          return { id };
        },
      }));

      await getUser('123');
      expect(callCount).toBe(1);

      await t87s.clear();

      await getUser('123');
      expect(callCount).toBe(2);
    });
  });

  describe('grace periods', () => {
    it('should serve stale data when factory fails during grace', async () => {
      let callCount = 0;
      let shouldFail = false;

      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        ttl: 50, // 50ms as number
        grace: '1h',
        fn: async () => {
          callCount++;
          if (shouldFail) throw new Error('DB down');
          return { id, name: `User ${callCount}` };
        },
      }));

      // First call succeeds
      const result1 = await getUser('123');
      expect(result1.name).toBe('User 1');

      // Wait for TTL to expire
      await new Promise((r) => setTimeout(r, 60));

      // Make factory fail
      shouldFail = true;

      // Should return stale data
      const result2 = await getUser('123');
      expect(result2.name).toBe('User 1'); // Stale value
      expect(callCount).toBe(2); // Factory was called but failed
    });

    it('should background refresh when within grace period', async () => {
      let callCount = 0;

      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        ttl: 50, // 50ms as number
        grace: '1h',
        fn: async () => {
          callCount++;
          return { id, name: `User ${callCount}` };
        },
      }));

      // First call
      await getUser('123');
      expect(callCount).toBe(1);

      // Wait for TTL to expire
      await new Promise((r) => setTimeout(r, 60));

      // Should return stale immediately, refresh in background
      const result = await getUser('123');
      expect(result.name).toBe('User 1'); // Stale value returned immediately

      // Wait for background refresh
      await new Promise((r) => setTimeout(r, 10));
      expect(callCount).toBe(2); // Background refresh happened

      // Next call should get fresh value
      const result2 = await getUser('123');
      expect(result2.name).toBe('User 2');
    });
  });

  describe('verification', () => {
    it('should call reportVerification on sampled cache hits', async () => {
      const { adapter, reportVerification } = createMockAdapterWithVerification();
      const t87s = new T87s({ adapter, verifyPercent: 1.0 });

      let callCount = 0;
      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        fn: async () => {
          callCount++;
          return { id, name: `User ${callCount}` };
        },
      }));

      // First call - cache miss, no verification
      await getUser('123');
      expect(callCount).toBe(1);
      expect(reportVerification).not.toHaveBeenCalled();

      // Second call - cache hit, should verify
      await getUser('123');

      // Wait for async verification to complete
      await vi.waitFor(() => {
        expect(reportVerification).toHaveBeenCalledTimes(1);
      });

      expect(callCount).toBe(2); // fn called for verification
      const call = reportVerification.mock.calls[0]!;
      expect(call[0]).toContain('query_'); // Verify key is passed
      expect(call[1]).toBe(true); // isStale (User 1 vs User 2)
    });

    it('should not verify when verifyPercent is 0', async () => {
      const { adapter, reportVerification } = createMockAdapterWithVerification();
      const t87s = new T87s({ adapter, verifyPercent: 0 });

      let callCount = 0;
      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        fn: async () => {
          callCount++;
          return { id, name: 'Alice' };
        },
      }));

      await getUser('123');
      await getUser('123');

      await new Promise((r) => setTimeout(r, 50));
      expect(reportVerification).not.toHaveBeenCalled();
      expect(callCount).toBe(1); // fn only called once (initial fetch)
    });

    it('should not verify when adapter lacks reportVerification', async () => {
      // Use MemoryAdapter which has no reportVerification
      const t87s = new T87s({ adapter: new MemoryAdapter(), verifyPercent: 1.0 });

      let callCount = 0;
      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        fn: async () => {
          callCount++;
          return { id, name: 'Alice' };
        },
      }));

      await getUser('123');
      await getUser('123');

      await new Promise((r) => setTimeout(r, 50));
      expect(callCount).toBe(1); // fn only called once, no verification
    });

    it('should report isStale=false when values match', async () => {
      const { adapter, reportVerification } = createMockAdapterWithVerification();
      const t87s = new T87s({ adapter, verifyPercent: 1.0 });

      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        fn: async () => ({ id, name: 'Alice' }), // Always same value
      }));

      await getUser('123');
      await getUser('123');

      await vi.waitFor(() => {
        expect(reportVerification).toHaveBeenCalledTimes(1);
      });

      expect(reportVerification.mock.calls[0]![1]).toBe(false); // isStale = false
    });

    it('should silently ignore verification errors', async () => {
      const { adapter, reportVerification } = createMockAdapterWithVerification();
      reportVerification.mockRejectedValue(new Error('Network error'));

      const t87s = new T87s({ adapter, verifyPercent: 1.0 });

      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        fn: async () => ({ id, name: 'Alice' }), // Always succeeds
      }));

      await getUser('123');
      // Should not throw even though reportVerification fails
      const result = await getUser('123');
      expect(result).toEqual({ id: '123', name: 'Alice' });

      // Verify reportVerification was called (and failed silently)
      await vi.waitFor(() => {
        expect(reportVerification).toHaveBeenCalledTimes(1);
      });
    });

    it('should respect sampling rate', async () => {
      const { adapter, reportVerification } = createMockAdapterWithVerification();
      const t87s = new T87s({ adapter, verifyPercent: 0.5 });

      const mathRandomSpy = vi.spyOn(Math, 'random');

      const getUser = t87s.query((id: string) => ({
        tags: [tags.user(id)],
        fn: async () => ({ id, name: 'Alice' }),
      }));

      // First call - cache miss
      await getUser('123');

      // Second call - random < 0.5, should verify
      mathRandomSpy.mockReturnValueOnce(0.3);
      await getUser('123');

      await vi.waitFor(() => {
        expect(reportVerification).toHaveBeenCalledTimes(1);
      });

      // Third call - random >= 0.5, should NOT verify
      mathRandomSpy.mockReturnValueOnce(0.7);
      await getUser('123');

      await new Promise((r) => setTimeout(r, 50));
      expect(reportVerification).toHaveBeenCalledTimes(1); // Still 1

      mathRandomSpy.mockRestore();
    });
  });
});
