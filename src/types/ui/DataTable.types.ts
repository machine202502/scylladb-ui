import type { JsonRow } from "../scylla/scylla.types";

export type DataTableProps = {
  columns: string[];
  rows: JsonRow[];
  /** Column names whose cells (and headers) are right-aligned — e.g. numeric metadata. */
  rightAlignColumns?: string[];
};
