// =============================================================================
// Schema Node Types (for type inference)
// =============================================================================

export interface AtNode<Name extends string = string, Children = never, Siblings = never> {
  readonly _tag: 'at';
  readonly _name: Name;
  readonly _children: Children;
  readonly _siblings: Siblings;
}

export interface WildNode<Children = never, Siblings = never> {
  readonly _tag: 'wild';
  readonly _children: Children;
  readonly _siblings: Siblings;
}

// =============================================================================
// Schema Builder Interfaces
// =============================================================================

export interface AtBuilder<Name extends string, Children, Siblings> extends AtNode<
  Name,
  Children,
  Siblings
> {
  at<N extends string>(name: N): AtBuilder<Name, Children, Siblings | AtNode<N>>;
  at<N extends string, C>(
    name: N,
    child: () => C
  ): AtBuilder<Name, Children, Siblings | AtNode<N, C>>;
}

export interface WildBuilder<Children, Siblings> extends WildNode<Children, Siblings> {
  at<N extends string>(name: N): WildBuilder<Children, Siblings | AtNode<N>>;
  at<N extends string, C>(name: N, child: () => C): WildBuilder<Children, Siblings | AtNode<N, C>>;
}

// =============================================================================
// Runtime Implementation
// =============================================================================

function createAtBuilder<Name extends string, Children, Siblings>(
  name: Name,
  children: Children,
  siblings: Siblings
): AtBuilder<Name, Children, Siblings> {
  return {
    _tag: 'at',
    _name: name,
    _children: children,
    _siblings: siblings,
    at: ((n: string, child?: () => unknown) => {
      const childValue = child ? child() : undefined;
      const newSibling = child
        ? { _tag: 'at' as const, _name: n, _children: childValue, _siblings: undefined as never }
        : {
            _tag: 'at' as const,
            _name: n,
            _children: undefined as never,
            _siblings: undefined as never,
          };
      const mergedSiblings = siblings
        ? { ...(siblings as object), [n]: newSibling }
        : { [n]: newSibling };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Runtime doesn't track union accumulation
      return createAtBuilder(name, children, mergedSiblings as any);
    }) as AtBuilder<Name, Children, Siblings>['at'],
  };
}

function createWildBuilder<Children, Siblings>(
  children: Children,
  siblings: Siblings
): WildBuilder<Children, Siblings> {
  return {
    _tag: 'wild',
    _children: children,
    _siblings: siblings,
    at: ((n: string, child?: () => unknown) => {
      const childValue = child ? child() : undefined;
      const newSibling = child
        ? { _tag: 'at' as const, _name: n, _children: childValue, _siblings: undefined as never }
        : {
            _tag: 'at' as const,
            _name: n,
            _children: undefined as never,
            _siblings: undefined as never,
          };
      const mergedSiblings = siblings
        ? { ...(siblings as object), [n]: newSibling }
        : { [n]: newSibling };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Runtime doesn't track union accumulation
      return createWildBuilder(children, mergedSiblings as any);
    }) as WildBuilder<Children, Siblings>['at'],
  };
}

// =============================================================================
// Public API
// =============================================================================

export function at<N extends string>(name: N): AtBuilder<N, never, never>;
export function at<N extends string, C>(name: N, child: () => C): AtBuilder<N, C, never>;
export function at<N extends string, C>(name: N, child?: () => C): AtBuilder<N, C, never> {
  const children = child ? child() : (undefined as never);
  return createAtBuilder(name, children, undefined as never);
}

export interface Wild extends WildBuilder<never, never> {
  <C>(child: () => C): WildBuilder<C, never>;
}

const wildImpl = function <C>(child?: () => C): WildBuilder<C, never> {
  const children = child ? child() : (undefined as never);
  return createWildBuilder(children, undefined as never);
} as Wild;

export const wild: Wild = Object.assign(wildImpl, {
  _tag: 'wild' as const,
  _children: undefined as never,
  _siblings: undefined as never,
  at: ((n: string, child?: () => unknown) => {
    const childValue = child ? child() : undefined;
    const newSibling = child
      ? { _tag: 'at' as const, _name: n, _children: childValue, _siblings: undefined as never }
      : {
          _tag: 'at' as const,
          _name: n,
          _children: undefined as never,
          _siblings: undefined as never,
        };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Runtime doesn't track union accumulation
    return createWildBuilder(undefined as never, { [n]: newSibling } as any);
  }) as WildBuilder<never, never>['at'],
});
