# @t87s/core

Cache that tells you when it's wrong.

```bash
npm install @t87s/core
```

## Quickstart

QueryCache is the smooth path. Primitives are the sharp one. Both are first-class.

```typescript
import { QueryCache, at, wild, MemoryAdapter } from '@t87s/core';

const schema = at('users', () => wild.at('settings'));

const cache = QueryCache({
  schema,
  adapter: new MemoryAdapter(),
  queries: (tags) => ({
    getUser: (id: string) => ({
      tags: [tags.users(id)],
      fn: () => db.users.findById(id),
    }),
  }),
});

await cache.getUser('123');
await cache.invalidate(cache.tags.users('123'));
```

If you want the raw tools:

```typescript
import { createPrimitives, MemoryAdapter } from '@t87s/core';

const p = createPrimitives({ adapter: new MemoryAdapter() });

await p.query({
  key: 'users:123',
  tags: [['users', '123']],
  fn: () => db.users.findById('123'),
});
```

## Go read the docs

There's more to know: prefix matching, TTLs, grace periods, the two APIs, and the cloud. The docs are at [t87s.dev](https://t87s.dev) and they're worth reading.

## License

MIT
