/**
 * SONDA DEL FRENTE P8 (Ola P) — cuánta señal de dependencia ENTRE ARCHIVOS
 * tira hoy la exclusión de `provenance: "ambiguous"`.
 *
 * La cascada marca `ambiguous` cuando sobrevive con MÁS DE UN destino posible
 * (`CodeGraphEdge.alternatives`). Pero la ambigüedad es de SÍMBOLO: si el
 * destino elegido y TODAS sus alternativas viven en el MISMO archivo, a grano
 * ARCHIVO no hay ninguna ambigüedad — se sabe exactamente de qué archivo
 * depende el origen. Esto mide cuántas de esas hay.
 *
 * Uso: npx tsx scripts/p8-medir-ambiguedad.mts <dump.json> [...]
 */
import { readFileSync } from "node:fs";

interface Dump {
  slug: string;
  files: { path: string; lines: number; language: string }[];
  nodes: { id: string; file: string; kind: string }[];
  edges: { from: string; to: string; kind: string; provenance: string; weight: number; alternatives?: string[] }[];
}

for (const file of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(file, "utf8")) as Dump;
  const fileOf = new Map(d.nodes.map((n) => [n.id, n.file] as const));
  let amb = 0;
  let mismoArchivo = 0;
  let sinAlternativas = 0;
  let colapsablesEntreArchivos = 0;
  const pares = new Set<string>();
  const paresNuevos = new Set<string>();
  for (const e of d.edges) {
    if (e.kind === "contains") continue;
    const f = fileOf.get(e.from);
    const t = fileOf.get(e.to);
    if (!f || !t) continue;
    if (e.provenance !== "ambiguous") {
      if (e.provenance !== "inferred" && f !== t) pares.add(`${f}>${t}`);
      continue;
    }
    amb++;
    const alts = e.alternatives ?? [];
    if (alts.length === 0) sinAlternativas++;
    const files = new Set<string>([t]);
    let desconocida = false;
    for (const a of alts) {
      const af = fileOf.get(a);
      if (af === undefined) desconocida = true;
      else files.add(af);
    }
    if (!desconocida && files.size === 1) {
      mismoArchivo++;
      if (f !== t) {
        colapsablesEntreArchivos++;
        paresNuevos.add(`${f}>${t}`);
      }
    }
  }
  let realmenteNuevos = 0;
  for (const p of paresNuevos) if (!pares.has(p)) realmenteNuevos++;
  console.log(
    `${d.slug.padEnd(16)} ambiguas=${String(amb).padStart(6)} sinAlt=${sinAlternativas} ` +
      `mismoArchivo=${String(mismoArchivo).padStart(6)} (${((100 * mismoArchivo) / Math.max(1, amb)).toFixed(0)}%) ` +
      `entreArchivos=${colapsablesEntreArchivos} paresArchivo(hoy)=${pares.size} paresNuevos=${realmenteNuevos}`,
  );
}
