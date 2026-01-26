# @t87s/core

Cache that tells you when it's wrong.

```bash
npm install @t87s/core
```

## Quickstart

```typescript
import { T87s, MemoryAdapter, defineTags } from '@t87s/core';

// Name the things you care about
const tags = defineTags({
  user: (id: string) => ['user', id],
});

const t87s = new T87s({ adapter: new MemoryAdapter() });

// Queries get cached
const getUser = t87s.query((id: string) => ({
  tags: [tags.user(id)],
  ttl: '10m',
  fn: () => db.users.findById(id),
}));

// Mutations invalidate the cache
const updateUser = t87s.mutation(async (id: string, data: UserUpdate) => {
  const user = await db.users.update(id, data);
  return { result: user, invalidates: [tags.user(id)] };
});

// That's it. The cache handles the rest.
await getUser('123'); // cache miss, fetches from DB
await getUser('123'); // cache hit, instant
await updateUser('123', {}); // invalidates user:123
await getUser('123'); // cache miss again, refetches
```

## Go read the docs

There's more to know: grace periods, prefix matching, adapters for Redis and our managed cloud service. The docs are at [t87s.dev](https://t87s.dev) and they're worth reading.

## License

MIT
