import { describe, expect, it } from "vitest";

import { detector } from "./manual-notification.js";
import { runIntraFile } from "../testing.js";

const JS_PROBE = "class Probe { constructor() { this.x = 1; } method(a) { return a; } }\n";
const PYTHON_PROBE = "class Probe:\n    def __init__(self):\n        self.x = 1\n    def method(self, a):\n        return a\n";
const RUBY_PROBE = "class Probe\n  def initialize\n    @x = 1\n  end\n  def method(a)\n    a\n  end\nend\n";
const GO_PROBE = "package p\ntype T struct{ x int }\nfunc (t *T) Method(a int) int {\n\tt.x = a\n\treturn a\n}\n";

describe("manual-notification", () => {
  it("TypeScript: 2 miembros distintos, cada uno notifica >=2 campos con el mismo (método, aridad), tras mutar estado propio ⇒ 1 hallazgo, 2 sitios", async () => {
    const source = `
class Subject {
  onCreate(event) {
    this.status = "created";
    this.emailObserver.onChange(event);
    this.smsObserver.onChange(event);
  }
  onDelete(event) {
    this.status = "deleted";
    this.emailObserver.onChange(event);
    this.smsObserver.onChange(event);
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
    expect(findings[0]!.locations.map((l) => l.symbol)).toEqual(["onCreate", "onDelete"]);
  });

  it("sólo 1 miembro notifica a mano ⇒ sin hallazgo (la repetición es la señal)", async () => {
    const source = `
class Subject {
  onCreate(event) {
    this.status = "created";
    this.emailObserver.onChange(event);
    this.smsObserver.onChange(event);
  }
  onDelete(event) {
    this.status = "deleted";
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(0);
  });

  it("2 llamadas al MISMO campo (no distinto) ⇒ sin hallazgo (no es fan-out a colaboradores distintos)", async () => {
    const source = `
class Subject {
  onCreate(event) {
    this.status = "created";
    this.emailObserver.onChange(event);
    this.emailObserver.onChange(event);
  }
  onDelete(event) {
    this.status = "deleted";
    this.emailObserver.onChange(event);
    this.emailObserver.onChange(event);
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(0);
  });

  it("el miembro NUNCA muta su propio estado ⇒ sin hallazgo (simplificación declarada del módulo)", async () => {
    const source = `
class Subject {
  onCreate(event) {
    this.emailObserver.onChange(event);
    this.smsObserver.onChange(event);
  }
  onDelete(event) {
    this.emailObserver.onChange(event);
    this.smsObserver.onChange(event);
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(0);
  });

  it("la fixture canónica de Observer (colección + recorrido, sin campos nombrados) NO dispara — es la forma correcta, no el olor", async () => {
    const source = `
class Subject {
  observers = [];
  attach(observer) {
    this.observers.push(observer);
  }
  notifyAll(event) {
    for (const observer of this.observers) {
      observer.update(event);
    }
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(0);
  });

  it("Python: misma forma", async () => {
    const source = `
class Subject:
    def on_create(self, event):
        self.status = "created"
        self.email_observer.on_change(event)
        self.sms_observer.on_change(event)
    def on_delete(self, event):
        self.status = "deleted"
        self.email_observer.on_change(event)
        self.sms_observer.on_change(event)
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
  });

  it("Ruby: misma forma (`@x`)", async () => {
    const source = `
class Subject
  def on_create(event)
    @status = "created"
    @email_observer.on_change(event)
    @sms_observer.on_change(event)
  end
  def on_delete(event)
    @status = "deleted"
    @email_observer.on_change(event)
    @sms_observer.on_change(event)
  end
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
  });

  it("Go: receptor de método, sin nodo de clase", async () => {
    const source = `
package events

type Subject struct {
	status string
	emailObserver EmailObserver
	smsObserver SmsObserver
}

func (s *Subject) OnCreate(event string) {
	s.status = "created"
	s.emailObserver.OnChange(event)
	s.smsObserver.OnChange(event)
}

func (s *Subject) OnDelete(event string) {
	s.status = "deleted"
	s.emailObserver.OnChange(event)
	s.smsObserver.OnChange(event)
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-go.wasm", probe: GO_PROBE, language: "go", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
  });

  it("Go: dos llamadas de campo-método con el mismo (método, aridad) COMBINADAS por `&&` en una condición ⇒ sin hallazgo (falso positivo medido en cobra/command.go#LocalFlags: son dos chequeos de existencia independientes, no una notificación secuencial)", async () => {
    const source = `
package p

type Command struct {
	lflags *FlagSet
	parentsPflags *FlagSet
}

func (c *Command) LocalFlags() *FlagSet {
	c.lflags = NewFlagSet()
	addToLocal := func(name string) {
		if c.lflags.Lookup(name) == nil && name != c.parentsPflags.Lookup(name) {
			c.lflags.AddFlag(name)
		}
	}
	addToLocal("x")
	return c.lflags
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-go.wasm", probe: GO_PROBE, language: "go", source });
    expect(findings).toHaveLength(0);
  });

  it("SEGUNDA CAUSA MEDIDA: mismo método sin argumentos sobre 2 campos recién construidos ⇒ sin hallazgo (medido: nest ClientRedis.connect/ClientKafka.connect — construir-y-usar un sub-recurso propio, no notificar un cambio a colaboradores)", async () => {
    const source = `
class ClientRedis {
  connect() {
    this.pubClient = this.createClient();
    this.subClient = this.createClient();
    this.pubClient.connect();
    this.subClient.connect();
  }
  close() {
    this.pubClient = null;
    this.subClient = null;
    this.pubClient.quit();
    this.subClient.quit();
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(0);
  });

  it("SEGUNDA CAUSA MEDIDA: mismo (método, aridad) sobre 2 campos, cada uno con SU PROPIO argumento ⇒ sin hallazgo (medido: hugo IntSets.setDefaultsIfNotSet/sqlalchemy InstanceState.__setstate__ — delegación con dato propio por colaborador, no la MISMA noticia repartida)", async () => {
    const source = `
class Subject {
  setDefaultsIfNotSet(cfg) {
    this.status = "defaulted";
    this.languages.set(cfg.configuredLanguages);
    this.versions.set(cfg.configuredVersions);
  }
  setAllIfNotSet(cfg) {
    this.status = "all-defaulted";
    this.languages.set(cfg.configuredLanguages);
    this.versions.set(cfg.configuredVersions);
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(0);
  });

  it("declara su id, kind, scope y umbral", () => {
    expect(detector.id).toBe("manual-notification");
    expect(detector.kind).toBe("manual-notification");
    expect(detector.scope).toBe("intra-file");
    expect(detector.needs).toEqual([]);
  });
});
