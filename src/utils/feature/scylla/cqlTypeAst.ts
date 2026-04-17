export type CqlTypeAst =
  | { kind: "simple"; name: string }
  | { kind: "list" | "set" | "frozen"; inner: CqlTypeAst }
  | { kind: "map"; key: CqlTypeAst; value: CqlTypeAst }
  | { kind: "tuple"; items: CqlTypeAst[] };

function splitTopLevel(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of inner) {
    if (ch === "<") depth += 1;
    if (ch === ">") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export function parseTypeAst(raw: string): CqlTypeAst {
  const t = raw.trim();
  const lower = t.toLowerCase();
  if (lower.startsWith("frozen<") && t.endsWith(">")) return { kind: "frozen", inner: parseTypeAst(t.slice(7, -1)) };
  if (lower.startsWith("list<") && t.endsWith(">")) return { kind: "list", inner: parseTypeAst(t.slice(5, -1)) };
  if (lower.startsWith("set<") && t.endsWith(">")) return { kind: "set", inner: parseTypeAst(t.slice(4, -1)) };
  if (lower.startsWith("map<") && t.endsWith(">")) {
    const p = splitTopLevel(t.slice(4, -1));
    if (p.length !== 2) throw new Error(`Invalid map type: ${raw}`);
    return { kind: "map", key: parseTypeAst(p[0]), value: parseTypeAst(p[1]) };
  }
  if (lower.startsWith("tuple<") && t.endsWith(">")) return { kind: "tuple", items: splitTopLevel(t.slice(6, -1)).map(parseTypeAst) };
  return { kind: "simple", name: lower };
}

