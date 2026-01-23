// Fake in-memory database for demo purposes

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Post {
  id: string;
  title: string;
  body: string;
  authorId: string;
}

// In-memory storage
const users = new Map<string, User>([
  ['123', { id: '123', name: 'Alice', email: 'alice@example.com' }],
  ['456', { id: '456', name: 'Bob', email: 'bob@example.com' }],
]);

const posts = new Map<string, Post>([
  ['p1', { id: 'p1', title: 'Hello World', body: 'My first post!', authorId: '123' }],
  ['p2', { id: 'p2', title: 'Cache Tips', body: 'Always invalidate...', authorId: '123' }],
  ['p3', { id: 'p3', title: 'Bob here', body: 'Testing 123', authorId: '456' }],
]);

// Simulated latency (ms)
const DB_LATENCY = 30;

async function simulateLatency(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, DB_LATENCY));
}

export const db = {
  users: {
    async findById(id: string): Promise<User | null> {
      await simulateLatency();
      return users.get(id) ?? null;
    },
    async update(id: string, data: Partial<User>): Promise<User | null> {
      await simulateLatency();
      const user = users.get(id);
      if (!user) return null;
      const updated = { ...user, ...data };
      users.set(id, updated);
      return updated;
    },
  },
  posts: {
    async findByAuthor(authorId: string): Promise<Post[]> {
      await simulateLatency();
      return Array.from(posts.values()).filter((p) => p.authorId === authorId);
    },
  },
};
