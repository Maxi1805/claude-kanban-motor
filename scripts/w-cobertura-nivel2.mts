/**
 * LA MÉTRICA DE LA OLA W, Y DE TODAS LAS QUE SIGAN: **la cobertura del nivel 2 sobre los
 * problemas REALES del nivel 1**.
 *
 *   > De los hallazgos del nivel 1 con veredicto `verdadero` —problemas reales que un
 *   > humano verificó a mano—, ¿en cuántos proponemos un remedio accionable, o sea una
 *   > hipótesis en estado `ausente` o `parcial`?
 *
 * POR QUÉ VIVE EN `scripts/` Y CON PREFIJO `w-`, Y NO EN UN /tmp DE UNA TAREA. Tres olas
 * seguidas (T, U, V) hicieron trabajo correcto sobre la PRECISIÓN y la aguja no se movió,
 * porque restar falsos no puede subir un cociente cuyo numerador no crece. La corrección
 * del usuario que abrió la Ola W ("el objetivo es identificar lugares donde SE DEBERÍAN
 * implementar patrones") convierte a la cobertura en la métrica de cabecera, y una métrica
 * de cabecera que se recalcula con un script distinto en cada ola no es comparable entre
 * olas. Éste es el instrumento único, y el contrato es que la próxima ola lo CORRA, no que
 * lo reescriba.
 *
 * LAS TRES DECISIONES DE MÉTODO, escritas para que la próxima ola no las re-discuta:
 *
 * 1. **`ya-aplicado` y `aplicado-eludido` NO son cobertura.** El entregable del nivel 2 es
 *    una recomendación accionable; "acá el patrón ya está" es información. Por eso hay dos
 *    columnas —`conHipotesis` y `conRecomendacion`— y la métrica de la ola es la SEGUNDA.
 *    (La Ola W lo probó de la peor manera posible: W4 abrió Java y C# en
 *    `homonymous-delegation` y produjo 58 hipótesis nuevas de Decorator, las 58
 *    `ya-aplicado`. Con la definición laxa eso habría sido "cobertura ganada"; con ésta es
 *    lo que realmente es: cero.)
 *
 * 2. **El denominador son los `verdadero` VIVOS**, no todos los `verdadero` de la planilla.
 *    Un veredicto cuyo `id` ya no aparece en el volcado de hoy es un hallazgo que el
 *    analizador dejó de emitir: eso es un problema de RECALL (que tiene su propia
 *    compuerta, `recall-gate.test.ts`) y contarlo como "sin cobertura" mezclaría dos fallas
 *    distintas en un solo número. Se reportan los dos denominadores igual, para que nadie
 *    tenga que confiar.
 *
 * 3. **El cruce es por `id` (`stableFindingId`), nunca por ubicación.** La clave por
 *    archivo:línea es la que la Ola V encontró vencida en 4 filas sólo porque la línea se
 *    corrió. Si el id no matchea, la fila cuenta como "no viva", nunca como "sin cobertura".
 *
 * USO:
 *   # 1) volcar los repos (caro, con semáforo; la caché por SHA + huella hace el resto)
 *   for s in click cobra eslint guava hugo jekyll lodash nest newtonsoft-json preact \
 *            rubocop sqlalchemy vueuse; do
 *     ./scripts/con-analisis.sh npx tsx scripts/dump-hallazgos.mts "corpus/$s" "/tmp/dumps/$s.json"
 *   done
 *   # 2) medir (barato, sólo lee archivos)
 *   npx tsx scripts/w-cobertura-nivel2.mts /tmp/dumps            # global + por kind
 *   npx tsx scripts/w-cobertura-nivel2.mts /tmp/dumps --por-patron
 *   npx tsx scripts/w-cobertura-nivel2.mts /tmp/dumps --json /tmp/cobertura.json
 *
 * REFERENCIAS HISTÓRICAS (para la columna "antes" de la próxima ola):
 *   · 12 de agosto de 2026, antes de la Ola V, 13 repos: **39 de 326 = 12 %**.
 *   · 12 de agosto de 2026, después de la Ola V, sólo nest+guava: 13 de 101 = 13 %.
 */
