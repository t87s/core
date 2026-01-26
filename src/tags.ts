/**
 * Opaque type for tags. Created via defineTags() to ensure type safety.
 */
declare const TAG_BRAND: unique symbol;
export type Tag = string[] & { readonly [TAG_BRAND]: true };

/**
 * Tag definition: a function that returns a tag path.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TagDefinition = (...args: any[]) => (string | number)[];

/**
 * Mapped type that converts tag definitions to tag factories.
 */
type TagFactories<T extends Record<string, TagDefinition>> = {
  [K in keyof T]: (...args: Parameters<T[K]>) => Tag;
};

/**
 * Create a Tag from parts. Internal use only.
 */
function createTag(parts: (string | number)[]): Tag {
  return parts.map(String) as Tag;
}

/**
 * Define a centralized set of cache tags.
 *
 * @example
 * ```typescript
 * const tags = defineTags({
 *   user: (id: string) => ['user', id],
 *   userPosts: (id: string) => ['user', id, 'posts'],
 * });
 * ```
 */
export function defineTags<T extends Record<string, TagDefinition>>(
  definitions: T
): TagFactories<T> {
  const factories = {} as TagFactories<T>;

  for (const [name, definition] of Object.entries(definitions)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (factories as any)[name] = (...args: unknown[]) => createTag(definition(...args));
  }

  return factories;
}

/**
 * Check if a tag is a prefix of another tag.
 */
export function isTagPrefix(prefix: string[], tag: string[]): boolean {
  if (prefix.length > tag.length) {
    return false;
  }
  return prefix.every((part, i) => tag[i] === part);
}

/**
 * Serialize a tag to a string key for storage.
 * Uses backslash escaping: \\ for literal backslash, \: for literal colon
 */
export function serializeTag(tag: string[]): string {
  return tag.map((part) => part.replace(/\\/g, '\\\\').replace(/:/g, '\\:')).join(':');
}

/**
 * Deserialize a tag key back to a string array.
 */
export function deserializeTag(key: string): string[] {
  const parts: string[] = [];
  let current = '';
  let i = 0;

  while (i < key.length) {
    if (key[i] === '\\' && i + 1 < key.length) {
      // Escaped character: take the next character literally
      current += key[i + 1];
      i += 2;
    } else if (key[i] === ':') {
      // Unescaped colon: separator
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
