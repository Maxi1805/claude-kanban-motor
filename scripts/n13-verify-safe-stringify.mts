/**
 * N13 — verificación barata (sin corpus) de que `safeStringify` neutraliza
 * EXACTAMENTE la forma circular que guava produjo de verdad:
 * `finding.hypotheses[0].refreshState.finding.hypotheses === finding.hypotheses`.
 * También prueba el caso "referencia compartida pero NO circular" (un mismo
 * objeto referenciado desde dos ramas distintas) para confirmar que NO se
 * marca como ciclo por error — ver el docstring de `safeStringify`.
 */
import assert from "node:assert/strict";

// No se puede importar `safeStringify` (no exportada — es un detalle interno
// de `code-inspector.ts`): se copia la implementación EXACTA para probarla
// aislada. Si el archivo cambia, este archivo deja de ser representativo —
// es sólo una prueba de humo puntual para esta ola, no parte de la suite.
function safeStringify(value: unknown, repoKeyForLog: string): string {
  const ancestors: unknown[] = [];
  let circularHits = 0;
  const json = JSON.stringify(value, function (_key, val: unknown) {
    if (typeof val !== "object" || val === null) return val;
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) ancestors.pop();
    if (ancestors.includes(val)) {
      circularHits++;
      return "[dato omitido: referencia circular]";
    }
    ancestors.push(val);
    return val;
  });
  if (circularHits > 0) {
    console.error(`[code-inspector] ${repoKeyForLog}: ${circularHits} referencia(s) circular(es) neutralizada(s).`);
  }
  return json;
}

// Caso 1: EXACTAMENTE la forma que guava produjo.
type Hyp = { pattern: string; refreshState?: { finding: Finding } };
type Finding = { id: string; kind: string; hypotheses: Hyp[] };

const finding: Finding = { id: "f1", kind: "large-class", hypotheses: [] };
const hyp: Hyp = { pattern: "Template Method", refreshState: { finding } };
finding.hypotheses = [hyp]; // finding.hypotheses[0].refreshState.finding.hypotheses === finding.hypotheses

const before = () => JSON.stringify(finding);
assert.throws(before, /circular/i, "el repro debe fallar con JSON.stringify crudo (confirma que ES la misma forma)");

const json = safeStringify(finding, "repro-test");
const parsed = JSON.parse(json);
assert.equal(parsed.id, "f1");
assert.equal(parsed.hypotheses[0].pattern, "Template Method");
assert.equal(parsed.hypotheses[0].refreshState.finding, "[dato omitido: referencia circular]");
console.log("CASO 1 (circular real) — OK: safeStringify no tira, y el resto del objeto llega intacto.");

// Caso 2: referencia COMPARTIDA pero NO circular — dos ramas distintas
// apuntan al MISMO objeto (nunca a un ancestro propio). No debe marcarse.
const shared = { x: 1 };
const root = { a: shared, c: { nested: shared } };
const json2 = safeStringify(root, "repro-test-2");
assert.doesNotMatch(json2, /circular/, "una referencia compartida NO circular no debe marcarse");
const parsed2 = JSON.parse(json2);
assert.deepEqual(parsed2, { a: { x: 1 }, c: { nested: { x: 1 } } });
console.log("CASO 2 (referencia compartida, no circular) — OK: no se marca, datos intactos.");

// Caso 3: array con dos elementos IDÉNTICOS por referencia, hermanos (no
// ancestro-descendiente) — tampoco debe marcarse.
const item = { v: 1 };
const arr = [item, item];
const json3 = safeStringify(arr, "repro-test-3");
assert.doesNotMatch(json3, /circular/, "dos hermanos iguales por referencia no son un ciclo");
console.log("CASO 3 (hermanos idénticos) — OK.");

console.log("\nTODOS LOS CASOS PASARON.");
