/**
 * `consolidate-conditional.test.ts` — Ola AS, frente AS2.
 * Árboles REALES (`detect/testing.ts`), los seis lenguajes en la tabla.
 */
import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import type { FileUnit, Finding } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { hypothesis as consolidate } from "./consolidate-conditional.js";
import type { HypothesisContext } from "./types.js";

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(2, { rationale: "test" }), { language: "typescript", sampleSize: () => 0, corpusP95: () => null });
}

function finding(kind: string, file: FileUnit, symbol: string, startLine: number, endLine: number): Finding {
  return {
    id: `f-${kind}-1`,
    detectorId: kind,
    kind: kind as Finding["kind"],
    scope: "intra-function",
    language: file.language,
    title: symbol,
    detail: "d",
    trigger: [{ label: "x", value: 3, threshold: fakeThreshold() }],
    locations: [{ file: file.path, startLine, endLine, symbol, role: "r" }],
    severity: 50,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
  };
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
  // `cognitive: 30` NO es decorativo: `ownerAnchor` (el desempate entre anclas)
  // lee las MÉTRICAS de la función encerrante, y con `ZERO_METRICS` el dueño
  // sería `duplication`. Se declara acá qué está asumiendo el test — mismo
  // criterio que `extract-method.test.ts#unitConMetricas`.
  return fileUnitFrom(root, sets, language, { file: `fixture.${language}`, metrics: { cognitive: 30 } });
}

function target(file: FileUnit, name: string): { symbol: string; startLine: number; endLine: number } {
  const fn = file.functions.find((f) => f.name === name) ?? file.functions[0];
  if (!fn) throw new Error(`sin función ${name} en ${file.language}`);
  return { symbol: fn.name ?? "?", startLine: fn.startLine, endLine: fn.endLine };
}

interface Caso {
  readonly lenguaje: string;
  readonly wasm: string;
  readonly probe: string;
  readonly nombre: string;
  /** FORMA A: tres guardas seguidas con el MISMO cuerpo. */
  readonly formaA: string;
  /** FORMA B: el mismo fragmento en TODAS las ramas. */
  readonly formaB: string;
  /** La forma A, pero con una condición que INVOCA: unirlas cambiaría cuándo se ejecuta. */
  readonly conEfecto: string;
}

