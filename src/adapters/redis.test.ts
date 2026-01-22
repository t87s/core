import { describe, it, expect, vi } from 'vitest';
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
});
