# QueryCache Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace current T87s API with schema-based QueryCache while preserving all features.

**Architecture:**
```
StorageAdapter (unchanged)
    ↓
CacheEngine (extracted from T87s - all cache mechanics)
    ↓
├── QueryCache (typed schema-based API)
└── Primitives (raw get/set/del/invalidate escape hatch)
```

**Tech Stack:** TypeScript, Vitest

---

## Feature Checklist

Every feature from T87s must be preserved in CacheEngine:

| Feature | Location | Status |
|---------|----------|--------|
| Stampede protection | CacheEngine.inFlight | Task 3 |
| TTL | CacheEngine.fetchAndCache | Task 3 |
| Grace / SWR | CacheEngine.getOrFetch | Task 3 |
| Hierarchical tag invalidation | CacheEngine.isEntryStale | Task 3 |
| Exact invalidation mode | CacheEngine.invalidateTag | Task 3 |
| Verification sampling | CacheEngine.runVerification | Task 3 |
| Error handling with grace | CacheEngine.fetchAndCache | Task 3 |
| clear() | CacheEngine.clear | Task 3 |
| disconnect() | CacheEngine.disconnect | Task 3 |
| serializeTag/deserializeTag | Keep in tags.ts | No change |
| isTagPrefix | Keep in tags.ts | No change |

**Removed:**
- `T87s` class → replaced by CacheEngine + QueryCache
- `defineTags()` → replaced by `at`/`wild` schema

---

## Task 1: Schema Builders

**Files:**
- Create: `src/schema.ts`
- Test: `src/schema.test.ts`

**Step 1: Write failing test**

```typescript
// src/schema.test.ts
import { describe, it, expect } from 'vitest';
import { at, wild } from './schema.js';

describe('schema builders', () => {
  it('at() creates a static node', () => {
    const schema = at('posts');
    expect(schema._tag).toBe('at');
    expect(schema._name).toBe('posts');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/schema.test.ts`
Expected: FAIL - Cannot find module

**Step 3: Write implementation**

```typescript
// src/schema.ts

// =============================================================================
// Schema Node Types (for type inference)
// =============================================================================

export interface AtNode<Name extends string = string, Children = never, Siblings = never> {
  readonly _tag: 'at';
  readonly _name: Name;
  readonly _children: Children;
  readonly _siblings: Siblings;
}

export interface WildNode<Children = never, Siblings = never> {
  readonly _tag: 'wild';
  readonly _children: Children;
  readonly _siblings: Siblings;
}

// =============================================================================
// Schema Builder Interfaces
// =============================================================================

export interface AtBuilder<Name extends string, Children, Siblings> extends AtNode<Name, Children, Siblings> {
  at<N extends string>(name: N): AtBuilder<Name, Children, Siblings | AtNode<N>>;
  at<N extends string, C>(name: N, child: () => C): AtBuilder<Name, Children, Siblings | AtNode<N, C>>;
}

export interface WildBuilder<Children, Siblings> extends WildNode<Children, Siblings> {
  at<N extends string>(name: N): WildBuilder<Children, Siblings | AtNode<N>>;
  at<N extends string, C>(name: N, child: () => C): WildBuilder<Children, Siblings | AtNode<N, C>>;
}

// =============================================================================
// Runtime Implementation
// =============================================================================

function createAtBuilder<Name extends string, Children, Siblings>(
  name: Name,
  children: Children,
  siblings: Siblings
): AtBuilder<Name, Children, Siblings> {
  return {
    _tag: 'at',
    _name: name,
    _children: children,
    _siblings: siblings,
    at: ((n: string, child?: () => unknown) => {
      const childValue = child ? child() : undefined;
      const newSibling = child
        ? { _tag: 'at' as const, _name: n, _children: childValue, _siblings: undefined as never }
        : { _tag: 'at' as const, _name: n, _children: undefined as never, _siblings: undefined as never };
      const mergedSiblings = siblings ? { ...siblings as object, [n]: newSibling } : { [n]: newSibling };
      return createAtBuilder(name, children, mergedSiblings as any);
    }) as AtBuilder<Name, Children, Siblings>['at'],
  };
}

function createWildBuilder<Children, Siblings>(
  children: Children,
  siblings: Siblings
): WildBuilder<Children, Siblings> {
  return {
    _tag: 'wild',
    _children: children,
    _siblings: siblings,
    at: ((n: string, child?: () => unknown) => {
      const childValue = child ? child() : undefined;
      const newSibling = child
        ? { _tag: 'at' as const, _name: n, _children: childValue, _siblings: undefined as never }
        : { _tag: 'at' as const, _name: n, _children: undefined as never, _siblings: undefined as never };
      const mergedSiblings = siblings ? { ...siblings as object, [n]: newSibling } : { [n]: newSibling };
      return createWildBuilder(children, mergedSiblings as any);
    }) as WildBuilder<Children, Siblings>['at'],
  };
}

// =============================================================================
// Public API
// =============================================================================

export function at<N extends string>(name: N): AtBuilder<N, never, never>;
export function at<N extends string, C>(name: N, child: () => C): AtBuilder<N, C, never>;
export function at<N extends string, C>(name: N, child?: () => C): AtBuilder<N, C, never> {
  const children = child ? child() : (undefined as never);
  return createAtBuilder(name, children, undefined as never);
}

export interface Wild extends WildBuilder<never, never> {
  <C>(child: () => C): WildBuilder<C, never>;
}

const wildImpl = function <C>(child?: () => C): WildBuilder<C, never> {
  const children = child ? child() : (undefined as never);
  return createWildBuilder(children, undefined as never);
} as Wild;

export const wild: Wild = Object.assign(wildImpl, {
  _tag: 'wild' as const,
  _children: undefined as never,
  _siblings: undefined as never,
  at: ((n: string, child?: () => unknown) => {
    const childValue = child ? child() : undefined;
    const newSibling = child
      ? { _tag: 'at' as const, _name: n, _children: childValue, _siblings: undefined as never }
      : { _tag: 'at' as const, _name: n, _children: undefined as never, _siblings: undefined as never };
    return createWildBuilder(undefined as never, { [n]: newSibling } as any);
  }) as WildBuilder<never, never>['at'],
});
```

**Step 4: Run test**

Run: `pnpm vitest run src/schema.test.ts`
Expected: PASS

