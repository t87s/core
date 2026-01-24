# t87s Benchmarks

Compares t87s CloudAdapter against raw Upstash Redis operations.

## Setup

```bash
pnpm install
```

## Environment Variables

```bash
export UPSTASH_REDIS_REST_URL="https://your-instance.upstash.io"
export UPSTASH_REDIS_REST_TOKEN="your-token"
export T87S_CLOUD_URL="https://your-t87s-cloud.workers.dev"  # optional, has default
export T87S_API_KEY="your-api-key"  # optional, has default
```

## Run Benchmarks

```bash
pnpm bench
```

## What's Being Compared

| Scenario | Raw Upstash | t87s CloudAdapter |
|----------|-------------|-------------------|
| Cache Hit | Single GET | GET + tag validation |
| Cache Miss | Single SET | GET (miss) + fn() + SET with tags |

## Results (January 2026)

```
Cache Hit (value already in remote cache)
  Raw Upstash GET      107.26 ms  (9.31 ops/sec)
  t87s CloudAdapter     31.07 ms  (32.19 ops/sec) ← 3.4x faster

Cache Miss (fetch + store in remote)
  Raw Upstash SET       88.47 ms  (11.30 ops/sec) ← faster
  t87s CloudAdapter    360.81 ms  (2.77 ops/sec)
```

## Why These Results?

**Cache Hit faster**: t87s Cloud runs on Cloudflare's edge (Workers + KV), which has lower read latency than Upstash's REST API.

**Cache Miss slower**: t87s does more work on a miss:
1. Check cache (miss)
2. Check tag invalidation times
3. Call `fn()` to fetch the value
4. Store value with metadata (TTL, tags, timestamps)
5. Update tag index entries

This overhead is the cost of hierarchical tag invalidation - when you invalidate `user:123`, all `user:123:*` entries are also invalidated automatically.