const CASOS: readonly Caso[] = [
  {
    lenguaje: "typescript",
    wasm: "tree-sitter-typescript.wasm",
    probe: `function top(x: number): number { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\nclass P { m(x: number): void { if (x > 0) { this.m(1); } else if (x < 0) { this.m(2); } else { this.m(3); } switch (x) { case 1: this.m(1); break; default: break; } try { this.m(x); } catch (e) { this.m(x); } for (const y of []) { this.m(1); } } }`,
    nombre: "amount",
    formaA: `function amount(sen: number, months: number, part: boolean): number {
  if (sen < 2) { return theBaseAmountForNoOne; }
  if (months > 12) { return theBaseAmountForNoOne; }
  if (part) { return theBaseAmountForNoOne; }
  return 42;
}`,
    formaB: `function amount(special: boolean, price: number): number {
  let total = 0;
  if (special) {
    total = price * 0.95;
    sendTheOrderNotification(total);
  } else {
    total = price * 0.98;
    sendTheOrderNotification(total);
  }
  return total;
}`,
    conEfecto: `function amount(sen: number, months: number, part: boolean): number {
  if (check(sen)) { return theBaseAmountForNoOne; }
  if (check(months)) { return theBaseAmountForNoOne; }
  if (check(part)) { return theBaseAmountForNoOne; }
  return 42;
}`,
  },
  {
    lenguaje: "python",
    wasm: "tree-sitter-python.wasm",
    probe: `class P:
    def m(self, x):
        if x > 0:
            self.m(1)
        elif x < 0:
            self.m(2)
        else:
            self.m(3)
        match x:
            case 1:
                self.m(1)
            case _:
                self.m(2)
        try:
            self.m(x)
        except Exception:
            self.m(x)
        for y in []:
            self.m(1)
`,
    nombre: "amount",
    formaA: `def amount(sen, months, part):
    if sen < 2:
        return the_base_amount_for_no_one
    if months > 12:
        return the_base_amount_for_no_one
    if part:
        return the_base_amount_for_no_one
    return 42
`,
    formaB: `def amount(special, price):
    if special:
        total = price * 0.95
        send_the_order_notification(total)
    else:
        total = price * 0.98
        send_the_order_notification(total)
    return total
`,
    conEfecto: `def amount(sen, months, part):
    if check(sen):
        return the_base_amount_for_no_one
    if check(months):
        return the_base_amount_for_no_one
    if check(part):
        return the_base_amount_for_no_one
    return 42
`,
  },
  {
    lenguaje: "ruby",
    wasm: "tree-sitter-ruby.wasm",
    probe: `class P
  def m(x)
    if x > 0
      m(1)
    elsif x < 0
      m(2)
    else
      m(3)
    end
    case x
    when 1 then m(1)
    else m(2)
    end
    begin
      m(x)
    rescue => e
      m(x)
    end
    while x > 0
      m(1)
    end
  end
end
`,
    nombre: "amount",
    formaA: `def amount(sen, months, part)
  if sen < 2
    return the_base_amount_for_no_one
  end
  if months > 12
    return the_base_amount_for_no_one
  end
  if part
    return the_base_amount_for_no_one
  end
  42
end
`,
    formaB: `def amount(special, price)
  if special
    total = price * 0.95
    send_the_order_notification(total)
  else
    total = price * 0.98
    send_the_order_notification(total)
  end
  total
end
`,
    conEfecto: `def amount(sen, months, part)
  if check(sen)
    return the_base_amount_for_no_one
  end
  if check(months)
    return the_base_amount_for_no_one
  end
  if check(part)
    return the_base_amount_for_no_one
  end
  42
end
`,
  },
  {
    lenguaje: "go",
    wasm: "tree-sitter-go.wasm",
    probe: `package p

type T struct{ n int }

func Top(x int) int {
	if x > 0 {
		return 1
	} else if x < 0 {
		return 2
	}
	return 3
}

func (t *T) M(x int) int {
	if x > 0 {
		t.M(1)
	} else if x < 0 {
		t.M(2)
	} else {
		t.M(3)
	}
	switch x {
	case 1:
		t.M(1)
	default:
		t.M(2)
	}
	for i := 0; i < 3; i++ {
		t.M(i)
	}
	return 0
}
`,
    nombre: "Amount",
    formaA: `package p

func Amount(sen int, months int, part bool) int {
	if sen < 2 {
		return theBaseAmountForNoOne
	}
	if months > 12 {
		return theBaseAmountForNoOne
	}
	if part {
		return theBaseAmountForNoOne
	}
	return 42
}
`,
    formaB: `package p

func Amount(special bool, price float64) float64 {
	var total float64
	if special {
		total = price * 0.95
		sendTheOrderNotification(total)
	} else {
		total = price * 0.98
		sendTheOrderNotification(total)
	}
	return total
}
`,
    conEfecto: `package p

func Amount(sen int, months int, part bool) int {
	if check(sen) {
		return theBaseAmountForNoOne
	}
	if check(months) {
		return theBaseAmountForNoOne
	}
	if check(part) {
		return theBaseAmountForNoOne
	}
	return 42
}
`,
  },
  {
    lenguaje: "java",
    wasm: "tree-sitter-java.wasm",
    probe: `class P {
  void m(int x) {
    if (x > 0) { m(1); } else if (x < 0) { m(2); } else { m(3); }
    switch (x) { case 1: m(1); break; default: m(2); }
    try { m(x); } catch (Exception e) { m(x); }
    for (int i = 0; i < 3; i++) { m(i); }
  }
}
`,
    nombre: "amount",
    formaA: `class A {
  int amount(int sen, int months, boolean part) {
    if (sen < 2) { return theBaseAmountForNoOne; }
    if (months > 12) { return theBaseAmountForNoOne; }
    if (part) { return theBaseAmountForNoOne; }
    return 42;
  }
}
`,
    formaB: `class A {
  double amount(boolean special, double price) {
    double total;
    if (special) {
      total = price * 0.95;
      sendTheOrderNotification(total);
    } else {
      total = price * 0.98;
      sendTheOrderNotification(total);
    }
    return total;
  }
}
`,
    conEfecto: `class A {
  int amount(int sen, int months, boolean part) {
    if (check(sen)) { return theBaseAmountForNoOne; }
    if (check(months)) { return theBaseAmountForNoOne; }
    if (check(part)) { return theBaseAmountForNoOne; }
    return 42;
  }
}
`,
  },
  {
    lenguaje: "csharp",
    wasm: "tree-sitter-c_sharp.wasm",
    probe: `class P {
  void M(int x) {
    if (x > 0) { M(1); } else if (x < 0) { M(2); } else { M(3); }
    switch (x) { case 1: M(1); break; default: M(2); break; }
    try { M(x); } catch (System.Exception e) { M(x); }
    for (int i = 0; i < 3; i++) { M(i); }
  }
}
`,
    nombre: "Amount",
    formaA: `class A {
  int Amount(int sen, int months, bool part) {
    if (sen < 2) { return TheBaseAmountForNoOne; }
    if (months > 12) { return TheBaseAmountForNoOne; }
    if (part) { return TheBaseAmountForNoOne; }
    return 42;
  }
}
`,
    formaB: `class A {
  double Amount(bool special, double price) {
    double total;
    if (special) {
      total = price * 0.95;
      SendTheOrderNotification(total);
    } else {
      total = price * 0.98;
      SendTheOrderNotification(total);
    }
    return total;
  }
}
`,
    conEfecto: `class A {
  int Amount(int sen, int months, bool part) {
    if (Check(sen)) { return TheBaseAmountForNoOne; }
    if (Check(months)) { return TheBaseAmountForNoOne; }
    if (Check(part)) { return TheBaseAmountForNoOne; }
    return 42;
  }
}
`,
  },
];

