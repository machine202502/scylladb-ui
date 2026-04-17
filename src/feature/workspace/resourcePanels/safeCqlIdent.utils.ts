/** Unquoted CQL identifier: letters, digits, underscore; must not start with digit. */
export function isSafeCqlIdent(s: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s);
}