**Step 5: Add comprehensive tests**

```typescript
// Add to src/schema.test.ts

it('at() with children', () => {
  const schema = at('posts', () => wild);
  expect(schema._tag).toBe('at');
  expect(schema._children._tag).toBe('wild');
});

it('wild as terminal value', () => {
  expect(wild._tag).toBe('wild');
});

it('wild() with children', () => {
  const schema = wild(() => at('comments'));
  expect(schema._tag).toBe('wild');
  expect(schema._children._tag).toBe('at');
});

it('chaining at() for siblings', () => {
  const schema = at('posts').at('users');
  expect(schema._tag).toBe('at');
  expect(schema._name).toBe('posts');
});

it('complex nested schema', () => {
  const schema = at('posts', () =>
    wild(() => at('comments', () => wild)).at('settings')
  ).at('history');
  expect(schema._tag).toBe('at');
  expect(schema._name).toBe('posts');
});
```

**Step 6: Run all schema tests**

Run: `pnpm vitest run src/schema.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/schema.ts src/schema.test.ts
git commit -m "feat: add schema builders (at, wild)"
```

---

## Task 2: Query Cache Types

**Files:**
- Create: `src/query-cache-types.ts`

**Step 1: Write types file**

```typescript
// src/query-cache-types.ts
import type { AtNode, WildNode, AtBuilder, WildBuilder } from './schema.js';

// =============================================================================
// Tag Type
// =============================================================================

declare const TAG_BRAND: unique symbol;

/** A typed tag representing a cache invalidation path */
export interface TypedTag {
  readonly [TAG_BRAND]: true;
  /** The path segments (e.g., ['posts', '123', 'comments']) */
  readonly __path: string[];
}

// =============================================================================
// Schema to Tags Type Transformation
// =============================================================================

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

type SiblingsToTags<S> = [S] extends [never] ? {} : UnionToIntersection<SchemaToTagsSingle<S>>;

type SchemaToTagsSingle<S> = S extends AtBuilder<infer Name, infer Children, infer Siblings>
  ? { readonly [K in Name]: TagBranch<Children> } & SiblingsToTags<Siblings>
  : S extends AtNode<infer Name, infer Children, infer Siblings>
  ? { readonly [K in Name]: TagBranch<Children> } & SiblingsToTags<Siblings>
  : S extends WildBuilder<infer Children, infer Siblings>
  ? ((id: string) => TagBranch<Children>) & SiblingsToTags<Siblings>
  : S extends WildNode<infer Children, infer Siblings>
  ? ((id: string) => TagBranch<Children>) & SiblingsToTags<Siblings>
  : {};

export type SchemaToTags<S> = UnionToIntersection<SchemaToTagsSingle<S>>;

type TagBranch<Children> = [Children] extends [never]
  ? TypedTag
  : Children extends AtBuilder<infer Name, infer C, infer S>
  ? { readonly [K in Name]: TagBranch<C> } & SiblingsToTags<S> & TypedTag
  : Children extends AtNode<infer Name, infer C, infer S>
  ? { readonly [K in Name]: TagBranch<C> } & SiblingsToTags<S> & TypedTag
  : Children extends WildBuilder<infer C, infer S>
  ? ((id: string) => TagBranch<C>) & SiblingsToTags<S> & TypedTag
  : Children extends WildNode<infer C, infer S>
  ? ((id: string) => TagBranch<C>) & SiblingsToTags<S> & TypedTag
  : TypedTag;

// =============================================================================
// Query Definition Types
// =============================================================================

export interface TypedQueryDef<T> {
  tags: TypedTag[];
  fn: () => Promise<T>;
  ttl?: string | number;
  grace?: string | number | false;
}

export type QueryRecord = Record<string, (...args: any[]) => TypedQueryDef<any>>;

export type QueriesToMethods<Q extends QueryRecord> = {
  readonly [K in keyof Q]: Q[K] extends (...args: infer A) => TypedQueryDef<infer T>
    ? (...args: A) => Promise<T>
    : never;
};
```

**Step 2: Commit**

```bash
git add src/query-cache-types.ts
git commit -m "feat: add query cache type definitions"
```

---

## Task 3: Extract CacheEngine from T87s

**Files:**
- Create: `src/cache-engine.ts`
- Test: `src/cache-engine.test.ts`

This is the critical task. We extract ALL logic from T87s into CacheEngine.

**Step 1: Write failing test**

```typescript
// src/cache-engine.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheEngine } from './cache-engine.js';
import { MemoryAdapter } from './adapters/index.js';

describe('CacheEngine', () => {
  let adapter: MemoryAdapter;
  let engine: CacheEngine;

  beforeEach(() => {
    adapter = new MemoryAdapter();
    engine = new CacheEngine({ adapter });
  });

  it('creates engine with adapter', () => {
    expect(engine).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/cache-engine.test.ts`
Expected: FAIL - Cannot find module

**Step 3: Write CacheEngine implementation**

Copy all logic from `client.ts` (T87s class) into CacheEngine, but expose lower-level methods.

