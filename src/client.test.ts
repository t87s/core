import { describe, it, expect, beforeEach } from 'vitest';
import { T87s } from './client.js';
import { MemoryAdapter } from './adapters/memory.js';
import { defineTags } from './tags.js';

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
});