import fs from "node:fs";
import path from "node:path";

import { readPrecisionCsv } from "../src/server/services/detect/precision/verdicts-io.js";

/** Los 13 repos de SHA congelado. `ck-analyzer` queda AFUERA a propósito: no tiene SHA
 *  congelado (ver `AVISO-recall-ck-analyzer.md`), así que sus veredictos no son
 *  reproducibles de una ola a la otra y contaminarían la serie histórica. */
const SLUGS = [
  "click", "cobra", "eslint", "guava", "hugo", "jekyll", "lodash",
  "nest", "newtonsoft-json", "preact", "rubocop", "sqlalchemy", "vueuse",
] as const;

const RECOMENDACION = new Set(["ausente", "parcial"]);

interface DumpedFinding {
  id: string;
  kind: string;
  where: readonly string[];
  hypotheses: readonly { pattern: string; state: string }[];
}

interface Fila {
  slug: string;
  kind: string;
  id: string;
  file: string;
  line: string;
  vivo: boolean;
  hipotesis: readonly { pattern: string; state: string }[];
}

function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - r) / d, (c + r) / d];
}

function pct(k: number, n: number): string {
  return n === 0 ? "  — " : `${((k / n) * 100).toFixed(0).padStart(3)}%`;
}

function conIntervalo(k: number, n: number): string {
  if (n === 0) return "—";
  const [lo, hi] = wilson(k, n);
  return `${((k / n) * 100).toFixed(0)} % [${(lo * 100).toFixed(0)} %, ${(hi * 100).toFixed(0)} %]`;
}

