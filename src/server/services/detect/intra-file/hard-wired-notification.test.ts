/**
 * Tests de `hard-wired-notification` — el ancla-fuerza de Observer (Ola AE, AE11).
 *
 * Uno por condición, cada uno nombrando la INTENCIÓN que verifica, más la
 * cobertura de las gramáticas donde el ancla vieja era ciega (Java) y las que
 * escriben el campo propio de otra forma (Ruby `@`, Go receptor, Python `self`).
 */
import { describe, expect, it } from "vitest";

import { detector } from "./hard-wired-notification.js";
import { DETECTORS } from "../registry.js";
import { runIntraFile } from "../testing.js";

/** La sonda TIENE que ejercitar un BUCLE: `loopNodeTypes` deriva los tipos de nodo de iteración de `DerivedNodeSets`, que a su vez salen de lo que la sonda ejercita — sin bucle en la sonda, la condición (5) no puede ver ningún recorrido. Mismo criterio y misma sonda que `hypotheses/observer.test.ts`. */
const JS_PROBE = "class Probe { constructor() { this.x = 1; } method(a) { return a; } }\nfunction probeFn(x) { for (const y of x) { y.z(); } return x; }\n";
const PYTHON_PROBE = "class Probe:\n    def __init__(self):\n        self.x = 1\n    def method(self, a):\n        for y in a:\n            y.z()\n        return a\n";
const RUBY_PROBE = "class Probe\n  def initialize\n    @x = 1\n  end\n  def method(a)\n    a.each { |y| y.z }\n  end\nend\n";
const GO_PROBE = "package p\ntype T struct{ x []int }\nfunc (t *T) Method(a int) int {\n\tfor _, y := range t.x {\n\t\t_ = y\n\t}\n\treturn a\n}\nfunc NewT() *T {\n\treturn &T{}\n}\n";
const JAVA_PROBE = "class Animal {\n  int n;\n  void speak(java.util.List<Animal> xs) {\n    for (Animal a : xs) { a.speak(xs); }\n    n = 1;\n  }\n}\n";

const ts = (source: string) => runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });

