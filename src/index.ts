// Core client
export { T87s } from './client.js';

// Tags
export { defineTags, isTagPrefix, serializeTag, deserializeTag } from './tags.js';

// Adapters
export { MemoryAdapter, type MemoryAdapterOptions } from './adapters/index.js';

// Types
export type {
  Tag,
  CacheEntry,
  T87sOptions,
  Duration,
  QueryConfig,
  MutationResult,
  StorageAdapter,
} from './types.js';

// Utilities
export { parseDuration, formatDuration } from './duration.js';
