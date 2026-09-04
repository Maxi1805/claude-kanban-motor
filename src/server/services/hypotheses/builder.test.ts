import { describe, expect, it } from "vitest";

import type { Finding } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD, type Neighborhood } from "../graph/neighborhood.js";
import { symbolNodeId, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";
import {
  assemblySets,
  assignOnlyBodySpec,
  branchSelectionBodySpec,
  branchSelectionPlusExtraBodySpec,
  buildNode,
  conditionalBodySpec,
  invokeOnlyChainBodySpec,
  invokeAndAssignChainBodySpec,
  fakeAstNode,
  fakeContext,
  fakeDataClumpFinding,
  fakeFileUnit,
  fakeFunctionUnit,
  fakeLongParameterListFinding,
  fakeRepo,
  fakeRepoFunction,
  fakeThreshold,
  forwardingBodySpec,
  graphContainsAll,
  graphEdge,
  graphMethod,
  graphSym,
  makeGraph,
  nestedWrapBodySpec,
  raiseVsConstructBodySpec,
  subObjectAssemblyBodySpec,
  ternaryConstructionBodySpec,
} from "./builder.fixtures.js";
import { build, buildAlternative, hypothesis, refresh } from "./builder.js";

/** Nodo de función REAL, con nombre/parámetros propios y el cuerpo dado —
 *  usado por los tests de `ensambla-con-logica` de este archivo. */
function fnNode(name: string, paramNames: readonly string[], bodySpec: Parameters<typeof buildNode>[0]) {
  return buildNode({
    type: "function_declaration",
    fields: {
      name: { type: "identifier", text: name },
      parameters: { type: "formal_parameters", extraChildren: paramNames.map((p) => ({ type: "identifier", text: p })) },
      body: bodySpec,
    },
  });
}

describe("hypotheses/builder — registro", () => {
  it("ancla long-parameter-list y data-clump — id/pattern estables", () => {
    expect(hypothesis.id).toBe("builder");
    expect(hypothesis.pattern).toBe("Builder");
    expect(hypothesis.anchors).toEqual(["long-parameter-list", "data-clump"]);
  });

  it("OLA AY (AY3): `optional-construction-combinations` SE DIO DE BAJA — 12 juicios en el banco entero y los 12 `falso`, costo CERO medido", () => {
    // El único recorte de este frente, y el que el encargo de la ola autorizó
    // por su nombre. Contado sobre los 162 archivos de veredictos de TODAS las
    // olas: `optional-construction-combinations::Builder` tiene 12 juicios
    // escritos y los 12 son `falso` (10 vivos contra el censo de los 21 repos,
    // 2 vencidos). Cero `verdadero`, cero `problema-si-patrón-no`, cero
    // `dudoso`, ni vivo ni vencido. La población viva del ancla era de 10
    // propuestas y las 10 estaban juzgadas: el costo no está estimado en cero,
    // está MEDIDO en cero sobre el censo entero.
    expect(hypothesis.anchors).not.toContain("optional-construction-combinations");
    // PERO NO SE BORRÓ NADA: el camino sigue entero en `builder.ts` y sus
    // tests siguen abajo, ejercitando `build()` directamente con un `Finding`
    // de ese `kind` — reconectar la celda es agregar una cadena a `anchors`.
    // Y el DETECTOR de nivel 1 tampoco se tocó: sigue registrado y sigue
    // emitiendo. Delta de nivel 1 de este recorte: CERO.
    expect(
      build(fakeOptionalCombinationsFinding(), occGraph(OCC_SITES), occCtx()),
      "el camino desconectado tiene que seguir construyendo cuando se lo invoca directo",
    ).not.toBeNull();
  });

  it("OLA AN (AN4): el ancla de NIVEL 2 se MIDIÓ y NO se aterrizó — `anchors` NO la incluye, y ése es el resultado publicado", () => {
    // Emitió 395 recomendaciones (167 en bibliotecas · 228 en aplicaciones) y
    // acertó 0 de 58 juzgadas a mano, contra el 12,5 %/6,1 % de la celda del
    // smell. La condición de aterrizaje, escrita ANTES de medir, era "no peor
    // que la celda actual". El camino sigue en el archivo, probado abajo, pero
    // desconectado: `rebuildHypothesesWithGraph` filtra por `anchors`.
    expect(hypothesis.anchors).not.toContain("long-function");
    expect(hypothesis.anchors).not.toContain("complexity");
    // Y las DOS que quedan siguen enteras. (La tercera, `optional-construction-
    // combinations`, se dio de baja en la Ola AY con su número medido — ver el
    // `it` de arriba; nada de eso toca el resultado de AN4, que sigue siendo
    // "el ancla de nivel 2 se midió y no se aterrizó".)
    for (const vieja of ["long-parameter-list", "data-clump"]) {
      expect(hypothesis.anchors).toContain(vieja);
    }
  });
});

describe("hypotheses/builder — required", () => {
  it("LÍMITE DE CABLEADO: con `repo.functions` vacío (el caso real hoy), el fallback por `RoleLocation.symbol` igual construye una candidata (con `ctx.file` mostrando ensamblaje real, el otro dato SIEMPRE vivo en producción para este ancla)", () => {
    const finding = fakeLongParameterListFinding(); // symbol: "build" — matchea FACTORY_NAME
    const file = fakeFileUnit([fakeFunctionUnit()]); // default: cuerpo con condicional propio (ver fixtures)
    const ctx = fakeContext({ repo: fakeRepo([]), file });
    expect(build(finding, null, ctx)).not.toBeNull();
  });

  it("nombre SIN forma de construcción (ni constructor, ni fábrica), aunque `repo.functions` esté vacío ⇒ null", () => {
    const finding = fakeLongParameterListFinding({
      locations: [{ file: "a.js", startLine: 1, endLine: 10, symbol: "sumAllTheThings", role: "función con exceso de parámetros" }],
    });
    const ctx = fakeContext({ repo: fakeRepo([]) });
    expect(build(finding, null, ctx)).toBeNull();
  });

  it("`repo.functions` (enriquecimiento oportunista) puede CONFIRMAR forma de construcción aun con un nombre que no la sugiere", () => {
    const finding = fakeLongParameterListFinding({
      locations: [{ file: "a.js", startLine: 1, endLine: 10, symbol: "sumAllTheThings", role: "función con exceso de parámetros" }],
    });
    const repoFn = fakeRepoFunction({ name: "sumAllTheThings" }, { isConstructor: true, isFactoryLike: false });
    const file = fakeFileUnit([fakeFunctionUnit({ name: "sumAllTheThings" }, { isConstructor: true })]);
    const ctx = fakeContext({ repo: fakeRepo([repoFn]), file });
    expect(build(finding, null, ctx)).not.toBeNull();
  });

  it("kind ajeno a las dos anclas ⇒ ancla no reconocida ⇒ null", () => {
    const finding = fakeLongParameterListFinding({ kind: "large-class" });
    const repoFn = fakeRepoFunction({}, { isConstructor: true });
    const ctx = fakeContext({ repo: fakeRepo([repoFn]) });
    expect(build(finding, null, ctx)).toBeNull();
  });

  it("OLA 12 — el discriminador nuevo: cuerpo que SÓLO asigna sus propios parámetros a campos ⇒ null (el remedio nativo del lenguaje alcanza, Builder no aporta)", () => {
    const finding = fakeLongParameterListFinding();
    const onlyAssigns = fakeFunctionUnit(
      { node: fnNode("build", ["a", "b", "c", "d", "e", "f", "g", "h"], assignOnlyBodySpec(["a", "b", "c", "d", "e", "f", "g", "h"])), sets: assemblySets() },
      { isConstructor: true },
    );
    const file = fakeFileUnit([onlyAssigns]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });
    const h = build(finding, null, ctx);
    expect(h).toBeNull();
  });

  it("OLA 12 — el discriminador nuevo: una única llamada de reenvío (forwarding, todos los parámetros pasados sin transformar) ⇒ null — el caso medido de `create_booking` (RAICES.md)", () => {
    const finding = fakeLongParameterListFinding();
    const forwards = fakeFunctionUnit(
      { node: fnNode("build", ["a", "b", "c", "d", "e", "f", "g", "h"], forwardingBodySpec("Delegate.create")), sets: assemblySets() },
      { isConstructor: false, isFactoryLike: true },
    );
    const file = fakeFileUnit([forwards]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });
    expect(build(finding, null, ctx)).toBeNull();
  });

  it("OLA AM (AM3) — una cadena que SÓLO INVOCA (reenvío/despacho, ninguna rama asigna ni instancia) ⇒ null: no es ensamblado incremental", () => {
    const finding = fakeLongParameterListFinding();
    const invokeOnly = fakeFunctionUnit(
      { node: fnNode("build", ["a", "b", "c", "d", "e", "f", "g", "h"], invokeOnlyChainBodySpec()), sets: assemblySets() },
      { isConstructor: true },
    );
    const ctx = fakeContext({ repo: fakeRepo([]), file: fakeFileUnit([invokeOnly]) });
    expect(build(finding, null, ctx)).toBeNull();
  });

  it("OLA AM (AM3) — GUARDIÁN: la MISMA cadena con una asignación en la rama SIGUE construyendo la candidata (el descarte no se sobre-extiende)", () => {
    const finding = fakeLongParameterListFinding();
    const mixed = fakeFunctionUnit(
      { node: fnNode("build", ["a", "b", "c", "d", "e", "f", "g", "h"], invokeAndAssignChainBodySpec()), sets: assemblySets() },
      { isConstructor: true },
    );
    const ctx = fakeContext({ repo: fakeRepo([]), file: fakeFileUnit([mixed]) });
    expect(build(finding, null, ctx)).not.toBeNull();
  });

  it("OLA 12 — el discriminador nuevo: condicional propio que decide qué se asigna ⇒ construye la candidata (validación/ensamblado incremental)", () => {
    const finding = fakeLongParameterListFinding();
    const conditional = fakeFunctionUnit(
      { node: fnNode("build", ["a", "b", "c", "d", "e", "f", "g", "h"], conditionalBodySpec()), sets: assemblySets() },
      { isConstructor: true },
    );
    const file = fakeFileUnit([conditional]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });
    const h = build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.checks.some((c) => c.passed && /condicional/.test(c.why))).toBe(true);
  });

  it("OLA 12 — el discriminador nuevo: ≥2 sub-objetos instanciados dentro del cuerpo ⇒ construye la candidata (armar sub-objetos, no un wrapper trivial)", () => {
    const finding = fakeLongParameterListFinding();
    const assembler = fakeFunctionUnit(
      { node: fnNode("build", ["a", "b", "c", "d", "e", "f", "g", "h"], subObjectAssemblyBodySpec()), sets: assemblySets() },
      { isConstructor: true },
    );
    const file = fakeFileUnit([assembler]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });
    const h = build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.checks.some((c) => c.passed && /sub-objetos/.test(c.why))).toBe(true);
  });

  it("GUARDIÁN post-Ola 12 — un `new Wrapper(new Inner())` (UNA sola envoltura anidada, idiom Adapter/Wrapper universal) ⇒ null, NO cuenta como ≥2 sub-objetos: caso real medido en corpus/newtonsoft-json#CreateXmlDocumentType", () => {
    const finding = fakeLongParameterListFinding();
    const wraps = fakeFunctionUnit(
      { node: fnNode("build", ["a", "b", "c", "d", "e", "f", "g", "h"], nestedWrapBodySpec()), sets: assemblySets() },
      { isConstructor: true },
    );
    const file = fakeFileUnit([wraps]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });
    expect(build(finding, null, ctx)).toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // OLA 14 — `ensambla-con-logica` YA NO acepta selección entre ramas como
  // ensamblaje. Los dos casos medidos de guava (RAICES.md, docstring del
  // módulo sección OLA 14): `MapMakerInternalMap#newEntry` (ternario) y
  // `ClassPath.ResourceInfo#of` (if/else) — ambos Factory Method, no Builder.
  // ═══════════════════════════════════════════════════════════════════════
  it("OLA 14 — if/else de SELECCIÓN ENTRE RAMAS (return new ClassInfo()/return new ResourceInfo(), caso medido ClassPath.ResourceInfo#of, RAICES.md) ⇒ null: ninguna de las dos señales (chainNodes NI ≥2 sub-objetos) debe confirmar", () => {
    const finding = fakeLongParameterListFinding();
    const selector = fakeFunctionUnit(
      { node: fnNode("build", ["a", "b", "c", "d", "e", "f", "g", "h"], branchSelectionBodySpec()), sets: assemblySets() },
      { isConstructor: true },
    );
    const file = fakeFileUnit([selector]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });
    expect(build(finding, null, ctx)).toBeNull();
  });

  it("OLA 14 — ternario de SELECCIÓN ENTRE RAMAS (return cond ? new A() : new B(), caso medido MapMakerInternalMap#newEntry, RAICES.md) ⇒ null: el ternario NO es chainNodes (ya excluido, code-grammar.ts) y ya NO cuenta como ≥2 sub-objetos", () => {
    const finding = fakeLongParameterListFinding();
    const selector = fakeFunctionUnit(
      { node: fnNode("build", ["a", "b", "c", "d", "e", "f", "g", "h"], ternaryConstructionBodySpec()), sets: assemblySets() },
      { isConstructor: true },
    );
    const file = fakeFileUnit([selector]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });
    expect(build(finding, null, ctx)).toBeNull();
  });

  it("GUARDIÁN OLA 14 — selección entre ramas MÁS una instanciación incondicional en el mismo cuerpo ⇒ SIGUE construyendo la candidata: el descarte de 'selección entre ramas' no se sobre-extiende a cualquier cuerpo que además tenga un `if`", () => {
    const finding = fakeLongParameterListFinding();
    const mixed = fakeFunctionUnit(
      { node: fnNode("build", ["a", "b", "c", "d", "e", "f", "g", "h"], branchSelectionPlusExtraBodySpec()), sets: assemblySets() },
      { isConstructor: true },
    );
    const file = fakeFileUnit([mixed]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });
    const h = build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.checks.some((c) => c.passed && /sub-objetos/.test(c.why))).toBe(true);
  });

  it("GUARDIÁN OLA 14 — `if (cond) return new A() else raise Error()` (validar-o-construir, NO selección entre dos alternativas construidas) ⇒ SIGUE construyendo la candidata: verificado contra el candidato real de corpus/sqlalchemy (dialects/postgresql/ext.py#AggregateOrderBy.__init__) que motivó este guardián — un `raise` no debe pelarse como si fuera 'la construcción elegida' de una rama", () => {
    const finding = fakeLongParameterListFinding();
    const validateOrConstruct = fakeFunctionUnit(
      { node: fnNode("build", ["a", "b", "c", "d", "e", "f", "g", "h"], raiseVsConstructBodySpec()), sets: assemblySets() },
      { isConstructor: true },
    );
    const file = fakeFileUnit([validateOrConstruct]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });
    expect(build(finding, null, ctx)).not.toBeNull();
  });

  it("OLA 12 — LÍMITE DE CABLEADO: sin `ctx.file` (nunca pasa en producción para este ancla, ver el docstring del módulo) ⇒ null, no una oportunidad sin verificar", () => {
    const finding = fakeLongParameterListFinding();
    const repoFn = fakeRepoFunction({}, { isConstructor: true });
    const ctx = fakeContext({ repo: fakeRepo([repoFn]), file: null });
    expect(build(finding, null, ctx)).toBeNull();
  });

  it("composable Vue/JS `useWidget`: el nombre YA NO alcanza por sí solo (vocabulario de framework retirado de la DETECCIÓN, Ola 12) — sin forma estructural real, no dispara", () => {
    const finding = fakeLongParameterListFinding({
      locations: [{ file: "a.js", startLine: 1, endLine: 10, symbol: "useWidget", role: "función con exceso de parámetros" }],
    });
    const repoFn = fakeRepoFunction({ name: "useWidget", symbolPath: ["useWidget"] }, { isConstructor: false, isFactoryLike: false, className: null });
    const file = fakeFileUnit([fakeFunctionUnit({ name: "useWidget" }, { isConstructor: false, isFactoryLike: false, className: null })]);
    const ctx = fakeContext({ repo: fakeRepo([repoFn]), file });
    expect(build(finding, null, ctx)).toBeNull();
  });

  // OLA G, integrador — regresión MEDIDA EN CORPUS, no hipotética. La copia
  // local de `FACTORY_NAME` llevaba la bandera `/i` ("para cubrir
  // snake_case"), y `/i` no se aplica sólo al verbo: también convierte la
  // guarda de frontera `([_A-Z]|$)` en "cualquier letra o fin", así que todo
  // identificador que EMPIEZA con una de las ocho sílabas contaba como
  // fábrica. Medido: `corpus/click/src/click/core.py#format_usage` —un
  // formateador de texto de ayuda, cero construcción— pasaba
  // `construye-una-entidad` y producía una hipótesis Builder viva.
  // Los dos lados van en el MISMO test a propósito: el caso PascalCase es
  // justamente el que se pierde si el arreglo fuera "sacar la /i" a secas, y
  // es la convención de método público de Java/C#/Go — los lenguajes que
  // nunca se habían medido antes de que existiera el corpus.
  it("OLA G — la frontera del verbo-fábrica es estricta: `format_usage`/`formatter`/`offset`/`newline` NO son fábricas; `CreateElement` (PascalCase, C#/Java) SÍ", () => {
    const conNombre = (name: string) => {
      const finding = fakeLongParameterListFinding({
        locations: [{ file: "a.js", startLine: 1, endLine: 10, symbol: name, role: "función con exceso de parámetros" }],
      });
      // `repo.functions` vacío y `isFactoryLike: false` a propósito: se mide
      // EXACTAMENTE la vía del nombre (`symbolLooksLikeConstruction`), que es
      // la única viva en producción para este ancla. El cuerpo es el default
      // de `fakeFunctionUnit` (ensamblaje genuino), así que lo único que
      // decide el resultado es la frontera del verbo.
      const file = fakeFileUnit([fakeFunctionUnit({ name }, { isConstructor: false, isFactoryLike: false, className: null })]);
      return build(finding, null, fakeContext({ repo: fakeRepo([]), file }));
    };

    for (const name of ["format_usage", "formatter", "forward", "newline", "offset", "offer"]) {
      expect(conNombre(name), `"${name}" no debe leerse como fábrica`).toBeNull();
    }
    for (const name of ["CreateElement", "createVNode", "create_booking", "newEntry", "of"]) {
      expect(conNombre(name), `"${name}" sí debe leerse como fábrica`).not.toBeNull();
    }
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * OLA AI (frente AI6) — LA COMPUERTA IMPOSIBLE DE JAVA/C#.
   * Ver `builder.ts#locationIsGrammarConstructor` para el defecto completo:
   * un constructor de Java o de C# se llama COMO SU CLASE, así que ninguna de
   * las dos vías VIEJAS (nombre mandado / verbo-fábrica) puede reconocerlo —
   * por construcción, en todos los casos, para siempre.
   * ═══════════════════════════════════════════════════════════════════════ */

  /** Un `FunctionUnit` con forma de constructor de Java/C#: el NODO es el que
   *  la gramática declara constructor y el nombre es el de la clase. */
  function javaCtorUnit(nodeType: string) {
    return fakeFunctionUnit(
      {
        file: "CacheStats.java",
        language: "java",
        name: "CacheStats",
        symbolPath: ["CacheStats", "CacheStats"],
        node: buildNode({
          type: nodeType,
          fields: {
            name: { type: "identifier", text: "CacheStats" },
            parameters: { type: "formal_parameters", extraChildren: ["a", "b", "c", "d", "e", "f"].map((p) => ({ type: "identifier", text: p })) },
            body: conditionalBodySpec(),
          },
        }),
        sets: { ...assemblySets(), constructorNodes: new Set(["constructor_declaration"]) },
      },
      { isConstructor: false, isFactoryLike: false, className: "CacheStats" },
    );
  }

  const javaCtorFinding = () =>
    fakeLongParameterListFinding({
      language: "java",
      locations: [{ file: "CacheStats.java", startLine: 1, endLine: 10, symbol: "CacheStats", role: "función con exceso de parámetros" }],
    });

  it("OLA AI (AI6): un constructor de Java (nombre = nombre de su clase, nodo `constructor_declaration`) SÍ es candidato — la vía del NODO de la gramática, que es la que ninguna vía por nombre puede cubrir", () => {
    const file = fakeFileUnit([javaCtorUnit("constructor_declaration")], { path: "CacheStats.java", language: "java" });
    expect(build(javaCtorFinding(), null, fakeContext({ repo: fakeRepo([]), file }))).not.toBeNull();
  });

  it("OLA AI (AI6): la vía nueva mira el NODO, no el nombre — el MISMO nombre de clase sobre un `method_declaration` sigue sin ser candidato (no se abrió la puerta a cualquier método de Java)", () => {
    const file = fakeFileUnit([javaCtorUnit("method_declaration")], { path: "CacheStats.java", language: "java" });
    expect(build(javaCtorFinding(), null, fakeContext({ repo: fakeRepo([]), file }))).toBeNull();
  });

  it("OLA AI (AI6): sin árbol vivo la vía nueva NO aprueba — `required` que no puede mirar es `required` que no se cumple (no-permissive-required)", () => {
    expect(build(javaCtorFinding(), null, fakeContext({ repo: fakeRepo([]), file: null }))).toBeNull();
  });

  it("OLA AI (AI6): la vía nueva NO relaja `ensambla-con-logica` — un constructor de Java cuyo cuerpo SÓLO asigna sus parámetros sigue sin ser candidato", () => {
    const unit = fakeFunctionUnit(
      {
        file: "CacheStats.java",
        language: "java",
        name: "CacheStats",
        node: buildNode({
          type: "constructor_declaration",
          fields: {
            name: { type: "identifier", text: "CacheStats" },
            parameters: { type: "formal_parameters", extraChildren: ["a", "b", "c", "d", "e", "f"].map((p) => ({ type: "identifier", text: p })) },
            body: assignOnlyBodySpec(["a", "b", "c", "d", "e", "f"]),
          },
        }),
        sets: { ...assemblySets(), constructorNodes: new Set(["constructor_declaration"]) },
      },
      { isConstructor: false, isFactoryLike: false, className: "CacheStats" },
    );
    const file = fakeFileUnit([unit], { path: "CacheStats.java", language: "java" });
    expect(build(javaCtorFinding(), null, fakeContext({ repo: fakeRepo([]), file }))).toBeNull();
  });

  it("OLA AI (AI6): la vía nueva vale también para el ancla `data-clump` (el mismo `required` la sirve) — 3 firmas de constructor de Java con el mismo grupo", () => {
    const finding = fakeDataClumpFinding({
      language: "java",
      locations: [
        { file: "CacheStats.java", startLine: 1, endLine: 10, symbol: "CacheStats", role: "primera firma con este grupo" },
        { file: "CacheStats.java", startLine: 20, endLine: 30, symbol: "CacheStats", role: "repetición #1" },
      ],
    });
    const file = fakeFileUnit([javaCtorUnit("constructor_declaration")], { path: "CacheStats.java", language: "java" });
    expect(build(finding, null, fakeContext({ repo: fakeRepo([]), file }))).not.toBeNull();
  });

  /* ── OLA AP · AP4 — LA CUARTA SEÑAL DE ENSAMBLAJE: construcción SOBRECARGADA
   *    (constructor telescópico). Ver el docstring de
   *    `overloadedConstructionEvidence` en `builder.ts` para el defecto medido.
   *    Caso testigo real: ShareX `EffectDefinition.cs:58` (cuerpo VACÍO porque
   *    delega en el otro constructor del MISMO tipo) mientras `:83` ya está
   *    juzgado `verdadero` para Builder. ── */

  /** Una puerta de construcción declarada por la GRAMÁTICA, con `n` parámetros
   *  y un cuerpo que NO muestra ensamblaje (sólo asigna) — la forma exacta que
   *  `ensambla-con-logica` mataba y que una puerta sobrecargada no puede evitar. */
  function puertaJava(nParams: number, startLine: number, endLine: number, nodeType = "constructor_declaration") {
    const params = Array.from({ length: nParams }, (_, i) => `p${i}`);
    return fakeFunctionUnit(
      {
        file: "Maven.java",
        language: "java",
        name: "Maven",
        startLine,
        endLine,
        symbolPath: ["Maven", "Maven"],
        node: buildNode({
          type: nodeType,
          fields: {
            name: { type: "identifier", text: "Maven" },
            parameters: { type: "formal_parameters", extraChildren: params.map((x) => ({ type: "identifier", text: x })) },
            body: assignOnlyBodySpec(params),
          },
        }),
        sets: { ...assemblySets(), constructorNodes: new Set(["constructor_declaration"]) },
      },
      { isConstructor: false, isFactoryLike: false, className: "Maven", parameters: nParams },
    );
  }

  const puertaFinding = (startLine: number, endLine: number) =>
    fakeLongParameterListFinding({
      language: "java",
      locations: [{ file: "Maven.java", startLine, endLine, symbol: "Maven", role: "función con exceso de parámetros" }],
    });

  it("OLA AP (AP4): DOS puertas de construcción PESADAS del mismo tipo ⇒ candidata, aunque NINGUNA muestre ensamblaje en su cuerpo — la compuerta que una puerta sobrecargada no puede pasar por construcción", () => {
    const file = fakeFileUnit([puertaJava(8, 1, 10), puertaJava(9, 20, 40)], { path: "Maven.java", language: "java" });
    expect(build(puertaFinding(1, 10), null, fakeContext({ repo: fakeRepo([]), file }))).not.toBeNull();
  });

  it("OLA AP (AP4) — LA ESCALA: UNA sola puerta pesada junto a un constructor por defecto NO alcanza (no hay telescopio: hay una sola puerta real y el modismo nativo la cubre)", () => {
    const file = fakeFileUnit([puertaJava(8, 1, 10), puertaJava(0, 20, 25)], { path: "Maven.java", language: "java" });
    expect(build(puertaFinding(1, 10), null, fakeContext({ repo: fakeRepo([]), file }))).toBeNull();
  });

  it("OLA AP (AP4) — EL PISO SALE DEL PROPIO `Finding`, no de un número escrito acá: con el umbral del ancla en 12, dos puertas de 8 y 9 dejan de ser pesadas", () => {
    const file = fakeFileUnit([puertaJava(8, 1, 10), puertaJava(9, 20, 40)], { path: "Maven.java", language: "java" });
    const finding = fakeLongParameterListFinding({
      language: "java",
      trigger: [{ label: "parámetros", value: 8, threshold: { ...fakeThreshold(12) } }],
      locations: [{ file: "Maven.java", startLine: 1, endLine: 10, symbol: "Maven", role: "función con exceso de parámetros" }],
    });
    expect(build(finding, null, fakeContext({ repo: fakeRepo([]), file }))).toBeNull();
  });

  it("OLA AP (AP4) — SÓLO EL NODO DE LA GRAMÁTICA: dos `__init__` bajo el mismo tipo (stubs `@overload` de Python) NO son dos puertas — verificado contra sqlalchemy `sql/schema.py:562/585`", () => {
    const unidad = (startLine: number, endLine: number) =>
      fakeFunctionUnit(
        {
          file: "schema.py",
          language: "python",
          name: "__init__",
          startLine,
          endLine,
          symbolPath: ["Table", "__init__"],
          node: buildNode({
            type: "function_definition",
            fields: {
              name: { type: "identifier", text: "__init__" },
              parameters: { type: "parameters", extraChildren: ["a", "b", "c", "d", "e", "f", "g"].map((x) => ({ type: "identifier", text: x })) },
              body: assignOnlyBodySpec(["a", "b", "c", "d", "e", "f", "g"]),
            },
          }),
          sets: { ...assemblySets(), constructorNodes: new Set<string>() },
        },
        { isConstructor: true, isFactoryLike: false, className: "Table", parameters: 7 },
      );
    const file = fakeFileUnit([unidad(1, 10), unidad(20, 30)], { path: "schema.py", language: "python" });
    const finding = fakeLongParameterListFinding({
      language: "python",
      locations: [{ file: "schema.py", startLine: 1, endLine: 10, symbol: "__init__", role: "función con exceso de parámetros" }],
    });
    expect(build(finding, null, fakeContext({ repo: fakeRepo([]), file }))).toBeNull();
  });

  it("OLA AP (AP4) — NO SE PIERDE NADA Y NO SE ABRE DE MÁS: una sola puerta pesada cuyo cuerpo sólo asigna sigue sin ser candidata (el caso que AI6 fijó)", () => {
    const file = fakeFileUnit([puertaJava(8, 1, 10)], { path: "Maven.java", language: "java" });
    expect(build(puertaFinding(1, 10), null, fakeContext({ repo: fakeRepo([]), file }))).toBeNull();
  });

  it("OLA AP (AP4) — la señal NO alcanza al ancla `data-clump`: su magnitud es el TAMAÑO DEL GRUPO, no la aridad de una puerta de construcción", () => {
    const file = fakeFileUnit([puertaJava(8, 1, 10), puertaJava(9, 20, 40)], { path: "Maven.java", language: "java" });
    const finding = fakeDataClumpFinding({
      language: "java",
      locations: [
        { file: "Maven.java", startLine: 1, endLine: 10, symbol: "Maven", role: "primera firma con este grupo" },
        { file: "Maven.java", startLine: 20, endLine: 40, symbol: "Maven", role: "repetición #1" },
      ],
    });
    expect(build(finding, null, fakeContext({ repo: fakeRepo([]), file }))).toBeNull();
  });

  it("OLA AP (AP4) — sin árbol vivo la cuarta señal NO aprueba (no-permissive-required)", () => {
    expect(build(puertaFinding(1, 10), null, fakeContext({ repo: fakeRepo([]), file: null }))).toBeNull();
  });

  it("OLA AI (AI6) — LA PRUEBA DE QUE NO SE PIERDE NADA: los casos que YA pasaban por nombre siguen pasando con `constructorNodes` vacío (Python/Ruby/JS, donde la gramática no tiene nodo dedicado)", () => {
    const file = fakeFileUnit([fakeFunctionUnit({ name: "__init__" }, { isConstructor: false, isFactoryLike: false })]);
    const finding = fakeLongParameterListFinding({
      locations: [{ file: "a.js", startLine: 1, endLine: 10, symbol: "__init__", role: "función con exceso de parámetros" }],
    });
    expect(build(finding, null, fakeContext({ repo: fakeRepo([]), file }))).not.toBeNull();
  });
});

