// src/query-cache-types.ts
import type { AtNode, WildNode, AtBuilder, WildBuilder } from './schema.js';
import type { QueryPromise } from './types.js';

// =============================================================================
// Tag Type
// =============================================================================

declare const TAG_BRAND: unique symbol;

/** A typed tag representing a cache invalidation path */
export interface TypedTag {
  readonly [TAG_BRAND]: true;
  /** The path segments (e.g., ['posts', '123', 'comments']) */
  readonly __path: string[];
}

// =============================================================================
// Schema to Tags Type Transformation
// =============================================================================

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Empty object is correct fallback for never siblings
type SiblingsToTags<S> = [S] extends [never] ? {} : UnionToIntersection<SchemaToTagsSingle<S>>;

type SchemaToTagsSingle<S> =
  S extends AtBuilder<infer Name, infer Children, infer Siblings>
    ? { readonly [K in Name]: TagBranch<Children> } & SiblingsToTags<Siblings>
    : S extends AtNode<infer Name, infer Children, infer Siblings>
      ? { readonly [K in Name]: TagBranch<Children> } & SiblingsToTags<Siblings>
      : S extends WildBuilder<infer Children, infer Siblings>
        ? ((id: string) => TagBranch<Children>) & SiblingsToTags<Siblings>
        : S extends WildNode<infer Children, infer Siblings>
          ? ((id: string) => TagBranch<Children>) & SiblingsToTags<Siblings>
          : // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Empty object is correct fallback for unknown schema nodes
            {};

export type SchemaToTags<S> = UnionToIntersection<SchemaToTagsSingle<S>>;

type TagBranch<Children> = [Children] extends [never]
  ? TypedTag
  : Children extends AtBuilder<infer Name, infer C, infer S>
    ? { readonly [K in Name]: TagBranch<C> } & SiblingsToTags<S> & TypedTag
    : Children extends AtNode<infer Name, infer C, infer S>
      ? { readonly [K in Name]: TagBranch<C> } & SiblingsToTags<S> & TypedTag
      : Children extends WildBuilder<infer C, infer S>
        ? ((id: string) => TagBranch<C>) & SiblingsToTags<S> & TypedTag
        : Children extends WildNode<infer C, infer S>
          ? ((id: string) => TagBranch<C>) & SiblingsToTags<S> & TypedTag
          : TypedTag;

// =============================================================================
// Query Definition Types
// =============================================================================

export interface RefreshResult<T> {
  old: T;
  new: T;
  changed: boolean;
}

export interface TypedQueryDef<T> {
  tags: TypedTag[];
  fn: () => Promise<T>;
  ttl?: string | number;
  grace?: string | number | false;
  onRefresh?: (result: RefreshResult<T>) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic query factories require any
export type QueryRecord = Record<string, (...args: any[]) => TypedQueryDef<any>>;

export type QueriesToMethods<Q extends QueryRecord> = {
  readonly [K in keyof Q]: Q[K] extends (...args: infer A) => TypedQueryDef<infer T>
    ? (...args: A) => QueryPromise<T>
    : never;
};
