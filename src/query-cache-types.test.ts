// src/query-cache-types.test.ts
import { describe, it, expect } from 'vitest';
import { at, wild } from './schema.js';
import { QueryCache } from './query-cache.js';
import { MemoryAdapter } from './adapters/index.js';
import type { TypedTag } from './query-cache-types.js';

describe('QueryCache type safety', () => {
  it('allows valid tag paths', () => {
    const schema = at('posts', () => wild(() => at('comments', () => wild)));
    const cache = new QueryCache(schema, { adapter: new MemoryAdapter() });

    const client = cache.queries((tags) => ({
      getPost: (postId: string) => ({
        tags: [tags.posts(postId)],
        fn: async () => ({ id: postId }),
      }),
    }));

    // These should compile
    const _t1: TypedTag = client.tags.posts;
    const _t2: TypedTag = client.tags.posts('123');
    const _t3: TypedTag = client.tags.posts('123').comments;
    const _t4: TypedTag = client.tags.posts('123').comments('456');

    expect(true).toBe(true);
  });

  it('rejects invalid paths', () => {
    const schema = at('posts', () => wild);
    const cache = new QueryCache(schema, { adapter: new MemoryAdapter() });

    cache.queries((tags) => ({
      badQuery: () => ({
        // @ts-expect-error - 'users' does not exist
        tags: [tags.users],
        fn: async () => ({}),
      }),
    }));

    expect(true).toBe(true);
  });

  it('rejects missing wild segment', () => {
    const schema = at('posts', () => wild(() => at('comments')));
    const cache = new QueryCache(schema, { adapter: new MemoryAdapter() });

    cache.queries((tags) => ({
      badQuery: () => ({
        // @ts-expect-error - missing postId
        tags: [tags.posts.comments],
        fn: async () => ({}),
      }),
    }));

    expect(true).toBe(true);
  });

  it('rejects calling non-wild', () => {
    const schema = at('posts').at('settings');
    const cache = new QueryCache(schema, { adapter: new MemoryAdapter() });

    cache.queries((tags) => ({
      badQuery: () => ({
        // @ts-expect-error - settings is not callable
        tags: [tags.settings('123')],
        fn: async () => ({}),
      }),
    }));

    expect(true).toBe(true);
  });
});
