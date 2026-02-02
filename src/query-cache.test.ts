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
    it('creates cache with schema and queries', () => {
      const cache = QueryCache({
        schema: at('posts', () => wild),
        adapter,
        queries: (tags) => ({
          getPost: (postId: string) => ({
            tags: [tags.posts(postId)],
            fn: async () => ({ id: postId }),
          }),
        }),
      });
      expect(cache.tags.posts.__path).toEqual(['posts']);
      expect(cache.getPost).toBeDefined();
    });

    it('exposes primitives', () => {
      const cache = QueryCache({
        schema: at('posts'),
        adapter,
        queries: () => ({}),
      });
      expect(cache.primitives).toBeDefined();
      expect(cache.primitives.get).toBeDefined();
    });

    it('exposes tags for invalidation', () => {
      const cache = QueryCache({
        schema: at('posts', () => wild).at('users'),
        adapter,
        queries: () => ({}),
      });
      expect(cache.tags.posts.__path).toEqual(['posts']);
      expect(cache.tags.users.__path).toEqual(['users']);
    });
  });

  describe('queries', () => {
    it('defines and executes queries', async () => {
      const fetchPost = vi.fn().mockResolvedValue({ id: '1', title: 'Test' });

      const cache = QueryCache({
        schema: at('posts', () => wild),
        adapter,
        queries: (tags) => ({
          getPost: (postId: string) => ({
            tags: [tags.posts(postId)],
            fn: () => fetchPost(postId),
          }),
        }),
      });

      const result = await cache.getPost('123');
      expect(result).toEqual({ id: '1', title: 'Test' });
      expect(fetchPost).toHaveBeenCalledWith('123');
    });

    it('caches query results', async () => {
      const fetchPost = vi.fn().mockResolvedValue({ id: '1' });

      const cache = QueryCache({
        schema: at('posts', () => wild),
        adapter,
        queries: (tags) => ({
          getPost: (postId: string) => ({
            tags: [tags.posts(postId)],
            fn: () => fetchPost(postId),
          }),
        }),
      });

      await cache.getPost('123');
      await cache.getPost('123');
      expect(fetchPost).toHaveBeenCalledTimes(1);
    });

    it('different args are different cache entries', async () => {
      const fetchPost = vi.fn().mockImplementation((id) => Promise.resolve({ id }));

      const cache = QueryCache({
        schema: at('posts', () => wild),
        adapter,
        queries: (tags) => ({
          getPost: (postId: string) => ({
            tags: [tags.posts(postId)],
            fn: () => fetchPost(postId),
          }),
        }),
      });

      await cache.getPost('1');
      await cache.getPost('2');
      expect(fetchPost).toHaveBeenCalledTimes(2);
    });

    it('multiple queries in same cache', async () => {
      const fetchPost = vi.fn().mockResolvedValue({ id: '1' });
      const fetchComments = vi.fn().mockResolvedValue([{ id: 'c1' }]);

      const cache = QueryCache({
        schema: at('posts', () => wild(() => at('comments', () => wild))),
        adapter,
        queries: (tags) => ({
          getPost: (postId: string) => ({
            tags: [tags.posts(postId)],
            fn: () => fetchPost(postId),
          }),
          getComments: (postId: string) => ({
            tags: [tags.posts(postId).comments],
            fn: () => fetchComments(postId),
          }),
        }),
      });

      await cache.getPost('123');
      await cache.getComments('123');
      expect(fetchPost).toHaveBeenCalledTimes(1);
      expect(fetchComments).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidation', () => {
    it('invalidates by tag', async () => {
      let count = 0;
      const fetchPost = vi.fn().mockImplementation(() => Promise.resolve({ count: ++count }));

      const cache = QueryCache({
        schema: at('posts', () => wild),
        adapter,
        queries: (tags) => ({
          getPost: (postId: string) => ({
            tags: [tags.posts(postId)],
            fn: (): Promise<{ count: number }> => fetchPost(postId),
          }),
        }),
      });

      await cache.getPost('123');
      await cache.invalidate(cache.tags.posts('123'));
      const result = await cache.getPost('123');

      expect(result.count).toBe(2);
    });

    it('hierarchical invalidation', async () => {
      let count = 0;
      const fetchComments = vi.fn().mockImplementation(() => Promise.resolve([{ count: ++count }]));

      const cache = QueryCache({
        schema: at('posts', () => wild(() => at('comments', () => wild))),
        adapter,
        queries: (tags) => ({
          getComments: (postId: string) => ({
            tags: [tags.posts(postId).comments],
            fn: (): Promise<{ count: number }[]> => fetchComments(postId),
          }),
        }),
      });

      await cache.getComments('p1');

      // Invalidate parent
      await cache.invalidate(cache.tags.posts('p1'));

      const result = await cache.getComments('p1');
      expect(result[0]!.count).toBe(2);
    });

    it('exact invalidation', async () => {
      let count = 0;
      const fetchComments = vi.fn().mockImplementation(() => Promise.resolve([{ count: ++count }]));

      const cache = QueryCache({
        schema: at('posts', () => wild(() => at('comments', () => wild))),
        adapter,
        queries: (tags) => ({
          getComments: (postId: string) => ({
            tags: [tags.posts(postId).comments],
            fn: (): Promise<{ count: number }[]> => fetchComments(postId),
          }),
        }),
      });

      await cache.getComments('p1');

      // Exact invalidate parent - should NOT affect child
      await cache.invalidate(cache.tags.posts('p1'), true);

      const result = await cache.getComments('p1');
      expect(result[0]!.count).toBe(1); // Still cached
    });
  });

  describe('utilities', () => {
    it('clear removes all cached data', async () => {
      const fetchPost = vi.fn().mockResolvedValue({ id: '1' });

      const cache = QueryCache({
        schema: at('posts', () => wild),
        adapter,
        queries: (tags) => ({
          getPost: (postId: string) => ({
            tags: [tags.posts(postId)],
            fn: () => fetchPost(postId),
          }),
        }),
      });

      await cache.getPost('123');
      await cache.clear();
      await cache.getPost('123');

      expect(fetchPost).toHaveBeenCalledTimes(2);
    });
  });

  describe('key uniqueness', () => {
    it('query names must be unique (enforced by object literal)', () => {
      // This test documents the design: TypeScript/JavaScript prevents
      // duplicate keys in object literals, so query names are guaranteed unique.
      //
      // The following would be a compile error:
      // queries: (tags) => ({
      //   getPost: ...,
      //   getPost: ...,  // Error: Duplicate identifier 'getPost'
      // })
      //
      // This is why queries must be defined at construction time in an
      // object literal, not via a method that can be called multiple times.

      const cache = QueryCache({
        schema: at('posts', () => wild),
        adapter,
        queries: (tags) => ({
          getPost: (postId: string) => ({
            tags: [tags.posts(postId)],
            fn: async () => ({ id: postId }),
          }),
          listPosts: () => ({
            tags: [tags.posts],
            fn: async () => [],
          }),
        }),
      });

      // Both queries exist and are distinct
      expect(cache.getPost).toBeDefined();
      expect(cache.listPosts).toBeDefined();
      expect(cache.getPost).not.toBe(cache.listPosts);
    });
  });

  describe('.entries access', () => {
    it('allows direct await for value', async () => {
      const cache = QueryCache({
        schema: at('users', () => wild),
        adapter: new MemoryAdapter(),
        queries: (tags) => ({
          getUser: (id: string) => ({
            tags: [tags.users(id)],
            fn: async () => ({ id, name: 'Test' }),
          }),
        }),
      });

      const user = await cache.getUser('123');
      expect(user).toEqual({ id: '123', name: 'Test' });
    });

    it('allows .entries access for cache metadata', async () => {
      const cache = QueryCache({
        schema: at('users', () => wild),
        adapter: new MemoryAdapter(),
        queries: (tags) => ({
          getUser: (id: string) => ({
            tags: [tags.users(id)],
            fn: async () => ({ id, name: 'Test' }),
          }),
        }),
      });

      const result = await cache.getUser('123').entries;
      expect(result.before).toBeNull(); // First call is a miss
      expect(result.after.value).toEqual({ id: '123', name: 'Test' });
    });

    it('returns same entry for fresh hit via .entries', async () => {
      const cache = QueryCache({
        schema: at('users', () => wild),
        adapter: new MemoryAdapter(),
        queries: (tags) => ({
          getUser: (id: string) => ({
            tags: [tags.users(id)],
            fn: async () => ({ id, name: 'Test' }),
          }),
        }),
      });

      // Populate cache
      await cache.getUser('123');

      // Check entries
      const result = await cache.getUser('123').entries;
      expect(result.before).not.toBeNull();
      expect(result.before).toBe(result.after);
    });
  });
});
