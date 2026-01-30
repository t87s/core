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
} from './primitives.js';

// =============================================================================
// CacheEngine (advanced usage)
// =============================================================================
export { CacheEngine, type CacheEngineOptions, type QueryOptions } from './cache-engine.js';

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

// =============================================================================
// DEPRECATED - Remove in next major version
// =============================================================================

/**
 * @deprecated Use QueryCache instead. T87s will be removed in the next major version.
 */
export { T87s } from './client.js';

/**
 * @deprecated Use schema builders (at, wild) instead. defineTags will be removed in the next major version.
 */
export { defineTags } from './tags.js';

/**
 * @deprecated These types will be removed in the next major version.
 */
export type { T87sOptions, QueryConfig, MutationResult } from './types.js';
