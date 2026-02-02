// src/index.ts

// =============================================================================
// QueryCache (new API)
// =============================================================================
export { QueryCache, type QueryCacheOptions, type QueryCacheClient } from './query-cache.js';
export {
  at,
  wild,
  type AtBuilder,
  type WildBuilder,
  type AtNode,
  type WildNode,
  type Wild,
} from './schema.js';
export type {
  TypedTag,
  TypedQueryDef,
  SchemaToTags,
  QueryRecord,
  QueriesToMethods,
  RefreshResult,
} from './query-cache-types.js';

// =============================================================================
// Primitives (escape hatch)
// =============================================================================
export {
  createPrimitives,
  createQueryPromise,
  type Primitives,
  type PrimitivesOptions,
  type SetOptions,
  type QueryOptions as PrimitivesQueryOptions,
} from './primitives.js';

// =============================================================================
// Adapters
// =============================================================================
export {
  MemoryAdapter,
  type MemoryAdapterOptions,
  RedisAdapter,
  type RedisAdapterOptions,
  UpstashAdapter,
  type UpstashAdapterOptions,
  CloudAdapter,
  type CloudAdapterOptions,
} from './adapters/index.js';

// =============================================================================
// Types
// =============================================================================
export type { CacheEntry, Duration, StorageAdapter, EntriesResult, QueryPromise } from './types.js';

// =============================================================================
// Utilities
// =============================================================================
export { parseDuration } from './duration.js';
