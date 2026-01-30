/**
 * Opaque type for tags.
 */
declare const TAG_BRAND: unique symbol;
export type Tag = string[] & { readonly [TAG_BRAND]: true };

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
