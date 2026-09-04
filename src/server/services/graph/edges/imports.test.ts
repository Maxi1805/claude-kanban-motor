import { describe, expect, it } from "vitest";

import { fileUnitFrom, nodeSetsFor, parseRoot } from "../../detect/testing.js";
import type { EdgeContext } from "./types.js";
import { importsExtractor } from "./imports.js";

const FAKE_CTX: EdgeContext = {
  language: "typescript",
  capabilities: new Set(),
  carriers: () => [],
  suppressedRolePaths: [],
};

async function fileOf(wasm: string, language: string, source: string) {
  // El extractor no lee `file.sets`/`file.functions`: se deriva la sonda a
  // partir de la MISMA fuente que se analiza (válido porque `deriveNodeSets`
  // no exige ninguna construcción particular presente — ver `code-grammar.ts`).
  const sets = await nodeSetsFor(wasm, source);
  const root = await parseRoot(wasm, source);
  return fileUnitFrom(root, sets, language);
}

describe("imports", () => {
  describe("typescript / javascript / tsx / vue (misma sintaxis ES module)", () => {
    it("typescript: import nombrado + alias es una arista con el path crudo", async () => {
      const file = await fileOf(
        "tree-sitter-typescript.wasm",
        "typescript",
        'import { Sentinel, SentinelB as Aliased } from "./sentinel-mod";\n',
      );
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(1);
      expect(edges[0]).toMatchObject({
        kind: "imports",
        fromPath: [],
        toName: "./sentinel-mod",
        toQualifier: [],
        provenance: "declared",
      });
      expect(edges[0].via).toBe("import_statement");
    });

    it("typescript: import por defecto (`import Def from \"...\"`) también es una arista", async () => {
      const file = await fileOf("tree-sitter-typescript.wasm", "typescript", 'import Def from "./def-mod";\n');
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual(["./def-mod"]);
    });

    it("typescript: dos imports en el archivo son dos aristas", async () => {
      const file = await fileOf(
        "tree-sitter-typescript.wasm",
        "typescript",
        'import Def from "./def-mod";\nimport { X } from "./x-mod";\n',
      );
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual(["./def-mod", "./x-mod"]);
    });

    it("control negativo typescript: un archivo sin ningún import no dispara nada", async () => {
      const file = await fileOf("tree-sitter-typescript.wasm", "typescript", "const x = 1;\nfunction f() { return x; }\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(0);
    });

    it("javascript: misma gramática ES module, distinta wasm, mismo resultado", async () => {
      const file = await fileOf("tree-sitter-javascript.wasm", "javascript", 'import { Sentinel } from "./sentinel-mod";\n');
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(1);
      expect(edges[0].toName).toBe("./sentinel-mod");
    });

    it("tsx: misma gramática ES module (con soporte JSX), mismo resultado", async () => {
      const file = await fileOf("tree-sitter-tsx.wasm", "tsx", 'import { Sentinel } from "./sentinel-mod";\n');
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(1);
      expect(edges[0].toName).toBe("./sentinel-mod");
    });

    it("vue: el <script> se parsea como typescript (ver code-analyzer.ts) — mismo resultado", async () => {
      const file = await fileOf("tree-sitter-typescript.wasm", "vue", 'import { Sentinel } from "./sentinel-mod";\n');
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(1);
      expect(edges[0].toName).toBe("./sentinel-mod");
    });
  });

  // A2a (ola N) — RAÍZ 1 del frente: el BARRIL DE RE-EXPORT. Medido en CERO
  // aristas antes de este fix en las cuatro gramáticas ECMA, con 390
  // statements de esta forma en nest y 355 en vueuse. Ver `moduleSourceTarget`.
  describe("re-export (`export ... from`) — el barril, medido en cero antes de este fix", () => {
    for (const [wasm, language] of [
      ["tree-sitter-typescript.wasm", "typescript"],
      ["tree-sitter-javascript.wasm", "javascript"],
      ["tree-sitter-tsx.wasm", "tsx"],
      ["tree-sitter-typescript.wasm", "vue"],
    ] as const) {
      it(`${language}: \`export * from\` es una arista de dependencia de módulo`, async () => {
        const file = await fileOf(wasm, language, 'export * from "./param-utils";\n');
        const edges = importsExtractor.extract(file, FAKE_CTX);
        expect(edges.map((e) => e.toName)).toEqual(["./param-utils"]);
        expect(edges[0]).toMatchObject({ kind: "imports", fromPath: [], toQualifier: [], provenance: "declared" });
      });
    }

    it("typescript: las cuatro formas con `from` cuentan, la forma sin `from` no", async () => {
      const file = await fileOf(
        "tree-sitter-typescript.wasm",
        "typescript",
        'export * from "./a";\nexport * as ns from "./b";\nexport { X } from "./c";\nexport type { Y } from "./d";\nconst Z = 1;\nexport { Z };\nexport const q = 2;\n',
      );
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual(["./a", "./b", "./c", "./d"]);
    });

    it("un barril puro (sólo re-exports) deja de ser un archivo sin ninguna arista", async () => {
      const file = await fileOf(
        "tree-sitter-typescript.wasm",
        "typescript",
        'export * from "./param-utils";\nexport * from "./other-utils";\n',
      );
      expect(importsExtractor.extract(file, FAKE_CTX)).toHaveLength(2);
    });
  });

  describe("CommonJS require — A7 (Ola 9, F6): lodash es 100% CommonJS, medido en cero antes de este fix", () => {
    it("javascript: `const x = require(\"spec\")` es una arista", async () => {
      const file = await fileOf("tree-sitter-javascript.wasm", "javascript", 'const sentinelMod = require("./sentinel-mod");\n');
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(1);
      expect(edges[0]).toMatchObject({ kind: "imports", fromPath: [], toName: "./sentinel-mod", toQualifier: [], provenance: "declared" });
    });

    it("javascript: `require(\"spec\");` a secas (sin asignar) también es una arista", async () => {
      const file = await fileOf("tree-sitter-javascript.wasm", "javascript", 'require("./sentinel-mod");\n');
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual(["./sentinel-mod"]);
    });

    it("javascript: destructuring (`const { a, b } = require(\"spec\")`) también es una arista — el campo `value` es el mismo, `name` cambia de forma", async () => {
      const file = await fileOf("tree-sitter-javascript.wasm", "javascript", 'const { a, b } = require("./sentinel-mod");\n');
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual(["./sentinel-mod"]);
    });

    it("javascript: declaración múltiple (`const a = require(x), b = require(y)`) da DOS aristas, una por declarator", async () => {
      const file = await fileOf(
        "tree-sitter-javascript.wasm",
        "javascript",
        'const a = require("./a-mod"), b = require("./b-mod");\n',
      );
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual(["./a-mod", "./b-mod"]);
    });

    it("typescript/tsx/vue: misma forma CommonJS, mismo resultado (vocabulario genérico, no específico de un archivo `.js`)", async () => {
      const ts = await fileOf("tree-sitter-typescript.wasm", "typescript", 'const sentinelMod = require("./sentinel-mod");\n');
      expect(importsExtractor.extract(ts, FAKE_CTX).map((e) => e.toName)).toEqual(["./sentinel-mod"]);
    });

    it("control negativo: una llamada normal a una función que NO se llama `require` no dispara nada", async () => {
      const file = await fileOf("tree-sitter-javascript.wasm", "javascript", 'const x = notRequire("./sentinel-mod");\n');
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(0);
    });

    it("control negativo: `require` llamado SIN argumentos no dispara nada (nada que apuntar)", async () => {
      const file = await fileOf("tree-sitter-javascript.wasm", "javascript", "const x = require();\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(0);
    });

    // A2a (ola N): este test decía lo CONTRARIO ("`require` anidado dentro de
    // una función no dispara — mismo criterio 'sólo hijos directos de la
    // raíz'"). Ese criterio era la causa MEDIDA de 12 de los 31 falsos
    // positivos juzgados a mano de `orphan-file` (mapa de carga perezosa en
    // `lib/rules/index.js` de eslint, ver `importCallTargetsDeep`): un import
    // diferido es una dependencia de módulo real, sólo que resuelta en
    // ejecución. Ahora dispara, y la ubicación reportada es la de la llamada.
    it("`require` anidado dentro de una función SÍ dispara: un import diferido es una dependencia real", async () => {
      const file = await fileOf(
        "tree-sitter-javascript.wasm",
        "javascript",
        'function load() {\n  const x = require("./sentinel-mod");\n  return x;\n}\n',
      );
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual(["./sentinel-mod"]);
    });

    it('mapa de carga perezosa (`{ "a": () => require("./a") }`) da una arista por entrada — la forma exacta que dejaba huérfanos a 12 archivos medidos', async () => {
      const file = await fileOf(
        "tree-sitter-javascript.wasm",
        "javascript",
        'module.exports = {\n  "no-sync": () => require("./no-sync"),\n  "no-with": () => require("./no-with"),\n};\n',
      );
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual(["./no-sync", "./no-with"]);
    });

    it("dedupe: un `require` de nivel superior no se reporta dos veces por el recorrido profundo, y conserva la ubicación del declarator", async () => {
      const file = await fileOf(
        "tree-sitter-javascript.wasm",
        "javascript",
        'const a = require("./a-mod");\nfunction lazy() { return require("./b-mod"); }\n',
      );
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual(["./a-mod", "./b-mod"]);
      expect(edges[0].via).toBe("variable_declarator");
    });

    it("ES import y CommonJS require en el mismo archivo: dos aristas, una de cada mecanismo", async () => {
      const file = await fileOf(
        "tree-sitter-javascript.wasm",
        "javascript",
        'import { Sentinel } from "./es-mod";\nconst legacyMod = require("./cjs-mod");\n',
      );
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual(["./es-mod", "./cjs-mod"]);
    });
  });

  describe("python", () => {
    it("python: import simple (`import a.b.c`) usa el texto crudo con puntos, sin partir", async () => {
      const file = await fileOf("tree-sitter-python.wasm", "python", "import sentinel_pkg.mod\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(1);
      expect(edges[0].toName).toBe("sentinel_pkg.mod");
      expect(edges[0].toQualifier).toEqual([]);
    });

    it("python: `from X import Y, Z as W` apunta al MÓDULO (X), no a los símbolos importados", async () => {
      const file = await fileOf(
        "tree-sitter-python.wasm",
        "python",
        "from sentinel_pkg.mod import Sentinel, SentinelB as Aliased\n",
      );
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(1);
      expect(edges[0].toName).toBe("sentinel_pkg.mod");
    });

    // A2a (ola N): antes esperaba `toName === "."` — el texto crudo del
    // prefijo relativo, que `resolveImportTarget` resuelve al DIRECTORIO del
    // archivo y por lo tanto nunca a una ruta conocida: la arista se perdía
    // entera. `from . import x` es EL barril de Python (un archivo de
    // inicialización de paquete reexportando sus submódulos), la misma raíz
    // que `export * from` en ECMA. Ver `pythonRelativeMemberTargets`.
    it("python: `from . import sibling` apunta al SUBMÓDULO (`.sibling`), no al directorio", async () => {
      const file = await fileOf("tree-sitter-python.wasm", "python", "from . import sibling\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual([".sibling"]);
    });

    it("python: `from . import a, b` da una arista por nombre importado", async () => {
      const file = await fileOf("tree-sitter-python.wasm", "python", "from . import alpha, beta\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual([".alpha", ".beta"]);
    });

    it("python: `from .. import x` conserva el nivel del prefijo", async () => {
      const file = await fileOf("tree-sitter-python.wasm", "python", "from .. import parentmod\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual(["..parentmod"]);
    });

    it("python: `from . import x as y` toma el módulo, no el alias", async () => {
      const file = await fileOf("tree-sitter-python.wasm", "python", "from . import sibling as sib\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual([".sibling"]);
    });

    it("python byte-idéntico: `from .pkg import x` (módulo CON nombre) sigue dando un solo destino, el módulo", async () => {
      const file = await fileOf("tree-sitter-python.wasm", "python", "from .pkg import alpha, beta\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual([".pkg"]);
    });

    it("control negativo python: una función con parámetro `name` no se confunde con un import", async () => {
      const file = await fileOf("tree-sitter-python.wasm", "python", "def build(name):\n    return name\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(0);
    });

    it("python: `import a.b as c` (bare, con alias) da el módulo SIN el alias pegado", async () => {
      // Encontrado como bug real corriendo el extractor contra el corpus
      // (click): `aliased_import` envuelve TANTO el módulo como el alias, y
      // su propio texto incluía " as cabc" en el resultado.
      const file = await fileOf("tree-sitter-python.wasm", "python", "import collections.abc as cabc\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(1);
      expect(edges[0].toName).toBe("collections.abc");
    });

    it("límite declarado python: `from __future__ import annotations` no es recuperable por campo — no dispara", async () => {
      // Encontrado como bug real corriendo contra el corpus (click):
      // `future_import_statement` no expone `module_name` (el pseudo-módulo
      // `__future__` es un token anónimo fijo de esa regla), así que caía al
      // símbolo importado ("annotations") en vez del módulo. Ver LÍMITES
      // POR LENGUAJE en el docstring del módulo.
      const file = await fileOf("tree-sitter-python.wasm", "python", "from __future__ import annotations\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(0);
    });
  });

  describe("java", () => {
    it("java: import de clase calificada da el texto completo com.a.b.Clase", async () => {
      const file = await fileOf("tree-sitter-java.wasm", "java", "import com.example.pkg.SentinelClass;\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(1);
      expect(edges[0].toName).toBe("com.example.pkg.SentinelClass");
      expect(edges[0].via).toBe("import_declaration");
    });

    it("java: import static también es una arista (mismo mecanismo posicional)", async () => {
      const file = await fileOf("tree-sitter-java.wasm", "java", "import static com.example.pkg.Helper.method;\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(1);
      expect(edges[0].toName).toBe("com.example.pkg.Helper.method");
    });

    // A2a (ola N): medido por sonda directa — `import static X.Y.*;` parsea
    // con un nodo `asterisk` DESPUÉS del nombre calificado, así que "el
    // último hijo nombrado" daba `toName: "*"` y la arista se perdía entera.
    it("java: import static COMODÍN apunta al tipo, no al asterisco", async () => {
      const file = await fileOf("tree-sitter-java.wasm", "java", "import static com.example.pkg.Helper.*;\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual(["com.example.pkg.Helper"]);
    });

    it("java: import de paquete COMODÍN (`import com.example.pkg.*;`) apunta al paquete", async () => {
      const file = await fileOf("tree-sitter-java.wasm", "java", "import com.example.pkg.*;\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual(["com.example.pkg"]);
    });

    it("control negativo java: una clase sin imports no dispara nada", async () => {
      const file = await fileOf("tree-sitter-java.wasm", "java", "class Widget {\n  void run() {}\n}\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(0);
    });
  });

  describe("csharp", () => {
    it("csharp: using simple da el nombre calificado completo", async () => {
      const file = await fileOf("tree-sitter-c_sharp.wasm", "csharp", "using SentinelNamespace.Pkg;\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(1);
      expect(edges[0].toName).toBe("SentinelNamespace.Pkg");
      expect(edges[0].via).toBe("using_directive");
    });

    it("csharp: using con alias (`using Alias = X.Y;`) apunta al lado derecho (X.Y), no al alias", async () => {
      const file = await fileOf("tree-sitter-c_sharp.wasm", "csharp", "using Alias = SentinelNamespace.Other;\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(1);
      expect(edges[0].toName).toBe("SentinelNamespace.Other");
    });

    it("control negativo csharp: una clase sin usings no dispara nada", async () => {
      const file = await fileOf("tree-sitter-c_sharp.wasm", "csharp", "class Widget {\n  void Run() {}\n}\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(0);
    });
  });

  describe("go", () => {
    it("go: import agrupado (`import (...)`) da UNA arista por cada import_spec", async () => {
      const file = await fileOf(
        "tree-sitter-go.wasm",
        "go",
        'package main\nimport (\n\t"fmt"\n\tsentinel "example.com/sentinelpkg"\n)\n',
      );
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual(["fmt", "example.com/sentinelpkg"]);
      // el alias de paquete ("sentinel") NUNCA aparece como destino.
      expect(edges.every((e) => e.toName !== "sentinel")).toBe(true);
    });

    it("go: import simple sin paréntesis (grupo de tamaño uno) también es una arista", async () => {
      const file = await fileOf("tree-sitter-go.wasm", "go", 'package main\nimport "fmt"\n');
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual(["fmt"]);
    });

    it("control negativo go: un archivo sin imports no dispara nada", async () => {
      const file = await fileOf("tree-sitter-go.wasm", "go", "package main\n\nfunc main() {}\n");
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges).toHaveLength(0);
    });
  });

  /**
   * A7 (Ola 11b). ANTES de esta ola había acá un test titulado "no aplicable
   * sin imports: ruby no tiene nodo de import — forzado a correr igual, da 0
   * hallazgos", que CONSAGRABA la brecha: afirmaba que la ausencia era del
   * lenguaje y no del extractor. Medido, era mitad y mitad — Ruby no tiene
   * nodo de import, cierto, pero `require` sí tiene una FORMA reconocible
   * (`call` con `[method] identifier "require"` + `[arguments]`), la MISMA
   * que este extractor ya reconocía para CommonJS desde la Ola 9. Se corrigió
   * el test en vez de conservarlo (mismo criterio que la Ola 11a aplicó al
   * test que consagraba el bug de `null-object.ts`).
   */
  describe("ruby — import escrito como llamada (A7, Ola 11b)", () => {
    it("`require` y `require_relative` de nivel superior dan una arista cada uno, con el especificador crudo", async () => {
      const file = await fileOf("tree-sitter-ruby.wasm", "ruby", 'require "sentinel_dep"\nrequire_relative "./local_dep"\n');
      const edges = importsExtractor.extract(file, FAKE_CTX);
      expect(edges.map((e) => e.toName)).toEqual(["sentinel_dep", "./local_dep"]);
      expect(edges[0]).toMatchObject({ kind: "imports", fromPath: [], toQualifier: [], provenance: "declared" });
    });

    it("control negativo: una llamada de nivel superior que NO es del vocabulario de import no dispara nada", async () => {
      const file = await fileOf("tree-sitter-ruby.wasm", "ruby", 'puts "sentinel_dep"\nrequireAuth("sentinel_dep")\n');
      expect(importsExtractor.extract(file, FAKE_CTX)).toHaveLength(0);
    });

    it("`require_dependency` (forma real de Rails) SÍ dispara: la regex reconoce el segmento `require` seguido de `_`, igual que en `require_relative` — deliberado, todo `require_*` de nivel superior con un literal de string es un import", async () => {
      const file = await fileOf("tree-sitter-ruby.wasm", "ruby", 'require_dependency "sentinel_dep"\n');
      expect(importsExtractor.extract(file, FAKE_CTX).map((e) => e.toName)).toEqual(["sentinel_dep"]);
    });

    it("control negativo: `require` con un argumento que NO es literal de string no se adivina (forma real: `require File.expand_path(...)`)", async () => {
      const file = await fileOf("tree-sitter-ruby.wasm", "ruby", 'require File.expand_path("../lib", __dir__)\n');
      expect(importsExtractor.extract(file, FAKE_CTX)).toHaveLength(0);
    });

    // A2a (ola N): antes esperaba CERO ("sólo hijos directos de la raíz").
    // Mismo cambio y misma razón que en el bloque de CommonJS: un `require`
    // anidado carga el archivo igual que uno de nivel superior.
    it("`require` anidado dentro de una clase SÍ dispara: carga el archivo igual que uno de nivel superior", async () => {
      const file = await fileOf("tree-sitter-ruby.wasm", "ruby", 'class Site\n  require "sentinel_dep"\nend\n');
      expect(importsExtractor.extract(file, FAKE_CTX).map((e) => e.toName)).toEqual(["sentinel_dep"]);
    });
  });

  describe("límite declarado", () => {
    it("java/csharp/go no tienen import escrito como llamada: la forma de llamada, ahora aplicada a TODOS los lenguajes, no les agrega ni una arista de más", async () => {
      const java = await fileOf("tree-sitter-java.wasm", "java", "class Sentinel {\n  void run() { helper(1); }\n}\n");
      expect(importsExtractor.extract(java, FAKE_CTX)).toHaveLength(0);
      const go = await fileOf("tree-sitter-go.wasm", "go", "package main\n\nfunc main() { helper(1) }\n");
      expect(importsExtractor.extract(go, FAKE_CTX)).toHaveLength(0);
    });
  });
});
