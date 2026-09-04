/**
 * SONDA DEL FRENTE P8 (Ola P) — `inappropriate-intimacy` medida como
 * PROPORCIÓN de los internos del otro que cada lado conoce, no como conteo
 * absoluto de símbolos distintos.
 *
 * Uso: npx tsx scripts/p8-intimidad-proporcion.mts <dump.json> [...]
 */
import { readFileSync, readdirSync } from "node:fs";

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const head = rows[0]!;
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const judged: { slug: string; file: string; verdict: string; title: string }[] = [];
for (const f of readdirSync("tests/golden/precision")) {
  if (!f.endsWith(".verdicts.csv")) continue;
  for (const r of parseCsv(readFileSync(`tests/golden/precision/${f}`, "utf8"))) {
    if (r.kind === "inappropriate-intimacy" && r.verdict) {
      judged.push({ slug: r.slug!, file: r.file!, verdict: r.verdict!, title: r.title! });
    }
  }
}

interface Dump {
  slug: string;
  files: { path: string; lines: number; language: string }[];
  nodes: { id: string; kind: string; file: string; family?: string }[];
  edges: { from: string; to: string; kind: string; provenance: string; weight: number }[];
}

interface Pair {
  slug: string;
  a: string;
  b: string;
  lang: string[];
  bAtoB: number;
  bBtoA: number;
  symA: number;
  symB: number;
  shareAofB: number;
  shareBofA: number;
}

const pairs: Pair[] = [];
for (const file of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(file, "utf8")) as Dump;
  const nodeById = new Map(d.nodes.map((n) => [n.id, n] as const));
  const langOf = new Map(d.files.map((f) => [f.path, f.language]));
  const symCount = new Map<string, number>();
  for (const n of d.nodes) if (n.kind === "symbol") symCount.set(n.file, (symCount.get(n.file) ?? 0) + 1);

  const links = new Map<string, Map<string, Set<string>>>();
  for (const e of d.edges) {
    if (e.kind !== "references" && e.kind !== "calls") continue;
    if (e.provenance === "inferred" || e.provenance === "ambiguous") continue;
    const f = nodeById.get(e.from);
    const t = nodeById.get(e.to);
    if (!f || !t || t.kind !== "symbol" || f.file === t.file) continue;
    const m = links.get(f.file) ?? new Map<string, Set<string>>();
    links.set(f.file, m);
    (m.get(t.file) ?? m.set(t.file, new Set()).get(t.file)!).add(e.to);
  }
  const seen = new Set<string>();
  for (const [a, byB] of links) {
    for (const b of byB.keys()) {
      const [first, second] = a < b ? [a, b] : [b, a];
      if (seen.has(`${first} ${second}`)) continue;
      seen.add(`${first} ${second}`);
      const ab = links.get(first)?.get(second);
      const ba = links.get(second)?.get(first);
      if (!ab || !ba) continue;
      if (Math.min(ab.size, ba.size) < 3) continue;
      const symA = symCount.get(first) ?? 0;
      const symB = symCount.get(second) ?? 0;
      pairs.push({
        slug: d.slug,
        a: first,
        b: second,
        lang: [...new Set([langOf.get(first) ?? "?", langOf.get(second) ?? "?"])],
        bAtoB: ab.size,
        bBtoA: ba.size,
        symA,
        symB,
        shareAofB: symB ? ab.size / symB : 0,
        shareBofA: symA ? ba.size / symA : 0,
      });
    }
  }
}

pairs.sort((p, q) => Math.min(q.shareAofB, q.shareBofA) - Math.min(p.shareAofB, p.shareBofA));
console.log("share = min(fracción de los símbolos del otro que cada lado conoce)");
for (const p of pairs) {
  const v = judged.find((j) => j.slug === p.slug && (j.file === p.a || j.file === p.b));
  console.log(
    `${(Math.min(p.shareAofB, p.shareBofA) * 100).toFixed(1).padStart(5)}%  ${p.slug.padEnd(12)} ` +
      `${p.a.split("/").slice(-2).join("/")} <-> ${p.b.split("/").slice(-2).join("/")}  ` +
      `breadth=${p.bAtoB}/${p.bBtoA} syms=${p.symA}/${p.symB} ${v ? `[${v.verdict}]` : ""}`,
  );
}
for (const corte of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3]) {
  const keep = pairs.filter((p) => Math.min(p.shareAofB, p.shareBofA) >= corte);
  const byLang = new Map<string, number>();
  for (const p of keep) for (const l of p.lang) byLang.set(l, (byLang.get(l) ?? 0) + 1);
  const f = keep.filter((p) => judged.some((j) => j.slug === p.slug && (j.file === p.a || j.file === p.b) && j.verdict === "falso")).length;
  console.log(
    `corte>=${(corte * 100).toFixed(0)}%: total=${keep.length} falsosJuzgadosVivos=${f} ` +
      `lenguaje: ${[...byLang.entries()].map(([l, c]) => `${l}=${c}`).join(" ")}`,
  );
}
