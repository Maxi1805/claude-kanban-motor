/**
 * El guardián de la regla G3 (CONTRATOS.md §1.2): todo detector que declara
 * `needs` no vacío tiene, en su propio `<id>.test.ts`, un test cuyo nombre
 * empieza con "no aplicable sin <capability>" — corrido sobre una fixture
 * POSITIVA que carece de esa capacidad, afirmando 0 hallazgos. Si la
 * detecta, el `needs` era falso: era el extractor, no el lenguaje.
 *
 * F1 pobló el registro con los primeros tres detectores reales
 * (`empty-catch`, `large-class`, `repeated-switch`), los primeros que esta
 * regla verifica de verdad: `empty-catch` (needs=["excepciones"]) y
 * `large-class` (needs=["unidad-tipo-clase"]) tienen ambos su test "no
 * aplicable sin <capability>"; `repeated-switch` declara `needs: []` (todo
 * lenguaje soportado tiene algún switch/case/match) así que no le aplica.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DETECTORS } from "./registry.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCOPE_DIRS = ["intra-function", "intra-file", "inter-file"];

function findDetectorTestFile(id: string): string | null {
  for (const dir of SCOPE_DIRS) {
    const testPath = path.join(HERE, dir, `${id}.test.ts`);
    if (fs.existsSync(testPath)) return testPath;
  }
  return null;
}

describe("regla G3: needs no vacío exige su propio test de 'no aplicable sin <capability>'", () => {
  const withNeeds = DETECTORS.filter((d) => d.needs.length > 0);

  it("todo detector con needs no vacío tiene un <id>.test.ts junto a su implementación", () => {
    for (const d of withNeeds) {
      expect(
        findDetectorTestFile(d.id),
        `detector "${d.id}" declara needs=[${d.needs.join(", ")}] pero no tiene <id>.test.ts`,
      ).not.toBeNull();
    }
  });

  it("cada capacidad declarada en needs tiene su propio test 'no aplicable sin <capability>'", () => {
    for (const d of withNeeds) {
      const testFile = findDetectorTestFile(d.id);
      if (!testFile) continue; // ya lo reportó el test anterior
      const contents = fs.readFileSync(testFile, "utf8");
      for (const cap of d.needs) {
        const expected = `no aplicable sin ${cap}`;
        expect(contents.includes(expected), `"${path.basename(testFile)}" no tiene un test "${expected}"`).toBe(true);
      }
    }
  });

  /**
   * `arrayContaining` y NO igualdad exacta, a propósito: la versión original
   * afirmaba "exactamente estos dos", lo que obligaba a CADA detector nuevo
   * con `needs` a editar este archivo — un punto de choque compartido más, de
   * la misma familia que el que resolvió la apertura de `CodeFindingKind`. Lo
   * que este test protege es que los dos de F1 sigan cubiertos, no que sean
   * los únicos: la regla general ya la cubren los dos tests de arriba, que se
   * aplican solos a todo detector que se registre.
   */
  it("F1: empty-catch y large-class siguen entre los detectores con needs no vacío", () => {
    expect(withNeeds.map((d) => d.id)).toEqual(expect.arrayContaining(["empty-catch", "large-class"]));
  });
});
