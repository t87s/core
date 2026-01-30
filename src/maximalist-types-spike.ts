/**
 * Maximalist Types Spike
 *
 * Goal: Test if at/wild schema inference works at the type level.
 * No runtime implementation yet — just types.
 */

// =============================================================================
// Schema Types
// =============================================================================

/** Marker for static path segments */
interface AtNode<Name extends string, Children = never, Siblings = never> {
  readonly _tag: 'at';
  readonly _name: Name;
  readonly _children: Children;
  readonly _siblings: Siblings;
}

/** Marker for dynamic path segments (takes an ID at call time) */
interface WildNode<Children = never, Siblings = never> {
  readonly _tag: 'wild';
  readonly _children: Children;
  readonly _siblings: Siblings;
}

type SchemaNode = AtNode<string, any, any> | WildNode<any, any>;

// =============================================================================
// Schema Builders
// =============================================================================

interface AtBuilder<Name extends string, Children, Siblings> {
  readonly _tag: 'at';
  readonly _name: Name;
  readonly _children: Children;
  readonly _siblings: Siblings;
  at<N extends string>(name: N): AtBuilder<Name, Children, Siblings | AtNode<N>>;
  at<N extends string, C>(
    name: N,
    child: () => C
  ): AtBuilder<Name, Children, Siblings | AtNode<N, C>>;
}

interface WildBuilder<Children, Siblings> {
  readonly _tag: 'wild';
  readonly _children: Children;
  readonly _siblings: Siblings;
  at<N extends string>(name: N): WildBuilder<Children, Siblings | AtNode<N>>;
  at<N extends string, C>(
    name: N,
    child: () => C
  ): WildBuilder<Children, Siblings | AtNode<N, C>>;
}

// at() overloads
function at<N extends string>(name: N): AtBuilder<N, never, never>;
function at<N extends string, C>(
  name: N,
  child: () => C
): AtBuilder<N, C, never>;
function at(name: string, child?: () => any): any {
  // Runtime implementation later
  return null as any;
}

// wild as dual-nature: value + callable
interface Wild extends WildBuilder<never, never> {
  <C>(child: () => C): WildBuilder<C, never>;
}

const wild: Wild = null as any; // Runtime implementation later

// =============================================================================
// Tag Builder Types (what users get from the schema)
// =============================================================================

/** Convert union to intersection: A | B | C => A & B & C */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

/** Process siblings - convert union of nodes to intersection of tag objects */
type SiblingsToTags<S> = [S] extends [never] ? {} : UnionToIntersection<SchemaToTagsSingle<S>>;

/** Convert a single schema node (non-distributive over unions) */
type SchemaToTagsSingle<S> = S extends AtBuilder<infer Name, infer Children, infer Siblings>
  ? { [K in Name]: TagBranch<Children> } & SiblingsToTags<Siblings>
  : S extends AtNode<infer Name, infer Children, infer Siblings>
  ? { [K in Name]: TagBranch<Children> } & SiblingsToTags<Siblings>
  : S extends WildBuilder<infer Children, infer Siblings>
  ? ((id: string) => TagBranch<Children>) & SiblingsToTags<Siblings>
  : S extends WildNode<infer Children, infer Siblings>
  ? ((id: string) => TagBranch<Children>) & SiblingsToTags<Siblings>
  : {};

/** Convert schema to tag builder type (distributes over unions) */
type SchemaToTags<S> = UnionToIntersection<SchemaToTagsSingle<S>>;

/** A branch in the tag tree - can be called (if wild) or accessed (if at) */
type TagBranch<Children> = [Children] extends [never]
  ? Tag // Terminal
  : Children extends AtBuilder<infer Name, infer C, infer S>
  ? { [K in Name]: TagBranch<C> } & SiblingsToTags<S> & Tag
  : Children extends AtNode<infer Name, infer C, infer S>
  ? { [K in Name]: TagBranch<C> } & SiblingsToTags<S> & Tag
  : Children extends WildBuilder<infer C, infer S>
  ? ((id: string) => TagBranch<C>) & SiblingsToTags<S> & Tag
  : Children extends WildNode<infer C, infer S>
  ? ((id: string) => TagBranch<C>) & SiblingsToTags<S> & Tag
  : Tag;