describe("hypotheses/consolidate-conditional — LOS SEIS LENGUAJES, FORMA A (mismo cuerpo, condiciones distintas)", () => {
  for (const caso of CASOS) {
    it(`${caso.lenguaje}: tres guardas con el MISMO cuerpo ⇒ emite`, async () => {
      const file = await unit(caso.wasm, caso.probe, caso.formaA, caso.lenguaje);
      const t = target(file, caso.nombre);
      const h = consolidate.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file));
      expect(h, `${caso.lenguaje} no emitió — la hipótesis quedó MUDA en ese lenguaje`).not.toBeNull();
      expect(h!.state).toBe("ausente");
    });

    it(`${caso.lenguaje}: si las condiciones INVOCAN ⇒ silencio (unirlas cambiaría cuándo se ejecutan)`, async () => {
      const file = await unit(caso.wasm, caso.probe, caso.conEfecto, caso.lenguaje);
      const t = target(file, caso.nombre);
      expect(consolidate.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file))).toBeNull();
    });
  }
});

describe("hypotheses/consolidate-conditional — FORMA B (el mismo fragmento en todas las ramas)", () => {
  for (const caso of CASOS) {
    it(`${caso.lenguaje}: las dos ramas terminan con el MISMO fragmento ⇒ emite`, async () => {
      const file = await unit(caso.wasm, caso.probe, caso.formaB, caso.lenguaje);
      const t = target(file, caso.nombre);
      const h = consolidate.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file));
      expect(h, `${caso.lenguaje} no vio la forma B`).not.toBeNull();
    });
  }
});

