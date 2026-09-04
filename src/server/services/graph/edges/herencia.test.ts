/**
 * Test de `herencia` — ver el docstring de `herencia.ts`. Reusa, sin
 * editarlos, los módulos YA EXISTENTES `detect/testing.ts` (arranque real de
 * `web-tree-sitter`, `deriveNodeSets`/`nodeSetsFor` reales) y el registro de
 * aristas compartido `graph/edges/{types,sentinel}.ts`.
 */
import { describe, expect, it } from "vitest";

import { fileUnitFrom, nodeSetsFor, parseRoot } from "../../detect/testing.js";
import type { EdgeContext } from "./types.js";
import { extractor, profileFor, warmUp } from "./herencia.js";

const WASM: Readonly<Record<string, string>> = {
  ruby: "tree-sitter-ruby.wasm",
  python: "tree-sitter-python.wasm",
  javascript: "tree-sitter-javascript.wasm",
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  vue: "tree-sitter-typescript.wasm", // vue's <script> se parsea como TS (mismo criterio que code-analyzer.ts)
  java: "tree-sitter-java.wasm",
  csharp: "tree-sitter-c_sharp.wasm",
  go: "tree-sitter-go.wasm",
};

/** Sondas mínimas: ejercitan una clase con método para que `classNodes`
 *  derive no vacío — §5 de la plantilla de detectores ("si la sonda no
 *  ejercita una construcción, esa construcción no existe"). */
const PROBE: Readonly<Record<string, string>> = {
  ruby: "class Probe\n  def m\n  end\nend\n",
  python: "class Probe:\n    def m(self):\n        pass\n",
  javascript: "class Probe {\n  m() {}\n}\n",
  // La declaración de INTERFAZ es parte de la sonda a propósito: los
  // `probeSource` REALES de `code-analyzer.ts` (JAVA_PROBE, CSHARP_PROBE,
  // TS_FAMILY_PROBE) declaran los tres una interfaz, así que
  // `interface_declaration` sí está en `classNodes` en producción — sin ella
  // acá el test mediría un `classNodes` más pobre que el real y la forma de
  // interfaz (ver "LA FORMA DE INTERFAZ" en herencia.ts) quedaría invisible
  // por un artefacto del arnés, no del extractor.
  typescript: "class Probe {\n  m(): void {}\n}\ninterface ProbeIface {\n  m(): void;\n}\n",
  tsx: "class Probe {\n  m(): void {}\n}\ninterface ProbeIface {\n  m(): void;\n}\n",
  vue: "class Probe {\n  m(): void {}\n}\ninterface ProbeIface {\n  m(): void;\n}\n",
  java: "class Probe { void m() { } }\ninterface ProbeIface { void m(); }",
  csharp: "class Probe { void M() { } }\ninterface IProbe { void M(); }",
  go: "package main\n\ntype Probe struct{}\n\nfunc (p *Probe) M() {}\n",
};

/** Cachea, por lenguaje, si `warmUp` ya corrió en este proceso — evita
 *  re-parsear el centinela por test. */
const warmed = new Set<string>();

async function ensureWarm(language: string): Promise<void> {
  if (warmed.has(language)) return;
  const sentinelSource = extractor.sentinel[language];
  if (sentinelSource) {
    const root = await parseRoot(WASM[language]!, sentinelSource);
    warmUp(language, root);
  }
  warmed.add(language);
}

/** Corre `extractor.extract` de punta a punta: calienta la sonda (si el
 *  lenguaje la declara), arma el `FileUnit` real, y construye el
 *  `EdgeContext` cuyo `carriers()` devuelve EXACTAMENTE lo que `warmUp`
 *  resolvió — mismo puente async→sync que documentan `herencia.ts`/
 *  `interfaz-declarada.ts`. */
async function runOn(language: string, source: string) {
  await ensureWarm(language);
  const sets = await nodeSetsFor(WASM[language]!, PROBE[language]!);
  const root = await parseRoot(WASM[language]!, source);
  const file = fileUnitFrom(root, sets, language);
  const profile = profileFor(language);
  const ctx: EdgeContext = {
    language,
    capabilities: new Set(["herencia"]),
    carriers: (slot) => (slot === extractor.slots[0] ? (profile?.carriers ?? []) : []),
    suppressedRolePaths: [],
  };
  return extractor.extract(file, ctx);
}