```typescript
// src/cache-engine.ts
import type { StorageAdapter, CacheEntry } from './types.js';
import { parseDuration, type Duration } from './duration.js';

export interface CacheEngineOptions {
  adapter: StorageAdapter;
  prefix?: string;
  defaultTtl?: Duration;
  defaultGrace?: Duration | false;
  verifyPercent?: number;
}

export interface QueryOptions<T> {
  key: string;
  tags: string[][];
  fn: () => Promise<T>;
  ttl?: Duration;
  grace?: Duration | false;
}

const DEFAULT_TTL = '30s';

function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class CacheEngine {
  private adapter: StorageAdapter;
  private prefix: string;
  private defaultTtl: number;
  private defaultGrace: number | false;
  private verifyPercent: number;
  private inFlight = new Map<string, Promise<unknown>>();

  constructor(options: CacheEngineOptions) {
    this.adapter = options.adapter;
    this.prefix = options.prefix ?? 't87s';
    this.defaultTtl = parseDuration(options.defaultTtl ?? DEFAULT_TTL);
    this.defaultGrace =
      options.defaultGrace === undefined || options.defaultGrace === false
        ? false
        : parseDuration(options.defaultGrace);
    this.verifyPercent = options.verifyPercent ?? 0.1;
    if (this.verifyPercent < 0 || this.verifyPercent > 1) {
      throw new Error('verifyPercent must be between 0 and 1');
    }
  }

  /**
   * Execute a cached query with stampede protection, TTL, and grace.
   */
  async query<T>(options: QueryOptions<T>): Promise<T> {
    const cacheKey = `${this.prefix}:${options.key}`;

    // Stampede protection
    const inFlight = this.inFlight.get(cacheKey);
    if (inFlight) {
      return inFlight as Promise<T>;
    }

    const promise = this.getOrFetch<T>(cacheKey, options);
    this.inFlight.set(cacheKey, promise);

    try {
      return await promise;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  /**
   * Invalidate tags (hierarchical by default, exact if specified).
   */
  async invalidate(tags: string[][], exact = false): Promise<void> {
    const now = Date.now();
    for (const tag of tags) {
      if (exact) {
        const exactTag = [...tag, '__exact__'];
        await this.adapter.setTagInvalidationTime(exactTag, now);
      } else {
        await this.adapter.setTagInvalidationTime(tag, now);
      }
    }
  }

  /**
   * Clear all cached data.
   */
  async clear(): Promise<void> {
    await this.adapter.clear();
  }

  /**
   * Disconnect the adapter.
   */
  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
  }

  // =========================================================================
  // Private methods (ported from T87s)
  // =========================================================================

  private async isEntryStale(entry: CacheEntry<unknown>): Promise<boolean> {
    for (const entryTag of entry.tags) {
      // Check exact invalidation
      const exactTag = [...entryTag, '__exact__'];
      const exactInvalidation = await this.adapter.getTagInvalidationTime(exactTag);
      if (exactInvalidation !== null && exactInvalidation >= entry.createdAt) {
        return true;
      }

      // Check prefix invalidations (hierarchical)
      for (let len = 1; len <= entryTag.length; len++) {
        const prefix = entryTag.slice(0, len);
        const invalidation = await this.adapter.getTagInvalidationTime(prefix);
        if (invalidation !== null && invalidation >= entry.createdAt) {
          return true;
        }
      }
    }
    return false;
  }

  private shouldVerify(): boolean {
    if (!this.adapter.reportVerification) return false;
    if (this.verifyPercent <= 0) return false;
    if (this.verifyPercent >= 1) return true;
    return Math.random() < this.verifyPercent;
  }

  private async runVerification<T>(
    cacheKey: string,
    fn: () => Promise<T>,
    cachedValue: T
  ): Promise<void> {
    try {
      const freshValue = await fn();
      const cachedHash = simpleHash(JSON.stringify(cachedValue));
      const freshHash = simpleHash(JSON.stringify(freshValue));
      const isStale = cachedHash !== freshHash;
      await this.adapter.reportVerification!(cacheKey, isStale, cachedHash, freshHash);
    } catch {
      // Silently ignore verification errors
    }
  }

  private async getOrFetch<T>(cacheKey: string, options: QueryOptions<T>): Promise<T> {
    const now = Date.now();

    const cached = await this.adapter.get<T>(cacheKey);
    if (cached) {
      const isStale = await this.isEntryStale(cached);

      if (!isStale && cached.expiresAt > now) {
        // Fresh hit
        if (this.shouldVerify()) {
          this.runVerification(cacheKey, options.fn, cached.value).catch(() => {});
        }
        return cached.value;
      }

      // Check grace period (SWR)
      if (cached.graceUntil !== null && cached.graceUntil > now) {
        this.refreshInBackground(cacheKey, options);
        return cached.value;
      }
    }

    return await this.fetchAndCache(cacheKey, options, cached ?? undefined);
  }

  private async fetchAndCache<T>(
    cacheKey: string,
    options: QueryOptions<T>,
    staleEntry?: CacheEntry<T>
  ): Promise<T> {
    const ttl = parseDuration(options.ttl ?? this.defaultTtl);
    const grace =
      options.grace === false || options.grace === undefined
        ? this.defaultGrace
        : parseDuration(options.grace);
    const now = Date.now();

    try {
      const value = await options.fn();

      const entry: CacheEntry<T> = {
        value,
        tags: options.tags,
        createdAt: now,
        expiresAt: now + ttl,
        graceUntil: grace === false ? null : now + ttl + grace,
      };

      await this.adapter.set(cacheKey, entry);
      return value;
    } catch (error) {
      // Error handling with grace - return stale if available
      if (staleEntry && staleEntry.graceUntil !== null && staleEntry.graceUntil > now) {
        return staleEntry.value;
      }
      throw error;
    }
  }

  private refreshInBackground<T>(cacheKey: string, options: QueryOptions<T>): void {
    this.fetchAndCache(cacheKey, options).catch(() => {
      // Ignore errors - graced value continues to be served
    });
  }
}
```

**Step 4: Run test**

Run: `pnpm vitest run src/cache-engine.test.ts`
Expected: PASS

**Step 5: Add comprehensive tests for all features**

