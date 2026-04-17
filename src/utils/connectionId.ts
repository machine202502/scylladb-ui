import type { SavedConnection } from "../types/scylla/scylla.types";

export function normalizeConnId(id: unknown): number {
  if (typeof id === "number" && Number.isFinite(id)) return id;
  const n = Number(id);
  return Number.isFinite(n) ? n : NaN;
}

export function normalizeSavedList(list: SavedConnection[]): SavedConnection[] {
  return list
    .map((c) => {
      const id = normalizeConnId(c.id);
      return Number.isFinite(id) ? { ...c, id } : null;
    })
    .filter((c): c is SavedConnection => c != null);
}
