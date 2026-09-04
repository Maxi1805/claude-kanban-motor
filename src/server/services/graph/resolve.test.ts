/**
 * `graph/resolve.ts` — unit tests over SYNTHETIC candidates/context (no
 * parsing, no real grammar): every stage's structural rule, in isolation and
 * end-to-end, plus the measurability invariant CONTRATO-F3.md §3.3 mandates.
 * The real-grammar, real-corpus numbers live in `resolve-gate.test.ts`
 * (precision/recall against the labeled dataset) and the corpus measurement
 * script this task reports separately.
 */
import { describe, expect, it } from "vitest";

import { ALL_STAGES, resolveReferences } from "./resolve.js";
import type { ReferenceFacts, ReferenceRole } from "./references.js";
import type { SymbolFacts, SymbolFamily } from "./symbols.js";
import { AMBIGUOUS_MAX_TARGETS, type ResolutionCandidate, type ResolutionContext, type ResolutionStage, type SymbolRef } from "./stages.js";
import { EDGE_ROLE_BARE, EDGE_ROLE_QUALIFIED, EDGE_ROLE_RECEIVER_MEMBER } from "./types.js";

function ref(overrides: Partial<ReferenceFacts> & { name: string }): ReferenceFacts {
  return {
    role: "bare" as ReferenceRole,
    scope: [],
    qualifier: null,
    qualifierIsBareConstant: false,
    shadowedLocally: false,
    line: 1,
    column: 0,
    occurrences: 1,
    ...overrides,
  };
}

function sym(overrides: Partial<SymbolFacts> & { name: string }): SymbolFacts {
  return {
    container: [],
    nodeType: "class",
    family: "class-like" as SymbolFamily,
    memberOfClassLike: false,
    namespaceContainerOnly: false,
    startLine: 1,
    endLine: 1,
    nameLine: 1,
    nameColumn: 0,
    ...overrides,
  };
}

/**
 * Minimal context: a fixed map of `SymbolRef -> SymbolFacts`, keyed by
 * `file#path`. `imports` (B1, eslabón 2) defaults to EMPTY — every existing
 * test built before `module-reachability` existed relies on that stage being
 * a total no-op (`hasResolvedImports` false for every file ⇒ `{ outcome:
 * "pass" }` unconditionally), so this default preserves every prior
 * assertion byte-for-byte. Only tests that explicitly exercise the new stage
 * pass a non-empty `imports` list.
 */
function makeCtx(
  entries: readonly { readonly ref: SymbolRef; readonly facts: SymbolFacts }[],
  imports: readonly { readonly from: string; readonly to: string }[] = [],
): ResolutionContext {
  const byKey = new Map(entries.map((e) => [`${e.ref.file}#${e.ref.symbolPath.join(".")}`, e.facts]));
  const byName = new Map<string, SymbolRef[]>();
  for (const e of entries) {
    const list = byName.get(e.facts.name);
    if (list) list.push(e.ref);
    else byName.set(e.facts.name, [e.ref]);
  }
  const direct = new Map<string, Set<string>>();
  for (const i of imports) {
    const set = direct.get(i.from);
    if (set) set.add(i.to);
    else direct.set(i.from, new Set([i.to]));
  }
  const reachableFrom = (from: string): ReadonlySet<string> => {
    const seen = new Set<string>([from]);
    const stack = [from];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const next of direct.get(cur) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    return seen;
  };
  return {
    declarationsByName: (name) => byName.get(name) ?? [],
    symbol: (r) => byKey.get(`${r.file}#${r.symbolPath.join(".")}`) ?? null,
    factsOf: () => null,
    languageOf: () => "ruby",
    importsModule: (from, to) => direct.get(from)?.has(to) ?? false,
    reachesModule: (from, to) => reachableFrom(from).has(to),
    hasResolvedImports: (file) => (direct.get(file)?.size ?? 0) > 0,
    // GUARDIÁN OLA P (grupo grafo) — `ResolutionContext` ganó estos tres
    // métodos (P2.md, PIDO (c)) para que una etapa futura pueda leer
    // `ImportSpecifierFacts` con el tipo puesto; ninguna etapa hoy los
    // consulta, así que un default conservador ("nada es no-resuelto, nada
    // resuelve en otro lado") no cambia el comportamiento de ningún caso
    // existente de este archivo.
    importsUnresolvedSpecifier: () => false,
    importSpecifiers: () => ({ resolved: [], unresolved: [] }),
    specifierResolvesSomewhere: () => false,
  };
}

function candidate(id: string, from: { file: string; ref: ReferenceFacts }, targets: readonly SymbolRef[]): ResolutionCandidate {
  return { id, from, targets };
}

function stageById(id: string): ResolutionStage {
  const s = ALL_STAGES.find((x) => x.id === id);
  if (!s) throw new Error(`no such stage: ${id}`);
  return s;
}

describe("ALL_STAGES — shape", () => {
  it("13 etapas, order único, ascendente, sin huecos, 1..13 (P1 agrega typeless-receiver; C1 agrega self-receiver; AA6 agrega type-slot)", () => {
    expect(ALL_STAGES).toHaveLength(13);
    const orders = ALL_STAGES.map((s) => s.order);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(new Set(ALL_STAGES.map((s) => s.id)).size).toBe(13);
    expect(ALL_STAGES.map((s) => s.id)).toContain("module-reachability");
    expect(ALL_STAGES.map((s) => s.id)).toContain("typeless-receiver");
    expect(ALL_STAGES.map((s) => s.id)).toContain("self-receiver");
    expect(ALL_STAGES.map((s) => s.id)).toContain("type-slot");
  });

  it("type-slot corre ANTES de global-uniqueness y path-proximity — si no, un tipo escrito cuyo único homónimo es una función ya habría salido `resolved`", () => {
    const orderOf = (id: string): number => ALL_STAGES.find((s) => s.id === id)!.order;
    expect(orderOf("type-slot")).toBeLessThan(orderOf("global-uniqueness"));
    expect(orderOf("type-slot")).toBeLessThan(orderOf("path-proximity"));
    // …y ANTES de `typeless-receiver`, para que la lista de `alternatives` que
    // esa etapa emite ya venga sin las funciones que un tipo no puede nombrar.
    expect(orderOf("type-slot")).toBeLessThan(orderOf("typeless-receiver"));
  });

  it("self-receiver corre ANTES de toda etapa de narrowing — su criterio es una identidad, y `single-file-component` podría sacarle su único destino correcto", () => {
    const orderOf = (id: string): number => ALL_STAGES.find((s) => s.id === id)!.order;
    expect(orderOf("self-receiver")).toBeLessThan(orderOf("namespace-container"));
    expect(orderOf("self-receiver")).toBeLessThan(orderOf("single-file-component"));
    expect(orderOf("self-receiver")).toBeLessThan(orderOf("module-reachability"));
    // …y ANTES de `typeless-receiver`, que es su complemento: lo que
    // `self-receiver` SÍ sabe atribuir no debe salir como "no sé cuál".
    expect(orderOf("self-receiver")).toBeLessThan(orderOf("typeless-receiver"));
  });

  it("typeless-receiver corre ANTES de global-uniqueness y path-proximity — si no, un `x.foo()` con un solo homónimo saldría `resolved`", () => {
    const orderOf = (id: string): number => ALL_STAGES.find((s) => s.id === id)!.order;
    expect(orderOf("typeless-receiver")).toBeLessThan(orderOf("global-uniqueness"));
    expect(orderOf("typeless-receiver")).toBeLessThan(orderOf("path-proximity"));
    // …y DESPUÉS de todas las etapas de narrowing, para que la lista de
    // destinos posibles que emite sea la más chica que la cascada supo hacer.
    expect(orderOf("typeless-receiver")).toBeGreaterThan(orderOf("module-reachability"));
    expect(orderOf("typeless-receiver")).toBeGreaterThan(orderOf("qualified-name"));
    expect(orderOf("typeless-receiver")).toBeGreaterThan(orderOf("single-file-component"));
  });
});

