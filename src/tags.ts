import type { Tag } from './types.js';

/**
 * Tag definition: a function that takes arguments and returns a tag path.
 */
type TagDefinition = (...args: any[]) => (string | number)[];

/**
 * Mapped type that converts tag definitions to tag factories.
 * Each factory returns an opaque Tag type.
 */
type TagFactories<T extends Record<string, TagDefinition>> = {
  [K in keyof T]: (...args: Parameters<T[K]>) => Tag;
};

/**
 * Create an internal Tag from a string array.
 * This is the only way to create a Tag - ensures type safety.
 */
function createTag(parts: (string | number)[]): Tag {
  return parts.map(String) as Tag;
}

/**
 * Define a centralized set of cache tags.
 *
 * Tags are the unit of cache invalidation. By defining them centrally,
 * you get type safety, autocomplete, and prevent typos.
 *
 * @example
 * ```typescript
 * const tags = defineTags({
 *   user: (id: string) => ['user', id],
 *   userPosts: (id: string) => ['user', id, 'posts'],
 *   team: (id: string) => ['team', id],
 * });
 *
 * // Usage in queries
 * const getUser = t87s.query((id: string) => ({
 *   tags: [tags.user(id)],
 *   fn: async () => db.users.find(id),
 * }));
 *
 * // Usage in mutations
 * const updateUser = t87s.mutation(async (id: string, data) => ({
 *   result: await db.users.update(id, data),
 *   invalidates: [tags.user(id)],
 * }));
 * ```
 */
export function defineTags<T extends Record<string, TagDefinition>>(
  definitions: T
): TagFactories<T> {
  const factories = {} as TagFactories<T>;

  for (const [name, definition] of Object.entries(definitions)) {
    (factories as any)[name] = (...args: any[]) => {
      const parts = definition(...args);
      return createTag(parts);
    };
  }

  return factories;
}

/**
 * Check if a tag is a prefix of another tag.
 * Used for prefix-matching invalidation.
 *
 * @example
 * isTagPrefix(['user', '123'], ['user', '123', 'posts']) // true
 * isTagPrefix(['user', '123'], ['user', '456']) // false
 * isTagPrefix(['user', '123'], ['user', '123']) // true (exact match)
 */
export function isTagPrefix(prefix: string[], tag: string[]): boolean {
  if (prefix.length > tag.length) {
    return false;
  }
  return prefix.every((part, i) => tag[i] === part);
}

/**
 * Serialize a tag to a string key for storage.
 */
export function serializeTag(tag: string[]): string {
  // Use a delimiter that's unlikely to appear in tag parts
  // Escape any existing delimiters in the parts
  return tag.map((part) => part.replace(/:/g, '::').replace(/\|/g, '||')).join(':');
}

/**
 * Deserialize a tag key back to a string array.
 */
export function deserializeTag(key: string): string[] {
  // Split on single colons (not double)
  const parts: string[] = [];
  let current = '';
  let i = 0;

  while (i < key.length) {
    if (key[i] === ':' && key[i + 1] === ':') {
      current += ':';
      i += 2;
    } else if (key[i] === '|' && key[i + 1] === '|') {
      current += '|';
      i += 2;
    } else if (key[i] === ':') {
      parts.push(current);
      current = '';
      i += 1;
    } else {
      current += key[i];
      i += 1;
    }
  }

  parts.push(current);
  return parts;
}
