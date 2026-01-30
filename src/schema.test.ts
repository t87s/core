import { describe, it, expect } from 'vitest';
import { at, wild } from './schema.js';

describe('schema builders', () => {
  it('at() creates a static node', () => {
    const schema = at('posts');
    expect(schema._tag).toBe('at');
    expect(schema._name).toBe('posts');
  });

  it('at() with children', () => {
    const schema = at('posts', () => wild);
    expect(schema._tag).toBe('at');
    expect(schema._children._tag).toBe('wild');
  });

  it('wild as terminal value', () => {
    expect(wild._tag).toBe('wild');
  });

  it('wild() with children', () => {
    const schema = wild(() => at('comments'));
    expect(schema._tag).toBe('wild');
    expect(schema._children._tag).toBe('at');
  });

  it('chaining at() for siblings', () => {
    const schema = at('posts').at('users');
    expect(schema._tag).toBe('at');
    expect(schema._name).toBe('posts');
  });

  it('complex nested schema', () => {
    const schema = at('posts', () => wild(() => at('comments', () => wild)).at('settings')).at(
      'history'
    );
    expect(schema._tag).toBe('at');
    expect(schema._name).toBe('posts');
  });
});