```typescript
// Add to src/cache-engine.test.ts

describe('CacheEngine', () => {
  let adapter: MemoryAdapter;
  let engine: CacheEngine;

  beforeEach(() => {
    adapter = new MemoryAdapter();
    engine = new CacheEngine({ adapter, defaultTtl: '1m', defaultGrace: '5m' });
  });

  it('caches query results', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => ({ count: ++callCount }));

    const result1 = await engine.query({ key: 'test', tags: [['test']], fn });
    const result2 = await engine.query({ key: 'test', tags: [['test']], fn });

    expect(result1.count).toBe(1);
    expect(result2.count).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stampede protection - concurrent requests share promise', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      await new Promise(r => setTimeout(r, 50));
      return { count: ++callCount };
    });

    const [r1, r2, r3] = await Promise.all([
      engine.query({ key: 'test', tags: [['test']], fn }),
      engine.query({ key: 'test', tags: [['test']], fn }),
      engine.query({ key: 'test', tags: [['test']], fn }),
    ]);

    expect(r1.count).toBe(1);
    expect(r2.count).toBe(1);
    expect(r3.count).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('invalidates tags hierarchically', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => ({ count: ++callCount }));

    await engine.query({ key: 'post-1-comments', tags: [['posts', '1', 'comments']], fn });

    // Invalidate parent tag
    await engine.invalidate([['posts', '1']]);

    const result = await engine.query({ key: 'post-1-comments', tags: [['posts', '1', 'comments']], fn });
    expect(result.count).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('exact invalidation only affects exact tag', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => ({ count: ++callCount }));

    await engine.query({ key: 'post-1-comments', tags: [['posts', '1', 'comments']], fn });

    // Exact invalidate parent - should NOT affect child
    await engine.invalidate([['posts', '1']], true);

    const result = await engine.query({ key: 'post-1-comments', tags: [['posts', '1', 'comments']], fn });
    expect(result.count).toBe(1); // Still cached
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('grace period returns stale while refreshing', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => ({ count: ++callCount }));

    // First call
    await engine.query({ key: 'test', tags: [['test']], fn, ttl: 1, grace: 10000 });

    // Wait for TTL to expire
    await new Promise(r => setTimeout(r, 10));

    // Should return stale value (count: 1) while refreshing in background
    const result = await engine.query({ key: 'test', tags: [['test']], fn, ttl: 1, grace: 10000 });
    expect(result.count).toBe(1);

    // Wait for background refresh
    await new Promise(r => setTimeout(r, 50));

    // Now should have fresh value
    const result2 = await engine.query({ key: 'test', tags: [['test']], fn, ttl: 1, grace: 10000 });
    expect(result2.count).toBe(2);
  });

  it('error handling with grace returns stale on failure', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      if (callCount > 1) throw new Error('fail');
      return { count: callCount };
    });

    // First call succeeds
    await engine.query({ key: 'test', tags: [['test']], fn, ttl: 1, grace: 10000 });

    // Wait for TTL
    await new Promise(r => setTimeout(r, 10));

    // Invalidate to force refetch
    await engine.invalidate([['test']]);

    // Should return graced value even though fn throws
    const result = await engine.query({ key: 'test', tags: [['test']], fn, ttl: 1, grace: 10000 });
    expect(result.count).toBe(1);
  });

  it('clear() removes all data', async () => {
    const fn = vi.fn(async () => ({ data: 'test' }));

    await engine.query({ key: 'test', tags: [['test']], fn });
    expect(fn).toHaveBeenCalledTimes(1);

    await engine.clear();

    await engine.query({ key: 'test', tags: [['test']], fn });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
```

**Step 6: Run all tests**

Run: `pnpm vitest run src/cache-engine.test.ts`
Expected: PASS (may need iteration)

**Step 7: Commit**

```bash
git add src/cache-engine.ts src/cache-engine.test.ts
git commit -m "feat: extract CacheEngine from T87s with all features"
```

---

## Task 4: Tag Builder Runtime

**Files:**
- Create: `src/tag-builder.ts`
- Test: `src/tag-builder.test.ts`

**Step 1: Write failing test**

```typescript
// src/tag-builder.test.ts
import { describe, it, expect } from 'vitest';
import { at, wild } from './schema.js';
import { createTagBuilder } from './tag-builder.js';

describe('tag builder', () => {
  it('creates tags from simple schema', () => {
    const schema = at('posts');
    const tags = createTagBuilder(schema);
    expect(tags.posts.__path).toEqual(['posts']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/tag-builder.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/tag-builder.ts
import type { AtNode, WildNode, AtBuilder, WildBuilder } from './schema.js';
import type { TypedTag, SchemaToTags } from './query-cache-types.js';

declare const TAG_BRAND: unique symbol;

function createTag(path: string[]): TypedTag {
  return {
    [TAG_BRAND]: true as const,
    __path: path,
  } as TypedTag;
}

type SchemaNode = AtBuilder<string, any, any> | AtNode<string, any, any> | WildBuilder<any, any> | WildNode<any, any>;

function buildTagsFromAt(schema: AtNode<string, any, any> | AtBuilder<string, any, any>, currentPath: string[]): any {
  const path = [...currentPath, schema._name];
  const tag = createTag(path);

  let childTags = {};
  if (schema._children && typeof schema._children === 'object' && '_tag' in schema._children) {
    if (schema._children._tag === 'at') {
      childTags = buildTagsFromAt(schema._children, path);
    } else if (schema._children._tag === 'wild') {
      childTags = buildTagsFromWild(schema._children, path);
    }
  }

  let siblingTags = {};
  if (schema._siblings && typeof schema._siblings === 'object') {
    siblingTags = buildSiblings(schema._siblings, currentPath);
  }

  return {
    [schema._name]: Object.assign(tag, childTags),
    ...siblingTags,
  };
}

function buildTagsFromWild(schema: WildNode<any, any> | WildBuilder<any, any>, currentPath: string[]): any {
  const wildFn = (id: string) => {
    const path = [...currentPath, id];
    const tag = createTag(path);

    let childTags = {};
    if (schema._children && typeof schema._children === 'object' && '_tag' in schema._children) {
      if (schema._children._tag === 'at') {
        childTags = buildTagsFromAt(schema._children, path);
      } else if (schema._children._tag === 'wild') {
        childTags = buildTagsFromWild(schema._children, path);
      }
    }

    return Object.assign(tag, childTags);
  };

  // Make the function itself also a tag (for the path without ID)
  Object.assign(wildFn, createTag(currentPath));

  let siblingTags = {};
  if (schema._siblings && typeof schema._siblings === 'object') {
    siblingTags = buildSiblings(schema._siblings, currentPath);
  }

  return Object.assign(wildFn, siblingTags);
}

function buildSiblings(siblings: any, currentPath: string[]): any {
  const result: any = {};

  for (const [key, value] of Object.entries(siblings)) {
    if (value && typeof value === 'object' && '_tag' in value) {
      const node = value as SchemaNode;
      if (node._tag === 'at') {
        Object.assign(result, buildTagsFromAt(node as AtNode<string, any, any>, currentPath));
      } else if (node._tag === 'wild') {
        Object.assign(result, buildTagsFromWild(node as WildNode<any, any>, currentPath));
      }
    }
  }

  return result;
}

export function createTagBuilder<S>(schema: S): SchemaToTags<S> {
  const s = schema as unknown as SchemaNode;
  if (s._tag === 'at') {
    return buildTagsFromAt(s as AtNode<string, any, any>, []) as SchemaToTags<S>;
  } else if (s._tag === 'wild') {
    return buildTagsFromWild(s as WildNode<any, any>, []) as SchemaToTags<S>;
  }
  return {} as SchemaToTags<S>;
}
```

