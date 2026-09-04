import { describe, expect, it } from "vitest";

import { detector, SELF_REFERENTIAL_MEMBER_KIND } from "./self-referential-member.js";
import { runIntraFile } from "../testing.js";

/**
 * Sonda Ruby: ejercita módulo anidado + clase (nombre calificado), macro con
 * pares clave/valor (símbolo Y string como valor), herencia (`< Base`), y un
 * método común (`def`) — todo lo que este detector necesita clasificar por
 * `sets.classNodes`/`sets.functionNodes` para el resto de los tests.
 */
const RUBY_PROBE = `
module Tags
  class System
    belongs_to :parent, class_name: 'Tags::System', optional: true
    has_one :children, class_name: 'Tags::System'
  end
end

class Animal
  def speak(volume)
    puts volume
  end
end

class Dog < Animal
  belongs_to :parent, class_name: 'Dog'
  has_many :children, class_name: 'Dog', foreign_key: :parent_id
  def speak(volume)
    puts "woof " + volume
  end
end
`;

/** Sonda TS: campo tipado envuelto en arreglo/unión + un método — misma
 *  forma que `public_field_definition`/`method_definition` reales. */
const TS_PROBE = `
class Folder {
  children: Folder[] = [];
  parent: Folder | null = null;
  render(): void {}
}
class Basket {
  items: Item[] = [];
}
`;

/** Sonda Java: `field_declaration` directo Y envuelto en `generic_type`. */
const JAVA_PROBE = `
class Folder {
  private List<Folder> children;
  private Folder parent;
  void render() {}
}
`;

/** Sonda C#: campo tipado directo + un método — misma forma que
 *  `field_declaration`/`method_declaration` reales. */
const CSHARP_PROBE = `
class Folder {
  private Folder parent;
  void Render() {}
}
`;

/** Sonda Go: struct + método con receptor — Go no tiene nodo de clase en esta
 *  gramática (`type_declaration` sin campo `body`, ver code-grammar.ts). */
const GO_PROBE = `
package main

type Folder struct {
	Name string
}

func (f *Folder) Render() string {
	return f.Name
}
`;

