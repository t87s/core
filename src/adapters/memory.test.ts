import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryAdapter } from './memory.js';
import type { CacheEntry } from '../types.js';

describe('MemoryAdapter', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  describe('get/set', () => {
    it('should store and retrieve entries', async () => {
      const entry: CacheEntry<string> = {
        value: 'hello',
        tags: [['user', '123']],
        createdAt: Date.now(),
        expiresAt: Date.now() + 10000,
        graceUntil: null,
      };

      await adapter.set('key1', entry);
      const result = await adapter.get<string>('key1');

      expect(result).toEqual(entry);
    });

    it('should return null for missing keys', async () => {
      const result = await adapter.get('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should remove entries', async () => {
      const entry: CacheEntry<string> = {
        value: 'hello',
        tags: [],
        createdAt: Date.now(),
        expiresAt: Date.now() + 10000,
        graceUntil: null,
      };

      await adapter.set('key1', entry);
      await adapter.delete('key1');
      const result = await adapter.get('key1');

      expect(result).toBeNull();
    });
  });

  describe('tag invalidation times', () => {
    it('should store and retrieve tag invalidation times', async () => {
      const tag = ['user', '123'];
      const timestamp = Date.now();

      await adapter.setTagInvalidationTime(tag, timestamp);
      const result = await adapter.getTagInvalidationTime(tag);

      expect(result).toBe(timestamp);
    });

    it('should return null for tags never invalidated', async () => {
      const result = await adapter.getTagInvalidationTime(['unknown']);
      expect(result).toBeNull();
    });
  });

  describe('clear', () => {
    it('should remove all entries and tag times', async () => {
      const entry: CacheEntry<string> = {
        value: 'hello',
        tags: [],
        createdAt: Date.now(),
        expiresAt: Date.now() + 10000,
        graceUntil: null,
      };

      await adapter.set('key1', entry);
      await adapter.setTagInvalidationTime(['user'], Date.now());
      await adapter.clear();

      expect(await adapter.get('key1')).toBeNull();
      expect(await adapter.getTagInvalidationTime(['user'])).toBeNull();
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entries when maxItems exceeded', async () => {
      const adapter = new MemoryAdapter({ maxItems: 3 });

      for (let i = 1; i <= 4; i++) {
        await adapter.set(`key${i}`, {
          value: i,
          tags: [],
          createdAt: Date.now(),
          expiresAt: Date.now() + 10000,
          graceUntil: null,
        });
      }

      // key1 should be evicted
      expect(await adapter.get('key1')).toBeNull();
      expect(await adapter.get('key2')).not.toBeNull();
      expect(await adapter.get('key3')).not.toBeNull();
      expect(await adapter.get('key4')).not.toBeNull();
    });

    it('should refresh LRU order on get', async () => {
      const adapter = new MemoryAdapter({ maxItems: 3 });

      await adapter.set('key1', { value: 1, tags: [], createdAt: Date.now(), expiresAt: Date.now() + 10000, graceUntil: null });
      await adapter.set('key2', { value: 2, tags: [], createdAt: Date.now(), expiresAt: Date.now() + 10000, graceUntil: null });
      await adapter.set('key3', { value: 3, tags: [], createdAt: Date.now(), expiresAt: Date.now() + 10000, graceUntil: null });

      // Access key1 to make it recently used
      await adapter.get('key1');

      // Add key4 - key2 should be evicted (oldest unused)
      await adapter.set('key4', { value: 4, tags: [], createdAt: Date.now(), expiresAt: Date.now() + 10000, graceUntil: null });

      expect(await adapter.get('key1')).not.toBeNull();
      expect(await adapter.get('key2')).toBeNull(); // evicted
      expect(await adapter.get('key3')).not.toBeNull();
      expect(await adapter.get('key4')).not.toBeNull();
    });
  });
});
