// src/query-cache.ts
import type { StorageAdapter } from './types.js';
import type { Duration } from './duration.js';
import type {
  SchemaToTags,
  TypedQueryDef,
  QueryRecord,
  QueriesToMethods,
  TypedTag,
} from './query-cache-types.js';
import { CacheEngine } from './cache-engine.js';
import { createTagBuilder } from './tag-builder.js';
import { createPrimitives, type Primitives } from './primitives.js';

export interface QueryCacheOptions<Schema, Q extends QueryRecord> {
  schema: Schema;
  adapter: StorageAdapter;
  queries: (tags: SchemaToTags<Schema>) => Q;
  prefix?: string;
  defaultTtl?: Duration;
  defaultGrace?: Duration | false;
  verifyPercent?: number;
}

export type QueryCacheClient<Schema, Q extends QueryRecord> = QueriesToMethods<Q> & {
  readonly tags: SchemaToTags<Schema>;
  readonly primitives: Primitives;
  invalidate(tag: TypedTag, exact?: boolean): Promise<void>;
  clear(): Promise<void>;
  disconnect(): Promise<void>;
};

/**
 * Create a QueryCache with typed queries defined at construction time.
 *
 * Query names are guaranteed unique because they're defined in an object literal,
 * and TypeScript/JavaScript prevents duplicate keys in object literals.
 *
 * @example
 * ```typescript
 * const cache = QueryCache({
 *   schema: at('posts', () => wild),
 *   adapter: new MemoryAdapter(),
 *   queries: (tags) => ({
 *     getPost: (postId: string) => ({
 *       tags: [tags.posts(postId)],
 *       fn: () => fetchPost(postId),
 *     }),
 *   }),
 * });
 *
 * // Usage - query methods are directly on the cache
 * const post = await cache.getPost('123');
 * await cache.invalidate(cache.tags.posts('123'));
 * ```
 */
export function QueryCache<Schema, Q extends QueryRecord>(
  options: QueryCacheOptions<Schema, Q>
): QueryCacheClient<Schema, Q> {
  const engine = new CacheEngine({
    adapter: options.adapter,
    prefix: options.prefix ?? 'qc',
    defaultTtl: options.defaultTtl,
    defaultGrace: options.defaultGrace,
    verifyPercent: options.verifyPercent,
  });

  const tags = createTagBuilder(options.schema);
  const primitives = createPrimitives({
    adapter: options.adapter,
    prefix: options.prefix ?? 'qc',
  });

  // Build query methods from the factory
  const queryDefs = options.queries(tags);
  const methods: Record<string, (...args: unknown[]) => Promise<unknown>> = {};

  for (const [name, queryFn] of Object.entries(queryDefs)) {
    methods[name] = async (...args: unknown[]) => {
      const def = queryFn(...args) as TypedQueryDef<unknown>;
      return engine.query({
        key: `${name}:${JSON.stringify(args)}`,
        tags: def.tags.map((t) => (t as TypedTag).__path),
        fn: def.fn,
        ttl: def.ttl,
        grace: def.grace,
      });
    };
  }

  return {
    ...methods,
    tags,
    primitives,
    invalidate: async (tag: TypedTag, exact?: boolean) => {
      await engine.invalidate([(tag as TypedTag).__path], exact ?? false);
    },
    clear: () => engine.clear(),
    disconnect: () => engine.disconnect(),
  } as QueryCacheClient<Schema, Q>;
}
