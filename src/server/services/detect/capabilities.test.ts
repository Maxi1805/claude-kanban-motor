import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LANGUAGE_DECLS } from "../code-analyzer.js";
import { deriveNodeSets, type ProbeNode } from "../code-grammar.js";
import { deriveCapabilities } from "./capabilities.js";

const require = createRequire(import.meta.url);

/* eslint-disable @typescript-eslint/no-explicit-any */
let runtime: Promise<{ Parser: any; Language: any }> | null = null;
function loadRuntime() {
  runtime ??= (async () => {
    const mod = require("web-tree-sitter") as any;
    const Parser = mod.Parser ?? mod.default ?? mod;
    await Parser.init();
    const Language = Parser.Language ?? mod.Language;
    return { Parser, Language };
  })();
  return runtime;
}

function wasmPath(file: string): string {
  return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", file);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Un `ProbeNode` fake mínimo, construido a mano — el mismo enfoque que
 * `code-grammar.ts` habilita explícitamente en su docstring ("directamente
 * testeable off a fake ProbeNode tree"). `fields` son hijos ADEMÁS
 * accesibles por `childForFieldName`, igual que un `field` real de
 * tree-sitter (un field es un child con un nombre, no un nodo aparte).
 */
interface FakeSpec {
  type: string;
  isNamed?: boolean;
  fields?: Record<string, FakeSpec>;
  children?: FakeSpec[];
}

function buildNode(spec: FakeSpec): ProbeNode {
  const fieldEntries = Object.entries(spec.fields ?? {});
  const fieldNodes = fieldEntries.map(([, v]) => buildNode(v));
  const plainChildren = (spec.children ?? []).map(buildNode);
  const allChildren = [...plainChildren, ...fieldNodes];
  const node: ProbeNode = {
    type: spec.type,
    isNamed: spec.isNamed ?? true,
    childCount: allChildren.length,
    child: (i: number) => allChildren[i] ?? null,
    childForFieldName: (name: string) => {
      const idx = fieldEntries.findIndex(([k]) => k === name);
      return idx === -1 ? null : fieldNodes[idx];
    },
  };
  return node;
}

const identifier = (): FakeSpec => ({ type: "identifier" });
const block = (children: FakeSpec[] = []): FakeSpec => ({ type: "block", children });

/** Una gramática sintética que ejercita las once capacidades a la vez. */
function richGrammarProbe(): FakeSpec {
  return {
    type: "program",
    children: [
      { type: "import_statement", fields: { path: identifier() } },
      { type: "namespace_declaration", fields: { name: identifier(), body: block() } },
      {
        type: "class_declaration",
        fields: {
          name: identifier(),
          superclass: identifier(),
          interfaces: identifier(),
          type_parameters: { type: "type_parameter_list" },
          body: block([
            {
              // constructor: función-como (body+parameters), SIN "type" (retorno), SÓLO dentro de la clase.
              type: "constructor_declaration",
              fields: { name: identifier(), parameters: { type: "parameter_list" }, body: block() },
            },
            {
              // método normal: función-como, CON "type" (retorno).
              type: "method_declaration",
              fields: {
                name: identifier(),
                parameters: { type: "parameter_list" },
                body: block(),
                type: identifier(),
                modifiers: { type: "modifiers" },
              },
            },
          ]),
        },
      },
      {
        // la misma forma función-como que `method_declaration` pero SUELTA (top-level),
        // para que `seenOutsideType` tenga con qué comparar.
        type: "method_declaration",
        fields: { name: identifier(), parameters: { type: "parameter_list" }, body: block(), type: identifier() },
      },
      {
        type: "if_statement",
        fields: {
          condition: identifier(),
          consequence: block(),
          alternative: { type: "conditional_expression", fields: { condition: identifier(), alternative: identifier() } },
        },
      },
      // Estructura real: `try_statement` envuelve un `catch_clause`. El nodo
      // que hace matchear "excepciones" es `catch_clause` (delega en
      // `sets.exceptionNodes`, la MISMA clasificación de `code-grammar.ts`
      // que usa `empty-catch`, no un vocabulario propio de este módulo — ver
      // el comentario de `deriveCapabilities` sobre "excepciones").
      { type: "try_statement", fields: { body: block([{ type: "catch_clause", fields: { body: block() } }]) } },
    ],
  };
}

/** Una gramática mínima, sin ninguna de las once capacidades. */
function bareGrammarProbe(): FakeSpec {
  return {
    type: "program",
    children: [
      {
        type: "function_definition",
        fields: { name: identifier(), parameters: { type: "parameter_list" }, body: block() },
      },
    ],
  };
}

describe("deriveCapabilities", () => {
  it("deriva las once capacidades de una gramática que las ejercita todas", () => {
    const root = buildNode(richGrammarProbe());
    const sets = deriveNodeSets(root);
    const caps = deriveCapabilities(root, sets);

    expect([...caps].sort()).toEqual(
      [
        "excepciones",
        "genericos",
        "herencia",
        "imports",
        "interfaz",
        "modulos",
        "nodo-constructor",
        "ternario",
        "tipos-explicitos",
        "unidad-tipo-clase",
        "visibilidad",
      ].sort(),
    );
  });

  it("no deriva ninguna capacidad de una gramática que sólo tiene funciones sueltas", () => {
    const root = buildNode(bareGrammarProbe());
    const sets = deriveNodeSets(root);
    const caps = deriveCapabilities(root, sets);

    expect(caps.size).toBe(0);
  });

  it("'nodo-constructor' es false cuando el único tipo función-como que aparece dentro de una clase TAMBIÉN aparece suelto (Python/Ruby/Go: no hay nodo de gramática dedicado)", () => {
    const root = buildNode({
      type: "program",
      children: [
        {
          type: "class_declaration",
          fields: {
            name: identifier(),
            body: block([
              {
                type: "method_definition",
                fields: { name: identifier(), parameters: { type: "parameter_list" }, body: block() },
              },
            ]),
          },
        },
        {
          // MISMO tipo de nodo, ahora suelto: no hay forma dedicada de constructor.
          type: "method_definition",
          fields: { name: identifier(), parameters: { type: "parameter_list" }, body: block() },
        },
      ],
    });
    const sets = deriveNodeSets(root);
    const caps = deriveCapabilities(root, sets);
    expect(caps.has("nodo-constructor")).toBe(false);
  });

  it("'herencia' es false para una clase sin ningún campo de herencia", () => {
    const root = buildNode({
      type: "program",
      children: [{ type: "class_declaration", fields: { name: identifier(), body: block() } }],
    });
    const sets = deriveNodeSets(root);
    expect(deriveCapabilities(root, sets).has("herencia")).toBe(false);
  });

  it("'herencia' también sale true cuando la herencia cuelga de un hijo POSICIONAL sin campo (forma real de `class_heritage` en JS/TS, no un fake inventado)", () => {
    const root = buildNode({
      type: "program",
      children: [
        {
          type: "class_declaration",
          fields: { name: identifier(), body: block() },
          children: [
            // `class_heritage` NO es un field acá — es un hijo posicional más,
            // igual que en la gramática real (ver `HERITAGE_WORD` en capabilities.ts).
            { type: "class_heritage", children: [identifier()] },
          ],
        },
      ],
    });
    const sets = deriveNodeSets(root);
    expect(deriveCapabilities(root, sets).has("herencia")).toBe(true);
  });

  it("un hijo posicional `type_parameters` (restricción de genérico, no herencia) NO dispara 'herencia' por sí solo", () => {
    const root = buildNode({
      type: "program",
      children: [
        {
          type: "class_declaration",
          fields: {
            name: identifier(),
            body: block(),
            // `T extends Base` vive DENTRO de type_parameters, nunca como
            // hijo directo de class_declaration — no debe confundirse con
            // `class_heritage`.
            type_parameters: { type: "type_parameter_list", children: [{ type: "extends_clause" }] },
          },
        },
      ],
    });
    const sets = deriveNodeSets(root);
    expect(deriveCapabilities(root, sets).has("herencia")).toBe(false);
  });
});

/**
 * AGUJERO DE OBSERVABILIDAD (P3): sin esta tabla, una capacidad MAL CALCULADA
 * (bug de derivación) es INDISTINGUIBLE de una capacidad genuinamente AUSENTE
 * en el lenguaje — ambas dejan al detector "no-aplicable" con
 * `missingCapabilities`, y la compuerta de cobertura lo aprueba igual, sin
 * que nada en CI lo note. Esta tabla fija, sobre la SONDA REAL de producción
 * (`LANGUAGE_DECLS`, `code-analyzer.ts`) y la gramática `.wasm` real, qué DEBE
 * salir para "herencia" en cada uno de los 9 lenguajes — el bug que motivó
 * esta tarea (`class_heritage` es un hijo posicional sin campo en
 * JS/TS/TSX/Vue; `hasAnyField(INHERITANCE_FIELDS)` nunca lo veía) habría
 * fallado ESTE test con "esperado true, medido false" en vez de esconderse
 * detrás de un `no-aplicable` silencioso.
 */
describe("deriveCapabilities — 'herencia' por lenguaje, sobre la sonda de producción y la gramática real", () => {
  const HERENCIA_ESPERADA: Readonly<Record<string, boolean>> = {
    ruby: true,
    typescript: true,
    tsx: true,
    javascript: true,
    vue: true,
    python: true,
    // Go NO tiene herencia — ausencia REAL del lenguaje (embedding de struct es
    // otra relación semántica), no un bug de cálculo. Único `false` esperado.
    go: false,
    java: true,
    csharp: true,
    // D3 (Ola 11b). Los dos `false` son ausencia REAL del lenguaje, medida
    // sobre la sonda de producción, no un bug de cálculo:
    // - Rust: `impl Trait for Type` es adopción de interfaz (la capacidad
    //   `interfaz` SÍ sale true por `trait_item`), y `trait A: B` es un
    //   límite de trait. No hay herencia de implementación que ver.
    // - Elixir: no tiene clases ni herencia; `use`/`@behaviour` es
    //   mixin/interfaz. Además su gramática no expone NI UN campo estructural
    //   (todo es `call`), así que `classNodes` deriva vacío — ver la fila
    //   `elixir` de `capability-matrix.test.ts` para el detalle medido.
    rust: false,
    elixir: false,
  };

  it("cada lenguaje de LANGUAGE_DECLS tiene una expectativa declarada (nada se cuela sin decidir true/false)", () => {
    const missing = LANGUAGE_DECLS.map((d) => d.id).filter((id) => !(id in HERENCIA_ESPERADA));
    expect(missing, `lenguajes sin expectativa de 'herencia': ${missing.join(", ")}`).toEqual([]);
  });

  it.each(LANGUAGE_DECLS)(
    "$id: 'herencia' medida sobre la sonda de producción coincide con lo esperado",
    async (decl) => {
      const { Parser, Language } = await loadRuntime();
      const parser = new Parser();
      const language = await Language.load(wasmPath(decl.wasm));
      parser.setLanguage(language);
      const tree = parser.parse(decl.probeSource);
      const sets = deriveNodeSets(tree.rootNode, decl.extraCloneNodes, decl.functionExclusions);
      const caps = deriveCapabilities(tree.rootNode, sets);

      const expected = HERENCIA_ESPERADA[decl.id];
      expect(
        caps.has("herencia"),
        `"${decl.id}": herencia medida ${caps.has("herencia")}, esperada ${expected} — una capacidad mal calculada no puede disfrazarse de "el lenguaje no la tiene"`,
      ).toBe(expected);
    },
  );
});