/** Opaque tag type */
interface Tag {
  readonly __brand: 'Tag';
}

// =============================================================================
// Test Cases
// =============================================================================

// Schema:
// /posts/
// /posts/<id>/
// /posts/<id>/comments/
// /posts/<id>/comments/<id>
// /posts/settings/
// /history/

type TestSchema = AtBuilder<
  'posts',
  WildBuilder<AtBuilder<'comments', WildBuilder<never, never>, never>, AtNode<'settings'>>,
  AtNode<'history'>
>;

// Simulating: at('posts', () => wild(() => at('comments', () => wild)).at('settings')).at('history')

type TestTags = SchemaToTags<TestSchema>;

// Manual tests - these should typecheck:
declare const tags: TestTags;

// Valid paths:
const t1: Tag = tags.posts; // /posts/
const t2: Tag = tags.posts('id'); // /posts/<id>/
const t3: Tag = tags.posts('id').comments; // /posts/<id>/comments/
const t4: Tag = tags.posts('id').comments('cid'); // /posts/<id>/comments/<id>
const t5: Tag = tags.posts.settings; // /posts/settings/
const t6: Tag = tags.history; // /history/

// These should error (uncomment to verify):
// @ts-expect-error - not in schema
const e1 = tags.users;
// @ts-expect-error - missing wild segment
const e2 = tags.posts.comments;
// @ts-expect-error - settings is sibling to wild, not child
const e3 = tags.posts('id').settings;
// @ts-expect-error - history isn't wild
const e4 = tags.history('id');

// =============================================================================
// QueryCache Types (sketch)
// =============================================================================

interface QueryDef<T> {
  tags: Tag[];
  fn: () => Promise<T>;
}

interface QueryCache<Schema> {
  queries<Q extends Record<string, (...args: any[]) => QueryDef<any>>>(
    factory: (tags: SchemaToTags<Schema>) => Q
  ): Client<Schema, Q>;
}

type Client<Schema, Queries extends Record<string, (...args: any[]) => QueryDef<any>>> = {
  [K in keyof Queries]: Queries[K] extends (...args: infer A) => QueryDef<infer T>
    ? (...args: A) => Promise<T>
    : never;
} & {
  tags: SchemaToTags<Schema>;
  invalidate(tag: Tag): Promise<void>;
}

// =============================================================================
// Complex Schema Test
// =============================================================================

// Schema:
// /orgs/<id>/
// /orgs/<id>/members/
// /orgs/<id>/members/<id>/
// /orgs/<id>/members/<id>/roles/
// /orgs/<id>/projects/
// /orgs/<id>/projects/<id>/
// /orgs/<id>/projects/<id>/tasks/
// /orgs/<id>/projects/<id>/tasks/<id>/
// /orgs/<id>/projects/<id>/tasks/<id>/comments/
// /orgs/<id>/projects/<id>/tasks/<id>/comments/<id>/
// /orgs/<id>/settings/
// /orgs/<id>/billing/
// /orgs/<id>/billing/invoices/
// /orgs/<id>/billing/invoices/<id>/
// /users/
// /users/<id>/
// /users/<id>/preferences/
// /global-config/

type ComplexSchema = AtBuilder<
  'orgs',
  WildBuilder<
    AtBuilder<
      'members',
      WildBuilder<AtBuilder<'roles', never, never>, never>,
      AtNode<'projects', WildBuilder<
        AtBuilder<'tasks', WildBuilder<
          AtBuilder<'comments', WildBuilder<never, never>, never>,
          never
        >, never>,
        never
      >> | AtNode<'settings'> | AtNode<'billing', AtBuilder<'invoices', WildBuilder<never, never>, never>>
    >,
    never
  >,
  AtNode<'users', WildBuilder<AtNode<'preferences'>, never>> | AtNode<'global-config'>
>;

type ComplexTags = SchemaToTags<ComplexSchema>;
declare const ctags: ComplexTags;

// =============================================================================
// Happy Path Tests (should all pass)
// =============================================================================

