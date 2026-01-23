// Core client
export { T87s } from './client.js';

// Tags
export { defineTags, isTagPrefix, serializeTag, deserializeTag } from './tags.js';

// Adapters
export {
  MemoryAdapter,
  type MemoryAdapterOptions,
  RedisAdapter,
  type RedisAdapterOptions,
  CloudAdapter,
  type CloudAdapterOptions,
} from './adapters/index.js';

// Types
export type {
  Tag,
  CacheEntry,
  T87sOptions,
  Duration,
  QueryConfig,
  MutationResult,
  StorageAdapter,
  VerifyCallback,
} from './types.js';

// Utilities
export { parseDuration } from './duration.js';