describe("herencia", () => {
  it("ruby: `class Derived < Base` es una arista extends", async () => {
    const facts = await runOn("ruby", "class Base\nend\n\nclass Derived < Base\nend\n");
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      kind: "extends",
      fromPath: ["Derived"],
      toName: "Base",
      toQualifier: [],
      provenance: "declared",
    });
  });

  it("ruby control negativo: una clase sin superclase explícita no dispara nada", async () => {
    const facts = await runOn("ruby", "class Standalone\n  def m\n  end\nend\n");
    expect(facts).toHaveLength(0);
  });

  it("ruby: superclase calificada (`Sentinel::Base`) se descompone en toName + toQualifier", async () => {
    const facts = await runOn("ruby", "class Derived < Support::Base\nend\n");
    expect(facts).toHaveLength(1);
    expect(facts[0]!.toName).toBe("Base");
    expect(facts[0]!.toQualifier).toEqual(["Support"]);
  });

  it("python: herencia múltiple real (`class X(A, B)`) emite DOS aristas, no una", async () => {
    const facts = await runOn(
      "python",
      "class Base:\n    pass\n\n\nclass Mixin:\n    pass\n\n\nclass Derived(Base, Mixin):\n    pass\n",
    );
    expect(facts.map((f) => f.toName).sort()).toEqual(["Base", "Mixin"]);
    expect(facts[0]!.fromPath).toEqual(["Derived"]);
  });

  it("python: `metaclass=X` (keyword_argument) NUNCA se confunde con una base", async () => {
    const facts = await runOn(
      "python",
      "class Base:\n    pass\n\n\nclass Derived(Base, metaclass=SomeMeta):\n    pass\n",
    );
    expect(facts.map((f) => f.toName)).toEqual(["Base"]);
  });

  it("python control negativo: una clase sin bases no dispara nada", async () => {
    const facts = await runOn("python", "class Standalone:\n    def m(self):\n        pass\n");
    expect(facts).toHaveLength(0);
  });

  it("javascript: `class Derived extends Base` es una arista extends", async () => {
    const facts = await runOn("javascript", "class Base {}\n\nclass Derived extends Base {\n  m() {}\n}\n");
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ kind: "extends", fromPath: ["Derived"], toName: "Base", toQualifier: [] });
  });

  it("javascript control negativo: una clase sin `extends` no dispara nada", async () => {
    const facts = await runOn("javascript", "class Standalone {\n  m() {}\n}\n");
    expect(facts).toHaveLength(0);
  });

  it("javascript: `extends mod.Base` (member_expression calificado) SÍ se reconoce — el calificador viaja en `toQualifier` (Ola P; antes era un límite declarado)", async () => {
    const facts = await runOn("javascript", "class Derived extends mod.Base {\n  m() {}\n}\n");
    // Ver "SIMPLIFICACIONES DECLARADAS" en herencia.ts: la calificación se
    // pela del TEXTO con los dos separadores que `resolve.ts#splitQualifierText`
    // ya trata indistintamente, así que no hace falta una segunda convención
    // de campos por gramática (`object`/`property` en JS vs `scope`/`name` en
    // Ruby) para que esta forma llegue al grafo.
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ kind: "extends", fromPath: ["Derived"], toName: "Base", toQualifier: ["mod"] });
  });

  it("javascript: `extends mixin(Base)` (una LLAMADA, no un nombre) sigue sin disparar — la guarda es de FORMA, nunca una lista de nombres", async () => {
    const facts = await runOn("javascript", "class Derived extends mixin(Base) {\n  m() {}\n}\n");
    expect(facts).toHaveLength(0);
  });

  it("typescript: `class Derived extends Base` es una arista extends", async () => {
    const facts = await runOn("typescript", "class Base {}\n\nclass Derived extends Base {\n  m(): void {}\n}\n");
    expect(facts).toHaveLength(1);
    expect(facts[0]!.toName).toBe("Base");
  });

  it("typescript: `implements` sin `extends` no dispara nada (no confunde interfaz con clase base)", async () => {
    const facts = await runOn("typescript", "interface Iface {}\n\nclass Derived implements Iface {\n  m(): void {}\n}\n");
    expect(facts).toHaveLength(0);
  });

  it("typescript: `extends Base<T>` (genérico) SÍ se reconoce — `type_arguments` es un campo separado de `value`", async () => {
    const facts = await runOn("typescript", "class Base<T> {}\n\nclass Derived extends Base<string> {\n  m(): void {}\n}\n");
    expect(facts).toHaveLength(1);
    expect(facts[0]!.toName).toBe("Base");
  });

  it("tsx: emite igual que typescript (misma gramática de clases)", async () => {
    const facts = await runOn("tsx", "class Base {}\n\nclass Derived extends Base {\n  m(): void {}\n}\n");
    expect(facts).toHaveLength(1);
    expect(facts[0]!.toName).toBe("Base");
  });

  it("vue: el <script> se analiza como TypeScript — mismo resultado", async () => {
    const facts = await runOn("vue", "class Base {}\n\nclass Derived extends Base {\n  m(): void {}\n}\n");
    expect(facts).toHaveLength(1);
    expect(facts[0]!.toName).toBe("Base");
  });

  it("java: `class Derived extends Base` es una arista extends", async () => {
    const facts = await runOn("java", "class Base { }\nclass Derived extends Base {\n  void m() { }\n}\n");
    expect(facts).toHaveLength(1);
    expect(facts[0]!.toName).toBe("Base");
  });

  it("java control negativo: una clase sin `extends` no dispara nada", async () => {
    const facts = await runOn("java", "class Standalone {\n  void m() { }\n}\n");
    expect(facts).toHaveLength(0);
  });

  it("java: `extends Base<T>` (genérico) SÍ se reconoce, con el nombre pelado (Ola P; antes era un límite declarado)", async () => {
    const facts = await runOn("java", "class Base<T> { }\nclass Derived extends Base<String> {\n  void m() { }\n}\n");
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ kind: "extends", fromPath: ["Derived"], toName: "Base", toQualifier: [] });
  });

  it("java: `extends outer.Base<T>` — genérico Y calificado a la vez", async () => {
    const facts = await runOn("java", "class Derived extends outer.Base<String> {\n  void m() { }\n}\n");
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ toName: "Base", toQualifier: ["outer"] });
  });

  it("python: `class X(Base[T], Other)` (base genérica) emite LAS DOS aristas — repro del encargo, `click/types.py#FloatRange`", async () => {
    const facts = await runOn(
      "python",
      "class Derived(_NumberRangeBase[float, float], FloatParamType):\n    pass\n",
    );
    expect(facts.map((f) => f.toName)).toEqual(["_NumberRangeBase", "FloatParamType"]);
  });

  it("python: `class X(mod.Base)` (base calificada por atributo) emite la arista con calificador — repro del encargo, `click/examples/aliases/aliases.py#AliasedGroup`", async () => {
    const facts = await runOn("python", "class AliasedGroup(click.Group):\n    pass\n");
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ toName: "Group", toQualifier: ["click"] });
  });

  it("csharp: con genéricos en la lista, la ARIDAD real es la que decide — `: B<T>, IFoo<T>, IBar` no reclama NADA (posición 0 ambigua)", async () => {
    // Antes de la Ola P los dos `generic_name` eran invisibles, la aridad
    // medida era 1 y esta arista reclamaba `IBar` (¡la posición 2!) como
    // clase base. Ver "EL HUECO DE GENÉRICOS" en herencia.ts.
    const facts = await runOn("csharp", "class Derived : Base<T>, IFoo<T>, IBar { }");
    expect(facts).toHaveLength(0);
  });

  it("java: `interface Child extends Base, Other` emite DOS aristas extends (Ola P; antes la forma de interfaz no producía ninguna)", async () => {
    const facts = await runOn("java", "interface Base { }\ninterface Other { }\ninterface Child extends Base, Other {\n  void m();\n}\n");
    expect(facts.map((f) => f.toName)).toEqual(["Base", "Other"]);
    expect(facts[0]).toMatchObject({ kind: "extends", fromPath: ["Child"], toQualifier: [] });
  });

  it("java: la forma de interfaz también pela genéricos — `interface Child extends Base<T>`", async () => {
    const facts = await runOn("java", "interface Child extends Base<String> {\n  void m();\n}\n");
    expect(facts.map((f) => f.toName)).toEqual(["Base"]);
  });

  it("typescript: `interface Child extends Base, Other` emite DOS aristas extends", async () => {
    const facts = await runOn("typescript", "interface Child extends Base, Other {\n  m(): void;\n}\n");
    expect(facts.map((f) => f.toName)).toEqual(["Base", "Other"]);
  });

  it("csharp: `interface IChild : IBase, IOther` reclama LOS DOS — una interfaz no puede tener clase base, así que su lista no mezcla nada", async () => {
    expect((await runOn("csharp", "interface IChild : IBase { }")).map((f) => f.toName)).toEqual(["IBase"]);
    expect((await runOn("csharp", "interface IChild : IBase, IOther { }")).map((f) => f.toName)).toEqual(["IBase", "IOther"]);
    // …mientras que la lista de una CLASE sigue rigiéndose por la aridad.
    expect(await runOn("csharp", "class Derived : Base, IOther { }")).toHaveLength(0);
  });

  it("ruby/python: sin forma de interfaz en su SENTINEL, nada cambia (la sonda vuelve null sola, sin rama por lenguaje)", async () => {
    expect((await runOn("ruby", "class Derived < Base\nend\n")).map((f) => f.toName)).toEqual(["Base"]);
    expect((await runOn("python", "class Derived(Base):\n    pass\n")).map((f) => f.toName)).toEqual(["Base"]);
  });

  it("csharp: lista de UN candidato genérico — se reclama como clase base, con el nombre pelado", async () => {
    const facts = await runOn("csharp", "class Derived : Base<T> { }");
    expect(facts).toHaveLength(1);
    expect(facts[0]!.toName).toBe("Base");
  });

  it("java: `startLine` apunta a la fila real de `class`, no a una anotación previa (repro real: guava ImmutableList.java, `@GwtCompatible`/`@SuppressWarnings` antes de `public abstract class`)", async () => {
    const facts = await runOn(
      "java",
      "class Base { }\n\n@GwtCompatible\n@SuppressWarnings(\"serial\")\npublic abstract class Derived extends Base {\n  void m() { }\n}\n",
    );
    expect(facts).toHaveLength(1);
    // Línea 5 (1-indexed) es donde está `public abstract class Derived...`,
    // no la línea 3 donde arranca `@GwtCompatible` (la anotación que hace
    // que el span del nodo `class_declaration` entero empiece antes).
    expect(facts[0]!.startLine).toBe(5);
  });

  it("no aplicable sin herencia (go): forzado igual, 0 hallazgos — Go no tiene esta construcción", async () => {
    // Go no declara SENTINEL (ver herencia.ts): `ctx.carriers()` nunca tiene
    // nada que ofrecer para "go", así que `extract()` sale vacío incluso
    // forzado sin el gate de `needs` (mismo patrón que `mixin.test.ts` usa
    // para su propio "no aplicable en python").
    const sets = await nodeSetsFor(WASM.go!, PROBE.go!);
    const root = await parseRoot(WASM.go!, "package main\n\ntype Derived struct {\n\tBase\n\tName string\n}\n");
    const file = fileUnitFrom(root, sets, "go");
    const ctx: EdgeContext = { language: "go", capabilities: new Set(), carriers: () => [], suppressedRolePaths: [] };
    const facts = extractor.extract(file, ctx);
    expect(facts).toHaveLength(0);
  });

  it("csharp: lista de UN solo candidato — se reclama como clase base (residual medido, ver herencia.ts §AMBIGÜEDAD DECLARADA)", async () => {
    const facts = await runOn(
      "csharp",
      "interface ITaxable { }\nclass Wallet : ITaxable {\n  void Pay() { }\n}\n",
    );
    // "class Wallet : ITaxable" NO tiene clase base real — ITaxable es una
    // interfaz, no una clase. Con un solo elemento tras `:` no hay forma
    // estructural (sin resolver el símbolo contra el resto del repo, que
    // esta arista no hace) de distinguir este caso del ~80-90% real donde sí
    // es la clase base — éste es EXACTAMENTE el residual medido y aceptado
    // (ver herencia.ts, "AMBIGÜEDAD DECLARADA — C#"), no un descuido.
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ kind: "extends", fromPath: ["Wallet"], toName: "ITaxable" });
  });

  it("csharp: lista de 2+ candidatos — NO reclama la posición 0 (sigue genuinamente ambigua)", async () => {
    const facts = await runOn(
      "csharp",
      "interface IPayable { }\ninterface ITaxable { }\nclass Account : Base, IPayable, ITaxable {\n  void Pay() { }\n}\n",
    );
    // Posición 0 de una lista de 2+ candidatos: podría ser la clase base O
    // una interfaz (contraejemplo real en el corpus, ver herencia.ts —
    // `DictionaryWrapper : IDictionary<...>, IWrappedDictionary`, posición 0
    // es interfaz). Esta arista no reclama nada acá; `interfaz-declarada.ts`
    // reclama `IPayable`/`ITaxable` (posiciones 1 y 2, ciertas).
    expect(facts).toHaveLength(0);
  });

  it("csharp: warmUp sigue detectando la ambigüedad estructural (mismo camino que una interfaz) pero YA NO vacía `carriers`", async () => {
    const root = await parseRoot(
      WASM.csharp!,
      "class SentinelBase {}\ninterface SentinelIfaceA {}\n\nclass SentinelChild : SentinelBase, SentinelIfaceA {}\n",
    );
    const result = warmUp("csharp", root);
    expect(result.status).toBe("ambiguous");
    // A diferencia de antes: `extract()` necesita el carrier para localizar
    // el contenedor de cada declaración real y decidir por aridad — ver
    // "AMBIGÜEDAD DECLARADA — C#" en herencia.ts.
    expect(result.carriers).toHaveLength(1);
  });

  it("javascript: forma de expresión (`module.exports = class X extends Y {}`) SÍ se reconoce — repro real: eslint token-store/*.js", async () => {
    const facts = await runOn(
      "javascript",
      "class Base {}\n\nmodule.exports = class Derived extends Base {\n  m() {}\n};\n",
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ kind: "extends", fromPath: ["Derived"], toName: "Base" });
  });

  it("typescript: forma de expresión también se reconoce (misma sonda `SentinelExprChild`)", async () => {
    const facts = await runOn(
      "typescript",
      "class Base {}\n\nconst Alt = class Other extends Base {\n  n(): void {}\n};\n",
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ kind: "extends", fromPath: ["Other"], toName: "Base" });
  });

  it("javascript control negativo: una expresión de clase ANÓNIMA sin `extends` no dispara nada", async () => {
    const facts = await runOn("javascript", "module.exports = class {\n  m() {}\n};\n");
    expect(facts).toHaveLength(0);
  });

  it("invariante del registro: needs declarado, optional=true, kind coincide con EdgeKind 'extends'", () => {
    expect(extractor.needs).toEqual(["herencia"]);
    expect(extractor.optional).toBe(true);
    expect(extractor.kind).toBe("extends");
    expect(extractor.expect).toEqual({ from: "SentinelChild", to: "SentinelBase" });
    expect(extractor.sentinel.ruby).toBeTruthy();
    expect(extractor.sentinel.go).toBeUndefined();
  });

  it("rol/ubicación: la arista trae startLine/endLine y `via` describe la forma de donde salió", async () => {
    const facts = await runOn("ruby", "class Base\nend\n\nclass Derived < Base\nend\n");
    const [edge] = facts;
    expect(edge!.startLine).toBe(4);
    expect(edge!.endLine).toBe(5);
    expect(edge!.via).toContain("superclass");
  });
});