const h1: Tag = ctags.orgs;
const h2: Tag = ctags.orgs('org-1');
const h3: Tag = ctags.orgs('org-1').members;
const h4: Tag = ctags.orgs('org-1').members('user-1');
const h5: Tag = ctags.orgs('org-1').members('user-1').roles;
const h6: Tag = ctags.orgs('org-1').projects;
const h7: Tag = ctags.orgs('org-1').projects('proj-1');
const h8: Tag = ctags.orgs('org-1').projects('proj-1').tasks;
const h9: Tag = ctags.orgs('org-1').projects('proj-1').tasks('task-1');
const h10: Tag = ctags.orgs('org-1').projects('proj-1').tasks('task-1').comments;
const h11: Tag = ctags.orgs('org-1').projects('proj-1').tasks('task-1').comments('comment-1');
const h12: Tag = ctags.orgs('org-1').settings;
const h13: Tag = ctags.orgs('org-1').billing;
const h14: Tag = ctags.orgs('org-1').billing.invoices;
const h15: Tag = ctags.orgs('org-1').billing.invoices('inv-1');
const h16: Tag = ctags.users;
const h17: Tag = ctags.users('user-1');
const h18: Tag = ctags.users('user-1').preferences;
const h19: Tag = ctags['global-config'];

// =============================================================================
// Error Tests (each should error - check messages)
// =============================================================================

// Error 1: Path doesn't exist at all
// @ts-expect-error
const err1 = ctags.teams;

// Error 2: Missing wild segment
// @ts-expect-error
const err2 = ctags.orgs.members;

// Error 3: Trying to call non-wild as function
// @ts-expect-error
const err3 = ctags.orgs('org-1').settings('setting-1');

// Error 4: Wrong level - tasks is under projects, not directly under orgs
// @ts-expect-error
const err4 = ctags.orgs('org-1').tasks;

// Error 5: Sibling confusion - billing is sibling to projects, not child of projects
// @ts-expect-error
const err5 = ctags.orgs('org-1').projects('proj-1').billing;

// Error 6: Too deep - preferences is under users, not under orgs.members
// @ts-expect-error
const err6 = ctags.orgs('org-1').members('user-1').preferences;

// Error 7: Wrong ID type (number instead of string)
// @ts-expect-error
const err7 = ctags.orgs(123);

// =============================================================================
// QueryCache Closure Tests
// =============================================================================

declare function createQueryCache<S>(schema: S): QueryCache<S>;
declare const complexSchema: ComplexSchema;
const complexCache = createQueryCache(complexSchema);

// Happy path in closure
const goodClient = complexCache.queries((tags) => ({
  getOrgMembers: (orgId: string) => ({
    tags: [tags.orgs(orgId).members],
    fn: async () => [{ id: '1', name: 'Alice' }],
  }),

  getTask: (orgId: string, projId: string, taskId: string) => ({
    tags: [tags.orgs(orgId).projects(projId).tasks(taskId)],
    fn: async () => ({ id: taskId, title: 'Task' }),
  }),

  getBilling: (orgId: string) => ({
    tags: [tags.orgs(orgId).billing],
    fn: async () => ({ plan: 'pro' }),
  }),
}));

// =============================================================================
// Error in Closure Tests - UNCOMMENT ONE AT A TIME TO SEE ERROR MESSAGE
// =============================================================================

// Test: Wrong path in closure
// Error: Property 'teams' does not exist on type '{ members: ...; } & { settings: Tag; } & ...'
// const badClient1 = complexCache.queries((tags) => ({
//   badQuery: (orgId: string) => ({
//     tags: [tags.orgs(orgId).teams],  // 'teams' doesn't exist
//     fn: async () => ({}),
//   }),
// }));

// Test: Missing wild segment in closure
// Error: Property 'members' does not exist on type '((id: string) => ...) & Tag'
// const badClient2 = complexCache.queries((tags) => ({
//   badQuery: () => ({
//     tags: [tags.orgs.members],  // missing org ID
//     fn: async () => ({}),
//   }),
// }));

// Test: Calling non-wild in closure
// Error: This expression is not callable. Type 'Tag' has no call signatures.
// const badClient3 = complexCache.queries((tags) => ({
//   badQuery: (orgId: string) => ({
//     tags: [tags.orgs(orgId).settings('foo')],  // settings isn't wild
//     fn: async () => ({}),
//   }),
// }));
