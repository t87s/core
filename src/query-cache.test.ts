// src/query-cache.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryCache } from './query-cache.js';
import { at, wild } from './schema.js';
import { MemoryAdapter } from './adapters/index.js';

describe('QueryCache', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  describe('construction', () => {
    it('creates cache from schema', () => {
      const schema = at('posts', () => wild);
      const cache = new QueryCache(schema, { adapter });
      expect(cache.tags.posts.__path).toEqual(['posts']);
    });

    it('exposes primitives', () => {
      const schema = at('posts');
      const cache = new QueryCache(schema, { adapter });
      expect(cache.primitives).toBeDefined();
      expect(cache.primitives.get).toBeDefined();
    });
  });

  describe('queries', () => {
    it('defines and executes queries', async () => {
      const schema = at('posts', () => wild);
      const cache = new QueryCache(schema, { adapter });

      const fetchPost = vi.fn().mockResolvedValue({ id: '1', title: 'Test' });

      const client = cache.queries((tags) => ({
        getPost: (postId: string) => ({
          tags: [tags.posts(postId)],
          fn: () => fetchPost(postId),
        }),
      }));

      const result = await client.getPost('123');
      expect(result).toEqual({ id: '1', title: 'Test' });
      expect(fetchPost).toHaveBeenCalledWith('123');
    });

    it('caches query results', async () => {
      const schema = at('posts', () => wild);
      const cache = new QueryCache(schema, { adapter });

      const fetchPost = vi.fn().mockResolvedValue({ id: '1' });

      const client = cache.queries((tags) => ({
        getPost: (postId: string) => ({
          tags: [tags.posts(postId)],
          fn: () => fetchPost(postId),
        }),
      }));

      await client.getPost('123');
      await client.getPost('123');
      expect(fetchPost).toHaveBeenCalledTimes(1);
    });

    it('different args are different cache entries', async () => {
      const schema = at('posts', () => wild);
      const cache = new QueryCache(schema, { adapter });

      const fetchPost = vi.fn().mockImplementation((id) => Promise.resolve({ id }));

      const client = cache.queries((tags) => ({
        getPost: (postId: string) => ({
          tags: [tags.posts(postId)],
          fn: () => fetchPost(postId),
        }),
      }));

      await client.getPost('1');
      await client.getPost('2');
      expect(fetchPost).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidation', () => {
    it('invalidates by tag', async () => {
      const schema = at('posts', () => wild);
      const cache = new QueryCache(schema, { adapter });

      let count = 0;
      const fetchPost = vi.fn().mockImplementation(() => Promise.resolve({ count: ++count }));

      const client = cache.queries((tags) => ({
        getPost: (postId: string) => ({
          tags: [tags.posts(postId)],
          fn: (): Promise<{ count: number }> => fetchPost(postId),
        }),
      }));

      await client.getPost('123');
      await client.invalidate(client.tags.posts('123'));
      const result = await client.getPost('123');

      expect(result.count).toBe(2);
    });

    it('hierarchical invalidation', async () => {
      const schema = at('posts', () => wild(() => at('comments', () => wild)));
      const cache = new QueryCache(schema, { adapter });

      let count = 0;
      const fetchComments = vi.fn().mockImplementation(() => Promise.resolve([{ count: ++count }]));

      const client = cache.queries((tags) => ({
        getComments: (postId: string) => ({
          tags: [tags.posts(postId).comments],
          fn: (): Promise<{ count: number }[]> => fetchComments(postId),
        }),
      }));

      await client.getComments('p1');

      // Invalidate parent
      await client.invalidate(client.tags.posts('p1'));

      const result = await client.getComments('p1');
      expect(result[0]!.count).toBe(2);
    });

    it('exact invalidation', async () => {
      const schema = at('posts', () => wild(() => at('comments', () => wild)));
      const cache = new QueryCache(schema, { adapter });

      let count = 0;
      const fetchComments = vi.fn().mockImplementation(() => Promise.resolve([{ count: ++count }]));

      const client = cache.queries((tags) => ({
        getComments: (postId: string) => ({
          tags: [tags.posts(postId).comments],
          fn: (): Promise<{ count: number }[]> => fetchComments(postId),
        }),
      }));

      await client.getComments('p1');

      // Exact invalidate parent - should NOT affect child
      await client.invalidate(client.tags.posts('p1'), true);

      const result = await client.getComments('p1');
      expect(result[0]!.count).toBe(1); // Still cached
    });
  });

  describe('client utilities', () => {
    it('exposes tags on client', () => {
      const schema = at('posts', () => wild).at('users');
      const cache = new QueryCache(schema, { adapter });

      const client = cache.queries(() => ({}));

      expect(client.tags.posts.__path).toEqual(['posts']);
      expect(client.tags.users.__path).toEqual(['users']);
    });

    it('exposes primitives on client', () => {
      const schema = at('posts');
      const cache = new QueryCache(schema, { adapter });
      const client = cache.queries(() => ({}));

      expect(client.primitives.get).toBeDefined();
      expect(client.primitives.set).toBeDefined();
    });

    it('clear removes all cached data', async () => {
      const schema = at('posts', () => wild);
      const cache = new QueryCache(schema, { adapter });

      const fetchPost = vi.fn().mockResolvedValue({ id: '1' });

      const client = cache.queries((tags) => ({
        getPost: (postId: string) => ({
          tags: [tags.posts(postId)],
          fn: () => fetchPost(postId),
        }),
      }));

      await client.getPost('123');
      await client.clear();
      await client.getPost('123');

      expect(fetchPost).toHaveBeenCalledTimes(2);
    });
  });
});
