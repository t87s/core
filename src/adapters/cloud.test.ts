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

  describe('verification', () => {
    const createEntry = <T>(value: T) => ({
      value,
      tags: [['user', '1']],
      createdAt: 1000,
      expiresAt: 2000,
      graceUntil: null,
    });

    it('should call verify callback on sampled cache hits', async () => {
      const verifyCallback = vi.fn().mockResolvedValue({ name: 'fresh' });

      const adapter = new CloudAdapter({
        apiKey: 't87s_test',
        baseUrl: 'https://test.example.com',
        verify: verifyCallback,
        verifyPercent: 1.0, // Always verify for testing
      });

      const entry = createEntry({ name: 'cached' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entry }),
      });
      // Mock the verification report endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const result = await adapter.get('my-key');

      // Result should return immediately with cached value
      expect(result).toEqual(entry);

      // Wait for background verification to complete
      await vi.waitFor(() => {
        expect(verifyCallback).toHaveBeenCalledWith('my-key', { name: 'cached' });
      });
    });

    it('should send verification report to /v1/verify endpoint', async () => {
      const verifyCallback = vi.fn().mockResolvedValue({ name: 'fresh' });

      const adapter = new CloudAdapter({
        apiKey: 't87s_test',
        baseUrl: 'https://test.example.com',
        verify: verifyCallback,
        verifyPercent: 1.0,
      });

      const entry = createEntry({ name: 'cached' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entry }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await adapter.get('my-key');

      // Wait for background verification
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      const verifyCall = mockFetch.mock.calls[1]!;
      expect(verifyCall[0]).toBe('https://test.example.com/v1/verify');

      const verifyBody = JSON.parse((verifyCall[1] as { body: string }).body);
      expect(verifyBody).toMatchObject({
        key: 'my-key',
        isStale: true, // cached 'cached' vs fresh 'fresh' - different values = stale
      });
      expect(verifyBody.cachedHash).toBeDefined();
      expect(verifyBody.freshHash).toBeDefined();
    });

    it('should report isStale=false when cached and fresh values are equal', async () => {
      const verifyCallback = vi.fn().mockResolvedValue({ name: 'same' });

      const adapter = new CloudAdapter({
        apiKey: 't87s_test',
        baseUrl: 'https://test.example.com',
        verify: verifyCallback,
        verifyPercent: 1.0,
      });

      const entry = createEntry({ name: 'same' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entry }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await adapter.get('my-key');

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      const verifyCall = mockFetch.mock.calls[1]!;
      const verifyBody = JSON.parse((verifyCall[1] as { body: string }).body);
      expect(verifyBody.isStale).toBe(false);
    });

    it('should never verify when verifyPercent is 0', async () => {
      const verifyCallback = vi.fn().mockResolvedValue({ name: 'fresh' });

      const adapter = new CloudAdapter({
        apiKey: 't87s_test',
        baseUrl: 'https://test.example.com',
        verify: verifyCallback,
        verifyPercent: 0,
      });

      const entry = createEntry({ name: 'cached' });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ entry }),
      });

      // Make multiple requests
      await adapter.get('key1');
      await adapter.get('key2');
      await adapter.get('key3');

      // Wait a bit for any potential background verification
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify callback should never be called
      expect(verifyCallback).not.toHaveBeenCalled();
      // Only the cache get requests, no verify requests
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not verify on cache miss', async () => {
      const verifyCallback = vi.fn().mockResolvedValue({ name: 'fresh' });

      const adapter = new CloudAdapter({
        apiKey: 't87s_test',
        baseUrl: 'https://test.example.com',
        verify: verifyCallback,
        verifyPercent: 1.0,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entry: null }),
      });

      const result = await adapter.get('my-key');

      expect(result).toBeNull();

      // Wait a bit for any potential background verification
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify callback should not be called on cache miss
      expect(verifyCallback).not.toHaveBeenCalled();
    });

    it('should silently catch verification errors', async () => {
      const verifyCallback = vi.fn().mockRejectedValue(new Error('Network error'));

      const adapter = new CloudAdapter({
        apiKey: 't87s_test',
        baseUrl: 'https://test.example.com',
        verify: verifyCallback,
        verifyPercent: 1.0,
      });

      const entry = createEntry({ name: 'cached' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entry }),
      });

      // This should not throw despite verification error
      const result = await adapter.get('my-key');

      expect(result).toEqual(entry);

      // Wait for background verification attempt
      await vi.waitFor(() => {
        expect(verifyCallback).toHaveBeenCalled();
      });
    });

    it('should use default verifyPercent of 0.05 (5%)', async () => {
      const verifyCallback = vi.fn().mockResolvedValue({ name: 'fresh' });

      // Mock Math.random to return values that test the 5% threshold
      const mathRandomSpy = vi.spyOn(Math, 'random');

      const adapter = new CloudAdapter({
        apiKey: 't87s_test',
        baseUrl: 'https://test.example.com',
        verify: verifyCallback,
        // No verifyPercent - should default to 0.05
      });

      const entry = createEntry({ name: 'cached' });

      // Test when random returns 0.04 (should verify, < 0.05)
      mathRandomSpy.mockReturnValueOnce(0.04);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entry }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await adapter.get('key1');

      await vi.waitFor(() => {
        expect(verifyCallback).toHaveBeenCalledTimes(1);
      });

      // Test when random returns 0.06 (should NOT verify, >= 0.05)
      mathRandomSpy.mockReturnValueOnce(0.06);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entry }),
      });

      await adapter.get('key2');

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should still only have 1 call from before
      expect(verifyCallback).toHaveBeenCalledTimes(1);

      mathRandomSpy.mockRestore();
    });

    it('should work without verify option (backwards compatible)', async () => {
      const adapter = new CloudAdapter({
        apiKey: 't87s_test',
        baseUrl: 'https://test.example.com',
        // No verify option
      });

      const entry = createEntry({ name: 'test' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entry }),
      });

      const result = await adapter.get('my-key');

      expect(result).toEqual(entry);
      // Only one fetch call (no verification)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
