/**
 * Persistencia de la medición de recall — un JSON por población,
 * `tests/golden/precision/recall/<slug>.recall.json`, al lado de la planilla
 * de veredictos que mide.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO Y NO SE MIDE AL VUELO. Cruzar los verdaderos
 * juzgados contra el pool vivo exige un volcado COMPLETO
 * (`scripts/dump-hallazgos.mts`, `maxFindings: "unlimited"`) de los 13 repos
 * del corpus. Medido en la corrida que construyó la línea base: **7 minutos y
 * medio de reloj, 5 min 21 s de ellos sólo `guava`**. Una compuerta que cuesta
 * eso en cada `npx vitest run` no se corre; y una compuerta que no se corre no
 * protege nada — el mismo argumento con el que
 * `ola-p/informes/AVISO-recall-ck-analyzer.md` descarta incluir `ck-analyzer`.
 * Así que el análisis se paga UNA vez, su resultado se guarda acá, y la
 * compuerta lee JSON: milisegundos.
 *
 * GRANULARIDAD POR SLUG, y ésa es la pieza que hace que alguien lo corra de
 * verdad. Un frente que tocó un detector de Go no necesita los 13 repos: vuelca
 * `cobra` y `hugo` (48 s medidos), regenera esos dos snapshots y la compuerta
 * le contesta si mató un verdadero EN SU LENGUAJE. Los otros once snapshots
 * quedan como estaban y la compuerta los marca `stale` en vez de mentir.
 *
 * QUÉ NO GUARDA, a propósito: el pool completo de ids. Para `guava` son miles
 * de entradas, el archivo dejaría de ser legible, y `git diff` sobre él
 * mostraría ruido en vez de la única línea que importa — que un `verdadero`
 * pasó de `id` a `perdido`. Se guarda el RESULTADO del cruce, fila por fila.
 *
 * FORMATO: claves de `status` ordenadas al escribir, dos espacios de sangría.
 * Es un archivo que se lee en un `git diff` durante una discusión sobre quién
 * mató qué; que sea estable importa más que que sea chico.
 */
import fs from "node:fs";
import path from "node:path";

import type { RecallSnapshot, RecallStatus } from "./recall-logic.js";

const VALID_STATUS: ReadonlySet<string> = new Set(["id", "contenido", "perdido"]);

/** `tests/golden/precision/recall/` — resuelto desde este archivo, igual que `gate.test.ts` resuelve `PRECISION_DIR`, para que no dependa del `cwd` de quien lo llame. */
export const RECALL_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "tests",
  "golden",
  "precision",
  "recall",
);

export function recallSnapshotPath(slug: string, dir: string = RECALL_DIR): string {
  return path.join(dir, `${slug}.recall.json`);
}

/**
 * Valida al leer en vez de castear: este archivo se edita a mano cuando alguien
 * discute una pérdida, y un `status` mal escrito que se cuele como `undefined`
 * haría que la fila desaparezca del denominador — o sea, subiría el recall en
 * silencio. Preferimos el error ruidoso.
 */
export function readRecallSnapshot(filePath: string): RecallSnapshot | null {
  if (!fs.existsSync(filePath)) return null;
  const raw: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (typeof raw !== "object" || raw === null) throw new Error(`${filePath}: no es un objeto JSON`);
  const o = raw as Record<string, unknown>;
  const status: Record<string, RecallStatus> = {};
  const rawStatus = o.status;
  if (typeof rawStatus !== "object" || rawStatus === null) throw new Error(`${filePath}: falta el objeto "status"`);
  for (const [id, v] of Object.entries(rawStatus as Record<string, unknown>)) {
    if (typeof v !== "string" || !VALID_STATUS.has(v)) {
      throw new Error(`${filePath}: status inválido ("${String(v)}") para id=${id} — sólo id / contenido / perdido`);
    }
    status[id] = v as RecallStatus;
  }
  return {
    slug: String(o.slug ?? ""),
    sha: String(o.sha ?? ""),
    measuredAt: String(o.measuredAt ?? ""),
    analyzerFingerprint: String(o.analyzerFingerprint ?? ""),
    poolFindings: Number(o.poolFindings ?? 0),
    source: String(o.source ?? ""),
    status,
  };
}

/** Todos los snapshots del directorio. Sin directorio ⇒ `[]` (todavía nadie midió) — la compuerta lo dice, no revienta. */
export function readAllRecallSnapshots(dir: string = RECALL_DIR): RecallSnapshot[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".recall.json"))
    .sort()
    .map((f) => readRecallSnapshot(path.join(dir, f)))
    .filter((s): s is RecallSnapshot => s !== null);
}

export function writeRecallSnapshot(filePath: string, snapshot: RecallSnapshot): void {
  const status: Record<string, RecallStatus> = {};
  for (const id of Object.keys(snapshot.status).sort()) status[id] = snapshot.status[id]!;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ ...snapshot, status }, null, 2) + "\n", "utf8");
}
