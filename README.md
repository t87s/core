# @t87s/core

Declarative cache invalidation.

## Installation

```bash
npm install @t87s/core
# For Redis support:
npm install ioredis
```

## Quick Start

### Memory Adapter (Development)

```typescript
import { T87s, MemoryAdapter, defineTags } from '@t87s/core';

const t87s = new T87s({
  adapter: new MemoryAdapter(),
});
```

### Redis Adapter (Production)

```typescript
import Redis from 'ioredis';
import { T87s, RedisAdapter, defineTags } from '@t87s/core';

const redis = new Redis('redis://localhost:6379');
const t87s = new T87s({
  adapter: new RedisAdapter({ client: redis, prefix: 'myapp' }),
});
```

### Cloud Adapter (Managed Service)

```typescript
import { T87s, CloudAdapter, defineTags } from '@t87s/core';

const t87s = new T87s({
  adapter: new CloudAdapter({
    apiKey: process.env.T87S_API_KEY!,
    baseUrl: 'https://api.t87s.dev', // optional, defaults to production
  }),
});
```

The Cloud Adapter provides:
- Zero infrastructure to manage
- Strong consistency via Durable Objects
- Global edge caching via Cloudflare KV
- ~45ms round-trip latency for cache reads

## Define Tags

```typescript
const tags = defineTags({
  user: (id: string) => ['user', id],
  userPosts: (id: string) => ['user', id, 'posts'],
});
```

## Queries

```typescript
const getUser = t87s.query((id: string) => ({
  tags: [tags.user(id)],
  ttl: '10m',
  grace: '1h',
  fn: async () => db.users.find(id),
}));

const user = await getUser('123');
```

## Mutations

```typescript
const updateUser = t87s.mutation(async (id: string, data: Partial<User>) => {
  const user = await db.users.update(id, data);
  return { result: user, invalidates: [tags.user(id)] };
});
```

## Prefix Matching

Invalidating `['user', '123']` also invalidates `['user', '123', 'posts']`.

Use `exact: true` to disable:

```typescript
return { result, invalidates: [tags.user(id)], exact: true };
```

## License

MIT
