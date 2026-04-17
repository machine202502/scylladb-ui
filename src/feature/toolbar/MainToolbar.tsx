import { CloudOff, FileCode2, Plus, Trash2, Unplug } from "lucide-react";
import { MAIN_TOOLBAR_ICON_PROPS } from "../../constants/feature/toolbar/mainToolbar.constants";
import type { MainToolbarProps } from "../../types/ui/MainToolbar.types";
import { logUiClick } from "../../utils/appLogger";
import "./MainToolbar.css";

export function MainToolbar({
  onAdd,
  onOpenCql,
  onDisconnect,
  onDisconnectAll,
  onDelete,
  disableOpenCql,
  disableDisconnect,
  disableDisconnectAll,
  disableDelete,
}: MainToolbarProps) {
  return (
    <div className="mainToolbar" role="toolbar">
      <button
        type="button"
        className="mainToolbar__btn"
        onClick={() => {
          logUiClick("toolbar.add_connection");
          onAdd();
        }}
        title="Добавить подключение"
        aria-label="Добавить подключение"
      >
        <Plus {...MAIN_TOOLBAR_ICON_PROPS} aria-hidden />
      </button>
      <button
        type="button"
        className="mainToolbar__btn"
        onClick={() => {
          logUiClick("toolbar.open_cql");
          onOpenCql();
        }}
        disabled={disableOpenCql}
        title="Новая вкладка CQL"
        aria-label="Новая вкладка CQL"
      >
        <FileCode2 {...MAIN_TOOLBAR_ICON_PROPS} aria-hidden />
      </button>
      <button
        type="button"
        className="mainToolbar__btn"
        onClick={() => {
          logUiClick("toolbar.disconnect_selected");
          onDisconnect();
        }}
        disabled={disableDisconnect}
        title="Отключиться от выбранного"
        aria-label="Отключиться от выбранного"
      >
        <Unplug {...MAIN_TOOLBAR_ICON_PROPS} aria-hidden />
      </button>
      <button
        type="button"
        className="mainToolbar__btn"
        onClick={() => {
          logUiClick("toolbar.disconnect_all");
          onDisconnectAll();
        }}
        disabled={disableDisconnectAll}
        title="Отключиться от всех"
        aria-label="Отключиться от всех"
      >
        <CloudOff {...MAIN_TOOLBAR_ICON_PROPS} aria-hidden />
      </button>
      <button
        type="button"
        className="mainToolbar__btn"
        onClick={() => {
          logUiClick("toolbar.delete_connection");
          onDelete();
        }}
        disabled={disableDelete}
        title="Удалить подключение"
        aria-label="Удалить подключение"
      >
        <Trash2 {...MAIN_TOOLBAR_ICON_PROPS} aria-hidden />
      </button>
    </div>
  );
}