describe("hard-wired-notification — la forma completa", () => {
  it("TypeScript: dos puntos de cambio avisan a los MISMOS tres interesados ⇒ 1 hallazgo con 2 lugares", async () => {
    const source = `
class Order {
  close(reason) {
    this.status = "closed";
    this.mailer.send(reason);
    this.audit.record(reason);
    this.metrics.increment("closed");
  }
  reopen(reason) {
    this.status = "open";
    this.mailer.send(reason);
    this.audit.record(reason);
    this.metrics.increment("reopened");
  }
}
`;
    const findings = await ts(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
    expect(findings[0]!.trigger[0]!.value).toBe(2); // puntos de cambio
    expect(findings[0]!.trigger[1]!.value).toBe(3); // interesados
  });

  it("publica cuántos nombres de método distintos usan los avisos — el dato que el ancla vieja EXIGÍA y ésta sólo informa", async () => {
    const source = `
class Order {
  close(e) { this.status = 1; this.a.on(e); this.b.on(e); this.c.on(e); }
  reopen(e) { this.status = 2; this.a.on(e); this.b.on(e); this.c.on(e); }
}
`;
    const findings = await ts(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.evidence?.find((x) => x.label === "nombres de método distintos entre los avisos")?.value).toBe(1);
  });
});

describe("hard-wired-notification — (1) INTENCIÓN: el aviso es sobre algo que ACABA de cambiar acá", () => {
  it("sin mutación de estado propio ⇒ silencio (es un coordinador, la fuerza de Facade, no la de Observer)", async () => {
    const source = `
class Order {
  close(e) { this.mailer.send(e); this.audit.record(e); this.metrics.increment(e); }
  reopen(e) { this.mailer.send(e); this.audit.record(e); this.metrics.increment(e); }
}
`;
    expect(await ts(source)).toHaveLength(0);
  });
});

describe("hard-wired-notification — (2) INTENCIÓN: hay VARIOS interesados, no un par fijo", () => {
  it("dos destinatarios ⇒ silencio (el falso 'par fijo, no lista de suscriptores' que cuatro jueces anotaron en las Olas P y Z)", async () => {
    const source = `
class Order {
  close(e) { this.status = 1; this.mailer.send(e); this.audit.record(e); }
  reopen(e) { this.status = 2; this.mailer.send(e); this.audit.record(e); }
}
`;
    expect(await ts(source)).toHaveLength(0);
  });
});

describe("hard-wired-notification — (3) INTENCIÓN: a un interesado se le AVISA, no se le CONSULTA", () => {
  it("si el resultado se usa (asignación / return / dentro de otra llamada) ⇒ silencio", async () => {
    const source = `
class Order {
  close(e) {
    this.status = 1;
    const a = this.mailer.send(e);
    const b = this.audit.record(e);
    return this.metrics.increment(a, b);
  }
  reopen(e) {
    this.status = 2;
    const a = this.mailer.send(e);
    const b = this.audit.record(e);
    return this.metrics.increment(a, b);
  }
}
`;
    expect(await ts(source)).toHaveLength(0);
  });

  it("dos llamadas de campo COMBINADAS por `&&` no son avisos secuenciales ⇒ silencio (el caso medido de `cobra/command.go#LocalFlags`)", async () => {
    const source = `
class Order {
  close(e) {
    this.status = 1;
    if (this.mailer.ready(e) && this.audit.ready(e) && this.metrics.ready(e)) { this.status = 2; }
  }
  reopen(e) {
    this.status = 3;
    if (this.mailer.ready(e) && this.audit.ready(e) && this.metrics.ready(e)) { this.status = 4; }
  }
}
`;
    expect(await ts(source)).toHaveLength(0);
  });
});

describe("hard-wired-notification — (4) INTENCIÓN: agregar un interesado obliga a tocar VARIOS puntos", () => {
  it("un solo punto de cambio ⇒ silencio (una línea en un lugar; ninguna abstracción paga)", async () => {
    const source = `
class Order {
  close(e) { this.status = 1; this.mailer.send(e); this.audit.record(e); this.metrics.increment(e); }
  describe() { return this.status; }
}
`;
    expect(await ts(source)).toHaveLength(0);
  });

  it("dos puntos de cambio con listados DISJUNTOS ⇒ silencio (no es el MISMO listado repetido)", async () => {
    const source = `
class Order {
  close(e) { this.status = 1; this.mailer.send(e); this.audit.record(e); this.metrics.increment(e); }
  reopen(e) { this.status = 2; this.cache.drop(e); this.index.update(e); this.search.reindex(e); }
}
`;
    expect(await ts(source)).toHaveLength(0);
  });
});

describe("hard-wired-notification — (5) RESOLUCIÓN VERIFICADA: no disparar donde Observer YA ESTÁ", () => {
  it("(5a) el dueño YA tiene la pareja suscriptor + notificador sobre el mismo campo ⇒ silencio", async () => {
    const source = `
class Order {
  subscribe(observer) { this.observers.push(observer); }
  notifyAll(e) { for (const o of this.observers) { o.update(e); } }
  close(e) { this.status = 1; this.mailer.send(e); this.audit.record(e); this.metrics.increment(e); }
  reopen(e) { this.status = 2; this.mailer.send(e); this.audit.record(e); this.metrics.increment(e); }
}
`;
    expect(await ts(source)).toHaveLength(0);
  });

  it("(5b) un 'destinatario' que este archivo RECORRE-E-INVOCA es un despachador ya formalizado, no un interesado cableado ⇒ no cuenta", async () => {
    const source = `
class Dispatcher {
  fire(e) { for (const h of this.mailer) { h.update(e); } }
}
class Order {
  close(e) { this.status = 1; this.mailer.send(e); this.audit.record(e); this.metrics.increment(e); }
  reopen(e) { this.status = 2; this.mailer.send(e); this.audit.record(e); this.metrics.increment(e); }
}
`;
    // `mailer` queda fuera del listado ⇒ sólo dos interesados ⇒ por debajo del piso.
    expect(await ts(source)).toHaveLength(0);
  });
});

describe("hard-wired-notification — las gramáticas donde el ancla vieja era ciega o escribe distinto", () => {
  it("JAVA: campos SIN `this.` y nodo `method_invocation` — el lenguaje donde el ancla vieja ve CERO llamadas en 1.983 archivos de guava", async () => {
    const source = `
class Order {
  private int status;
  void close(String e) {
    status = 1;
    mailer.send(e);
    audit.record(e);
    metrics.increment(e);
  }
  void reopen(String e) {
    status = 2;
    mailer.send(e);
    audit.record(e);
    metrics.increment(e);
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
  });

  it("PYTHON: `self.F`", async () => {
    const source = `
class Order:
    def close(self, e):
        self.status = 1
        self.mailer.send(e)
        self.audit.record(e)
        self.metrics.increment(e)

    def reopen(self, e):
        self.status = 2
        self.mailer.send(e)
        self.audit.record(e)
        self.metrics.increment(e)
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(1);
  });

  it("RUBY: variables de instancia `@F`", async () => {
    const source = `
class Order
  def close(e)
    @status = 1
    @mailer.send(e)
    @audit.record(e)
    @metrics.increment(e)
  end

  def reopen(e)
    @status = 2
    @mailer.send(e)
    @audit.record(e)
    @metrics.increment(e)
  end
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(1);
  });

  it("GO: receptor de método como único vehículo de 'campo propio'", async () => {
    const source = `
package p

type Order struct{ status int }

func (o *Order) Close(e string) {
	o.status = 1
	o.mailer.Send(e)
	o.audit.Record(e)
	o.metrics.Increment(e)
}

func (o *Order) Reopen(e string) {
	o.status = 2
	o.mailer.Send(e)
	o.audit.Record(e)
	o.metrics.Increment(e)
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-go.wasm", probe: GO_PROBE, language: "go", source });
    expect(findings).toHaveLength(1);
  });
});

describe("hard-wired-notification — contrato de registro", () => {
  it("está registrado en `DETECTORS`, es `intra-file` y no pide grafo ni capacidades", () => {
    expect(DETECTORS.some((d) => d.id === "hard-wired-notification")).toBe(true);
    expect(detector.scope).toBe("intra-file");
    expect(detector.kind).toBe("hard-wired-notification");
    expect(detector.needs).toEqual([]);
    expect("needsGraph" in detector ? detector.needsGraph : false).toBeFalsy();
  });

  it("los dos umbrales llevan su razón escrita", () => {
    expect(JSON.stringify(detector.thresholds)).toContain("par fijo");
    expect(JSON.stringify(detector.thresholds)).toContain("OBLIGA A TOCAR A QUIEN CAMBIA");
  });
});