describe("resolveReferences — invariante de medibilidad (CONTRATO-F3.md §3.3)", () => {
  it("todo candidato cae en exactamente un bucket: resolved/rejected(por etapa)/droppedAmbiguous/unresolved", () => {
    const declFile = "lib/target.rb";
    const declRef: SymbolRef = { file: declFile, symbolPath: ["Widget"] };
    const decl2Ref: SymbolRef = { file: "lib/other.rb", symbolPath: ["Widget"] };
    const ctx = makeCtx([
      { ref: declRef, facts: sym({ name: "Widget" }) },
      { ref: decl2Ref, facts: sym({ name: "Widget" }) },
    ]);

    const candidates: ResolutionCandidate[] = [
      // 1. key role -> rejected at syntactic-role
      candidate("c1", { file: "a.rb", ref: ref({ name: "Widget", role: "key" }) }, [declRef]),
      // 2. shadowed -> rejected at local-shadow
      candidate("c2", { file: "a.rb", ref: ref({ name: "Widget", shadowedLocally: true }) }, [declRef]),
      // 3. unique, unshadowed, unqualified -> resolved at global-uniqueness
      candidate("c3", { file: "a.rb", ref: ref({ name: "Widget" }) }, [declRef]),
      // 4. two owners, no way to disambiguate (same path distance) -> droppedAmbiguous
      candidate("c4", { file: "z/mid.rb", ref: ref({ name: "Widget" }) }, [declRef, decl2Ref]),
      // 5. name declared nowhere considered -> never built as a candidate in
      //    production, but exercised here directly with 0 targets to prove
      //    the "unresolved" bucket path through the engine.
      candidate("c5", { file: "a.rb", ref: ref({ name: "Ghost" }) }, []),
    ];

    let resolvedTrace = 0;
    let rejectedTrace = 0;
    let ambiguousTrace = 0;
    let unresolvedTrace = 0;
    const { stats } = resolveReferences(ALL_STAGES, candidates, ctx, {
      trace: (t) => {
        if (t.final === "resolved") resolvedTrace++;
        else if (t.final === "rejected") rejectedTrace++;
        else if (t.final === "ambiguous") ambiguousTrace++;
        else unresolvedTrace++;
      },
    });

    expect(resolvedTrace).toBe(1);
    expect(rejectedTrace).toBe(2);
    expect(ambiguousTrace).toBe(1);
    expect(unresolvedTrace).toBe(1);
    expect(resolvedTrace + rejectedTrace + ambiguousTrace + unresolvedTrace).toBe(candidates.length);

    expect(stats.candidates).toBe(5);
    expect(stats.resolved).toBe(1);
    expect(stats.droppedAmbiguous).toBe(1);
    expect(stats.unresolved).toBe(1);

    const sumRejectedByStage = stats.byStage.reduce((n, s) => n + s.rejected, 0);
    expect(sumRejectedByStage).toBe(2);
    const sumAcceptedByStage = stats.byStage.reduce((n, s) => n + s.accepted, 0);
    expect(sumAcceptedByStage).toBe(1);
  });
});

describe("etapa 1 — syntactic-role", () => {
  const stage = stageById("syntactic-role");
  const ctx = makeCtx([]);

  it("rechaza key y parameter", () => {
    for (const role of ["key", "parameter"] as const) {
      const c = candidate("c", { file: "a.rb", ref: ref({ name: "x", role }) }, [{ file: "b.rb", symbolPath: ["x"] }]);
      expect(stage.decide(c, ctx)).toEqual({ outcome: "reject", why: expect.any(String) });
    }
  });

  // P1 (Ola P): ANTES esto era `reject` ("receptor explícito no-constante —
  // sin tipos, la arista no se emite"). Ese rechazo confundía "no sé cuál" con
  // "no hay", y era la causa medida del 98,5 % del volumen crudo de
  // `unused-symbol`. Ahora pasa, y lo cierra `typeless-receiver` como
  // `ambiguous` — ver el docstring de la etapa.
  it("PASA receiver-member con calificador NO constante (array.join): la decide typeless-receiver, no ésta", () => {
    const c = candidate(
      "c",
      { file: "a.rb", ref: ref({ name: "join", role: "receiver-member", qualifier: "array", qualifierIsBareConstant: false }) },
      [{ file: "b.rb", symbolPath: ["join"] }],
    );
    expect(stage.decide(c, ctx)).toEqual({ outcome: "pass" });
  });

  it("pasa (defiere) receiver-member con calificador constante desnudo (PathManager.join)", () => {
    const c = candidate(
      "c",
      { file: "a.rb", ref: ref({ name: "join", role: "receiver-member", qualifier: "PathManager", qualifierIsBareConstant: true }) },
      [{ file: "b.rb", symbolPath: ["PathManager", "join"] }],
    );
    expect(stage.decide(c, ctx)).toEqual({ outcome: "pass" });
  });

  it("deja pasar bare/qualified", () => {
    for (const role of ["bare", "qualified"] as const) {
      const c = candidate("c", { file: "a.rb", ref: ref({ name: "x", role }) }, [{ file: "b.rb", symbolPath: ["x"] }]);
      expect(stage.decide(c, ctx)).toEqual({ outcome: "pass" });
    }
  });
});

describe("types.ts `EdgeRole` — los TRES roles de declaración no llegan a una arista (N9, Ola O: la deriva quedó cerrada)", () => {
  // HISTORIA, porque el test que había acá documentaba lo contrario: el
  // comentario de `types.ts`/CONTRATO-F8G.md §1.1 afirma que `decl-name`,
  // `parameter` y `key` "nunca llegan a una arista (la etapa syntactic-role
  // los rechaza antes)", y hasta la Ola O eso era verificablemente FALSO para
  // `decl-name` — `syntacticRoleStage` sólo rechazaba `key`/`parameter` y
  // `decl-name` caía al `pass` final. El test anterior fijaba esa deriva en
  // algo ejecutable ("decl-name -> PASS (contradice el docstring)") a la
  // espera de que alguien la resolviera. Se resolvió a favor del contrato y
  // de `references.ts` (que define `decl-name` como "the function/class's own
  // declared name, NOT a use of anything"): la etapa lo rechaza. Ver el
  // docstring de `syntacticRoleStage` en `resolve.ts` para la evidencia
  // medida sobre el corpus que motivó cerrarla en esa dirección.
  const stage = stageById("syntactic-role");
  const ctx = makeCtx([]);
  const targets = [{ file: "b.rb", symbolPath: ["x"] }];

  it("key -> reject", () => {
    const c = candidate("c", { file: "a.rb", ref: ref({ name: "x", role: "key" }) }, targets);
    expect(stage.decide(c, ctx).outcome).toBe("reject");
  });

  it("parameter -> reject", () => {
    const c = candidate("c", { file: "a.rb", ref: ref({ name: "x", role: "parameter" }) }, targets);
    expect(stage.decide(c, ctx).outcome).toBe("reject");
  });

  // P1 (Ola P): `receiver-member` NO es uno de los tres roles de declaración —
  // es un SITIO DE USO, y `types.ts#EdgeRole` lo lista como tal. Que esta
  // etapa lo rechazara era una decisión de resolución (no había cómo emitir
  // "no sé cuál"), no la definición del rol. Ahora los dos subconjuntos pasan
  // y los deciden las etapas 4 y 9.
  it("receiver-member -> pass en los DOS subconjuntos (constante desnuda y receptor sin tipo)", () => {
    const nonConstant = candidate(
      "c",
      { file: "a.rb", ref: ref({ name: "x", role: "receiver-member", qualifier: "v", qualifierIsBareConstant: false }) },
      targets,
    );
    expect(stage.decide(nonConstant, ctx)).toEqual({ outcome: "pass" });

    const bareConstant = candidate(
      "c",
      { file: "a.rb", ref: ref({ name: "x", role: "receiver-member", qualifier: "V", qualifierIsBareConstant: true }) },
      targets,
    );
    expect(stage.decide(bareConstant, ctx)).toEqual({ outcome: "pass" });
  });

  it("decl-name -> reject (el nombre de la propia declaración no es un uso)", () => {
    const c = candidate("c", { file: "a.rb", ref: ref({ name: "x", role: "decl-name" }) }, targets);
    expect(stage.decide(c, ctx).outcome).toBe("reject");
  });

  // El caso REAL que abrió este frente, reducido a su forma: 3 clases
  // declaran su propio `constructor`; una cuarta declaración homónima sin
  // contenedor (una clase ANÓNIMA) es la única que `class-member` no
  // descarta. Antes de la Ola O cada `decl-name` de las 3 primeras resolvía
  // a la cuarta por "dueño global único" — 387 aristas en nest hacia un solo
  // nodo. Ahora el candidato muere en la etapa 1.
  it("el `decl-name` del constructor de una clase NO resuelve al homónimo sin contenedor (repro de nest)", () => {
    const anonymous: SymbolRef = { file: "util.ts", symbolPath: ["constructor"] };
    const c = candidate("c", { file: "svc.ts", ref: ref({ name: "constructor", role: "decl-name", scope: ["CatsService"] }) }, [anonymous]);
    expect(stage.decide(c, makeCtx([])).outcome).toBe("reject");
  });
});

