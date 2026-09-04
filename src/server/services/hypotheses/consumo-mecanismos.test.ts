/**
 * LA COMPUERTA DE CONSUMO — Ola 11a (P3), el entregable que le da criterio
 * de cierre a la ola ("Terminar lo construido", ver PENDIENTES.md).
 *
 * El vicio medido en 8 instancias distintas a lo largo del proyecto (ver
 * PENDIENTES.md, "LA DEUDA QUE ATRAVIESA TODO EL PROYECTO"): un mecanismo se
 * construye, se cablea, mide en el censo — y nadie lo CONSUME. El criterio
 * de éxito nunca se enunció en consumo ("N hipótesis leen X"), siempre en
 * existencia ("X está cableado"). Este archivo es la compuerta que lo
 * impide iterando hacia adelante: recorre `HYPOTHESES` (`registry.ts`,
 * SIN lista escrita a mano) y cuenta, para cada builder, si su código
 * consume cada uno de los ocho mecanismos de esta ola — `refresh()`,
 * `ctx.neighborhood`, `memberSignatures`, `calls`, `arity`, `instantiates`,
 * `satisfies`, `visibility`. Si algún mecanismo queda en CERO consumidores,
 * este test se pone rojo — esa es la regla, no una sugerencia.
 *
 * POR QUÉ AST Y NO UNA REGEX SOBRE EL TEXTO CRUDO: la línea base de esta
 * ola se midió por `grep`, y el propio encargo señala su punto ciego —
 * `grep` no distingue "el código LEE `ctx.neighborhood`" de "un comentario
 * MENCIONA `ctx.neighborhood`" (exactamente el error que infló conteos
 * previos: "las demás lo mencionan en comentarios"). Parsear cada archivo
 * con el compilador de TypeScript (`ts.createSourceFile`) y buscar los
 * nodos SINTÁCTICOS reales (una `PropertyAccessExpression` cuyo nombre es
 * "neighborhood", un `CallExpression` a `memberSignatures`, un literal de
 * cadena "calls"/"instantiates"/"satisfies" en posición de comparación o
 * de conjunto) excluye los comentarios y los strings de prosa por
 * construcción — el parser no los expone como nodos de código. Sigue sin
 * ser una prueba de comportamiento (no instrumenta un `ctx` real ni corre
 * `build()` de las 17 — cada una espera una forma de `Finding` muy
 * específica, replicar eso genéricamente sin conocimiento de cada patrón
 * sería inventar 17 fixtures a ciegas, más frágil que esto), pero es
 * estrictamente más honesto que grepear texto: mide SINTAXIS real, nunca
 * comentarios ni strings de prosa.
 *
 * ARCHIVO NUEVO en `hypotheses/`, NO es una hipótesis — sumado a la lista
 * de exclusión de `registries.test.ts` NO HACE FALTA: `scanDir` de ese test
 * ya excluye cualquier archivo que termine en `.test.ts` (este lo es), así
 * que no hace falta tocar esa lista — confirmado leyendo `scanDir` antes de
 * escribir esto (el error que ya rompió esa compuerta cuatro veces).
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { HIPOTESIS_DELIBERADAMENTE_SIN_REGISTRAR } from "./desregistradas.js";
import { HYPOTHESES } from "./registry.js";

const HYPOTHESES_DIR = path.resolve(import.meta.dirname);

/** Los ocho mecanismos que esta ola exige poder CONTAR — nombres calcados de
 *  la línea base del encargo (PENDIENTES.md / CONTRATO-11a), en el mismo
 *  orden. */
const MECHANISMS = ["refresh", "neighborhood", "memberSignatures", "calls", "arity", "instantiates", "satisfies", "visibility"] as const;
type Mechanism = (typeof MECHANISMS)[number];

/** Piso medido HOY por el integrador de esta ola (grep, corregido a mano
 *  para excluir comentarios) — ver PENDIENTES.md. Este test NUNCA puede
 *  bajar de acá: un mecanismo que retrocede a un número menor, o a CERO, es
 *  exactamente la regresión que esta compuerta existe para atajar. Los
 *  números pueden SUBIR libremente (otro paquete de la misma ola migrando
 *  una hipótesis más) sin que este archivo necesite tocarse — el `toBeGreaterThanOrEqual`
 *  de abajo no exige igualdad. */
