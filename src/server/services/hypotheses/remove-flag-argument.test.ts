/**
 * `remove-flag-argument.test.ts` — Ola AT, frente AT2.
 *
 * Árboles REALES (`detect/testing.ts`) y LOS SEIS LENGUAJES en la misma
 * tabla, por la razón que el encargo nombra: `state.ts#SELF_PREFIX` dejó a Go
 * MUDO en cuatro anclas durante varias olas y ningún test lo agarró, porque
 * los tests cubrían un lenguaje solo. Acá cada caso corre seis veces.
 */
import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import type { FileUnit, Finding } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../graph/types.js";
import { hypothesis as removeFlagArgument } from "./remove-flag-argument.js";
import type { HypothesisContext } from "./types.js";

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(1, { rationale: "test" }), { language: "typescript", sampleSize: () => 0, corpusP95: () => null });
}

/** El título del detector-ancla: `"<param>" es un parámetro booleano…` — de ahí sale el nombre del flag. */
function finding(file: FileUnit, flag: string, symbol: string, startLine: number, endLine: number): Finding {
  return {
    id: "f-boolean-flag-param-1",
    detectorId: "boolean-flag-param",
    kind: "boolean-flag-param" as Finding["kind"],
    scope: "intra-function",
    language: file.language,
    title: `"${flag}" es un parámetro booleano que decide el comportamiento de "${symbol}"`,
    detail: "d",
    trigger: [{ label: "x", value: 1, threshold: fakeThreshold() }],
    locations: [{ file: file.path, startLine, endLine, symbol, role: "r" }],
    severity: 45,
    advice: { primary: { name: "Remove Flag Argument", kind: "refactorizacion", why: "y", source: "z" } },
  };
}

const EMPTY_RESOLUTION = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

/**
 * Un grafo MÍNIMO con el símbolo de la función y, opcionalmente, un llamador
 * en OTRO archivo. Sin un nodo-símbolo, `sinLlamadoresInvisibles` responde "no
 * demostrado" — que es el default seguro y también se testea.
 */
function graphFor(file: string, startLine: number, symbol: string, externo: boolean): CodeGraph {
  const nodes: CodeGraphNode[] = [
    { id: `sym:${file}#${symbol}`, kind: "symbol", file, symbolPath: [symbol], family: "function-like", startLine, endLine: startLine + 1 },
  ];
  const edges: CodeGraphEdge[] = [];
  if (externo) {
    nodes.push({ id: "sym:otro.x#caller", kind: "symbol", file: "otro.x", symbolPath: ["caller"], family: "function-like", startLine: 1, endLine: 2 });
    edges.push({ from: "sym:otro.x#caller", to: `sym:${file}#${symbol}`, kind: "references", provenance: "declared", weight: 1 });
  }
  return { nodes, edges, resolution: EMPTY_RESOLUTION };
}

