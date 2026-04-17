import { TREE_CARET_CLOSED, TREE_CARET_OPEN } from "../../../constants/feature/explorer/connectionsTree.constants";
import type { TreeCaretProps } from "../../../types/feature/explorer/connectionsTree/TreeCaret.types";

export function TreeCaret({ open, loading, className, ...rest }: TreeCaretProps) {
  const cn = className ? `treeNav__caret ${className}` : "treeNav__caret";
  return (
    <button type="button" className={cn} {...rest} aria-expanded={open} aria-busy={loading ?? false}>
      {loading ? <span className="connectionsTree__caretLoader" aria-hidden /> : open ? TREE_CARET_OPEN : TREE_CARET_CLOSED}
    </button>
  );
}