describe("etapa 2 — local-shadow", () => {
  const stage = stageById("local-shadow");
  it("rechaza cuando shadowedLocally", () => {
    const c = candidate("c", { file: "a.rb", ref: ref({ name: "x", shadowedLocally: true }) }, [{ file: "b.rb", symbolPath: ["x"] }]);
    expect(stage.decide(c, makeCtx([])).outcome).toBe("reject");
  });

  // P1 (Ola P): `shadowedLocally` se calcula por NOMBRE, sin mirar el rol. El
  // `foo` de `x.foo()` no se busca en el ámbito léxico, así que una variable
  // local llamada `foo` no lo sombrea — el dato no aplica a este rol.
  it("NO opina sobre receiver-member aunque shadowedLocally sea true: un local no sombrea un miembro tras un receptor explícito", () => {
    const c = candidate(
      "c",
      { file: "a.rb", ref: ref({ name: "x", role: "receiver-member", qualifier: "v", shadowedLocally: true }) },
      [{ file: "b.rb", symbolPath: ["C", "x"] }],
    );
    expect(stage.decide(c, makeCtx([]))).toEqual({ outcome: "pass" });
  });
});

describe("etapa 3 — class-member (N1-a, mata el hub de each)", () => {
  const stage = stageById("class-member");
  const eachTarget: SymbolRef = { file: "enumerable.rb", symbolPath: ["Enumerable", "each"] };
  const ctx = makeCtx([{ ref: eachTarget, facts: sym({ name: "each", family: "function-like", memberOfClassLike: true }) }]);

  it("rechaza cuando el único target es un método miembro de clase, referenciado bare", () => {
    const c = candidate("c", { file: "a.rb", ref: ref({ name: "each" }) }, [eachTarget]);
    expect(stage.decide(c, ctx).outcome).toBe("reject");
  });

  it("no filtra una clase anidada (family class-like) aunque memberOfClassLike sea true — eso lo decide qualified-name", () => {
    const nested: SymbolRef = { file: "errors.rb", symbolPath: ["Errors", "FatalException"] };
    const c2Ctx = makeCtx([{ ref: nested, facts: sym({ name: "FatalException", family: "class-like", memberOfClassLike: true }) }]);
    const c = candidate("c", { file: "a.rb", ref: ref({ name: "FatalException" }) }, [nested]);
    expect(stage.decide(c, c2Ctx)).toEqual({ outcome: "pass" });
  });

  it("no filtra targets para role receiver-member (los necesita bare-constant-receiver)", () => {
    const c = candidate(
      "c",
      { file: "a.rb", ref: ref({ name: "each", role: "receiver-member", qualifier: "Enumerable", qualifierIsBareConstant: true }) },
      [eachTarget],
    );
    expect(stage.decide(c, ctx)).toEqual({ outcome: "pass" });
  });

  /**
   * A8 (Ola 11b) — la causa raíz MEDIDA de `calls` = 0 en C#/Java: la
   * excepción de despacho implícito a `self` estaba atada a `=== "ruby"`, y en
   * los lenguajes donde TODA función es miembro de una clase eso da cero
   * exacto. Ver el docstring de `classMemberStage`.
   */
  describe("A8 — posición de callee (despacho implícito, cualquier lenguaje)", () => {
    const normalize: SymbolRef = { file: "Src/App/Services/OrderService.cs", symbolPath: ["App", "Services", "OrderService", "Normalize"] };
    const csharpCtx: ResolutionContext = {
      ...makeCtx([
        {
          ref: normalize,
          facts: sym({ name: "Normalize", family: "function-like", memberOfClassLike: true, container: ["App", "Services", "OrderService"] }),
        },
      ]),
      languageOf: () => "csharp",
    };
    const useScope = ["App", "Services", "OrderService", "Load"];

    it("bare + isCallee + contenedor que engloba el scope del sitio de llamada -> pasa (antes: reject, y por eso C# daba 0 aristas `calls`)", () => {
      const c = candidate("c", { file: normalize.file, ref: ref({ name: "Normalize", scope: useScope, isCallee: true }) }, [normalize]);
      expect(stage.decide(c, csharpCtx)).toEqual({ outcome: "pass" });
    });

    it("el MISMO nombre desnudo SIN posición de callee sigue rechazándose — el ensanche no puede mover ni una arista `references`", () => {
      const c = candidate("c", { file: normalize.file, ref: ref({ name: "Normalize", scope: useScope }) }, [normalize]);
      expect(stage.decide(c, csharpCtx).outcome).toBe("reject");
    });

    it("bare + isCallee pero el contenedor declarante NO engloba el scope del sitio -> sigue rechazándose (no es despacho a `self`, es un homónimo de otra clase)", () => {
      const c = candidate(
        "c",
        { file: normalize.file, ref: ref({ name: "Normalize", scope: ["App", "Program", "Run"], isCallee: true }) },
        [normalize],
      );
      expect(stage.decide(c, csharpCtx).outcome).toBe("reject");
    });

    it("un método de contenedor VACÍO nunca dispara la excepción, ni con callee — el prefijo trivial reabriría el hub que N1-a existe para cerrar", () => {
      const topLevel: SymbolRef = { file: "a.cs", symbolPath: ["each"] };
      const topCtx: ResolutionContext = {
        ...makeCtx([{ ref: topLevel, facts: sym({ name: "each", family: "function-like", memberOfClassLike: true, container: [] }) }]),
        languageOf: () => "csharp",
      };
      const c = candidate("c", { file: "b.cs", ref: ref({ name: "each", scope: ["Otra", "m"], isCallee: true }) }, [topLevel]);
      expect(stage.decide(c, topCtx).outcome).toBe("reject");
    });
  });
});

describe("etapa 4 — bare-constant-receiver (el refinamiento medido)", () => {
  const stage = stageById("bare-constant-receiver");
  const joinInPathManager: SymbolRef = { file: "path_manager.rb", symbolPath: ["PathManager", "join"] };
  const ctx = makeCtx([
    { ref: joinInPathManager, facts: sym({ name: "join", family: "function-like", memberOfClassLike: true, container: ["PathManager"] }) },
  ]);

  it("acepta PathManager.join: constante coincide con el contenedor inmediato del único target", () => {
    const c = candidate(
      "c",
      { file: "a.rb", ref: ref({ name: "join", role: "receiver-member", qualifier: "PathManager", qualifierIsBareConstant: true }) },
      [joinInPathManager],
    );
    const v = stage.decide(c, ctx);
    expect(v.outcome).toBe("accept");
    if (v.outcome === "accept") {
      expect(v.target).toEqual(joinInPathManager);
      expect(v.provenance).toBe("resolved");
    }
  });

  it("rechaza cuando la constante no coincide con ningún contenedor inmediato declarante", () => {
    const c = candidate(
      "c",
      { file: "a.rb", ref: ref({ name: "join", role: "receiver-member", qualifier: "Somewhere", qualifierIsBareConstant: true }) },
      [joinInPathManager],
    );
    expect(stage.decide(c, ctx).outcome).toBe("reject");
  });

  it("no opina sobre candidatos que no son receiver-member", () => {
    const c = candidate("c", { file: "a.rb", ref: ref({ name: "join" }) }, [joinInPathManager]);
    expect(stage.decide(c, ctx)).toEqual({ outcome: "pass" });
  });

  // P1 (Ola P): antes esta etapa nunca veía un receptor no constante porque
  // `syntactic-role` ya lo había matado. Ahora los ve, y si opinara sobre
  // ellos los rechazaría a todos (el texto del calificador es el nombre de una
  // VARIABLE, jamás va a coincidir con el `container` de una clase) —
  // reabriendo el mismo agujero que P1 vino a cerrar, una etapa más abajo.
  it("no opina sobre un receptor NO constante (array.join) aunque traiga qualifier — si opinara, lo rechazaría por comparar contra un nombre de variable", () => {
    const c = candidate(
      "c",
      { file: "a.rb", ref: ref({ name: "join", role: "receiver-member", qualifier: "array", qualifierIsBareConstant: false }) },
      [joinInPathManager],
    );
    expect(stage.decide(c, ctx)).toEqual({ outcome: "pass" });
  });
});

