import { describe, expect, it } from "vitest";

import type { DerivedNodeSets } from "../code-grammar.js";
import type { Capability } from "../detect/capabilities.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { pisoDeclarado, resolveThreshold } from "../detect/thresholds.js";
import type { FileUnit, Finding, RepoUnit } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../graph/types.js";
import { hypothesis } from "./chain-of-responsibility.js";
import type { HypothesisContext } from "./types.js";

/**
 * Mismas sondas mínimas que `many-returns.test.ts` (JS/Ruby/Go) — sólo lo
 * que `fileUnitFrom` necesita para derivar `classNodes`/`functionNodes`.
 */
const JS_PROBE = `
class Shape {
  area(x) {
    if (x) return 1;
    return 2;
  }
}
function free(x) {
  if (x) return 1;
  return 2;
}
`;

const RUBY_PROBE = `
class Shape
  def area(x)
    return 1 if x
    return 2
  end
end

def free(x)
  return 1 if x
  return 2
end
`;

const GO_PROBE = `
package main

type Shape struct {
	Name string
}

func (s *Shape) Area(x int) int {
	if x > 0 {
		return 1
	}
	return 2
}

func Free(x int) int {
	if x > 0 {
		return 1
	}
	return 2
}
`;

/**
 * OLA AJ (AJ4) — sondas mínimas de C# y Java, el mismo criterio que las tres de
 * arriba: sólo lo que `fileUnitFrom` necesita para derivar `classNodes`/
 * `functionNodes`, más UN campo, porque el calificador implícito que esta ola
 * traduce se lee del cuerpo de la clase.
 */
const CSHARP_PROBE = `
public class Shape {
    private int side;
    public int Area(int x) {
        if (x > 0) { return 1; }
        return 2;
    }
}
`;

const JAVA_PROBE = `
class Shape {
    private int side;
    public int area(int x) {
        if (x > 0) { return 1; }
        return 2;
    }
}
`;

const EMPTY_SETS: DerivedNodeSets = {
  functionNodes: new Set(),
  branchNodes: new Set(),
  chainNodes: new Set(),
  cloneNodes: new Set(),
  classNodes: new Set(),
  nestingNodes: new Set(),
  constructorNodes: new Set(),
  exceptionNodes: new Set(),
  switchContainerNodes: new Set(),
};

async function jsFile(source: string, filePath = "a.js", parameters?: number): Promise<FileUnit> {
  const sets = await nodeSetsFor("tree-sitter-javascript.wasm", JS_PROBE);
  const root = await parseRoot("tree-sitter-javascript.wasm", source);
  return fileUnitFrom(root, sets, "javascript", { file: filePath, metrics: parameters === undefined ? undefined : { parameters } });
}

async function rubyFile(source: string, filePath = "a.rb"): Promise<FileUnit> {
  const sets = await nodeSetsFor("tree-sitter-ruby.wasm", RUBY_PROBE);
  const root = await parseRoot("tree-sitter-ruby.wasm", source);
  return fileUnitFrom(root, sets, "ruby", { file: filePath });
}

async function goFile(source: string, filePath = "a.go"): Promise<FileUnit> {
  const sets = await nodeSetsFor("tree-sitter-go.wasm", GO_PROBE, ["type_declaration"]);
  const root = await parseRoot("tree-sitter-go.wasm", source);
  return fileUnitFrom(root, sets, "go", { file: filePath });
}

async function csharpFile(source: string, filePath = "a.cs"): Promise<FileUnit> {
  const sets = await nodeSetsFor("tree-sitter-c_sharp.wasm", CSHARP_PROBE);
  const root = await parseRoot("tree-sitter-c_sharp.wasm", source);
  return fileUnitFrom(root, sets, "csharp", { file: filePath });
}

async function javaFile(source: string, filePath = "A.java"): Promise<FileUnit> {
  const sets = await nodeSetsFor("tree-sitter-java.wasm", JAVA_PROBE);
  const root = await parseRoot("tree-sitter-java.wasm", source);
  return fileUnitFrom(root, sets, "java", { file: filePath });
}

