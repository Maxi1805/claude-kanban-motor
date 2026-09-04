import { describe, expect, it } from "vitest";

import { fileUnitFrom, nodeSetsFor, parseRoot } from "../../detect/testing.js";
import type { EdgeContext } from "./types.js";
import { mixinExtractor } from "./mixin.js";

/**
 * Ejercita clase, módulo, método de instancia y método singleton (`self.`)
 * — CON paréntesis en AMBAS variantes de método. Sin esto, `singleton_method`
 * (Ruby `def self.foo` sin paréntesis, como en `def self.build` a secas) no
 * expone campo `parameters`, así que `isFunctionLike` da `false` para esa
 * instancia y, sin otra instancia de `singleton_method` que SÍ sea
 * function-like en algún lugar de la sonda, `deriveNodeSets` lo clasifica
 * como class-like (`isClassLike` = body+name, no function-like) — la MISMA
 * trampa que documenta la plantilla del proyecto ("si la sonda no ejercita
 * una construcción, esa construcción no existe para vos"), encontrada acá
 * midiendo sobre el corpus real (ver el reporte final de esta tarea) antes
 * de corregirla. `code-analyzer.ts#RUBY_PROBE` (producción) ya trae un
 * `def self.build(x)` CON paréntesis por esta misma razón; esta sonda lo
 * replica en vez de simplificarlo. */
const RUBY_PROBE = `
class Shape
  def initialize(name)
    @name = name
  end

  def self.build(x)
    new(x)
  end
end

module Helper
  def self.create(y)
    new(y)
  end
end
`;

const JS_PROBE = `
class Shape {
  constructor(name) {
    this.name = name;
  }
}
`;

const PYTHON_PROBE = `
class Shape:
    def __init__(self, name):
        self.name = name
`;

const FAKE_CTX: EdgeContext = {
  language: "ruby",
  capabilities: new Set(),
  carriers: () => [],
  suppressedRolePaths: [],
};

async function rubyFile(source: string) {
  const sets = await nodeSetsFor("tree-sitter-ruby.wasm", RUBY_PROBE);
  const root = await parseRoot("tree-sitter-ruby.wasm", source);
  return fileUnitFrom(root, sets, "ruby");
}

