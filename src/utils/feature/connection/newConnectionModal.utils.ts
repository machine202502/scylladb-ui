import type { NewConnectionForm } from "../../../types/scylla/scylla.types";

function defaultConnectionName(pointsStr: string, port: number): string {
  const host = pointsStr.split(",")[0]?.trim() || "127.0.0.1";
  return `${host}:${port}`;
}

export function createDefaultNewConnectionForm(): NewConnectionForm {
  const pointsStr = "127.0.0.1";
  const port = 9042;
  return {
    name: defaultConnectionName(pointsStr, port),
    pointsStr,
    port,
    localDc: "datacenter1",
    username: "",
    password: "",
  };
}
