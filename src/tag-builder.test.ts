// src/tag-builder.test.ts
import { describe, it, expect } from 'vitest';
import { at, wild } from './schema.js';
import { createTagBuilder } from './tag-builder.js';

describe('tag builder', () => {
  it('creates tags from simple schema', () => {
    const schema = at('posts');
    const tags = createTagBuilder(schema);
    expect(tags.posts.__path).toEqual(['posts']);
  });

  it('creates tags with wild children', () => {
    const schema = at('posts', () => wild);
    const tags = createTagBuilder(schema);

    expect(tags.posts.__path).toEqual(['posts']);
    expect(tags.posts('123').__path).toEqual(['posts', '123']);
  });

  it('creates tags with deeply nested structure', () => {
    const schema = at('posts', () => wild(() => at('comments', () => wild)));
    const tags = createTagBuilder(schema);

    expect(tags.posts.__path).toEqual(['posts']);
    expect(tags.posts('p1').__path).toEqual(['posts', 'p1']);
    expect(tags.posts('p1').comments.__path).toEqual(['posts', 'p1', 'comments']);
    expect(tags.posts('p1').comments('c1').__path).toEqual(['posts', 'p1', 'comments', 'c1']);
  });

  it('creates tags with siblings', () => {
    const schema = at('posts').at('users').at('settings');
    const tags = createTagBuilder(schema);

    expect(tags.posts.__path).toEqual(['posts']);
    expect(tags.users.__path).toEqual(['users']);
    expect(tags.settings.__path).toEqual(['settings']);
  });

  it('creates tags with mixed children and siblings', () => {
    const schema = at('posts', () => wild(() => at('comments', () => wild)).at('settings')).at(
      'history'
    );

    const tags = createTagBuilder(schema);

    expect(tags.posts.__path).toEqual(['posts']);
    expect(tags.posts('p1').__path).toEqual(['posts', 'p1']);
    expect(tags.posts('p1').comments.__path).toEqual(['posts', 'p1', 'comments']);
    expect(tags.posts('p1').comments('c1').__path).toEqual(['posts', 'p1', 'comments', 'c1']);
    expect(tags.posts.settings.__path).toEqual(['posts', 'settings']);
    expect(tags.history.__path).toEqual(['history']);
  });
});
