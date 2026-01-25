import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudAdapter } from './cloud.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('CloudAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('construction', () => {
    it('should construct with apiKey', () => {
      const adapter = new CloudAdapter({ apiKey: 't87s_test' });
      expect(adapter).toBeInstanceOf(CloudAdapter);
    });

    it('should construct with custom baseUrl', () => {
      const adapter = new CloudAdapter({
        apiKey: 't87s_test',
        baseUrl: 'https://custom.api.com',
      });
      expect(adapter).toBeInstanceOf(CloudAdapter);
    });
  });

  describe('get', () => {
    it('should return null for missing key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entry: null }),
      });
      const adapter = new CloudAdapter({ apiKey: 't87s_test' });

      const result = await adapter.get('missing');

      expect(result).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://t87s-cloud.mike-solomon.workers.dev/v1/cache/get',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer t87s_test',
          },
          body: JSON.stringify({ key: 'missing' }),
        }
      );
    });

    it('should return entry for existing key', async () => {
      const entry = {
        value: { id: '1', name: 'Alice' },
        tags: [['user', '1']],
        createdAt: 1000,
        expiresAt: 2000,
        graceUntil: 3000,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entry }),
      });
      const adapter = new CloudAdapter({ apiKey: 't87s_test' });

      const result = await adapter.get('key1');

      expect(result).toEqual(entry);
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      });
      const adapter = new CloudAdapter({ apiKey: 't87s_invalid' });

      await expect(adapter.get('key1')).rejects.toThrow('Unauthorized');
    });
  });

  describe('set', () => {
    it('should send entry to cloud service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      const adapter = new CloudAdapter({ apiKey: 't87s_test' });
      const entry = {
        value: { id: '1' },
        tags: [['user', '1']],
        createdAt: 1000,
        expiresAt: 2000,
        graceUntil: 3000,
      };

      await adapter.set('key1', entry);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://t87s-cloud.mike-solomon.workers.dev/v1/cache/set',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer t87s_test',
          },
          body: JSON.stringify({ key: 'key1', entry }),
        }
      );
    });
  });

  describe('delete', () => {
    it('should send delete request to cloud service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      const adapter = new CloudAdapter({ apiKey: 't87s_test' });

      await adapter.delete('key1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://t87s-cloud.mike-solomon.workers.dev/v1/cache/delete',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer t87s_test',
          },
          body: JSON.stringify({ key: 'key1' }),
        }
      );
    });
  });

  describe('tag invalidation', () => {
    it('should return null for getTagInvalidationTime (server-side validation)', async () => {
      const adapter = new CloudAdapter({ apiKey: 't87s_test' });

      const result = await adapter.getTagInvalidationTime(['user', '1']);

      expect(result).toBeNull();
      // Should not make any fetch calls
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should call invalidate endpoint for setTagInvalidationTime', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, invalidatedAt: 1000 }),
      });
      const adapter = new CloudAdapter({ apiKey: 't87s_test' });

      await adapter.setTagInvalidationTime(['user', '1'], 1000);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://t87s-cloud.mike-solomon.workers.dev/v1/invalidate',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer t87s_test',
          },
          body: JSON.stringify({ tags: [['user', '1']], exact: true }),
        }
      );
    });
  });

  describe('clear', () => {
    it('should call clear endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      const adapter = new CloudAdapter({ apiKey: 't87s_test' });

      await adapter.clear();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://t87s-cloud.mike-solomon.workers.dev/v1/clear',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer t87s_test',
          },
          body: JSON.stringify({}),
        }
      );
    });
  });

  describe('disconnect', () => {
    it('should be a no-op', async () => {
      const adapter = new CloudAdapter({ apiKey: 't87s_test' });

      await adapter.disconnect();

      // No fetch calls should be made
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('custom baseUrl', () => {
    it('should use custom baseUrl for requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entry: null }),
      });
      const adapter = new CloudAdapter({
        apiKey: 't87s_test',
        baseUrl: 'https://custom.api.com',
      });

      await adapter.get('key1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.api.com/v1/cache/get',
        expect.any(Object)
      );
    });
  });

  describe('reportVerification', () => {
    it('should send verification report to /v1/verify endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      const adapter = new CloudAdapter({ apiKey: 't87s_test' });

      await adapter.reportVerification('my-key', true, 'hash1', 'hash2');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://t87s-cloud.mike-solomon.workers.dev/v1/verify',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer t87s_test',
          },
          body: expect.stringContaining('"key":"my-key"'),
        }
      );

      const body = JSON.parse((mockFetch.mock.calls[0]![1] as { body: string }).body);
      expect(body).toMatchObject({
        key: 'my-key',
        isStale: true,
        cachedHash: 'hash1',
        freshHash: 'hash2',
      });
      expect(body.timestamp).toBeDefined();
    });
  });
});
