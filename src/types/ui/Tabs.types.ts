import type { ReactNode } from "react";

export type TabItem = { id: string; label: string };

export type TabStripProps = {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  children: ReactNode;
};
