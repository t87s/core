import type { StorageAdapter, CacheEntry, VerifyCallback } from '../types.js';

export interface CloudAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  /** Callback to fetch fresh data for verification */
  verify?: VerifyCallback;
  /** Sampling rate for verification (0.0-1.0), default 0.05 (5%) */
  verifyPercent?: number;
}

/**
 * Simple hash function for comparing values.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * Cloud storage adapter that talks to t87s cloud service.
 */
export class CloudAdapter implements StorageAdapter {
  private apiKey: string;
  private baseUrl: string;
  private verify?: VerifyCallback;
  private verifyPercent: number;

  constructor(options: CloudAdapterOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://t87s-cloud.mike-solomon.workers.dev';
    this.verify = options.verify;
    this.verifyPercent = options.verifyPercent ?? 0.05;
  }

  /**
   * Determines if this request should be sampled for verification.
   */
  private shouldVerify(): boolean {
    if (!this.verify) return false;
    if (this.verifyPercent <= 0) return false;
    if (this.verifyPercent >= 1) return true;
    return Math.random() < this.verifyPercent;
  }

  /**
   * Runs background verification and sends report to /v1/verify.
   * Errors are silently caught to avoid affecting the main request.
   */
  private async runVerification<T>(key: string, cachedValue: T): Promise<void> {
    try {
      if (!this.verify) return;

      const freshValue = await this.verify(key, cachedValue);

      const cachedHash = simpleHash(JSON.stringify(cachedValue));
      const freshHash = simpleHash(JSON.stringify(freshValue));
      const isStale = cachedHash !== freshHash;

      // Fire-and-forget report to /v1/verify
      this.request<{ ok: true }>('/v1/verify', {
        key,
        cachedHash,
        freshHash,
        isStale,
        timestamp: Date.now(),
      }).catch(() => {
        // Silently ignore errors in reporting
      });
    } catch {
      // Silently catch verification errors
    }
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
    const entry = response.entry as CacheEntry<T> | null;

    // On cache hit, potentially run background verification
    if (entry !== null && this.shouldVerify()) {
      // Don't await - run in background
      this.runVerification(key, entry.value);
    }

    return entry;
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
