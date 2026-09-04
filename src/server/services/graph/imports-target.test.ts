/**
 * `graph/imports-target.ts` — extraído VERBATIM de `graph/build.ts` por
 * Cimientos (CONTRATO-F8G.md §7, F4). Estos tests fijaban el comportamiento
 * DE ANTES; ahora también fijan el fix de F4 (CONTRATO-F8G.md §3.3): separador
 * `.` para Python y prefijo de módulo Go. Ver `build.test.ts`'s describe
 * "imports" para el caso end-to-end equivalente sobre AST real.
 *
 * FIJAN TAMBIÉN el fix de esta ola (RAICES.md ⇢ PENDIENTES #1, TABLA-ARISTAS.md
 * §3.2/§4 — Java `imports` 15/~1.400 y C# `imports` en 0): desempate por
 * cercanía de directorio (`nearestBySharedPrefix`) para módulos paralelos
 * duplicados (guava/android), pelado de segmento final para miembros/tipos
 * anidados, y emparejo en espacio de PUNTOS (no de barras) para proyectos con
 * un punto en el nombre de directorio (`Newtonsoft.Json/`). Ver el docstring
 * de `imports-target.ts` para la medición completa contra el corpus real.
 */
import { describe, expect, it } from "vitest";

import type { EdgeFacts } from "./edges/types.js";
import { classifyImportSpecifiers, matchKnownPath, normalizeRelativeImport, resolveImportEdges, resolveImportTarget } from "./imports-target.js";

function importFact(toName: string): EdgeFacts {
  return {
    extractorId: "imports",
    kind: "imports",
    fromPath: [],
    toName,
    toQualifier: [],
    provenance: "declared",
    startLine: 1,
    endLine: 1,
    via: "test",
  };
}

describe("normalizeRelativeImport", () => {
  it("resuelve `./x` relativo al directorio del archivo que importa (POSIX, byte-idéntico a antes)", () => {
    expect(normalizeRelativeImport("src/a/b.ts", "./x")).toBe("src/a/x");
  });

  it("`../` sube un nivel (POSIX, byte-idéntico a antes)", () => {
    expect(normalizeRelativeImport("src/a/b.ts", "../x")).toBe("src/x");
  });

  it("`..` que se sale por arriba de la raíz da `null` (POSIX, byte-idéntico a antes)", () => {
    expect(normalizeRelativeImport("b.ts", "../../x")).toBeNull();
  });

  it("Python: un punto + nombre (`._compat`) queda en el MISMO directorio (CONTRATO-F8G.md §3.3, fix de F4)", () => {
    expect(normalizeRelativeImport("src/click/core.py", "._compat")).toBe("src/click/_compat");
  });

  it("Python: dos puntos + nombre (`..sibling`) sube un nivel", () => {
    expect(normalizeRelativeImport("src/click/sub/core.py", "..sibling")).toBe("src/click/sibling");
  });

  it("Python: ruta punteada dentro del nivel (`.sub.mod`)", () => {
    expect(normalizeRelativeImport("src/click/core.py", ".sub.mod")).toBe("src/click/sub/mod");
  });

  it("Python: `.` bare (sin nombre, `from . import x`) no cambia de directorio", () => {
    expect(normalizeRelativeImport("src/click/core.py", ".")).toBe("src/click");
  });

  it("Python: demasiados niveles hacia arriba da `null`, igual que POSIX", () => {
    expect(normalizeRelativeImport("core.py", "...sibling")).toBeNull();
  });
});

