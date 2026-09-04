/**
 * SONDA DEL FRENTE P8 (Ola P) — variantes de `inappropriate-intimacy`
 * medidas contra volumen por lenguaje y veredictos juzgados a mano.
 *
 * Uso: npx tsx scripts/p8-evaluar-intimidad.mts <dump.json> [...]
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

// `slug|file` de la PRIMERA ubicación -> veredicto (así se anota en la planilla).
const verdicts: Record<string, string[]> = {};
for (const f of readdirSync("tests/golden/precision")) {
  if (!f.endsWith(".verdicts.csv")) continue;
  for (const r of parseCsv(readFileSync(`tests/golden/precision/${f}`, "utf8"))) {
    if (r.kind === "inappropriate-intimacy" && r.verdict) {
      (verdicts[`${r.slug}|${r.file}`] ??= []).push(r.verdict!);
    }
  }
}

interface Dump {
  slug: string;
  files: { path: string; lines: number; language: string }[];
  nodes: { id: string; kind: string; file: string; family?: string }[];
  edges: { from: string; to: string; kind: string; provenance: string; weight: number }[];
}

function folderOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

const VARIANTS = ["hoy", "hoy+calls", "cruza-carpeta", "cruza+import", "cruza-carpeta+calls", "sin-import-calls", "sin-import"] as const;
const emitted: Record<string, { slug: string; a: string; b: string; langs: string[] }[]> = Object.fromEntries(
  VARIANTS.map((v) => [v, []]),
) as never;

for (const file of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(file, "utf8")) as Dump;
  const nodeById = new Map(d.nodes.map((n) => [n.id, n] as const));
  const langOf = new Map(d.files.map((f) => [f.path, f.language]));

  const importPairs = new Set<string>();
  for (const e of d.edges) {
    if (e.kind !== "imports" || e.provenance === "inferred" || e.provenance === "ambiguous") continue;
    const f = nodeById.get(e.from);
    const t = nodeById.get(e.to);
    if (f && t && f.file !== t.file) importPairs.add(`${f.file}>${t.file}`);
  }

  for (const variant of VARIANTS) {
    const withCalls = variant.includes("calls");
    const links = new Map<string, Map<string, Set<string>>>();
    for (const e of d.edges) {
      const okKind = e.kind === "references" || (withCalls && e.kind === "calls");
      if (!okKind) continue;
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
        const key = `${first} ${second}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ab = links.get(first)?.get(second);
        const ba = links.get(second)?.get(first);
        if (!ab || !ba) continue;
        if (Math.min(ab.size, ba.size) < 3) continue;
        const hayImport = importPairs.has(`${first}>${second}`) || importPairs.has(`${second}>${first}`);
        if (variant.startsWith("cruza") && folderOf(first) === folderOf(second)) continue;
        if (variant.startsWith("sin-import") && !hayImport) continue;
        if (variant === "cruza+import" && !hayImport) continue;
        emitted[variant]!.push({
          slug: d.slug,
          a: first,
          b: second,
          langs: [...new Set([langOf.get(first) ?? "?", langOf.get(second) ?? "?"])],
        });
      }
    }
  }
}

for (const variant of VARIANTS) {
  const rows = emitted[variant]!;
  const byLang = new Map<string, number>();
  const bySlug = new Map<string, number>();
  for (const r of rows) {
    for (const l of r.langs) byLang.set(l, (byLang.get(l) ?? 0) + 1);
    bySlug.set(r.slug, (bySlug.get(r.slug) ?? 0) + 1);
  }
  let vivosFalsos = 0;
  let vivosVerdaderos = 0;
  for (const [k, vs] of Object.entries(verdicts)) {
    const [slug, f] = k.split("|");
    const hits = rows.filter((r) => r.slug === slug && (r.a === f || r.b === f)).length;
    for (const v of vs.slice(0, hits)) {
      if (v === "falso") vivosFalsos++;
      else if (v === "verdadero") vivosVerdaderos++;
    }
  }
  console.log(
    `[${variant}] total=${rows.length} | juzgados vivos: V=${vivosVerdaderos} F=${vivosFalsos} | ` +
      `lenguaje: ${[...byLang.entries()].sort((a, b) => b[1] - a[1]).map(([l, c]) => `${l}=${c}`).join(" ")}`,
  );
  console.log(`   repo: ${[...bySlug.entries()].sort((a, b) => b[1] - a[1]).map(([s, c]) => `${s}=${c}`).join(" ")}`);
}

if (process.env.P8_LISTAR) {
  for (const variant of VARIANTS) {
    if (!process.env.P8_LISTAR.split(",").includes(variant)) continue;
    console.log(`\n--- ${variant} ---`);
    for (const r of emitted[variant]!) console.log(`${r.slug}\t${r.a}\t${r.b}`);
  }
}
