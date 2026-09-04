import { describe, expect, it } from "vitest";

import { detector } from "./boolean-flag-param.js";
import { runIntraFunction, testContext } from "../testing.js";

/*
 * Sondas: cada una tiene que ejercitar TODA construcción que las fixtures de
 * abajo usan — un `function`/`def`/`method` con parámetros (con y sin tipo,
 * con y sin default), y un `if`/`else` — ver §5 de la plantilla.
 */
const JS_PROBE = `
function book(customer, isPremium) {
  if (isPremium) {
    doA();
  } else {
    doB();
  }
}
function g(flag = false) {
  if (flag) {
    x();
  }
}
`;

const TS_PROBE = `
function book(customer: string, isPremium: boolean) {
  if (isPremium) {
    doA();
  } else {
    doB();
  }
}
function g(flag: boolean = false) {
  if (flag) {
    x();
  }
}
`;

const PYTHON_PROBE = `
def book(customer, is_premium):
    if is_premium:
        do_a()
    else:
        do_b()

def g(flag=False):
    if flag:
        x()

def h(flag: bool):
    if flag:
        x()
`;

const RUBY_PROBE = `
def book(customer, is_premium)
  if is_premium
    do_a
  else
    do_b
  end
end

def g(flag = false)
  if flag
    x
  end
end
`;

const JAVA_PROBE = `
public class Checkout {
  public void book(String customer, boolean isPremium) {
    if (isPremium) {
      doA();
    } else {
      doB();
    }
  }
}
`;

const GO_PROBE = `
package main

func book(customer string, isPremium bool) {
	if isPremium {
		doA()
	} else {
		doB()
	}
}
`;