function main(): void {
  const argv = process.argv.slice(2);
  const dumpsDir = argv.find((a) => !a.startsWith("--"));
  if (!dumpsDir) {
    console.error("uso: w-cobertura-nivel2.mts <dir-de-volcados> [--por-patron] [--json salida.json]");
    process.exitCode = 1;
    return;
  }
  const porPatron = argv.includes("--por-patron");
  const jsonOut = argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : undefined;

  const filas: Fila[] = [];
  const faltantes: string[] = [];

  for (const slug of SLUGS) {
    const dumpPath = path.join(dumpsDir, `${slug}.json`);
    if (!fs.existsSync(dumpPath)) {
      faltantes.push(slug);
      continue;
    }
    const dump = JSON.parse(fs.readFileSync(dumpPath, "utf8")) as { findings: DumpedFinding[] };
    const porId = new Map<string, DumpedFinding>();
    for (const f of dump.findings) if (!porId.has(f.id)) porId.set(f.id, f);

    const csvPath = path.resolve("tests/golden/precision", `${slug}.verdicts.csv`);
    if (!fs.existsSync(csvPath)) {
      faltantes.push(`${slug}.verdicts.csv`);
      continue;
    }
    for (const row of readPrecisionCsv(csvPath)) {
      if ((row.verdict ?? "").trim() !== "verdadero") continue;
      const vivo = porId.get(row.id);
      filas.push({
        slug,
        kind: row.kind,
        id: row.id,
        file: row.file,
        line: String(row.startLine ?? ""),
        vivo: Boolean(vivo),
        hipotesis: vivo?.hypotheses ?? [],
      });
    }
  }

  if (faltantes.length) console.error(`AVISO: sin volcado/planilla para ${faltantes.join(", ")}`);

  const vivos = filas.filter((f) => f.vivo);
  const conHip = vivos.filter((f) => f.hipotesis.length > 0);
  const conRec = vivos.filter((f) => f.hipotesis.some((h) => RECOMENDACION.has(h.state)));

  console.log("=== COBERTURA DEL NIVEL 2 SOBRE LOS PROBLEMAS REALES DEL NIVEL 1 ===");
  console.log(`repos: ${SLUGS.length - faltantes.length}/${SLUGS.length}`);
  console.log(`veredictos \`verdadero\` en las planillas ....... ${filas.length}`);
  console.log(`   de ésos, VIVOS en el volcado de hoy ........ ${vivos.length}  (los ${filas.length - vivos.length} restantes son recall, no cobertura)`);
  console.log(`   con alguna hipótesis (incl. \`ya-aplicado\`) . ${conHip.length}  ${pct(conHip.length, vivos.length)}`);
  console.log(`   **CON RECOMENDACIÓN (\`ausente\`/\`parcial\`)** . ${conRec.length}  ${pct(conRec.length, vivos.length)}   ← LA MÉTRICA`);
  console.log(`   sin ninguna propuesta ...................... ${vivos.length - conHip.length}  ${pct(vivos.length - conHip.length, vivos.length)}`);
  console.log(`   Wilson 95 % de la cobertura: ${conIntervalo(conRec.length, vivos.length)}`);

  console.log("\n=== POR KIND — qué problemas reales siguen sin respuesta ===");
  const kinds = [...new Set(vivos.map((f) => f.kind))];
  const porKind = kinds
    .map((k) => {
      const v = vivos.filter((f) => f.kind === k);
      return {
        kind: k,
        verdaderosVivos: v.length,
        conHipotesis: v.filter((f) => f.hipotesis.length > 0).length,
        conRecomendacion: v.filter((f) => f.hipotesis.some((h) => RECOMENDACION.has(h.state))).length,
        patrones: [
          ...new Set(
            v.flatMap((f) => f.hipotesis.filter((h) => RECOMENDACION.has(h.state)).map((h) => h.pattern)),
          ),
        ].sort(),
      };
    })
    .sort((a, b) => b.conRecomendacion - a.conRecomendacion || b.verdaderosVivos - a.verdaderosVivos);

  console.log(`${"kind".padEnd(30)} ${"vivos".padStart(6)} ${"c/hip".padStart(6)} ${"c/REC".padStart(6)} ${"cob.".padStart(6)}  patrones que recomiendan`);
  for (const r of porKind) {
    console.log(
      `${r.kind.padEnd(30)} ${String(r.verdaderosVivos).padStart(6)} ${String(r.conHipotesis).padStart(6)} ` +
        `${String(r.conRecomendacion).padStart(6)} ${pct(r.conRecomendacion, r.verdaderosVivos).padStart(6)}  ${r.patrones.join(", ")}`,
    );
  }

  if (porPatron) {
    console.log("\n=== POR PATRÓN — cuántos verdaderos cubre cada uno (un verdadero puede aparecer en varios) ===");
    const cuenta = new Map<string, number>();
    for (const f of conRec) {
      for (const p of new Set(f.hipotesis.filter((h) => RECOMENDACION.has(h.state)).map((h) => h.pattern))) {
        cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
      }
    }
    for (const [p, n] of [...cuenta].sort((a, b) => b[1] - a[1])) {
      console.log(`${p.padEnd(30)} ${String(n).padStart(4)}`);
    }
  }

  if (jsonOut) {
    fs.writeFileSync(
      jsonOut,
      JSON.stringify(
        {
          medidoEl: new Date().toISOString(),
          repos: SLUGS.filter((s) => !faltantes.includes(s)),
          global: {
            veredictosVerdadero: filas.length,
            vivos: vivos.length,
            conHipotesis: conHip.length,
            conRecomendacion: conRec.length,
            cobertura: vivos.length ? conRec.length / vivos.length : null,
            wilson: wilson(conRec.length, vivos.length),
          },
          porKind,
          detalle: filas,
        },
        null,
        1,
      ),
    );
    console.log(`\n-> ${jsonOut}`);
  }
}

main();
