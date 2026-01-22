import { describe, it, expect } from 'vitest';
import { defineTags, isTagPrefix, serializeTag, deserializeTag } from './tags.js';

describe('defineTags', () => {
  it('should create tag factories from definitions', () => {
    const tags = defineTags({
      user: (id: string) => ['user', id],
      post: (userId: string, postId: number) => ['user', userId, 'post', postId],
    });

    expect(tags.user('123')).toEqual(['user', '123']);
    expect(tags.post('abc', 456)).toEqual(['user', 'abc', 'post', '456']);
  });

  it('should convert numbers to strings in tag parts', () => {
    const tags = defineTags({
      item: (id: number) => ['item', id],
    });

    expect(tags.item(42)).toEqual(['item', '42']);
  });
});

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