describe("self-referential-member", () => {
  it("id/kind/scope/needs — contrato del detector", () => {
    expect(detector.id).toBe("self-referential-member");
    expect(detector.kind).toBe("self-referential-member");
    expect(detector.kind).toBe(SELF_REFERENTIAL_MEMBER_KIND);
    expect(detector.scope).toBe("intra-file");
    expect(detector.needs).toEqual(["unidad-tipo-clase"]);
  });

  it("Ruby (caso de prueba real, Folder): `belongs_to :parent`/`has_many :children` con `class_name: 'Folder'` ⇒ 1 hallazgo, 2 locations, ambas ancladas en \"Folder\"", async () => {
    const source = `
class Folder < ApplicationRecord
  belongs_to :parent, class_name: 'Folder', optional: true
  has_many :children,
           class_name: 'Folder',
           foreign_key: :parent_id,
           dependent: :restrict_with_error,
           inverse_of: :parent

  def not_empty?
    children.active.exists? || folder_items.exists?
  end
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
    expect(findings[0]!.locations.every((l) => l.symbol === "Folder")).toBe(true);
    expect(findings[0]!.trigger[0]!.value).toBe(2);
  });

  it("Ruby: `class_name` como SÍMBOLO (`:Comment`), no string — misma normalización (sigilo `:`)", async () => {
    const source = `
class Comment < ApplicationRecord
  belongs_to :parent_comment, foreign_key: :parent_comment_id, class_name: :Comment, optional: true
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(1);
  });

  it("Ruby: clase anidada en módulo (`module Tags; class System`) con literal calificado (`'Tags::System'`) ⇒ matchea por el ÚLTIMO segmento, ancla en \"System\" (no en \"Tags\")", async () => {
    const source = `
module Tags
  class System < ApplicationRecord
    has_one :children, class_name: 'Tags::System', foreign_key: :parent_id
    belongs_to :parent, class_name: 'Tags::System', optional: true
  end
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
    expect(findings[0]!.locations[0]!.symbol).toBe("System");
  });

  it("Ruby, control negativo: `belongs_to`/`has_many` hacia OTRA clase (no autorreferencial) ⇒ 0 hallazgos", async () => {
    const source = `
class Order < ApplicationRecord
  belongs_to :customer, class_name: 'Customer'
  has_many :line_items, class_name: 'LineItem'
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(0);
  });

  it("Ruby, control negativo: el nombre de la propia clase aparece en texto pero NUNCA como VALOR de un par clave/valor (constante asignada, mensaje de excepción posicional) ⇒ 0 hallazgos", async () => {
    const source = `
class Widget < ApplicationRecord
  LOG_PREFIX = "Widget"
  validates :name, presence: true

  def describe
    raise ArgumentError, "Widget" if name.nil?
  end
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(0);
  });

  it("TypeScript: campo `Folder[]` (arreglo) y `Folder | null` (unión) ⇒ 1 hallazgo, 2 locations; el método `render()` NUNCA cuenta como miembro (function-like)", async () => {
    const source = `
class Folder {
  children: Folder[] = [];
  parent: Folder | null = null;
  render(): void {}
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      language: "typescript",
      source,
      capabilities: ["unidad-tipo-clase", "tipos-explicitos"],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
    expect(findings[0]!.locations.every((l) => l.symbol === "Folder")).toBe(true);
  });

  it("TypeScript, control negativo: campo tipado con OTRA clase (`Item[]`) ⇒ 0 hallazgos", async () => {
    const source = `
class Basket {
  items: Item[] = [];
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      language: "typescript",
      source,
      capabilities: ["unidad-tipo-clase", "tipos-explicitos"],
    });
    expect(findings).toHaveLength(0);
  });

  it("Java: `List<Folder>` (genérico) y `Folder` (directo) ⇒ 1 hallazgo, 2 locations — el wrapper genérico no rompe la comparación exacta", async () => {
    const source = `
class Folder {
  private List<Folder> children;
  private Folder parent;
  void render() {}
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      language: "java",
      source,
      capabilities: ["unidad-tipo-clase", "tipos-explicitos"],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
  });

  it("Java, ARREGLO (guava): `public static final Folder INSTANCE = new Folder();` a solas es el modismo Singleton, no un hijo de Composite ⇒ 0 hallazgos", async () => {
    const source = `
class Folder {
  public static final Folder INSTANCE = new Folder();
  void render() {}
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      language: "java",
      source,
      capabilities: ["unidad-tipo-clase", "tipos-explicitos"],
    });
    expect(findings).toHaveLength(0);
  });

  it("Java, ARREGLO: la constante Singleton estática y un campo de INSTANCIA real (`parent`) en la MISMA clase ⇒ 1 hallazgo, sólo `parent` — la estática nunca cuenta", async () => {
    const source = `
class Folder {
  public static final Folder INSTANCE = new Folder();
  private Folder parent;
  void render() {}
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      language: "java",
      source,
      capabilities: ["unidad-tipo-clase", "tipos-explicitos"],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(1);
    // línea 4 es `private Folder parent;` — la línea 3 (`INSTANCE`, static)
    // nunca debe sobrevivir como location.
    expect(findings[0]!.locations[0]!.startLine).toBe(4);
  });

  it("C#, ARREGLO: `public static readonly Folder Instance = new Folder();` (modificadores como nodos `modifier` separados) también es el modismo Singleton ⇒ 0 hallazgos", async () => {
    const source = `
class Folder {
  public static readonly Folder Instance = new Folder();
  void Render() {}
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source,
      capabilities: ["unidad-tipo-clase", "tipos-explicitos"],
    });
    expect(findings).toHaveLength(0);
  });

  it("C#, control positivo: sin `static`, el mismo campo tipado `Folder` sigue detectado (no es el `static` lo que produce el falso positivo de por sí, es el modismo Singleton)", async () => {
    const source = `
class Folder {
  private Folder parent;
  void Render() {}
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source,
      capabilities: ["unidad-tipo-clase", "tipos-explicitos"],
    });
    expect(findings).toHaveLength(1);
  });

  it("TypeScript, ARREGLO: `static readonly instance: Folder = new Folder();` — `static` como hijo anónimo DIRECTO del miembro (sin nodo `modifiers` envolvente) ⇒ 0 hallazgos", async () => {
    const source = `
class Folder {
  static readonly instance: Folder = new Folder();
  render(): void {}
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      language: "typescript",
      source,
      capabilities: ["unidad-tipo-clase", "tipos-explicitos"],
    });
    expect(findings).toHaveLength(0);
  });

  it("Java, ARREGLO (guava): una referencia CALIFICADA a el `Builder` de OTRA clase (`ImmutableCollection.Builder`, no `ImmutableMultimap.Builder`) no cuenta como autorreferencia — 6 de 71 hallazgos post-arreglo-Singleton en guava citaban \"Builder\" con exactamente esta forma", async () => {
    const source = `
class ImmutableMultimap {
  static class Builder {
    Map<String, ImmutableCollection.Builder> builderMap;
    void render() {}
  }
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      language: "java",
      source,
      capabilities: ["unidad-tipo-clase", "tipos-explicitos"],
    });
    expect(findings).toHaveLength(0);
  });

  it("Java, control positivo: una referencia SIN calificar al propio nombre sigue detectada dentro del mismo tipo genérico que la calificada — no es el genérico lo que se excluye, es la calificación", async () => {
    const source = `
class Folder {
  Map<String, Folder> children;
  void render() {}
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      language: "java",
      source,
      capabilities: ["unidad-tipo-clase", "tipos-explicitos"],
    });
    expect(findings).toHaveLength(1);
  });

  it("C#, ARREGLO (newtonsoft-json, falso medido): un miembro tipado como la propia clase genérica pero instanciada con OTRO parámetro de tipo (`RegularImmutableBiMap<V, K>` dentro de `class RegularImmutableBiMap<K, V>`, parámetros INVERTIDOS) ⇒ 0 hallazgos — caso real IJEnumerable<T>/IJEnumerable<JToken>, misma forma con un nombre de clase distinto", async () => {
    const source = `
class RegularImmutableBiMap<K, V> {
  private RegularImmutableBiMap<V, K> inverse;
  void Render() {}
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source,
      capabilities: ["unidad-tipo-clase", "tipos-explicitos"],
    });
    expect(findings).toHaveLength(0);
  });

  it("Java, ARREGLO (guava, falso medido): `ImmutableSetMultimap<K, V>` con `deserializationReplacement` tipado `<?, ?>` (comodines) e `inverse` tipado `<V, K>` (invertido) ⇒ 0 hallazgos — los dos miembros reales que producían el falso de la planilla", async () => {
    const source = `
class ImmutableSetMultimap<K, V> {
  private ImmutableSetMultimap<?, ?> deserializationReplacement;
  private ImmutableSetMultimap<V, K> inverse;
  void render() {}
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      language: "java",
      source,
      capabilities: ["unidad-tipo-clase", "tipos-explicitos"],
    });
    expect(findings).toHaveLength(0);
  });

  it("Java, control positivo: una clase genérica con un miembro instanciado con SU PROPIO parámetro de tipo, en el mismo orden (`Box<T>` dentro de `class Box<T>`) sigue detectada — el arreglo excluye instanciaciones DISTINTAS, no toda clase genérica", async () => {
    const source = `
class Box<T> {
  private Box<T> child;
  void render() {}
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      language: "java",
      source,
      capabilities: ["unidad-tipo-clase", "tipos-explicitos"],
    });
    expect(findings).toHaveLength(1);
  });

  it("TypeScript, control positivo: mismo criterio (`Box<T>` dentro de `class Box<T>`) — el arreglo no rompe TypeScript aunque su `generic_type` sea estructuralmente idéntico al que dispara el arreglo", async () => {
    const source = `
class Box<T> {
  child: Box<T> = this;
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      language: "typescript",
      source,
      capabilities: ["unidad-tipo-clase", "tipos-explicitos"],
    });
    expect(findings).toHaveLength(1);
  });

  it("EVIDENCIA (Ola N, frente A5b): el `detail` y el `role` de cada location llevan el TEXTO del tipo declarado, no sólo el nombre del miembro — la planilla de veredictos repite 'no verifiqué cada uno'/'no confirmado por tiempo' precisamente porque el hallazgo anterior no distinguía una COLECCIÓN de un escalar sin abrir el archivo", async () => {
    const source = `
class Folder {
  children: Folder[] = [];
  parent: Folder | null = null;
  render(): void {}
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      language: "typescript",
      source,
      capabilities: ["unidad-tipo-clase", "tipos-explicitos"],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.detail).toContain("Folder[]");
    expect(findings[0]!.detail).toContain("Folder | null");
    expect(findings[0]!.locations.some((l) => l.role.includes("Folder[]"))).toBe(true);
  });

  it("no aplicable sin unidad-tipo-clase: Go no tiene nodo de clase (`type_declaration` sin campo `body` en esta gramática) — un struct con receptor y un campo homónimo del propio paquete sigue dando 0 hallazgos aunque se fuerce la corrida, porque no hay ningún nodo de clase que recorrer", async () => {
    const source = `
package main

type Folder struct {
	Parent   *Folder
	Children []*Folder
}

func (f *Folder) Render() string {
	return f.Parent.Render()
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-go.wasm", probe: GO_PROBE, language: "go", source });
    expect(findings).toHaveLength(0);
  });
});
