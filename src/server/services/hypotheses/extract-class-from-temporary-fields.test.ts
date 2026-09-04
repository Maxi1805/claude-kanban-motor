/**
 * `extract-class-from-temporary-fields.test.ts` — Ola AW, frente AW2.
 *
 * Árboles REALES (`detect/testing.ts`) y **el detector de verdad**: cada caso
 * corre `detect/intra-file/temporary-field.ts` sobre la fixture y le pasa a la
 * hipótesis los `Finding` que ese detector produjo, no un `Finding` armado a
 * mano. Así lo que se congela es la cadena entera ancla ⇒ remedio, que es lo
 * que la corrida mide.
 *
 * LOS SEIS LENGUAJES. La forma que esta familia afirma, y nada más: **dos o
 * más campos temporales de la misma unidad-tipo que NACEN en el mismo miembro
 * y MUEREN en el mismo miembro, conviviendo con otros campos de la clase.**
 * Cada silencio de abajo es una de las cinco precondiciones del docstring.
 */
import { describe, expect, it } from "vitest";

import { detector as temporaryField } from "../detect/intra-file/temporary-field.js";
import type { Capability } from "../detect/capabilities.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, testContext } from "../detect/testing.js";
import type { FileUnit, Finding, RawFinding } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { hypothesis as extractClass } from "./extract-class-from-temporary-fields.js";
import { hypothesis as state } from "./state.js";
import type { HypothesisContext } from "./types.js";

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

/** Corre el DETECTOR real sobre la fixture y devuelve el árbol y sus hallazgos. */
async function anclas(caso: Caso, source: string): Promise<{ file: FileUnit; findings: readonly Finding[] }> {
  const [sets, root] = await Promise.all([nodeSetsFor(caso.wasm, caso.probe), parseRoot(caso.wasm, source)]);
  const file = fileUnitFrom(root, sets, caso.lenguaje, { file: `fixture.${caso.lenguaje}` });
  const crudos = temporaryField.run(file, testContext(temporaryField, caso.lenguaje)) as readonly RawFinding[];
  const findings = crudos.map((f, i) => ({
    ...f,
    id: `temporary-field:${i}`,
    detectorId: "temporary-field",
    kind: "temporary-field",
    scope: "intra-file",
    language: caso.lenguaje,
  })) as unknown as readonly Finding[];
  return { file, findings };
}

/** Todas las propuestas de la familia sobre TODOS los hallazgos de la fixture. */
async function propuestas(caso: Caso, source: string) {
  const { file, findings } = await anclas(caso, source);
  return findings.map((f) => extractClass.build(f, null, ctxFor(file))).filter((h) => h !== null);
}

interface Caso {
  readonly lenguaje: string;
  readonly wasm: string;
  readonly probe: string;
  /** DOS campos temporales que llena el mismo miembro y vacía el mismo miembro, con otros campos al lado. */
  readonly racimo: string;
  /** UN solo campo temporal: no hay racimo, y el remedio es otro. */
  readonly unSoloCampo: string;
  /** El racimo lo llenan DOS miembros distintos: estado compartido, no una fase. */
  readonly dosLlenadores: string;
  /** El constructor le da un valor real al racimo: es identidad, no vida corta. */
  readonly constructorLosLlena: string;
  /** El racimo es TODA la clase: la clase YA ES el objeto extraído (trampa #3). */
  readonly racimoEsTodaLaClase: string;
}

const JS_PROBE = `
class Probe {
  constructor(seed) { this.seed = seed; }
  run(value) { return value; }
}
`;
const TS_PROBE = `
class Probe {
  private seed: number = 0;
  constructor(seed: number) { this.seed = seed; }
  run(value: number): number { return value; }
}
`;
const PYTHON_PROBE = `
class Probe:
    def __init__(self, seed):
        self.seed = seed

    def run(self, value):
        return value
`;
const RUBY_PROBE = `
class Probe
  def initialize(seed)
    @seed = seed
  end

  def run(value)
    value
  end
end
`;
const GO_PROBE = `
package p

type Probe struct{ seed int }

func (p *Probe) Run(value int) int { return value }
`;
const JAVA_PROBE = `
class Probe {
  private int seed;
  Probe(int seed) { this.seed = seed; }
  int run(int value) { return value; }
}
`;
const CSHARP_PROBE = `
class Probe {
  private int seed;
  Probe(int seed) { this.seed = seed; }
  int Run(int value) { return value; }
}
`;

