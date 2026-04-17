import type { CSSProperties } from "react";
import type { TreeSelection } from "../../../../types/feature/scylla/useScyllaWorkspace.types";

export function treeRowPad(depth: number): CSSProperties {
  return { paddingLeft: depth === 0 ? undefined : `calc(${depth} * var(--layout-tree-indent-step))` };
}

export function treeSelectionMatches(
  sel: TreeSelection,
  connId: number,
  pred: (s: NonNullable<TreeSelection>) => boolean,
): boolean {
  return sel != null && sel.connId === connId && pred(sel);
}

export function explorerCaretShowsLoader(
  open: boolean,
  q: { isPending: boolean; isFetching: boolean; data: unknown },
): boolean {
  return open && (q.isPending || (q.isFetching && q.data === undefined));
}
