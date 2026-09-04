/**
 * Diff antes/después de `u-c2-medir.mts` — el DELTA, nunca un absoluto
 * (CONTEXTO §6: "un volcado de grafo SE VENCE").
 *
 * Uso: npx tsx scripts/u-c2-diff.mts /tmp/u-c2 <slug>...
 */
import { readFileSync } from "node:fs";
import path from "node:path";

type Tally = Record<string, number>;
const [, , dir, ...slugs] = process.argv;
if (!dir || slugs.length === 0) {
  console.error("uso: npx tsx scripts/u-c2-diff.mts <dir> <slug>...");
  process.exit(1);
}

function load(kind: string, slug: string): any {
  return JSON.parse(readFileSync(path.join(dir!, `${kind}-${slug}.json`), "utf8"));
}

function diffTally(a: Tally = {}, b: Tally = {}): string[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const out: string[] = [];
  for (const k of keys) {
    const x = a[k] ?? 0;
    const y = b[k] ?? 0;
    if (x !== y) out.push(`${k}: ${x} → ${y} (${y - x >= 0 ? "+" : ""}${y - x})`);
  }
  return out;
}

for (const slug of slugs) {
  let antes: any;
  let despues: any;
  try {
    antes = load("antes", slug);
    despues = load("despues", slug);
  } catch (e) {
    console.log(`\n### ${slug}: FALTA un lado (${(e as Error).message})`);
    continue;
  }
  console.log(`\n### ${slug}`);
  console.log(
    `hallazgos ${antes.hallazgos} → ${despues.hallazgos} · hipótesis ${antes.totalHipotesis} → ${despues.totalHipotesis} · ` +
      `RECOMENDACIONES ${antes.recomendaciones} → ${despues.recomendaciones}`,
  );
  const gk = diffTally(antes.hallazgosPorKind, despues.hallazgosPorKind);
  console.log(gk.length ? `  hallazgos por kind: ${gk.join(" | ")}` : "  hallazgos por kind: SIN CAMBIO");

  const patrones = [...new Set([...Object.keys(antes.hipotesis ?? {}), ...Object.keys(despues.hipotesis ?? {})])].sort();
  const lineas: string[] = [];
  for (const p of patrones) {
    const d = diffTally(antes.hipotesis?.[p], despues.hipotesis?.[p]);
    if (d.length) lineas.push(`  ${p}: ${d.join(" | ")}`);
  }
  console.log(lineas.length ? lineas.join("\n") : "  hipótesis: SIN CAMBIO");

  if (antes.grafo && despues.grafo) {
    console.log(
      `  grafo: nodos ${antes.grafo.nodos} → ${despues.grafo.nodos} (${despues.grafo.nodos - antes.grafo.nodos >= 0 ? "+" : ""}${despues.grafo.nodos - antes.grafo.nodos}) · ` +
        `aristas ${antes.grafo.aristas} → ${despues.grafo.aristas} (${despues.grafo.aristas - antes.grafo.aristas >= 0 ? "+" : ""}${despues.grafo.aristas - antes.grafo.aristas})`,
    );
    console.log(`  nodos por family: ${diffTally(antes.grafo.nodosPorFamily, despues.grafo.nodosPorFamily).join(" | ") || "sin cambio"}`);
    console.log(`  aristas por kind: ${diffTally(antes.grafo.aristasPorKind, despues.grafo.aristasPorKind).join(" | ") || "sin cambio"}`);
  }
}
