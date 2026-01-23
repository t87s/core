# t87s Demo

A runnable demo showing t87s solving the classic cache invalidation problem.

## Quick Start

```bash
pnpm install
pnpm start
```

## What it shows

1. Cache miss on first user fetch
2. Cache hit on second fetch
3. Cache miss on posts fetch
4. Update user → automatically invalidates user AND posts via prefix match
5. Both user and posts are now cache misses

The magic: `invalidates: [tags.user(id)]` also invalidates `user:id:posts` because t87s uses prefix matching.

## With Redis (Upstash)

```bash
UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... pnpm start:redis
```