const FLOOR: Record<Mechanism, number> = {
  refresh: 1,
  neighborhood: 1,
  memberSignatures: 11,
  calls: 12,
  arity: 13,
  instantiates: 10,
  satisfies: 9,
  visibility: 2,
};

/**
 * LA POBLACIÓN QUE ESTE TEST ANALIZA — Ola AZ, frente AZ1. Antes era `HYPOTHESES` a secas, y
 * eso hacía que el piso midiera lo que no quería medir.
 *
 * EL DEFECTO, con el número que lo destapó. La Ola AZ dio de baja CUATRO patrones por precisión
 * medida (`Composite` 3/25, `Iterator` 1/19, `Null Object` 5/52, `Singleton` 0/11). Una baja se
 * hace por DESREGISTRO —el archivo y sus tests quedan en disco, con su código intacto—, así que
 * ninguno de esos cuatro archivos dejó de consumir ningún mecanismo: lo único que cambió es que
 * salieron del arreglo `HYPOTHESES`. Contando sólo los registrados, cuatro mecanismos caían por
 * debajo de su piso —`memberSignatures` 11→8, `arity` 15→11, `instantiates` 10→8,
 * `satisfies` 10→7— y la única salida habría sido BAJAR los pisos, que es re-congelar un
 * baseline para que pase. El piso no estaba mal; estaba mal la población.
 *
 * LO QUE ESTE TEST DE VERDAD AFIRMA, ahora separado en sus dos mitades, porque son dos cosas:
 *
 *   · **EL PISO (anti-regresión)** se mide sobre TODO archivo de hipótesis que el proyecto
 *     mantiene en disco: los registrados MÁS los deliberadamente desregistrados y declarados en
 *     `desregistradas.ts`. Responde «¿alguien dejó de consumir este mecanismo?», y la respuesta
 *     no puede cambiar porque una hipótesis se haya dado de baja. Sigue rojo si un archivo
 *     desaparece del disco o si alguno deja de usar un mecanismo — que es la regresión real.
 *   · **LA REGLA DURA (`> 0`)** se mide sólo sobre los REGISTRADOS, y por eso esta ola la deja
 *     MÁS estricta que antes, no menos: «un mecanismo construido y que ninguna hipótesis VIVA
 *     consume» ahora se ve, donde antes un archivo desregistrado lo habría tapado.
 */
const POBLACION: readonly { readonly id: string; readonly registrada: boolean }[] = [
  ...HYPOTHESES.map((h) => ({ id: h.id, registrada: true })),
  ...HIPOTESIS_DELIBERADAMENTE_SIN_REGISTRAR.filter((d) => d.file.startsWith("hypotheses/")).map((d) => ({
    id: d.id,
    registrada: false,
  })),
].sort((a, b) => a.id.localeCompare(b.id));

const EDGE_KIND_LITERALS = new Set(["calls", "instantiates", "satisfies"]);

interface FileConsumption {
  readonly id: string;
  readonly file: string;
  readonly consumes: Readonly<Record<Mechanism, boolean>>;
}

/** `true` si `name` es "refresh" Y es miembro (método o propiedad-función) de
 *  un OBJECT LITERAL — no cualquier función suelta llamada "refresh" en
 *  algún lado del archivo (ninguna de las 17 tiene una, pero el chequeo es
 *  estructural, no de nombre a secas, a propósito). */
function isHypothesisRefreshMember(node: ts.Node): boolean {
  if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.name.text === "refresh") {
    return ts.isObjectLiteralExpression(node.parent);
  }
  if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "refresh") {
    return ts.isObjectLiteralExpression(node.parent);
  }
  return false;
}

/** `true` si el literal de cadena está en posición de COMPARACIÓN
 *  (`e.kind === "calls"`) o dentro de un array/Set literal
 *  (`new Set(["instantiates", "calls"])`, `["extends","implements","satisfies"]`)
 *  — el par de formas que las 17 hipótesis ya usan de verdad para filtrar
 *  `CodeGraphEdge["kind"]`. Excluye por construcción cualquier mención
 *  suelta en prosa (un `describe`/`why` de varias palabras nunca es
 *  IGUAL, carácter a carácter, a "calls"/"instantiates"/"satisfies").
 */