function fakeThreshold() {
  return resolveThreshold(pisoDeclarado(1, { rationale: "test" }), {
    language: "javascript",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
}

/** `Finding` cuyo `locations[0]` cubre EXACTAMENTE la función `fnName` de `file` — imita `many-returns`. */
function findingFor(file: FileUnit, fnName: string, kind: Finding["kind"] = "many-returns"): Finding {
  const fn = file.functions.find((f) => f.name === fnName);
  if (!fn) throw new Error(`fixture inválida: no se encontró la función "${fnName}"`);
  return {
    id: `f-${fnName}`,
    detectorId: kind,
    kind,
    scope: "intra-function",
    language: file.language,
    title: "t",
    detail: "d",
    trigger: [{ label: "puntos de retorno", value: 4, threshold: fakeThreshold() }],
    locations: [{ file: file.path, startLine: fn.startLine, endLine: fn.endLine, symbol: fn.name ?? undefined, role: "función con exceso de puntos de retorno" }],
    severity: 50,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
  };
}

function ctxFor(file: FileUnit | null, graph: CodeGraph | null = null, capabilities: readonly Capability[] = []): HypothesisContext {
  const repo: RepoUnit = { repoName: "r", files: [], functions: [], clones: [], graph };
  return {
    file,
    fileAt: () => null,
    repo,
    capabilities: new Set(capabilities),
    setsFor: () => EMPTY_SETS,
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

/** Grafo sintético mínimo — mismo estilo que `wrapping-chain.test.ts`. */
const EMPTY_RESOLUTION = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

function node(partial: Partial<CodeGraphNode> & Pick<CodeGraphNode, "id" | "kind" | "file" | "symbolPath">): CodeGraphNode {
  return { family: undefined, ...partial } as CodeGraphNode;
}
function edge(partial: Partial<CodeGraphEdge> & Pick<CodeGraphEdge, "kind" | "from" | "to">): CodeGraphEdge {
  return { provenance: "declared", ...partial } as CodeGraphEdge;
}
function makeGraph(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes: [...nodes], edges: [...edges], resolution: EMPTY_RESOLUTION } as CodeGraph;
}

describe("hypotheses/chain-of-responsibility", () => {
  it("registro: id/pattern/anchors — OLA AY (AY2) saca las dos anclas con V=0 y CONSERVA las dos que tienen verdaderas", () => {
    expect(hypothesis.id).toBe("chain-of-responsibility");
    expect(hypothesis.pattern).toBe("Chain of Responsibility");
    // OLA AY (AY2). `complexity` (V=0 F=10 n=10, población 13) y
    // `boolean-complexity` (V=0 F=2, población 2) SALEN: con V=0 el recorte es
    // de costo cero sobre verdaderas POR DEFINICIÓN, que es la única condición
    // bajo la que esta ola autoriza podar. `many-returns` SE QUEDA aunque mida
    // V=1 F=10: tiene una verdadera y el límite de costo cero lo protege.
    // Ver el comentario del array en `chain-of-responsibility.ts`.
    expect(hypothesis.anchors).toEqual(["many-returns", "exclusive-dispatch-ladder"]);
    // Y LA MITAD QUE MÁS IMPORTA DE ESTA ASERCIÓN: las dos que salieron NO
    // pueden volver por descuido. Si alguien las re-agrega sin re-medir, esto
    // se pone rojo.
    expect(hypothesis.anchors).not.toContain("complexity");
    expect(hypothesis.anchors).not.toContain("boolean-complexity");
  });

  it("OLA AY (AY2): las dos anclas retiradas siguen ANCLADAS por otras hipótesis — el delta de nivel 1 es CERO y ningún kind queda huérfano", async () => {
    const { HYPOTHESES } = await import("./registry.js");
    for (const kind of ["complexity", "boolean-complexity"] as const) {
      const otros = HYPOTHESES.filter((h) => h.id !== "chain-of-responsibility" && h.anchors.includes(kind));
      expect(otros.length, kind).toBeGreaterThan(0);
    }
  });

  it("required: sin árbol vivo (ctx.file null) — build() devuelve null, no candidata", async () => {
    const file = await jsFile(`
function f(req) {
  if (!req.a) return null;
  if (!req.b) return null;
  if (!req.c) return null;
  return process(req);
}
`);
    const finding = findingFor(file, "f");
    const result = hypothesis.build(finding, null, ctxFor(null));
    expect(result).toBeNull();
  });

  it("required: menos de 3 guardas y sin ningún reenvío — build() devuelve null (no silencio disfrazado)", async () => {
    const file = await jsFile(`
function f(req) {
  if (!req.a) return null;
  if (!req.b) return null;
  return process(req);
}
`);
    const finding = findingFor(file, "f");
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result).toBeNull();
  });

  /* ── Ola 12 — LA SEMÁNTICA QUE FALTABA: guarda-run (forma) ya no basta,
   * hace falta manejo DIVERSO (semántica) — ver docstring del módulo para
   * el diagnóstico completo contra las 47 falsas juzgadas a mano. ── */

  it("required: ≥3 guardas cortas CON salida temprana, pero TODAS bare/sin llamada (validación pura, nunca delega) — build() devuelve null, no 'ausente' (caso real: service_type.rb#get_last_step, nil-safety chain)", async () => {
    const file = await jsFile(`
function getLastStep(details) {
  if (!details) return null;
  if (!details.jsonData) return null;
  if (!details.jsonData.phases) return null;
  return details.jsonData.phases.last;
}
`);
    const finding = findingFor(file, "getLastStep");
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result).toBeNull();
  });

  it("required: ≥3 guardas con salida temprana que SÍ llaman, pero TODAS al MISMO mensaje (pipeline de validación, caso real: ghl_task_handler.rb#call — error_result repetido) — build() devuelve null", async () => {
    const file = await jsFile(`
function call(req) {
  if (!req.locationId) return errorResult('no location');
  const response = findResponse(req);
  if (!response) return errorResult('no response');
  const contactId = resolveContactId(response);
  if (!contactId) return errorResult('no contact');
  return finish(contactId);
}
`);
    const finding = findingFor(file, "call");
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result).toBeNull();
  });

  it("required: ≥3 guardas cortas con salida temprana que invocan ≥2 mensajes DISTINTOS al dispararse ⇒ SÍ candidata (ausente) — la firma que separa manejo diverso de validación/pipeline", async () => {
    const file = await jsFile(`
function dispatch(req) {
  if (req.kind === 'a') return this.next.handleTypeA(req);
  if (req.kind === 'b') return handleTypeB(req);
  if (req.kind === 'c') return null;
  return defaultHandler(req);
}
`);
    const finding = findingFor(file, "dispatch");
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ausente");
  });

  it("OLA V (V4) — required: ≥3 guardas con manejo DIVERSO (≥2 mensajes distintos, la solicitud viaja) pero NINGUNA rama llega a través de un campo propio (todo funciones libres o el propio parámetro) ⇒ build() devuelve null: es una TABLA de despacho, no una cadena — caso real medido: hugo/common/hreflect/convert.go:97 ConvertIfPossible (IsInt/IsFloat/IsUint/IsString, cada una delegando en un convertidor LIBRE o en un método del propio parámetro, ningún sucesor guardado)", async () => {
    const file = await jsFile(`
function convertIfPossible(val, typ) {
  if (isInt(typ)) return convertToIntIfPossible(val, typ);
  if (isFloat(typ)) return convertToFloatIfPossible(val, typ);
  if (isUint(typ)) return convertToUintIfPossible(val, typ);
  return val.convert(typ);
}
`);
    const finding = findingFor(file, "convertIfPossible");
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result).toBeNull();
  });

  it("ausente + guardas independientes CON manejo diverso (discriminador confirmado) ⇒ confianza media (ladder(1), techo media)", async () => {
    const file = await jsFile(`
function processRequest(req) {
  if (!req.auth) return this.next.rejectUnauthenticated(req);
  if (!req.payload) return rejectMissingPayload(req);
  if (req.size > 999) return null;
  return handle(req);
}
`);
    const finding = findingFor(file, "processRequest");
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ausente");
    expect(result!.confidence).toBe("media");
    const indep = result!.discriminators.find((c) => c.label.includes("no repiten"));
    expect(indep?.passed).toBe(true);
    const rep = result!.discriminators.find((c) => c.label.includes("repite en OTRA función"));
    expect(rep?.passed).toBe(false);
  });

  it("ausente + guardas TODAS sobre el mismo discriminante (despacho plano) CON manejo diverso ⇒ discriminador de independencia NO confirma, confianza baja", async () => {
    const file = await jsFile(`
function classify(x) {
  if (x.kind == 1) return this.next.handleKindOne(x);
  if (x.kind == 2) return handleKindTwo(x);
  if (x.kind == 3) return handleKindThree(x);
  return 0;
}
`);
    const finding = findingFor(file, "classify");
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ausente");
    expect(result!.confidence).toBe("baja");
    const indep = result!.discriminators.find((c) => c.label.includes("no repiten"));
    expect(indep?.passed).toBe(false);
  });

  it("repetición en el mismo archivo: DOS sitios con la misma forma CON manejo diverso ⇒ discriminador de repetición confirma, confianza sube al techo (media)", async () => {
    const source = `
function processRequest(req) {
  if (!req.auth) return this.next.rejectUnauthenticated(req);
  if (!req.payload) return rejectMissingPayload(req);
  if (req.size > 999) return null;
  return handle(req);
}
function processOther(msg) {
  if (!msg.from) return this.next.rejectNoSender(msg);
  if (!msg.to) return rejectNoRecipient(msg);
  if (msg.length > 999) return null;
  return dispatch(msg);
}
`;
    const file = await jsFile(source);
    const finding = findingFor(file, "processRequest");
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("media");
    const rep = result!.discriminators.find((c) => c.label.includes("repite en OTRA función"));
    expect(rep?.passed).toBe(true);
    expect(result!.places.length).toBeGreaterThan(1);
  });

  it("ya-aplicado (AST, homogénea): la MISMA función candidata ya reenvía el MISMO mensaje sobre un campo propio, incluso sin guardas de salida temprana (fixture canónica)", async () => {
    const source = `
class Handler {
  handle(request) {
    if (this.next) {
      this.next.handle(request);
    }
  }
}
`;
    const file = await jsFile(source);
    const finding = findingFor(file, "handle");
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
    expect(result!.confidence).toBeNull();
    const own = result!.checks.find((c) => c.label.includes("Esta MISMA función"));
    expect(own?.passed).toBe(true);
    expect(own?.why).toContain("next");
  });

  it("NUNCA sugiere sobre la forma COMPLETA: 'ya-aplicado' no compite en confianza (confidence null), y toConfirm/ceiling siguen presentes para la UI", async () => {
    const source = `
class Handler {
  handle(request) {
    if (this.next) {
      this.next.handle(request);
    }
  }
}
`;
    const file = await jsFile(source);
    const finding = findingFor(file, "handle");
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result!.state).toBe("ya-aplicado");
    expect(result!.confidence).toBeNull();
  });

  it("control negativo (mismas fixtures canónicas): mensaje reenviado DISTINTO al de la función contenedora, y sin el olor de guardas (mismo caso real: ningún detector dispararía acá) ⇒ ni siquiera candidata (null), nunca 'ya-aplicado'", async () => {
    const source = `
class Cache {
  constructor(logger) {
    this.logger = logger;
  }
  reset() {
    if (this.logger) {
      this.logger.flush();
    }
  }
}
`;
    const file = await jsFile(source);
    const finding = findingFor(file, "reset");
    const result = hypothesis.build(finding, null, ctxFor(file));
    // Ni guarda-run (sólo 1 guarda, sin salida temprana) ni reenvío real
    // (el mensaje llamado es "flush", no "reset") — exactamente el caso en
    // que, en producción, ningún detector many-returns/complexity habría
    // producido un Finding para colgar esto: `null` es la respuesta
    // correcta, no un falso "ausente" fabricado sobre un candidato inexistente.
    expect(result).toBeNull();
  });

  /* ── OLA U (N4) — las dos preguntas de INTENCIÓN, cada una con su falso real ── */

  it("OLA U (N4) — INTENCIÓN 'el sucesor está guardado en un campo propio': AUTO-RECURSIÓN (`this.mismoMensaje(...)`) NO es una cadena, aunque comparta la forma exacta — caso real medido: hugo/navigation/pagemenus.go:118 `pm.HasMenuCurrent(menuID, child)`", async () => {
    const source = `
class Menus {
  hasCurrent(menuID, entry) {
    if (!entry) return false;
    if (entry.isRoot) return true;
    if (this.hasCurrent(menuID, entry.child)) return true;
    return false;
  }
}
`;
    const file = await jsFile(source, "a.js", 2);
    const result = hypothesis.build(findingFor(file, "hasCurrent"), null, ctxFor(file));
    // El receptor es el objeto MISMO: no hay sucesor al que pasarle la
    // responsabilidad. Antes de esta ola esto salía `ya-aplicado`.
    expect(result).toBeNull();
  });

  it("OLA U (N4) — INTENCIÓN 'la solicitud viaja': mismo mensaje + campo propio, pero lo que se le pasa al colaborador es un PEDAZO DEL ESTADO, no la solicitud ⇒ no es cadena — caso real medido: guava .../primitives/ImmutableDoubleArray.java:537 `equals(object) ⇒ this.parent.equals(that.parent)`", async () => {
    const source = `
class AsList {
  equals(object) {
    if (object instanceof AsList) {
      return this.parent.equals(object.parent);
    }
    if (!(object instanceof List)) return false;
    if (this.size() !== object.size()) return false;
    return true;
  }
}
`;
    const file = await jsFile(source, "a.js", 1);
    const result = hypothesis.build(findingFor(file, "equals"), null, ctxFor(file));
    // Mismo nombre de mensaje, campo propio, dentro de una guarda: la forma es
    // idéntica a la de un eslabón. Lo único que las separa es QUÉ viaja.
    expect(result).toBeNull();
  });

  it("OLA U (N4) — las dos preguntas nuevas NO rompen la ivar de Ruby: la fixture canónica (`@next.handle(request)`) sigue siendo ya-aplicado", async () => {
    const source = `
class Handler
  def handle(request)
    if @next
      @next.handle(request)
    end
  end
end
`;
    const file = await rubyFile(source);
    const result = hypothesis.build(findingFor(file, "handle"), null, ctxFor(file));
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
    expect(result!.checks.find((c) => c.label.includes("Esta MISMA función"))?.why).toContain("@next");
  });

  it("OLA U (N4) — el par mínimo: la MISMA clase, la MISMA guarda, el MISMO campo; sólo cambia el argumento — con la solicitud entera ⇒ ya-aplicado, con un pedazo de ella ⇒ ni candidata", async () => {
    const conLaSolicitud = `
class Handler {
  handle(request) {
    if (this.next) {
      this.next.handle(request);
    }
  }
}
`;
    const conUnPedazo = `
class Handler {
  handle(request) {
    if (this.next) {
      this.next.handle(request.body);
    }
  }
}
`;
    const fileA = await jsFile(conLaSolicitud, "a.js", 1);
    expect(hypothesis.build(findingFor(fileA, "handle"), null, ctxFor(fileA))!.state).toBe("ya-aplicado");
    const fileB = await jsFile(conUnPedazo, "b.js", 1);
    expect(hypothesis.build(findingFor(fileB, "handle"), null, ctxFor(fileB))).toBeNull();
  });

  it("parcial: la clase YA tiene un método que reenvía (hermano), pero el sitio candidato no participa — el caso que la regla vieja silenciaba del todo", async () => {
    const source = `
class Handler {
  handle(req) {
    if (!req.a) return null;
    if (!req.b) return null;
    if (!req.c) return null;
    return this.process(req);
  }
  delegate(req) {
    if (this.next) return this.next.delegate(req);
    return null;
  }
}
`;
    const file = await jsFile(source);
    const finding = findingFor(file, "handle");
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result).not.toBeNull();
    expect(result!.state).toBe("parcial");
    expect(result!.confidence).not.toBeNull();
    const own = result!.checks.find((c) => c.label.includes("Esta MISMA función"));
    const sibling = result!.checks.find((c) => c.label.includes("Otro método"));
    expect(own?.passed).toBe(false);
    expect(sibling?.passed).toBe(true);
    expect(sibling?.why).toContain("delegate");
  });

  it("forma SIN clases — Go, dueño resuelto vía receptor (childForFieldName(\"receiver\")), no vía className: ya-aplicado (fixture canónica Go)", async () => {
    const source = `
package main

type Handler struct {
	Next *Handler
}

func (h *Handler) Handle(req *Request) {
	if h.Next != nil {
		h.Next.Handle(req)
	}
}
`;
    const file = await goFile(source);
    const finding = findingFor(file, "Handle");
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
    const own = result!.checks.find((c) => c.label.includes("Esta MISMA función"));
    expect(own?.passed).toBe(true);
  });

  it("forma SIN clases — closure pura (Vue Composition API / función anidada), sin this/self: bareSameNameForward detecta el reenvío ⇒ ya-aplicado (fixture canónica)", async () => {
    const source = `
function useHandler() {
  let next = null;

  function setNext(handler) {
    next = handler;
  }

  function handle(request) {
    if (next) {
      next.handle(request);
    }
  }

  return { setNext, handle };
}
`;
    const file = await jsFile(source);
    const finding = findingFor(file, "handle");
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
    const own = result!.checks.find((c) => c.label.includes("Esta MISMA función"));
    expect(own?.passed).toBe(true);
    expect(own?.why).toContain("next");
  });

  it("BRECHA DECLARADA — forma funcional/free-function (Ruby, sin clase ni receptor, sin reenvío bare tampoco) CON manejo diverso: el excluder de 'hermano' no tiene contra qué comparar", async () => {
    const source = `
def free(req)
  return @next.process_a(req) unless req.a
  return process_b(req) unless req.b
  return nil unless req.c
  process(req)
end
`;
    const file = await rubyFile(source);
    const finding = findingFor(file, "free");
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ausente");
    const sibling = result!.checks.find((c) => c.label.includes("Sin clase/receptor dueño detectable"));
    expect(sibling).toBeDefined();
    expect(sibling?.passed).toBe(false);
    expect(sibling?.why).toContain("Sin dueño");
  });

  it("locateFunction: una ubicación de SUB-RANGO (imita boolean-complexity, no todo el span de la función) igual resuelve la función que la contiene", async () => {
    const file = await jsFile(`
function processRequest(req) {
  if (!req.auth) return this.next.rejectUnauthenticated(req);
  if (!req.payload) return rejectMissingPayload(req);
  if (req.size > 999) return null;
  return handle(req);
}
`);
    const fn = file.functions.find((f) => f.name === "processRequest")!;
    const finding: Finding = {
      id: "f-sub",
      detectorId: "boolean-complexity",
      kind: "boolean-complexity",
      scope: "intra-function",
      language: "javascript",
      title: "t",
      detail: "d",
      trigger: [{ label: "operadores", value: 4, threshold: fakeThreshold() }],
      // Sub-rango DENTRO de la función, no su span completo — la forma real de `boolean-complexity`.
      locations: [{ file: file.path, startLine: fn.startLine + 1, endLine: fn.startLine + 1, symbol: "processRequest", role: "condición" }],
      severity: 50,
      advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    };
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ausente");
  });

  it("toda hipótesis emitida trae ceiling/provisional/source/toConfirm coherentes con el diseño (nunca un literal de confianza a mano); ceiling bajó de alta a media (Ola 10, §0.4)", async () => {
    const file = await jsFile(`
function processRequest(req) {
  if (!req.auth) return this.next.rejectUnauthenticated(req);
  if (!req.payload) return rejectMissingPayload(req);
  if (req.size > 999) return null;
  return handle(req);
}
`);
    const finding = findingFor(file, "processRequest");
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result!.ceiling).toBe("media");
    expect(result!.provisional).toBe(true);
    expect(result!.source).toContain("chain-of-responsibility");
    expect(result!.toConfirm.length).toBeGreaterThan(0);
    expect(result!.anchorFindingId).toBe(finding.id);
  });

  /* ── Grafo — la terna de envoltura y sus vecinas (§0.4 CONTRATO-F10.md) ── */

  /**
   * Grafo compartido por los dos tests de la forma HETEROGÉNEA: la terna de
   * envoltura completa (dos clases distintas implementan la misma interfaz y
   * una llama a la otra por el mismo mensaje). `withAssembly` agrega el SITIO
   * DE ENSAMBLADO — alguien que instancia los DOS eslabones —, que la Ola U
   * (N4) subió de discriminador a compuerta: sin él la cardinalidad de la
   * cadena es uno, y una cadena de un solo eslabón no es una cadena.
   */
  function heteroGraph(withAssembly: boolean): CodeGraph {
    const iface = node({ id: "sym:a.js#IHandler", kind: "symbol", file: "a.js", symbolPath: ["IHandler"], family: "class-like" });
    const ifaceMember = node({ id: "sym:a.js#IHandler.handle", kind: "symbol", file: "a.js", symbolPath: ["IHandler", "handle"], family: "function-like", arity: 1 });
    const wrapper = node({ id: "sym:a.js#Handler", kind: "symbol", file: "a.js", symbolPath: ["Handler"], family: "class-like" });
    const wrapperMember = node({ id: "sym:a.js#Handler.handle", kind: "symbol", file: "a.js", symbolPath: ["Handler", "handle"], family: "function-like", arity: 1 });
    const wrapped = node({ id: "sym:b.js#OtherHandler", kind: "symbol", file: "b.js", symbolPath: ["OtherHandler"], family: "class-like" });
    const wrappedMember = node({ id: "sym:b.js#OtherHandler.handle", kind: "symbol", file: "b.js", symbolPath: ["OtherHandler", "handle"], family: "function-like", arity: 1 });
    const assembler = node({ id: "sym:c.js#buildChain", kind: "symbol", file: "c.js", symbolPath: ["buildChain"], family: "function-like", arity: 0 });
    return makeGraph(
      [iface, ifaceMember, wrapper, wrapperMember, wrapped, wrappedMember, ...(withAssembly ? [assembler] : [])],
      [
        edge({ kind: "contains", from: iface.id, to: ifaceMember.id }),
        edge({ kind: "contains", from: wrapper.id, to: wrapperMember.id }),
        edge({ kind: "contains", from: wrapped.id, to: wrappedMember.id }),
        edge({ kind: "implements", from: wrapper.id, to: iface.id }),
        edge({ kind: "implements", from: wrapped.id, to: iface.id }),
        edge({ kind: "calls", from: wrapperMember.id, to: wrappedMember.id, roles: 2 }),
        ...(withAssembly
          ? [edge({ kind: "instantiates", from: assembler.id, to: wrapper.id }), edge({ kind: "instantiates", from: assembler.id, to: wrapped.id })]
          : []),
      ],
    );
  }

  const HETERO_SOURCE = `
class Handler {
  handle(req) {
    if (!req.a) return null;
    if (!req.b) return null;
    if (!req.c) return null;
    return this.next.handle(req);
  }
}
`;

  it("COMPLETA-heterogénea (grafo): la terna de envoltura MÁS un sitio que ensambla ≥2 eslabones distintos ⇒ ya-aplicado, con el detalle citando la terna y la cardinalidad", async () => {
    const file = await jsFile(HETERO_SOURCE, "a.js", 1);
    const finding = findingFor(file, "handle");
    const graph = heteroGraph(true);
    const result = hypothesis.build(finding, graph, ctxFor(file, graph));
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ya-aplicado");
    const own = result!.checks.find((c) => c.label.includes("Esta MISMA función"));
    expect(own?.why).toContain("Terna de envoltura confirmada por el grafo");
    expect(own?.why).toContain("ensambla 2 eslabones distintos");
  });

  it("OLA U (N4) — INTENCIÓN: la MISMA terna de envoltura SIN ningún sitio que ensamble ≥2 eslabones NO es una cadena completa (cardinalidad uno) — `chain-assembly-evidence` es compuerta, no adorno", async () => {
    const file = await jsFile(HETERO_SOURCE, "a.js", 1);
    const finding = findingFor(file, "handle");
    const graph = heteroGraph(false);
    const result = hypothesis.build(finding, graph, ctxFor(file, graph));
    expect(result).not.toBeNull();
    expect(result!.state).not.toBe("ya-aplicado");
    const own = result!.checks.find((c) => c.label.includes("Esta MISMA función"));
    expect(own?.passed).toBe(false);
  });

  it("PARCIAL (grafo): reenvío homónimo hacia OTRO dueño sin interfaz común ⇒ parcial, ceiling media, evidencia declara el límite de la ranura tipada", async () => {
    const source = `
class Handler {
  handle(req) {
    if (!req.a) return null;
    return this.next.handle(req);
  }
}
`;
    const file = await jsFile(source, "a.js", 1);
    const finding = findingFor(file, "handle");
    const wrapper = node({ id: "sym:a.js#Handler", kind: "symbol", file: "a.js", symbolPath: ["Handler"], family: "class-like" });
    const wrapperMember = node({ id: "sym:a.js#Handler.handle", kind: "symbol", file: "a.js", symbolPath: ["Handler", "handle"], family: "function-like", arity: 1 });
    const other = node({ id: "sym:b.js#Other", kind: "symbol", file: "b.js", symbolPath: ["Other"], family: "class-like" });
    const otherMember = node({ id: "sym:b.js#Other.handle", kind: "symbol", file: "b.js", symbolPath: ["Other", "handle"], family: "function-like", arity: 1 });
    const graph = makeGraph(
      [wrapper, wrapperMember, other, otherMember],
      [
        edge({ kind: "contains", from: wrapper.id, to: wrapperMember.id }),
        edge({ kind: "contains", from: other.id, to: otherMember.id }),
        edge({ kind: "calls", from: wrapperMember.id, to: otherMember.id, roles: 2 }),
      ],
    );
    const result = hypothesis.build(finding, graph, ctxFor(file, graph));
    expect(result).not.toBeNull();
    expect(result!.state).toBe("parcial");
    expect(result!.ceiling).toBe("media");
    const parcialCheck = result!.checks.find((c) => c.label.includes("Un solo eslabón"));
    expect(parcialCheck?.passed).toBe(true);
    expect(parcialCheck?.why).toContain("SIN interfaz común");
  });

  it("excluye super.m(): misma forma exacta (calls receiver-member, mismo nombre/aridad) pero CON extends entre los dos dueños ⇒ el grafo no la cuenta como completa/parcial (cae a AST/ausente)", async () => {
    const source = `
class Base {
  handle(req) {
    if (!req.a) return this.next.rejectMissingA(req);
    if (!req.b) return rejectMissingB(req);
    if (!req.c) return null;
    return process(req);
  }
}
`;
    const file = await jsFile(source, "a.js", 1);
    const finding = findingFor(file, "handle");
    const base = node({ id: "sym:a.js#Base", kind: "symbol", file: "a.js", symbolPath: ["Base"], family: "class-like" });
    const baseMember = node({ id: "sym:a.js#Base.handle", kind: "symbol", file: "a.js", symbolPath: ["Base", "handle"], family: "function-like", arity: 1 });
    const child = node({ id: "sym:a.js#Child", kind: "symbol", file: "a.js", symbolPath: ["Child"], family: "class-like" });
    const childMember = node({ id: "sym:a.js#Child.handle", kind: "symbol", file: "a.js", symbolPath: ["Child", "handle"], family: "function-like", arity: 1 });
    const graph = makeGraph(
      [base, baseMember, child, childMember],
      [
        edge({ kind: "contains", from: base.id, to: baseMember.id }),
        edge({ kind: "contains", from: child.id, to: childMember.id }),
        edge({ kind: "extends", from: child.id, to: base.id }),
        edge({ kind: "calls", from: childMember.id, to: baseMember.id, roles: 2 }),
      ],
    );
    // El finding ancla en Base.handle (no en Child), así que la arista de
    // super.m() (Child->Base) no sale de `Base.handle` — confirma que el
    // grafo no encuentra ninguna arista propia y la forma cae a AST puro.
    const result = hypothesis.build(finding, graph, ctxFor(file, graph));
    expect(result).not.toBeNull();
    expect(result!.state).toBe("ausente");
  });

  it("OLA V (V4) — PIDO de V1: una arista calls(receiver-member) de la función candidata hacia SÍ MISMA (mismo símbolo, misma aridad) NO alcanza para 'ya-aplicado' por grafo — es indistinguible de un sucesor real del mismo tipo, y el diagnóstico del propio módulo ('la arista es la misma') se convierte en código, no sólo en texto", async () => {
    const source = `
class Handler {
  handle(req) {
    if (!req.a) return this.next.rejectA(req);
    if (!req.b) return rejectB(req);
    if (!req.c) return null;
    return process(req);
  }
}
`;
    const file = await jsFile(source, "a.js", 1);
    const finding = findingFor(file, "handle");
    const handler = node({ id: "sym:a.js#Handler", kind: "symbol", file: "a.js", symbolPath: ["Handler"], family: "class-like" });
    const handleMember = node({ id: "sym:a.js#Handler.handle", kind: "symbol", file: "a.js", symbolPath: ["Handler", "handle"], family: "function-like", arity: 1 });
    const graph = makeGraph(
      [handler, handleMember],
      [
        edge({ kind: "contains", from: handler.id, to: handleMember.id }),
        // La misma forma que ANTES de esta ola producía "completa" (ya-aplicado):
        // `handle` "se llama a sí misma" por grafo — indistinguible de un
        // sucesor real del MISMO tipo (`this.next.handle()` con `next: Handler`
        // resolvería a este MISMO nodo, por símbolo, no por instancia).
        edge({ kind: "calls", from: handleMember.id, to: handleMember.id, roles: 2 }),
      ],
    );
    const result = hypothesis.build(finding, graph, ctxFor(file, graph));
    expect(result).not.toBeNull();
    // El guarda-run (this.next.rejectA + rejectB + process, diverso, con
    // sucesor propio en al menos una rama) sigue siendo candidato — pero el
    // ESTADO no puede ser "ya-aplicado" con esta única evidencia de grafo.
    expect(result!.state).toBe("ausente");
    const completa = result!.checks.find((c) => c.label.includes("Esta MISMA función"));
    expect(completa?.passed).toBe(false);
    expect(completa?.why).not.toContain("Auto-recursión confirmada por el grafo");
  });

  it("discriminador chain-assembly-evidence: un sitio instancia >=2 tipos distintos que comparten el mensaje ⇒ discriminador confirma (sube confianza en la forma PARCIAL)", async () => {
    const source = `
class Handler {
  handle(req) {
    if (!req.a) return null;
    return this.next.handle(req);
  }
}
`;
    const file = await jsFile(source, "a.js", 1);
    const finding = findingFor(file, "handle");
    const wrapper = node({ id: "sym:a.js#Handler", kind: "symbol", file: "a.js", symbolPath: ["Handler"], family: "class-like" });
    const wrapperMember = node({ id: "sym:a.js#Handler.handle", kind: "symbol", file: "a.js", symbolPath: ["Handler", "handle"], family: "function-like", arity: 1 });
    const other = node({ id: "sym:b.js#Other", kind: "symbol", file: "b.js", symbolPath: ["Other"], family: "class-like" });
    const otherMember = node({ id: "sym:b.js#Other.handle", kind: "symbol", file: "b.js", symbolPath: ["Other", "handle"], family: "function-like", arity: 1 });
    const assembler = node({ id: "sym:main.js#assemble", kind: "symbol", file: "main.js", symbolPath: ["assemble"], family: "function-like", arity: 0 });
    const graph = makeGraph(
      [wrapper, wrapperMember, other, otherMember, assembler],
      [
        edge({ kind: "contains", from: wrapper.id, to: wrapperMember.id }),
        edge({ kind: "contains", from: other.id, to: otherMember.id }),
        edge({ kind: "calls", from: wrapperMember.id, to: otherMember.id, roles: 2 }),
        edge({ kind: "instantiates", from: assembler.id, to: wrapper.id }),
        edge({ kind: "instantiates", from: assembler.id, to: other.id }),
      ],
    );
    const result = hypothesis.build(finding, graph, ctxFor(file, graph));
    expect(result).not.toBeNull();
    const found = result!.discriminators.find((c) => c.label.includes("instancia"));
    expect(found?.passed).toBe(true);
  });

  it("sin grafo: el check de eslabón único y el discriminador de ensamblado declaran el límite en vez de inventar evidencia", async () => {
    const source = `
class Handler {
  handle(req) {
    if (!req.a) return this.other.rejectMissingA(req);
    if (!req.b) return rejectMissingB(req);
    if (!req.c) return null;
    return process(req);
  }
}
`;
    const file = await jsFile(source);
    const finding = findingFor(file, "handle");
    const result = hypothesis.build(finding, null, ctxFor(file));
    expect(result).not.toBeNull();
    const parcialCheck = result!.checks.find((c) => c.label.includes("Un solo eslabón"));
    expect(parcialCheck?.passed).toBe(false);
    expect(parcialCheck?.why).toContain("LÍMITE DE CABLEADO");
    const assembly = result!.discriminators.find((c) => c.label.includes("instancia"));
    expect(assembly?.passed).toBe(false);
    expect(assembly?.why).toContain("Sin grafo");
  });

  describe("Ola 11 — refresh() (registro de pendientes §B1, 1 de 17 → N)", () => {
    it("chain-assembly-evidence: build() con graph=null (límite de cableado real) lo deja en falso; refresh() con el MISMO grafo real (vía nameArity cacheado en build(), sin árbol) lo confirma sin tocar `state`", async () => {
      const file = await jsFile(
        `
function processRequest(req) {
  if (!req.auth) return this.next.rejectUnauthenticated(req);
  if (!req.payload) return rejectMissingPayload(req);
  if (req.size > 999) return null;
  return handle(req);
}
`,
        "a.js",
        1, // `jsFile` sin este 3er argumento deja `metrics.parameters` en 0 (default del helper de test, no del parser real) — hace falta para que coincida con la aridad 1 de los miembros del grafo abajo.
      );
      const finding = findingFor(file, "processRequest");
      // Dos clases DISTINTAS, en OTROS archivos, comparten un miembro
      // "processRequest"/aridad 1 — el MISMO mensaje que la función candidata
      // (nunca un reenvío de la función candidata en sí: `chainAssemblyEvidence`
      // sólo pregunta si el MENSAJE (nombre+aridad) de este candidato se
      // ensambla en >=2 tipos en algún sitio del grafo, no si esta función
      // reenvía nada).
      const handlerA = node({ id: "sym:a.js#HandlerA", kind: "symbol", file: "a.js", symbolPath: ["HandlerA"], family: "class-like" });
      const handlerAMember = node({ id: "sym:a.js#HandlerA.processRequest", kind: "symbol", file: "a.js", symbolPath: ["HandlerA", "processRequest"], family: "function-like", arity: 1 });
      const handlerB = node({ id: "sym:b.js#HandlerB", kind: "symbol", file: "b.js", symbolPath: ["HandlerB"], family: "class-like" });
      const handlerBMember = node({ id: "sym:b.js#HandlerB.processRequest", kind: "symbol", file: "b.js", symbolPath: ["HandlerB", "processRequest"], family: "function-like", arity: 1 });
      const assembler = node({ id: "sym:main.js#assemble", kind: "symbol", file: "main.js", symbolPath: ["assemble"], family: "function-like", arity: 0 });
      const graph = makeGraph(
        [handlerA, handlerAMember, handlerB, handlerBMember, assembler],
        [
          edge({ kind: "contains", from: handlerA.id, to: handlerAMember.id }),
          edge({ kind: "contains", from: handlerB.id, to: handlerBMember.id }),
          edge({ kind: "instantiates", from: assembler.id, to: handlerA.id }),
          edge({ kind: "instantiates", from: assembler.id, to: handlerB.id }),
        ],
      );

      // build() en producción SIEMPRE ve graph=null para este ancla (docstring del módulo) — se simula pasando null.
      const built = hypothesis.build(finding, null, ctxFor(file))!;
      expect(built).not.toBeNull();
      const before = built.discriminators.find((c) => c.label.includes("instancia"));
      expect(before?.passed).toBe(false);

      // refresh() (Ola 10, crossAnalyze) SÍ recibe el grafo real.
      const refreshed = hypothesis.refresh!(built, finding, graph, ctxFor(null, graph));
      expect(refreshed).not.toBeNull();
      expect(refreshed!.state).toBe(built.state); // NUNCA cambia — límite de contrato.
      const after = refreshed!.discriminators.find((c) => c.label.includes("instancia"));
      expect(after?.passed).toBe(true);
    });

    it("varios-candidatos-en-el-vecindario: build() con EMPTY_NEIGHBORHOOD lo deja en falso; refresh() con ctx.neighborhood.findingsInFile mostrando OTRO hallazgo de la misma familia lo confirma — Y preserva (congelados) los discriminadores de AST ya confirmados en build()", async () => {
      const file = await jsFile(`
function processRequest(req) {
  if (!req.auth) return this.next.rejectUnauthenticated(req);
  if (!req.payload) return rejectMissingPayload(req);
  if (req.size > 999) return null;
  return handle(req);
}
`);
      const finding = findingFor(file, "processRequest");
      const built = hypothesis.build(finding, null, ctxFor(file))!;
      expect(built).not.toBeNull();
      expect(built.confidence).toBe("media"); // sólo "no repiten" (AST) confirmado — igual que antes de esta ola.
      const beforeNeighborhood = built.discriminators.find((c) => c.label.includes("ctx.neighborhood.findingsInFile"));
      expect(beforeNeighborhood?.passed).toBe(false);
      const indepBefore = built.discriminators.find((c) => c.label.includes("no repiten"));
      expect(indepBefore?.passed).toBe(true);

      const otherFinding: Finding = { ...finding, id: "f-other", locations: [{ ...finding.locations[0]!, symbol: "processOther" }] };
      const refreshCtx: HypothesisContext = { ...ctxFor(null), neighborhood: { ...EMPTY_NEIGHBORHOOD, findingsInFile: () => [otherFinding] } };
      const refreshed = hypothesis.refresh!(built, finding, null, refreshCtx);
      expect(refreshed).not.toBeNull();
      expect(refreshed!.state).toBe(built.state);
      const afterNeighborhood = refreshed!.discriminators.find((c) => c.label.includes("ctx.neighborhood.findingsInFile"));
      expect(afterNeighborhood?.passed).toBe(true);
      // El discriminador de AST ("no repiten") NO se recalculó con árbol nulo (hubiera dado `false`/crash) — se REUSÓ congelado desde `build()`.
      const indepAfter = refreshed!.discriminators.find((c) => c.label.includes("no repiten"));
      expect(indepAfter?.passed).toBe(true);
    });

    it("hipótesis 'ya-aplicado' no compite por confianza: refresh() no la toca (devuelve null)", async () => {
      const source = `
class Handler {
  handle(request) {
    if (this.next) {
      this.next.handle(request);
    }
  }
}
`;
      const file = await jsFile(source);
      const finding = findingFor(file, "handle");
      const built = hypothesis.build(finding, null, ctxFor(file))!;
      expect(built.state).toBe("ya-aplicado");
      expect(hypothesis.refresh!(built, finding, null, ctxFor(null))).toBeNull();
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AE — FRENTE AE5. EL CAMINO DEL ANCLA-FUERZA (`exclusive-dispatch-ladder`).
 *
 * Estos tests prueban DOS cosas distintas y hay que leerlas separadas:
 *   1. que el camino NUEVO produce los dos estados que son RECOMENDACIÓN
 *      (`ausente` y `parcial`) y que sus tres `required` rechazan cuando no
 *      pueden mirar — nunca "no pude, apruebo";
 *   2. **que el camino VIEJO no se movió ni un milímetro** — el test de abajo
 *      del todo es la prueba por construcción de que esta ola fue aditiva.
 * ══════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════
 * OLA AJ — FRENTE AJ4. LAS DOS TRADUCCIONES DE GRAMÁTICA, UN TEST POR INTENCIÓN.
 * Cada uno fija una intención, no una forma; y los tres controles negativos
 * fijan lo que NO se movió, que es la mitad medida de este frente.
 * ══════════════════════════════════════════════════════════════════════════ */
describe("hypotheses/chain-of-responsibility — Ola AJ (AJ4): C# y el calificador implícito", () => {
  /** INTENCIÓN: "¿el reconocedor VE la llamada que el archivo ya tiene escrita?"
   *  C# escribe `invocation_expression`; sin ese tipo de nodo ninguna de las
   *  cuatro puertas del módulo veía una sola llamada en C#, para el lenguaje
   *  entero. Acá el reenvío es la forma CALIFICADA (`this._next.Handle`), que no
   *  necesita ningún otro arreglo: si esto pasa, la traducción de la LLAMADA y
   *  la del RECEPTOR (`member_access_expression.expression`) funcionan. */
  it("C#: la cadena canónica `this._next.Handle(request)` ⇒ ya-aplicado — antes era INVISIBLE porque `invocation_expression` no estaba en CALL_NODE_TYPES", async () => {
    const file = await csharpFile(`
public class Handler {
    private Handler _next;
    public Result Handle(Request request) {
        if (request.Simple) { return this._next.Handle(request); }
        return null;
    }
}
`);
    const h = hypothesis.build(findingFor(file, "Handle"), null, ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
  });

  /** INTENCIÓN: "el sucesor está guardado en un campo de ESTE manejador" —
   *  la MISMA de la Ola V, leída donde la gramática permite omitir `this.`.
   *  Las otras tres preguntas del `required` siguen enteras y las tres se
   *  cumplen acá: 3 guardas cortas, 3 mensajes de manejo DISTINTOS sin repetir,
   *  y la solicitud (`request`) viaja en las tres. */
  it("C#: guarda-run con manejo diverso cuyo receptor es un campo de instancia SIN `this.` (la forma idiomática) ⇒ candidata `ausente`", async () => {
    const file = await csharpFile(`
public class Router {
    private Cache cache;
    private Backend backend;
    public Result Handle(Request request) {
        if (request.A) return cache.Lookup(request);
        if (request.B) return backend.Fetch(request);
        if (request.C) return this.Local(request);
        return null;
    }
}
`);
    const h = hypothesis.build(findingFor(file, "Handle"), null, ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });

  /** MISMA intención, en la otra gramática con calificador opcional. */
  it("Java: guarda-run con manejo diverso cuyo receptor es un campo de instancia SIN `this.` ⇒ candidata `ausente`", async () => {
    const file = await javaFile(`
class Router {
    private Cache cache;
    private Backend backend;
    public Result handle(Request request) {
        if (request.a()) return cache.lookup(request);
        if (request.b()) return backend.fetch(request);
        if (request.c()) return this.local(request);
        return null;
    }
}
`);
    const h = hypothesis.build(findingFor(file, "handle"), null, ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });

  /** CONTROL NEGATIVO 1 — la intención de la Ola V, palabra por palabra: "un
   *  campo estático COMPARTIDO no es un sucesor guardado en ESTE manejador".
   *  Es el caso real que la Ola V midió y silenció a propósito
   *  (`guava-testlib/.../ArbitraryInstances.java:359`, `DEFAULTS.getInstance`),
   *  y el ÚNICO sobreviviente Java del escalón previo en los 21 repos: la
   *  traducción NO lo reabre. */
  it("CONTROL: los campos COMPARTIDOS (`static`) no cuentan como sucesor propio ⇒ sigue sin ser candidata", async () => {
    const file = await csharpFile(`
public class Table {
    private static Cache cache;
    private static Backend backend;
    public Result Handle(Request request) {
        if (request.A) return cache.Lookup(request);
        if (request.B) return backend.Fetch(request);
        if (request.C) return Helper.Third(request);
        return null;
    }
}
`);
    expect(hypothesis.build(findingFor(file, "Handle"), null, ctxFor(file))).toBeNull();
  });

  /** CONTROL NEGATIVO 2 — SOMBRA: si un local de la propia función lleva el
   *  nombre del campo, el identificador desnudo ya no nombra al campo. No se
   *  adivina cuál gana: se saca. */
  it("CONTROL: un LOCAL que tapa el nombre del campo ⇒ el identificador desnudo ya no es el campo, sigue sin ser candidata", async () => {
    const file = await csharpFile(`
public class Router {
    private Cache cache;
    private Backend backend;
    public Result Handle(Request request) {
        var cache = Build();
        var backend = Build();
        if (request.A) return cache.Lookup(request);
        if (request.B) return backend.Fetch(request);
        if (request.C) return Helper.Third(request);
        return null;
    }
}
`);
    expect(hypothesis.build(findingFor(file, "Handle"), null, ctxFor(file))).toBeNull();
  });

  /** CONTROL NEGATIVO 3 — **EL QUE FIJA LA DECISIÓN MEDIDA DE ESTE FRENTE.**
   *  `findForwardField` NO recibe el calificador implícito: extenderlo ahí
   *  produce 23 hipótesis nuevas en los 21 repos y las 23 son DELEGACIÓN A UN
   *  COMPONENTE (`countMap`, `map`, `client`, `args`, `core`…), la ambigüedad
   *  que el módulo declara sin resolver desde la Ola 10. Acá `remove` reenvía
   *  el MISMO mensaje al campo desnudo `inner` pasándole la solicitud —
   *  exactamente la forma de `guava/ConcurrentHashMultiset` — y `other`
   *  NO puede volverse `parcial` por eso. */
  it("CONTROL: un hermano que delega el MISMO mensaje a un campo COMPONENTE desnudo NO convierte al candidato en `parcial` (la mitad que este frente midió y NO aterrizó)", async () => {
    const file = await javaFile(`
class Store {
    private Map inner;
    public Object remove(Object key) {
        if (key == null) return null;
        return inner.remove(key);
    }
    public Object other(Object key) {
        if (key == null) return null;
        if (key.equals(1)) return null;
        if (key.equals(2)) return null;
        return null;
    }
}
`);
    expect(hypothesis.build(findingFor(file, "other"), null, ctxFor(file))).toBeNull();
  });
});

describe("hypotheses/chain-of-responsibility — el ancla-fuerza de la Ola AE", () => {
  const LADDER_SOURCE = `
class Router {
  dispatch(req) {
    if (req.isUpload) { return this.uploads.store(req); }
    if (req.hasSession) { return this.sessions.renew(req); }
    if (looksLikeBot(req)) { return this.throttle.reject(req); }
    if (req.wantsHtml) { return this.pages.render(req); }
    return null;
  }
}
`;
  const DESTINOS = ["store", "renew", "reject", "render"] as const;

  function ladderGraph(extraNodes: CodeGraphNode[] = [], extraEdges: CodeGraphEdge[] = []): CodeGraph {
    const sender = node({ id: "sym:a.js#Router.dispatch", kind: "symbol", file: "a.js", symbolPath: ["Router", "dispatch"], family: "function-like" });
    const nodes: CodeGraphNode[] = [sender, ...extraNodes];
    const edges: CodeGraphEdge[] = [...extraEdges];
    for (const d of DESTINOS) {
      const id = `sym:h/${d}.js#H${d}.${d}`;
      nodes.push(node({ id, kind: "symbol", file: `h/${d}.js`, symbolPath: [`H${d}`, d], family: "function-like" }));
      edges.push(edge({ kind: "calls", from: sender.id, to: id }));
    }
    return makeGraph(nodes, edges);
  }

  async function ladderFile(): Promise<FileUnit> {
    return jsFile(LADDER_SOURCE, "a.js");
  }

  it("AUSENTE: la escalera está, los destinos son exclusivos y NO comparten protocolo ⇒ recomendación `ausente`", async () => {
    const file = await ladderFile();
    const finding = findingFor(file, "dispatch", "exclusive-dispatch-ladder");
    const built = hypothesis.build(finding, ladderGraph(), ctxFor(file, ladderGraph()));
    expect(built).not.toBeNull();
    expect(built!.state).toBe("ausente");
    // los TRES `required` pasan…
    expect(built!.checks.filter((c) => c.role !== "applied").every((c) => c.passed)).toBe(true);
    // …y la escalera de estado dice que no hay NADA del patrón puesto: ni
    // protocolo común entre los destinos, ni cadena armada.
    expect(built!.checks.filter((c) => c.role === "applied").every((c) => !c.passed)).toBe(true);
  });

  it("PARCIAL: los dueños de dos destinos ya apuntan al mismo supertipo ⇒ la familia existe, falta que el sitio deje de enumerarla", async () => {
    const graph = ladderGraph(
      [node({ id: "sym:i.js#IHandler", kind: "symbol", file: "i.js", symbolPath: ["IHandler"], family: "class-like" })],
      [
        edge({ kind: "implements", from: "sym:h/store.js#Hstore", to: "sym:i.js#IHandler" }),
        edge({ kind: "implements", from: "sym:h/renew.js#Hrenew", to: "sym:i.js#IHandler" }),
      ],
    );
    const file = await ladderFile();
    const finding = findingFor(file, "dispatch", "exclusive-dispatch-ladder");
    const built = hypothesis.build(finding, graph, ctxFor(file, graph));
    expect(built!.state).toBe("parcial");
  });

  it("required `destinos-que-solo-este-sitio-enumera`: si OTRO símbolo llama a ≥2 destinos ⇒ no hay hipótesis", async () => {
    const graph = ladderGraph(
      [node({ id: "sym:b.js#Otro.elige", kind: "symbol", file: "b.js", symbolPath: ["Otro", "elige"], family: "function-like" })],
      [
        edge({ kind: "calls", from: "sym:b.js#Otro.elige", to: "sym:h/store.js#Hstore.store" }),
        edge({ kind: "calls", from: "sym:b.js#Otro.elige", to: "sym:h/renew.js#Hrenew.renew" }),
      ],
    );
    const file = await ladderFile();
    const finding = findingFor(file, "dispatch", "exclusive-dispatch-ladder");
    expect(hypothesis.build(finding, graph, ctxFor(file, graph))).toBeNull();
  });

  it("required `destinos-que-solo-este-sitio-enumera`: si un destino llama a otro destino (la cadena YA está) ⇒ no hay hipótesis", async () => {
    const graph = ladderGraph([], [edge({ kind: "calls", from: "sym:h/store.js#Hstore.store", to: "sym:h/renew.js#Hrenew.renew" })]);
    const file = await ladderFile();
    const finding = findingFor(file, "dispatch", "exclusive-dispatch-ladder");
    expect(hypothesis.build(finding, graph, ctxFor(file, graph))).toBeNull();
  });

  it("SIN ÁRBOL VIVO no aprueba: los tres `required` fallan y no hay hipótesis (nunca 'no pude mirar, apruebo')", async () => {
    const file = await ladderFile();
    const finding = findingFor(file, "dispatch", "exclusive-dispatch-ladder");
    expect(hypothesis.build(finding, ladderGraph(), ctxFor(null, ladderGraph()))).toBeNull();
  });

  it("SIN GRAFO no aprueba: la exclusividad de los destinos no se puede afirmar ⇒ no hay hipótesis", async () => {
    const file = await ladderFile();
    const finding = findingFor(file, "dispatch", "exclusive-dispatch-ladder");
    expect(hypothesis.build(finding, null, ctxFor(file, null))).toBeNull();
  });

  it("required `condiciones-independientes`: todas las condiciones sobre un único discriminante ⇒ no hay hipótesis (eso es Strategy/State)", async () => {
    const file = await jsFile(
      `
class Router {
  dispatch(req) {
    if (kind === 1) { return this.uploads.store(req); }
    if (kind === 2) { return this.sessions.renew(req); }
    if (kind === 3) { return this.throttle.reject(req); }
    if (kind === 4) { return this.pages.render(req); }
    return null;
  }
}
`,
      "a.js",
    );
    const finding = findingFor(file, "dispatch", "exclusive-dispatch-ladder");
    expect(hypothesis.build(finding, ladderGraph(), ctxFor(file, ladderGraph()))).toBeNull();
  });

  // OLA AY (AY2): `complexity`/`boolean-complexity` ya no están en `anchors`, así
  // que en producción `run.ts` no rutea esos kinds hasta acá. `build()` SÍ sigue
  // construyendo para los tres —el recorte es de ruteo, no de lógica—, y este
  // test lo fija: volver a encender las anclas es UNA línea y este camino sigue
  // dando el mismo resultado que daba.
  it("EL CAMINO VIEJO NO SE MOVIÓ: el mismo `Handler.handle` de siempre sigue dando `ya-aplicado` con las tres anclas viejas", async () => {
    const source = `
class Handler {
  handle(request) {
    if (this.next) {
      this.next.handle(request);
    }
  }
}
`;
    const file = await jsFile(source);
    for (const kind of ["many-returns", "complexity", "boolean-complexity"] as const) {
      const built = hypothesis.build(findingFor(file, "handle", kind), null, ctxFor(file));
      expect(built, kind).not.toBeNull();
      expect(built!.state, kind).toBe("ya-aplicado");
    }
  });
});
