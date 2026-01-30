import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheEngine } from './cache-engine.js';
import { MemoryAdapter } from './adapters/index.js';

describe('CacheEngine', () => {
  let adapter: MemoryAdapter;
  let engine: CacheEngine;

  beforeEach(() => {
    adapter = new MemoryAdapter();
    engine = new CacheEngine({ adapter, defaultTtl: '1m', defaultGrace: '5m' });
  });

  describe('construction', () => {
    it('creates engine with adapter', () => {
      expect(engine).toBeDefined();
    });

    it('throws on invalid verifyPercent (negative)', () => {
      expect(() => new CacheEngine({ adapter, verifyPercent: -0.1 })).toThrow(
        'verifyPercent must be between 0 and 1'
      );
    });

    it('throws on invalid verifyPercent (> 1)', () => {
      expect(() => new CacheEngine({ adapter, verifyPercent: 1.5 })).toThrow(
        'verifyPercent must be between 0 and 1'
      );
    });

    it('accepts valid verifyPercent at boundaries', () => {
      expect(() => new CacheEngine({ adapter, verifyPercent: 0 })).not.toThrow();
      expect(() => new CacheEngine({ adapter, verifyPercent: 1 })).not.toThrow();
    });
  });

  describe('caching', () => {
    it('caches query results', async () => {
      let callCount = 0;
      const fn = vi.fn(async () => ({ count: ++callCount }));

      const result1 = await engine.query({ key: 'test', tags: [['test']], fn });
      const result2 = await engine.query({ key: 'test', tags: [['test']], fn });

      expect(result1.count).toBe(1);
      expect(result2.count).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('uses prefix in cache key', async () => {
      const customEngine = new CacheEngine({ adapter, prefix: 'custom' });
      const fn = vi.fn(async () => 'value');

      await customEngine.query({ key: 'test', tags: [['test']], fn });

      // Verify the prefix is used by checking adapter directly
      const entry = await adapter.get('custom:test');
      expect(entry).not.toBeNull();
      expect(entry?.value).toBe('value');
    });

    it('different keys are cached separately', async () => {
      let callCount = 0;
      const fn = vi.fn(async () => ({ count: ++callCount }));

      const result1 = await engine.query({ key: 'key1', tags: [['test']], fn });
      const result2 = await engine.query({ key: 'key2', tags: [['test']], fn });

      expect(result1.count).toBe(1);
      expect(result2.count).toBe(2);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('stampede protection', () => {
    it('concurrent requests share promise', async () => {
      let callCount = 0;
      const fn = vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 50));
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

    it('different keys do not share stampede protection', async () => {
      let callCount = 0;
      const fn = vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { count: ++callCount };
      });

      const [r1, r2] = await Promise.all([
        engine.query({ key: 'key1', tags: [['test']], fn }),
        engine.query({ key: 'key2', tags: [['test']], fn }),
      ]);

      expect(r1.count).toBe(1);
      expect(r2.count).toBe(2);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('clears inFlight after promise resolves', async () => {
      const fn = vi.fn(async () => 'value');

      await engine.query({ key: 'test', tags: [['test']], fn });

      // Second call should trigger new fetch since first completed
      await engine.query({ key: 'test', tags: [['test']], fn });

      // But since it's cached, fn should still only be called once
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('hierarchical tag invalidation', () => {
    it('invalidates tags hierarchically', async () => {
      // Use engine without grace to test invalidation directly
      const noGraceEngine = new CacheEngine({ adapter, defaultTtl: '1m', defaultGrace: false });
      let callCount = 0;
      const fn = vi.fn(async () => ({ count: ++callCount }));

      await noGraceEngine.query({
        key: 'post-1-comments',
        tags: [['posts', '1', 'comments']],
        fn,
      });

      // Invalidate parent tag
      await noGraceEngine.invalidate([['posts', '1']]);

      const result = await noGraceEngine.query({
        key: 'post-1-comments',
        tags: [['posts', '1', 'comments']],
        fn,
      });
      expect(result.count).toBe(2);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('invalidating root affects all descendants', async () => {
      // Use engine without grace to test invalidation directly
      const noGraceEngine = new CacheEngine({ adapter, defaultTtl: '1m', defaultGrace: false });
      let callCount = 0;
      const fn = vi.fn(async () => ({ count: ++callCount }));

      await noGraceEngine.query({
        key: 'deep-nested',
        tags: [['a', 'b', 'c', 'd']],
        fn,
      });

      // Invalidate root tag
      await noGraceEngine.invalidate([['a']]);

      const result = await noGraceEngine.query({
        key: 'deep-nested',
        tags: [['a', 'b', 'c', 'd']],
        fn,
      });
      expect(result.count).toBe(2);
    });

    it('invalidating unrelated tag does not affect entry', async () => {
      let callCount = 0;
      const fn = vi.fn(async () => ({ count: ++callCount }));

      await engine.query({
        key: 'test',
        tags: [['posts', '1']],
        fn,
      });

      // Invalidate unrelated tag
      await engine.invalidate([['users', '1']]);

      const result = await engine.query({
        key: 'test',
        tags: [['posts', '1']],
        fn,
      });
      expect(result.count).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('exact invalidation', () => {
    it('exact invalidation only affects exact tag', async () => {
      // Use engine without grace to test invalidation directly
      const noGraceEngine = new CacheEngine({ adapter, defaultTtl: '1m', defaultGrace: false });
      let callCount = 0;
      const fn = vi.fn(async () => ({ count: ++callCount }));

      await noGraceEngine.query({
        key: 'post-1-comments',
        tags: [['posts', '1', 'comments']],
        fn,
      });

      // Exact invalidate parent - should NOT affect child
      await noGraceEngine.invalidate([['posts', '1']], true);

      const result = await noGraceEngine.query({
        key: 'post-1-comments',
        tags: [['posts', '1', 'comments']],
        fn,
      });
      expect(result.count).toBe(1); // Still cached
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('exact invalidation affects exact match', async () => {
      // Use engine without grace to test invalidation directly
      const noGraceEngine = new CacheEngine({ adapter, defaultTtl: '1m', defaultGrace: false });
      let callCount = 0;
      const fn = vi.fn(async () => ({ count: ++callCount }));

      await noGraceEngine.query({
        key: 'post-1',
        tags: [['posts', '1']],
        fn,
      });

      // Exact invalidate same tag
      await noGraceEngine.invalidate([['posts', '1']], true);

      const result = await noGraceEngine.query({
        key: 'post-1',
        tags: [['posts', '1']],
        fn,
      });
      expect(result.count).toBe(2);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('TTL expiration', () => {
    it('respects TTL and refetches after expiration', async () => {
      // Use engine without default grace
      const noGraceEngine = new CacheEngine({ adapter, defaultTtl: '1m', defaultGrace: false });
      let callCount = 0;
      const fn = vi.fn(async () => ({ count: ++callCount }));

      await noGraceEngine.query({ key: 'test', tags: [['test']], fn, ttl: 10, grace: false });

      // Wait for TTL to expire
      await new Promise((r) => setTimeout(r, 20));

      const result = await noGraceEngine.query({
        key: 'test',
        tags: [['test']],
        fn,
        ttl: 10,
        grace: false,
      });
      expect(result.count).toBe(2);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('uses default TTL when not specified', async () => {
      const shortTtlEngine = new CacheEngine({ adapter, defaultTtl: 10, defaultGrace: false });
      let callCount = 0;
      const fn = vi.fn(async () => ({ count: ++callCount }));

      await shortTtlEngine.query({ key: 'test', tags: [['test']], fn });

      // Wait for default TTL to expire
      await new Promise((r) => setTimeout(r, 20));

      const result = await shortTtlEngine.query({ key: 'test', tags: [['test']], fn });
      expect(result.count).toBe(2);
    });
  });

  describe('grace period / SWR', () => {
    it('returns stale value within grace period while refreshing', async () => {
      let callCount = 0;
      const fn = vi.fn(async () => ({ count: ++callCount }));

      // First call
      await engine.query({ key: 'test', tags: [['test']], fn, ttl: 1, grace: 10000 });

      // Wait for TTL to expire but within grace
      await new Promise((r) => setTimeout(r, 10));

      // Should return stale value (count: 1) while refreshing in background
      const result = await engine.query({
        key: 'test',
        tags: [['test']],
        fn,
        ttl: 1,
        grace: 10000,
      });
      expect(result.count).toBe(1);

      // Wait for background refresh
      await new Promise((r) => setTimeout(r, 50));

      // Now should have fresh value
      const result2 = await engine.query({
        key: 'test',
        tags: [['test']],
        fn,
        ttl: 1,
        grace: 10000,
      });
      expect(result2.count).toBe(2);
    });

    it('grace: false disables SWR', async () => {
      // Use engine without default grace for this test
      const noGraceEngine = new CacheEngine({ adapter, defaultTtl: '1m', defaultGrace: false });
      let callCount = 0;
      const fn = vi.fn(async () => ({ count: ++callCount }));

      await noGraceEngine.query({ key: 'test', tags: [['test']], fn, ttl: 1, grace: false });

      // Wait for TTL to expire
      await new Promise((r) => setTimeout(r, 10));

      // Should fetch fresh since grace is disabled
      const result = await noGraceEngine.query({
        key: 'test',
        tags: [['test']],
        fn,
        ttl: 1,
        grace: false,
      });
      expect(result.count).toBe(2);
    });

    it('uses default grace when not specified in query', async () => {
      const graceEngine = new CacheEngine({ adapter, defaultTtl: 1, defaultGrace: 10000 });
      let callCount = 0;
      const fn = vi.fn(async () => ({ count: ++callCount }));

      await graceEngine.query({ key: 'test', tags: [['test']], fn });

      // Wait for TTL to expire but within grace
      await new Promise((r) => setTimeout(r, 10));

      // Should return stale value since default grace is active
      const result = await graceEngine.query({ key: 'test', tags: [['test']], fn });
      expect(result.count).toBe(1);
    });
  });

  describe('error handling with grace', () => {
    it('returns stale on failure within grace period', async () => {
      let callCount = 0;
      const fn = vi.fn(async () => {
        callCount++;
        if (callCount > 1) throw new Error('fail');
        return { count: callCount };
      });

      // First call succeeds
      await engine.query({ key: 'test', tags: [['test']], fn, ttl: 1, grace: 10000 });

      // Wait for TTL
      await new Promise((r) => setTimeout(r, 10));

      // Invalidate to force refetch
      await engine.invalidate([['test']]);

      // Should return graced value even though fn throws
      const result = await engine.query({
        key: 'test',
        tags: [['test']],
        fn,
        ttl: 1,
        grace: 10000,
      });
      expect(result.count).toBe(1);
    });

    it('throws error when no graced entry available', async () => {
      const fn = vi.fn(async () => {
        throw new Error('fetch failed');
      });

      await expect(engine.query({ key: 'test', tags: [['test']], fn })).rejects.toThrow(
        'fetch failed'
      );
    });

    it('throws error when grace period has expired', async () => {
      let callCount = 0;
      const fn = vi.fn(async () => {
        callCount++;
        if (callCount > 1) throw new Error('fail');
        return { count: callCount };
      });

      // First call succeeds with very short grace
      await engine.query({ key: 'test', tags: [['test']], fn, ttl: 1, grace: 1 });

      // Wait for both TTL and grace to expire
      await new Promise((r) => setTimeout(r, 20));

      // Should throw since grace has expired
      await expect(
        engine.query({ key: 'test', tags: [['test']], fn, ttl: 1, grace: 1 })
      ).rejects.toThrow('fail');
    });
  });

  describe('clear()', () => {
    it('removes all cached data', async () => {
      const fn = vi.fn(async () => ({ data: 'test' }));

      await engine.query({ key: 'test', tags: [['test']], fn });
      expect(fn).toHaveBeenCalledTimes(1);

      await engine.clear();

      await engine.query({ key: 'test', tags: [['test']], fn });
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('removes tag invalidations', async () => {
      const fn = vi.fn(async () => 'value');

      await engine.query({ key: 'test', tags: [['test']], fn });

      // Set invalidation
      await engine.invalidate([['test']]);

      // Clear everything
      await engine.clear();

      // New entry should not be considered stale
      await engine.query({ key: 'test', tags: [['test']], fn });
      await engine.query({ key: 'test', tags: [['test']], fn });
      expect(fn).toHaveBeenCalledTimes(2); // One after clear
    });
  });

  describe('disconnect()', () => {
    it('calls adapter disconnect', async () => {
      const mockAdapter = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        getTagInvalidationTime: vi.fn(),
        setTagInvalidationTime: vi.fn(),
        clear: vi.fn(),
        disconnect: vi.fn(),
      };

      const testEngine = new CacheEngine({ adapter: mockAdapter });
      await testEngine.disconnect();

      expect(mockAdapter.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('verification sampling', () => {
    it('does not verify when adapter lacks reportVerification', async () => {
      // MemoryAdapter doesn't have reportVerification
      const fn = vi.fn(async () => 'value');

      await engine.query({ key: 'test', tags: [['test']], fn });
      await engine.query({ key: 'test', tags: [['test']], fn });

      // fn should only be called once (no verification)
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('verifies when adapter supports reportVerification', async () => {
      const mockAdapter = {
        get: vi.fn().mockResolvedValue({
          value: 'cached',
          tags: [['test']],
          createdAt: Date.now(),
          expiresAt: Date.now() + 60000,
          graceUntil: null,
        }),
        set: vi.fn(),
        delete: vi.fn(),
        getTagInvalidationTime: vi.fn().mockResolvedValue(null),
        setTagInvalidationTime: vi.fn(),
        clear: vi.fn(),
        disconnect: vi.fn(),
        reportVerification: vi.fn(),
      };

      const verifyEngine = new CacheEngine({ adapter: mockAdapter, verifyPercent: 1 });
      const fn = vi.fn(async () => 'fresh');

      await verifyEngine.query({ key: 'test', tags: [['test']], fn });

      // Wait for background verification
      await new Promise((r) => setTimeout(r, 10));

      expect(mockAdapter.reportVerification).toHaveBeenCalledWith(
        't87s:test',
        true, // isStale because 'cached' !== 'fresh'
        expect.any(String),
        expect.any(String)
      );
    });

    it('respects verifyPercent: 0 (never verify)', async () => {
      const mockAdapter = {
        get: vi.fn().mockResolvedValue({
          value: 'cached',
          tags: [['test']],
          createdAt: Date.now(),
          expiresAt: Date.now() + 60000,
          graceUntil: null,
        }),
        set: vi.fn(),
        delete: vi.fn(),
        getTagInvalidationTime: vi.fn().mockResolvedValue(null),
        setTagInvalidationTime: vi.fn(),
        clear: vi.fn(),
        disconnect: vi.fn(),
        reportVerification: vi.fn(),
      };

      const verifyEngine = new CacheEngine({ adapter: mockAdapter, verifyPercent: 0 });
      const fn = vi.fn(async () => 'fresh');

      await verifyEngine.query({ key: 'test', tags: [['test']], fn });

      // Wait a bit
      await new Promise((r) => setTimeout(r, 10));

      expect(mockAdapter.reportVerification).not.toHaveBeenCalled();
    });
  });

  describe('invalidation with grace period', () => {
    it('serves stale during grace period after invalidation while refreshing', async () => {
      let callCount = 0;
      const fn = vi.fn(async () => ({ count: ++callCount }));

      // Create entry with grace
      await engine.query({ key: 'test', tags: [['test']], fn });
      expect(fn).toHaveBeenCalledTimes(1);

      // Invalidate - with grace, should still serve stale while refreshing
      await engine.invalidate([['test']]);

      // Should return stale value (count: 1) while refreshing in background
      const result = await engine.query({ key: 'test', tags: [['test']], fn });
      expect(result.count).toBe(1);

      // Wait for background refresh
      await new Promise((r) => setTimeout(r, 50));

      // Now should have fresh value
      const result2 = await engine.query({ key: 'test', tags: [['test']], fn });
      expect(result2.count).toBe(2);
    });
  });

  describe('multiple tags', () => {
    it('supports entries with multiple tags', async () => {
      // Use engine without grace to test invalidation directly
      const noGraceEngine = new CacheEngine({ adapter, defaultTtl: '1m', defaultGrace: false });
      let callCount = 0;
      const fn = vi.fn(async () => ({ count: ++callCount }));

      await noGraceEngine.query({
        key: 'test',
        tags: [
          ['posts', '1'],
          ['users', '2'],
        ],
        fn,
      });

      // Invalidating either tag should invalidate the entry
      await noGraceEngine.invalidate([['posts', '1']]);

      const result = await noGraceEngine.query({
        key: 'test',
        tags: [
          ['posts', '1'],
          ['users', '2'],
        ],
        fn,
      });
      expect(result.count).toBe(2);
    });

    it('invalidating one of multiple tags invalidates entry', async () => {
      // Use engine without grace to test invalidation directly
      const noGraceEngine = new CacheEngine({ adapter, defaultTtl: '1m', defaultGrace: false });
      let callCount = 0;
      const fn = vi.fn(async () => ({ count: ++callCount }));

      await noGraceEngine.query({
        key: 'test',
        tags: [
          ['posts', '1'],
          ['users', '2'],
        ],
        fn,
      });

      // Invalidating the second tag
      await noGraceEngine.invalidate([['users']]);

      const result = await noGraceEngine.query({
        key: 'test',
        tags: [
          ['posts', '1'],
          ['users', '2'],
        ],
        fn,
      });
      expect(result.count).toBe(2);
    });
  });
});