describe("boolean-flag-param", () => {
  it("javascript: parámetro booleano (con default `false`) usado solo como condición es un hallazgo", async () => {
    const source = `
function renderReport(data, verbose = false) {
  if (verbose) {
    printExtraDetails(data);
  }
  printSummary(data);
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source,
      language: "javascript",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.role).toBe("parámetro booleano usado como interruptor de comportamiento");
  });

  it("javascript: parámetro booleano comparado explícitamente contra `true` es un hallazgo", async () => {
    const source = `
function checkout(cart, isGift) {
  if (isGift === true) {
    wrapAsGift(cart);
  }
  charge(cart);
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source,
      language: "javascript",
    });
    expect(findings).toHaveLength(1);
  });

  it("javascript control negativo: parámetro booleano que nunca aparece como condición de un `if` no dispara nada", async () => {
    const source = `
function greet(name, locale) {
  printLocalized(name, locale);
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source,
      language: "javascript",
    });
    expect(findings).toHaveLength(0);
  });

  it("javascript: falso positivo documentado — un parámetro NO booleano (`locale`, un string) usado como chequeo de verdad en un lenguaje sin tipos SÍ dispara, porque sin anotación la única señal disponible es la forma del uso (ver docstring del módulo, § falsos positivos, punto 1)", async () => {
    const source = `
function greet(name, locale) {
  if (locale) {
    printLocalized(name, locale);
  }
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source,
      language: "javascript",
    });
    expect(findings).toHaveLength(1); // comportamiento esperado y documentado, no un bug de este test.
  });

  it("typescript: parámetro con tipo explícito `boolean` usado solo como condición es un hallazgo", async () => {
    const source = `
function renderReport(data: unknown, verbose: boolean) {
  if (verbose) {
    printExtraDetails(data);
  }
  printSummary(data);
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      source,
      language: "typescript",
    });
    expect(findings).toHaveLength(1);
  });

  it("typescript control negativo: parámetro tipado `string` usado como chequeo de verdad no dispara — el tipo declarado manda sobre el uso", async () => {
    const source = `
function greet(name: string, locale: string) {
  if (locale) {
    printLocalized(name, locale);
  }
}
`;
    // A diferencia del caso JS sin tipos: acá "locale" SÍ tiene un campo
    // `type` que resuelve (`string`), así que el tipo declarado manda y
    // gana sobre la inferencia por uso — 0 hallazgos, no un falso positivo.
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      source,
      language: "typescript",
    });
    expect(findings).toHaveLength(0);
  });

  it("python: parámetro sin anotación usado solo como condición (`if is_premium:`) es un hallazgo — el ejemplo canónico de Fowler", async () => {
    const source = `
def book_concert(customer, is_premium):
    if is_premium:
        send_premium_confirmation(customer)
    else:
        send_standard_confirmation(customer)
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      source,
      language: "python",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("book_concert");
  });

  it("python: parámetro con anotación `bool` (`h`) usado solo como condición es un hallazgo", async () => {
    const source = `
def process(flag: bool):
    if flag:
        do_extra()
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      source,
      language: "python",
    });
    expect(findings).toHaveLength(1);
  });

  it("python control negativo: parámetro que nunca aparece como condición de un `if` no dispara nada", async () => {
    const source = `
def book_concert(customer, is_premium):
    send_confirmation(customer, is_premium)
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      source,
      language: "python",
    });
    expect(findings).toHaveLength(0);
  });

  it("OLA N, FRENTE B1a — ARREGLO NUEVO: `extra=None` (Python, sin anotación) usado como chequeo de verdad NO dispara — mismo mecanismo que Ruby `node = nil`", async () => {
    const source = `
def process(customer, extra=None):
    if extra:
        merge(customer, extra)
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      source,
      language: "python",
    });
    expect(findings).toHaveLength(0);
  });

  it("control negativo del arreglo nuevo: `flag=False` (Python, default SÍ booleano) sigue disparando con normalidad — no se tocó el camino de `hasBooleanDefault`", async () => {
    const source = `
def process(customer, flag=False):
    if flag:
        merge(customer)
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      source,
      language: "python",
    });
    expect(findings).toHaveLength(1);
  });

  it("ruby: parámetro con default `false` usado solo como condición es un hallazgo", async () => {
    const source = `
def render_report(data, verbose = false)
  if verbose
    print_extra_details(data)
  end
  print_summary(data)
end
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      source,
      language: "ruby",
    });
    expect(findings).toHaveLength(1);
  });

  it("ruby control negativo: rescue/parámetro que sólo se pasa a otro método (nunca condición) no dispara nada", async () => {
    const source = `
def render_report(data, verbose)
  print_summary(data, verbose)
end
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      source,
      language: "ruby",
    });
    expect(findings).toHaveLength(0);
  });

  it("OLA N, FRENTE B1a — ARREGLO NUEVO: `node = nil` (Ruby, sin tipo) usado como chequeo de verdad NO dispara — un default `nil` es evidencia EN CONTRA de la booleanidad", async () => {
    // Reproduce el FALSO POSITIVO CONOCIDO #1 del docstring del módulo, caso
    // real de rubocop: `check_space(..., node = nil)` — `node` es un nodo
    // AST opcional (chequeo de presencia), nunca un flag; un flag real, sin
    // anotación, se defaultea a `true`/`false`, no a `nil`.
    const source = `
def check_space(range, node = nil)
  if node
    use(node)
  end
end
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      source,
      language: "ruby",
    });
    expect(findings).toHaveLength(0);
  });

  it("java: parámetro `boolean` usado solo como condición es un hallazgo — tercer lenguaje real que dispara (junto a javascript/python), cierra el criterio de salida (≥3 lenguajes)", async () => {
    const source = `
public class Checkout {
  public void bookConcert(String customer, boolean isPremium) {
    if (isPremium) {
      sendPremiumConfirmation(customer);
    } else {
      sendStandardConfirmation(customer);
    }
  }
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      source,
      language: "java",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.role).toBe("parámetro booleano usado como interruptor de comportamiento");
  });

  it("java control negativo: parámetro `String` no booleano usado en su propio chequeo no dispara — Java exige que la condición sea `boolean`, pero el filtro por tipo declarado es lo que realmente lo evita acá", async () => {
    const source = `
public class Checkout {
  public void bookConcert(String customer, boolean isPremium) {
    logCustomer(customer);
    sendConfirmation(customer, isPremium);
  }
}
`;
    // "isPremium" nunca aparece como condición de un `if` en este cuerpo:
    // control negativo real de "declarado booleano pero sin gatear nada".
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      source,
      language: "java",
    });
    expect(findings).toHaveLength(0);
  });

  it("go: parámetro `bool` usado solo como condición es un hallazgo — cuarto lenguaje real que dispara", async () => {
    const source = `
package main

func bookConcert(customer string, isPremium bool) {
	if isPremium {
		sendPremiumConfirmation(customer)
	} else {
		sendStandardConfirmation(customer)
	}
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      source,
      language: "go",
    });
    expect(findings).toHaveLength(1);
  });

  it("go control negativo: parámetro `bool` que nunca se usa como condición no dispara nada", async () => {
    const source = `
package main

func bookConcert(customer string, isPremium bool) {
	sendConfirmation(customer, isPremium)
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      source,
      language: "go",
    });
    expect(findings).toHaveLength(0);
  });

  it("javascript: dos parámetros booleanos usados como condición en la misma función producen dos hallazgos independientes", async () => {
    const source = `
function build(config, verbose = false, dryRun = false) {
  if (verbose) {
    logConfig(config);
  }
  if (dryRun) {
    return simulate(config);
  }
  return apply(config);
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source,
      language: "javascript",
    });
    expect(findings).toHaveLength(2);
  });

  it("javascript: parámetro booleano enterrado en una condición compuesta (`isPremium && hasStock`) no dispara — simplificación declarada en el docstring", async () => {
    const source = `
function checkout(cart, isPremium, hasStock) {
  if (isPremium && hasStock) {
    applyPremiumDiscount(cart);
  }
  charge(cart);
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source,
      language: "javascript",
    });
    expect(findings).toHaveLength(0);
  });

  it("umbral: threshold de presencia resuelve a 1 (kind 'presencia' — no hay magnitud, R3)", async () => {
    const ctx = testContext(detector, "javascript");
    expect(ctx.threshold("presence").value).toBe(1);
    expect(ctx.threshold("presence").kind).toBe("presencia");
  });

  /*
   * BUG DE IMPLEMENTACIÓN #1 (arreglado): un parámetro RESTO (rest/splat/
   * variadic — una COLECCIÓN de argumentos, nunca un escalar) caía al
   * respaldo genérico de nombre de `paramInfoFrom` (primer hijo NOMBRADO
   * tipo `identifier`), quedaba sin ningún campo `type`, y el idioma
   * estándar "¿me pasaron algo?" (`if args:`) disparaba como si fuera un
   * flag booleano dinámico. Confirmado con `click/examples/complex/
   * complex/cli.py#Environment.log` real del corpus (ver `REST_PARAM_TYPES`
   * en el módulo).
   */
  it("python: `*args` usado como `if args:` (idioma estándar de \"¿me pasaron algo?\") NO dispara — args es una tupla, no un booleano (bug arreglado, caso real: click Environment.log)", async () => {
    const source = `
def log(self, msg, *args):
    if args:
        msg = msg % args
    print(msg)
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      source,
      language: "python",
    });
    expect(findings).toHaveLength(0);
  });

  it("python: `**kwargs` usado como `if kwargs:` tampoco dispara — mismo mecanismo que `*args`", async () => {
    const source = `
def configure(self, **kwargs):
    if kwargs:
        apply(kwargs)
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      source,
      language: "python",
    });
    expect(findings).toHaveLength(0);
  });

  it("ruby: `*args` usado como `if args` no dispara — mismo mecanismo, segundo lenguaje", async () => {
    const source = `
def log(msg, *args)
  if args
    puts msg
  end
end
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      source,
      language: "ruby",
    });
    expect(findings).toHaveLength(0);
  });

  it("javascript: `...rest` sin tipo usado como `if (rest)` no dispara — tercer lenguaje, mismo mecanismo (`rest_pattern` como hijo directo de la lista de parámetros)", async () => {
    const source = `
function log(msg, ...rest) {
  if (rest) {
    console.log(msg, rest);
  }
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source,
      language: "javascript",
    });
    expect(findings).toHaveLength(0);
  });

  it("typescript: `...rest: T[]` tipado tampoco dispara — el `rest_pattern` queda anidado dentro del campo `pattern` de `required_parameter`, no como hijo directo", async () => {
    const source = `
function log(msg: string, ...rest: unknown[]) {
  if (rest) {
    console.log(msg, rest);
  }
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      source,
      language: "typescript",
    });
    expect(findings).toHaveLength(0);
  });

  /*
   * BUG DE IMPLEMENTACIÓN #2 (arreglado): el uso "comparado contra
   * `true`/`false`" disparaba SIEMPRE, sin pasar por el mismo portón de
   * booleanidad que el uso "solo" — contradiciendo el propio criterio del
   * docstring de cabecera ("si el parámetro tiene un campo `type` que
   * resuelve, ESE tipo manda"). Caso real del corpus: vueuse repite
   * `function resolveNestedOptions<T>(options: T | true): T` en
   * `useWebSocket`/`useEventSource` — `options` es un sentinela de "usar la
   * config por defecto", con un tipo declarado (`T | true`) que NO dice
   * "bool".
   */
  it("typescript: parámetro con tipo genérico `T | true` comparado contra `true` NO dispara — el tipo declarado no es booleano aunque la comparación lo sea (bug arreglado, caso real: vueuse resolveNestedOptions)", async () => {
    const source = `
function resolveNestedOptions<T>(options: T | true): T {
  if (options === true) {
    return {} as T;
  }
  return options;
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      source,
      language: "typescript",
    });
    expect(findings).toHaveLength(0);
  });

  it("typescript control negativo: el arreglo de arriba no rompe el caso real — un parámetro SIN tipo comparado contra `true` en un lenguaje dinámico sigue disparando (inferencia por uso, JS)", async () => {
    const source = `
function checkout(cart, isGift) {
  if (isGift === true) {
    wrapAsGift(cart);
  }
  charge(cart);
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source,
      language: "javascript",
    });
    expect(findings).toHaveLength(1);
  });
});

/*
 * OLA O, FRENTE N6 — (K), (L) y (M). Ver el docstring del módulo: los tres
 * actúan sobre la vía de INFERENCIA (o sobre la accionabilidad del hallazgo),
 * nunca sobre un tipo declarado, así que cada bloque trae su control negativo
 * tipado/con default que confirma que el camino de siempre sigue vivo.
 */
describe("boolean-flag-param — OLA O, FRENTE N6", () => {
  const CSHARP_PROBE = `
class Writer {
  public virtual void Write(bool flag) {
    if (flag) { A(); } else { B(); }
  }
}
`;

  /*
   * Las sondas de arriba (`JS_PROBE`/`TS_PROBE`) no ejercitan una FUNCIÓN
   * FLECHA, así que `deriveNodeSets` no deriva `arrow_function` como nodo
   * función-like y `fileUnitFrom` no encuentra ninguna función en una fixture
   * que sólo tenga lambdas — los tests de (L) necesitan sondas propias. Las
   * de producción (`code-analyzer.ts`) sí la ejercitan; esto es un límite del
   * arnés de test, no del detector.
   */
  const JS_LAMBDA_PROBE = `${JS_PROBE}
const h = (flag = false) => {
  if (flag) {
    x();
  } else {
    y();
  }
};
`;
  const TS_LAMBDA_PROBE = `${TS_PROBE}
const h = (flag: boolean) => {
  if (flag) {
    x();
  } else {
    y();
  }
};
`;

  describe("(K) el cuerpo desmiente la inferencia", () => {
    it("javascript: `array.length` en el cuerpo refuta que `array` sea booleano, aunque el ternario lo use como condición completa (caso real: lodash cloneArray)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        language: "javascript",
        source: `
function cloneArray(array) {
  var length = array ? array.length : 0;
  var result = Array(length);
  return result;
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("ruby: `scope.source_range` refuta que `scope` sea booleano (caso real: rubocop verification_too_large?)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        language: "ruby",
        source: `
def verification_too_large?(scope)
  if scope
    scope.source_range.size
  else
    raw_source.size
  end
end
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("javascript: reasignar el parámetro con algo que no es `true`/`false` también lo refuta (caso real: lodash minify, `destPath = srcPath.replace(...)`)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        language: "javascript",
        source: `
function minify(srcPath, destPath) {
  if (!destPath) {
    destPath = srcPath.replace(/x/, "y");
  }
  write(destPath);
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("control negativo (K): pasar el parámetro COMO ARGUMENTO de otra llamada NO lo refuta — un flag real se reenvía todo el tiempo", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        language: "javascript",
        source: `
function book(customer, isPremium) {
  if (isPremium) {
    applyPremium(customer, isPremium);
  } else {
    applyStandard(customer);
  }
}
`,
      });
      expect(findings).toHaveLength(1);
    });

    it("control negativo (K): con TIPO declarado booleano, el cuerpo no puede refutar nada — el tipo manda", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-typescript.wasm",
        probe: TS_PROBE,
        language: "typescript",
        source: `
function render(node: string, pretty: boolean) {
  if (pretty) {
    return pretty.toString() + node;
  }
  return node;
}
`,
      });
      expect(findings).toHaveLength(1);
    });
  });

  describe("(L) una función anónima no tiene firma publicada", () => {
    it("typescript: el parámetro de un callback de suscripción, sin tipo ni default, ya no dispara (caso real: vueuse `watch(focused, (isFocused) => …)`)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-typescript.wasm",
        probe: TS_LAMBDA_PROBE,
        language: "typescript",
        source: `
const stop = watch(focused, (isFocused) => {
  if (isFocused) {
    resume();
  } else {
    pause();
  }
});
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("control negativo (L): una lambda con DEFAULT booleano sigue disparando — ahí sí hay evidencia declarada y un llamador que elige (caso real: vueuse `execute(throwOnFailed = false)`)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_LAMBDA_PROBE,
        language: "javascript",
        source: `
const execute = (throwOnFailed = false) => {
  if (throwOnFailed) {
    raise();
  } else {
    swallow();
  }
};
`,
      });
      expect(findings).toHaveLength(1);
    });

    it("control negativo (L): una lambda con TIPO declarado booleano sigue disparando (caso real: vueuse `loadScript(waitForScriptLoad: boolean)`)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-typescript.wasm",
        probe: TS_LAMBDA_PROBE,
        language: "typescript",
        source: `
const loadScript = (waitForScriptLoad: boolean) => {
  if (waitForScriptLoad) {
    return waitFor();
  } else {
    return now();
  }
};
`,
      });
      expect(findings).toHaveLength(1);
    });
  });

  describe("(M) el arreglo que se probó, se midió y se descartó", () => {
    /*
     * Ver (M) en el docstring del módulo: suprimir un `override` retiraba,
     * medido sobre `corpus/guava`, el verdadero positivo ya juzgado
     * `AbstractUndirectedNetworkConnections.java:90 addInEdge(…, boolean
     * isSelfLoop)`, y el smell no se movía a la declaración base porque una
     * declaración sin cuerpo no puede disparar este detector. Este test fija
     * la decisión: un `override` con un flag real SIGUE reportándose.
     */
    it("csharp: un `override` con un parámetro booleano SIGUE disparando — la declaración base no tiene cuerpo, así que suprimir acá haría desaparecer el smell del repo", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        language: "csharp",
        source: `
class BsonWriter {
  public override void WriteValue(bool value) {
    if (value) { AddToken(True); } else { AddToken(False); }
  }
}
`,
      });
      expect(findings).toHaveLength(1);
    });

    it("el MISMO método sin `override` dispara igual — la marca de herencia no cambia nada", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        language: "csharp",
        source: `
class BsonWriter {
  public void WriteValue(bool value) {
    if (value) { AddToken(True); } else { AddToken(False); }
  }
}
`,
      });
      expect(findings).toHaveLength(1);
    });

    it("este detector NO declara `needsGraph`: corre igual sin `ctx.graph` (ver (M) en el docstring — la vía por grafo retiraba verdaderos medidos)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        language: "csharp",
        source: `
class BsonWriter {
  public void WriteValue(bool value) {
    if (value) { AddToken(True); } else { AddToken(False); }
  }
}
`,
      });
      expect(findings).toHaveLength(1);
    });
  });
});
