// src/query-cache.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { QueryCache } from './query-cache.js';
import { at, wild } from './schema.js';
import { MemoryAdapter } from './adapters/index.js';

describe('QueryCache', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  it('creates cache from schema', () => {
    const schema = at('posts', () => wild);
    const cache = new QueryCache(schema, { adapter });
    expect(cache.tags.posts.__path).toEqual(['posts']);
  });
});
