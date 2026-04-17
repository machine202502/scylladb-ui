import type { TabStripProps } from "../types/ui/Tabs.types";
import "./Tabs.css";

export function TabStrip({ tabs, activeId, onChange, children }: TabStripProps) {
  return (
    <>
      <div className="tabStrip">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tabStrip__tab${activeId === t.id ? " tabStrip__tab_active" : ""}`}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {children}
    </>
  );
}
