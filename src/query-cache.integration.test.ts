// src/query-cache.integration.test.ts
import { describe, it, expect } from 'vitest';
import { QueryCache, at, wild, MemoryAdapter } from './index.js';

describe('QueryCache integration', () => {
  it('full workflow: define, query, invalidate, primitives', async () => {
    const db = {
      members: new Map([
        [
          'org1',
          [
            { id: 'u1', name: 'Alice' },
            { id: 'u2', name: 'Bob' },
          ],
        ],
      ]),
      settings: new Map([['org1', { theme: 'dark' }]]),
    };

    const cache = QueryCache({
      schema: at('orgs', () => wild(() => at('members', () => wild).at('settings'))).at('global'),
      adapter: new MemoryAdapter(),
      defaultTtl: '1m',
      defaultGrace: false, // Disable grace to test invalidation directly
      queries: (tags) => ({
        getMembers: (orgId: string) => ({
          tags: [tags.orgs(orgId).members],
          fn: async () => db.members.get(orgId) ?? [],
        }),
        getMember: (orgId: string, memberId: string) => ({
          tags: [tags.orgs(orgId).members(memberId)],
          fn: async () => db.members.get(orgId)?.find((m) => m.id === memberId),
        }),
        getSettings: (orgId: string) => ({
          tags: [tags.orgs(orgId).settings],
          fn: async () => db.settings.get(orgId),
        }),
      }),
    });

    // Query
    const members = await cache.getMembers('org1');
    expect(members).toHaveLength(2);

    const alice = await cache.getMember('org1', 'u1');
    expect(alice?.name).toBe('Alice');

    // Modify data
    db.members.set('org1', [
      { id: 'u1', name: 'Alice Updated' },
      { id: 'u2', name: 'Bob' },
    ]);

    // Still cached
    expect((await cache.getMember('org1', 'u1'))?.name).toBe('Alice');

    // Invalidate
    await cache.invalidate(cache.tags.orgs('org1').members('u1'));
    expect((await cache.getMember('org1', 'u1'))?.name).toBe('Alice Updated');

    // Hierarchical invalidation
    db.settings.set('org1', { theme: 'light' });
    await cache.invalidate(cache.tags.orgs('org1'));
    expect((await cache.getSettings('org1'))?.theme).toBe('light');

    // Primitives escape hatch
    await cache.primitives.set(
      'custom-key',
      { custom: true },
      {
        tags: [['custom']],
        ttl: '1m',
      }
    );
    const custom = await cache.primitives.get<{ custom: boolean }>('custom-key');
    expect(custom?.custom).toBe(true);
  });
});