describe("matchKnownPath", () => {
  const known = new Set(["src/a/x.ts", "src/a/y.js"]);

  it("la ruta exacta, si ya está entre las conocidas", () => {
    expect(matchKnownPath("src/a/x.ts", known)).toBe("src/a/x.ts");
  });

  it("agrega EXACTAMENTE una extensión conocida cuando la ruta pelada no está", () => {
    expect(matchKnownPath("src/a/x", known)).toBe("src/a/x.ts");
  });

  it("dos extensiones candidatas ⇒ ambiguo, no adivina", () => {
    const ambiguous = new Set(["src/a/x.ts", "src/a/x.js"]);
    expect(matchKnownPath("src/a/x", ambiguous)).toBeNull();
  });

  it("ninguna coincidencia ⇒ null", () => {
    expect(matchKnownPath("src/a/nope", known)).toBeNull();
  });

  describe("extensión que el propio especificador ya trae (A1: ESM/NodeNext, `./x.js` → `x.ts`)", () => {
    it("sacar la extensión del especificador y matchear EXACTAMENTE una extensión conocida, resuelve", () => {
      expect(matchKnownPath("src/a/x.js", known)).toBe("src/a/x.ts");
    });

    it("un archivo `.js` REAL (ya presente tal cual en `known`) matchea por la vía de siempre, sin pasar por el recorte de extensión", () => {
      expect(matchKnownPath("src/a/y.js", known)).toBe("src/a/y.js");
    });

    it("dos extensiones candidatas tras sacar la del especificador ⇒ ambiguo, no adivina", () => {
      const ambiguous = new Set(["src/a/x.ts", "src/a/x.tsx"]);
      expect(matchKnownPath("src/a/x.js", ambiguous)).toBeNull();
    });

    it("un nombre sin extensión (dotfile, empieza con `.`) no tiene extensión que sacar ⇒ no cambia el resultado de siempre", () => {
      const dotfileKnown = new Set(["src/a/.env"]);
      expect(matchKnownPath("src/a/.env", dotfileKnown)).toBe("src/a/.env");
      expect(matchKnownPath("src/a/.envx", dotfileKnown)).toBeNull();
    });
  });
});

