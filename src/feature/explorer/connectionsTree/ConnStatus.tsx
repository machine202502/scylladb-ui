import type { ConnStatusProps } from "../../../types/feature/explorer/connectionsTree/ConnStatus.types";

export function ConnStatus({ live }: ConnStatusProps) {
  if (live == null) return null;
  if (live.status === "connected") {
    return (
      <span className="connectionsTree__status connectionsTree__status_ok" title="Подключено" aria-hidden>
        ●
      </span>
    );
  }
  return (
    <span className="connectionsTree__status connectionsTree__status_err" title="Ошибка подключения" aria-hidden>
      ●
    </span>
  );
}
