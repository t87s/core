import { bench, describe, beforeAll } from 'vitest';
import { T87s, MemoryAdapter, defineTags } from '@t87s/core';

const tags = defineTags({
  user: (id: string) => ['user', id],
  userPosts: (id: string) => ['user', id, 'posts'],
});

let t87s: T87s;
let getUser: (id: string) => Promise<{ id: string; name: string }>;

beforeAll(async () => {
  const adapter = new MemoryAdapter();
  t87s = new T87s({ adapter, prefix: 'bench' });

  getUser = t87s.query((id: string) => ({
    tags: [tags.user(id)],
    ttl: '10m',
    fn: async () => ({ id, name: 'Test User' }),
  }));

  // Warm up cache
  await getUser('warmup');
});

describe('Microbenchmarks', () => {
  bench('cache hit', async () => {
    await getUser('warmup');
  });

  bench('cache miss', async () => {
    const id = `miss-${Math.random()}`;
    await getUser(id);
  });

  bench('tag creation', () => {
    tags.user('123');
  });

  bench('tag creation (nested)', () => {
    tags.userPosts('123');
  });
});