describe("hypotheses/builder — oportunidad (ausente) y escalera", () => {
  it("constructor real con 8 parámetros ⇒ oportunidad ausente, confianza alta (2 discriminadores)", () => {
    const finding = fakeLongParameterListFinding({ trigger: [{ label: "parámetros", value: 8, threshold: finding8Threshold() }] });
    const repoFn = fakeRepoFunction({}, { isConstructor: true });
    const file = fakeFileUnit([fakeFunctionUnit({}, { isConstructor: true })]);
    const ctx = fakeContext({ repo: fakeRepo([repoFn]), file });
    const h = build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.confidence).toBe("alta");
    expect(h!.anchorFindingId).toBe(finding.id);
    expect(h!.missingCapabilities).toEqual([]);
  });

  it("fábrica con nombre (no constructor real) y magnitud apenas sobre el piso ⇒ confianza baja (0 discriminadores)", () => {
    const finding = fakeLongParameterListFinding({ trigger: [{ label: "parámetros", value: 5, threshold: finding8Threshold() }] });
    const repoFn = fakeRepoFunction({ name: "createWidget" }, { isConstructor: false, isFactoryLike: true });
    const file = fakeFileUnit([fakeFunctionUnit({ name: "createWidget" }, { isConstructor: false, isFactoryLike: true })]);
    const ctx = fakeContext({ repo: fakeRepo([repoFn]), file });
    const h = build(finding, null, ctx)!;
    expect(h.state).toBe("ausente");
    expect(h.confidence).toBe("baja");
  });

  it("fábrica con nombre y magnitud fuerte (≥7) pero no constructor real ⇒ confianza media (1 discriminador)", () => {
    const finding = fakeLongParameterListFinding({ trigger: [{ label: "parámetros", value: 7, threshold: finding8Threshold() }] });
    const repoFn = fakeRepoFunction({ name: "createWidget" }, { isConstructor: false, isFactoryLike: true });
    const file = fakeFileUnit([fakeFunctionUnit({ name: "createWidget" }, { isConstructor: false, isFactoryLike: true })]);
    const ctx = fakeContext({ repo: fakeRepo([repoFn]), file });
    const h = build(finding, null, ctx)!;
    expect(h.confidence).toBe("media");
  });

  it("checks: cada uno trae label/passed/why, y el rol distingue required/discriminator/applied", () => {
    const finding = fakeLongParameterListFinding();
    const repoFn = fakeRepoFunction({}, { isConstructor: true });
    const file = fakeFileUnit([fakeFunctionUnit({}, { isConstructor: true })]);
    const ctx = fakeContext({ repo: fakeRepo([repoFn]), file });
    const h = build(finding, null, ctx)!;
    expect(h.checks.every((c) => typeof c.why === "string" && c.why.length > 0)).toBe(true);
    expect(h.checks.map((c) => c.role)).toContain("required");
    expect(h.checks.map((c) => c.role)).toContain("applied");
    expect(h.discriminators.every((c) => c.role === "discriminator")).toBe(true);
  });
});

