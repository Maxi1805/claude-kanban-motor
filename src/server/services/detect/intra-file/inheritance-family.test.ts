import { describe, expect, it } from "vitest";

import { detector } from "./inheritance-family.js";
import { runIntraFile } from "../testing.js";

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

/** Igual que `JS_PROBE`, más `abstract class` — mismo par de nodos que ya
 *  ejercita el probe REAL de producción (`code-analyzer.ts`, "abstract class
 *  AbstractShape"): en tree-sitter-typescript, `abstract class X {}` es un
 *  TIPO de nodo DISTINTO (`abstract_class_declaration`) de `class X {}`
 *  (`class_declaration`) — sin ejercitarlo acá, `deriveNodeSets` no
 *  clasificaría ese tipo como `classNodes` para ESTE test (ver
 *  `refused-bequest.test.ts`, comentario de cabecera: "si la sonda no
 *  ejercita una construcción, esa construcción no existe para el detector"). */
const TS_PROBE = `
${JS_PROBE}
abstract class AbstractAnimal {
  abstract speak(): void;
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

describe("inheritance-family", () => {
  it("TypeScript: DataMiner base + CsvDataMiner/LogDataMiner (extends, mismo archivo) ⇒ 1 hallazgo anclado en la base", async () => {
    const source = `
abstract class DataMiner {
  mine(path: string): void {
    this.openFile(path);
    this.extractData();
    this.analyzeData();
    this.sendReport();
    this.closeFile();
  }
  abstract extractData(): void;
}

class CsvDataMiner extends DataMiner {
  extractData(): void {
    this.extractCsvData();
  }
}

class LogDataMiner extends DataMiner {
  extractData(): void {
    this.extractLogLines();
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: TS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("DataMiner");
    expect(findings[0]!.trigger[0]!.value).toBe(2);
  });

  it("JavaScript: mismo patrón sin anotaciones de tipo ⇒ 1 hallazgo", async () => {
    const source = `
class DataMiner {
  mine(path) {
    this.openFile(path);
    this.extractData();
    this.analyzeData();
    this.sendReport();
    this.closeFile();
  }
  extractData() {
    throw new Error("not implemented");
  }
}

class CsvDataMiner extends DataMiner {
  extractData() {
    this.extractCsvData();
  }
}

class LogDataMiner extends DataMiner {
  extractData() {
    this.extractLogLines();
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(1);
  });

  it("Python: DataMiner + CsvDataMiner/LogDataMiner ⇒ 1 hallazgo", async () => {
    const source = `
class DataMiner:
    def mine(self, path):
        self.open_file(path)
        self.extract_data()
        self.analyze_data()
        self.send_report()
        self.close_file()

    def extract_data(self):
        raise NotImplementedError


class CsvDataMiner(DataMiner):
    def extract_data(self):
        self.extract_csv_data()


class LogDataMiner(DataMiner):
    def extract_data(self):
        self.extract_log_lines()
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(1);
  });

  it("Ruby: DataMiner + CsvDataMiner/LogDataMiner (< Ancestor) ⇒ 1 hallazgo", async () => {
    const source = `
class DataMiner
  def mine(path)
    open_file(path)
    extract_data
    analyze_data
    send_report
    close_file
  end

  def extract_data
    raise NotImplementedError
  end
end

class CsvDataMiner < DataMiner
  def extract_data
    extract_csv_data
  end
end

class LogDataMiner < DataMiner
  def extract_data
    extract_log_lines
  end
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("DataMiner");
  });

  it("control negativo: una única subclase (sin hermana) ⇒ 0 hallazgos — hace falta >= 2", async () => {
    const source = `
class DataMiner {
  mine(path) {
    this.extractData();
  }
  extractData() {}
}

class CsvDataMiner extends DataMiner {
  extractData() {
    this.extractCsvData();
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(0);
  });

  it("control negativo: clases sin relación de herencia entre sí ⇒ 0 hallazgos", async () => {
    const source = `
class Foo {
  a() {}
}

class Bar {
  b() {}
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(0);
  });

  it("no aplicable sin herencia: Go no tiene ningún campo de herencia en esta gramática (structs sin base, embedding no es superclass/extends) — 0 hallazgos aunque el detector corriera igual", async () => {
    // El gate real (`needs: ["herencia"]`, evaluado por el runner) es lo que
    // impide correr este detector sobre Go en producción — mismo criterio
    // que `refused-bequest.test.ts` ya documenta para su propio "no aplicable
    // sin herencia". Esta prueba confirma la otra mitad de la regla G3: aun
    // forzado a correr (`runIntraFile` no aplica el gate de `needs`), Go no
    // tiene NINGÚN campo de herencia que `extractSuperclassName` pueda leer
    // — el "embedding" de un struct dentro de otro no expone
    // `superclass`/`superclasses`/`bases`/`extends`, así que ninguna clase
    // declara una base y este detector no tiene qué agrupar.
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

type Cat struct {
	Animal
}

func (c *Cat) Speak() {
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-go.wasm", probe: goProbe, language: "go", source });
    expect(findings).toHaveLength(0);
  });

  it("control negativo: la base declarada NO vive en este archivo (brecha cross-file declarada) ⇒ 0 hallazgos", async () => {
    const source = `
class CsvDataMiner extends DataMiner {
  extractData() {
    this.extractCsvData();
  }
}

class LogDataMiner extends DataMiner {
  extractData() {
    this.extractLogLines();
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(0);
  });
});
