import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisAdapter } from './redis.js';

// Mock ioredis
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  mget: vi.fn(),
  scan: vi.fn(),
  quit: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RedisAdapter', () => {
  describe('construction', () => {
    it('should construct with client and default prefix', () => {
      const adapter = new RedisAdapter({ client: mockRedis as any });
      expect(adapter).toBeInstanceOf(RedisAdapter);
    });

    it('should construct with custom prefix', () => {
      const adapter = new RedisAdapter({ client: mockRedis as any, prefix: 'myapp' });
      expect(adapter).toBeInstanceOf(RedisAdapter);
    });
  });

  describe('get/set', () => {
    it('should return null for missing key', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      const adapter = new RedisAdapter({ client: mockRedis as any });

      const result = await adapter.get('missing');

      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith('t87s:c:missing');
    });

    it('should return parsed entry for existing key', async () => {
      const entry = {
        value: { id: '1', name: 'Alice' },
        tags: [['user', '1']],
        createdAt: 1000,
        expiresAt: 2000,
        graceUntil: 3000,
      };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(entry));
      const adapter = new RedisAdapter({ client: mockRedis as any });

      const result = await adapter.get('key1');

      expect(result).toEqual(entry);
    });

    it('should return null for invalid JSON', async () => {
      mockRedis.get.mockResolvedValueOnce('not valid json');
      const adapter = new RedisAdapter({ client: mockRedis as any });

      const result = await adapter.get('bad');

      expect(result).toBeNull();
    });

    it('should set entry with PXAT expiration', async () => {
      mockRedis.set.mockResolvedValueOnce('OK');
      const adapter = new RedisAdapter({ client: mockRedis as any });
      const entry = {
        value: { id: '1' },
        tags: [['user', '1']],
        createdAt: 1000,
        expiresAt: 2000,
        graceUntil: 3000,
      };

      await adapter.set('key1', entry);

      expect(mockRedis.set).toHaveBeenCalledWith(
        't87s:c:key1',
        JSON.stringify(entry),
        'PXAT',
        3000
      );
    });

    it('should use expiresAt when graceUntil is null', async () => {
      mockRedis.set.mockResolvedValueOnce('OK');
      const adapter = new RedisAdapter({ client: mockRedis as any });
      const entry = {
        value: { id: '1' },
        tags: [['user', '1']],
        createdAt: 1000,
        expiresAt: 2000,
        graceUntil: null,
      };

      await adapter.set('key1', entry);

      expect(mockRedis.set).toHaveBeenCalledWith(
        't87s:c:key1',
        JSON.stringify(entry),
        'PXAT',
        2000
      );
    });
  });

  describe('delete', () => {
    it('should delete cache entry', async () => {
      mockRedis.del.mockResolvedValueOnce(1);
      const adapter = new RedisAdapter({ client: mockRedis as any });

      await adapter.delete('key1');

      expect(mockRedis.del).toHaveBeenCalledWith('t87s:c:key1');
    });
  });
});
