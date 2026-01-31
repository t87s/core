/**
 * Serialize a tag to a string key for storage.
 * Uses backslash escaping: \\ for literal backslash, \: for literal colon
 */
export function serializeTag(tag: string[]): string {
  return tag.map((part) => part.replace(/\\/g, '\\\\').replace(/:/g, '\\:')).join(':');
}