describe("etapa 5 — self-receiver (C1, Ola U: el receptor cuyo tipo escribe la gramática)", () => {
  const stage = stageById("self-receiver");
  const renderInGroup: SymbolRef = { file: "shapes.ts", symbolPath: ["ShapeGroup", "render"] };
  const renderInLeaf: SymbolRef = { file: "leaf.ts", symbolPath: ["Leaf", "render"] };
  const group: SymbolRef = { file: "shapes.ts", symbolPath: ["ShapeGroup"] };
  const leaf: SymbolRef = { file: "leaf.ts", symbolPath: ["Leaf"] };
  const baseEntries = [
    { ref: group, facts: sym({ name: "ShapeGroup", family: "class-like" as SymbolFamily }) },
    { ref: leaf, facts: sym({ name: "Leaf", family: "class-like" as SymbolFamily }) },
    { ref: renderInGroup, facts: sym({ name: "render", family: "function-like" as SymbolFamily, memberOfClassLike: true, container: ["ShapeGroup"] }) },
    { ref: renderInLeaf, facts: sym({ name: "render", family: "function-like" as SymbolFamily, memberOfClassLike: true, container: ["Leaf"] }) },
  ];
  const ctx = makeCtx(baseEntries);

  const selfCall = (file: string, scope: readonly string[], qualifier: string, targets: readonly SymbolRef[]): ResolutionCandidate =>
    candidate("c", { file, ref: ref({ name: "render", role: "receiver-member", qualifier, scope: [...scope] }) }, targets);

  it("`this.render()` escrito dentro de ShapeGroup resuelve al render DE ShapeGroup, aunque haya un homónimo en otro archivo", () => {
    const v = stage.decide(selfCall("shapes.ts", ["ShapeGroup", "draw"], "this", [renderInGroup, renderInLeaf]), ctx);
    expect(v.outcome).toBe("accept");
    if (v.outcome === "accept") {
      expect(v.target).toEqual(renderInGroup);
      expect(v.provenance).toBe("resolved");
    }
  });

  it("`self` vale lo mismo que `this` — son la misma palabra reservada en gramáticas distintas, no dos casos", () => {
    const v = stage.decide(selfCall("shapes.ts", ["ShapeGroup", "draw"], "self", [renderInGroup, renderInLeaf]), ctx);
    expect(v.outcome).toBe("accept");
  });

  it("no opina sobre un receptor que NO es el propio objeto (`child.render()`) — ése es el caso de typeless-receiver", () => {
    expect(stage.decide(selfCall("shapes.ts", ["ShapeGroup", "draw"], "child", [renderInGroup, renderInLeaf]), ctx)).toEqual({ outcome: "pass" });
  });

  it("no opina sobre `this.campo.render()` — el receptor es un COLABORADOR, no el propio objeto: su tipo sigue siendo desconocido", () => {
    expect(stage.decide(selfCall("shapes.ts", ["ShapeGroup", "draw"], "this.child", [renderInGroup, renderInLeaf]), ctx)).toEqual({ outcome: "pass" });
  });

  it("se abstiene (nunca rechaza) cuando el miembro NO está declarado en el contenedor — es un heredado, y eso no lo sabe esta etapa", () => {
    expect(stage.decide(selfCall("leaf.ts", ["Leaf", "paint"], "this", [renderInGroup]), ctx)).toEqual({ outcome: "pass" });
  });

  it("clase ANIDADA: `this.render()` dentro de Outer.Inner resuelve al render de Inner, nunca al de Outer — `this` nombra la unidad MÁS PROFUNDA", () => {
    const outer: SymbolRef = { file: "nested.ts", symbolPath: ["Outer"] };
    const inner: SymbolRef = { file: "nested.ts", symbolPath: ["Outer", "Inner"] };
    const renderOuter: SymbolRef = { file: "nested.ts", symbolPath: ["Outer", "render"] };
    const renderInner: SymbolRef = { file: "nested.ts", symbolPath: ["Outer", "Inner", "render"] };
    const nestedCtx = makeCtx([
      { ref: outer, facts: sym({ name: "Outer", family: "class-like" as SymbolFamily }) },
      { ref: inner, facts: sym({ name: "Inner", family: "class-like" as SymbolFamily, container: ["Outer"] }) },
      { ref: renderOuter, facts: sym({ name: "render", family: "function-like" as SymbolFamily, memberOfClassLike: true, container: ["Outer"] }) },
      { ref: renderInner, facts: sym({ name: "render", family: "function-like" as SymbolFamily, memberOfClassLike: true, container: ["Outer", "Inner"] }) },
    ]);
    const v = stage.decide(selfCall("nested.ts", ["Outer", "Inner", "draw"], "this", [renderOuter, renderInner]), nestedCtx);
    expect(v.outcome).toBe("accept");
    if (v.outcome === "accept") expect(v.target).toEqual(renderInner);
  });

  it("clase reabierta/parcial: cada sitio resuelve al miembro declarado en SU PROPIO archivo — la condición de mismo-archivo desempata sin inventar nada", () => {
    const renderTwin: SymbolRef = { file: "shapes_extra.ts", symbolPath: ["ShapeGroup", "render"] };
    const groupTwin: SymbolRef = { file: "shapes_extra.ts", symbolPath: ["ShapeGroup"] };
    const twinCtx = makeCtx([
      ...baseEntries,
      // La reapertura declara la clase TAMBIÉN en su archivo — así la escribe
      // Ruby (`class ShapeGroup` de nuevo) y C# (`partial class`).
      { ref: groupTwin, facts: sym({ name: "ShapeGroup", family: "class-like" as SymbolFamily }) },
      { ref: renderTwin, facts: sym({ name: "render", family: "function-like" as SymbolFamily, memberOfClassLike: true, container: ["ShapeGroup"] }) },
    ]);
    // El gemelo vive en OTRO archivo: la condición de mismo-archivo lo excluye
    // y queda exactamente un destino propio, así que ESTE caso sí resuelve…
    const v = stage.decide(selfCall("shapes.ts", ["ShapeGroup", "draw"], "this", [renderInGroup, renderTwin]), twinCtx);
    expect(v.outcome).toBe("accept");
    if (v.outcome === "accept") expect(v.target).toEqual(renderInGroup);
    // …y el sitio escrito EN el archivo gemelo resuelve al SUYO, no al del otro.
    const v2 = stage.decide(selfCall("shapes_extra.ts", ["ShapeGroup", "draw"], "this", [renderInGroup, renderTwin]), twinCtx);
    expect(v2.outcome).toBe("accept");
    if (v2.outcome === "accept") expect(v2.target).toEqual(renderTwin);
  });

  it("se abstiene cuando el sitio no está dentro de ninguna unidad tipo-clase declarada en su archivo", () => {
    expect(stage.decide(selfCall("shapes.ts", ["algunaFuncion"], "this", [renderInGroup]), ctx)).toEqual({ outcome: "pass" });
  });

  it("no opina sobre una constante desnuda — ése es el subconjunto de bare-constant-receiver, y los dos son disjuntos", () => {
    const c = candidate(
      "c",
      { file: "shapes.ts", ref: ref({ name: "render", role: "receiver-member", qualifier: "self", qualifierIsBareConstant: true, scope: ["ShapeGroup", "draw"] }) },
      [renderInGroup],
    );
    expect(stage.decide(c, ctx)).toEqual({ outcome: "pass" });
  });

  it("integración: el uso propio sale `resolved` con el bit receiver-member, NO `ambiguous` — es la diferencia que ve `confidentEdges`", () => {
    const { edges, stats } = resolveReferences(
      ALL_STAGES,
      [selfCall("shapes.ts", ["ShapeGroup", "draw"], "this", [renderInGroup, renderInLeaf])],
      ctx,
    );
    expect(stats.resolved).toBe(1);
    expect(stats.droppedAmbiguous).toBe(0);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.provenance).toBe("resolved");
    expect(edges[0]!.resolvedBy).toBe("self-receiver");
    expect(edges[0]!.roles! & EDGE_ROLE_RECEIVER_MEMBER).toBe(EDGE_ROLE_RECEIVER_MEMBER);
    expect(edges[0]!.alternatives).toBeUndefined();
  });
});

describe("etapa 6 — namespace-container", () => {
  const stage = stageById("namespace-container");
  it("rechaza cuando el único target es un contenedor de namespace puro", () => {
    const t: SymbolRef = { file: "errors.rb", symbolPath: ["Errors"] };
    const ctx = makeCtx([{ ref: t, facts: sym({ name: "Errors", family: "namespace-like", namespaceContainerOnly: true }) }]);
    const c = candidate("c", { file: "a.rb", ref: ref({ name: "Errors" }) }, [t]);
    expect(stage.decide(c, ctx).outcome).toBe("reject");
  });
});