function ctxFor(file: FileUnit | null): HypothesisContext {
  return {
    file,
    fileAt: (p: string) => (file && file.path === p ? file : null),
    repo: { repoName: "r", files: [], functions: [], clones: [], graph: null },
    capabilities: new Set<Capability>(),
    setsFor: () =>
      file?.sets ?? {
        functionNodes: new Set(), branchNodes: new Set(), chainNodes: new Set(), cloneNodes: new Set(),
        classNodes: new Set(), nestingNodes: new Set(), constructorNodes: new Set(), exceptionNodes: new Set(), switchContainerNodes: new Set(),
      },
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

async function unit(wasm: string, probe: string, source: string, language: string): Promise<FileUnit> {
  const [sets, root] = await Promise.all([nodeSetsFor(wasm, probe), parseRoot(wasm, source)]);
  return fileUnitFrom(root, sets, language, { file: `fixture.${language}`, metrics: { cognitive: 5, chain: 0 } });
}

function target(file: FileUnit, name: string): { symbol: string; startLine: number; endLine: number } {
  const fn = file.functions.find((f) => f.name === name);
  if (!fn) throw new Error(`sin función ${name} en ${file.language}: ${file.functions.map((f) => f.name).join(",")}`);
  return { symbol: fn.name ?? "?", startLine: fn.startLine, endLine: fn.endLine };
}

interface Caso {
  readonly lenguaje: string;
  readonly wasm: string;
  readonly probe: string;
  /** El flag parte el cuerpo en dos y los dos llamadores pasan literales (cuerpos de VARIAS sentencias: no son envoltorios). */
  readonly canonico: string;
  /** El mismo, pero un llamador pasa una VARIABLE: la refactorización no aplica. */
  readonly conVariable: string;
  /** El mismo, pero el flag se RELEVA a otra llamada: partir no lo elimina, lo muda adentro. */
  readonly relevado: string;
  /** Los dos métodos explícitos YA existen (envoltorios de una sola sentencia). */
  readonly yaAplicado: string;
}

const CASOS: readonly Caso[] = [
  {
    lenguaje: "typescript",
    wasm: "tree-sitter-typescript.wasm",
    probe: `function top(x: number): number { if (x > 0) { return 1; } else { return 2; } }\nclass P { m(x: number, f: boolean): void { if (f) { this.m(1, true); } else { this.m(2, false); } } }`,
    canonico: `function render(node: Node, compact: boolean): string {
  if (compact) {
    const head = node.name;
    const body = head.trim();
    return body;
  } else {
    const head = node.name;
    const body = node.detail;
    const both = head + body;
    return both;
  }
}
function short(node: Node): string {
  const n = node;
  return render(n, true);
}
function long(node: Node): string {
  const n = node;
  return render(n, false);
}`,
    conVariable: `function render(node: Node, compact: boolean): string {
  if (compact) {
    const head = node.name;
    const body = head.trim();
    return body;
  } else {
    const head = node.name;
    const body = node.detail;
    const both = head + body;
    return both;
  }
}
function short(node: Node, mode: boolean): string {
  const n = node;
  return render(n, mode);
}`,
    relevado: `function render(node: Node, compact: boolean): string {
  if (compact) {
    const head = node.name;
    const body = head.trim();
    return inner(body, compact);
  } else {
    const head = node.name;
    const body = node.detail;
    const both = head + body;
    return both;
  }
}
function short(node: Node): string {
  const n = node;
  return render(n, true);
}`,
    yaAplicado: `function render(node: Node, compact: boolean): string {
  if (compact) {
    const head = node.name;
    const body = head.trim();
    return body;
  } else {
    const head = node.name;
    const body = node.detail;
    const both = head + body;
    return both;
  }
}
function short(node: Node): string { return render(node, true); }
function long(node: Node): string { return render(node, false); }`,
  },
  {
    lenguaje: "python",
    wasm: "tree-sitter-python.wasm",
    probe: `class P:
    def m(self, x, f):
        if f:
            self.m(1, True)
        else:
            self.m(2, False)
`,
    canonico: `def render(node, compact: bool):
    if compact:
        head = node.name
        body = head.strip()
        return body
    else:
        head = node.name
        body = node.detail
        both = head + body
        return both

def short(node):
    n = node
    return render(n, True)

def long(node):
    n = node
    return render(n, False)
`,
    conVariable: `def render(node, compact: bool):
    if compact:
        head = node.name
        body = head.strip()
        return body
    else:
        head = node.name
        body = node.detail
        both = head + body
        return both

def short(node, mode):
    n = node
    return render(n, mode)
`,
    relevado: `def render(node, compact: bool):
    if compact:
        head = node.name
        body = head.strip()
        return inner(body, compact)
    else:
        head = node.name
        body = node.detail
        both = head + body
        return both

def short(node):
    n = node
    return render(n, True)
`,
    yaAplicado: `def render(node, compact: bool):
    if compact:
        head = node.name
        body = head.strip()
        return body
    else:
        head = node.name
        body = node.detail
        both = head + body
        return both

def short(node):
    return render(node, True)

def long(node):
    return render(node, False)
`,
  },
  {
    lenguaje: "ruby",
    wasm: "tree-sitter-ruby.wasm",
    probe: `class P
  def m(x, f)
    if f
      m(1, true)
    else
      m(2, false)
    end
  end
end
`,
    canonico: `def render(node, compact = true)
  if compact
    head = node.name
    body = head.strip
    body
  else
    head = node.name
    body = node.detail
    both = head + body
    both
  end
end

def short(node)
  n = node
  render(n, true)
end

def long(node)
  n = node
  render(n, false)
end
`,
    conVariable: `def render(node, compact = true)
  if compact
    head = node.name
    body = head.strip
    body
  else
    head = node.name
    body = node.detail
    both = head + body
    both
  end
end

def short(node, mode)
  n = node
  render(n, mode)
end
`,
    relevado: `def render(node, compact = true)
  if compact
    head = node.name
    body = head.strip
    inner(body, compact)
  else
    head = node.name
    body = node.detail
    both = head + body
    both
  end
end

def short(node)
  n = node
  render(n, true)
end
`,
    yaAplicado: `def render(node, compact = true)
  if compact
    head = node.name
    body = head.strip
    body
  else
    head = node.name
    body = node.detail
    both = head + body
    both
  end
end

def short(node)
  render(node, true)
end

def long(node)
  render(node, false)
end
`,
  },
  {
    lenguaje: "go",
    wasm: "tree-sitter-go.wasm",
    probe: `package p

func top(x int, f bool) int {
	if f {
		return 1
	} else {
		return 2
	}
}
`,
    canonico: `package p

func render(node Node, compact bool) string {
	if compact {
		head := node.Name
		body := trim(head)
		return body
	} else {
		head := node.Name
		body := node.Detail
		both := head + body
		return both
	}
}

func short(node Node) string {
	n := node
	return render(n, true)
}

func long(node Node) string {
	n := node
	return render(n, false)
}
`,
    conVariable: `package p

func render(node Node, compact bool) string {
	if compact {
		head := node.Name
		body := trim(head)
		return body
	} else {
		head := node.Name
		body := node.Detail
		both := head + body
		return both
	}
}

func short(node Node, mode bool) string {
	n := node
	return render(n, mode)
}
`,
    relevado: `package p

func render(node Node, compact bool) string {
	if compact {
		head := node.Name
		body := trim(head)
		return inner(body, compact)
	} else {
		head := node.Name
		body := node.Detail
		both := head + body
		return both
	}
}

func short(node Node) string {
	n := node
	return render(n, true)
}
`,
    yaAplicado: `package p

func render(node Node, compact bool) string {
	if compact {
		head := node.Name
		body := trim(head)
		return body
	} else {
		head := node.Name
		body := node.Detail
		both := head + body
		return both
	}
}

func short(node Node) string { return render(node, true) }

func long(node Node) string { return render(node, false) }
`,
  },
  {
    lenguaje: "java",
    wasm: "tree-sitter-java.wasm",
    probe: `class P { void m(int x, boolean f) { if (f) { m(1, true); } else { m(2, false); } } }`,
    canonico: `class R {
  String render(Node node, boolean compact) {
    if (compact) {
      String head = node.name;
      String body = head.trim();
      return body;
    } else {
      String head = node.name;
      String body = node.detail;
      String both = head + body;
      return both;
    }
  }
  String shortOf(Node node) {
    Node n = node;
    return render(n, true);
  }
  String longOf(Node node) {
    Node n = node;
    return render(n, false);
  }
}`,
    conVariable: `class R {
  String render(Node node, boolean compact) {
    if (compact) {
      String head = node.name;
      String body = head.trim();
      return body;
    } else {
      String head = node.name;
      String body = node.detail;
      String both = head + body;
      return both;
    }
  }
  String shortOf(Node node, boolean mode) {
    Node n = node;
    return render(n, mode);
  }
}`,
    relevado: `class R {
  String render(Node node, boolean compact) {
    if (compact) {
      String head = node.name;
      String body = head.trim();
      return inner(body, compact);
    } else {
      String head = node.name;
      String body = node.detail;
      String both = head + body;
      return both;
    }
  }
  String shortOf(Node node) {
    Node n = node;
    return render(n, true);
  }
}`,
    yaAplicado: `class R {
  String render(Node node, boolean compact) {
    if (compact) {
      String head = node.name;
      String body = head.trim();
      return body;
    } else {
      String head = node.name;
      String body = node.detail;
      String both = head + body;
      return both;
    }
  }
  String shortOf(Node node) { return render(node, true); }
  String longOf(Node node) { return render(node, false); }
}`,
  },
  {
    lenguaje: "csharp",
    wasm: "tree-sitter-c_sharp.wasm",
    probe: `class P { void M(int x, bool f) { if (f) { M(1, true); } else { M(2, false); } } }`,
    canonico: `class R {
  string Render(Node node, bool compact) {
    if (compact) {
      var head = node.Name;
      var body = head.Trim();
      return body;
    } else {
      var head = node.Name;
      var body = node.Detail;
      var both = head + body;
      return both;
    }
  }
  string ShortOf(Node node) {
    var n = node;
    return Render(n, true);
  }
  string LongOf(Node node) {
    var n = node;
    return Render(n, false);
  }
}`,
    conVariable: `class R {
  string Render(Node node, bool compact) {
    if (compact) {
      var head = node.Name;
      var body = head.Trim();
      return body;
    } else {
      var head = node.Name;
      var body = node.Detail;
      var both = head + body;
      return both;
    }
  }
  string ShortOf(Node node, bool mode) {
    var n = node;
    return Render(n, mode);
  }
}`,
    relevado: `class R {
  string Render(Node node, bool compact) {
    if (compact) {
      var head = node.Name;
      var body = head.Trim();
      return Inner(body, compact);
    } else {
      var head = node.Name;
      var body = node.Detail;
      var both = head + body;
      return both;
    }
  }
  string ShortOf(Node node) {
    var n = node;
    return Render(n, true);
  }
}`,
    yaAplicado: `class R {
  string Render(Node node, bool compact) {
    if (compact) {
      var head = node.Name;
      var body = head.Trim();
      return body;
    } else {
      var head = node.Name;
      var body = node.Detail;
      var both = head + body;
      return both;
    }
  }
  string ShortOf(Node node) { return Render(node, true); }
  string LongOf(Node node) { return Render(node, false); }
}`,
  },
];

/** El nombre de la función-objetivo por lenguaje (Java/C# capitalizan). */
function nombreObjetivo(lenguaje: string): string {
  return lenguaje === "csharp" ? "Render" : "render";
}

describe("hypotheses/remove-flag-argument", () => {
  it("contrato: id, pattern y el ÚNICO ancla — `boolean-flag-param`, que hasta esta ola no tenía ninguna hipótesis encima", () => {
    expect(removeFlagArgument.id).toBe("remove-flag-argument");
    expect(removeFlagArgument.pattern).toBe("Remove Flag Argument");
    expect(removeFlagArgument.anchors).toEqual(["boolean-flag-param"]);
  });

  for (const caso of CASOS) {
    describe(caso.lenguaje, () => {
      const nombre = nombreObjetivo(caso.lenguaje);

      it("EMITE sobre la forma canónica: un flag, usado sólo como condición, que parte el cuerpo, con llamadores que pasan literales", async () => {
        const file = await unit(caso.wasm, caso.probe, caso.canonico, caso.lenguaje);
        const t = target(file, nombre);
        const graph = graphFor(file.path, t.startLine, t.symbol, false);
        const h = removeFlagArgument.build(finding(file, "compact", t.symbol, t.startLine, t.endLine), graph, ctxFor(file));
        expect(h, `${caso.lenguaje}: la forma canónica tiene que emitir`).not.toBeNull();
        expect(h!.state).toBe("ausente");
        expect(h!.confidence).not.toBeNull();
        expect(h!.checks.every((c) => c.passed)).toBe(true);
        // El destino del refactor está en `places`: la firma + cada sitio de llamada.
        expect(h!.places.length).toBeGreaterThanOrEqual(2);
      });

      it("CALLA cuando un llamador pasa una VARIABLE: es la compuerta principal de la familia", async () => {
        const file = await unit(caso.wasm, caso.probe, caso.conVariable, caso.lenguaje);
        const t = target(file, nombre);
        const graph = graphFor(file.path, t.startLine, t.symbol, false);
        const h = removeFlagArgument.build(finding(file, "compact", t.symbol, t.startLine, t.endLine), graph, ctxFor(file));
        expect(h, `${caso.lenguaje}: con un llamador que pasa una variable la refactorización NO aplica`).toBeNull();
      });

      it("CALLA cuando el flag se RELEVA a otra llamada: partir la función no lo elimina, lo muda un nivel adentro", async () => {
        const file = await unit(caso.wasm, caso.probe, caso.relevado, caso.lenguaje);
        const t = target(file, nombre);
        const graph = graphFor(file.path, t.startLine, t.symbol, false);
        const h = removeFlagArgument.build(finding(file, "compact", t.symbol, t.startLine, t.endLine), graph, ctxFor(file));
        expect(h, `${caso.lenguaje}: un flag relevado a un callee no es esta refactorización`).toBeNull();
      });

      it("CALLA cuando el grafo muestra un llamador en OTRO archivo: los sitios a reescribir no caben en esta pantalla", async () => {
        const file = await unit(caso.wasm, caso.probe, caso.canonico, caso.lenguaje);
        const t = target(file, nombre);
        const graph = graphFor(file.path, t.startLine, t.symbol, true);
        const h = removeFlagArgument.build(finding(file, "compact", t.symbol, t.startLine, t.endLine), graph, ctxFor(file));
        expect(h, `${caso.lenguaje}: con un consumidor externo esta hipótesis calla`).toBeNull();
      });

      it("trampa #3 — el remedio YA aplicado: dos envoltorios de una sentencia con literal ⇒ `ya-aplicado`, nunca una oportunidad", async () => {
        const file = await unit(caso.wasm, caso.probe, caso.yaAplicado, caso.lenguaje);
        const t = target(file, nombre);
        const graph = graphFor(file.path, t.startLine, t.symbol, false);
        const h = removeFlagArgument.build(finding(file, "compact", t.symbol, t.startLine, t.endLine), graph, ctxFor(file));
        expect(h, `${caso.lenguaje}: con los dos métodos explícitos ya escritos no hay oportunidad`).not.toBeNull();
        expect(h!.state).toBe("ya-aplicado");
        expect(h!.confidence).toBeNull();
      });
    });
  }

  /* ── LAS DOS REGRESIONES QUE SALIERON DE ABRIR EL ARCHIVO REAL ──────────── */

  it("regresión (sqlalchemy single_inserts.py): un envoltorio CON DOCSTRING sigue siendo un envoltorio — la refactorización estaba hecha y se publicaba igual como oportunidad", async () => {
    const py = CASOS[1]!;
    const conDocstring = `def render(node, compact: bool):
    if compact:
        head = node.name
        body = head.strip()
        return body
    else:
        head = node.name
        body = node.detail
        both = head + body
        return both

def short(node):
    """Devuelve la forma corta."""
    return render(node, True)

def long(node):
    """Devuelve la forma larga."""
    return render(node, False)
`;
    const file = await unit(py.wasm, py.probe, conDocstring, py.lenguaje);
    const t = target(file, "render");
    const h = removeFlagArgument.build(finding(file, "compact", t.symbol, t.startLine, t.endLine), graphFor(file.path, t.startLine, t.symbol, false), ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
  });

  it("regresión (newtonsoft HandleError): una función de UNA sentencia que llama a ésta pero NO tiene su aridad menos uno NO es un envoltorio — dos de ésas daban la refactorización por hecha y se tragaban un verdadero positivo", async () => {
    const py = CASOS[1]!;
    const falsosEnvoltorios = `def render(node, compact: bool):
    if compact:
        head = node.name
        body = head.strip()
        return body
    else:
        head = node.name
        body = node.detail
        both = head + body
        return both

def a(node, extra, more):
    return render(node, True)

def b(node, extra, more):
    return render(node, False)
`;
    const file = await unit(py.wasm, py.probe, falsosEnvoltorios, py.lenguaje);
    const t = target(file, "render");
    const h = removeFlagArgument.build(finding(file, "compact", t.symbol, t.startLine, t.endLine), graphFor(file.path, t.startLine, t.symbol, false), ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.state, "aridad 3 != 2-1: no son envoltorios de `render`").toBe("ausente");
  });

  it("sin árbol vivo NO inventa nada: `ctx.file === null` ⇒ silencio, nunca una propuesta con menos evidencia", async () => {
    const caso = CASOS[0]!;
    const file = await unit(caso.wasm, caso.probe, caso.canonico, caso.lenguaje);
    const t = target(file, "render");
    const h = removeFlagArgument.build(finding(file, "compact", t.symbol, t.startLine, t.endLine), null, ctxFor(null));
    expect(h).toBeNull();
  });

  it("sin grafo (pasada 1, dentro de `analyzeFile`) tampoco emite: `sin-llamadores-invisibles` no está demostrado y el default es callar", async () => {
    const caso = CASOS[0]!;
    const file = await unit(caso.wasm, caso.probe, caso.canonico, caso.lenguaje);
    const t = target(file, "render");
    const h = removeFlagArgument.build(finding(file, "compact", t.symbol, t.startLine, t.endLine), null, ctxFor(file));
    expect(h).toBeNull();
  });
});
