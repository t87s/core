import type { StorageAdapter, CacheEntry } from '../types.js';

export interface CloudAdapterOptions {
  apiKey: string;
  baseUrl?: string;
}

/**
 * Cloud storage adapter that talks to t87s cloud service.
 */
export class CloudAdapter implements StorageAdapter {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: CloudAdapterOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://t87s-cloud.mike-solomon.workers.dev';
  }

  private async request<T>(endpoint: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error((error as { error?: string }).error ?? `HTTP ${res.status}`);
    }

    return res.json() as T;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const response = await this.request<{ entry: CacheEntry<T> | null }>(
      '/v1/cache/get',
      { key }
    );
    return response.entry as CacheEntry<T> | null;
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    await this.request<{ ok: true }>('/v1/cache/set', { key, entry });
  }

  async delete(key: string): Promise<void> {
    await this.request<{ ok: true }>('/v1/cache/delete', { key });
  }

  async getTagInvalidationTime(tag: string[]): Promise<number | null> {
    // Note: This is rarely called directly. The cloud service checks
    // tag invalidation times server-side during get().
    // This method is mainly for debugging.
    //
    // For now, return null. Could add a /v1/tag/get endpoint later.
    return null;
  }

  async setTagInvalidationTime(tag: string[], timestamp: number): Promise<void> {
    // Invalidation is done via /v1/invalidate endpoint.
    // This method is called by the client's mutation(), which should
    // call invalidate() instead.
    await this.request<{ ok: true; invalidatedAt: number }>(
      '/v1/invalidate',
      { tags: [tag], exact: true }
    );
  }

  async clear(): Promise<void> {
    await this.request<{ ok: true }>('/v1/clear', {});
  }

  async disconnect(): Promise<void> {
    // No-op for cloud adapter
  }
}
