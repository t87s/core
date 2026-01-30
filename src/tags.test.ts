import { describe, it, expect } from 'vitest';
import { isTagPrefix, serializeTag, deserializeTag } from './tags.js';

describe('isTagPrefix', () => {
  it('should return true for exact match', () => {
    expect(isTagPrefix(['user', '123'], ['user', '123'])).toBe(true);
  });

  it('should return true when prefix matches', () => {
    expect(isTagPrefix(['user', '123'], ['user', '123', 'posts'])).toBe(true);
    expect(isTagPrefix(['user'], ['user', '123', 'posts'])).toBe(true);
  });

  it('should return false when prefix does not match', () => {
    expect(isTagPrefix(['user', '123'], ['user', '456'])).toBe(false);
    expect(isTagPrefix(['team'], ['user', '123'])).toBe(false);
  });

  it('should return false when prefix is longer than tag', () => {
    expect(isTagPrefix(['user', '123', 'posts'], ['user', '123'])).toBe(false);
  });
});

describe('serializeTag / deserializeTag', () => {
  it('should round-trip simple tags', () => {
    const tag = ['user', '123'];
    expect(deserializeTag(serializeTag(tag))).toEqual(tag);
  });

  it('should round-trip tags with special characters', () => {
    const tag = ['user', 'id:with:colons', 'data|pipe'];
    expect(deserializeTag(serializeTag(tag))).toEqual(tag);
  });

  it('should handle empty parts', () => {
    const tag = ['user', '', 'posts'];
    expect(deserializeTag(serializeTag(tag))).toEqual(tag);
  });
});