describe("hypotheses/builder — ancla secundaria data-clump", () => {
  it("grupo repetido donde una firma es constructora ⇒ oportunidad", () => {
    const finding = fakeDataClumpFinding();
    const repoFns = [
      fakeRepoFunction({ file: "a.js", name: "build", startLine: 1, endLine: 5 }, { isConstructor: true }),
      fakeRepoFunction({ file: "a.js", name: "buildOther", startLine: 10, endLine: 14 }, { isConstructor: false }),
      fakeRepoFunction({ file: "a.js", name: "buildThird", startLine: 20, endLine: 24 }, { isConstructor: false }),
    ];
    const file = fakeFileUnit([fakeFunctionUnit({ name: "build", startLine: 1, endLine: 5 }, { isConstructor: true })]);
    const ctx = fakeContext({ repo: fakeRepo(repoFns), file });
    const h = build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });

  it("grupo repetido SIN ninguna firma constructora/fábrica (p.ej. handlers de framework) ⇒ null", () => {
    const finding = fakeDataClumpFinding({
      locations: [
        { file: "a.js", startLine: 1, endLine: 5, symbol: "handleGet", role: "primera firma con este grupo" },
        { file: "a.js", startLine: 10, endLine: 14, symbol: "handlePost", role: "repetición #1" },
        { file: "a.js", startLine: 20, endLine: 24, symbol: "handlePut", role: "repetición #2" },
      ],
    });
    const repoFns = [
      fakeRepoFunction({ file: "a.js", name: "handleGet", startLine: 1, endLine: 5 }, { isConstructor: false, isFactoryLike: false }),
      fakeRepoFunction({ file: "a.js", name: "handlePost", startLine: 10, endLine: 14 }, { isConstructor: false, isFactoryLike: false }),
      fakeRepoFunction({ file: "a.js", name: "handlePut", startLine: 20, endLine: 24 }, { isConstructor: false, isFactoryLike: false }),
    ];
    const ctx = fakeContext({ repo: fakeRepo(repoFns) });
    expect(build(finding, null, ctx)).toBeNull();
  });
});