describe("mixes-in", () => {
  it("ruby: `include SentinelModule` directo en el cuerpo de una clase es una arista", async () => {
    const file = await rubyFile(`
class Widget
  include Comparable
end
`);
    const edges = mixinExtractor.extract(file, FAKE_CTX);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      kind: "mixes-in",
      fromPath: ["Widget"],
      toName: "Comparable",
      toQualifier: [],
      provenance: "declared",
    });
  });

  it("ruby: `extend`/`prepend` (mismo mecanismo estructural, arity=1) también son aristas", async () => {
    const file = await rubyFile(`
class Widget
  extend Forwardable
end

class Other
  prepend Loggable
end
`);
    const edges = mixinExtractor.extract(file, FAKE_CTX);
    expect(edges.map((e) => e.toName)).toEqual(["Forwardable", "Loggable"]);
  });

  it("ruby: `module` también puede ser host (no sólo `class`)", async () => {
    const file = await rubyFile(`
module Container
  include Enumerable
end
`);
    const edges = mixinExtractor.extract(file, FAKE_CTX);
    expect(edges).toHaveLength(1);
    expect(edges[0].fromPath).toEqual(["Container"]);
  });

  it("ruby: nombre calificado (`Sentinel::Nested::MixinModule`) se descompone en toName + toQualifier", async () => {
    const file = await rubyFile(`
class Widget
  include Support::Concerns::Trackable
end
`);
    const edges = mixinExtractor.extract(file, FAKE_CTX);
    expect(edges).toHaveLength(1);
    expect(edges[0].toName).toBe("Trackable");
    expect(edges[0].toQualifier).toEqual(["Support", "Concerns"]);
  });

  it("control negativo ruby: mismo nodo `call`, dos argumentos (`authorize Deal, policy_class: X`) — NO dispara", async () => {
    const file = await rubyFile(`
class Widget
  authorize Deal, policy_class: DealPolicy
end
`);
    const edges = mixinExtractor.extract(file, FAKE_CTX);
    expect(edges).toHaveLength(0);
  });

  it("control negativo ruby: llamada de un solo argumento pero anidada en un método — NO es estatement directo del cuerpo", async () => {
    const file = await rubyFile(`
class Widget
  def setup
    include NestedModule
  end
end
`);
    const edges = mixinExtractor.extract(file, FAKE_CTX);
    expect(edges).toHaveLength(0);
  });

  it("control negativo ruby: llamada de un solo argumento anidada en un bloque — NO es estatement directo del cuerpo", async () => {
    const file = await rubyFile(`
class Widget
  [1].each do
    include NestedModule
  end
end
`);
    const edges = mixinExtractor.extract(file, FAKE_CTX);
    expect(edges).toHaveLength(0);
  });

  it("control negativo ruby: arity=1 desnudo pero con un SÍMBOLO (`attr_reader :site`), misma forma posicional que `include` — NO dispara (REFINAMIENTO MEDIDO, ver docstring)", async () => {
    const file = await rubyFile(`
class Widget
  attr_reader :site
end
`);
    const edges = mixinExtractor.extract(file, FAKE_CTX);
    expect(edges).toHaveLength(0);
  });

  it("control negativo ruby: arity=1 desnudo pero con un LITERAL BOOLEANO (`safe true`), misma forma posicional que `include` — NO dispara", async () => {
    const file = await rubyFile(`
class Widget
  safe true
end
`);
    const edges = mixinExtractor.extract(file, FAKE_CTX);
    expect(edges).toHaveLength(0);
  });

  it("control negativo ruby: invocación anidada como argumento (`send(:include, X)`, arity real=2) — NO dispara", async () => {
    const file = await rubyFile(`
class Widget
  send(:include, SomeModule)
end
`);
    const edges = mixinExtractor.extract(file, FAKE_CTX);
    expect(edges).toHaveLength(0);
  });

  it("límite declarado ruby: `include X if cond` (if_modifier) no se reconoce — brecha documentada, no escondida", async () => {
    const file = await rubyFile(`
class Widget
  include ConditionalModule if some_flag
end
`);
    const edges = mixinExtractor.extract(file, FAKE_CTX);
    // Ver el docstring de mixin.ts: if_modifier reutiliza el campo genérico
    // `body` para envolver el `call`, así que queda a un nivel de anidamiento
    // que este extractor no atraviesa. Se afirma la ausencia, no se adivina.
    expect(edges).toHaveLength(0);
  });

  it("rol/ubicación: la arista trae startLine/endLine y `via` describe la forma de donde salió", async () => {
    const file = await rubyFile(`
class Widget
  include Comparable
end
`);
    const [edge] = mixinExtractor.extract(file, FAKE_CTX);
    expect(edge.startLine).toBe(3);
    expect(edge.endLine).toBe(3);
    expect(edge.via).toContain("arguments[0]");
  });

  it("no aplicable en javascript: ningún cuerpo de clase admite un statement de invocación desnudo — 0 hallazgos", async () => {
    const sets = await nodeSetsFor("tree-sitter-javascript.wasm", JS_PROBE);
    const root = await parseRoot(
      "tree-sitter-javascript.wasm",
      `
class Widget {
  static {
    SomeMixin(Comparable);
  }
}
`,
    );
    const file = fileUnitFrom(root, sets, "javascript");
    // Forzado (sin gate de `needs`, igual que `runIntraFile` para detectores):
    // el propio `language` no tiene sonda registrada en `SENTINEL`, así que
    // la ausencia es del lenguaje, no del extractor.
    const edges = mixinExtractor.extract(file, { ...FAKE_CTX, language: "javascript" });
    expect(edges).toHaveLength(0);
  });

  it("no aplicable en python: sin sonda registrada — 0 hallazgos incluso si el patrón se fuerza", async () => {
    const sets = await nodeSetsFor("tree-sitter-python.wasm", PYTHON_PROBE);
    const root = await parseRoot(
      "tree-sitter-python.wasm",
      `
class Widget:
    SomeMixinCall(Comparable)
`,
    );
    const file = fileUnitFrom(root, sets, "python");
    const edges = mixinExtractor.extract(file, { ...FAKE_CTX, language: "python" });
    expect(edges).toHaveLength(0);
  });

  it("control negativo ruby: un método singleton SIN paréntesis (`def self.foo`) no es un host — su cuerpo no cuenta como cuerpo de clase/módulo", async () => {
    const file = await rubyFile(`
class Widget
  def self.helper_without_parens
    File.read(SomeBareConstant)
  end
end
`);
    const edges = mixinExtractor.extract(file, FAKE_CTX);
    expect(edges).toHaveLength(0);
  });

  it("control negativo ruby: `extend self` / `include self` NO dispara — `self` es LA MISMA unidad, no 'otra' (repro real: jekyll lib/jekyll/utils.rb, lib/jekyll/utils/win_tz.rb)", async () => {
    const file = await rubyFile(`
module Utils
  extend self
end

module WinTZ
  include self
end
`);
    const edges = mixinExtractor.extract(file, FAKE_CTX);
    expect(edges).toHaveLength(0);
  });

  it("control positivo ruby: `self::Foo` (self como calificador, no como argumento completo) SÍ apunta a otra unidad — el filtro de `self` no debe comerse la cadena calificada", async () => {
    const file = await rubyFile(`
class Widget
  include self::Foo
end
`);
    const edges = mixinExtractor.extract(file, FAKE_CTX);
    expect(edges).toHaveLength(1);
    expect(edges[0].toName).toBe("Foo");
  });

  it("invariante del registro: needs declarado, optional=true, kind coincide con EdgeKind 'mixes-in'", () => {
    expect(mixinExtractor.needs).toEqual(expect.arrayContaining(["modulos"]));
    expect(mixinExtractor.optional).toBe(true);
    expect(mixinExtractor.kind).toBe("mixes-in");
    expect(mixinExtractor.sentinel.ruby).toBeTruthy();
  });

  // CAUSA DE LA FUGA jekyll (7/20 medido en el censo) — ver "CAUSA DE LA
  // FUGA jekyll..." en el docstring del módulo, esta ola. Este extractor
  // corre POR ARCHIVO y no resuelve símbolos (SIMPLIFICACIÓN DECLARADA, ver
  // docstring): emite `EdgeFacts` para un `include Forwardable` EXACTAMENTE
  // igual que para un `include SentinelSideModule` — no hay forma
  // estructural (ni debería haberla acá) de distinguir "este nombre está
  // declarado en el repo" de "este nombre es del stdlib de Ruby". Prueba
  // NEGATIVA de la hipótesis alternativa "el extractor no ve estos casos":
  // si el extractor viera menos, `toName` no aparecería acá en absoluto.
  it("ruby: `include Forwardable` (módulo del stdlib de Ruby, NUNCA declarado en el repo) emite la MISMA arista cruda que un módulo local — la fuga de jekyll es de resolución, no de extracción (ver docstring del módulo)", async () => {
    const file = await rubyFile(`
class Document
  extend Forwardable
end
`);
    const edges = mixinExtractor.extract(file, FAKE_CTX);
    expect(edges).toHaveLength(1);
    expect(edges[0].toName).toBe("Forwardable");
    expect(edges[0].provenance).toBe("declared");
  });

  it("ruby: repro real jekyll (`lib/jekyll/tags/highlight.rb`) — `include Liquid::StandardFilters` (gema externa) también emite la arista cruda, toQualifier incluido", async () => {
    const file = await rubyFile(`
class HighlightBlock
  include Liquid::StandardFilters
end
`);
    const edges = mixinExtractor.extract(file, FAKE_CTX);
    expect(edges).toHaveLength(1);
    expect(edges[0].toName).toBe("StandardFilters");
    expect(edges[0].toQualifier).toEqual(["Liquid"]);
  });
});
