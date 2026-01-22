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
});