describe("hypotheses/builder — excluder de 'ya aplicado' (ctx.file)", () => {
  it("un método hermano de la MISMA clase retorna `this` ⇒ ya-aplicado, confidence null", () => {
    const finding = fakeLongParameterListFinding();
    const repoFn = fakeRepoFunction({}, { isConstructor: true, className: "Widget" });
    const siblingThatReturnsSelf = fakeFunctionUnit(
      { name: "withColor", startLine: 20, endLine: 22, node: fakeAstNode("function withColor(c) {\n  this.color = c;\n  return this;\n}") },
      { className: "Widget" },
    );
    const anchorFn = fakeFunctionUnit({ name: "build", startLine: 1, endLine: 10 }, { isConstructor: true, className: "Widget" });
    const file = fakeFileUnit([anchorFn, siblingThatReturnsSelf]);
    const ctx = fakeContext({ repo: fakeRepo([repoFn]), file });

    const h = build(finding, null, ctx)!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull();
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.passed).toBe(true);
  });

  it("ningún hermano retorna el receptor ⇒ sigue ausente (oportunidad, con confianza)", () => {
    const finding = fakeLongParameterListFinding();
    const repoFn = fakeRepoFunction({}, { isConstructor: true, className: "Widget" });
    const anchorFn = fakeFunctionUnit({ name: "build", startLine: 1, endLine: 10 }, { isConstructor: true, className: "Widget" });
    const otherFn = fakeFunctionUnit({ name: "toString", startLine: 20, endLine: 22 }, { className: "Widget" });
    const file = fakeFileUnit([anchorFn, otherFn]);
    const ctx = fakeContext({ repo: fakeRepo([repoFn]), file });

    const h = build(finding, null, ctx)!;
    expect(h.state).toBe("ausente");
    expect(h.confidence).not.toBeNull();
  });

  it("OLA 12 — LÍMITE DE CABLEADO: ctx.file null (nunca pasa en producción para este ancla) ⇒ null de punta a punta, no sólo el excluder de aplicado — `ensambla-con-logica` (required) tampoco puede confirmar sin árbol vivo, así que build() ni siquiera construye una candidata (más conservador que antes de esta ola)", () => {
    const finding = fakeLongParameterListFinding();
    const repoFn = fakeRepoFunction({}, { isConstructor: true });
    const ctx = fakeContext({ repo: fakeRepo([repoFn]), file: null });
    expect(build(finding, null, ctx)).toBeNull();
  });
});

/* ── Ola 10/11 — excluder ESTRUCTURAL nuevo (grafo): las tres formas ──────
 * `Pizza` es el Producto (T): una clase con un constructor de 8 parámetros
 * (el propio `Finding` ancla). `PizzaBuilder` (archivo DISTINTO) es el
 * candidato a Builder (B): 3 setters de un parámetro + `build()` que
 * instancia `Pizza`. */
describe("hypotheses/builder — excluder ESTRUCTURAL (grafo): COMPLETA/PARCIAL/aplicado-eludido", () => {
  const pizzaFile = "pizza.ts";
  const builderFile = "pizza-builder.ts";
  const pizzaClass = graphSym(pizzaFile, ["Pizza"]);
  const pizzaCtor = graphMethod(pizzaFile, "Pizza", "constructor", 8, { startLine: 1, endLine: 10 });
  const builderClass = graphSym(builderFile, ["PizzaBuilder"]);
  const setSize = graphMethod(builderFile, "PizzaBuilder", "setSize", 1);
  const addTopping = graphMethod(builderFile, "PizzaBuilder", "addTopping", 1);
  const setCrust = graphMethod(builderFile, "PizzaBuilder", "setCrust", 1);
  const buildMember = graphMethod(builderFile, "PizzaBuilder", "build", 0);

  function pizzaFinding() {
    return fakeLongParameterListFinding({
      locations: [{ file: pizzaFile, startLine: 1, endLine: 10, symbol: "constructor", role: "función con exceso de parámetros" }],
    });
  }

  // Ola 12 — `ensambla-con-logica` (required) necesita `ctx.file`: el mismo
  // dato SIEMPRE vivo en producción para este ancla (ver el docstring del
  // módulo). El excluder de grafo de este describe es ORTOGONAL a ese
  // required — lo que importa acá es la FORMA ESTRUCTURAL (grafo), así que
  // el `constructor` del árbol vivo usa el nodo default (ensamblaje
  // genuino) para no interferir con lo que cada test realmente ejercita.
  function pizzaCtx() {
    const file = fakeFileUnit([fakeFunctionUnit({ file: pizzaFile, name: "constructor", startLine: 1, endLine: 10 }, { isConstructor: true, className: "Pizza" })]);
    return fakeContext({ repo: fakeRepo([]), file });
  }

  function baseNodesAndEdges() {
    return {
      nodes: [pizzaClass, pizzaCtor, builderClass, setSize, addTopping, setCrust, buildMember],
      edges: [
        ...graphContainsAll(pizzaClass.id, [pizzaCtor.id]),
        ...graphContainsAll(builderClass.id, [setSize.id, addTopping.id, setCrust.id, buildMember.id]),
        graphEdge(buildMember.id, pizzaClass.id, "instantiates"),
      ],
    };
  }

  it("COMPLETA + protegida (fan-in de T confinado al archivo de B) ⇒ ya-aplicado, confidence null, NUNCA una sugerencia", () => {
    const { nodes, edges } = baseNodesAndEdges();
    const graph = makeGraph(nodes, edges);
    const ctx = pizzaCtx();

    const h = build(pizzaFinding(), graph, ctx)!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull();
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.passed).toBe(true);
    expect(applied.label).toMatch(/forma estructural del grafo/);
    expect(applied.why).toMatch(/miembro "build" que instancia "Pizza"/);
  });

  it("COMPLETA + constructor privado de T (en vez de confinamiento por archivo) ⇒ también ya-aplicado", () => {
    const { nodes, edges } = baseNodesAndEdges();
    const privateCtorNodes = nodes.map((n) => (n.id === pizzaCtor.id ? { ...n, visibility: "private" as const } : n));
    // Además, un cliente en OTRO archivo instancia Pizza directamente — sin el
    // constructor privado, esto solo sería "aplicado-eludido" (ver el test de
    // abajo); con el constructor privado, la protección real ya existe.
    const outsider = graphMethod("client.ts", "Client", "makeOne", 0);
    const graph = makeGraph(
      [...privateCtorNodes, outsider],
      [...edges, graphEdge(outsider.id, pizzaClass.id, "instantiates")],
    );
    const ctx = pizzaCtx();

    const h = build(pizzaFinding(), graph, ctx)!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull();
  });

  it("COMPLETA pero PUENTEADA (un archivo fuera de B también instancia T directamente) ⇒ aplicado-eludido, no parcial", () => {
    const { nodes, edges } = baseNodesAndEdges();
    const hacker = graphMethod("hacker.ts", "Hacker", "make", 0);
    const graph = makeGraph([...nodes, hacker], [...edges, graphEdge(hacker.id, pizzaClass.id, "instantiates")]);
    const ctx = pizzaCtx();

    const h = build(pizzaFinding(), graph, ctx)!;
    expect(h.state).toBe("aplicado-eludido");
    expect(h.confidence).toBeNull();
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.why).toMatch(/hacker\.ts/);
  });

  it("PARCIAL: ≥2 fábricas SEPARADAS instancian T con aridades distintas, sin ningún Builder que las unifique ⇒ sugiere Builder", () => {
    const factoryOwner = graphSym("factories.ts", ["PizzaFactory"]);
    const createSmall = graphMethod("factories.ts", "PizzaFactory", "createSmall", 2);
    const createLarge = graphMethod("factories.ts", "PizzaFactory", "createLarge", 5);
    const graph = makeGraph(
      [pizzaClass, pizzaCtor, factoryOwner, createSmall, createLarge],
      [
        ...graphContainsAll(pizzaClass.id, [pizzaCtor.id]),
        ...graphContainsAll(factoryOwner.id, [createSmall.id, createLarge.id]),
        graphEdge(createSmall.id, pizzaClass.id, "instantiates"),
        graphEdge(createLarge.id, pizzaClass.id, "instantiates"),
      ],
    );
    const ctx = pizzaCtx();

    const h = build(pizzaFinding(), graph, ctx)!;
    expect(h.state).toBe("parcial");
    expect(h.confidence).not.toBeNull();
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.why).toMatch(/telescópicos/);
  });

  it("sin Builder completo y sin fábricas telescópicas ⇒ ausente, con evidencia explícita (nunca silencio)", () => {
    const graph = makeGraph([pizzaClass, pizzaCtor], [...graphContainsAll(pizzaClass.id, [pizzaCtor.id])]);
    const ctx = pizzaCtx();

    const h = build(pizzaFinding(), graph, ctx)!;
    expect(h.state).toBe("ausente");
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.why).toMatch(/ningún Builder/);
  });

  it("no se puede identificar T estructuralmente (fábrica sin `instantiates` visible en el grafo) ⇒ 'sin-T' declarado, no adivinado", () => {
    const finding = fakeLongParameterListFinding({
      locations: [{ file: "loose.ts", startLine: 1, endLine: 10, symbol: "createWidget", role: "función con exceso de parámetros" }],
    });
    // Símbolo suelto (sin `contains` que lo ubique bajo una clase) y SIN
    // ninguna arista `instantiates` saliente: ninguna de las dos vías de
    // `resolveTargetType` resuelve.
    const loose = graphMethod("loose.ts", "(módulo)", "createWidget", 8, { startLine: 1, endLine: 10 });
    const graph = makeGraph([loose], []);
    const looseFile = fakeFileUnit([fakeFunctionUnit({ file: "loose.ts", name: "createWidget", startLine: 1, endLine: 10 }, { isFactoryLike: true })], { path: "loose.ts" });
    const ctx = fakeContext({ repo: fakeRepo([]), file: looseFile });

    const h = build(finding, graph, ctx)!;
    expect(h.state).toBe("ausente");
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.why).toMatch(/no se pudo identificar estructuralmente/);
  });

  it("con grafo presente pero SIN forma estructural, el excluder VIEJO (fluido, texto) sigue siendo la única vía real de ya-aplicado — no se rompe lo medido en producción (click)", () => {
    const graph = makeGraph([pizzaClass, pizzaCtor], [...graphContainsAll(pizzaClass.id, [pizzaCtor.id])]);
    const repoFn = fakeRepoFunction({ file: pizzaFile }, { isConstructor: true, className: "Pizza" });
    const anchorFn = fakeFunctionUnit({ file: pizzaFile, name: "constructor", startLine: 1, endLine: 10 }, { isConstructor: true, className: "Pizza" });
    const siblingThatReturnsSelf = fakeFunctionUnit(
      { file: pizzaFile, name: "withColor", startLine: 20, endLine: 22, node: fakeAstNode("function withColor(c) {\n  this.color = c;\n  return this;\n}") },
      { className: "Pizza" },
    );
    const file = fakeFileUnit([anchorFn, siblingThatReturnsSelf], { path: pizzaFile });
    const ctx = fakeContext({ repo: fakeRepo([repoFn]), file });

    const h = build(pizzaFinding(), graph, ctx)!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull();
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.passed).toBe(true);
    expect(applied.label).toMatch(/heredado/);
  });
});

function finding8Threshold() {
  return fakeLongParameterListFinding().trigger[0]!.threshold;
}