const CASOS: readonly Caso[] = [
  {
    lenguaje: "typescript",
    wasm: "tree-sitter-typescript.wasm",
    probe: TS_PROBE,
    racimo: `
class Server {
  private host: string = "";
  private port: number = 0;
  private consumer: Consumer | null = null;
  private producer: Producer | null = null;
  setHost(h: string): void { this.host = h; }
  start(): void { this.consumer = mkConsumer(); this.producer = mkProducer(); }
  close(): void { this.consumer = null; this.producer = null; }
  poll(): void { if (this.consumer) { this.consumer.poll(); } }
  emit(m: string): void { if (this.producer) { this.producer.send(m); } }
}
`,
    unSoloCampo: `
class Server {
  private host: string = "";
  private consumer: Consumer | null = null;
  setHost(h: string): void { this.host = h; }
  start(): void { this.consumer = mkConsumer(); }
  close(): void { this.consumer = null; }
}
`,
    dosLlenadores: `
class Server {
  private host: string = "";
  private consumer: Consumer | null = null;
  private producer: Producer | null = null;
  setHost(h: string): void { this.host = h; }
  start(): void { this.consumer = mkConsumer(); this.producer = mkProducer(); }
  retry(): void { this.consumer = mkConsumer(); this.producer = mkProducer(); }
  close(): void { this.consumer = null; this.producer = null; }
}
`,
    constructorLosLlena: `
class Server {
  private host: string = "";
  private consumer: Consumer | null = null;
  private producer: Producer | null = null;
  constructor() { this.consumer = mkConsumer(); this.producer = mkProducer(); }
  setHost(h: string): void { this.host = h; }
  start(): void { this.consumer = mkConsumer(); this.producer = mkProducer(); }
  close(): void { this.consumer = null; this.producer = null; }
}
`,
    racimoEsTodaLaClase: `
class Server {
  private consumer: Consumer | null = null;
  private producer: Producer | null = null;
  start(): void { this.consumer = mkConsumer(); this.producer = mkProducer(); }
  close(): void { this.consumer = null; this.producer = null; }
}
`,
  },
  {
    lenguaje: "javascript",
    wasm: "tree-sitter-javascript.wasm",
    probe: JS_PROBE,
    racimo: `
class Server {
  constructor(host) { this.host = host; this.retries = 0; }
  setHost(h) { this.host = h; }
  start() { this.consumer = mkConsumer(); this.producer = mkProducer(); }
  close() { this.consumer = null; this.producer = null; }
  poll() { if (this.consumer) { this.consumer.poll(); } }
  emit(m) { if (this.producer) { this.producer.send(m); } }
}
`,
    unSoloCampo: `
class Server {
  constructor(host) { this.host = host; }
  setHost(h) { this.host = h; }
  start() { this.consumer = mkConsumer(); }
  close() { this.consumer = null; }
}
`,
    dosLlenadores: `
class Server {
  constructor(host) { this.host = host; this.retries = 0; }
  setHost(h) { this.host = h; }
  start() { this.consumer = mkConsumer(); this.producer = mkProducer(); }
  retry() { this.consumer = mkConsumer(); this.producer = mkProducer(); }
  close() { this.consumer = null; this.producer = null; }
}
`,
    constructorLosLlena: `
class Server {
  constructor(host) { this.host = host; this.retries = 0; this.consumer = mkConsumer(); this.producer = mkProducer(); }
  setHost(h) { this.host = h; }
  start() { this.consumer = mkConsumer(); this.producer = mkProducer(); }
  close() { this.consumer = null; this.producer = null; }
}
`,
    racimoEsTodaLaClase: `
class Server {
  start() { this.consumer = mkConsumer(); this.producer = mkProducer(); }
  close() { this.consumer = null; this.producer = null; }
}
`,
  },
  {
    lenguaje: "python",
    wasm: "tree-sitter-python.wasm",
    probe: PYTHON_PROBE,
    racimo: `
class Server:
    def __init__(self, host):
        self.host = host
        self.retries = 0

    def set_host(self, h):
        self.host = h

    def start(self, cfg):
        self.consumer = mk_consumer(cfg)
        self.producer = mk_producer(cfg)

    def close(self, now):
        self.consumer = None
        self.producer = None

    def poll(self, now):
        return self.consumer.poll(now)

    def emit(self, m):
        return self.producer.send(m)
`,
    unSoloCampo: `
class Server:
    def __init__(self, host):
        self.host = host

    def set_host(self, h):
        self.host = h

    def start(self, cfg):
        self.consumer = mk_consumer(cfg)

    def close(self, now):
        self.consumer = None
`,
    dosLlenadores: `
class Server:
    def __init__(self, host):
        self.host = host
        self.retries = 0

    def set_host(self, h):
        self.host = h

    def start(self, cfg):
        self.consumer = mk_consumer(cfg)
        self.producer = mk_producer(cfg)

    def retry(self, cfg):
        self.consumer = mk_consumer(cfg)
        self.producer = mk_producer(cfg)

    def close(self, now):
        self.consumer = None
        self.producer = None
`,
    constructorLosLlena: `
class Server:
    def __init__(self, host):
        self.host = host
        self.retries = 0
        self.consumer = mk_consumer(host)
        self.producer = mk_producer(host)

    def set_host(self, h):
        self.host = h

    def start(self, cfg):
        self.consumer = mk_consumer(cfg)
        self.producer = mk_producer(cfg)

    def close(self, now):
        self.consumer = None
        self.producer = None
`,
    racimoEsTodaLaClase: `
class Server:
    def start(self, cfg):
        self.consumer = mk_consumer(cfg)
        self.producer = mk_producer(cfg)

    def close(self, now):
        self.consumer = None
        self.producer = None
`,
  },
  {
    lenguaje: "ruby",
    wasm: "tree-sitter-ruby.wasm",
    probe: RUBY_PROBE,
    racimo: `
class Server
  def initialize(host)
    @host = host
    @retries = 0
  end

  def set_host(h)
    @host = h
  end

  def start(cfg)
    @consumer = mk_consumer(cfg)
    @producer = mk_producer(cfg)
  end

  def close(now)
    @consumer = nil
    @producer = nil
  end

  def poll(now)
    @consumer.poll(now)
  end

  def emit(m)
    @producer.send(m)
  end
end
`,
    unSoloCampo: `
class Server
  def initialize(host)
    @host = host
  end

  def set_host(h)
    @host = h
  end

  def start(cfg)
    @consumer = mk_consumer(cfg)
  end

  def close(now)
    @consumer = nil
  end
end
`,
    dosLlenadores: `
class Server
  def initialize(host)
    @host = host
    @retries = 0
  end

  def set_host(h)
    @host = h
  end

  def start(cfg)
    @consumer = mk_consumer(cfg)
    @producer = mk_producer(cfg)
  end

  def retry_now(cfg)
    @consumer = mk_consumer(cfg)
    @producer = mk_producer(cfg)
  end

  def close(now)
    @consumer = nil
    @producer = nil
  end
end
`,
    constructorLosLlena: `
class Server
  def initialize(host)
    @host = host
    @retries = 0
    @consumer = mk_consumer(host)
    @producer = mk_producer(host)
  end

  def set_host(h)
    @host = h
  end

  def start(cfg)
    @consumer = mk_consumer(cfg)
    @producer = mk_producer(cfg)
  end

  def close(now)
    @consumer = nil
    @producer = nil
  end
end
`,
    racimoEsTodaLaClase: `
class Server
  def start(cfg)
    @consumer = mk_consumer(cfg)
    @producer = mk_producer(cfg)
  end

  def close(now)
    @consumer = nil
    @producer = nil
  end
end
`,
  },
  {
    lenguaje: "go",
    wasm: "tree-sitter-go.wasm",
    probe: GO_PROBE,
    racimo: `
package p

type Server struct {
	host     string
	retries  int
	consumer *Consumer
	producer *Producer
}

func (s *Server) SetHost(h string) {
	s.host = h
}

func (s *Server) Start(cfg int) {
	s.consumer = NewConsumer(cfg)
	s.producer = NewProducer(cfg)
}

func (s *Server) Close(now int) {
	s.consumer = nil
	s.producer = nil
}

func (s *Server) Poll(now int) int {
	return s.consumer.Poll(now)
}

func (s *Server) Emit(m int) int {
	return s.producer.Send(m)
}
`,
    unSoloCampo: `
package p

type Server struct {
	host     string
	consumer *Consumer
}

func (s *Server) SetHost(h string) {
	s.host = h
}

func (s *Server) Start(cfg int) {
	s.consumer = NewConsumer(cfg)
}

func (s *Server) Close(now int) {
	s.consumer = nil
}
`,
    dosLlenadores: `
package p

type Server struct {
	host     string
	retries  int
	consumer *Consumer
	producer *Producer
}

func (s *Server) SetHost(h string) {
	s.host = h
}

func (s *Server) Start(cfg int) {
	s.consumer = NewConsumer(cfg)
	s.producer = NewProducer(cfg)
}

func (s *Server) Retry(cfg int) {
	s.consumer = NewConsumer(cfg)
	s.producer = NewProducer(cfg)
}

func (s *Server) Close(now int) {
	s.consumer = nil
	s.producer = nil
}
`,
    // Go no tiene constructores: la fixture del constructor se cubre con la
    // MISMA forma de "dos llenadores" y el caso propio del constructor lo
    // afirma el test aparte de abajo, que sólo corre en los lenguajes que sí
    // tienen `constructorNodes`.
    constructorLosLlena: `
package p

type Server struct {
	host     string
	retries  int
	consumer *Consumer
	producer *Producer
}

func (s *Server) SetHost(h string) {
	s.host = h
}

func (s *Server) Start(cfg int) {
	s.consumer = NewConsumer(cfg)
	s.producer = NewProducer(cfg)
}

func (s *Server) Retry(cfg int) {
	s.consumer = NewConsumer(cfg)
	s.producer = NewProducer(cfg)
}

func (s *Server) Close(now int) {
	s.consumer = nil
	s.producer = nil
}
`,
    racimoEsTodaLaClase: `
package p

type Server struct {
	consumer *Consumer
	producer *Producer
}

func (s *Server) Start(cfg int) {
	s.consumer = NewConsumer(cfg)
	s.producer = NewProducer(cfg)
}

func (s *Server) Close(now int) {
	s.consumer = nil
	s.producer = nil
}
`,
  },
  {
    lenguaje: "java",
    wasm: "tree-sitter-java.wasm",
    probe: JAVA_PROBE,
    racimo: `
class Server {
  private String host;
  private int retries;
  private Consumer consumer;
  private Producer producer;

  void setHost(String h) { host = h; }

  void start(int cfg) { consumer = newConsumer(cfg); producer = newProducer(cfg); }

  void close(int now) { consumer = null; producer = null; }

  int poll(int now) { return consumer.poll(now); }

  int emit(int m) { return producer.send(m); }
}
`,
    unSoloCampo: `
class Server {
  private String host;
  private Consumer consumer;

  void setHost(String h) { host = h; }

  void start(int cfg) { consumer = newConsumer(cfg); }

  void close(int now) { consumer = null; }
}
`,
    dosLlenadores: `
class Server {
  private String host;
  private int retries;
  private Consumer consumer;
  private Producer producer;

  void setHost(String h) { host = h; }

  void start(int cfg) { consumer = newConsumer(cfg); producer = newProducer(cfg); }

  void retry(int cfg) { consumer = newConsumer(cfg); producer = newProducer(cfg); }

  void close(int now) { consumer = null; producer = null; }
}
`,
    constructorLosLlena: `
class Server {
  private String host;
  private int retries;
  private Consumer consumer;
  private Producer producer;

  Server(int cfg) { consumer = newConsumer(cfg); producer = newProducer(cfg); }

  void setHost(String h) { host = h; }

  void start(int cfg) { consumer = newConsumer(cfg); producer = newProducer(cfg); }

  void close(int now) { consumer = null; producer = null; }
}
`,
    racimoEsTodaLaClase: `
class Server {
  private Consumer consumer;
  private Producer producer;


  void start(int cfg) { consumer = newConsumer(cfg); producer = newProducer(cfg); }

  void close(int now) { consumer = null; producer = null; }
}
`,
  },
  {
    lenguaje: "csharp",
    wasm: "tree-sitter-c_sharp.wasm",
    probe: CSHARP_PROBE,
    racimo: `
class Server {
  private string host;
  private int retries;
  private Consumer consumer;
  private Producer producer;

  void SetHost(string h) { host = h; }

  void Start(int cfg) { consumer = NewConsumer(cfg); producer = NewProducer(cfg); }

  void Close(int now) { consumer = null; producer = null; }

  int Poll(int now) { return consumer.Poll(now); }

  int Emit(int m) { return producer.Send(m); }
}
`,
    unSoloCampo: `
class Server {
  private string host;
  private Consumer consumer;

  void SetHost(string h) { host = h; }

  void Start(int cfg) { consumer = NewConsumer(cfg); }

  void Close(int now) { consumer = null; }
}
`,
    dosLlenadores: `
class Server {
  private string host;
  private int retries;
  private Consumer consumer;
  private Producer producer;

  void SetHost(string h) { host = h; }

  void Start(int cfg) { consumer = NewConsumer(cfg); producer = NewProducer(cfg); }

  void Retry(int cfg) { consumer = NewConsumer(cfg); producer = NewProducer(cfg); }

  void Close(int now) { consumer = null; producer = null; }
}
`,
    constructorLosLlena: `
class Server {
  private string host;
  private int retries;
  private Consumer consumer;
  private Producer producer;

  Server(int cfg) { consumer = NewConsumer(cfg); producer = NewProducer(cfg); }

  void SetHost(string h) { host = h; }

  void Start(int cfg) { consumer = NewConsumer(cfg); producer = NewProducer(cfg); }

  void Close(int now) { consumer = null; producer = null; }
}
`,
    racimoEsTodaLaClase: `
class Server {
  private Consumer consumer;
  private Producer producer;


  void Start(int cfg) { consumer = NewConsumer(cfg); producer = NewProducer(cfg); }

  void Close(int now) { consumer = null; producer = null; }
}
`,
  },
];

