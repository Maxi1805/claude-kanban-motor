/**
 * RECONSTRUYE UN VOLCADO "ANTES" A PARTIR DE UN ENVELOPE DE LA CACHÉ DE ANÁLISIS.
 *
 * POR QUÉ EXISTE, y por qué NO es una trampa. Toda ola cierra con la misma deuda escrita:
 * *"la columna «antes» no la re-medí yo — es el cierre publicado de la ola anterior; el
 * árbol de entonces ya no existe"* (Ola V, §11.2). El árbol no existe, pero **su SALIDA sí**:
 * `analyze-cache.ts` guarda el `CodeAnalysis` completo —hallazgos e hipótesis incluidas—
 * bajo una clave que incluye la **huella del analizador** (sha256 de todo
 * `src/server/services/**` + `src/shared/{types,interfaces}.ts` + versiones de las
 * gramáticas). Un envelope escrito antes de que la ola tocara nada ES la salida del árbol
 * de antes, no una reconstrucción ni una estimación.
 *
 * LA GARANTÍA, y hay que verificarla a mano cada vez que se use esto: los envelopes que se
 * lean tienen que haber sido escritos DENTRO de una ventana en la que ningún archivo del
 * analizador cambió (`find src -newermt … ! -newermt …` vacío). Si el árbol se movió en el
 * medio, dos repos pueden traer salidas de dos analizadores distintos y la comparación
 * miente. Por eso este script imprime `createdAt` de cada envelope: el que lo corre tiene
 * que poder pegar esa ventana contra los mtime de `src/`.
 *
 * SALIDA: el MISMO formato de `scripts/dump-hallazgos.mts`, para que los instrumentos de
 * medición (`w-cobertura-nivel2.mts`, `w-int-censo-nivel2.mts`, …) no distingan un volcado
 * de hoy de uno reconstruido — y para que la comparación antes/después sea la misma
 * operación sobre los mismos campos.
 *
 * Uso:
 *   npx tsx scripts/w-int-dump-desde-cache.mts <envelope.json> <salida.json>
 */
import fs from "node:fs";

import { stableFindingId } from "../src/server/services/code-finding-ids.js";
// AJ2 — el mismo `at` que escribe `dump-hallazgos.mts`, para que la columna "ANTES" de un cierre
// de ola (que sale de acá) sea direccionable igual que la columna "HOY". Sin esto, el censo de la
// columna vieja cae al respaldo `<archivo>:<línea>` de la FILA y todas las propuestas de una fila
// vuelven a compartir dirección: se podrían comparar dos columnas con techos distintos.
import { direccionesDeFila } from "../src/server/services/detect/precision/direccion-hipotesis.js";
import type { CodeFinding } from "../src/shared/types.js";

const [, , envPath, out] = process.argv;
if (!envPath || !out) {
  console.error("uso: w-int-dump-desde-cache.mts <envelope.json> <salida.json>");
  process.exit(1);
}

const env = JSON.parse(fs.readFileSync(envPath, "utf8")) as {
  createdAt: string;
  analysis: { repoName?: string; findings: CodeFinding[] };
  preCapFindings: CodeFinding[] | null;
};

const source = env.preCapFindings ?? env.analysis.findings;
const findings = source.map((f) => {
  const hs = f.hypotheses ?? [];
  const at = direccionesDeFila(hs, f.locations[0]);
  return {
    id: f.id ?? stableFindingId(f),
    kind: f.kind,
    title: f.title,
    where: f.locations.map((l) => `${l.file}:${l.startLine}`),
    symbols: f.locations.map((l) => l.symbol ?? ""),
    hypotheses: hs.map((h, i) => ({ pattern: h.pattern, state: h.state, at: at[i] ?? "" })),
  };
});

const porKind: Record<string, { n: number; conHipotesis: number }> = {};
for (const f of findings) {
  const e = (porKind[f.kind] ??= { n: 0, conHipotesis: 0 });
  e.n++;
  if (f.hypotheses.length) e.conHipotesis++;
}

fs.writeFileSync(
  out,
  JSON.stringify(
    { desdeCache: envPath, createdAt: env.createdAt, repoName: env.analysis.repoName, total: findings.length, porKind, findings },
    null,
    1,
  ),
);
console.log(
  `${out}: ${findings.length} hallazgos, ${Object.keys(porKind).length} kinds ` +
    `(envelope de ${env.createdAt}, repoName=${env.analysis.repoName ?? "?"})`,
);