describe("hypotheses/builder — Ola 11: refresh() (registro de pendientes §B1, 1 de 17 → N)", () => {
  it("build() SIN vecindario real deja 'no-es-convencion-del-repo' conservador (false, ausencia de evidencia); refresh() con countOfKind real bajo el piso lo confirma y sube la escalera", () => {
    const finding = fakeLongParameterListFinding({ trigger: [{ label: "parámetros", value: 7, threshold: finding8Threshold() }] });
    const repoFn = fakeRepoFunction({ name: "createWidget" }, { isConstructor: false, isFactoryLike: true });
    const file = fakeFileUnit([fakeFunctionUnit({ name: "createWidget" }, { isConstructor: false, isFactoryLike: true })]);
    const ctx = fakeContext({ repo: fakeRepo([repoFn]), file });

    const built = build(finding, null, ctx)!;
    expect(built.state).toBe("ausente");
    expect(built.confidence).toBe("media"); // sólo magnitudFuerte confirmado — comportamiento IDÉNTICO al de antes de esta ola.
    const before = built.discriminators.find((d) => d.label.includes("convención extendida del repo"));
    expect(before).toBeDefined();
    expect(before!.passed).toBe(false);
    expect(before!.why).toMatch(/sin vecindario real/);

    const realNeighborhood: Neighborhood = { ...EMPTY_NEIGHBORHOOD, countOfKind: () => 2 };
    const refreshCtx = fakeContext({ repo: fakeRepo([repoFn]), neighborhood: realNeighborhood });
    const refreshed = hypothesis.refresh!(built, finding, null, refreshCtx)!;
    expect(refreshed).not.toBeNull();
    expect(refreshed.state).toBe("ausente"); // refresh() NUNCA toca `state` — mismo hallazgo, sólo más confianza.
    expect(refreshed.confidence).toBe("alta"); // 2 discriminadores confirmados ahora (magnitudFuerte + no-es-convencion-del-repo).
    const after = refreshed.discriminators.find((d) => d.label.includes("convención extendida del repo"));
    expect(after!.passed).toBe(true);
    expect(after!.why).toMatch(/2 hallazgo\(s\) más/);
  });

  it("countOfKind alto (convención extendida del repo) ⇒ el discriminador NO confirma ni en refresh() — nunca resta, sólo deja de sumar", () => {
    const finding = fakeLongParameterListFinding({ trigger: [{ label: "parámetros", value: 7, threshold: finding8Threshold() }] });
    const repoFn = fakeRepoFunction({ name: "createWidget" }, { isConstructor: false, isFactoryLike: true });
    const file = fakeFileUnit([fakeFunctionUnit({ name: "createWidget" }, { isConstructor: false, isFactoryLike: true })]);
    const built = build(finding, null, fakeContext({ repo: fakeRepo([repoFn]), file }))!;

    const wideNeighborhood: Neighborhood = { ...EMPTY_NEIGHBORHOOD, countOfKind: () => 40 };
    const refreshCtx = fakeContext({ repo: fakeRepo([repoFn]), neighborhood: wideNeighborhood });
    const refreshed = hypothesis.refresh!(built, finding, null, refreshCtx)!;
    expect(refreshed.confidence).toBe("media"); // sin cambios: 40 > techo de convención, no suma.
    const after = refreshed.discriminators.find((d) => d.label.includes("convención extendida del repo"));
    expect(after!.passed).toBe(false);
    expect(after!.why).toMatch(/convención del propio repo/);
  });

  it("build() con graph=null (el límite de cableado real de este ancla) dictamina 'ausente'; refresh() con el MISMO grafo real (fábricas telescópicas) confirma 'grafo-confirma-forma-estructural' como discriminador SIN promover `state` a 'parcial' — límite de contrato de refresh()", () => {
    const pizzaFile = "pizza.ts";
    const pizzaClass = graphSym(pizzaFile, ["Pizza"]);
    const pizzaCtor = graphMethod(pizzaFile, "Pizza", "constructor", 8, { startLine: 1, endLine: 10 });
    const factoryOwner = graphSym("factories.ts", ["PizzaFactory"]);
    const createSmall = graphMethod("factories.ts", "PizzaFactory", "createSmall", 2);
    const createLarge = graphMethod("factories.ts", "PizzaFactory", "createLarge", 5);
    const graph = makeGraph(
      [pizzaClass, pizzaCtor, factoryOwner, createSmall, createLarge],
      [
        ...graphContainsAll(pizzaClass.id, [pizzaCtor.id]),
        ...graphContainsAll(factoryOwner.id, [createSmall.id, createLarge.id]),
        graphEdge(createSmall.id, pizzaClass.id, "instantiates"),
        graphEdge(createLarge.id, pizzaClass.id, "instantiates"),
      ],
    );
    const finding = fakeLongParameterListFinding({
      locations: [{ file: pizzaFile, startLine: 1, endLine: 10, symbol: "constructor", role: "función con exceso de parámetros" }],
    });
    const file = fakeFileUnit([fakeFunctionUnit({ file: pizzaFile, name: "constructor", startLine: 1, endLine: 10 }, { isConstructor: true, className: "Pizza" })]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });

    // build() en producción SIEMPRE ve graph=null para este ancla (docstring del módulo) — se simula pasando null, no el grafo real.
    const built = build(finding, null, ctx)!;
    expect(built.state).toBe("ausente");
    const graphCheckAtBuild = built.discriminators.find((d) => d.label.includes("confirma alguna de las formas estructurales de Builder"));
    expect(graphCheckAtBuild!.passed).toBe(false);
    expect(graphCheckAtBuild!.why).toMatch(/sin grafo real/);

    // refresh() (Ola 10, crossAnalyze) SÍ recibe el grafo real.
    const refreshed = hypothesis.refresh!(built, finding, graph, ctx)!;
    expect(refreshed).not.toBeNull();
    expect(refreshed.state).toBe("ausente"); // NUNCA se promueve a 'parcial' vía refresh() — prohibido por contrato (hypotheses/types.ts).
    const graphCheckAfterRefresh = refreshed.discriminators.find((d) => d.label.includes("confirma alguna de las formas estructurales de Builder"));
    expect(graphCheckAfterRefresh!.passed).toBe(true);
    expect(graphCheckAfterRefresh!.why).toMatch(/parcial/);
  });

  it("hipótesis ya 'ya-aplicado'/'aplicado-eludido' no compiten por confianza: refresh() no las toca (devuelve null)", () => {
    const pizzaFile = "pizza.ts";
    const pizzaClass = graphSym(pizzaFile, ["Pizza"]);
    const pizzaCtor = graphMethod(pizzaFile, "Pizza", "constructor", 8, { startLine: 1, endLine: 10 });
    const builderFile = "pizza-builder.ts";
    const builderClass = graphSym(builderFile, ["PizzaBuilder"]);
    const setSize = graphMethod(builderFile, "PizzaBuilder", "setSize", 1);
    const addTopping = graphMethod(builderFile, "PizzaBuilder", "addTopping", 1);
    const setCrust = graphMethod(builderFile, "PizzaBuilder", "setCrust", 1);
    const buildMember = graphMethod(builderFile, "PizzaBuilder", "build", 0);
    const graph = makeGraph(
      [pizzaClass, pizzaCtor, builderClass, setSize, addTopping, setCrust, buildMember],
      [...graphContainsAll(pizzaClass.id, [pizzaCtor.id]), ...graphContainsAll(builderClass.id, [setSize.id, addTopping.id, setCrust.id, buildMember.id]), graphEdge(buildMember.id, pizzaClass.id, "instantiates")],
    );
    const finding = fakeLongParameterListFinding({
      locations: [{ file: pizzaFile, startLine: 1, endLine: 10, symbol: "constructor", role: "función con exceso de parámetros" }],
    });
    const file = fakeFileUnit([fakeFunctionUnit({ file: pizzaFile, name: "constructor", startLine: 1, endLine: 10 }, { isConstructor: true, className: "Pizza" })]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });
    const built = build(finding, graph, ctx)!;
    expect(built.state).toBe("ya-aplicado");

    expect(hypothesis.refresh!(built, finding, graph, ctx)).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * OLA 13 — LA RAMA NEGATIVA: `buildAlternative` (Parameter Object).
 * Ver el docstring del módulo, sección "OLA 13", y `hypotheses/types.ts#
 * PatternAlternative` para el razonamiento completo.
 * ═══════════════════════════════════════════════════════════════════════ */
describe("hypotheses/builder — registro (buildAlternative)", () => {
  it("la función existe y es correcta (probada abajo), pero el builder REGISTRADO no la expone — condición de fracaso medida (43% de precisión, ver el docstring del módulo sección 'OLA 13 — EL RESULTADO MEDIDO'): la rama negativa vuelve a ser silencio, a propósito", () => {
    expect(typeof buildAlternative).toBe("function");
    expect(hypothesis.buildAlternative).toBeUndefined();
  });
});

describe("hypotheses/builder — buildAlternative: su propio required, tan exigente como el de Builder", () => {
  it("ancla no reconocida ⇒ null (MISMO primer required que Builder)", () => {
    const finding = fakeLongParameterListFinding({ kind: "large-class" });
    const repoFn = fakeRepoFunction({}, { isConstructor: true });
    const ctx = fakeContext({ repo: fakeRepo([repoFn]) });
    expect(buildAlternative(finding, null, ctx)).toBeNull();
  });

  it("el lugar señalado NO tiene forma de construir una entidad (nombre sin forma, repo.functions vacío) ⇒ null — 'cualquier lista larga' NO se convierte en Parameter Object por la puerta de atrás", () => {
    const finding = fakeLongParameterListFinding({
      locations: [{ file: "a.js", startLine: 1, endLine: 10, symbol: "sumAllTheThings", role: "función con exceso de parámetros" }],
    });
    const ctx = fakeContext({ repo: fakeRepo([]) });
    expect(buildAlternative(finding, null, ctx)).toBeNull();
  });

  it("el cuerpo SÍ ensambla con lógica (condicional propio) ⇒ null: la alternativa NO compite con Builder sobre el MISMO candidato", () => {
    const finding = fakeLongParameterListFinding();
    const conditional = fakeFunctionUnit(
      { node: fnNode("build", ["a", "b", "c", "d", "e", "f", "g", "h"], conditionalBodySpec()), sets: assemblySets() },
      { isConstructor: true },
    );
    const file = fakeFileUnit([conditional]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });

    expect(build(finding, null, ctx)).not.toBeNull(); // Builder SÍ dispara acá...
    expect(buildAlternative(finding, null, ctx)).toBeNull(); // ...y la alternativa, mutuamente exclusiva, no.
  });

  it("LÍMITE: sin ctx.file (nunca pasa en producción para este ancla) ⇒ null — ausencia de evidencia no confirma 'sólo asigna' tampoco, misma polaridad que ensambla-con-logica", () => {
    const finding = fakeLongParameterListFinding();
    const repoFn = fakeRepoFunction({}, { isConstructor: true });
    const ctx = fakeContext({ repo: fakeRepo([repoFn]), file: null });
    expect(build(finding, null, ctx)).toBeNull();
    expect(buildAlternative(finding, null, ctx)).toBeNull();
  });

  it("cuerpo que SÓLO asigna sus propios parámetros a campos ⇒ Builder null, alternativa NO null — el caso piloto exacto de RAICES.md", () => {
    const finding = fakeLongParameterListFinding();
    const onlyAssigns = fakeFunctionUnit(
      { node: fnNode("build", ["a", "b", "c", "d", "e", "f", "g", "h"], assignOnlyBodySpec(["a", "b", "c", "d", "e", "f", "g", "h"])), sets: assemblySets() },
      { isConstructor: true },
    );
    const file = fakeFileUnit([onlyAssigns]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });

    expect(build(finding, null, ctx)).toBeNull();
    const alt = buildAlternative(finding, null, ctx);
    expect(alt).not.toBeNull();
    expect(alt!.discardedPattern).toBe("Builder");
    expect(alt!.remedy).toBe("Parameter Object");
    expect(alt!.anchorFindingId).toBe(finding.id);
    expect(alt!.checks).toHaveLength(3);
    expect(alt!.checks.every((c) => c.role === "required")).toBe(true);
    expect(alt!.checks.every((c) => typeof c.why === "string" && c.why.length > 0)).toBe(true);
    expect(alt!.why.length).toBeGreaterThan(0);
    expect(alt!.source.length).toBeGreaterThan(0);
    expect(alt!.places.every((p) => p.role.includes("candidato a Parameter Object"))).toBe(true);
    expect(alt!.toConfirm.length).toBeGreaterThan(0);
  });

  it("una única llamada de reenvío (forwarding, sin transformar) ⇒ Builder null, alternativa NO null — el caso medido `create_booking` de RAICES.md", () => {
    const finding = fakeLongParameterListFinding();
    const forwards = fakeFunctionUnit(
      { node: fnNode("build", ["a", "b", "c", "d", "e", "f", "g", "h"], forwardingBodySpec("Delegate.create")), sets: assemblySets() },
      { isConstructor: false, isFactoryLike: true },
    );
    const file = fakeFileUnit([forwards]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });

    expect(build(finding, null, ctx)).toBeNull();
    expect(buildAlternative(finding, null, ctx)).not.toBeNull();
  });
});

