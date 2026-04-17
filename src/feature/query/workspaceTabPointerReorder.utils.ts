export const WORKSPACE_TAB_INDEX_ATTR = "data-workspace-tab-index";

export function readTabIndexFromPoint(clientX: number, clientY: number): number | null {
  for (const node of document.elementsFromPoint(clientX, clientY)) {
    if (!(node instanceof Element)) continue;
    const wrap = node.closest(`[${WORKSPACE_TAB_INDEX_ATTR}]`);
    if (wrap) {
      const raw = wrap.getAttribute(WORKSPACE_TAB_INDEX_ATTR);
      const n = raw != null ? parseInt(raw, 10) : NaN;
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}