describe("Extract Class (campos temporales)", () => {
  describe.each(CASOS)("$lenguaje", (caso) => {
    it("EMITE sobre el racimo que nace en un miembro y muere en otro", async () => {
      const hs = await propuestas(caso, caso.racimo);
      expect(hs, `${caso.lenguaje}: no emitió`).toHaveLength(1);
      const h = hs[0]!;
      expect(h.pattern).toBe("Extract Class (campos temporales)");
      // Los DOS campos del racimo aparecen nombrados en el rol del llenador.
      expect(h.places[0]!.role).toContain("consumer");
      expect(h.places[0]!.role).toContain("producer");
    });

    it("UNA PROPUESTA POR RACIMO: el racimo son 2 hallazgos y sale 1 sola recomendación", async () => {
      const { findings } = await anclas(caso, caso.racimo);
      expect(findings.length, `${caso.lenguaje}: el detector no vio los dos campos`).toBeGreaterThanOrEqual(2);
      expect(await propuestas(caso, caso.racimo)).toHaveLength(1);
    });

    it("CALLA con UN solo campo temporal: no hay objeto escondido, hay una variable de trabajo", async () => {
      expect(await propuestas(caso, caso.unSoloCampo)).toHaveLength(0);
    });

    it("CALLA cuando el racimo lo llenan DOS miembros (estado compartido, no una fase)", async () => {
      expect(await propuestas(caso, caso.dosLlenadores)).toHaveLength(0);
    });

    it("TRAMPA #3: CALLA cuando el racimo es TODA la clase — la clase YA ES el objeto extraído", async () => {
      expect(await propuestas(caso, caso.racimoEsTodaLaClase)).toHaveLength(0);
    });

    it("CALLA cuando el constructor le da un valor real al racimo (es identidad, no vida corta)", async () => {
      expect(await propuestas(caso, caso.constructorLosLlena)).toHaveLength(0);
    });

    it("TRAMPA #2: `appliedState` es SIEMPRE `ausente`, así que no le puede retirar la propuesta a nadie", async () => {
      const hs = await propuestas(caso, caso.racimo);
      expect(hs[0]!.state).toBe("ausente");
    });
  });

  it("sin árbol vivo (`ctx.file === null`) no inventa nada", async () => {
    const caso = CASOS[0]!;
    const { findings } = await anclas(caso, caso.racimo);
    for (const f of findings) expect(extractClass.build(f, null, ctxFor(null))).toBeNull();
  });

  it("YA NO comparte el ancla con `State` (Ola AZ, AZ3) — y aun así sigue sin poder retirarle nada a nadie", async () => {
    // HASTA LA OLA AY este test decía "COMPARTE el ancla con `State`". Ya no:
    // AZ3 retiró `temporary-field` de `state.ts#anchors` (20 verdaderas de 211
    // juicios = 9,5 %; 26 sujetos frescos = 4,2 %; ver ola-az/informes/AZ3.md).
    // Esta familia queda como ÚNICA dueña del ancla, que es justo lo que AY2
    // había dejado planteado con su número: `State` rendía 9,5 % sobre el mismo
    // cable donde ésta rinde 63,2 %.
    expect(state.anchors).not.toContain("temporary-field");
    expect(extractClass.anchors).toContain("temporary-field");
    // LA ASERCIÓN DE FONDO NO SE AFLOJA, y es la que importaba desde el
    // principio: `arbitrateRivalHypotheses` sólo retira frente a un estado
    // CONFIRMADO (`ya-aplicado`/`aplicado-eludido`), y esta familia nunca lo
    // alcanza — sigue siendo `ausente` SIEMPRE, así que no le puede retirar la
    // propuesta a nadie, comparta el ancla o no.
    const caso = CASOS[0]!;
    const hs = await propuestas(caso, caso.racimo);
    expect(hs.every((h) => h.state === "ausente")).toBe(true);
  });

  it("el registro declara el nombre y el id que el informe publica", () => {
    expect(extractClass.id).toBe("extract-class-from-temporary-fields");
    expect(extractClass.pattern).toBe("Extract Class (campos temporales)");
    expect([...extractClass.anchors]).toEqual(["temporary-field"]);
  });
});