describe("hypotheses/consolidate-conditional — lo que NO tiene que emitir", () => {
  const TS = CASOS[0]!;

  it("ramas con cuerpos DISTINTOS ⇒ null", async () => {
    const src = `function amount(sen: number, months: number, part: boolean): number {
  if (sen < 2) { return theFirstDifferentAmount; }
  if (months > 12) { return theSecondDifferentAmount; }
  if (part) { return theThirdDifferentAmount; }
  return 42;
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const t = target(file, "amount");
    expect(consolidate.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file))).toBeNull();
  });

  it("cuerpo repetido TRIVIAL (dos `return`) ⇒ null (coincide por azar en cualquier archivo)", async () => {
    const src = `function amount(a: boolean, b: boolean, c: boolean): void {
  if (a) { return; }
  if (b) { return; }
  if (c) { return; }
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const t = target(file, "amount");
    expect(consolidate.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file))).toBeNull();
  });

  it("EL MODISMO DE ERROR DE GO: mismo cuerpo, misma condición, pero cada rama DECLARA lo suyo en su inicializador ⇒ null", async () => {
    /* FALSO REAL medido en `corpus/cobra doc/rest_docs.go:163`: los dos cuerpos
     * son `{ return err }` y las dos condiciones `err != nil`, pero cada rama
     * llama otra cosa en su inicializador. Unirlas no compila. */
    const GO = CASOS.find((c) => c.lenguaje === "go")!;
    const src = `package p

func Write(f *File, name string) error {
	if _, err := io.WriteString(f, filePrepender(name)); err != nil {
		return err
	}
	if _, err := io.WriteString(f, linkHandler(name)); err != nil {
		return err
	}
	return nil
}
`;
    const file = await unit(GO.wasm, GO.probe, src, "go");
    const t = target(file, "Write");
    expect(consolidate.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file))).toBeNull();
  });

  it("sin `ctx.file` ⇒ null (no evaluado, NUNCA 'cumple')", async () => {
    const file = await unit(TS.wasm, TS.probe, TS.formaA, "typescript");
    const t = target(file, "amount");
    expect(consolidate.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(null))).toBeNull();
  });
});