describe("resolveImportTarget", () => {
  const known = new Set(["src/a/b.ts", "src/a/x.ts"]);

  it("un especificador absoluto sin forma de módulo Go (sin `.` en el primer segmento, o sin `/`) nunca se adivina — paquete externo", () => {
    expect(resolveImportTarget("src/a/b.ts", "lodash", known)).toBeNull();
    expect(resolveImportTarget("src/a/b.ts", "collections.abc", known)).toBeNull();
  });

  it("un especificador absoluto con forma de módulo Go, sin ninguna ruta conocida que coincida, tampoco se adivina", () => {
    expect(resolveImportTarget("cobra/root.go", "github.com/spf13/cobra", known)).toBeNull();
  });

  // A2a (ola N): formas de especificador NUEVAS que `graph/edges/imports.ts`
  // empezó a emitir en esta ola (barril de re-export ECMA y barril de Python).
  // Este módulo ya las resolvía — se testea acá para dejarlo verificado, no
  // supuesto, porque son entradas que antes nunca le llegaban.
  describe("entradas nuevas del extractor (barriles) — A2a", () => {
    const pkg = new Set(["pkg/__init__.py", "pkg/sub.py", "otro/mod.py", "src/a/param.utils.ts"]);

    it("`.sub` (barril de Python: `from . import sub`) resuelve al submódulo hermano", () => {
      expect(resolveImportTarget("pkg/__init__.py", ".sub", pkg)).toBe("pkg/sub.py");
    });

    it("`..otro.mod` sube un nivel antes de bajar por la ruta punteada", () => {
      expect(resolveImportTarget("pkg/__init__.py", "..otro.mod", pkg)).toBe("otro/mod.py");
    });

    it("un nombre importado que NO es un submódulo no se adivina", () => {
      expect(resolveImportTarget("pkg/__init__.py", ".CONSTANTE", pkg)).toBeNull();
    });

    it("`./param.utils` (barril de re-export con un punto en el nombre del archivo) resuelve, sin confundir el punto con una extensión", () => {
      expect(resolveImportTarget("src/a/indice.ts", "./param.utils", pkg)).toBe("src/a/param.utils.ts");
    });
  });

  describe("ESM/NodeNext — A1, `imports = 0` sobre TypeScript moderno", () => {
    it("`./x.js` resuelve contra el `x.ts` real en disco (el especificador trae la extensión de SALIDA, no la del archivo fuente)", () => {
      expect(resolveImportTarget("src/a/b.ts", "./x.js", known)).toBe("src/a/x.ts");
    });

    it("`./dir/index.js` resuelve contra `dir/index.ts`", () => {
      const withIndex = new Set(["src/a/b.ts", "src/a/dir/index.ts"]);
      expect(resolveImportTarget("src/a/b.ts", "./dir/index.js", withIndex)).toBe("src/a/dir/index.ts");
    });

    it("`./x.js` también resuelve contra un `x.tsx` real", () => {
      const withTsx = new Set(["src/a/b.ts", "src/a/x.tsx"]);
      expect(resolveImportTarget("src/a/b.ts", "./x.js", withTsx)).toBe("src/a/x.tsx");
    });

    it("`./x.js` con AMBOS `x.ts` y `x.tsx` presentes ⇒ ambiguo, no adivina cuál", () => {
      const ambiguous = new Set(["src/a/b.ts", "src/a/x.ts", "src/a/x.tsx"]);
      expect(resolveImportTarget("src/a/b.ts", "./x.js", ambiguous)).toBeNull();
    });
  });

  it("un especificador relativo que matchea una ruta conocida resuelve", () => {
    expect(resolveImportTarget("src/a/b.ts", "./x", known)).toBe("src/a/x.ts");
  });

  it("sin match ni como archivo ni como índice, `null`", () => {
    expect(resolveImportTarget("src/a/b.ts", "./nope", known)).toBeNull();
  });

  describe("módulo Go absoluto — CONTRATO-F8G.md §3.3, fix de F4", () => {
    it("prefijo de hosting/vendor que, al sacarlo, matchea EXACTAMENTE un archivo conocido, resuelve (caso real: cobra.go en la raíz del módulo github.com/spf13/cobra)", () => {
      const goKnown = new Set(["cobra.go", "command.go", "doc/util.go"]);
      expect(resolveImportTarget("doc/util.go", "github.com/spf13/cobra", goKnown)).toBe("cobra.go");
    });

    it("biblioteca estándar (sin `.` en el primer segmento) nunca se adivina, aunque coincida por casualidad con un archivo local", () => {
      const goKnown = new Set(["path.go"]);
      expect(resolveImportTarget("main.go", "path", goKnown)).toBeNull();
      expect(resolveImportTarget("main.go", "path/filepath", goKnown)).toBeNull();
    });

    it("dos longitudes de prefijo distintas matchean archivos DISTINTOS ⇒ ambiguo, no adivina", () => {
      const goKnown = new Set(["b/pkg.go", "pkg.go"]);
      // sacando 1 segmento da "b/pkg" (matchea "b/pkg.go"); sacando 2 da "pkg" (matchea "pkg.go") — dos aciertos distintos.
      expect(resolveImportTarget("main.go", "a.com/b/pkg", goKnown)).toBeNull();
    });

    it("paquete que resuelve a un directorio con más de un archivo real ⇒ ningún acierto exacto, `null` (brecha declarada)", () => {
      const goKnown = new Set(["doc/util.go", "doc/man_docs.go"]);
      expect(resolveImportTarget("main.go", "github.com/spf13/cobra/doc", goKnown)).toBeNull();
    });

    it("convención Go 'el paquete tiene un archivo con su propio nombre' (`log/log.go`), incluso a través de un sufijo de versión de módulo (`/v3`) — caso real: fiber", () => {
      const goKnown = new Set(["log/log.go", "log/default.go", "hooks.go"]);
      expect(resolveImportTarget("hooks.go", "github.com/gofiber/fiber/v3/log", goKnown)).toBe("log/log.go");
    });

    it("la convención de archivo-con-nombre-de-paquete tampoco adivina si el directorio no tiene ese archivo", () => {
      const goKnown = new Set(["extractors/other.go"]);
      expect(resolveImportTarget("main.go", "github.com/gofiber/fiber/v3/extractors", goKnown)).toBeNull();
    });
  });
});