describe("etapa 7 — qualified-name (N1-b, mata la colisión de File)", () => {
  const stage = stageById("qualified-name");

  it("rechaza un `File` bare referenciado desde un scope léxicamente incompatible (la colisión con stdlib)", () => {
    const fileClass: SymbolRef = { file: "jekyll/liquid_renderer/file.rb", symbolPath: ["Jekyll", "LiquidRenderer", "File"] };
    const ctx = makeCtx([
      { ref: fileClass, facts: sym({ name: "File", family: "class-like", container: ["Jekyll", "LiquidRenderer"] }) },
    ]);
    const c = candidate("c", { file: "jekyll/site.rb", ref: ref({ name: "File", scope: ["Jekyll", "Site"] }) }, [fileClass]);
    expect(stage.decide(c, ctx).outcome).toBe("reject");
  });

  it("acepta (pasa) una clase anidada referenciada desde un ancestro de su propio namespace (el caso errors.rb)", () => {
    const fatalException: SymbolRef = { file: "jekyll/errors.rb", symbolPath: ["Jekyll", "Errors", "FatalException"] };
    const ctx = makeCtx([
      { ref: fatalException, facts: sym({ name: "FatalException", family: "class-like", container: ["Jekyll", "Errors"] }) },
    ]);
    const c = candidate(
      "c",
      { file: "jekyll/site.rb", ref: ref({ name: "FatalException", role: "qualified", scope: ["Jekyll"], qualifier: "Errors" }) },
      [fatalException],
    );
    expect(stage.decide(c, ctx)).toEqual({ outcome: "pass" });
  });

  it("una declaración a nivel de archivo (container vacío) siempre es visible", () => {
    const topLevel: SymbolRef = { file: "lib/helper.rb", symbolPath: ["Helper"] };
    const ctx = makeCtx([{ ref: topLevel, facts: sym({ name: "Helper", family: "class-like", container: [] }) }]);
    const c = candidate("c", { file: "somewhere/deep.rb", ref: ref({ name: "Helper", scope: ["Somewhere", "Deep"] }) }, [topLevel]);
    expect(stage.decide(c, ctx)).toEqual({ outcome: "pass" });
  });

  // P1 (Ola P): la visibilidad por namespace léxico no es la pregunta de un
  // acceso por receptor. El `container` del método es su clase, que no tiene
  // por qué ser prefijo/sufijo del scope de quien llama — aplicarle las cuatro
  // condiciones rechazaría casi todos y volvería a convertir "no sé" en "no
  // hay", una etapa después de que `syntactic-role` dejó de hacerlo.
  it("NO opina sobre receiver-member: el miembro se busca en el receptor, no en el ámbito léxico del sitio de uso", () => {
    const method: SymbolRef = { file: "lib/widget.rb", symbolPath: ["Widget", "render"] };
    const ctx = makeCtx([{ ref: method, facts: sym({ name: "render", family: "function-like", memberOfClassLike: true, container: ["Widget"] }) }]);
    const c = candidate(
      "c",
      { file: "app/page.rb", ref: ref({ name: "render", role: "receiver-member", qualifier: "w", scope: ["Page", "show"] }) },
      [method],
    );
    expect(stage.decide(c, ctx)).toEqual({ outcome: "pass" });
  });
});

describe("etapa 8 — single-file-component", () => {
  const stage = stageById("single-file-component");

  it("prefiere targets no-.vue cuando hay al menos uno", () => {
    const vueT: SymbolRef = { file: "components/A.vue", symbolPath: ["setup"] };
    const jsT: SymbolRef = { file: "lib/setup.ts", symbolPath: ["setup"] };
    const c = candidate("c", { file: "x.ts", ref: ref({ name: "setup" }) }, [vueT, jsT]);
    const v = stage.decide(c, makeCtx([]));
    expect(v).toEqual({ outcome: "narrow", targets: [jsT] });
  });

  it("rechaza cuando más de SFC_FANOUT_CAP componentes .vue comparten el nombre y no hay alternativa", () => {
    const vueTargets: SymbolRef[] = [1, 2, 3, 4].map((n) => ({ file: `components/C${n}.vue`, symbolPath: ["setup"] }));
    const c = candidate("c", { file: "x.ts", ref: ref({ name: "setup" }) }, vueTargets);
    expect(stage.decide(c, makeCtx([])).outcome).toBe("reject");
  });

  it("deja pasar un puñado pequeño de declaraciones .vue-only", () => {
    const vueTargets: SymbolRef[] = [1, 2].map((n) => ({ file: `components/C${n}.vue`, symbolPath: ["setup"] }));
    const c = candidate("c", { file: "x.ts", ref: ref({ name: "setup" }) }, vueTargets);
    expect(stage.decide(c, makeCtx([]))).toEqual({ outcome: "pass" });
  });
});

describe("etapa 9 — module-reachability (B1, eslabón 2)", () => {
  const stage = stageById("module-reachability");

  it("pasa (no opina) cuando el archivo de origen no tiene NINGÚN import resuelto propio — el gate", () => {
    const near: SymbolRef = { file: "lib/a/near.rb", symbolPath: ["X"] };
    const far: SymbolRef = { file: "other/far.rb", symbolPath: ["X"] };
    const c = candidate("c", { file: "lib/a/site.rb", ref: ref({ name: "X" }) }, [near, far]);
    // Sin `imports` en `makeCtx` — mismo default que TODO el resto de esta
    // suite, y el caso real del Rails medido (imports = 4 en 466 archivos).
    expect(stage.decide(c, makeCtx([]))).toEqual({ outcome: "pass" });
  });

  it("acepta un target del MISMO archivo sin consultar el grafo de imports", () => {
    const same: SymbolRef = { file: "a.ts", symbolPath: ["X"] };
    const other: SymbolRef = { file: "b.ts", symbolPath: ["X"] };
    const c = candidate("c", { file: "a.ts", ref: ref({ name: "X" }) }, [same, other]);
    const ctx = makeCtx([], [{ from: "a.ts", to: "c.ts" }]); // origen tiene imports propios (gate abierto), pero a NINGUNO de los dos targets
    const v = stage.decide(c, ctx);
    expect(v).toEqual({ outcome: "narrow", targets: [same] });
  });

  it("conserva un target de OTRO archivo cuando hay un import directo, sin exigir exported", () => {
    const imported: SymbolRef = { file: "b.ts", symbolPath: ["X"] };
    const notImported: SymbolRef = { file: "c.ts", symbolPath: ["X"] };
    const ctx = makeCtx(
      [
        { ref: imported, facts: sym({ name: "X", exported: false }) }, // NO exportado — el import directo alcanza igual
        { ref: notImported, facts: sym({ name: "X", exported: true }) },
      ],
      [{ from: "a.ts", to: "b.ts" }],
    );
    const c = candidate("c", { file: "a.ts", ref: ref({ name: "X" }) }, [imported, notImported]);
    const v = stage.decide(c, ctx);
    expect(v).toEqual({ outcome: "narrow", targets: [imported] });
  });

  it("conserva un target reexportado transitivamente si está exportado, sin import directo", () => {
    const real: SymbolRef = { file: "deep/real.ts", symbolPath: ["X"] };
    const ctx = makeCtx(
      [{ ref: real, facts: sym({ name: "X", exported: true }) }],
      [
        { from: "a.ts", to: "index.ts" },
        { from: "index.ts", to: "deep/real.ts" },
      ],
    );
    const c = candidate("c", { file: "a.ts", ref: ref({ name: "X" }) }, [real]);
    const v = stage.decide(c, ctx);
    expect(v).toEqual({ outcome: "pass" }); // único target sobreviviente — mismo criterio que narrowedOrReject: pasa entero
  });

  it("NUNCA rechaza a cero — un único target alcanzable transitivamente pero NO exportado PASA (queda para global-uniqueness), no se rechaza", () => {
    // Regresión medida y corregida sobre el Rails real: un archivo con UN
    // solo import propio (gate abierto) no prueba que TODAS sus referencias
    // pasen por el grafo de imports — ver el docstring de la etapa.
    const real: SymbolRef = { file: "deep/real.ts", symbolPath: ["X"] };
    const ctx = makeCtx(
      [{ ref: real, facts: sym({ name: "X", exported: false }) }],
      [
        { from: "a.ts", to: "index.ts" },
        { from: "index.ts", to: "deep/real.ts" },
      ],
    );
    const c = candidate("c", { file: "a.ts", ref: ref({ name: "X" }) }, [real]);
    expect(stage.decide(c, ctx)).toEqual({ outcome: "pass" });
  });

  it("NUNCA rechaza a cero — un único target exportado pero fuera del cierre transitivo PASA igual", () => {
    const unrelated: SymbolRef = { file: "unrelated/far.ts", symbolPath: ["X"] };
    const ctx = makeCtx([{ ref: unrelated, facts: sym({ name: "X", exported: true }) }], [{ from: "a.ts", to: "b.ts" }]);
    const c = candidate("c", { file: "a.ts", ref: ref({ name: "X" }) }, [unrelated]);
    expect(stage.decide(c, ctx)).toEqual({ outcome: "pass" });
  });

  it("NUNCA rechaza a cero — con >1 targets y NINGUNO alcanzable, pasa el conjunto INTACTO (se lo deja a global-uniqueness/path-proximity, el caso real medido: dos scripts del mismo directorio que no se importan entre sí)", () => {
    const inSameDir: SymbolRef = { file: "scripts/extract_filter.rb", symbolPath: ["scraper"] };
    const alsoUnrelated: SymbolRef = { file: "scripts/other_unrelated.rb", symbolPath: ["scraper"] };
    const ctx = makeCtx(
      [
        { ref: inSameDir, facts: sym({ name: "scraper" }) },
        { ref: alsoUnrelated, facts: sym({ name: "scraper" }) },
      ],
      [{ from: "scripts/test_scraper.rb", to: "scripts/some_other_dependency.rb" }], // gate abierto, pero ninguno de los dos targets es ese archivo
    );
    const c = candidate("c", { file: "scripts/test_scraper.rb", ref: ref({ name: "scraper" }) }, [inSameDir, alsoUnrelated]);
    expect(stage.decide(c, ctx)).toEqual({ outcome: "pass" });
  });

  it("trata `exported` ausente como permisivo (true) — SymbolFacts foráneo/sintético, vía la rama transitiva", () => {
    const real: SymbolRef = { file: "deep/real.ts", symbolPath: ["X"] };
    const ctx = makeCtx(
      [{ ref: real, facts: sym({ name: "X" }) }], // sin `exported` — ver `sym()`, no lo setea por defecto
      [
        { from: "a.ts", to: "index.ts" },
        { from: "index.ts", to: "deep/real.ts" },
      ], // sin import DIRECTO de a.ts a deep/real.ts — fuerza la rama (b), exported+reachable
    );
    const c = candidate("c", { file: "a.ts", ref: ref({ name: "X" }) }, [real]);
    expect(stage.decide(c, ctx)).toEqual({ outcome: "pass" });
  });
});

