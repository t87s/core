// src/primitives.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPrimitives, type Primitives } from './primitives.js';
import { MemoryAdapter } from './adapters/index.js';

describe('Primitives', () => {
  let adapter: MemoryAdapter;
  let primitives: Primitives;

  beforeEach(() => {
    adapter = new MemoryAdapter();
    primitives = createPrimitives({ adapter });
  });

  it('exposes get/set/del/invalidate', async () => {
    expect(primitives.get).toBeDefined();
    expect(primitives.set).toBeDefined();
    expect(primitives.del).toBeDefined();
    expect(primitives.invalidate).toBeDefined();
  });

  it('exposes clear and disconnect', async () => {
    expect(primitives.clear).toBeDefined();
    expect(primitives.disconnect).toBeDefined();
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

  it('exact invalidation only affects exact match', async () => {
    await primitives.set('key1', { foo: 'bar' }, { tags: [['posts', '1']], ttl: '1m' });
    await primitives.invalidate([['posts', '1']], true); // Exact
    const result = await primitives.get('key1');
    expect(result).toBeNull(); // Exact match, so invalidated
  });

  it('respects TTL expiration', async () => {
    await primitives.set('key1', { foo: 'bar' }, { tags: [['test']], ttl: 1 }); // 1ms
    await new Promise((r) => setTimeout(r, 10));
    const result = await primitives.get('key1');
    expect(result).toBeNull();
  });

  it('grace period extends availability', async () => {
    await primitives.set('key1', { foo: 'bar' }, { tags: [['test']], ttl: 1, grace: 10000 });
    await new Promise((r) => setTimeout(r, 10));
    const result = await primitives.get('key1');
    expect(result).toEqual({ foo: 'bar' }); // Still available in grace
  });

  it('grace: false means no grace period', async () => {
    await primitives.set('key1', { foo: 'bar' }, { tags: [['test']], ttl: 1, grace: false });
    await new Promise((r) => setTimeout(r, 10));
    const result = await primitives.get('key1');
    expect(result).toBeNull();
  });

  it('clear removes all values', async () => {
    await primitives.set('key1', { foo: 'bar' }, { tags: [['test']], ttl: '1m' });
    await primitives.set('key2', { baz: 'qux' }, { tags: [['test']], ttl: '1m' });
    await primitives.clear();
    const result1 = await primitives.get('key1');
    const result2 = await primitives.get('key2');
    expect(result1).toBeNull();
    expect(result2).toBeNull();
  });

  it('uses custom prefix', async () => {
    const customPrimitives = createPrimitives({ adapter, prefix: 'myapp' });
    await customPrimitives.set('key1', { foo: 'bar' }, { tags: [['test']], ttl: '1m' });
    const result = await customPrimitives.get<{ foo: string }>('key1');
    expect(result).toEqual({ foo: 'bar' });

    // Different prefix should not find it
    const otherPrimitives = createPrimitives({ adapter, prefix: 'other' });
    const otherResult = await otherPrimitives.get('key1');
    expect(otherResult).toBeNull();
  });

  it('supports multiple tags on a single entry', async () => {
    await primitives.set(
      'key1',
      { foo: 'bar' },
      {
        tags: [
          ['posts', '1'],
          ['users', '42'],
        ],
        ttl: '1m',
      }
    );

    // Invalidating either tag should invalidate the entry
    await primitives.invalidate([['users', '42']]);
    const result = await primitives.get('key1');
    expect(result).toBeNull();
  });

  it('invalidating one tag leaves others unaffected', async () => {
    await primitives.set('key1', { foo: 'bar' }, { tags: [['posts', '1']], ttl: '1m' });
    await primitives.set('key2', { baz: 'qux' }, { tags: [['users', '42']], ttl: '1m' });

    await primitives.invalidate([['posts', '1']]);

    const result1 = await primitives.get('key1');
    const result2 = await primitives.get<{ baz: string }>('key2');

    expect(result1).toBeNull();
    expect(result2).toEqual({ baz: 'qux' });
  });

  it('supports string TTL formats', async () => {
    // Test seconds
    await primitives.set('key1', { foo: 'bar' }, { tags: [['test']], ttl: '30s' });
    const result1 = await primitives.get<{ foo: string }>('key1');
    expect(result1).toEqual({ foo: 'bar' });

    // Test minutes
    await primitives.set('key2', { baz: 'qux' }, { tags: [['test']], ttl: '5m' });
    const result2 = await primitives.get<{ baz: string }>('key2');
    expect(result2).toEqual({ baz: 'qux' });

    // Test hours
    await primitives.set('key3', { x: 1 }, { tags: [['test']], ttl: '1h' });
    const result3 = await primitives.get<{ x: number }>('key3');
    expect(result3).toEqual({ x: 1 });

    // Test days
    await primitives.set('key4', { y: 2 }, { tags: [['test']], ttl: '1d' });
    const result4 = await primitives.get<{ y: number }>('key4');
    expect(result4).toEqual({ y: 2 });
  });

  it('root tag invalidation affects all children', async () => {
    await primitives.set('key1', { a: 1 }, { tags: [['posts', '1', 'comments', '1']], ttl: '1m' });
    await primitives.set('key2', { b: 2 }, { tags: [['posts', '2', 'likes']], ttl: '1m' });
    await primitives.set('key3', { c: 3 }, { tags: [['users', '1']], ttl: '1m' });

    // Invalidate 'posts' root tag
    await primitives.invalidate([['posts']]);

    const result1 = await primitives.get('key1');
    const result2 = await primitives.get('key2');
    const result3 = await primitives.get<{ c: number }>('key3');

    expect(result1).toBeNull();
    expect(result2).toBeNull();
    expect(result3).toEqual({ c: 3 }); // Users unaffected
  });

  it('disconnect clears adapter state', async () => {
    await primitives.set('key1', { foo: 'bar' }, { tags: [['test']], ttl: '1m' });
    await primitives.disconnect();
    const result = await primitives.get('key1');
    expect(result).toBeNull();
  });

  it('invalidates multiple tags at once', async () => {
    await primitives.set('key1', { a: 1 }, { tags: [['posts', '1']], ttl: '1m' });
    await primitives.set('key2', { b: 2 }, { tags: [['users', '42']], ttl: '1m' });
    await primitives.set('key3', { c: 3 }, { tags: [['comments', '99']], ttl: '1m' });

    // Invalidate posts and users, but not comments
    await primitives.invalidate([
      ['posts', '1'],
      ['users', '42'],
    ]);

    const result1 = await primitives.get('key1');
    const result2 = await primitives.get('key2');
    const result3 = await primitives.get<{ c: number }>('key3');

    expect(result1).toBeNull();
    expect(result2).toBeNull();
    expect(result3).toEqual({ c: 3 });
  });

  describe('query()', () => {
    it('caches query results', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ id: '1', name: 'Test' });

      const result1 = await primitives.query({
        key: 'user:1',
        tags: [['users', '1']],
        fn: fetchFn,
        ttl: '1m',
      });

      const result2 = await primitives.query({
        key: 'user:1',
        tags: [['users', '1']],
        fn: fetchFn,
        ttl: '1m',
      });

      expect(result1).toEqual({ id: '1', name: 'Test' });
      expect(result2).toEqual({ id: '1', name: 'Test' });
      expect(fetchFn).toHaveBeenCalledTimes(1); // Cached
    });

    it('stampede protection - concurrent requests share single fetch', async () => {
      let callCount = 0;
      const fetchFn = vi.fn().mockImplementation(async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 50));
        return { count: callCount };
      });

      // Launch concurrent queries
      const [result1, result2, result3] = await Promise.all([
        primitives.query({ key: 'user:1', tags: [['users', '1']], fn: fetchFn, ttl: '1m' }),
        primitives.query({ key: 'user:1', tags: [['users', '1']], fn: fetchFn, ttl: '1m' }),
        primitives.query({ key: 'user:1', tags: [['users', '1']], fn: fetchFn, ttl: '1m' }),
      ]);

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(result1.count).toBe(1);
      expect(result2.count).toBe(1);
      expect(result3.count).toBe(1);
    });

    it('invalidation triggers refetch', async () => {
      let counter = 0;
      const fetchFn = vi.fn().mockImplementation(() => Promise.resolve({ count: ++counter }));

      await primitives.query({
        key: 'user:1',
        tags: [['users', '1']],
        fn: fetchFn,
        ttl: '1m',
      });

      await primitives.invalidate([['users', '1']]);

      const result = await primitives.query({
        key: 'user:1',
        tags: [['users', '1']],
        fn: fetchFn,
        ttl: '1m',
      });

      expect(result.count).toBe(2);
    });

    it('uses default TTL from primitives options', async () => {
      const customPrimitives = createPrimitives({
        adapter,
        defaultTtl: 1, // 1ms
      });

      const fetchFn = vi.fn().mockResolvedValue({ id: '1' });

      await customPrimitives.query({
        key: 'user:1',
        tags: [['users', '1']],
        fn: fetchFn,
        // No ttl specified - should use default
      });

      await new Promise((r) => setTimeout(r, 10));

      await customPrimitives.query({
        key: 'user:1',
        tags: [['users', '1']],
        fn: fetchFn,
      });

      expect(fetchFn).toHaveBeenCalledTimes(2); // Expired, refetched
    });

    it('grace period serves stale while refreshing in background', async () => {
      const customPrimitives = createPrimitives({
        adapter,
        defaultTtl: 1, // 1ms
        defaultGrace: 10000, // 10s grace
      });

      let counter = 0;
      const fetchFn = vi.fn().mockImplementation(() => Promise.resolve({ count: ++counter }));

      await customPrimitives.query({
        key: 'user:1',
        tags: [['users', '1']],
        fn: fetchFn,
      });

      await new Promise((r) => setTimeout(r, 10)); // Expire TTL but within grace

      // Should return stale value immediately
      const result = await customPrimitives.query({
        key: 'user:1',
        tags: [['users', '1']],
        fn: fetchFn,
      });

      expect(result.count).toBe(1); // Stale value
      // Background refresh may have triggered
    });

    it('grace: false disables grace period', async () => {
      const customPrimitives = createPrimitives({
        adapter,
        defaultTtl: 1,
        defaultGrace: false,
      });

      let counter = 0;
      const fetchFn = vi.fn().mockImplementation(() => Promise.resolve({ count: ++counter }));

      await customPrimitives.query({
        key: 'user:1',
        tags: [['users', '1']],
        fn: fetchFn,
      });

      await new Promise((r) => setTimeout(r, 10));

      const result = await customPrimitives.query({
        key: 'user:1',
        tags: [['users', '1']],
        fn: fetchFn,
      });

      expect(result.count).toBe(2); // No grace, must refetch
    });

    it('different keys are cached separately', async () => {
      const fetchFn = vi.fn().mockImplementation((id: string) => Promise.resolve({ id }));

      await primitives.query({
        key: 'user:1',
        tags: [['users', '1']],
        fn: () => fetchFn('1'),
        ttl: '1m',
      });

      await primitives.query({
        key: 'user:2',
        tags: [['users', '2']],
        fn: () => fetchFn('2'),
        ttl: '1m',
      });

      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });
});