describe("módulo dotted (Java/C#) — A7 (Ola 9, F6)", () => {
  it("import de Java (`com.foo.Bar`) que matchea por SUFIJO un archivo conocido bajo un prefijo de módulo cualquiera (layout Maven real: `guava/src/com/...`) resuelve", () => {
    const javaKnown = new Set(["src/main/java/com/foo/Bar.java", "src/main/java/com/foo/Other.java"]);
    expect(resolveImportTarget("src/main/java/com/foo/Other.java", "com.foo.Bar", javaKnown)).toBe("src/main/java/com/foo/Bar.java");
  });

  it("el mismo paquete existe bajo DOS prefijos de módulo a la vez (caso real de guava: `guava/` y `android/guava/` son builds paralelos) ⇒ resuelve el candidato que comparte árbol de directorio con quien importa — ARREGLADO, ver el docstring del módulo (antes: `null`, ambiguo por diseño)", () => {
    const javaKnown = new Set(["guava/src/com/foo/Bar.java", "android/guava/src/com/foo/Bar.java"]);
    expect(resolveImportTarget("guava/src/com/foo/Other.java", "com.foo.Bar", javaKnown)).toBe("guava/src/com/foo/Bar.java");
    expect(resolveImportTarget("android/guava/src/com/foo/Other.java", "com.foo.Bar", javaKnown)).toBe("android/guava/src/com/foo/Bar.java");
  });

  it("los DOS candidatos están a la MISMA distancia de quien importa (ninguno comparte árbol con el importador) ⇒ ambigüedad GENUINA, sigue sin adivinar", () => {
    const javaKnown = new Set(["guava/src/com/foo/Bar.java", "android/guava/src/com/foo/Bar.java"]);
    expect(resolveImportTarget("guava-gwt/src-super/com/foo/Other.java", "com.foo.Bar", javaKnown)).toBeNull();
  });

  it("import estático de un MIEMBRO (`import static com.foo.Bar.CONST;`) resuelve contra el archivo — el segmento final es un símbolo declarado adentro, no un nivel de directorio más (ARREGLADO, antes: `null`)", () => {
    const javaKnown = new Set(["src/com/foo/Bar.java", "src/com/foo/Other.java"]);
    expect(resolveImportTarget("src/com/foo/Other.java", "com.foo.Bar.CONST", javaKnown)).toBe("src/com/foo/Bar.java");
  });

  it("import estático de un miembro de un TIPO ANIDADO (dos segmentos de más allá del archivo, caso real de guava: `Service.State.FAILED`) también resuelve — el pelado sigue segmento por segmento hasta encontrar señal", () => {
    const javaKnown = new Set(["src/com/foo/Service.java"]);
    expect(resolveImportTarget("src/com/foo/Other.java", "com.foo.Service.State.FAILED", javaKnown)).toBe("src/com/foo/Service.java");
  });

  it("el pelado se DETIENE en el primer nivel con señal, aunque un nivel más corto (probablemente ajeno) también matchee — nunca sigue pelando más allá de un candidato ya encontrado", () => {
    // "com.foo.Bar.Member" pela a "com/foo/Bar" (matchea Bar.java) — el nivel
    // más corto "com/foo" jamás se prueba, aunque hipotéticamente matcheara
    // otra cosa: hay señal en el nivel anterior, ahí se para.
    const javaKnown = new Set(["src/com/foo/Bar.java"]);
    expect(resolveImportTarget("src/com/foo/Other.java", "com.foo.Bar.Member", javaKnown)).toBe("src/com/foo/Bar.java");
  });

  it("using de C# (`Newtonsoft.Json.Linq`, namespace, no archivo): con VARIOS archivos bajo ese namespace es ambiguo por diseño, no adivina cuál — comportamiento correcto, no una brecha (ver docstring de `dottedSuffixTarget`)", () => {
    const csharpKnown = new Set(["Src/Newtonsoft.Json/Linq/JObject.cs", "Src/Newtonsoft.Json/Linq/JArray.cs"]);
    expect(resolveImportTarget("Src/Newtonsoft.Json/Other.cs", "Newtonsoft.Json.Linq", csharpKnown)).toBeNull();
  });

  it("un directorio de proyecto .NET real con PUNTO en el nombre (`Src/Newtonsoft.Json/`, un solo directorio para DOS segmentos de namespace) ya no lo deja invisible — ARREGLADO, caso real de newtonsoft-json (antes: `null` incluso con el archivo exacto en `known`)", () => {
    const csharpKnown = new Set([
      "Src/Newtonsoft.Json/JsonSerializer.cs",
      "Src/Newtonsoft.Json/Serialization/ErrorEventArgs.cs",
    ]);
    // `using Alias = Newtonsoft.Json.Serialization.ErrorEventArgs;` — 1-a-1, nombra un TIPO.
    expect(
      resolveImportTarget("Src/Newtonsoft.Json/JsonSerializer.cs", "Newtonsoft.Json.Serialization.ErrorEventArgs", csharpKnown),
    ).toBe("Src/Newtonsoft.Json/Serialization/ErrorEventArgs.cs");
  });

  it("el mismo directorio con punto en el nombre no vuelve ambiguo un namespace pelado que YA lo era (2+ archivos bajo ese namespace) — el fix no fuerza el caso 1-a-N", () => {
    const csharpKnown = new Set([
      "Src/Newtonsoft.Json/Program.cs",
      "Src/Newtonsoft.Json/Serialization/ErrorEventArgs.cs",
      "Src/Newtonsoft.Json/Serialization/DefaultContractResolver.cs",
    ]);
    expect(resolveImportTarget("Src/Newtonsoft.Json/Program.cs", "Newtonsoft.Json.Serialization", csharpKnown)).toBeNull();
  });

  it("biblioteca externa (JDK/BCL) sin archivo real en el repo nunca se adivina", () => {
    const known = new Set(["src/a/b.ts"]);
    expect(resolveImportTarget("src/a/b.ts", "java.util.List", known)).toBeNull();
    expect(resolveImportTarget("src/a/b.ts", "System.Collections.Generic", known)).toBeNull();
  });

  it("el sufijo completo no matchea ningún archivo conocido ⇒ `null` (paquete externo, no un módulo del repo)", () => {
    const known = new Set(["b/Pkg.java", "Pkg.java"]);
    expect(resolveImportTarget("main.java", "a.b.Pkg", known)).toBeNull();
  });

  it("una sola palabra sin punto no tiene señal de jerarquía, no se adivina aunque coincida por casualidad", () => {
    const known = new Set(["List.java"]);
    expect(resolveImportTarget("main.java", "List", known)).toBeNull();
  });
});

