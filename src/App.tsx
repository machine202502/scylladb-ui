import { useState } from "react";
import { Database, ScrollText } from "lucide-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { DbPage } from "./pages/DbPage";
import { LogsPage } from "./pages/LogsPage";
import { appQueryClient } from "./queryClient";
import { ToastProvider } from "./ui/ToastProvider";
import { useSuppressDefaultContextMenu } from "./ui/useSuppressDefaultContextMenu.hook";
import { logUiClick } from "./utils/appLogger";
import "./AppShell.css";

function AppShell() {
  useSuppressDefaultContextMenu();
  const [section, setSection] = useState<"db" | "logs">("db");
  const selectSection = (next: "db" | "logs") => {
    if (next === section) return;
    logUiClick("app.switch_section", { from: section, to: next });
    setSection(next);
  };

  return (
    <div className="appShell">
      <nav className="appShell__nav" role="tablist" aria-label="Разделы">
        <button
          type="button"
          className={`appShell__navBtn${section === "db" ? " appShell__navBtn_active" : ""}`}
          role="tab"
          aria-selected={section === "db"}
          aria-controls="app-panel-db"
          id="app-tab-db"
          aria-label="База данных"
          title="База данных"
          onClick={() => selectSection("db")}
        >
          <Database className="appShell__navBtnIcon" strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          className={`appShell__navBtn${section === "logs" ? " appShell__navBtn_active" : ""}`}
          role="tab"
          aria-selected={section === "logs"}
          aria-controls="app-panel-logs"
          id="app-tab-logs"
          aria-label="Журнал"
          title="Журнал"
          onClick={() => selectSection("logs")}
        >
          <ScrollText className="appShell__navBtnIcon" strokeWidth={2} aria-hidden />
        </button>
      </nav>
      <div className="appShell__main">
        <div
          className={`appShell__panel${section === "db" ? "" : " appShell__panel_hidden"}`}
          role="tabpanel"
          aria-hidden={section !== "db"}
          id="app-panel-db"
          aria-labelledby="app-tab-db"
        >
          <DbPage />
        </div>
        <div
          className={`appShell__panel${section === "logs" ? "" : " appShell__panel_hidden"}`}
          role="tabpanel"
          aria-hidden={section !== "logs"}
          id="app-panel-logs"
          aria-labelledby="app-tab-logs"
        >
          <LogsPage />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={appQueryClient}>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </QueryClientProvider>
  );
}