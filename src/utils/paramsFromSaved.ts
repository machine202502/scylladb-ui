import type { ConnectionParams, SavedConnection } from "../types/scylla/scylla.types";

export function paramsFromSaved(c: SavedConnection): ConnectionParams {
  return {
    contactPoints: c.contactPoints,
    port: c.port,
    localDc: c.localDc,
    username: c.username,
    password: c.password,
  };
}
