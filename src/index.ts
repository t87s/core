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
} from './schema.js';
export type { TypedTag, TypedQueryDef, SchemaToTags } from './query-cache-types.js';

// =============================================================================
// Primitives (escape hatch)
// =============================================================================
export {
  createPrimitives,
  type Primitives,
  type PrimitivesOptions,
  type SetOptions,
  type QueryOptions as PrimitivesQueryOptions,
} from './primitives.js';

// =============================================================================
// Tags (utilities, keep for backward compat if needed)
// =============================================================================
export { serializeTag, deserializeTag, isTagPrefix } from './tags.js';

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
export type { Tag, CacheEntry, Duration, StorageAdapter } from './types.js';

// =============================================================================
// Utilities
// =============================================================================
export { parseDuration } from './duration.js';
