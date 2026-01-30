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

export interface QueryCacheOptions {
  adapter: StorageAdapter;
  prefix?: string;
  defaultTtl?: Duration;
  defaultGrace?: Duration | false;
  verifyPercent?: number;
}

export class QueryCache<Schema> {
  private engine: CacheEngine;
  public readonly tags: SchemaToTags<Schema>;
  public readonly primitives: Primitives;

  constructor(schema: Schema, options: QueryCacheOptions) {
    this.engine = new CacheEngine({
      adapter: options.adapter,
      prefix: options.prefix ?? 'qc',
      defaultTtl: options.defaultTtl,
      defaultGrace: options.defaultGrace,
      verifyPercent: options.verifyPercent,
    });
    this.tags = createTagBuilder(schema);
    this.primitives = createPrimitives({
      adapter: options.adapter,
      prefix: options.prefix ?? 'qc',
    });
  }

  queries<Q extends QueryRecord>(
    factory: (tags: SchemaToTags<Schema>) => Q
  ): QueryCacheClient<Schema, Q> {
    const queryDefs = factory(this.tags);
    const methods: Record<string, (...args: unknown[]) => Promise<unknown>> = {};

    for (const [name, queryFn] of Object.entries(queryDefs)) {
      methods[name] = async (...args: unknown[]) => {
        const def = queryFn(...args) as TypedQueryDef<unknown>;
        return this.engine.query({
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
      tags: this.tags,
      primitives: this.primitives,
      invalidate: async (tag: TypedTag, exact?: boolean) => {
        await this.engine.invalidate([(tag as TypedTag).__path], exact ?? false);
      },
      clear: () => this.engine.clear(),
      disconnect: () => this.engine.disconnect(),
    } as QueryCacheClient<Schema, Q>;
  }
}

export type QueryCacheClient<Schema, Q extends QueryRecord> = QueriesToMethods<Q> & {
  readonly tags: SchemaToTags<Schema>;
  readonly primitives: Primitives;
  invalidate(tag: TypedTag, exact?: boolean): Promise<void>;
  clear(): Promise<void>;
  disconnect(): Promise<void>;
};
