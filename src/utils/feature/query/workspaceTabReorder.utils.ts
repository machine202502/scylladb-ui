/** Reorder by moving item at fromIndex before the item that was at toIndex (toIndex in the original array). */
export function reorderTabIndices<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  let insertAt = toIndex;
  if (fromIndex < toIndex) insertAt = toIndex - 1;
  next.splice(insertAt, 0, item);
  return next;
}
