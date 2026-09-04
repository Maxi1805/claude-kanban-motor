/**
 * P4 (Ola P) — medicion ad-hoc, NO produccion.
 *
 * Compara dos volcados de `dump-hallazgos.mts` (mismo repo, agrupamiento por tipo
 * apagado y prendido) y reporta el delta POR KIND, mas la cruza contra la planilla de
 * veredictos: que hallazgos juzgados `verdadero` se perdieron.
 *
 * Uso: npx tsx scripts/probes/p4-difhallazgos.mts <repo> <h-base.json> <h-desp.json>
 */
import { readFileSync, existsSync } from "node:fs";

interface Volcado {
  findings: { id: string; kind: string; title: string; where: string[] }[];
}

const [, , repo, aPath, bPath] = process.argv;
const A = JSON.parse(readFileSync(aPath!, "utf8")) as Volcado;
const B = JSON.parse(readFileSync(bPath!, "utf8")) as Volcado;

const cuenta = (v: Volcado): Map<string, number> => {
  const m = new Map<string, number>();
  for (const f of v.findings) m.set(f.kind, (m.get(f.kind) ?? 0) + 1);
  return m;
};
const ca = cuenta(A);
const cb = cuenta(B);
console.log(`${repo}: ${A.findings.length} -> ${B.findings.length} hallazgos`);
for (const k of [...new Set([...ca.keys(), ...cb.keys()])].sort()) {
  const x = ca.get(k) ?? 0;
  const y = cb.get(k) ?? 0;
  if (x !== y) console.log(`  ${k}: ${x} -> ${y} (${y - x >= 0 ? "+" : ""}${y - x})`);
}

/* ── compuerta de recall: identidad por stableFindingId Y por contenido ── */
const idsB = new Set(B.findings.map((f) => f.id));
const contB = new Set(B.findings.map((f) => `${f.kind}|${f.title}|${f.where.join(",")}`));

const csv = `tests/golden/precision/${repo}.verdicts.csv`;
if (!existsSync(csv)) {
  console.log(`  (sin planilla ${csv})`);
} else {
  // Parseo CSV minimo con comillas dobles.
  const texto = readFileSync(csv, "utf8");
  const filas: string[][] = [];
  let campo = "";
  let fila: string[] = [];
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (enComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') enComillas = false;
      else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else if (c !== "\r") campo += c;
  }
  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  const cab = filas[0]!;
  const idx = (n: string) => cab.indexOf(n);
  const iId = idx("stableFindingId");
  const iKind = idx("kind");
  const iVer = idx("verdict");
  const iTitle = idx("title");
  const verdaderos = filas.slice(1).filter((f) => (f[iVer] ?? "").trim() === "verdadero");
  const perdidos = verdaderos.filter((f) => {
    const id = (f[iId] ?? "").trim();
    if (idsB.has(id)) return false;
    // identidad por contenido: kind + titulo (el `where` de la planilla no esta completo)
    const kind = (f[iKind] ?? "").trim();
    const title = (f[iTitle] ?? "").trim();
    for (const c of contB) if (c.startsWith(`${kind}|${title}|`)) return false;
    return true;
  });
  console.log(`  veredictos 'verdadero': ${verdaderos.length}, perdidos tras el cambio: ${perdidos.length}`);
  for (const f of perdidos) console.log(`    · ${f[iKind]} :: ${(f[iTitle] ?? "").slice(0, 100)}`);
}