**Step 4: Run test**

Run: `pnpm vitest run src/tag-builder.test.ts`
Expected: PASS

**Step 5: Add comprehensive tests**

```typescript
// Add to src/tag-builder.test.ts

it('creates tags with wild children', () => {
  const schema = at('posts', () => wild);
  const tags = createTagBuilder(schema);

  expect(tags.posts.__path).toEqual(['posts']);
  expect(tags.posts('123').__path).toEqual(['posts', '123']);
});

it('creates tags with deeply nested structure', () => {
  const schema = at('posts', () => wild(() => at('comments', () => wild)));
  const tags = createTagBuilder(schema);

  expect(tags.posts.__path).toEqual(['posts']);
  expect(tags.posts('p1').__path).toEqual(['posts', 'p1']);
  expect(tags.posts('p1').comments.__path).toEqual(['posts', 'p1', 'comments']);
  expect(tags.posts('p1').comments('c1').__path).toEqual(['posts', 'p1', 'comments', 'c1']);
});

it('creates tags with siblings', () => {
  const schema = at('posts').at('users').at('settings');
  const tags = createTagBuilder(schema);

  expect(tags.posts.__path).toEqual(['posts']);
  expect(tags.users.__path).toEqual(['users']);
  expect(tags.settings.__path).toEqual(['settings']);
});

it('creates tags with mixed children and siblings', () => {
  const schema = at('posts', () =>
    wild(() => at('comments', () => wild)).at('settings')
  ).at('history');

  const tags = createTagBuilder(schema);

  expect(tags.posts.__path).toEqual(['posts']);
  expect(tags.posts('p1').__path).toEqual(['posts', 'p1']);
  expect(tags.posts('p1').comments.__path).toEqual(['posts', 'p1', 'comments']);
  expect(tags.posts('p1').comments('c1').__path).toEqual(['posts', 'p1', 'comments', 'c1']);
  expect(tags.posts.settings.__path).toEqual(['posts', 'settings']);
  expect(tags.history.__path).toEqual(['history']);
});
```

**Step 6: Run tests**

Run: `pnpm vitest run src/tag-builder.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/tag-builder.ts src/tag-builder.test.ts
git commit -m "feat: add tag builder runtime"
```

---

## Task 5: Primitives API

**Files:**
- Create: `src/primitives.ts`
- Test: `src/primitives.test.ts`

**Step 1: Write failing test**

```typescript
// src/primitives.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createPrimitives } from './primitives.js';
import { MemoryAdapter } from './adapters/index.js';

describe('Primitives', () => {
  it('exposes get/set/del/invalidate', async () => {
    const adapter = new MemoryAdapter();
    const primitives = createPrimitives({ adapter });

    expect(primitives.get).toBeDefined();
    expect(primitives.set).toBeDefined();
    expect(primitives.del).toBeDefined();
    expect(primitives.invalidate).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/primitives.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/primitives.ts
import type { StorageAdapter, CacheEntry } from './types.js';
import { parseDuration, type Duration } from './duration.js';

export interface PrimitivesOptions {
  adapter: StorageAdapter;
  prefix?: string;
}

export interface SetOptions {
  tags: string[][];
  ttl: Duration;
  grace?: Duration | false;
}

export interface Primitives {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options: SetOptions): Promise<void>;
  del(key: string): Promise<void>;
  invalidate(tags: string[][], exact?: boolean): Promise<void>;
  clear(): Promise<void>;
  disconnect(): Promise<void>;
}

export function createPrimitives(options: PrimitivesOptions): Primitives {
  const adapter = options.adapter;
  const prefix = options.prefix ?? 't87s';

  const prefixKey = (key: string) => `${prefix}:${key}`;

  return {
    async get<T>(key: string): Promise<T | null> {
      const entry = await adapter.get<T>(prefixKey(key));
      if (!entry) return null;

      const now = Date.now();

      // Check if expired
      if (entry.expiresAt <= now) {
        // Check grace
        if (entry.graceUntil === null || entry.graceUntil <= now) {
          return null;
        }
      }

      // Check tag invalidation
      for (const tag of entry.tags) {
        for (let len = 1; len <= tag.length; len++) {
          const prefix = tag.slice(0, len);
          const invalidation = await adapter.getTagInvalidationTime(prefix);
          if (invalidation !== null && invalidation >= entry.createdAt) {
            return null;
          }
        }
        // Check exact
        const exactTag = [...tag, '__exact__'];
        const exactInvalidation = await adapter.getTagInvalidationTime(exactTag);
        if (exactInvalidation !== null && exactInvalidation >= entry.createdAt) {
          return null;
        }
      }

      return entry.value;
    },

    async set<T>(key: string, value: T, setOptions: SetOptions): Promise<void> {
      const ttl = parseDuration(setOptions.ttl);
      const grace = setOptions.grace === false ? false : parseDuration(setOptions.grace ?? '0');
      const now = Date.now();

      const entry: CacheEntry<T> = {
        value,
        tags: setOptions.tags,
        createdAt: now,
        expiresAt: now + ttl,
        graceUntil: grace === false ? null : now + ttl + grace,
      };

      await adapter.set(prefixKey(key), entry);
    },

    async del(key: string): Promise<void> {
      await adapter.delete(prefixKey(key));
    },

    async invalidate(tags: string[][], exact = false): Promise<void> {
      const now = Date.now();
      for (const tag of tags) {
        if (exact) {
          const exactTag = [...tag, '__exact__'];
          await adapter.setTagInvalidationTime(exactTag, now);
        } else {
          await adapter.setTagInvalidationTime(tag, now);
        }
      }
    },

    async clear(): Promise<void> {
      await adapter.clear();
    },

    async disconnect(): Promise<void> {
      await adapter.disconnect();
    },
  };
}
```

**Step 4: Run test**

Run: `pnpm vitest run src/primitives.test.ts`
Expected: PASS

**Step 5: Add comprehensive tests**

