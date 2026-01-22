# @t87s/core

> Declarative cache invalidation that tells you when it's wrong.

**t87s** treats cache as a dependency graph, not a key-value bucket. You declare what depends on what. The system handles the rest.

```typescript
import { T87s, MemoryAdapter, defineTags } from '@t87s/core';

const t87s = new T87s({ adapter: new MemoryAdapter() });

// Define your tags (type-safe, centralized)
const tags = defineTags({
  user: (id: string) => ['user', id],
  userPosts: (id: string) => ['user', id, 'posts'],
});

// Queries declare what they depend on
const getUser = t87s.query((id: string) => ({
  tags: [tags.user(id)],
  ttl: '10m',
  fn: async () => db.users.find(id),
}));

// Mutations declare what they invalidate
const updateUser = t87s.mutation(async (id: string, data: Partial<User>) => {
  const user = await db.users.update(id, data);
  return { result: user, invalidates: [tags.user(id)] };
});
```

## Features

- **Type-safe tags** — `defineTags()` prevents typos, enables autocomplete
- **Declarative invalidation** — Mutations return what they affect
- **Prefix-matching** — Invalidating `user:123` also clears `user:123:posts`
- **Grace periods** — Serve stale data when your DB hiccups
- **Stampede protection** — Concurrent requests share one fetch
- **Multiple adapters** — Memory, Redis, or t87s Cloud

## Installation

```bash
npm install @t87s/core
# or
pnpm add @t87s/core
```

## Adapters

### MemoryAdapter (local development)

```typescript
import { T87s, MemoryAdapter } from '@t87s/core';

const t87s = new T87s({ adapter: new MemoryAdapter() });
```

### RedisAdapter (self-hosted production)

```typescript
import { T87s, RedisAdapter } from '@t87s/core';
import { Redis } from 'ioredis';

const t87s = new T87s({
  adapter: new RedisAdapter({ client: new Redis() }),
});
```

### CloudAdapter (managed service)

```typescript
import { T87s, CloudAdapter } from '@t87s/core';

const t87s = new T87s({
  adapter: new CloudAdapter({
    apiKey: process.env.T87S_API_KEY,
  }),
});
```

## Documentation

Full documentation at [t87s.dev/docs](https://t87s.dev/docs)

## License

MIT
