/**
 * V2 (Ola V) — EL EMBUDO: por qué muere cada una de las hipótesis de Composite
 * del censo, sin volver a correr el analizador.
 *
 * Lee el censo de `scripts/v2-censo.mts` (las filas `pattern: "Composite"`,
 * con las ubicaciones del hallazgo ancla), reparsea SÓLO esos archivos con la
 * misma gramática que producción y les pregunta a la MISMA función de
 * `hypotheses/composite.ts` (`analizarFormaDelAncla`, exportada para esto) qué
 * forma tiene cada miembro autorreferencial. Nada se re-implementa acá: medir
 * el embudo con una segunda copia de la clasificación sería medir otra cosa.
 *
 * Uso: npx tsx scripts/v2-funnel.mts <censo.json>[ <censo2.json> ...]
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import path from "node:path";

import { LANGUAGE_DECLS } from "../src/server/services/code-analyzer.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../src/server/services/detect/testing.js";
import { pisoDeclarado, resolveThreshold } from "../src/server/services/detect/thresholds.js";
import type { Finding, RoleLocation } from "../src/server/services/detect/types.js";
import { analizarFormaDelAncla } from "../src/server/services/hypotheses/composite.js";
import type { HypothesisContext } from "../src/server/services/hypotheses/types.js";

const CORPUS = "/home/maxi1805/claude-kanban/corpus";

const umbral = resolveThreshold(pisoDeclarado(1, { rationale: "medidor" }), {
  language: "java",
  sampleSize: () => 0,
  corpusP95: () => null,
});

interface Fila {
  repo: string;
  pattern: string;
  state: string;
  lang: string;
  file: string;
  roles: string[];
}

/** `packages/x/y.ts:95 (Clase)` o `packages/x/y.ts:95 — <rol>` → { archivo, linea, clase }. */
function parseRole(role: string): { archivo: string; linea: number; clase: string | null } {
  const cabeza = role.split(" — ")[0]!.trim();
  const m = /^(.*):(\d+)(?: \((.*)\))?$/.exec(cabeza);
  return { archivo: m?.[1] ?? "", linea: Number(m?.[2] ?? 0), clase: m?.[3] ?? null };
}

/** El nombre de la clase MÁS INTERNA que cubre `linea` — lo que el detector
 *  puso en `location.symbol` y que el censo viejo no guardaba. */
function claseEnLinea(file: { root: unknown; sets: { classNodes: Set<string> } }, linea: number): string | null {
  let mejor: string | null = null;
  let mejorDesde = -1;
  const visitar = (n: any): void => {
    if (n.isNamed && file.sets.classNodes.has(n.type)) {
      const desde = n.startPosition.row + 1;
      const hasta = n.endPosition.row + 1;
      const nombre = n.childForFieldName("name")?.text ?? null;
      if (nombre && linea >= desde && linea <= hasta && desde > mejorDesde) {
        mejor = nombre;
        mejorDesde = desde;
      }
    }
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i);
      if (c) visitar(c);
    }
  };
  visitar(file.root as any);
  return mejor;
}

const conteo: Record<string, number> = {};
const detalle: string[] = [];
const cuenta = (k: string): void => {
  conteo[k] = (conteo[k] ?? 0) + 1;
};

for (const censo of process.argv.slice(2)) {
  const d = JSON.parse(fs.readFileSync(censo, "utf8")) as { repo: string; filas: Fila[] };
  for (const fila of d.filas) {
    if (fila.pattern !== "Composite") continue;
    const ubicaciones = fila.roles.map(parseRole);
    const rel = ubicaciones[0]?.archivo ?? fila.file;
    const abs = path.join(CORPUS, d.repo, rel);
    const decl = LANGUAGE_DECLS.find((l) => l.extensions.includes(path.extname(rel).toLowerCase()));
    if (!decl || !fs.existsSync(abs)) {
      cuenta("no-medible (sin gramática/archivo)");
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    const [sets, root] = await Promise.all([nodeSetsFor(decl.wasm, decl.probeSource), parseRoot(decl.wasm, src)]);
    const file = fileUnitFrom(root, sets, decl.id, { file: rel });
    const clase = ubicaciones[0]?.clase ?? claseEnLinea(file, ubicaciones[0]?.linea ?? 0);
    if (!clase) {
      cuenta("no-medible (clase no ubicada)");
      continue;
    }
    const locations = ubicaciones.map(
      (u): RoleLocation => ({ file: rel, startLine: u.linea, endLine: u.linea, symbol: clase, role: "miembro autorreferencial" }),
    );
    const finding = {
      id: "medidor",
      detectorId: "self-referential-member",
      kind: "self-referential-member",
      scope: "intra-file",
      language: decl.id,
      title: "t",
      detail: "d",
      trigger: [{ label: "miembros autorreferenciales", value: locations.length, threshold: umbral }],
      locations: locations as [RoleLocation, ...RoleLocation[]],
      severity: 15,
      advice: { primary: { name: "x", kind: "patron_de_diseno", why: "y", source: "z" } },
    } as unknown as Finding;
    const ctx = { file } as unknown as HypothesisContext;

    const forma = analizarFormaDelAncla(finding, ctx);
    let veredicto: string;
    if (!forma) veredicto = "1. sin forma (clase no ubicada en el árbol)";
    else {
      const cols = forma.miembros.filter((m) => m.posicion === "coleccion");
      const operadas = cols.filter((m) => m.operadoPor.length > 0);
      const recorridas = operadas.filter((m) => m.recorridoPor.length > 0);
      if (cols.length === 0) {
        const posiciones = [...new Set(forma.miembros.map((m) => m.posicion ?? "no-clasificable"))].sort().join("+");
        veredicto = `2. sin colección (${posiciones})`;
      } else if (operadas.length === 0) veredicto = "3. colección pero NADIE la opera";
      else veredicto = recorridas.length > 0 ? "4. SOBREVIVE (colección + operación + recorrido en control)" : "4. SOBREVIVE (colección + operación, sin recorrido)";
    }
    cuenta(`${veredicto}`);
    cuenta(`${d.repo} · ${veredicto}`);
    detalle.push(
      `${veredicto}\t${d.repo}/${rel}:${ubicaciones[0]?.linea}\t${clase}\t${
        forma ? forma.miembros.map((m) => `${m.nombre ?? "?"}:${m.tipoTexto ?? "—"}→${m.posicion ?? "?"}${m.operadoPor.length ? `[${m.operadoPor.join(",")}]` : ""}`).join(" | ") : "—"
      }`,
    );
  }
}

for (const [k, v] of Object.entries(conteo).sort()) console.log(`${String(v).padStart(4)}  ${k}`);
console.log("\n──── detalle ────");
for (const linea of detalle.sort()) console.log(linea);