```typescript
// Add to src/primitives.test.ts

describe('Primitives', () => {
  let adapter: MemoryAdapter;
  let primitives: ReturnType<typeof createPrimitives>;

  beforeEach(() => {
    adapter = new MemoryAdapter();
    primitives = createPrimitives({ adapter });
  });

  it('set and get value', async () => {
    await primitives.set('key1', { foo: 'bar' }, { tags: [['test']], ttl: '1m' });
    const result = await primitives.get<{ foo: string }>('key1');
    expect(result).toEqual({ foo: 'bar' });
  });

  it('returns null for missing key', async () => {
    const result = await primitives.get('nonexistent');
    expect(result).toBeNull();
  });

  it('del removes value', async () => {
    await primitives.set('key1', { foo: 'bar' }, { tags: [['test']], ttl: '1m' });
    await primitives.del('key1');
    const result = await primitives.get('key1');
    expect(result).toBeNull();
  });

  it('invalidate makes value return null', async () => {
    await primitives.set('key1', { foo: 'bar' }, { tags: [['posts', '1']], ttl: '1m' });
    await primitives.invalidate([['posts', '1']]);
    const result = await primitives.get('key1');
    expect(result).toBeNull();
  });

  it('hierarchical invalidation', async () => {
    await primitives.set('key1', { foo: 'bar' }, { tags: [['posts', '1', 'comments']], ttl: '1m' });
    await primitives.invalidate([['posts', '1']]); // Parent tag
    const result = await primitives.get('key1');
    expect(result).toBeNull();
  });

  it('exact invalidation does not affect children', async () => {
    await primitives.set('key1', { foo: 'bar' }, { tags: [['posts', '1', 'comments']], ttl: '1m' });
    await primitives.invalidate([['posts', '1']], true); // Exact
    const result = await primitives.get('key1');
    expect(result).toEqual({ foo: 'bar' }); // Still there
  });

  it('respects TTL expiration', async () => {
    await primitives.set('key1', { foo: 'bar' }, { tags: [['test']], ttl: 1 }); // 1ms
    await new Promise(r => setTimeout(r, 10));
    const result = await primitives.get('key1');
    expect(result).toBeNull();
  });

  it('grace period extends availability', async () => {
    await primitives.set('key1', { foo: 'bar' }, { tags: [['test']], ttl: 1, grace: 10000 });
    await new Promise(r => setTimeout(r, 10));
    const result = await primitives.get('key1');
    expect(result).toEqual({ foo: 'bar' }); // Still available in grace
  });
});
```

**Step 6: Run tests**

Run: `pnpm vitest run src/primitives.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/primitives.ts src/primitives.test.ts
git commit -m "feat: add primitives API (get/set/del/invalidate)"
```

---

## Task 6: QueryCache Class

**Files:**
- Create: `src/query-cache.ts`
- Test: `src/query-cache.test.ts`

**Step 1: Write failing test**

```typescript
// src/query-cache.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryCache } from './query-cache.js';
import { at, wild } from './schema.js';
import { MemoryAdapter } from './adapters/index.js';

describe('QueryCache', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  it('creates cache from schema', () => {
    const schema = at('posts', () => wild);
    const cache = new QueryCache(schema, { adapter });
    expect(cache.tags.posts.__path).toEqual(['posts']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/query-cache.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/query-cache.ts
import type { StorageAdapter } from './types.js';
import type { Duration } from './duration.js';
import type { SchemaToTags, TypedQueryDef, QueryRecord, QueriesToMethods, TypedTag } from './query-cache-types.js';
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
    const methods: Record<string, (...args: any[]) => Promise<any>> = {};

    for (const [name, queryFn] of Object.entries(queryDefs)) {
      methods[name] = async (...args: unknown[]) => {
        const def = queryFn(...args);
        return this.engine.query({
          key: `${name}:${JSON.stringify(args)}`,
          tags: def.tags.map(t => (t as TypedTag).__path),
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
      invalidate: async (tag: TypedTag, exact = false) => {
        await this.engine.invalidate([(tag as TypedTag).__path], exact);
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
```

**Step 4: Run test**

Run: `pnpm vitest run src/query-cache.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/query-cache.ts src/query-cache.test.ts
git commit -m "feat: add QueryCache class"
```

---

## Task 7: QueryCache Full Tests

**Files:**
- Modify: `src/query-cache.test.ts`

**Step 1: Add comprehensive tests**