/**
 * A7 (Ola 11b) — el mismo emparejo por SUFIJO, ahora también para el
 * especificador absoluto separado por `/`. Es la convención de "ruta de
 * carga": el especificador es el tramo FINAL de la ruta real y el prefijo
 * (`lib/`, `src/main/java/`) lo pone la configuración del proyecto.
 */
describe("ruta de carga con separador `/` — A7 (Ola 11b)", () => {
  const rubyKnown = new Set(["lib/app.rb", "lib/app/document.rb", "lib/app/utils.rb"]);

  it("`require \"app/document\"` resuelve contra `lib/app/document.rb` sin conocer el prefijo `lib/` de antemano", () => {
    expect(resolveImportTarget("lib/app.rb", "app/document", rubyKnown)).toBe("lib/app/document.rb");
  });

  it("`require_relative \"app/utils\"` cae por el mismo mecanismo (el extractor emite el especificador crudo, sin distinguir las dos formas)", () => {
    expect(resolveImportTarget("lib/app.rb", "app/utils", rubyKnown)).toBe("lib/app/utils.rb");
  });

  it("una gema externa sin archivo real en el repo no se adivina", () => {
    expect(resolveImportTarget("lib/app.rb", "nokogiri/xml", rubyKnown)).toBeNull();
  });

  it("dos archivos con el mismo tramo final ⇒ ambiguo, no adivina cuál", () => {
    const ambiguo = new Set(["lib/app/document.rb", "vendor/app/document.rb"]);
    expect(resolveImportTarget("lib/app.rb", "app/document", ambiguo)).toBeNull();
  });

  it("C# `using` que nombra un TIPO (`using static X.Y.Tipo;` / `using Alias = X.Y.Tipo;`) es 1-a-1 y resuelve; el `using` de NAMESPACE pelado sigue siendo 1-a-N y no", () => {
    const csharpKnown = new Set(["Src/App/Program.cs", "Src/App/Services/OrderService.cs", "Src/App/Services/Cache.cs"]);
    expect(resolveImportTarget("Src/App/Program.cs", "App.Services.OrderService", csharpKnown)).toBe("Src/App/Services/OrderService.cs");
    expect(resolveImportTarget("Src/App/Program.cs", "App.Services", csharpKnown)).toBeNull();
  });
});

