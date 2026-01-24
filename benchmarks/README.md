# t87s Benchmarks

Apples-to-apples comparison: same t87s code, same tags, same queries - only the adapter differs.

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

Same t87s query with two different adapters:
- **UpstashAdapter** - Direct to Upstash Redis REST API
- **CloudAdapter** - Through t87s Cloud (Cloudflare Workers + KV)

Both do the same work: tag validation, cache storage, prefix-matching invalidation.

## Results (January 2026)

```
Cache Hit (same t87s query, different adapter)
  t87s + UpstashAdapter  1,652ms  (0.6 ops/sec)
  t87s + CloudAdapter      407ms  (2.5 ops/sec) ← 4x faster

Cache Miss (same t87s query, different adapter)
  t87s + UpstashAdapter    639ms  (1.6 ops/sec)
  t87s + CloudAdapter      479ms  (2.1 ops/sec) ← 1.3x faster
```

## Why CloudAdapter Wins

CloudAdapter uses Cloudflare's edge infrastructure:
- **Workers** run at 300+ edge locations globally
- **KV** is replicated across the edge with low-latency reads
- Requests hit the nearest edge, not a central region

UpstashAdapter makes direct REST API calls to Upstash's infrastructure, which may have higher latency depending on your location.

Both adapters do the same t87s work (tag validation, prefix matching, etc.) - the difference is purely infrastructure.
