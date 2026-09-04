/**
 * AO5 — SONDA DE SÓLO LECTURA de Null Object. No toca producción.
 *
 * Cuenta la FUERZA del patrón tal como quedó definida en
 * `scratchpad-ao5/CRITERIO.md` ANTES de medir: colaboradores CALIFICADOS
 * (`x.y`/`self.y`/`@y`, nunca identificador desnudo — condición F1 de
 * `repeated-absence-check`) chequeados contra ausencia en >= C funciones
 * distintas de >= A archivos distintos.
 *
 * Usa el extractor de guardas REAL (`null-object.ts#scanFile`, exportado) sobre
 * árboles VIVOS de TODO el repo — la misma vía con la que AE10 tasó el piso de
 * `repo.clones`. Sin analizador completo, sin grafo: mide la POBLACIÓN, no lo
 * que el ancla ve.
 *
 * Uso: npx tsx scripts/ao5-sonda-nullobject.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";
import { collectFiles, resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import { scanFile } from "../src/server/services/hypotheses/null-object.js";

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/ao5-sonda-nullobject.mts <dir> <salida.json>");
  process.exit(1);
}

interface Occ { file: string; memberName: string; strict: boolean; isMemberAccess: boolean; line: number }

const porConcepto = new Map<string, Occ[]>();
const files = await collectFiles(dir);
let analizados = 0;
let guardasTotal = 0;

for (const sf of files) {
  const live = await resolveLiveFileUnit(dir, sf.path);
  if (!live) continue;
  analizados++;
  try {
    const r = scanFile(live.unit.root, live.unit.sets);
    for (const g of r.guards) {
      guardasTotal++;
      const key = g.guardedName.toLowerCase();
      const l = porConcepto.get(key) ?? [];
      l.push({ file: sf.path, memberName: g.memberName, strict: g.strict, isMemberAccess: g.isMemberAccess, line: g.startLine });
      porConcepto.set(key, l);
    }
  } finally {
    live.release();
  }
}

function resumen(filtro: (o: Occ) => boolean, minClientes: number, minArchivos: number) {
  const filas: { concepto: string; clientes: number; archivos: number }[] = [];
  for (const [concepto, occs] of porConcepto) {
    const f = occs.filter(filtro);
    if (f.length === 0) continue;
    const clientes = new Set(f.map((o) => `${o.file}#${o.memberName}`)).size;
    const archivos = new Set(f.map((o) => o.file)).size;
    if (clientes >= minClientes && archivos >= minArchivos) filas.push({ concepto, clientes, archivos });
  }
  filas.sort((a, b) => b.clientes - a.clientes);
  return filas;
}

const calificado = (o: Occ) => o.isMemberAccess;
const calificadoEstricto = (o: Occ) => o.isMemberAccess && o.strict;

const F1_C4_A2 = resumen(calificado, 4, 2);
const F1_C4_A2_ESTRICTO = resumen(calificadoEstricto, 4, 2);
const F1_C3_A2 = resumen(calificado, 3, 2);
const CUALQUIERA_C4_A2 = resumen(() => true, 4, 2);

writeFileSync(
  out,
  JSON.stringify(
    {
      dir,
      archivos: files.length,
      analizados,
      guardasTotal,
      conceptosTotal: porConcepto.size,
      /** LA FUERZA: colaborador calificado, >=4 funciones, >=2 archivos. */
      fuerza_C4_A2: F1_C4_A2.length,
      fuerza_C4_A2_estricto: F1_C4_A2_ESTRICTO.length,
      fuerza_C3_A2: F1_C3_A2.length,
      control_cualquier_nombre_C4_A2: CUALQUIERA_C4_A2.length,
      detalleFuerza: F1_C4_A2.slice(0, 200),
      detalleFuerzaEstricto: F1_C4_A2_ESTRICTO.slice(0, 200),
    },
    null,
    1,
  ),
);
console.log(`${out}: guardas=${guardasTotal} conceptos=${porConcepto.size} FUERZA(C4,A2)=${F1_C4_A2.length} estricto=${F1_C4_A2_ESTRICTO.length}`);