describe("resolveImportEdges", () => {
  it("resuelve un import relativo real y descarta uno externo, sin arista a sí mismo", () => {
    const files = [
      { path: "src/a/b.ts", edges: [importFact("./x"), importFact("lodash"), importFact("./b")] },
      { path: "src/a/x.ts", edges: [] },
    ];
    const edges = resolveImportEdges(files);
    expect(edges).toEqual([{ from: "file:src/a/b.ts", to: "file:src/a/x.ts", kind: "imports", provenance: "resolved", weight: 1 }]);
  });

  it("un especificador ESM/NodeNext (`./iface.js`) resuelve contra el `iface.ts` real — A1, arreglado acá (antes: `[]`, cero aristas)", () => {
    const files = [
      { path: "src/a/core.ts", edges: [importFact("./iface.js")] },
      { path: "src/a/iface.ts", edges: [] },
    ];
    expect(resolveImportEdges(files)).toEqual([
      { from: "file:src/a/core.ts", to: "file:src/a/iface.ts", kind: "imports", provenance: "resolved", weight: 1 },
    ]);
  });

  it("un especificador Python con separador `.` (`._compat`) resuelve — CONTRATO-F8G.md §3.3, arreglado por F4 (antes: brecha declarada, `[]`)", () => {
    const files = [
      { path: "src/click/core.py", edges: [importFact("._compat")] },
      { path: "src/click/_compat.py", edges: [] },
    ];
    expect(resolveImportEdges(files)).toEqual([
      { from: "file:src/click/core.py", to: "file:src/click/_compat.py", kind: "imports", provenance: "resolved", weight: 1 },
    ]);
  });

  it("un especificador absoluto Go con forma de módulo resuelve contra la raíz del repo — CONTRATO-F8G.md §3.3, arreglado por F4", () => {
    const files = [
      { path: "cobra.go", edges: [] },
      { path: "doc/util.go", edges: [importFact("github.com/spf13/cobra"), importFact("github.com/spf13/pflag")] },
    ];
    expect(resolveImportEdges(files)).toEqual([
      { from: "file:doc/util.go", to: "file:cobra.go", kind: "imports", provenance: "resolved", weight: 1 },
    ]);
  });
});

/**
 * OLA P (P2) — la mitad que `resolveImportEdges` TIRA. Ver el docstring de
 * `classifyImportSpecifiers` para la evidencia medida por N9 (Ola O) y el
 * discriminador `typing` vs. `@nestjs/common`.
 */
describe("classifyImportSpecifiers — los especificadores NO resueltos (pedido de N9)", () => {
  it("separa resueltos de no resueltos por archivo, sin repetir el mismo especificador", () => {
    const files = [
      { path: "src/click/_compat.py", edges: [] },
      { path: "src/click/core.py", edges: [importFact("._compat"), importFact("typing"), importFact("typing")] },
    ];
    const c = classifyImportSpecifiers(files);
    expect(c.byFile.get("src/click/core.py")).toEqual({ resolved: ["._compat"], unresolved: ["typing"] });
    // Un archivo sin ningún import no aparece en el mapa (ausencia, no `[]` fabricado).
    expect(c.byFile.has("src/click/_compat.py")).toBe(false);
  });

  it("EL DISCRIMINADOR: `resolvedSomewhere` distingue el paquete externo del alias que sí resuelve desde otro archivo", () => {
    const files = [
      { path: "src/common/index.ts", edges: [] },
      { path: "src/app/a.ts", edges: [importFact("src/common/index")] },
      { path: "src/app/b.ts", edges: [importFact("typing")] },
    ];
    const c = classifyImportSpecifiers(files);
    expect(c.resolvedSomewhere.has("src/common/index")).toBe(true);
    expect(c.resolvedSomewhere.has("typing")).toBe(false);
  });

  it("no cambia una sola arista: la clasificación usa la MISMA `resolveImportTarget` que `resolveImportEdges`", () => {
    const files = [
      { path: "lib/utils.rb", edges: [] },
      { path: "lib/site.rb", edges: [importFact("./utils"), importFact("lodash")] },
    ];
    const resueltos = new Set(classifyImportSpecifiers(files).byFile.get("lib/site.rb")!.resolved);
    expect(resueltos.has("./utils")).toBe(true);
    expect(resolveImportEdges(files)).toHaveLength(1);
  });
});

/**
 * EL ÍNDICE DE SUFIJOS (Ola Y, Y5 — costo). `dottedSuffixHits` y
 * `matchKnownPathSuffix` dejaron de recorrer el conjunto entero de rutas por
 * cada sufijo probado y leen un índice construido UNA vez por conjunto `known`
 * (`suffixIndexOf`). Estos tests fijan las TRES cosas que ese cambio —y sólo
 * ése— podría romper; el resto del comportamiento ya lo fijan los 58 tests de
 * arriba, que corren por los mismos dos caminos.
 */
