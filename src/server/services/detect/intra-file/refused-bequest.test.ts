import { describe, expect, it } from "vitest";

import { detector } from "./refused-bequest.js";
import { runIntraFile, testContext } from "../testing.js";

/* ────────────────────────────────────────────────────────────────────────
 * Sondas — cada una ejercita clase + herencia + un método, lo mínimo que
 * `deriveNodeSets` necesita para clasificar `classNodes`/`functionNodes`.
 * Ver `testing.ts`: la sonda es de este archivo, no la del analizador de
 * producción (`code-analyzer.ts`), así que puede — y acá debe — ejercitar
 * herencia real aunque la sonda de producción de un lenguaje no lo haga.
 * ──────────────────────────────────────────────────────────────────────── */
// El método con parámetro (`speak(volume)`) es DELIBERADO, no cosmético: un
// `def speak` ruby SIN paréntesis no expone campo `parameters` en absoluto,
// así que `isFunctionLike` (que exige `body` + `parameters`) falla para él y
// el nodo "method" caería en `isClassLike` (tiene `name` + `body`, ninguna
// instancia function-like que lo saque de ahí) — exactamente la trampa que
// la plantilla documenta: "si la sonda no ejercita una construcción, esa
// construcción no existe para el detector". Alcanza con que UNA instancia de
// "method" tenga `parameters` en la sonda: `deriveNodeSets` clasifica por
// TIPO de nodo, no por instancia (ver su tie-break: "un tipo visto
// function-like en CUALQUIER instancia probada es un tipo función"), así que
// los `def speak`/`def speak(sound)` SIN parámetros de las fixtures de abajo
// siguen contando como función una vez que el tipo "method" ya quedó
// clasificado acá.
const RUBY_PROBE = `
class Animal
  def speak(volume)
    puts volume
  end
end

class Dog < Animal
  def speak(volume)
    puts "woof " + volume
  end
end
`;

const JS_PROBE = `
class Animal {
  speak() {
    console.log("generic sound");
  }
}

class Dog extends Animal {
  speak() {
    console.log("woof");
  }
}
`;

const PYTHON_PROBE = `
class Animal:
    def speak(self):
        print("generic sound")

class Dog(Animal):
    def speak(self):
        print("woof")
`;

const JAVA_PROBE = `
class Animal {
  void speak() {
    System.out.println("generic sound");
  }
}

class Dog extends Animal {
  void speak() {
    System.out.println("woof");
  }
}
`;

const CSHARP_PROBE = `
class Animal {
  void Speak() {
    System.Console.WriteLine("generic sound");
  }
}

class Dog : Animal {
  void Speak() {
    System.Console.WriteLine("woof");
  }
}
`;

