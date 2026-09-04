import { describe, expect, it } from "vitest";

import { buildDuplicationFindings, describirCopias, detector, duplicationGroupKey } from "./duplication.js";
import { bucketFindings } from "../grouping.js";
import { testContext } from "../testing.js";
import type { CloneCandidate, Finding, RepoUnit } from "../types.js";
import type { CodeGraph } from "../../graph/types.js";

/**
 * `inter-file`, sin árboles: los `CloneCandidate`s ya vienen calculados
 * (fingerprint + rango), así que este test no necesita tree-sitter en
 * absoluto — construye la entrada a mano, igual que `run.test.ts` hace para
 * el runner. Por la misma razón, "≥3 lenguajes que emiten" no aplica acá:
 * `duplication` no clasifica por lenguaje (`ctx.language` es el centinela
 * `"*"` en producción — ver `run.ts`), agrupa clones de cualquier origen por
 * fingerprint estructural.
 */
function clone(overrides: Partial<CloneCandidate> & Pick<CloneCandidate, "fingerprint" | "file" | "startLine" | "endLine">): CloneCandidate {
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

function repoWith(clones: readonly CloneCandidate[]): RepoUnit {
  return { repoName: "test", files: [], functions: [], clones, graph: null };
}

/** Atajo: los dos thresholds que `buildDuplicationFindings` pide desde Ola N/A4b. */
function thresholdsFor() {
  const ctx = testContext(detector, "*");
  return {
    minCopies: ctx.threshold("minCopies"),
    minDensity: ctx.threshold("minDensity"),
    minCodeLines: ctx.threshold("minCodeLines"),
  };
}

describe("duplication", () => {
  it("dos copias con texto idéntico son un hallazgo con 2 locations con rol", async () => {
    const clones = [
      clone({ fingerprint: "f1", file: "a.ts", startLine: 1, endLine: 10, normalized: "same" }),
      clone({ fingerprint: "f1", file: "b.ts", startLine: 20, endLine: 29, normalized: "same" }),
    ];
    const { minCopies, minDensity, minCodeLines } = thresholdsFor();
    const findings = buildDuplicationFindings(clones, minCopies, minDensity, null, minCodeLines);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(2);
    expect(findings[0]!.locations).toHaveLength(2);
    expect(findings[0]!.locations[0]!.role).toBe("primera copia");
    expect(findings[0]!.locations[1]!.role).toBe("copia #2");
    expect(findings[0]!.title).toContain("idénticos");
  });

  it("dos copias de igual estructura pero texto distinto se reportan como 'de igual estructura', no 'idénticos'", async () => {
    const clones = [
      clone({ fingerprint: "f2", file: "a.ts", startLine: 1, endLine: 10, normalized: "shape A" }),
      clone({ fingerprint: "f2", file: "b.ts", startLine: 20, endLine: 29, normalized: "shape B" }),
    ];
    const { minCopies, minDensity, minCodeLines } = thresholdsFor();
    const findings = buildDuplicationFindings(clones, minCopies, minDensity, null, minCodeLines);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toContain("igual estructura");
  });

  it("control negativo: una única ocurrencia de un fingerprint no es duplicación", async () => {
    const clones = [clone({ fingerprint: "solo", file: "a.ts", startLine: 1, endLine: 10 })];
    const { minCopies, minDensity, minCodeLines } = thresholdsFor();
    const findings = buildDuplicationFindings(clones, minCopies, minDensity, null, minCodeLines);
    expect(findings).toHaveLength(0);
  });

  it("un clon anidado dentro de otro ya reportado (más grande) no genera un segundo hallazgo", async () => {
    const outer = [
      clone({ fingerprint: "outer", file: "a.ts", startLine: 1, endLine: 50, nodes: 200 }),
      clone({ fingerprint: "outer", file: "b.ts", startLine: 1, endLine: 50, nodes: 200 }),
    ];
    // Anidado DENTRO del rango de `a.ts` de arriba, con menos nodos: debería
    // quedar cubierto por el grupo `outer` y no aparecer como hallazgo propio.
    const inner = [
      clone({ fingerprint: "inner", file: "a.ts", startLine: 5, endLine: 15, nodes: 40 }),
      clone({ fingerprint: "inner", file: "b.ts", startLine: 5, endLine: 15, nodes: 40 }),
    ];
    const { minCopies, minDensity, minCodeLines } = thresholdsFor();
    const findings = buildDuplicationFindings([...outer, ...inner], minCopies, minDensity, null, minCodeLines);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(2);
  });

  it("el borde del umbral (presencia, R3: binario por definición del hallazgo) se pide a testContext: 1 copia no dispara, 2 sí", async () => {
    const { minCopies, minDensity, minCodeLines } = thresholdsFor();
    expect(minCopies.kind).toBe("presencia");
    expect(minCopies.value).toBe(1);

    const one = buildDuplicationFindings(
      [clone({ fingerprint: "f", file: "a.ts", startLine: 1, endLine: 10 })],
      minCopies,
      minDensity,
      null,
      minCodeLines,
    );
    expect(one).toHaveLength(0);

    const two = buildDuplicationFindings(
      [
        clone({ fingerprint: "f", file: "a.ts", startLine: 1, endLine: 10 }),
        clone({ fingerprint: "f", file: "b.ts", startLine: 1, endLine: 10 }),
      ],
      minCopies,
      minDensity,
      null,
      minCodeLines,
    );
    expect(two).toHaveLength(1);
  });

  it("detector.run adapta un RepoUnit real, delegando en la misma función pura", async () => {
    const repo = repoWith([
      clone({ fingerprint: "f", file: "a.ts", startLine: 1, endLine: 10 }),
      clone({ fingerprint: "f", file: "b.ts", startLine: 1, endLine: 10 }),
    ]);
    const ctx = testContext(detector, "*");
    const findings = detector.run(repo, ctx);
    expect(findings).toHaveLength(1);
  });

  describe("árbol espejo (paquete ESPEJO-DUPLICACION)", () => {
    it("un par gemelo (mismo sufijo de ruta, fingerprints casi idénticos) no infla el conteo de copias: 2 fragmentos compartidos por el par cuentan como 1 grupo de 2, no de 4", () => {
      const a = "guava/src/com/google/common/collect/Foo.java";
      const b = "android/guava/src/com/google/common/collect/Foo.java";
      // 5 fingerprints compartidos por el par gemelo: establece (a,b) como
      // gemelos para `detectMirrorTrees` (piso: >=3 compartidos, ratio >=0.5).
      const mirrorFingerprints = [0, 1, 2, 3, 4].flatMap((i) => [
        clone({ fingerprint: `shape${i}`, file: a, startLine: i * 10 + 1, endLine: i * 10 + 8, nodes: 30 }),
        clone({ fingerprint: `shape${i}`, file: b, startLine: i * 10 + 1, endLine: i * 10 + 8, nodes: 30 }),
      ]);
      const { minCopies, minDensity, minCodeLines } = thresholdsFor();
      const findings = buildDuplicationFindings(mirrorFingerprints, minCopies, minDensity, null, minCodeLines);
      // Sin colapso de árbol espejo: 5 grupos de 2 copias cada uno. Con
      // colapso: cada fingerprint queda con 1 sola copia real (la del par
      // gemelo colapsado a una), por debajo del piso de 2 — ningún hallazgo.
      expect(findings).toHaveLength(0);
    });

    it("duplicación GENUINA entre un archivo del par gemelo y un TERCERO, sin relación, sigue reportándose (no se pierde detección)", () => {
      const a = "guava/src/com/google/common/collect/Foo.java";
      const b = "android/guava/src/com/google/common/collect/Foo.java";
      const other = "guava/src/com/google/common/collect/Unrelated.java";
      // Establece el par gemelo con 4 fingerprints propios del par.
      const mirrorOnly = [0, 1, 2, 3].flatMap((i) => [
        clone({ fingerprint: `mirror${i}`, file: a, startLine: i * 10 + 1, endLine: i * 10 + 8, nodes: 30 }),
        clone({ fingerprint: `mirror${i}`, file: b, startLine: i * 10 + 1, endLine: i * 10 + 8, nodes: 30 }),
      ]);
      // Un fingerprint genuinamente duplicado en 3 lugares: `a`, `b` (el
      // par gemelo) y `other` (sin relación con el par). `nodes: 40` (no
      // 25) para no cruzar, sin querer, el piso de densidad de A4b (3.0
      // nodos/línea) que este test no busca ejercitar.
      const genuine = [
        clone({ fingerprint: "genuine", file: a, startLine: 200, endLine: 210, nodes: 40 }),
        clone({ fingerprint: "genuine", file: b, startLine: 200, endLine: 210, nodes: 40 }),
        clone({ fingerprint: "genuine", file: other, startLine: 1, endLine: 10, nodes: 40 }),
      ];
      const { minCopies, minDensity, minCodeLines } = thresholdsFor();
      const findings = buildDuplicationFindings([...mirrorOnly, ...genuine], minCopies, minDensity, null, minCodeLines);
      const genuineFinding = findings.find((f) => f.locations.some((l) => l.file === other));
      expect(genuineFinding).toBeDefined();
      // El par gemelo colapsa a 1 + `other` = 2 copias reales, no 3.
      expect(genuineFinding!.trigger[0]!.value).toBe(2);
    });
  });

  describe("Ola N, frente A4b — formas que no son duplicación de conocimiento", () => {
    it("densidad baja (comentario, no código: ListenableFuture.java medido) no genera hallazgo", () => {
      const clones = [
        clone({ fingerprint: "f1", file: "a.java", startLine: 120, endLine: 158, nodes: 57 }), // 1.46 nodos/línea
        clone({ fingerprint: "f1", file: "b.java", startLine: 120, endLine: 158, nodes: 57 }),
      ];
      const { minCopies, minDensity, minCodeLines } = thresholdsFor();
      const findings = buildDuplicationFindings(clones, minCopies, minDensity, null, minCodeLines);
      expect(findings).toHaveLength(0);
    });

    it("familia de contrato (clases hermanas que implementan el MISMO símbolo del grafo) no genera hallazgo", () => {
      const clones = [
        clone({ fingerprint: "f1", file: "a.java", startLine: 1, endLine: 10, className: "BuilderAddListGenerator" }),
        clone({ fingerprint: "f1", file: "b.java", startLine: 1, endLine: 10, className: "BuilderAddAllListGenerator" }),
      ];
      const graph: CodeGraph = {
        nodes: [
          { id: "sym:a.java#BuilderAddListGenerator", kind: "symbol", file: "a.java", symbolPath: ["BuilderAddListGenerator"], family: "class-like" },
          { id: "sym:b.java#BuilderAddAllListGenerator", kind: "symbol", file: "b.java", symbolPath: ["BuilderAddAllListGenerator"], family: "class-like" },
        ],
        edges: [
          { from: "sym:a.java#BuilderAddListGenerator", to: "sym:base#TestStringListGenerator", kind: "extends", provenance: "declared", weight: 1 },
          { from: "sym:b.java#BuilderAddAllListGenerator", to: "sym:base#TestStringListGenerator", kind: "extends", provenance: "declared", weight: 1 },
        ],
        resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
      };
      const { minCopies, minDensity, minCodeLines } = thresholdsFor();
      expect(buildDuplicationFindings(clones, minCopies, minDensity, null, minCodeLines)).toHaveLength(1); // sin grafo: sigue reportando
      expect(buildDuplicationFindings(clones, minCopies, minDensity, graph, minCodeLines)).toHaveLength(0); // con grafo: familia de contrato, se suprime
    });

    it("par simétrico (Min/Max: única diferencia es el propio nombre dentro del cuerpo) no genera hallazgo", () => {
      const body = (name: string) => `int ${name}(int a, int b) { return Math.${name}(a, b); }`;
      const clones = [
        clone({ fingerprint: "f1", file: "a.cs", startLine: 1, endLine: 10, functionName: "Min", normalized: body("Min") }),
        clone({ fingerprint: "f1", file: "a.cs", startLine: 12, endLine: 21, functionName: "Max", normalized: body("Max") }),
      ];
      const { minCopies, minDensity, minCodeLines } = thresholdsFor();
      const findings = buildDuplicationFindings(clones, minCopies, minDensity, null, minCodeLines);
      expect(findings).toHaveLength(0);
    });
  });

  /**
   * OLA P, FRENTE P10. Los dos cambios de este frente, y por qué se prueban
   * juntos: los 39 `dudoso` de este kind (más que sus 22 `verdadero` y sus 14
   * `falso` sumados) no son un error de criterio sino de EXPLICACIÓN, y el
   * volumen inflado no es un hallazgo de más sino una unión de archivos que no
   * corresponde a ningún miembro del grupo.
   */
  describe("Ola P, frente P10 — la evidencia y la agrupación", () => {
    /**
     * Un `Finding` de `duplication` ya identificado (o sea, tal como
     * `grouping.ts` lo recibe), armado sólo con lo que la agrupación mira: el
     * conjunto de archivos que tocan sus copias.
     */
    function hallazgo(id: string, archivos: readonly [string, ...string[]]): Finding {
      const [primero, ...resto] = archivos;
      return {
        id,
        detectorId: "duplication",
        kind: "duplication",
        scope: "inter-file",
        language: null,
        title: "2 fragmentos idénticos de 6 líneas",
        detail: "d",
        trigger: [{ label: "copias", value: archivos.length, threshold: thresholdsFor().minCopies }],
        locations: [
          { file: primero, startLine: 1, endLine: 6, role: "primera copia" },
          ...resto.map((f, i) => ({ file: f, startLine: 1, endLine: 6, role: `copia #${i + 2}` })),
        ],
        severity: 10,
        advice: { primary: { name: "Extract Method", kind: "refactorizacion", why: "w", source: "s" } },
      };
    }

    it("el detalle nombra TODAS las copias con archivo, rango de líneas y símbolo contenedor", () => {
      // `normalized` distinto a propósito: dos cuerpos que difieren en algo
      // más que el propio nombre, para no caer en el filtro de par simétrico
      // de A4b (`isSymmetricNamePair`), que no es lo que este test ejercita.
      const clones = [
        clone({ fingerprint: "f1", file: "a.rb", startLine: 57, endLine: 66, className: "GemFilename", functionName: "register_gemfile_offense", normalized: "cuerpo con MSG_A" }),
        clone({ fingerprint: "f1", file: "a.rb", startLine: 78, endLine: 87, className: "GemFilename", functionName: "register_gems_rb_offense", normalized: "cuerpo con MSG_B" }),
      ];
      const { minCopies, minDensity, minCodeLines } = thresholdsFor();
      const [finding] = buildDuplicationFindings(clones, minCopies, minDensity, null, minCodeLines);
      expect(finding).toBeDefined();
      expect(finding!.detail).toContain("a.rb:57-66 (GemFilename.register_gemfile_offense)");
      expect(finding!.detail).toContain("a.rb:78-87 (GemFilename.register_gems_rb_offense)");
    });

    it("el TÍTULO no cambia: es la clave con la que se reconcilian los veredictos humanos ya emitidos", () => {
      const clones = [
        clone({ fingerprint: "f1", file: "a.ts", startLine: 1, endLine: 10, normalized: "same", functionName: "render" }),
        clone({ fingerprint: "f1", file: "b.ts", startLine: 1, endLine: 10, normalized: "same", functionName: "render" }),
      ];
      const { minCopies, minDensity, minCodeLines } = thresholdsFor();
      const [finding] = buildDuplicationFindings(clones, minCopies, minDensity, null, minCodeLines);
      expect(finding!.title).toBe("2 fragmentos idénticos de 10 líneas");
    });

    it("una copia que no cae dentro de ningún símbolo con nombre se describe sin inventar uno", () => {
      const suelto = clone({ fingerprint: "f", file: "a.ts", startLine: 3, endLine: 9 });
      expect(describirCopias([suelto])).toBe("a.ts:3-9");
    });

    /**
     * MEDIDO, no supuesto: sobre preact, los cinco fragmentos de
     * `debug/src/debug.js:377-415` llegan con `functionName` = el centinela
     * entre paréntesis que `code-analyzer.ts` usa para una función anónima.
     * Sin esta prueba el detalle decía `debug.js:377-383 ((anónima))`.
     */
    it("el centinela entre paréntesis de una función anónima no se imprime como si fuera un nombre", () => {
      const anonima = clone({ fingerprint: "f", file: "a.js", startLine: 3, endLine: 9, functionName: "(anónima)" });
      expect(describirCopias([anonima])).toBe("a.js:3-9");
      const conClase = clone({ fingerprint: "f", file: "a.js", startLine: 3, endLine: 9, className: "Fachada", functionName: "(anónima)" });
      expect(describirCopias([conClase])).toBe("a.js:3-9 (Fachada)");
    });

    it("más de 6 copias: nombra 6 y resume el resto sin perder la magnitud", () => {
      const muchas = Array.from({ length: 9 }, (_, i) =>
        clone({ fingerprint: "f", file: `f${i}.ts`, startLine: 1, endLine: 5 }),
      );
      const texto = describirCopias(muchas);
      expect(texto).toContain("f5.ts:1-5");
      expect(texto).not.toContain("f6.ts");
      expect(texto).toContain("y 3 más");
    });

    it("el rol de cada ubicación nombra su símbolo contenedor cuando existe, y el orden cuando no", () => {
      const clones = [
        clone({ fingerprint: "f1", file: "a.ts", startLine: 1, endLine: 10, functionName: "primero" }),
        clone({ fingerprint: "f1", file: "b.ts", startLine: 1, endLine: 10 }),
      ];
      const { minCopies, minDensity, minCodeLines } = thresholdsFor();
      const [finding] = buildDuplicationFindings(clones, minCopies, minDensity, null, minCodeLines);
      expect(finding!.locations[0]!.role).toBe("primera copia — primero");
      expect(finding!.locations[1]!.role).toBe("copia #2");
    });

    it("groupKey: dos clases de clon entre los MISMOS archivos son el mismo problema, aunque el recorrido las traiga en orden distinto", () => {
      const uno = duplicationGroupKey(hallazgo("f1", ["a.ts", "b.ts"]));
      const dos = duplicationGroupKey(hallazgo("f2", ["b.ts", "a.ts"]));
      expect(uno).toBe(dos);
    });

    it("groupKey: dos clases de clon que tocan conjuntos DISTINTOS de archivos no se mezclan", () => {
      expect(duplicationGroupKey(hallazgo("f1", ["a.ts", "b.ts"]))).not.toBe(
        duplicationGroupKey(hallazgo("f2", ["a.ts", "c.ts"])),
      );
    });

    it("el detector DECLARA el Nivel 1 (si esto se cae, `duplication` vuelve al Nivel 2 y el volumen se vuelve a inflar)", () => {
      expect(detector.groupKey).toBe(duplicationGroupKey);
    });

    /**
     * EL SOBRE-CONTEO, reproducido con la cuenta exacta de `census.ts#censusOf`
     * (`Σ memberCount` una vez por cada archivo DISTINTO de las `locations` del
     * grupo). Tres clases de clon ancladas todas en `a.ts`, cada una contra un
     * archivo distinto: el Nivel 2 las mete en una sola tarjeta cuya unión toca
     * 4 archivos (3 × 4 = 12); el Nivel 1 las separa en 3 problemas de 2
     * archivos cada uno (3 × 2 = 6) sin perder un solo miembro.
     */
    it("agrupar por conjunto de archivos, y no por dónde cae la primera copia, saca el sobre-conteo del censo sin perder un hallazgo", () => {
      const findings = [
        hallazgo("f1", ["a.ts", "b.ts"]),
        hallazgo("f2", ["a.ts", "c.ts"]),
        hallazgo("f3", ["a.ts", "d.ts"]),
      ];

      const volumenCenso = (buckets: ReturnType<typeof bucketFindings>) =>
        buckets.reduce((total, b) => {
          const archivos = new Set(b.members.flatMap((m) => m.locations.map((l) => l.file)));
          return total + b.members.length * archivos.size;
        }, 0);

      // Nivel 2 (lo de antes de este frente): una sola tarjeta anclada en `a.ts`.
      const nivel2 = bucketFindings(findings, { groupKeyOf: () => undefined });
      // GROUP_MIN es 5, así que con 3 quedan sueltos; el sobre-conteo aparece
      // igual apenas la unión de un grupo excede lo que toca un miembro, así
      // que se fuerza el grupo con una clave constante para aislar el efecto.
      const nivel2Agrupado = bucketFindings(findings, { groupKeyOf: () => "L2-simulado" });
      expect(volumenCenso(nivel2Agrupado)).toBe(12);

      const nivel1 = bucketFindings(findings, { groupKeyOf: duplicationGroupKey });
      expect(nivel1).toHaveLength(3);
      expect(volumenCenso(nivel1)).toBe(6);

      // Y lo que NO puede cambiar: ni un hallazgo se pierde por agrupar.
      const miembros = (bs: ReturnType<typeof bucketFindings>) => bs.reduce((n, b) => n + b.members.length, 0);
      expect(miembros(nivel1)).toBe(miembros(nivel2Agrupado));
      expect(miembros(nivel1)).toBe(miembros(nivel2));
      expect(miembros(nivel1)).toBe(3);
    });
  });
});

/* ── Ola Q, frente F2 — cuarto criterio de "no es producto" ───────────────── */

/**
 * Un grafo de juguete a nivel de ARCHIVO: un nodo `file` por ruta y una arista
 * `references` por par. Alcanza para este criterio, que sólo mira qué archivos
 * están cableados con qué archivos.
 */
function grafoDeArchivos(archivos: readonly string[], pares: readonly (readonly [string, string])[]): CodeGraph {
  return {
    nodes: archivos.map((file) => ({ id: `file:${file}`, kind: "file" as const, file, symbolPath: [] })),
    edges: pares.map(([a, b]) => ({
      from: `file:${a}`,
      to: `file:${b}`,
      kind: "references" as const,
      provenance: "resolved" as const,
      weight: 1,
    })),
    resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
  };
}

describe("Ola Q, frente F2 — subárbol autocontenido", () => {
  /** 10 archivos de producto cableados entre sí (cobertura 1,00 sin contar al satélite). */
  const nucleo = Array.from({ length: 10 }, (_, i) => `lib/nucleo/m${String(i)}.rb`);
  const cableado = nucleo.slice(1).map((f) => [f, nucleo[0]!] as const);
  const satelite = ["cops/no_p.rb", "cops/no_puts.rb"];
  const archivos = [...nucleo, ...satelite].map((path) => ({ path, lines: 40, language: "ruby" }));

  const clonesEnSatelite = [
    clone({ fingerprint: "f1", file: satelite[0]!, startLine: 1, endLine: 10 }),
    clone({ fingerprint: "f1", file: satelite[1]!, startLine: 1, endLine: 10 }),
  ];

  it("las copias que viven ENTERAS en un subárbol sin ninguna arista con el repo no se reportan", () => {
    const { minCopies, minDensity, minCodeLines } = thresholdsFor();
    const graph = grafoDeArchivos([...nucleo, ...satelite], cableado);
    expect(buildDuplicationFindings(clonesEnSatelite, minCopies, minDensity, graph, minCodeLines, archivos)).toHaveLength(0);
  });

  it("SIN la lista de archivos (o sin grafo) el filtro no dispara: nunca oculta de más por falta de datos", () => {
    const { minCopies, minDensity, minCodeLines } = thresholdsFor();
    const graph = grafoDeArchivos([...nucleo, ...satelite], cableado);
    expect(buildDuplicationFindings(clonesEnSatelite, minCopies, minDensity, graph, minCodeLines)).toHaveLength(1);
    expect(buildDuplicationFindings(clonesEnSatelite, minCopies, minDensity, null, minCodeLines, archivos)).toHaveLength(1);
  });

  it("una sola copia en código cableado al repo y el hallazgo se emite igual", () => {
    const { minCopies, minDensity, minCodeLines } = thresholdsFor();
    const graph = grafoDeArchivos([...nucleo, ...satelite], cableado);
    const mixto = [
      clone({ fingerprint: "f2", file: satelite[0]!, startLine: 1, endLine: 10 }),
      clone({ fingerprint: "f2", file: nucleo[3]!, startLine: 1, endLine: 10 }),
    ];
    expect(buildDuplicationFindings(mixto, minCopies, minDensity, graph, minCodeLines, archivos)).toHaveLength(1);
  });

  it("un paquete de producto que SÓLO usa al resto del repo sigue reportando (las dos direcciones)", () => {
    const { minCopies, minDensity, minCodeLines } = thresholdsFor();
    // Mismo fixture, pero el "satélite" ahora usa al núcleo: deja de serlo.
    const graph = grafoDeArchivos([...nucleo, ...satelite], [...cableado, [satelite[0]!, nucleo[0]!], [satelite[1]!, nucleo[0]!]]);
    expect(buildDuplicationFindings(clonesEnSatelite, minCopies, minDensity, graph, minCodeLines, archivos)).toHaveLength(1);
  });
});
