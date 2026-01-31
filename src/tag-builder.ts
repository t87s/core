// src/tag-builder.ts
import type { AtNode, WildNode, AtBuilder, WildBuilder } from './schema.js';
import type { TypedTag, SchemaToTags } from './query-cache-types.js';

const TAG_BRAND = Symbol.for('t87s.tag.brand');

function createTag(path: string[]): TypedTag {
  return {
    [TAG_BRAND]: true,
    __path: path,
  } as unknown as TypedTag;
}

type SchemaNode =
  | AtBuilder<string, unknown, unknown>
  | AtNode<string, unknown, unknown>
  | WildBuilder<unknown, unknown>
  | WildNode<unknown, unknown>;

function buildTagsFromAt(
  schema: AtNode<string, unknown, unknown> | AtBuilder<string, unknown, unknown>,
  currentPath: string[]
): Record<string, unknown> {
  const path = [...currentPath, schema._name];
  const tag = createTag(path);

  // Check if children is a wild node - if so, the tag itself becomes callable
  // Note: wild can be a function, so we check both object and function types
  if (
    schema._children &&
    (typeof schema._children === 'object' || typeof schema._children === 'function') &&
    '_tag' in schema._children
  ) {
    const child = schema._children as SchemaNode;
    if (child._tag === 'wild') {
      // When child is wild, this at node becomes a callable wild function
      const wildResult = buildTagsFromWild(child as WildNode<unknown, unknown>, path);
      // The wildResult is already a function with __path set to the wild's parent path
      // We need to update its __path to the current at node's path
      Object.assign(wildResult, { __path: path });

      // Add siblings from the wild node
      let wildSiblingTags = {};
      if (child._siblings && typeof child._siblings === 'object') {
        wildSiblingTags = buildSiblings(child._siblings as Record<string, SchemaNode>, path);
      }
      Object.assign(wildResult, wildSiblingTags);

      // Get siblings at the at level
      let siblingTags = {};
      if (schema._siblings && typeof schema._siblings === 'object') {
        siblingTags = buildSiblings(schema._siblings as Record<string, SchemaNode>, currentPath);
      }

      return {
        [schema._name]: wildResult,
        ...siblingTags,
      };
    } else if (child._tag === 'at') {
      // at child - add its properties to current tag
      const childTags = buildTagsFromAt(child as AtNode<string, unknown, unknown>, path);
      Object.assign(tag, childTags);
    }
  }

  // Get siblings at the at level
  let siblingTags = {};
  if (schema._siblings && typeof schema._siblings === 'object') {
    siblingTags = buildSiblings(schema._siblings as Record<string, SchemaNode>, currentPath);
  }

  return {
    [schema._name]: tag,
    ...siblingTags,
  };
}

function buildTagsFromWild(
  schema: WildNode<unknown, unknown> | WildBuilder<unknown, unknown>,
  currentPath: string[]
): ((id: string) => TypedTag) & Record<string, unknown> {
  const wildFn = (id: string): unknown => {
    const path = [...currentPath, id];
    const tag = createTag(path);

    if (
      schema._children &&
      (typeof schema._children === 'object' || typeof schema._children === 'function') &&
      '_tag' in schema._children
    ) {
      const child = schema._children as SchemaNode;
      if (child._tag === 'at') {
        const childTags = buildTagsFromAt(child as AtNode<string, unknown, unknown>, path);
        return Object.assign(tag, childTags);
      } else if (child._tag === 'wild') {
        // Nested wild - make the result callable
        const nestedWild = buildTagsFromWild(child as WildNode<unknown, unknown>, path);
        Object.assign(nestedWild, { __path: path });
        return nestedWild;
      }
    }

    return tag;
  };

  // Make the function itself also a tag (for the path without ID)
  Object.assign(wildFn, createTag(currentPath));

  // Note: siblings of wild are handled by the parent at node (buildTagsFromAt)
  // because wild siblings appear at the same level as the at node containing the wild

  return wildFn as ((id: string) => TypedTag) & Record<string, unknown>;
}

function buildSiblings(
  siblings: Record<string, SchemaNode>,
  currentPath: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [, value] of Object.entries(siblings)) {
    if (value && typeof value === 'object' && '_tag' in value) {
      const node = value as SchemaNode;
      if (node._tag === 'at') {
        Object.assign(
          result,
          buildTagsFromAt(node as AtNode<string, unknown, unknown>, currentPath)
        );
      } else if (node._tag === 'wild') {
        Object.assign(result, buildTagsFromWild(node as WildNode<unknown, unknown>, currentPath));
      }
    }
  }

  return result;
}

export function createTagBuilder<S>(schema: S): SchemaToTags<S> {
  const s = schema as unknown as SchemaNode;
  if (s._tag === 'at') {
    return buildTagsFromAt(s as AtNode<string, unknown, unknown>, []) as SchemaToTags<S>;
  } else if (s._tag === 'wild') {
    return buildTagsFromWild(s as WildNode<unknown, unknown>, []) as SchemaToTags<S>;
  }
  return {} as SchemaToTags<S>;
}