describe("refused-bequest", () => {
  it("ruby: la subclase vacía un método heredado con contenido real en la base es un hallazgo", async () => {
    const source = `
class Animal
  def speak
    puts "generic sound"
  end
end

class Dog < Animal
  def speak
  end
end
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.trigger[0]!.value).toBe(1);
    expect(finding.locations[0]!.symbol).toBe("Dog");
    expect(finding.locations[0]!.role).toBe("subclase que anula comportamiento heredado real");
    expect(finding.locations[1]!.role).toBe('anula el método heredado "speak" con un cuerpo vacío');
  });

  it("ruby control negativo: la subclase sobreescribe pero conserva comportamiento propio — no dispara", async () => {
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source: RUBY_PROBE });
    expect(findings).toHaveLength(0);
  });

  it("ruby control negativo: Template Method — la BASE ya declara el hook vacío, anularlo en la subclase no descarta nada", async () => {
    const source = `
class Animal
  def speak
  end
end

class Dog < Animal
  def speak
  end
end
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(0);
  });

  it("ruby: agrupa varios métodos anulados de la misma subclase en UN hallazgo, con el conteo correcto", async () => {
    const source = `
class Animal
  def speak
    puts "generic sound"
  end

  def move
    puts "walks"
  end
end

class Dog < Animal
  def speak
  end

  def move
  end
end
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(2);
  });

  it("borde del umbral (piso declarado, presencia = 1): justo debajo (0 métodos anulados) no dispara, justo en el umbral (1) sí", async () => {
    const threshold = testContext(detector, "ruby").threshold("nullifiedOverrides").value;
    expect(threshold).toBe(1);

    const belowSource = RUBY_PROBE; // Dog.speak conserva contenido real: 0 anulados
    const below = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source: belowSource });
    expect(below).toHaveLength(0);

    const atSource = `
class Animal
  def speak
    puts "generic sound"
  end
end

class Dog < Animal
  def speak
  end
end
`;
    const at = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source: atSource });
    expect(at).toHaveLength(1);
    expect(at[0]!.trigger[0]!.value).toBe(threshold);
  });

  it("brecha declarada — clase base en otro archivo: 'Dog < Animal' sin que 'Animal' esté en ESTE archivo no dispara nada (no hay par que comparar)", async () => {
    const source = `
class Dog < Animal
  def speak
  end
end
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(0);
  });

  it("javascript: método vacío que sobreescribe uno con contenido real en la base es un hallazgo — segundo lenguaje real", async () => {
    const source = `
class Animal {
  speak() {
    console.log("generic sound");
  }
}

class Dog extends Animal {
  speak() {}
}
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("Dog");
  });

  it("javascript control negativo: el override delega en la base (`super.speak()`) — tiene contenido real, no dispara", async () => {
    const source = `
class Animal {
  speak() {
    console.log("generic sound");
  }
}

class Dog extends Animal {
  speak() {
    super.speak();
  }
}
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(0);
  });

  it("java: método vacío que sobreescribe uno con contenido real en la base es un hallazgo — tercer lenguaje real, cierra el criterio de salida (≥3 lenguajes)", async () => {
    const source = `
class Animal {
  void speak() {
    System.out.println("generic sound");
  }
}

class Dog extends Animal {
  void speak() {}
}
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("Dog");
  });

  it("java control negativo — OLA AX (AX3): SOBRECARGA, no override — la base declara `speak(String)` y la subclase `speak()`; comparten NOMBRE y no ARIDAD, así que no hay nada anulado", async () => {
    // MEDIDO EN CÓDIGO REAL, no inventado: `hudson.model.AbstractBuild` declara
    // `abstract void run()` y su base `Run` declara `protected final void
    // run(Runner job)`. Con el emparejamiento por nombre pelado de antes de esta
    // ola, el detector leía eso como "AbstractBuild anuló el run() de Run".
    const source = `
class Animal {
  void speak(String tone) {
    System.out.println(tone);
  }
}

class Dog extends Animal {
  void speak() {}
}
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(0);
  });

  it("java — OLA AX (AX3): con SOBRECARGA presente, el override de la MISMA aridad sí dispara — la aridad elige el par correcto en vez de que gane la última declaración del archivo", async () => {
    // El defecto de orden que la clave por aridad cierra: con nombre pelado el
    // `Map` se sobrescribía y ganaba `speak(String)` (la última), así que contra
    // QUÉ se comparaba dependía del ORDEN DE ESCRITURA en el archivo.
    const source = `
class Animal {
  void speak() {
    System.out.println("generic sound");
  }
  void speak(String tone) {
    System.out.println(tone);
  }
}

class Dog extends Animal {
  void speak() {}
}
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("Dog");
  });

  it("java control negativo: dos clases sin relación de herencia entre sí no disparan nada (no hay 'superclass' declarado)", async () => {
    const source = `
class Animal {
  void speak() {
    System.out.println("generic sound");
  }
}

class Robot {
  void speak() {}
}
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(0);
  });

  it("csharp: método vacío que sobreescribe uno con contenido real en la base es un hallazgo — cuarto lenguaje real", async () => {
    const source = `
class Animal {
  void Speak() {
    System.Console.WriteLine("generic sound");
  }
}

class Dog : Animal {
  void Speak() {}
}
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, language: "csharp", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("Dog");
  });

  it("csharp — OLA Z: dos declaraciones de clase con el MISMO nombre simple (genérico `Foo<T> : Foo`) — ambigüedad de identidad, no dispara", async () => {
    // Medido en newtonsoft-json real: `JsonConverter<T> : JsonConverter` — el
    // campo `name` no lleva `<T>`, así que la base no-genérica y la derivada
    // genérica comparten el mismo texto de `name`. Sin este control, la
    // única entrada de `classNodeByName`/`methodsByClass` mezcla los métodos
    // de las DOS clases y el resultado lee al revés: el método ABSTRACTO de
    // la base (línea 1) se compara contra la implementación REAL de la
    // derivada (línea 2) y se reporta "la subclase anuló la base" cuando es
    // exactamente lo opuesto. Ver el docstring del Paso 1 en el módulo.
    const source = `
abstract class JsonConverter {
  public abstract bool CanConvert(Type objectType);
}

abstract class JsonConverter<T> : JsonConverter {
  public sealed override bool CanConvert(Type objectType) {
    return typeof(T).IsAssignableFrom(objectType);
  }
}
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, language: "csharp", source });
    expect(findings).toHaveLength(0);
  });

  /* ── OLA Z (Z5) — regresión: la base SIN cuerpo (abstract/interfaz) no tiene nada que "anular" ──
   * Medido contra `corpus-app/jenkins` real: `FileSystemProvisioner`/`Default` sobreescribía
   * `prepareWorkspace`/`discardWorkspace`, declarados `abstract` en la base — 2 falsos positivos
   * antes de este arreglo (`isEmptyFunctionBody` trataba "el campo `body` no resuelve" como
   * "tiene contenido real" para todo lenguaje que no fuera Ruby). Ver el docstring de
   * `isEmptyFunctionBody`. */
  it("java control negativo — OLA Z: la BASE es un método ABSTRACTO (sin cuerpo) — anularlo en la subclase no descarta nada real", async () => {
    const source = `
abstract class Animal {
  abstract void speak();
}

class Dog extends Animal {
  @Override
  void speak() {
  }
}
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(0);
  });

  it("csharp control negativo — OLA Z: la BASE es un método ABSTRACTO (sin cuerpo) — anularlo en la subclase no descarta nada real", async () => {
    const source = `
abstract class Animal {
  public abstract void Speak();
}

class Dog : Animal {
  public override void Speak() {
  }
}
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, language: "csharp", source });
    expect(findings).toHaveLength(0);
  });

  it("csharp — OLA Z: la BASE es expression-bodied (`=> ...`, SIN bloque pero CON contenido real) — sigue siendo un hallazgo, no se confunde con 'sin cuerpo'", async () => {
    const source = `
class Animal {
  public void Speak() => System.Console.WriteLine("generic sound");
}

class Dog : Animal {
  public override void Speak() {
  }
}
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, language: "csharp", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("Dog");
  });

  it("límite declarado — python: un override reducido a `pass` NUNCA dispara (la sintaxis obliga un `pass_statement` NOMBRADO dentro de `body`, así que el cuerpo nunca tiene cero hijos nombrados)", async () => {
    // Python SÍ tiene la capacidad `herencia` en producción (su probe real
    // declara `class Shape(Base):`) y el detector corre igual sobre Python —
    // esta es la forma específica de "vacío" que la definición estructural de
    // este detector no puede alcanzar sin nombrar `pass_statement` por tipo,
    // exactamente la lista de nombres de nodo por lenguaje que la regla 4
    // prohíbe. Ver el docstring del módulo.
    const source = `
class Animal:
    def speak(self):
        print("generic sound")

class Dog(Animal):
    def speak(self):
        pass
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(0);
  });

  it("no aplicable sin herencia: Go no tiene ningún campo de herencia en esta gramática (structs sin base) — 0 hallazgos aunque el detector corriera igual sobre un patrón similar por embedding", async () => {
    // El gate real (`needs: ["herencia"]`, evaluado por el runner) es lo que
    // impide correr este detector sobre Go en producción. Esta prueba
    // confirma la otra mitad de la regla G3: aun forzado a correr
    // (`runIntraFile` no aplica el gate de `needs`), Go no tiene NINGÚN campo
    // de herencia que este detector pueda leer — el "embedding" de un struct
    // dentro de otro no expone `superclass`/`superclasses`/`bases`/`extends`,
    // así que ninguna clase declara una base y el detector no tiene qué
    // comparar. No es un defecto del extractor: Go, en esta gramática, no
    // tiene el concepto.
    const goProbe = `
package main

type Animal struct {
	Name string
}

func (a *Animal) Speak() {
	println("generic sound")
}
`;
    const source = `
package main

type Animal struct {
	Name string
}

func (a *Animal) Speak() {
	println("generic sound")
}

type Dog struct {
	Animal
}

func (d *Dog) Speak() {
}
`;
    const findings = await runIntraFile(detector, { deriveParameters: true, wasm: "tree-sitter-go.wasm", probe: goProbe, language: "go", source });
    expect(findings).toHaveLength(0);
  });
});