describe("índice de sufijos de `known` — equivalencia con el barrido lineal", () => {
  /**
   * INTENCIÓN: *"un sufijo sólo cuenta si empieza en un BORDE DE SEGMENTO"* —
   * exactamente lo que codificaba `db === suffix || db.endsWith(`.${suffix}`)`
   * en el barrido. El índice guarda sufijos alineados al separador; si alguna
   * vez guardara sufijos de TEXTO, `oo.Bar` resolvería a `com/foo/Bar.java` y
   * este test se pondría rojo. Es el mismo límite que el docstring de
   * `matchKnownPathSuffix` ya declaraba para el espacio de barras.
   */
  it("no matchea un sufijo que arranca a mitad de segmento — espacio de PUNTOS", () => {
    const known = new Set(["src/main/java/com/foo/Bar.java", "src/main/java/com/foo/Other.java"]);
    expect(resolveImportTarget("src/main/java/com/foo/Other.java", "foo.Bar", known)).toBe("src/main/java/com/foo/Bar.java");
    expect(resolveImportTarget("src/main/java/com/foo/Other.java", "oo.Bar", known)).toBeNull();
  });

  it("no matchea un sufijo que arranca a mitad de segmento — espacio de BARRAS", () => {
    const known = new Set(["lib/app/foo/bar.rb", "lib/app/main.rb"]);
    expect(resolveImportTarget("lib/app/main.rb", "foo/bar", known)).toBe("lib/app/foo/bar.rb");
    expect(resolveImportTarget("lib/app/main.rb", "oo/bar", known)).toBeNull();
  });

  /**
   * INTENCIÓN: *"reusar el mismo conjunto `known` entre especificadores no
   * cambia ninguna respuesta"* — la amortización es lo único que el índice
   * agrega. Se comparan las respuestas de un conjunto YA usado (índice
   * caliente) contra las de un conjunto recién construido con las mismas
   * rutas (índice frío): tienen que ser idénticas, especificador por
   * especificador.
   */
  it("el índice caliente responde lo mismo que uno frío, para todos los especificadores", () => {
    const rutas = [
      "guava/src/com/google/common/base/Preconditions.java",
      "android/guava/src/com/google/common/base/Preconditions.java",
      "guava/src/com/google/common/util/concurrent/Service.java",
      "Src/Newtonsoft.Json/JsonReader.cs",
      "Src/Newtonsoft.Json/Linq/JToken.cs",
      "src/click/types.py",
      "src/click/core.py",
      "lib/app/document.rb",
    ];
    const specs = [
      "com.google.common.base.Preconditions",
      "com.google.common.base.Preconditions.checkNotNull",
      "com.google.common.util.concurrent.Service.State",
      "Newtonsoft.Json.Linq.JToken",
      "click.types",
      "app/document",
      "no.existe.Nada",
    ];
    const caliente = new Set(rutas);
    const desde = "guava/src/com/google/common/base/Preconditions.java";
    // Primera pasada: construye el índice de `caliente`.
    const primera = specs.map((s) => resolveImportTarget(desde, s, caliente));
    // Segunda pasada sobre el MISMO objeto (índice memoizado) y sobre uno NUEVO
    // con el mismo contenido (índice recién construido): las tres coinciden.
    expect(specs.map((s) => resolveImportTarget(desde, s, caliente))).toEqual(primera);
    expect(specs.map((s) => resolveImportTarget(desde, s, new Set(rutas)))).toEqual(primera);
  });

  /**
   * INTENCIÓN: *"un índice memoizado no puede responder por un conjunto que ya
   * no es el que indexó"*. La memoización cuelga de la identidad del `Set`, así
   * que un `Set` que crece después de la primera consulta es el único modo real
   * de quedar vencido — y el guardián de tamaño lo rehace.
   */
  it("si el conjunto `known` cambia entre dos consultas, la respuesta cambia con él", () => {
    const known = new Set(["src/main/java/com/foo/Bar.java"]);
    expect(resolveImportTarget("src/main/java/com/foo/Bar.java", "com.foo.Other", known)).toBeNull();
    known.add("src/main/java/com/foo/Other.java");
    expect(resolveImportTarget("src/main/java/com/foo/Bar.java", "com.foo.Other", known)).toBe("src/main/java/com/foo/Other.java");
    // Y al revés: sacar la ruta la vuelve irresoluble otra vez.
    known.delete("src/main/java/com/foo/Other.java");
    expect(resolveImportTarget("src/main/java/com/foo/Bar.java", "com.foo.Other", known)).toBeNull();
  });
});