describe("etapa 10 — typeless-receiver (P1, Ola P: `x.miembro(...)` deja de descartarse)", () => {
  const stage = stageById("typeless-receiver");
  const render: SymbolRef = { file: "lib/widget.rb", symbolPath: ["Widget", "render"] };
  const renderOther: SymbolRef = { file: "lib/panel.rb", symbolPath: ["Panel", "render"] };
  const renderFree: SymbolRef = { file: "lib/util.rb", symbolPath: ["render"] };
  const ctx = makeCtx([
    { ref: render, facts: sym({ name: "render", family: "function-like", memberOfClassLike: true, container: ["Widget"] }) },
    { ref: renderOther, facts: sym({ name: "render", family: "function-like", memberOfClassLike: true, container: ["Panel"] }) },
    { ref: renderFree, facts: sym({ name: "render", family: "function-like", memberOfClassLike: false, container: [] }) },
  ]);
  const site = (targets: readonly SymbolRef[]) =>
    candidate("c", { file: "app/page.rb", ref: ref({ name: "render", role: "receiver-member", qualifier: "w" }) }, targets);

  it("emite `ambiguous` incluso con UN SOLO destino vivo — un homónimo único no es 'dueño global único': el receptor puede ser de un tipo de afuera", () => {
    const v = stage.decide(site([render]), ctx);
    expect(v.outcome).toBe("ambiguous");
    if (v.outcome === "ambiguous") expect(v.targets).toEqual([render]);
  });

  it("con varios destinos, los enumera todos (van a `alternatives`)", () => {
    const v = stage.decide(site([render, renderOther]), ctx);
    expect(v.outcome).toBe("ambiguous");
    if (v.outcome === "ambiguous") expect(new Set(v.targets)).toEqual(new Set([render, renderOther]));
  });

  it("prefiere los destinos que SON miembros cuando los hay: un sitio con receptor explícito accede a un miembro", () => {
    const v = stage.decide(site([render, renderFree]), ctx);
    expect(v.outcome).toBe("ambiguous");
    if (v.outcome === "ambiguous") expect(v.targets).toEqual([render]);
  });

  it("NUNCA se apaga a cero: si NINGÚN destino es miembro, conserva el conjunto entero (la gramática puede no poblar `memberOfClassLike`)", () => {
    const v = stage.decide(site([renderFree]), ctx);
    expect(v.outcome).toBe("ambiguous");
    if (v.outcome === "ambiguous") expect(v.targets).toEqual([renderFree]);
  });

  it("no opina sobre un receptor constante desnuda (ya lo decidió bare-constant-receiver) ni sobre bare/qualified", () => {
    const bareConstant = candidate(
      "c",
      { file: "a.rb", ref: ref({ name: "render", role: "receiver-member", qualifier: "Widget", qualifierIsBareConstant: true }) },
      [render],
    );
    expect(stage.decide(bareConstant, ctx)).toEqual({ outcome: "pass" });
    for (const role of ["bare", "qualified"] as const) {
      const c = candidate("c", { file: "a.rb", ref: ref({ name: "render", role }) }, [render]);
      expect(stage.decide(c, ctx)).toEqual({ outcome: "pass" });
    }
  });
});