```typescript
// Replace src/query-cache.test.ts with comprehensive tests

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryCache } from './query-cache.js';
import { at, wild } from './schema.js';
import { MemoryAdapter } from './adapters/index.js';

describe('QueryCache', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  describe('construction', () => {
    it('creates cache from schema', () => {
      const schema = at('posts', () => wild);
      const cache = new QueryCache(schema, { adapter });
      expect(cache.tags.posts.__path).toEqual(['posts']);
    });

    it('exposes primitives', () => {
      const schema = at('posts');
      const cache = new QueryCache(schema, { adapter });
      expect(cache.primitives).toBeDefined();
      expect(cache.primitives.get).toBeDefined();
    });
  });

  describe('queries', () => {
    it('defines and executes queries', async () => {
      const schema = at('posts', () => wild);
      const cache = new QueryCache(schema, { adapter });

      const fetchPost = vi.fn().mockResolvedValue({ id: '1', title: 'Test' });

      const client = cache.queries((tags) => ({
        getPost: (postId: string) => ({
          tags: [tags.posts(postId)],
          fn: () => fetchPost(postId),
        }),
      }));

      const result = await client.getPost('123');
      expect(result).toEqual({ id: '1', title: 'Test' });
      expect(fetchPost).toHaveBeenCalledWith('123');
    });

    it('caches query results', async () => {
      const schema = at('posts', () => wild);
      const cache = new QueryCache(schema, { adapter });

      const fetchPost = vi.fn().mockResolvedValue({ id: '1' });

      const client = cache.queries((tags) => ({
        getPost: (postId: string) => ({
          tags: [tags.posts(postId)],
          fn: () => fetchPost(postId),
        }),
      }));

      await client.getPost('123');
      await client.getPost('123');
      expect(fetchPost).toHaveBeenCalledTimes(1);
    });

    it('different args are different cache entries', async () => {
      const schema = at('posts', () => wild);
      const cache = new QueryCache(schema, { adapter });

      const fetchPost = vi.fn().mockImplementation((id) => Promise.resolve({ id }));

      const client = cache.queries((tags) => ({
        getPost: (postId: string) => ({
          tags: [tags.posts(postId)],
          fn: () => fetchPost(postId),
        }),
      }));

      await client.getPost('1');
      await client.getPost('2');
      expect(fetchPost).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidation', () => {
    it('invalidates by tag', async () => {
      const schema = at('posts', () => wild);
      const cache = new QueryCache(schema, { adapter });

      let count = 0;
      const fetchPost = vi.fn().mockImplementation(() =>
        Promise.resolve({ count: ++count })
      );

      const client = cache.queries((tags) => ({
        getPost: (postId: string) => ({
          tags: [tags.posts(postId)],
          fn: () => fetchPost(postId),
        }),
      }));

      await client.getPost('123');
      await client.invalidate(client.tags.posts('123'));
      const result = await client.getPost('123');

      expect(result.count).toBe(2);
    });

    it('hierarchical invalidation', async () => {
      const schema = at('posts', () => wild(() => at('comments', () => wild)));
      const cache = new QueryCache(schema, { adapter });

      let count = 0;
      const fetchComments = vi.fn().mockImplementation(() =>
        Promise.resolve([{ count: ++count }])
      );

      const client = cache.queries((tags) => ({
        getComments: (postId: string) => ({
          tags: [tags.posts(postId).comments],
          fn: () => fetchComments(postId),
        }),
      }));

      await client.getComments('p1');

      // Invalidate parent
      await client.invalidate(client.tags.posts('p1'));

      const result = await client.getComments('p1');
      expect(result[0].count).toBe(2);
    });

    it('exact invalidation', async () => {
      const schema = at('posts', () => wild(() => at('comments', () => wild)));
      const cache = new QueryCache(schema, { adapter });

      let count = 0;
      const fetchComments = vi.fn().mockImplementation(() =>
        Promise.resolve([{ count: ++count }])
      );

      const client = cache.queries((tags) => ({
        getComments: (postId: string) => ({
          tags: [tags.posts(postId).comments],
          fn: () => fetchComments(postId),
        }),
      }));

      await client.getComments('p1');

      // Exact invalidate parent - should NOT affect child
      await client.invalidate(client.tags.posts('p1'), true);

      const result = await client.getComments('p1');
      expect(result[0].count).toBe(1); // Still cached
    });
  });

  describe('client utilities', () => {
    it('exposes tags on client', () => {
      const schema = at('posts', () => wild).at('users');
      const cache = new QueryCache(schema, { adapter });

      const client = cache.queries(() => ({}));

      expect(client.tags.posts.__path).toEqual(['posts']);
      expect(client.tags.users.__path).toEqual(['users']);
    });

    it('exposes primitives on client', () => {
      const schema = at('posts');
      const cache = new QueryCache(schema, { adapter });
      const client = cache.queries(() => ({}));

      expect(client.primitives.get).toBeDefined();
      expect(client.primitives.set).toBeDefined();
    });

    it('clear removes all cached data', async () => {
      const schema = at('posts', () => wild);
      const cache = new QueryCache(schema, { adapter });

      const fetchPost = vi.fn().mockResolvedValue({ id: '1' });

      const client = cache.queries((tags) => ({
        getPost: (postId: string) => ({
          tags: [tags.posts(postId)],
          fn: () => fetchPost(postId),
        }),
      }));

      await client.getPost('123');
      await client.clear();
      await client.getPost('123');

      expect(fetchPost).toHaveBeenCalledTimes(2);
    });
  });
});
```

**Step 2: Run tests**

Run: `pnpm vitest run src/query-cache.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/query-cache.test.ts
git commit -m "test: comprehensive QueryCache tests"
```

---

## Task 8: Type Safety Tests

**Files:**
- Create: `src/query-cache-types.test.ts`

**Step 1: Write type-level tests**

```typescript
// src/query-cache-types.test.ts
import { describe, it, expect } from 'vitest';
import { at, wild } from './schema.js';
import { QueryCache } from './query-cache.js';
import { MemoryAdapter } from './adapters/index.js';
import type { TypedTag } from './query-cache-types.js';

describe('QueryCache type safety', () => {
  it('allows valid tag paths', () => {
    const schema = at('posts', () => wild(() => at('comments', () => wild)));
    const cache = new QueryCache(schema, { adapter: new MemoryAdapter() });

    const client = cache.queries((tags) => ({
      getPost: (postId: string) => ({
        tags: [tags.posts(postId)],
        fn: async () => ({ id: postId }),
      }),
    }));

    // These should compile
    const _t1: TypedTag = client.tags.posts;
    const _t2: TypedTag = client.tags.posts('123');
    const _t3: TypedTag = client.tags.posts('123').comments;
    const _t4: TypedTag = client.tags.posts('123').comments('456');

    expect(true).toBe(true);
  });

  it('rejects invalid paths', () => {
    const schema = at('posts', () => wild);
    const cache = new QueryCache(schema, { adapter: new MemoryAdapter() });

    cache.queries((tags) => ({
      badQuery: () => ({
        // @ts-expect-error - 'users' does not exist
        tags: [tags.users],
        fn: async () => ({}),
      }),
    }));

    expect(true).toBe(true);
  });

  it('rejects missing wild segment', () => {
    const schema = at('posts', () => wild(() => at('comments')));
    const cache = new QueryCache(schema, { adapter: new MemoryAdapter() });

    cache.queries((tags) => ({
      badQuery: () => ({
        // @ts-expect-error - missing postId
        tags: [tags.posts.comments],
        fn: async () => ({}),
      }),
    }));

    expect(true).toBe(true);
  });

  it('rejects calling non-wild', () => {
    const schema = at('posts').at('settings');
    const cache = new QueryCache(schema, { adapter: new MemoryAdapter() });

    cache.queries((tags) => ({
      badQuery: () => ({
        // @ts-expect-error - settings is not callable
        tags: [tags.settings('123')],
        fn: async () => ({}),
      }),
    }));

    expect(true).toBe(true);
  });
});
```

**Step 2: Run tests**

Run: `pnpm vitest run src/query-cache-types.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/query-cache-types.test.ts
git commit -m "test: type safety tests"
```

---

## Task 9: Update Exports

**Files:**
- Modify: `src/index.ts`

**Step 1: Update exports**