describe("hypotheses/builder — buildAlternative: separación criterio/texto — `suggestion` varía por lenguaje, `why`/`checks` nunca nombran un lenguaje", () => {
  function onlyAssignsCtx(language: string) {
    const finding = fakeLongParameterListFinding({ language });
    const onlyAssigns = fakeFunctionUnit(
      { node: fnNode("build", ["a", "b", "c", "d", "e", "f", "g", "h"], assignOnlyBodySpec(["a", "b", "c", "d", "e", "f", "g", "h"])), sets: assemblySets() },
      { isConstructor: true },
    );
    const file = fakeFileUnit([onlyAssigns]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });
    return buildAlternative(finding, null, ctx)!;
  }

  it("ruby ⇒ menciona kwargs/hash de opciones o Data.define", () => {
    expect(onlyAssignsCtx("ruby").suggestion).toMatch(/opts|Data\.define/);
  });

  it("java ⇒ menciona record", () => {
    expect(onlyAssignsCtx("java").suggestion).toMatch(/record/);
  });

  it("csharp ⇒ menciona record", () => {
    expect(onlyAssignsCtx("csharp").suggestion).toMatch(/record/);
  });

  it("python ⇒ menciona kwargs/dataclass", () => {
    expect(onlyAssignsCtx("python").suggestion).toMatch(/kwargs|dataclass/);
  });

  it("go ⇒ menciona struct", () => {
    expect(onlyAssignsCtx("go").suggestion).toMatch(/struct/);
  });

  it("lenguaje desconocido ⇒ texto genérico, nunca vacío", () => {
    expect(onlyAssignsCtx("elixir").suggestion.length).toBeGreaterThan(0);
  });

  it("el criterio (`why`/`checks[].why`) es EL MISMO texto sin importar el lenguaje — sólo `suggestion` varía; la separación vive en funciones distintas, no en un `if` compartido", () => {
    const ruby = onlyAssignsCtx("ruby");
    const java = onlyAssignsCtx("java");
    expect(ruby.why).toBe(java.why);
    expect(ruby.checks.map((c) => c.why)).toEqual(java.checks.map((c) => c.why));
    expect(ruby.suggestion).not.toBe(java.suggestion); // el remedio SÍ depende del lenguaje — eso es lo que separa.
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * OLA AE, FRENTE AE4 — EL CAMINO DE ENTRADA DEL ANCLA-FUERZA
 * (`optional-construction-combinations`). Todo lo de acá abajo ejercita
 * código NUEVO; el camino viejo tiene sus propios tests, arriba, intactos.
 * ═══════════════════════════════════════════════════════════════════════ */

const OCC_TYPE_FILE = "model/widget.py";
const OCC_TYPE_PATH = ["Widget"] as const;
const OCC_TYPE_ID = symbolNodeId(OCC_TYPE_FILE, OCC_TYPE_PATH);
const OCC_CTOR_PATH = ["Widget", "__init__"] as const;
const OCC_CTOR_ID = symbolNodeId(OCC_TYPE_FILE, OCC_CTOR_PATH);

/** El `Finding` que emite el ancla nueva, con su puerta y sus sitios. */
function fakeOptionalCombinationsFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f-occ",
    detectorId: "optional-construction-combinations",
    kind: "optional-construction-combinations",
    scope: "inter-file",
    language: "python",
    title: "Widget se construye de 3 formas distintas en 3 sitios",
    detail: "d",
    trigger: [
      { label: "combinaciones distintas de argumentos observadas", value: 3, threshold: fakeThreshold(3) },
      { label: "ranuras opcionales (rango de argumentos)", value: 4, threshold: fakeThreshold(3) },
      { label: "sitios que construyen por esta puerta", value: 3, threshold: fakeThreshold(3) },
    ],
    locations: [
      { file: OCC_TYPE_FILE, startLine: 1, endLine: 40, symbol: "Widget", role: "puerta de construcción: se la invoca con 3 cantidades distintas de argumentos (1, 2, 5)" },
      { file: "app/uno.py", startLine: 1, endLine: 5, symbol: "crea_uno", role: "sitio que construye: elige por su cuenta qué pasos opcionales pasa" },
      { file: "app/dos.py", startLine: 1, endLine: 5, symbol: "crea_dos", role: "sitio que construye: elige por su cuenta qué pasos opcionales pasa" },
      { file: "app/tres.py", startLine: 1, endLine: 5, symbol: "crea_tres", role: "sitio que construye: elige por su cuenta qué pasos opcionales pasa" },
    ],
    severity: 50,
    advice: { primary: { name: "Introduce Parameter Object", kind: "refactorizacion", why: "w", source: "s" } },
    ...overrides,
  };
}

/**
 * El grafo mínimo que el camino nuevo necesita: el tipo `class-like` (la puerta
 * que reciben los `calls` en Python/Ruby/Go/JS), su miembro constructor (cuyo
 * CUERPO mira `ensambla-en-la-puerta`) y N sitios que lo construyen.
 */
function occGraph(
  sites: readonly (readonly [string, string, readonly number[]])[],
  extraNodes: readonly CodeGraphNode[] = [],
  extraEdges: readonly CodeGraphEdge[] = [],
  opts: { readonly withCtor?: boolean } = {},
) {
  const type = graphSym(OCC_TYPE_FILE, OCC_TYPE_PATH, { family: "class-like", startLine: 1, endLine: 40 });
  const nodes: CodeGraphNode[] = [type, ...extraNodes];
  const edges: CodeGraphEdge[] = [...extraEdges];
  if (opts.withCtor !== false) {
    nodes.push(graphSym(OCC_TYPE_FILE, OCC_CTOR_PATH, { family: "function-like", startLine: 2, endLine: 20, arity: 8 }));
    edges.push(graphEdge(OCC_TYPE_ID, OCC_CTOR_ID, "contains"));
  }
  for (const [file, name, arities] of sites) {
    const id = symbolNodeId(file, [name]);
    nodes.push(graphSym(file, [name], { family: "function-like", startLine: 1, endLine: 5 }));
    edges.push(graphEdge(id, OCC_TYPE_ID, "calls", { callArities: [...arities] }));
  }
  return makeGraph(nodes, edges);
}

/** El cuerpo del constructor, vivo, tal como lo entrega `ctx.fileAt` en producción. */
function occCtx(bodySpec: Parameters<typeof buildNode>[0] = conditionalBodySpec()) {
  const ctor = fakeFunctionUnit(
    {
      file: OCC_TYPE_FILE,
      language: "python",
      name: "__init__",
      startLine: 2,
      endLine: 20,
      symbolPath: ["Widget", "__init__"],
      node: fnNode("__init__", ["a", "b", "c", "d", "e", "f", "g", "h"], bodySpec),
      sets: assemblySets(),
    },
    { isConstructor: true },
  );
  const file = fakeFileUnit([ctor], { path: OCC_TYPE_FILE, language: "python" });
  return fakeContext({ fileAt: (path: string) => (path === OCC_TYPE_FILE ? file : null) });
}

const OCC_SITES = [
  ["app/uno.py", "crea_uno", [1]],
  ["app/dos.py", "crea_dos", [2]],
  ["app/tres.py", "crea_tres", [5]],
] as const;

describe("hypotheses/builder — OLA AE (AE4): el camino del ancla-fuerza", () => {
  it("con el grafo real, las tres condiciones y ensamblaje real en la puerta ⇒ candidata `ausente` (el estado que el entregable pide)", () => {
    const h = build(fakeOptionalCombinationsFinding(), occGraph(OCC_SITES), occCtx());
    expect(h).not.toBeNull();
    expect(h!.pattern).toBe("Builder");
    expect(h!.state).toBe("ausente");
  });

  it("los `required` re-derivan del grafo: SIN grafo NO hay candidata (nunca 'no pude mirar, apruebo')", () => {
    expect(build(fakeOptionalCombinationsFinding(), null, occCtx())).toBeNull();
  });

  it("el `required` de ESCALA no le cree al detector: con el trigger diciendo 3 pero el grafo mostrando 2 sitios, NO hay candidata", () => {
    const graph = occGraph([
      ["app/uno.py", "crea_uno", [1]],
      ["app/dos.py", "crea_dos", [5]],
    ]);
    expect(build(fakeOptionalCombinationsFinding(), graph, occCtx())).toBeNull();
  });

  it("el `required` de OPCIONALIDAD no le cree al detector: con el grafo mostrando rango 2, NO hay candidata", () => {
    const graph = occGraph([
      ["app/uno.py", "crea_uno", [1]],
      ["app/dos.py", "crea_dos", [2]],
      ["app/tres.py", "crea_tres", [3]],
    ]);
    expect(build(fakeOptionalCombinationsFinding(), graph, occCtx())).toBeNull();
  });

  it("`puerta-de-construcción`: si el lugar señalado no es un tipo ni un miembro constructor, NO hay candidata", () => {
    const graph = makeGraph(
      [
        graphSym(OCC_TYPE_FILE, OCC_TYPE_PATH, { family: "function-like", startLine: 1, endLine: 40 }),
        ...OCC_SITES.map(([f, n]) => graphSym(f, [n], { family: "function-like", startLine: 1, endLine: 5 })),
      ],
      OCC_SITES.map(([f, n, a]) => graphEdge(symbolNodeId(f, [n]), OCC_TYPE_ID, "calls", { callArities: [...a] })),
    );
    expect(build(fakeOptionalCombinationsFinding(), graph, occCtx())).toBeNull();
  });

  it("las aristas AMBIGUAS no cuentan tampoco en la hipótesis: mismo criterio que el detector", () => {
    const graph = makeGraph(
      [
        graphSym(OCC_TYPE_FILE, OCC_TYPE_PATH, { family: "class-like", startLine: 1, endLine: 40 }),
        graphSym(OCC_TYPE_FILE, OCC_CTOR_PATH, { family: "function-like", startLine: 2, endLine: 20, arity: 8 }),
        ...OCC_SITES.map(([f, n]) => graphSym(f, [n], { family: "function-like", startLine: 1, endLine: 5 })),
      ],
      [
        graphEdge(OCC_TYPE_ID, OCC_CTOR_ID, "contains"),
        ...OCC_SITES.map(([f, n, a]) => graphEdge(symbolNodeId(f, [n]), OCC_TYPE_ID, "calls", { callArities: [...a], provenance: "ambiguous" })),
      ],
    );
    expect(build(fakeOptionalCombinationsFinding(), graph, occCtx())).toBeNull();
  });

  // ── `ensambla-en-la-puerta`: LA OTRA MITAD DE LA FUERZA ──────────────────
  // Los dos casos que motivaron este `required` son reales y están medidos:
  // `netbox#ViewTab` (seis asignaciones y nada más) y `netbox#FieldSet`
  // (`*items` variádico). Los dos tienen la opcionalidad perfectamente medida
  // en los sitios y ninguno de los dos es Builder — es la decisión que este
  // mismo archivo tomó en la Ola 12 con siete casos juzgados a mano.
  it("un constructor que SÓLO asigna sus parámetros a campos ⇒ null, aunque la combinatoria esté perfectamente medida (el caso `ViewTab` de netbox)", () => {
    const ctx = occCtx(assignOnlyBodySpec(["a", "b", "c", "d", "e", "f", "g", "h"]));
    expect(build(fakeOptionalCombinationsFinding(), occGraph(OCC_SITES), ctx)).toBeNull();
  });

  it("un constructor que REENVÍA sus parámetros sin tocarlos ⇒ null", () => {
    const ctx = occCtx(forwardingBodySpec("Delegate.create"));
    expect(build(fakeOptionalCombinationsFinding(), occGraph(OCC_SITES), ctx)).toBeNull();
  });

  it("un constructor que arma ≥2 sub-objetos propios ⇒ sí hay candidata", () => {
    const ctx = occCtx(subObjectAssemblyBodySpec());
    expect(build(fakeOptionalCombinationsFinding(), occGraph(OCC_SITES), ctx)).not.toBeNull();
  });

  it("sin miembro constructor en el grafo ⇒ null: sin cuerpo que inspeccionar no se aprueba por ausencia de evidencia", () => {
    expect(build(fakeOptionalCombinationsFinding(), occGraph(OCC_SITES, [], [], { withCtor: false }), occCtx())).toBeNull();
  });

  it("sin árbol vivo del archivo de la puerta ⇒ null (mismo criterio conservador)", () => {
    expect(build(fakeOptionalCombinationsFinding(), occGraph(OCC_SITES), fakeContext())).toBeNull();
  });

  it("ESCALERA DE ESTADO — con fábricas telescópicas separadas alrededor del tipo ⇒ `parcial` (media puerta)", () => {
    const f1 = graphMethod("model/fabricas.py", "Fabricas", "chico", 2);
    const f2 = graphMethod("model/fabricas.py", "Fabricas", "grande", 6);
    const graph = occGraph(OCC_SITES, [f1, f2], [graphEdge(f1.id, OCC_TYPE_ID, "instantiates"), graphEdge(f2.id, OCC_TYPE_ID, "instantiates")]);
    expect(build(fakeOptionalCombinationsFinding(), graph, occCtx())!.state).toBe("parcial");
  });

  it("ESCALERA DE ESTADO — con un Builder COMPLETO y nadie que lo puentee ⇒ `ya-aplicado` (alcanzable, aunque el detector se calle antes)", () => {
    const builderId = symbolNodeId("model/wb.py", ["WidgetBuilder"]);
    const builder = graphSym("model/wb.py", ["WidgetBuilder"], { family: "class-like" });
    const setters = ["con_alto", "con_ancho", "con_color"].map((n) => graphMethod("model/wb.py", "WidgetBuilder", n, 1));
    const build0 = graphMethod("model/wb.py", "WidgetBuilder", "build", 0);
    const graph = occGraph(
      OCC_SITES,
      [builder, ...setters, build0],
      [...graphContainsAll(builderId, [...setters.map((s) => s.id), build0.id]), graphEdge(build0.id, OCC_TYPE_ID, "instantiates")],
    );
    expect(build(fakeOptionalCombinationsFinding(), graph, occCtx())!.state).toBe("ya-aplicado");
  });

  it("ESCALERA DE ESTADO — Builder COMPLETO puenteado desde otro archivo ⇒ `aplicado-eludido`", () => {
    const builderId = symbolNodeId("model/wb.py", ["WidgetBuilder"]);
    const builder = graphSym("model/wb.py", ["WidgetBuilder"], { family: "class-like" });
    const setters = ["con_alto", "con_ancho", "con_color"].map((n) => graphMethod("model/wb.py", "WidgetBuilder", n, 1));
    const build0 = graphMethod("model/wb.py", "WidgetBuilder", "build", 0);
    const bypass = graphSym("app/atajo.py", ["atajo"], { family: "function-like" });
    const graph = occGraph(
      OCC_SITES,
      [builder, ...setters, build0, bypass],
      [
        ...graphContainsAll(builderId, [...setters.map((s) => s.id), build0.id]),
        graphEdge(build0.id, OCC_TYPE_ID, "instantiates"),
        graphEdge(bypass.id, OCC_TYPE_ID, "instantiates"),
      ],
    );
    expect(build(fakeOptionalCombinationsFinding(), graph, occCtx())!.state).toBe("aplicado-eludido");
  });

  it("EL CAMINO VIEJO SIGUE INTACTO: un `long-parameter-list` con el MISMO contexto se sigue construyendo igual que antes", () => {
    const finding = fakeLongParameterListFinding();
    const file = fakeFileUnit([fakeFunctionUnit()]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });
    expect(build(finding, null, ctx)).not.toBeNull();
    // y el ancla nueva NO lo toca: su camino entero cuelga de `kind`.
    expect(build(finding, occGraph(OCC_SITES), ctx)).not.toBeNull();
  });

  it("`refresh()` usa el spec del ancla nueva y sólo mueve discriminadores, nunca el estado", () => {
    const graph = occGraph(OCC_SITES);
    const finding = fakeOptionalCombinationsFinding();
    const ctx = occCtx();
    const existing = build(finding, graph, ctx)!;
    const refreshed = refresh(existing, finding, graph, ctx);
    expect(refreshed?.state ?? existing.state).toBe("ausente");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * OLA AN, FRENTE AN4 — EL ANCLA DE NIVEL 2 ("la refactorización como canal
 * de detección"). Los tests de arriba NO se tocan: cada uno de éstos ejerce
 * el camino nuevo, y hay uno explícito de que el camino viejo sigue igual.
 * ═══════════════════════════════════════════════════════════════════════ */

/** Un `long-function` sobre una fábrica con nombre — el ancla de `Extract Method`, que es de donde este camino cuelga. */
function fakeLongFunctionFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f-lf",
    detectorId: "long-function",
    kind: "long-function",
    scope: "intra-function",
    language: "javascript",
    title: "build tiene 80 líneas",
    detail: "d",
    trigger: [{ label: "líneas", value: 80, threshold: fakeThreshold(40) }],
    locations: [{ file: "a.js", startLine: 1, endLine: 10, symbol: "build", role: "función larga" }],
    severity: 60,
    advice: { primary: { name: "Extract Method", kind: "refactorizacion", why: "w", source: "s" } },
    ...overrides,
  };
}

/** Un vecino que comparte ANCLA con el problema y trae una propuesta VIVA de refactorización. */
function vecinoConPropuesta(pattern: string, state: "ausente" | "parcial" = "ausente", kind = "complexity"): Finding {
  return {
    id: `f-vecino-${pattern}-${kind}`,
    detectorId: kind,
    kind,
    scope: "intra-function",
    language: "javascript",
    title: "t",
    detail: "d",
    trigger: [{ label: "líneas", value: 60, threshold: fakeThreshold(40) }],
    locations: [{ file: "a.js", startLine: 1, endLine: 10, symbol: "build", role: "r" }],
    severity: 50,
    advice: { primary: { name: "Extract Method", kind: "refactorizacion", why: "w", source: "s" } },
    hypotheses: [{ pattern, state, confidence: "media", checks: [], discriminators: [], places: [], cost: "c", toConfirm: [], source: { name: "s", url: "u" } }] as unknown as Finding["hypotheses"],
  };
}

function vecindarioCon(vecinos: readonly Finding[]): Neighborhood {
  return { ...EMPTY_NEIGHBORHOOD, findingsAtSymbol: () => vecinos };
}

describe("hypotheses/builder — OLA AN (AN4): el ancla de NIVEL 2", () => {
  it("LA PREGUNTA DE MECANISMO: sin vecindario real Y sin propuesta propia, `la-refactorizacion-ve-pasos` NO se sostiene ⇒ el camino no emite (la pasada 1 no tiene el dato, y no aprueba por no poder mirar)", () => {
    const finding = fakeLongFunctionFinding();
    const file = fakeFileUnit([fakeFunctionUnit()]);
    const ctx = fakeContext({ repo: fakeRepo([]), file }); // neighborhood = EMPTY por default, igual que `analyzeFile`
    expect(build(finding, null, ctx)).toBeNull();
  });

  it("con la propuesta VIVA de la capa de refactorización SOBRE EL PROPIO HALLAZGO (lo que la pasada 2 ve en `problem.hypotheses`), puerta de construcción y ensamblaje real ⇒ emite", () => {
    const finding = fakeLongFunctionFinding({
      hypotheses: [{ pattern: "Extract Method", state: "ausente", confidence: "media", checks: [], discriminators: [], places: [], cost: "c", toConfirm: [], source: { name: "s", url: "u" } }] as unknown as Finding["hypotheses"],
    });
    const file = fakeFileUnit([fakeFunctionUnit()]); // cuerpo con condicional propio ⇒ ensamblaje
    const ctx = fakeContext({ repo: fakeRepo([]), file });
    const built = build(finding, null, ctx);
    expect(built).not.toBeNull();
    expect(built!.pattern).toBe("Builder");
    expect(built!.checks.some((c) => c.label.includes("REFACTORIZACIÓN"))).toBe(true);
  });

  it("con la propuesta VIVA sobre OTRO hallazgo que comparte su ANCLA (`findingsAtSymbol`, el canal del vecindario) ⇒ emite igual: el hecho se lee de las dos fuentes", () => {
    const finding = fakeLongFunctionFinding();
    const file = fakeFileUnit([fakeFunctionUnit()]);
    const ctx = fakeContext({ repo: fakeRepo([]), file, neighborhood: vecindarioCon([vecinoConPropuesta("Extract Method")]) });
    expect(build(finding, null, ctx)).not.toBeNull();
  });

  it("un vecino de nivel 2 SIN propuesta viva (sólo el `kind` crudo) NO alcanza: el ancla pide la DECISIÓN del nivel 2, no el síntoma de tamaño", () => {
    const crudo: Finding = { ...vecinoConPropuesta("Extract Method"), hypotheses: undefined };
    const finding = fakeLongFunctionFinding();
    const file = fakeFileUnit([fakeFunctionUnit()]);
    const ctx = fakeContext({ repo: fakeRepo([]), file, neighborhood: vecindarioCon([crudo]) });
    expect(build(finding, null, ctx)).toBeNull();
  });

  it("una propuesta viva que NO es de la capa de refactorización (otro patrón de nivel 3) no cuenta", () => {
    const finding = fakeLongFunctionFinding();
    const file = fakeFileUnit([fakeFunctionUnit()]);
    const ctx = fakeContext({ repo: fakeRepo([]), file, neighborhood: vecindarioCon([vecinoConPropuesta("Strategy")]) });
    expect(build(finding, null, ctx)).toBeNull();
  });

  it("DEDUPLICACIÓN: si sobre el MISMO SÍMBOLO ya hay un hallazgo de una de las tres anclas VIEJAS, el camino nuevo CALLA — no duplica la propuesta del camino viejo", () => {
    const finding = fakeLongFunctionFinding({
      hypotheses: [{ pattern: "Extract Method", state: "ausente", confidence: "media", checks: [], discriminators: [], places: [], cost: "c", toConfirm: [], source: { name: "s", url: "u" } }] as unknown as Finding["hypotheses"],
    });
    const file = fakeFileUnit([fakeFunctionUnit()]);
    const ctx = fakeContext({ repo: fakeRepo([]), file, neighborhood: vecindarioCon([fakeLongParameterListFinding()]) });
    expect(build(finding, null, ctx)).toBeNull();
  });

  it("DEDUPLICACIÓN CONTRA SÍ MISMO: si otro hallazgo de nivel 2 con `id` MENOR toca el mismo símbolo, este calla — una sola propuesta por símbolo (medido: 113 emisiones sobre 71 símbolos en `eslint`, 42 duplicadas)", () => {
    const hermanoMenor: Finding = { ...vecinoConPropuesta("Extract Method", "ausente", "complexity"), id: "a-menor" };
    const finding = fakeLongFunctionFinding({
      id: "z-mayor",
      hypotheses: [{ pattern: "Extract Method", state: "ausente", confidence: "media", checks: [], discriminators: [], places: [], cost: "c", toConfirm: [], source: { name: "s", url: "u" } }] as unknown as Finding["hypotheses"],
    });
    const file = fakeFileUnit([fakeFunctionUnit()]);
    const ctx = fakeContext({ repo: fakeRepo([]), file, neighborhood: vecindarioCon([hermanoMenor]) });
    expect(build(finding, null, ctx)).toBeNull();
    // …y el de `id` MENOR sí habla: el desempate es determinista, no un empate mudo.
    const alReves = fakeContext({ repo: fakeRepo([]), file, neighborhood: vecindarioCon([{ ...hermanoMenor, id: "zz-mayor" }]) });
    expect(build(finding, null, alReves)).not.toBeNull();
  });

  it("un cuerpo que SÓLO asigna/reenvía no emite aunque la refactorización vea pasos: `ensambla-con-logica` sigue siendo el discriminador de intención, sin cambiarle una palabra", () => {
    const finding = fakeLongFunctionFinding({
      hypotheses: [{ pattern: "Extract Method", state: "ausente", confidence: "media", checks: [], discriminators: [], places: [], cost: "c", toConfirm: [], source: { name: "s", url: "u" } }] as unknown as Finding["hypotheses"],
    });
    const file = fakeFileUnit([fakeFunctionUnit({ node: fnNode("build", ["a", "b", "c"], assignOnlyBodySpec(["a", "b", "c"])), sets: assemblySets() })]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });
    expect(build(finding, null, ctx)).toBeNull();
  });

  it("un símbolo SIN forma de construcción no emite: el ancla nueva no afloja `construye-una-entidad`", () => {
    const finding = fakeLongFunctionFinding({
      locations: [{ file: "a.js", startLine: 1, endLine: 10, symbol: "renderTemplate", role: "función larga" }],
      hypotheses: [{ pattern: "Extract Method", state: "ausente", confidence: "media", checks: [], discriminators: [], places: [], cost: "c", toConfirm: [], source: { name: "s", url: "u" } }] as unknown as Finding["hypotheses"],
    });
    const file = fakeFileUnit([fakeFunctionUnit({ name: "renderTemplate" }, { isConstructor: false, isFactoryLike: false })]);
    const ctx = fakeContext({ repo: fakeRepo([]), file });
    expect(build(finding, null, ctx)).toBeNull();
  });

  it("LA COMPUERTA QUE PROTEGE A LA CAPA DE NIVEL 2: si el estado saliera CONFIRMADO (`ya-aplicado`/`aplicado-eludido`), el camino nuevo CALLA — un rival confirmado sobre el mismo rango RETIRA la propuesta de `Extract Method` que lo disparó (`engine.ts#arbitrateRivalHypotheses`), y eso es perder una propuesta ajena", () => {
    // La forma que dispara `ya-aplicado` es la MISMA que ya ejercita el camino
    // viejo (`fluentChainingState`/`evaluateGraphShape`): un tipo con setters
    // encadenados y una puerta sin argumentos. Acá se comprueba el efecto NETO
    // sobre el camino nuevo: no emite nada, en vez de emitir una confirmación.
    const finding = fakeLongFunctionFinding({
      hypotheses: [{ pattern: "Extract Method", state: "ausente", confidence: "media", checks: [], discriminators: [], places: [], cost: "c", toConfirm: [], source: { name: "s", url: "u" } }] as unknown as Finding["hypotheses"],
    });
    const file = fakeFileUnit([fakeFunctionUnit()]);
    const built = build(finding, null, fakeContext({ repo: fakeRepo([]), file }));
    expect(built).not.toBeNull();
    // Ningún estado CONFIRMADO puede salir de este camino, con ningún contexto.
    expect(built!.state === "ya-aplicado" || built!.state === "aplicado-eludido").toBe(false);
  });

  it("EL CAMINO VIEJO SIGUE INTACTO con el ancla nueva puesta: un `long-parameter-list` con el MISMO contexto se construye igual que antes, y el vecindario de nivel 2 no lo toca", () => {
    const finding = fakeLongParameterListFinding();
    const file = fakeFileUnit([fakeFunctionUnit()]);
    expect(build(finding, null, fakeContext({ repo: fakeRepo([]), file }))).not.toBeNull();
    expect(build(finding, null, fakeContext({ repo: fakeRepo([]), file, neighborhood: vecindarioCon([vecinoConPropuesta("Extract Method")]) }))).not.toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * OLA AZ · FRENTE AZ2 — LAS DOS COMPUERTAS DE PODA.
 *
 * EL PRECIO, con las dos cifras juntas como manda el encargo de la ola:
 * `Builder` 11/129 = 8,5 % → 10/55 = 18,2 %; **73 falsas apagadas, 1 VERDADERA
 * perdida** (`sqlalchemy lib/sqlalchemy/engine/default.py:445`,
 * `DefaultDialect.__init__`), razón 73 falsas por verdadera. Es la primera vez
 * que este archivo retira una propuesta que costaba una verdadera, y el usuario
 * lo autorizó por su nombre para `Builder` y `State` únicamente.
 * ═══════════════════════════════════════════════════════════════════════ */

/** Una declaración con lista de ranuras REAL: `tipos` son los TIPOS DE NODO que
 *  cada gramática usa para su ranura, para poder probar las siete de un tirón. */
function fnConRanuras(name: string, tipos: readonly string[]) {
  return buildNode({
    type: "function_declaration",
    fields: {
      name: { type: "identifier", text: name },
      parameters: {
        type: "formal_parameters",
        extraChildren: tipos.map((t) =>
          t === "="
            ? { type: "parameter", extraChildren: [{ type: "identifier", text: "x" }, { type: "=", text: "=", isNamed: false }, { type: "number", text: "1" }] }
            : { type: t, text: t },
        ),
      },
      body: conditionalBodySpec(),
    },
  });
}

describe("hypotheses/builder — OLA AZ (AZ2): compuerta 1, «la lista larga es la CONVENCIÓN del archivo»", () => {
  const finding = (): Finding => fakeLongParameterListFinding({ trigger: [{ label: "parámetros", value: 8, threshold: fakeThreshold(6) }] });
  /** `n` declaraciones del archivo por encima del piso citado por el detector-ancla (6). */
  function fileCon(n: number) {
    const anclada = fakeFunctionUnit({}, { isConstructor: true, parameters: 8 });
    const hermanas = Array.from({ length: Math.max(0, n - 1) }, (_, i) =>
      fakeFunctionUnit({ name: `otra${String(i)}`, startLine: 100 + i * 10, endLine: 105 + i * 10 }, { parameters: 8 }),
    );
    return fakeFileUnit([anclada, ...hermanas]);
  }

  it("9 hermanas por encima del piso ⇒ SIGUE construyendo (el techo es 10)", () => {
    const ctx = fakeContext({ repo: fakeRepo([fakeRepoFunction({}, { isConstructor: true })]), file: fileCon(9) });
    expect(build(finding(), null, ctx)).not.toBeNull();
  });

  it("10 hermanas por encima del piso ⇒ NO construye: la lista larga es la forma del archivo, no un constructor telescópico puntual", () => {
    const ctx = fakeContext({ repo: fakeRepo([fakeRepoFunction({}, { isConstructor: true })]), file: fileCon(10) });
    expect(build(finding(), null, ctx)).toBeNull();
  });

  it("la compuerta sólo RESTA: `data-clump` no tiene piso de parámetros citado, así que no muda nada por esta vía", () => {
    // Mismo caso exacto que el `it` de «grupo repetido donde una firma es
    // constructora ⇒ oportunidad», con el archivo lleno de hermanas gordas: la
    // compuerta 1 no puede contar hermanas sin un piso del detector-ancla, y
    // por eso deja pasar en vez de inventarse un umbral.
    const repoFns = [
      fakeRepoFunction({ file: "a.js", name: "build", startLine: 1, endLine: 5 }, { isConstructor: true }),
      fakeRepoFunction({ file: "a.js", name: "buildOther", startLine: 10, endLine: 14 }, { isConstructor: false }),
      fakeRepoFunction({ file: "a.js", name: "buildThird", startLine: 20, endLine: 24 }, { isConstructor: false }),
    ];
    const gordas = Array.from({ length: 20 }, (_, i) => fakeFunctionUnit({ name: `g${String(i)}`, startLine: 200 + i * 10, endLine: 205 + i * 10 }, { parameters: 30 }));
    const file = fakeFileUnit([fakeFunctionUnit({ name: "build", startLine: 1, endLine: 5 }, { isConstructor: true }), ...gordas]);
    const ctx = fakeContext({ repo: fakeRepo(repoFns), file });
    expect(build(fakeDataClumpFinding(), null, ctx)).not.toBeNull();
  });
});

describe("hypotheses/builder — OLA AZ (AZ2): compuerta 2, «la declaración YA es construcción nombrada y opcional»", () => {
  const finding = (): Finding => fakeLongParameterListFinding({ trigger: [{ label: "parámetros", value: 8, threshold: fakeThreshold(6) }] });
  function ctxCon(tipos: readonly string[], extraFns: readonly ReturnType<typeof fakeFunctionUnit>[] = []) {
    const anclada = fakeFunctionUnit({ node: fnConRanuras("build", tipos) }, { isConstructor: true, className: "Widget", parameters: tipos.length });
    return fakeContext({ repo: fakeRepo([fakeRepoFunction({}, { isConstructor: true, className: "Widget" })]), file: fakeFileUnit([anclada, ...extraFns]) });
  }

  it("mayoría de ranuras OBLIGATORIAS ⇒ sigue construyendo: el cliente está forzado a contar posiciones", () => {
    expect(build(finding(), null, ctxCon(["identifier", "identifier", "identifier", "default_parameter"]))).not.toBeNull();
  });

  it("CERO ranuras obligatorias ⇒ NO construye, y muda aunque el estado fuera `ya-aplicado` (primer escalón, costo CERO medido: 7 falsas, 0 verdaderas)", () => {
    // Hermano fluido en la misma clase ⇒ sin la compuerta esto sería `ya-aplicado`.
    const fluido = fakeFunctionUnit({ name: "withColor", startLine: 40, endLine: 44, node: fakeAstNode("function withColor(c) {\n  this.color = c;\n  return this;\n}") }, { className: "Widget" });
    expect(build(finding(), null, ctxCon(["default_parameter", "default_parameter", "default_parameter"], [fluido]))).toBeNull();
  });

  it("la MITAD o más de las ranuras ya opcionales ⇒ NO construye cuando el estado sería una RECOMENDACIÓN (segundo escalón: 57 falsas, 1 verdadera)", () => {
    expect(build(finding(), null, ctxCon(["identifier", "identifier", "default_parameter", "default_parameter"]))).toBeNull();
  });

  it("un COLECTOR nombrado alcanza por sí solo: `**kwargs` es construcción nombrada y opcional aunque las demás ranuras sean obligatorias", () => {
    expect(build(finding(), null, ctxCon(["identifier", "identifier", "identifier", "dictionary_splat_pattern"]))).toBeNull();
  });

  it("el SEGUNDO escalón sólo pisa RECOMENDACIONES: con un hermano fluido (⇒ `ya-aplicado`) la confirmación sigue viva", () => {
    // Dos de las once verdaderas del banco viven acá (`click _termui_impl.py:58`
    // y `sqlalchemy mapper.py:195`, las dos `ya-aplicado` con 94 % y 96 % de sus
    // ranuras ya opcionales). Por eso el escalón se restringe: `ya-aplicado` es
    // una confirmación, no el ruido que el usuario recibe.
    const fluido = fakeFunctionUnit({ name: "withColor", startLine: 40, endLine: 44, node: fakeAstNode("function withColor(c) {\n  this.color = c;\n  return this;\n}") }, { className: "Widget" });
    const h = build(finding(), null, ctxCon(["identifier", "identifier", "default_parameter", "default_parameter"], [fluido]));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
  });

  it("la compuerta sólo RESTA: una declaración sin lista de ranuras legible no muda nada", () => {
    const anclada = fakeFunctionUnit({}, { isConstructor: true });
    const ctx = fakeContext({ repo: fakeRepo([fakeRepoFunction({}, { isConstructor: true })]), file: fakeFileUnit([anclada]) });
    expect(build(finding(), null, ctx)).not.toBeNull();
  });

  it("NADA DE HARDCODEOS DE LENGUAJE — las SIETE gramáticas del corpus se leen con el MISMO vocabulario genérico de tipos de nodo", () => {
    // Los tipos de nodo son los que la sonda `scratchpad-az2/probe-params.mts`
    // observó parseando código real de cada gramática. Ni un `if (language ===`
    // en la compuerta: es el defecto que dejó a Go MUDO en cuatro anclas de
    // `state.ts` durante varias olas.
    const opcionalPorGramatica: Record<string, string> = {
      python: "default_parameter",
      "python (anotada)": "typed_default_parameter",
      ruby: "optional_parameter",
      typescript: "optional_parameter",
      javascript: "assignment_pattern",
      csharp: "=", // `parameter` con `equals_value_clause`/token `=` adentro
    };
    for (const [gramatica, tipo] of Object.entries(opcionalPorGramatica)) {
      expect(build(finding(), null, ctxCon([tipo, tipo, "identifier"])), `${gramatica}: la ranura opcional tiene que verse`).toBeNull();
    }
    const colectorPorGramatica: Record<string, string> = {
      "python **kwargs": "dictionary_splat_pattern",
      "python *args": "list_splat_pattern",
      "ruby **opts": "hash_splat_parameter",
      "ruby *rest": "splat_parameter",
      "javascript ...rest": "rest_pattern",
      "go ...int": "variadic_parameter_declaration",
      "java int...": "spread_parameter",
    };
    for (const [gramatica, tipo] of Object.entries(colectorPorGramatica)) {
      expect(build(finding(), null, ctxCon(["identifier", "identifier", "identifier", tipo])), `${gramatica}: el colector nombrado tiene que verse`).toBeNull();
    }
    // Y EL REVÉS, que es el que prueba que no es una regex que dice `true` a
    // todo: Go y Java NO tienen valores por defecto, y sus ranuras llanas no se
    // leen como opcionales.
    for (const tipo of ["parameter_declaration", "formal_parameter", "required_parameter", "parameter"]) {
      expect(build(finding(), null, ctxCon([tipo, tipo, tipo])), `${tipo}: una ranura obligatoria NO puede leerse como opcional`).not.toBeNull();
    }
  });
});
