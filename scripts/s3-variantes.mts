/**
 * S3 (Ola S) — EVALÚA OFFLINE, sobre los volcados de `s3-sonda.mts`, las
 * variantes del criterio de "subárbol que no es producto" que esta ola midió.
 * Existe para que el RESULTADO NEGATIVO sea reproducible en segundos y el
 * próximo frente no tenga que re-derivarlo desde cero (ni re-pagar 13 análisis).
 *
 * UN VOLCADO SE VENCE: cada dump lleva su `generadoEn` y la huella del grafo, y
 * este script los imprime. Lo que se compara acá son VARIANTES entre sí sobre el
 * MISMO volcado — un delta, nunca un absoluto publicable.
 *
 * LAS CUATRO VARIANTES, y qué preguntan:
 *   · `hoy`   — el criterio 3 tal como está en `detect/primitivas/n10-no-es-producto.ts`:
 *               ni una arista de código (no ambigua) cruzando la frontera, en
 *               NINGUNA de las dos direcciones.
 *   · `A`     — sólo "nadie depende de este subárbol" (aristas ENTRANTES = 0).
 *               La que la Ola Q ya descartó por marcar producto; se recalcula acá
 *               para tener la línea de comparación en el mismo volcado.
 *   · `D`     — A refinada: no hay ninguna arista entrante —NI AMBIGUA— que apunte
 *               a un nombre que SÓLO este subárbol declara. Arregla el modo de
 *               falla de A en los lenguajes donde la carpeta es el espacio de
 *               nombres; ver el informe del frente para lo que NO arregla.
 *   · `D+`    — D exigiendo además que el grafo HAYA mirado adentro (≥1 arista
 *               entrante de cualquier procedencia).
 *
 * Uso: npx tsx scripts/s3-variantes.mts <dump.json> [<dump.json> …]
 */
import { readFileSync } from "node:fs";

interface Dump {
  slug: string;
  generadoEn: string;
  grafo: { nodos: number; aristas: number };
  files: { path: string; lines: number; language: string }[];
  aristas: { desde: string; hacia: string; ambigua: boolean; nombreHacia: string }[];
  declaraciones: Record<string, string[]>;
  hallazgos: { kind: string; title: string; archivos: string[] }[];
}

function carpetasDe(ruta: string): string[] {
  const seg = ruta.split("/");
  seg.pop();
  return seg.map((_, i) => seg.slice(0, i + 1).join("/"));
}

const dentroDe = (carpeta: string) => (ruta: string) => ruta === carpeta || ruta.startsWith(`${carpeta}/`);

function evaluar(d: Dump) {
  const rutas = new Set(d.files.map((f) => f.path));
  const lineas = new Map<string, number>();
  const archivosPorCarpeta = new Map<string, string[]>();
  let total = 0;
  for (const f of d.files) {
    total += f.lines;
    for (const c of carpetasDe(f.path)) {
      lineas.set(c, (lineas.get(c) ?? 0) + f.lines);
      archivosPorCarpeta.set(c, [...(archivosPorCarpeta.get(c) ?? []), f.path]);
    }
  }
  const vivas = d.aristas.filter((a) => a.desde !== a.hacia && rutas.has(a.desde) && rutas.has(a.hacia));
  const confiables = vivas.filter((a) => !a.ambigua);

  const conArista = new Set<string>();
  for (const a of confiables) {
    conArista.add(a.desde);
    conArista.add(a.hacia);
  }
  const cobertura = conArista.size / rutas.size;

  const veredicto = new Map<string, Record<string, boolean>>();
  for (const carpeta of lineas.keys()) {
    if ((lineas.get(carpeta) ?? 0) * 2 > total) continue; // compuerta de tamaño, común a todas
    const dentro = dentroDe(carpeta);
    const entConf = confiables.filter((a) => dentro(a.hacia) && !dentro(a.desde));
    const salConf = confiables.filter((a) => dentro(a.desde) && !dentro(a.hacia));
    const entTodo = vivas.filter((a) => dentro(a.hacia) && !dentro(a.desde));
    const exclusivas = entTodo.filter((a) => (d.declaraciones[a.nombreHacia] ?? []).every(dentro));
    veredicto.set(carpeta, {
      hoy: entConf.length === 0 && salConf.length === 0,
      A: entConf.length === 0,
      D: exclusivas.length === 0,
      "D+": exclusivas.length === 0 && entTodo.length > 0,
    });
  }

  // Sólo las carpetas MÁXIMAS de cada variante: listar cada prefijo hijo no aporta.
  const maximas = (v: string): string[] => {
    const marcadas = [...veredicto].filter(([, r]) => r[v]).map(([c]) => c);
    const set = new Set(marcadas);
    return marcadas.filter((c) => !carpetasDe(c).some((p) => set.has(p))).sort();
  };

  console.log(`\n=== ${d.slug} — ${d.files.length} archivos, grafo ${d.grafo.nodos} nodos / ${d.grafo.aristas} aristas (${d.generadoEn})`);
  console.log(`    cobertura de aristas confiables: ${cobertura.toFixed(2)}`);
  for (const v of ["hoy", "A", "D", "D+"]) {
    const m = maximas(v);
    const suprime = d.hallazgos.filter((h) => h.archivos.every((f) => carpetasDe(f).some((c) => veredicto.get(c)?.[v])));
    console.log(`    ${v.padEnd(4)}: ${String(m.length).padStart(3)} subárboles máximos · suprimiría ${suprime.length} hallazgos vivos`);
    for (const c of m.slice(0, 14)) console.log(`          ${c}`);
    if (m.length > 14) console.log(`          … y ${m.length - 14} más`);
  }
}

for (const archivo of process.argv.slice(2)) evaluar(JSON.parse(readFileSync(archivo, "utf8")) as Dump);
