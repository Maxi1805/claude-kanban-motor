import { describe, expect, it } from "vitest";

import {
  esArnesDeDescubrimiento,
  esFamiliaSimetricaDeNombres,
  lineasDeCodigoProbadas,
  lineasDeComentarioProbadas,
  MIN_CODE_LINES_SPEC,
  refinarArbolesEspejo,
  tienePocoCodigo,
} from "./n2-forma-de-clon.js";
import { detectMirrorTrees } from "../mirror-tree.js";
import type { CloneCandidate } from "../types.js";

function clone(
  overrides: Partial<CloneCandidate> & Pick<CloneCandidate, "fingerprint" | "file" | "startLine" | "endLine">,
): CloneCandidate {
  return {
    nodes: 40,
    type: "method_declaration",
    functionName: null,
    className: null,
    superclassName: null,
    normalized: "same shape",
    ...overrides,
  };
}

/**
 * Un par de raíces con `n` gemelos CONFIRMADOS por el piso estricto de
 * `detectMirrorTrees` (≥3 fingerprints compartidos, ratio ≥ 0.5, sufijo ≥ 3
 * segmentos). Es lo que habilita el piso relajado del frente N2.
 */
function arbolEspejoConfirmado(n: number): CloneCandidate[] {
  const out: CloneCandidate[] = [];
  for (let i = 0; i < n; i++) {
    for (const raiz of ["jre", "otro"]) {
      for (let k = 0; k < 3; k++) {
        out.push(
          clone({
            fingerprint: `gordo${i}-${k}`,
            file: `${raiz}/paq/sub/Gordo${i}.java`,
            startLine: 1 + k * 20,
            endLine: 15 + k * 20,
          }),
        );
      }
    }
  }
  return out;
}

describe("n2-forma-de-clon — árbol espejo chico", () => {
  it("un gemelo con UN solo fingerprint no lo empareja el piso estricto, y sí el refinado, bajo un par de raíces ya confirmado", () => {
    const chico = [
      clone({ fingerprint: "chico", file: "jre/paq/sub/Chico.java", startLine: 1, endLine: 30 }),
      clone({ fingerprint: "chico", file: "otro/paq/sub/Chico.java", startLine: 1, endLine: 30 }),
    ];
    const clones = [...arbolEspejoConfirmado(3), ...chico];

    const estricto = detectMirrorTrees(clones);
    expect(estricto.canonicalOf.has("otro/paq/sub/Chico.java")).toBe(false);

    const refinado = refinarArbolesEspejo(clones, estricto);
    expect(refinado.canonicalOf.get("otro/paq/sub/Chico.java")).toBe("jre/paq/sub/Chico.java");
    // Los gemelos que el piso estricto YA había confirmado siguen ahí.
    expect(refinado.canonicalOf.get("otro/paq/sub/Gordo0.java")).toBe("jre/paq/sub/Gordo0.java");
  });

  it("SIN evidencia de árbol (un solo par de raíces confirmado) el par chico NO se admite", () => {
    const chico = [
      clone({ fingerprint: "chico", file: "jre/paq/sub/Chico.java", startLine: 1, endLine: 30 }),
      clone({ fingerprint: "chico", file: "otro/paq/sub/Chico.java", startLine: 1, endLine: 30 }),
    ];
    const clones = [...arbolEspejoConfirmado(1), ...chico];

    const refinado = refinarArbolesEspejo(clones, detectMirrorTrees(clones));
    expect(refinado.canonicalOf.has("otro/paq/sub/Chico.java")).toBe(false);
  });

  it("dos homónimos en el mismo lugar relativo pero SIN nada compartido no se emparejan aunque haya árbol espejo", () => {
    const distintos = [
      clone({ fingerprint: "uno", file: "jre/paq/sub/Otro.java", startLine: 1, endLine: 30 }),
      clone({ fingerprint: "dos", file: "otro/paq/sub/Otro.java", startLine: 1, endLine: 30 }),
    ];
    const clones = [...arbolEspejoConfirmado(3), ...distintos];

    const refinado = refinarArbolesEspejo(clones, detectMirrorTrees(clones));
    expect(refinado.canonicalOf.has("otro/paq/sub/Otro.java")).toBe(false);
  });

  it("control negativo: sin ningún gemelo confirmado devuelve el mismo objeto, sin recorrer nada", () => {
    const clones = [
      clone({ fingerprint: "a", file: "x/y/z/A.java", startLine: 1, endLine: 30 }),
      clone({ fingerprint: "a", file: "p/q/r/B.java", startLine: 1, endLine: 30 }),
    ];
    const base = detectMirrorTrees(clones);
    expect(refinarArbolesEspejo(clones, base)).toBe(base);
  });
});