function isEdgeKindUsage(literal: ts.StringLiteral): boolean {
  const parent = literal.parent;
  if (ts.isBinaryExpression(parent)) {
    const op = parent.operatorToken.kind;
    return op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken;
  }
  return ts.isArrayLiteralExpression(parent);
}

function analyzeFile(id: string, file: string): FileConsumption {
  const text = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const consumes: Record<Mechanism, boolean> = {
    refresh: false,
    neighborhood: false,
    memberSignatures: false,
    calls: false,
    arity: false,
    instantiates: false,
    satisfies: false,
    visibility: false,
  };

  function visit(node: ts.Node): void {
    if (isHypothesisRefreshMember(node)) consumes.refresh = true;

    if (ts.isPropertyAccessExpression(node)) {
      const name = node.name.text;
      if (name === "neighborhood") consumes.neighborhood = true;
      if (name === "arity") consumes.arity = true;
      if (name === "visibility") consumes.visibility = true;
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "memberSignatures") {
      consumes.memberSignatures = true;
    }

    if (ts.isStringLiteral(node) && EDGE_KIND_LITERALS.has(node.text) && isEdgeKindUsage(node)) {
      if (node.text === "calls") consumes.calls = true;
      if (node.text === "instantiates") consumes.instantiates = true;
      if (node.text === "satisfies") consumes.satisfies = true;
    }

    ts.forEachChild(node, visit);
  }
  visit(source);

  return { id, file: path.relative(HYPOTHESES_DIR, file), consumes };
}

describe("hypotheses — compuerta de consumo de mecanismos (Ola 11a)", () => {
  const perFile = POBLACION.map((p) => ({
    ...analyzeFile(p.id, path.join(HYPOTHESES_DIR, `${p.id}.ts`)),
    registrada: p.registrada,
  }));

  it("todo archivo de la POBLACIÓN (registrados + desregistrados declarados) existe en disco y se pudo parsear (control del arnés, no del contenido)", () => {
    for (const f of perFile) {
      expect(fs.existsSync(path.join(HYPOTHESES_DIR, `${f.id}.ts`)), `${f.id}.ts no existe`).toBe(true);
    }
    expect(perFile.length).toBe(POBLACION.length);
    // Y las dos mitades por separado, para que un cambio en cualquiera de los dos registros se vea.
    expect(perFile.filter((f) => f.registrada).length).toBe(HYPOTHESES.length);
  });

  it.each(MECHANISMS)("mecanismo '%s': cuenta de consumidores reales, reportada y >= piso, y NUNCA cero", (mechanism) => {
    const consumers = perFile.filter((f) => f.consumes[mechanism]);
    const count = consumers.length;
    const vivos = consumers.filter((c) => c.registrada);

    // eslint-disable-next-line no-console
    console.log(
      `[consumo-mecanismos] ${mechanism}: ${count}/${POBLACION.length} (registradas: ${vivos.length}/${HYPOTHESES.length}) — ${consumers.map((c) => (c.registrada ? c.id : `${c.id}(desregistrada)`)).join(", ") || "(ninguno)"}`,
    );

    // LA REGLA DURA: un mecanismo construido con CERO consumidores tiene que
    // romper este test, sin excepción — nunca se permite en silencio. Ola AZ: se
    // exige sobre las REGISTRADAS, que es más estricto que antes — un mecanismo
    // que sólo consume un archivo desregistrado ya no tiene consumidor vivo.
    expect(vivos.length, `"${mechanism}" quedó en CERO consumidores REGISTRADOS — mecanismo construido, ninguna hipótesis viva lo usa (el vicio de las 8 instancias previas, ver PENDIENTES.md)`).toBeGreaterThan(0);

    // EL PISO: nunca por debajo de lo medido al abrir esta ola — puede subir
    // libremente cuando otro paquete migre una hipótesis más.
    expect(count, `"${mechanism}" retrocedió por debajo del piso medido (${FLOOR[mechanism]}) — regresión`).toBeGreaterThanOrEqual(
      FLOOR[mechanism],
    );
  });

  it("resumen legible: una fila por hipótesis, un booleano por mecanismo (para el informe, no una aserción)", () => {
    const table = perFile.map((f) => ({ id: f.id, registrada: f.registrada, ...f.consumes }));
    // eslint-disable-next-line no-console
    console.log("[consumo-mecanismos] tabla completa:\n" + JSON.stringify(table, null, 2));
    expect(table.length).toBe(POBLACION.length);
  });
});