describe("integración — el veredicto terminal `ambiguous` de una etapa (P1)", () => {
  const render: SymbolRef = { file: "lib/widget.rb", symbolPath: ["Widget", "render"] };
  const renderOther: SymbolRef = { file: "lib/panel.rb", symbolPath: ["Panel", "render"] };
  const ctx = makeCtx([
    { ref: render, facts: sym({ name: "render", family: "function-like", memberOfClassLike: true, container: ["Widget"] }) },
    { ref: renderOther, facts: sym({ name: "render", family: "function-like", memberOfClassLike: true, container: ["Panel"] }) },
  ]);

  it("`x.render()` con dos homónimos produce UNA arista ambiguous con `alternatives`, rol receiver-member y resolvedBy typeless-receiver", () => {
    const c = candidate(
      "c1",
      { file: "app/page.rb", ref: ref({ name: "render", role: "receiver-member", qualifier: "w", scope: ["Page", "show"], occurrences: 4 }) },
      [render, renderOther],
    );
    const { edges, stats } = resolveReferences(ALL_STAGES, [c], ctx);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      from: "sym:app/page.rb#Page.show",
      // orden total determinista por (file, symbolPath) — `lib/panel.rb` < `lib/widget.rb`
      to: "sym:lib/panel.rb#Panel.render",
      kind: "references",
      provenance: "ambiguous",
      resolvedBy: "typeless-receiver",
      weight: 4,
      roles: EDGE_ROLE_RECEIVER_MEMBER,
      alternatives: ["sym:lib/widget.rb#Widget.render"],
    });
    expect(stats.droppedAmbiguous).toBe(1);
    expect(stats.ambiguousEdges).toBe(1);
    expect(stats.resolved).toBe(0);
    const stat = stats.byStage.find((s) => s.stage === "typeless-receiver")!;
    expect(stat.ambiguous).toBe(1);
  });

  it("con UN solo destino la arista sale igual, ambiguous y SIN `alternatives` (nunca `[]`)", () => {
    const c = candidate(
      "c1",
      { file: "app/page.rb", ref: ref({ name: "render", role: "receiver-member", qualifier: "w", scope: ["Page", "show"] }) },
      [render],
    );
    const { edges } = resolveReferences(ALL_STAGES, [c], ctx);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.provenance).toBe("ambiguous");
    expect(edges[0]!.to).toBe("sym:lib/widget.rb#Widget.render");
    expect(edges[0]).not.toHaveProperty("alternatives");
  });

  it("el terminal `ambiguous` de una etapa SÍ queda atribuido a esa etapa en el trace (a diferencia del ambiguous por descarte)", () => {
    const c = candidate(
      "c1",
      { file: "app/page.rb", ref: ref({ name: "render", role: "receiver-member", qualifier: "w" }) },
      [render, renderOther],
    );
    const traces: { final: string; finalStage: string | null }[] = [];
    resolveReferences(ALL_STAGES, [c], ctx, { trace: (t) => traces.push({ final: t.final, finalStage: t.finalStage }) });
    expect(traces).toEqual([{ final: "ambiguous", finalStage: "typeless-receiver" }]);
  });

  /**
   * REGRESIÓN MEDIDA Y CORREGIDA EN LA MISMA OLA (P1). El colapso de aristas
   * paralelas se quedaba con la provenance del PRIMER candidato que llegaba a
   * la clave `from|to|kind`. Mientras `receiver-member` nunca producía arista
   * eso no se notaba; con `typeless-receiver` emitiendo, un mismo par
   * `(contenedor, símbolo)` puede recibir una arista FIRME (llamada desnuda
   * resuelta) y una AMBIGUA (`x.foo()` del mismo contenedor al mismo destino),
   * y si la ambigua llegaba primero la firme desaparecía. Efecto medido sobre
   * el corpus: explicaba TODO el aumento de `unused-symbol` en csharp
   * (46 → 188 de volumen), python (48 → 74) y javascript (21 → 34), porque
   * `edgeIsAmbiguous` deja esas aristas fuera del fan-in.
   */
  it("una ambigua NO degrada a una firme del mismo (from,to,kind), llegue en el orden que llegue — y `alternatives` no sobrevive a una arista firme", () => {
    const ctxUno = makeCtx([{ ref: render, facts: sym({ name: "render", family: "function-like", memberOfClassLike: true, container: ["Widget"] }) }]);
    const ambigua = candidate(
      "amb",
      { file: "lib/widget.rb", ref: ref({ name: "render", role: "receiver-member", qualifier: "w", scope: ["Widget", "draw"], occurrences: 2 }) },
      [render],
    );
    const firme = candidate(
      "firme",
      { file: "lib/widget.rb", ref: ref({ name: "render", role: "bare", scope: ["Widget", "draw"], occurrences: 5 }) },
      [render],
    );
    for (const orden of [[ambigua, firme], [firme, ambigua]]) {
      const { edges } = resolveReferences(ALL_STAGES, orden, ctxUno);
      expect(edges).toHaveLength(1);
      expect(edges[0]!.provenance, `orden ${orden.map((c) => c.id).join(",")}`).toBe("resolved");
      expect(edges[0]!.resolvedBy).toBe("global-uniqueness");
      // La ocurrencia ambigua se descarta ENTERA: no aporta peso…
      expect(edges[0]!.weight).toBe(5);
      // …ni presta su bit de rol. Éste es el que importa: `unused-symbol` lee
      // `receiver-member` sobre aristas firmes para decidir si en un lenguaje
      // puede medir el uso de un miembro, y un uso que la cascada sólo VIO no
      // puede firmar esa afirmación.
      expect(edges[0]!.roles).toBe(EDGE_ROLE_BARE);
      expect(edges[0]).not.toHaveProperty("alternatives");
    }
  });

  it("dos ambiguas del mismo par SIGUEN siendo ambiguas y unen sus `alternatives`", () => {
    const c1 = candidate(
      "a1",
      { file: "app/page.rb", ref: ref({ name: "render", role: "receiver-member", qualifier: "w", scope: ["Page", "show"] }) },
      [render, renderOther],
    );
    const c2 = candidate(
      "a2",
      { file: "app/page.rb", ref: ref({ name: "render", role: "receiver-member", qualifier: "z", scope: ["Page", "show"] }) },
      [render, renderOther],
    );
    const { edges } = resolveReferences(ALL_STAGES, [c1, c2], ctx);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.provenance).toBe("ambiguous");
    expect(edges[0]!.alternatives).toEqual(["sym:lib/widget.rb#Widget.render"]);
  });

  it("por encima de AMBIGUOUS_MAX_TARGETS no se emite arista: se cuenta en ambiguousOverflow (§4.2)", () => {
    const many: SymbolRef[] = [];
    const entries: { ref: SymbolRef; facts: SymbolFacts }[] = [];
    for (let i = 0; i < AMBIGUOUS_MAX_TARGETS + 1; i++) {
      const r: SymbolRef = { file: `lib/c${i}.rb`, symbolPath: [`C${i}`, "render"] };
      many.push(r);
      entries.push({ ref: r, facts: sym({ name: "render", family: "function-like", memberOfClassLike: true, container: [`C${i}`] }) });
    }
    const manyCtx = makeCtx(entries);
    const c = candidate("c1", { file: "app/page.rb", ref: ref({ name: "render", role: "receiver-member", qualifier: "w" }) }, many);
    const { edges, stats } = resolveReferences(ALL_STAGES, [c], manyCtx);
    expect(edges).toHaveLength(0);
    expect(stats.ambiguousOverflow).toBe(1);
    expect(stats.droppedAmbiguous).toBe(1);
  });
});

describe("etapa 11 — global-uniqueness", () => {
  const stage = stageById("global-uniqueness");
  it("acepta cuando queda exactamente un target", () => {
    const t: SymbolRef = { file: "b.rb", symbolPath: ["X"] };
    const c = candidate("c", { file: "a.rb", ref: ref({ name: "X" }) }, [t]);
    const v = stage.decide(c, makeCtx([]));
    expect(v).toEqual({ outcome: "accept", target: t, provenance: "resolved" });
  });
  it("pasa (no rechaza) cuando quedan >1 — se lo deja a path-proximity", () => {
    const c = candidate(
      "c",
      { file: "a.rb", ref: ref({ name: "X" }) },
      [{ file: "b.rb", symbolPath: ["X"] }, { file: "c.rb", symbolPath: ["X"] }],
    );
    expect(stage.decide(c, makeCtx([]))).toEqual({ outcome: "pass" });
  });
});

describe("etapa 12 — path-proximity", () => {
  const stage = stageById("path-proximity");
  it("acepta el target de directorio más cercano cuando hay un ganador único", () => {
    const near: SymbolRef = { file: "lib/a/near.rb", symbolPath: ["X"] };
    const far: SymbolRef = { file: "other/far.rb", symbolPath: ["X"] };
    const c = candidate("c", { file: "lib/a/site.rb", ref: ref({ name: "X" }) }, [near, far]);
    const v = stage.decide(c, makeCtx([]));
    expect(v.outcome).toBe("accept");
    if (v.outcome === "accept") {
      expect(v.target).toEqual(near);
      expect(v.provenance).toBe("inferred");
    }
  });
  it("no decide en un empate de distancia", () => {
    const t1: SymbolRef = { file: "a/x.rb", symbolPath: ["X"] };
    const t2: SymbolRef = { file: "b/x.rb", symbolPath: ["X"] };
    const c = candidate("c", { file: "z/site.rb", ref: ref({ name: "X" }) }, [t1, t2]);
    expect(stage.decide(c, makeCtx([]))).toEqual({ outcome: "pass" });
  });
});

describe("integración — cada arista lleva provenance y la etapa que la resolvió", () => {
  it("PathManager.join produce una arista references con resolvedBy bare-constant-receiver", () => {
    const target: SymbolRef = { file: "path_manager.rb", symbolPath: ["PathManager", "join"] };
    const ctx = makeCtx([
      { ref: target, facts: sym({ name: "join", family: "function-like", memberOfClassLike: true, container: ["PathManager"] }) },
    ]);
    const c = candidate(
      "c1",
      { file: "a.rb", ref: ref({ name: "join", role: "receiver-member", qualifier: "PathManager", qualifierIsBareConstant: true, occurrences: 3 }) },
      [target],
    );
    const { edges } = resolveReferences(ALL_STAGES, [c], ctx);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      from: "file:a.rb",
      to: "sym:path_manager.rb#PathManager.join",
      kind: "references",
      provenance: "resolved",
      resolvedBy: "bare-constant-receiver",
      weight: 3,
      roles: EDGE_ROLE_RECEIVER_MEMBER,
    });
  });

  it("aristas paralelas al mismo destino colapsan sumando weight", () => {
    const target: SymbolRef = { file: "b.rb", symbolPath: ["Widget"] };
    const ctx = makeCtx([{ ref: target, facts: sym({ name: "Widget" }) }]);
    const c1 = candidate("c1", { file: "a.rb", ref: ref({ name: "Widget", occurrences: 2 }) }, [target]);
    const c2 = candidate(
      "c2",
      { file: "a.rb", ref: ref({ name: "Widget", role: "qualified", qualifier: "Ns", occurrences: 5 }) },
      [target],
    );
    const { edges } = resolveReferences(ALL_STAGES, [c1, c2], ctx);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.weight).toBe(7);
  });
});