describe("hypotheses/consolidate-conditional — LA TRAMPA #2: no puede borrarle la propuesta a nadie", () => {
  it("CONTRATO: `state` es SIEMPRE 'ausente'", async () => {
    for (const caso of CASOS) {
      for (const src of [caso.formaA, caso.formaB, caso.conEfecto]) {
        const file = await unit(caso.wasm, caso.probe, src, caso.lenguaje);
        const t = target(file, caso.nombre);
        for (const kind of ["complexity", "conditional-chain", "duplication"]) {
          const h = consolidate.build(finding(kind, file, t.symbol, t.startLine, t.endLine), null, ctxFor(file));
          if (h) expect(h.state, `${caso.lenguaje}/${kind} devolvió un estado CONFIRMADO`).toBe("ausente");
        }
      }
    }
  });

  it("las anclas declaradas son exactamente las tres medidas", () => {
    expect([...consolidate.anchors].sort()).toEqual(["complexity", "conditional-chain", "duplication"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AS, AS2 — LA EXHAUSTIVIDAD DE LA FORMA B, y el falso que la obligó
 *
 * `Ghost koenig/koenig-lexical/src/components/ui/GifSelector.tsx:267
 * handleDown` salió propuesto con «las 2 ramas empiezan con el MISMO
 * fragmento: event.preventDefault()». Son dos `if` HERMANOS sin `else`: subir
 * el fragmento afuera lo ejecuta también cuando ninguna rama daba. No es una
 * consolidación, es un cambio de comportamiento.
 * ══════════════════════════════════════════════════════════════════════════ */
describe("hypotheses/consolidate-conditional — la forma B sólo sobre cadenas EXHAUSTIVAS", () => {
  const TS2 = CASOS[0]!;

  it("dos `if` HERMANOS sin `else` con el mismo primer statement ⇒ silencio", async () => {
    const src = `function handleDown(target: string, high: boolean, event: Event): void {
  if (target === "INPUT") {
    event.preventDefault();
    blur();
    first();
  }
  if (high) {
    event.preventDefault();
    moveDown();
    log();
  }
}`;
    const file = await unit(TS2.wasm, TS2.probe, src, "typescript");
    const t = target(file, "handleDown");
    expect(
      consolidate.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file)),
      "sacar el fragmento afuera de dos `if` hermanos lo ejecuta en un caso que antes no lo ejecutaba",
    ).toBeNull();
  });

  it("la MISMA forma con `else` terminal (la cadena SÍ cubre todo) ⇒ emite", async () => {
    const src = `function handleDown(target: string, high: boolean, event: Event): void {
  if (target === "INPUT") {
    event.preventDefault();
    blur();
    first();
  } else if (high) {
    event.preventDefault();
    moveDown();
    log();
  } else {
    event.preventDefault();
    moveUp();
    log();
  }
}`;
    const file = await unit(TS2.wasm, TS2.probe, src, "typescript");
    const t = target(file, "handleDown");
    expect(
      consolidate.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file)),
      "con `else` terminal la cadena cubre todos los casos y sacar el fragmento es equivalente",
    ).not.toBeNull();
  });

  it("una cadena que vive DENTRO de una función anidada no le pertenece a la de afuera ⇒ silencio", async () => {
    /* 11 de las 76 propuestas de esta familia en la primera medición eran este
     * duplicado (`lexical-to-mobiledoc.ts:307` salió TRES veces). */
    const src = `function outer(xs: string[]): string[] {
  function inner(t: string): string {
    if (t === "a") {
      return "same";
    } else if (t === "b") {
      return "same";
    } else {
      return "other";
    }
  }
  return xs.map(inner);
}`;
    const file = await unit(TS2.wasm, TS2.probe, src, "typescript");
    const outer = file.functions.find((f) => f.name === "outer")!;
    const inner = file.functions.find((f) => f.name === "inner")!;
    expect(
      consolidate.build(finding("complexity", file, "outer", outer.startLine, outer.endLine), null, ctxFor(file)),
      "la función de AFUERA no debe proponer la cadena de la anidada",
    ).toBeNull();
    expect(
      consolidate.build(finding("complexity", file, "inner", inner.startLine, inner.endLine), null, ctxFor(file)),
      "la anidada, que es su dueña, SÍ debe proponerla",
    ).not.toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AS, AS2 — LAS TRES REGLAS QUE ENCONTRÓ JUZGAR LA PRIMERA MEDICIÓN
 *
 * Cada fixture de abajo es la FORMA REAL de un falso que salió publicado, con
 * el archivo y la línea anotados. Los tres se apagan; los tres casos gemelos
 * que SÍ son verdaderos siguen emitiendo.
 * ══════════════════════════════════════════════════════════════════════════ */
describe("hypotheses/consolidate-conditional — adyacencia, hermanos e `else if` de verdad", () => {
  const T = CASOS[0]!;

  async function build(src: string, fn: string, kind = "complexity") {
    const file = await unit(T.wasm, T.probe, src, "typescript");
    const t = target(file, fn);
    return consolidate.build(finding(kind, file, t.symbol, t.startLine, t.endLine), null, ctxFor(file));
  }

  it("ramas NO adyacentes con el mismo cuerpo ⇒ silencio (forma de `eslint function-paren-newline.js:117`)", async () => {
    /* `return hasLeftNewline` en la rama 1 y en la 3; la del medio devuelve
     * otra cosa y sus condiciones se solapan. Adelantar la 3 cambia qué
     * devuelve la función. */
    const src = `function shouldHaveNewlines(multiArgs: boolean, multi: boolean, consistent: boolean, hasLeftNewline: boolean, n: number): boolean {
  if (multiArgs && n === 1) {
    return hasLeftNewline;
  }
  if (multi || multiArgs) {
    return n > 3;
  }
  if (consistent) {
    return hasLeftNewline;
  }
  return false;
}`;
    expect(await build(src, "shouldHaveNewlines")).toBeNull();
  });

  it("las MISMAS dos ramas, ahora ADYACENTES ⇒ emite", async () => {
    const src = `function shouldHaveNewlines(multiArgs: boolean, multi: boolean, consistent: boolean, hasLeftNewline: boolean, n: number): boolean {
  if (multiArgs && n === 1) {
    return hasLeftNewline;
  }
  if (consistent) {
    return hasLeftNewline;
  }
  if (multi || multiArgs) {
    return n > 3;
  }
  return false;
}`;
    expect(await build(src, "shouldHaveNewlines")).not.toBeNull();
  });

  it("`if` HERMANOS cuyo cuerpo ACUMULA (`+=`) ⇒ silencio (forma de `sqlalchemy fixtures/base.py:363`)", async () => {
    /* Unir con `||` cambia el resultado: el original suma DOS cuando las dos
     * condiciones valen, el consolidado suma UNA. */
    const src = `function run(beginNested: boolean, rollback: boolean): number {
  let expectedCommitted = 0;
  if (beginNested) {
    expectedCommitted += 1;
  }
  if (!rollback) {
    expectedCommitted += 1;
  }
  return expectedCommitted;
}`;
    expect(await build(src, "run")).toBeNull();
  });

  it("`if` HERMANOS con asignación IDEMPOTENTE (`= true`) ⇒ emite (forma de `newtonsoft DefaultContractResolver.cs:1636`)", async () => {
    const src = `function settings(hasMemberAttribute: boolean, isFields: boolean): boolean {
  let allowNonPublicAccess = false;
  if (hasMemberAttribute) {
    allowNonPublicAccess = true;
  }
  if (isFields) {
    allowNonPublicAccess = true;
  }
  return allowNonPublicAccess;
}`;
    expect(await build(src, "settings")).not.toBeNull();
  });

  it("`if` HERMANOS que INVOCAN el mismo reporte ⇒ silencio (forma de `eslint func-style.js:140`)", async () => {
    /* Que las dos condiciones sean excluyentes es semántica, no forma: por
     * forma, unir cambia cuántas veces se llama. */
    const src = `function check(enforce: boolean, isVar: boolean, isExport: boolean, style: string): void {
  if (enforce && isVar && !isExport) {
    report({messageId: "declaration"});
  }
  if (isVar && isExport && style === "declaration") {
    report({messageId: "declaration"});
  }
}`;
    expect(await build(src, "check")).toBeNull();
  });

  it("`else { asignar; if (...) }` NO es `else if` ⇒ silencio (forma de `guava ConcurrentHashMultiset.java:380`)", async () => {
    const src = `function setCount(counter: number | null, count: number, map: Map<string, number>): number {
  if (counter === null) {
    if (count === 0) {
      return 0;
    } else {
      counter = putIfAbsent(map, count);
      if (counter === null) {
        return 0;
      }
    }
  }
  return counter;
}`;
    expect(await build(src, "setCount")).toBeNull();
  });

  it("`else if` DE VERDAD con el mismo cuerpo ⇒ emite (forma de `Ghost handle-response.ts:28`)", async () => {
    const src = `function handle(t: string, response: string, data: string): void {
  if (t === "VersionMismatchError") {
    throw new VersionMismatchError(response, data);
  } else if (t === "ValidationError") {
    throw new ValidationError(response, data);
  } else if (t === "NoPermissionError") {
    throw new ValidationError(response, data);
  } else {
    throw new JSONError(response, data);
  }
}`;
    expect(await build(src, "handle")).not.toBeNull();
  });
});