describe("n2-forma-de-clon — líneas de comentario que pagan el piso de tamaño", () => {
  it("cuenta un comentario de bloque por su apertura más cada marcador de continuación", () => {
    expect(lineasDeComentarioProbadas("/** * uno * dos */ codigo();")).toBe(3);
  });

  it("cuenta un marcador por cada comentario de línea, sin importar el lenguaje", () => {
    expect(lineasDeComentarioProbadas("// uno codigo(); // dos")).toBe(2);
    expect(lineasDeComentarioProbadas("# uno codigo() # dos")).toBe(2);
    expect(lineasDeComentarioProbadas("/// uno codigo(); /// dos")).toBe(2);
  });

  it("no confunde una interpolación con un comentario ni una barra dentro de un literal", () => {
    expect(lineasDeComentarioProbadas('puts "#{valor}"')).toBe(0);
    expect(lineasDeComentarioProbadas('const u = "https://ejemplo/x";')).toBe(0);
  });

  it("las líneas de código son el span menos las de comentario, y nunca negativas", () => {
    const c = clone({
      fingerprint: "f",
      file: "a.java",
      startLine: 10,
      endLine: 15,
      normalized: "// nota void f() { g(); }",
    });
    expect(lineasDeCodigoProbadas(c)).toBe(5);
    expect(tienePocoCodigo(c, { value: 6 })).toBe(true);
    expect(tienePocoCodigo(c, { value: 5 })).toBe(false);
  });

  it("un fragmento sin comentarios no lo toca el filtro", () => {
    const c = clone({ fingerprint: "f", file: "a.java", startLine: 1, endLine: 6, normalized: "void f() { g(); }" });
    expect(tienePocoCodigo(c, { value: 6 })).toBe(false);
  });

  it("el piso declarado es el MISMO 6 que ya se aplica aguas arriba", () => {
    expect(MIN_CODE_LINES_SPEC).toMatchObject({ kind: "piso-declarado", value: 6 });
  });
});

describe("n2-forma-de-clon — arnés descubierto por nombre", () => {
  const arnes = (nombre: string, texto: string) =>
    clone({ fingerprint: "f", file: "a.java", startLine: 1, endLine: 20, functionName: nombre, normalized: texto });

  it("todas las copias con nombre de descubrimiento y aridad PROBADA cero", () => {
    expect(
      esArnesDeDescubrimiento([
        arnes("testFloor", "public void testFloor() { assertEquals(a, b); }"),
        arnes("testCeiling", "public void testCeiling() { assertEquals(a, b); }"),
      ]),
    ).toBe(true);
  });

  it("con parámetros NO es arnés: el runner reflexivo no tendría qué pasarle", () => {
    expect(
      esArnesDeDescubrimiento([
        arnes("testConnection", "public void testConnection(String url) { open(url); }"),
        arnes("testChannel", "public void testChannel(String url) { open(url); }"),
      ]),
    ).toBe(false);
  });

  it("si el clon no incluye la declaración, la aridad no se puede probar y el filtro se abstiene", () => {
    expect(esArnesDeDescubrimiento([arnes("testFloor", "{ assertEquals(a, b); }"), arnes("testCeiling", "{ assertEquals(a, b); }")])).toBe(
      false,
    );
  });

  it("un nombre que sólo EMPIEZA con las mismas letras no cuenta (frontera de token)", () => {
    expect(
      esArnesDeDescubrimiento([
        arnes("testable", "boolean testable() { return true; }"),
        arnes("testimony", "boolean testimony() { return true; }"),
      ]),
    ).toBe(false);
  });

  it("un grupo MIXTO (una copia en el arnés, otra en el producto) se reporta igual", () => {
    expect(
      esArnesDeDescubrimiento([
        arnes("testFloor", "public void testFloor() { assertEquals(a, b); }"),
        arnes("floor", "public void floor() { assertEquals(a, b); }"),
      ]),
    ).toBe(false);
  });

  it("control negativo: grupo vacío", () => {
    expect(esArnesDeDescubrimiento([])).toBe(false);
  });
});

describe("n2-forma-de-clon — familia simétrica de 3 o más", () => {
  const miembro = (nombre: string, texto: string) =>
    clone({ fingerprint: "f", file: "a.cs", startLine: 1, endLine: 13, functionName: nombre, normalized: texto });

  it("tres hermanas cuya única diferencia es el propio nombre invocado dentro del cuerpo", () => {
    expect(
      esFamiliaSimetricaDeNombres([
        miembro("Min", "int Min(int a, int b) { return Math.Min(a, b); }"),
        miembro("Max", "int Max(int a, int b) { return Math.Max(a, b); }"),
        miembro("Mid", "int Mid(int a, int b) { return Math.Mid(a, b); }"),
      ]),
    ).toBe(true);
  });

  it("no dispara con 2 copias: ese caso lo decide `isSymmetricNamePair` de A4b", () => {
    expect(
      esFamiliaSimetricaDeNombres([
        miembro("Min", "int Min(int a, int b) { return Math.Min(a, b); }"),
        miembro("Max", "int Max(int a, int b) { return Math.Max(a, b); }"),
      ]),
    ).toBe(false);
  });

  it("si queda una diferencia real después de sacar el nombre propio, no es simétrica", () => {
    expect(
      esFamiliaSimetricaDeNombres([
        miembro("Min", "int Min(int a, int b) { return Math.Min(a, b); }"),
        miembro("Max", "int Max(int a, int b) { return Math.Max(a, b); }"),
        miembro("MaxD", "double MaxD(double a, double b) { return Math.MaxD(a, b); }"),
      ]),
    ).toBe(false);
  });

  it("dos copias con el MISMO nombre en el grupo lo descartan: no son hermanas simétricas", () => {
    expect(
      esFamiliaSimetricaDeNombres([
        miembro("Min", "int Min(int a, int b) { return Math.Min(a, b); }"),
        miembro("Max", "int Max(int a, int b) { return Math.Max(a, b); }"),
        miembro("Max", "int Max(int a, int b) { return Math.Max(a, b); }"),
      ]),
    ).toBe(false);
  });

  it("una copia anónima nunca forma familia simétrica", () => {
    expect(
      esFamiliaSimetricaDeNombres([
        miembro("Min", "int Min(int a, int b) { return Math.Min(a, b); }"),
        miembro("Max", "int Max(int a, int b) { return Math.Max(a, b); }"),
        clone({ fingerprint: "f", file: "a.cs", startLine: 1, endLine: 13, functionName: null }),
      ]),
    ).toBe(false);
  });
});
