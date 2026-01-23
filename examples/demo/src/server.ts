import express from 'express';
import { T87s, defineTags, MemoryAdapter } from '@t87s/core';
import { db, User } from './db.js';
import * as output from './output.js';

// Define cache tags with hierarchical structure
// user(id) -> ['user', id]
// userPosts(id) -> ['user', id, 'posts']
// This means invalidating user(id) also invalidates userPosts(id) via prefix matching
const tags = defineTags({
  user: (id: string) => ['user', id],
  userPosts: (id: string) => ['user', id, 'posts'],
});

// Create t87s client with memory adapter
const cache = new T87s({
  adapter: new MemoryAdapter(),
  prefix: 'demo',
  defaultTtl: '5m',
  defaultGrace: '1m',
});

// Track cache state for demo output
let lastCacheState: 'hit' | 'miss' | null = null;
let requestStartTime = 0;

function trackStart(): void {
  requestStartTime = Date.now();
  lastCacheState = null;
}

function trackCacheAccess(wasHit: boolean): void {
  lastCacheState = wasHit ? 'hit' : 'miss';
}

function logCacheResult(): void {
  const elapsed = Date.now() - requestStartTime;
  if (lastCacheState === 'hit') {
    output.cacheHit(elapsed);
  } else {
    output.cacheMiss(elapsed);
  }
}

// Create cached query for getUser
const getUser = cache.query(function getUser(id: string) {
  return {
    tags: [tags.user(id)],
    fn: async () => {
      const result = await db.users.findById(id);
      trackCacheAccess(false); // If fn runs, it's a miss
      return result;
    },
    ttl: '5m',
  };
});

// Wrap to detect cache hits (when fn doesn't run)
async function getUserCached(id: string): Promise<User | null> {
  trackStart();
  lastCacheState = 'hit'; // Assume hit, will be set to miss if fn runs
  const result = await getUser(id);
  logCacheResult();
  return result;
}

// Create cached query for getUserPosts
const getUserPosts = cache.query(function getUserPosts(id: string) {
  return {
    tags: [tags.userPosts(id)],
    fn: async () => {
      const result = await db.posts.findByAuthor(id);
      trackCacheAccess(false); // If fn runs, it's a miss
      return result;
    },
    ttl: '5m',
  };
});

// Wrap to detect cache hits
async function getUserPostsCached(id: string) {
  trackStart();
  lastCacheState = 'hit'; // Assume hit, will be set to miss if fn runs
  const result = await getUserPosts(id);
  logCacheResult();
  return result;
}

// Create mutation for updateUser that invalidates user cache
// Invalidating user(id) will also invalidate userPosts(id) via prefix matching
const updateUser = cache.mutation(async function updateUser(
  id: string,
  data: Partial<User>
) {
  const result = await db.users.update(id, data);
  return {
    result,
    invalidates: [tags.user(id)], // This invalidates user AND userPosts via prefix
  };
});

// Wrap to log invalidation
async function updateUserWithLog(
  id: string,
  data: Partial<User>
): Promise<User | null> {
  const result = await updateUser(id, data);
  output.invalidated([`user:${id}`], 1); // 1 prefix match (userPosts)
  return result;
}

// Create Express app
const app = express();
app.use(express.json());

// GET /users/:id - Fetch user (cached)
app.get('/users/:id', async (req, res) => {
  const { id } = req.params;
  const user = await getUserCached(id);

  if (!user) {
    output.json({ error: 'User not found' });
    return res.status(404).json({ error: 'User not found' });
  }

  output.json(user);
  res.json(user);
});

// GET /users/:id/posts - Fetch user's posts (cached)
app.get('/users/:id/posts', async (req, res) => {
  const { id } = req.params;
  const posts = await getUserPostsCached(id);
  output.json(posts);
  res.json(posts);
});

// PUT /users/:id - Update user (invalidates cache)
app.put('/users/:id', async (req, res) => {
  const { id } = req.params;
  const user = await updateUserWithLog(id, req.body);

  if (!user) {
    output.json({ error: 'User not found' });
    return res.status(404).json({ error: 'User not found' });
  }

  output.json(user);
  res.json(user);
});

// Export for use by demo script
export { app, cache };

// Start server if run directly
const PORT = process.env.PORT || 3000;

if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    output.header('t87s Demo Server');
    output.info(`Server running at http://localhost:${PORT}`);
    output.info('');
    output.info('Try these endpoints:');
    output.info('  GET  /users/:id       - Fetch user (cached)');
    output.info('  GET  /users/:id/posts - Fetch user posts (cached)');
    output.info('  PUT  /users/:id       - Update user (invalidates cache)');
    output.info('');
    output.info('Demo flow:');
    output.info('  1. GET /users/123        -> MISS (first request)');
    output.info('  2. GET /users/123        -> HIT  (cached!)');
    output.info('  3. GET /users/123/posts  -> MISS (first request)');
    output.info('  4. PUT /users/123        -> Invalidates user:123 + prefix matches');
    output.info('  5. GET /users/123        -> MISS (invalidated)');
    output.info('  6. GET /users/123/posts  -> MISS (prefix invalidated!)');
  });
}