```typescript
// src/index.ts

// QueryCache (new API)
export { QueryCache, type QueryCacheOptions, type QueryCacheClient } from './query-cache.js';
export { at, wild, type AtBuilder, type WildBuilder, type AtNode, type WildNode } from './schema.js';
export type { TypedTag, TypedQueryDef, SchemaToTags } from './query-cache-types.js';

// Primitives (escape hatch)
export { createPrimitives, type Primitives, type PrimitivesOptions, type SetOptions } from './primitives.js';

// CacheEngine (advanced usage)
export { CacheEngine, type CacheEngineOptions, type QueryOptions } from './cache-engine.js';

// Tags (utilities, keep for backward compat if needed)
export { serializeTag, deserializeTag, isTagPrefix } from './tags.js';

// Adapters
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

// Types
export type {
  Tag,
  CacheEntry,
  Duration,
  StorageAdapter,
} from './types.js';

// Utilities
export { parseDuration } from './duration.js';

// =============================================================================
// DEPRECATED - Remove in next major version
// =============================================================================

// Keep T87s for backward compatibility but mark deprecated
export { T87s } from './client.js';
export { defineTags } from './tags.js';
export type { T87sOptions, QueryConfig, MutationResult } from './types.js';
```

**Step 2: Run build**

Run: `pnpm build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: update exports with new QueryCache API"
```

---

## Task 10: Integration Test

**Files:**
- Create: `src/query-cache.integration.test.ts`

**Step 1: Write integration test**

```typescript
// src/query-cache.integration.test.ts
import { describe, it, expect } from 'vitest';
import { QueryCache, at, wild, MemoryAdapter } from './index.js';

describe('QueryCache integration', () => {
  it('full workflow: define, query, invalidate, primitives', async () => {
    const schema = at('orgs', () =>
      wild(() =>
        at('members', () => wild).at('settings')
      )
    ).at('global');

    const cache = new QueryCache(schema, {
      adapter: new MemoryAdapter(),
      defaultTtl: '1m',
      defaultGrace: '5m',
    });

    const db = {
      members: new Map([
        ['org1', [{ id: 'u1', name: 'Alice' }, { id: 'u2', name: 'Bob' }]],
      ]),
      settings: new Map([['org1', { theme: 'dark' }]]),
    };

    const client = cache.queries((tags) => ({
      getMembers: (orgId: string) => ({
        tags: [tags.orgs(orgId).members],
        fn: async () => db.members.get(orgId) ?? [],
      }),
      getMember: (orgId: string, memberId: string) => ({
        tags: [tags.orgs(orgId).members(memberId)],
        fn: async () => db.members.get(orgId)?.find(m => m.id === memberId),
      }),
      getSettings: (orgId: string) => ({
        tags: [tags.orgs(orgId).settings],
        fn: async () => db.settings.get(orgId),
      }),
    }));

    // Query
    const members = await client.getMembers('org1');
    expect(members).toHaveLength(2);

    const alice = await client.getMember('org1', 'u1');
    expect(alice?.name).toBe('Alice');

    // Modify data
    db.members.set('org1', [{ id: 'u1', name: 'Alice Updated' }, { id: 'u2', name: 'Bob' }]);

    // Still cached
    expect((await client.getMember('org1', 'u1'))?.name).toBe('Alice');

    // Invalidate
    await client.invalidate(client.tags.orgs('org1').members('u1'));
    expect((await client.getMember('org1', 'u1'))?.name).toBe('Alice Updated');

    // Hierarchical invalidation
    db.settings.set('org1', { theme: 'light' });
    await client.invalidate(client.tags.orgs('org1'));
    expect((await client.getSettings('org1'))?.theme).toBe('light');

    // Primitives escape hatch
    await client.primitives.set('custom-key', { custom: true }, {
      tags: [['custom']],
      ttl: '1m',
    });
    const custom = await client.primitives.get<{ custom: boolean }>('custom-key');
    expect(custom?.custom).toBe(true);
  });
});
```

**Step 2: Run test**

Run: `pnpm vitest run src/query-cache.integration.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/query-cache.integration.test.ts
git commit -m "test: integration test for full QueryCache workflow"
```

---

## Task 11: Remove Spike File

**Step 1: Remove spike**

```bash
rm src/maximalist-types-spike.ts
```

**Step 2: Run all tests**

Run: `pnpm vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove spike file"
```

---

## Task 12: Final Verification

**Step 1: Full test suite**

Run: `pnpm test`
Expected: PASS

**Step 2: Type check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 3: Build**

Run: `pnpm build`
Expected: Success

**Step 4: Verify exports work**

```typescript
// Quick sanity check - create a test file and import
import { QueryCache, at, wild, createPrimitives, MemoryAdapter } from './dist/index.js';
```

---

## Summary

| Task | Description | New Files |
|------|-------------|-----------|
| 1 | Schema builders | schema.ts, schema.test.ts |
| 2 | Type definitions | query-cache-types.ts |
| 3 | CacheEngine (all T87s logic) | cache-engine.ts, cache-engine.test.ts |
| 4 | Tag builder runtime | tag-builder.ts, tag-builder.test.ts |
| 5 | Primitives API | primitives.ts, primitives.test.ts |
| 6-7 | QueryCache class | query-cache.ts, query-cache.test.ts |
| 8 | Type safety tests | query-cache-types.test.ts |
| 9 | Update exports | index.ts |
| 10 | Integration test | query-cache.integration.test.ts |
| 11 | Cleanup | (remove spike) |
| 12 | Final verification | - |

**Feature Preservation Checklist:**

- [x] Stampede protection → CacheEngine.query
- [x] TTL → CacheEngine.fetchAndCache
- [x] Grace/SWR → CacheEngine.getOrFetch
- [x] Hierarchical invalidation → CacheEngine.isEntryStale
- [x] Exact invalidation → CacheEngine.invalidate
- [x] Verification sampling → CacheEngine.runVerification
- [x] Error handling with grace → CacheEngine.fetchAndCache
- [x] clear() → CacheEngine.clear, QueryCacheClient.clear
- [x] disconnect() → CacheEngine.disconnect, QueryCacheClient.disconnect
- [x] Primitives escape hatch → createPrimitives, client.primitives

---

**Plan complete.** Execution options:

**1. Subagent-Driven (this session)** - Fresh subagent per task, review between tasks

**2. Parallel Session (separate)** - New session with executing-plans skill

Which approach?
