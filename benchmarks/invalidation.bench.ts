import { bench, describe, beforeAll } from 'vitest';
import { T87s, MemoryAdapter, defineTags } from '@t87s/core';

const tags = defineTags({
  user: (id: string) => ['user', id],
  userPosts: (id: string) => ['user', id, 'posts'],
  userSettings: (id: string) => ['user', id, 'settings'],
  userNotifications: (id: string) => ['user', id, 'notifications'],
});

let t87s: T87s;

beforeAll(async () => {
  const adapter = new MemoryAdapter();
  t87s = new T87s({ adapter, prefix: 'bench' });

  // Create queries for each tag type
  const getUser = t87s.query((id: string) => ({
    tags: [tags.user(id)],
    fn: async () => ({ id }),
  }));

  const getPosts = t87s.query((id: string) => ({
    tags: [tags.userPosts(id)],
    fn: async () => [],
  }));

  const getSettings = t87s.query((id: string) => ({
    tags: [tags.userSettings(id)],
    fn: async () => ({}),
  }));

  const getNotifications = t87s.query((id: string) => ({
    tags: [tags.userNotifications(id)],
    fn: async () => [],
  }));

  // Pre-populate cache for 100 users
  for (let i = 0; i < 100; i++) {
    await getUser(`user-${i}`);
    await getPosts(`user-${i}`);
    await getSettings(`user-${i}`);
    await getNotifications(`user-${i}`);
  }
});

describe('Invalidation', () => {
  let counter = 0;

  bench('single tag (exact)', async () => {
    await t87s.invalidate([tags.userPosts(`user-${counter++ % 100}`)], true);
  });

  bench('single tag (prefix match)', async () => {
    await t87s.invalidate([tags.user(`user-${counter++ % 100}`)]);
  });

  bench('bulk invalidation (10 tags)', async () => {
    const base = counter++ % 90;
    const tagsToInvalidate = Array.from({ length: 10 }, (_, i) =>
      tags.user(`user-${base + i}`)
    );
    await t87s.invalidate(tagsToInvalidate);
  });
});
