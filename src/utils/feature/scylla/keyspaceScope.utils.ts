/** Aligns with Rust `scylla_api::keyspaces`: internal keyspaces use the `system` prefix. */
export function isSystemKeyspaceName(name: string): boolean {
  return name.startsWith("system");
}