describe("CONTRATO-F8G.md §1 — el rol sintáctico llega a la arista (`roles`, máscara de bits)", () => {
  it("bare -> EDGE_ROLE_BARE", () => {
    const target: SymbolRef = { file: "b.rb", symbolPath: ["X"] };
    const ctx = makeCtx([{ ref: target, facts: sym({ name: "X" }) }]);
    const c = candidate("c", { file: "a.rb", ref: ref({ name: "X", role: "bare" }) }, [target]);
    const { edges } = resolveReferences(ALL_STAGES, [c], ctx);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.roles).toBe(EDGE_ROLE_BARE);
  });

  it("qualified -> EDGE_ROLE_QUALIFIED", () => {
    const target: SymbolRef = { file: "jekyll/errors.rb", symbolPath: ["Jekyll", "Errors", "FatalException"] };
    const ctx = makeCtx([{ ref: target, facts: sym({ name: "FatalException", family: "class-like", container: ["Jekyll", "Errors"] }) }]);
    const c = candidate(
      "c",
      { file: "jekyll/site.rb", ref: ref({ name: "FatalException", role: "qualified", scope: ["Jekyll"], qualifier: "Errors" }) },
      [target],
    );
    const { edges } = resolveReferences(ALL_STAGES, [c], ctx);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.roles).toBe(EDGE_ROLE_QUALIFIED);
  });

  it("receiver-member (vía bare-constant-receiver) -> EDGE_ROLE_RECEIVER_MEMBER", () => {
    const target: SymbolRef = { file: "path_manager.rb", symbolPath: ["PathManager", "join"] };
    const ctx = makeCtx([
      { ref: target, facts: sym({ name: "join", family: "function-like", memberOfClassLike: true, container: ["PathManager"] }) },
    ]);
    const c = candidate(
      "c",
      { file: "a.rb", ref: ref({ name: "join", role: "receiver-member", qualifier: "PathManager", qualifierIsBareConstant: true }) },
      [target],
    );
    const { edges } = resolveReferences(ALL_STAGES, [c], ctx);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.roles).toBe(EDGE_ROLE_RECEIVER_MEMBER);
  });

  it("dos candidatos de distinto rol resolviendo al MISMO (from,to,kind) fusionan `roles` con OR — el conteo de aristas no cambia (§1.2)", () => {
    const target: SymbolRef = { file: "b.rb", symbolPath: ["Widget"] };
    const ctx = makeCtx([{ ref: target, facts: sym({ name: "Widget" }) }]);
    const c1 = candidate("c1", { file: "a.rb", ref: ref({ name: "Widget", role: "bare" }) }, [target]);
    const c2 = candidate("c2", { file: "a.rb", ref: ref({ name: "Widget", role: "qualified", qualifier: "Ns" }) }, [target]);
    const { edges } = resolveReferences(ALL_STAGES, [c1, c2], ctx);
    expect(edges).toHaveLength(1); // sigue colapsando en UNA arista, no dos — la clave sigue siendo from|to|kind
    expect(edges[0]!.roles).toBe(EDGE_ROLE_BARE | EDGE_ROLE_QUALIFIED);
    expect(edges[0]!.weight).toBe(2); // el peso sigue sumando, sin relación con la máscara de roles
  });

  it("no hay evidencia de rol (kind sin `roles`) para un candidato cuyo rol nunca llega a `accept` en la práctica — no aplica acá; ver el mapeo declarado a nivel de tipo en `resolve.ts`", () => {
    // syntacticRoleStage rechaza key/parameter y receiver-member no-constante
    // ANTES de que exista arista (ver etapa 1 arriba) — por diseño, `accept`
    // sólo ve bare/qualified/receiver-member(constante), los 3 de `EdgeRole`.
    // Este test documenta esa garantía en un solo lugar: cero candidatos con
    // rol fuera de `EdgeRole` producen una arista en absoluto.
    const target: SymbolRef = { file: "b.rb", symbolPath: ["x"] };
    const ctx = makeCtx([{ ref: target, facts: sym({ name: "x" }) }]);
    for (const role of ["key", "parameter"] as const) {
      const c = candidate("c", { file: "a.rb", ref: ref({ name: "x", role }) }, [target]);
      const { edges } = resolveReferences(ALL_STAGES, [c], ctx);
      expect(edges).toHaveLength(0);
    }
  });
});

/**
 * AA6 (Ola AA) — `type-slot`. Cada caso verifica una INTENCIÓN, no una forma:
 * "un nombre escrito donde la gramática pone un TIPO no denota una función".
 * El caso testigo es el que Z5 juzgó a mano seis veces en sqlalchemy: la
 * anotación `Any` (de `typing`, fuera del repo) resuelta contra la FUNCIÓN
 * real `def Any(...)` de `postgresql/array.py`.
 */
describe("type-slot (AA6) — lo escrito en la ranura de tipo no es una función", () => {
  const anyFn: SymbolRef = { file: "lib/dialects/postgresql/array.py", symbolPath: ["Any"] };
  const anyClass: SymbolRef = { file: "lib/tipos.py", symbolPath: ["Any"] };

  it("EL CASO TESTIGO: la anotación cuyo único homónimo del repo es una función se RECHAZA — no se inventa una arista a esa función", () => {
    const ctx = makeCtx([{ ref: anyFn, facts: sym({ name: "Any", family: "function-like", nodeType: "function_definition" }) }]);
    const c = candidate("c1", { file: "lib/engine/reflection.py", ref: ref({ name: "Any", inTypeSlot: true }) }, [anyFn]);
    const { edges } = resolveReferences(ALL_STAGES, [c], ctx);
    expect(edges).toHaveLength(0);
    expect(stageById("type-slot").decide(c, ctx).outcome).toBe("reject");
  });

  it("el MISMO nombre, en la MISMA posición del repo, pero FUERA de la ranura de tipo resuelve como siempre", () => {
    const ctx = makeCtx([{ ref: anyFn, facts: sym({ name: "Any", family: "function-like", nodeType: "function_definition" }) }]);
    const c = candidate("c2", { file: "lib/engine/reflection.py", ref: ref({ name: "Any", inTypeSlot: false }) }, [anyFn]);
    const { edges } = resolveReferences(ALL_STAGES, [c], ctx);
    expect(edges).toHaveLength(1);
    expect(edges[0]?.to).toBe("sym:lib/dialects/postgresql/array.py#Any");
  });

  it("con un homónimo TIPO y otro FUNCIÓN, narrowea al tipo en vez de rechazar — y `global-uniqueness` lo acepta", () => {
    const ctx = makeCtx([
      { ref: anyFn, facts: sym({ name: "Any", family: "function-like", nodeType: "function_definition" }) },
      { ref: anyClass, facts: sym({ name: "Any", family: "class-like", nodeType: "class_definition" }) },
    ]);
    const c = candidate("c3", { file: "lib/engine/reflection.py", ref: ref({ name: "Any", inTypeSlot: true }) }, [anyFn, anyClass]);
    const v = stageById("type-slot").decide(c, ctx);
    expect(v.outcome).toBe("narrow");
    const { edges } = resolveReferences(ALL_STAGES, [c], ctx);
    expect(edges).toHaveLength(1);
    expect(edges[0]?.to).toBe("sym:lib/tipos.py#Any");
  });

  it("NO exige que el destino sea class-like: un alias/variable de tipo (`V = TypeVar('V')`, family `other`) sobrevive", () => {
    const v: SymbolRef = { file: "src/click/core.py", symbolPath: ["V"] };
    const ctx = makeCtx([{ ref: v, facts: sym({ name: "V", family: "other", nodeType: "assignment" }) }]);
    const c = candidate("c4", { file: "src/click/core.py", ref: ref({ name: "V", inTypeSlot: true, scope: ["Context", "invoke"] }) }, [v]);
    expect(stageById("type-slot").decide(c, ctx).outcome).toBe("pass");
    expect(resolveReferences(ALL_STAGES, [c], ctx).edges).toHaveLength(1);
  });

  it("`inTypeSlot` AUSENTE se comporta exactamente como antes de esta etapa (una fila de hechos vieja o armada a mano)", () => {
    const ctx = makeCtx([{ ref: anyFn, facts: sym({ name: "Any", family: "function-like", nodeType: "function_definition" }) }]);
    const c = candidate("c5", { file: "lib/engine/reflection.py", ref: ref({ name: "Any" }) }, [anyFn]);
    expect(stageById("type-slot").decide(c, ctx).outcome).toBe("pass");
    expect(resolveReferences(ALL_STAGES, [c], ctx).edges).toHaveLength(1);
  });

  it("un destino sin `SymbolFacts` en el índice NO se descarta (el default es permisivo, nunca un `no` inventado)", () => {
    const huerfano: SymbolRef = { file: "lib/x.py", symbolPath: ["Cosa"] };
    const ctx = makeCtx([]);
    const c = candidate("c6", { file: "lib/y.py", ref: ref({ name: "Cosa", inTypeSlot: true }) }, [huerfano]);
    expect(stageById("type-slot").decide(c, ctx).outcome).toBe("pass");
  });
});
