import { describe, expect, it } from "vitest";

import { countRealLayersCrossed, MIN_REAL_LAYERS, populatedFolders } from "./n3-capas-reales.js";

/**
 * Los casos de este archivo son las GEOMETRÍAS REALES medidas en la Ola O
 * (ver el docstring de `n3-capas-reales.ts`), no formas inventadas: el
 * paquete Java de guava, el `lib/` de sqlalchemy, el `lib/languages/js` de
 * eslint y el `futures/failureaccess/src` que sobrevive. Verificados a mano
 * contra el árbol del corpus con `find -maxdepth 1 -type f`.
 */
function files(...paths: string[]) {
  return paths.map((path) => ({ path }));
}

describe("populatedFolders", () => {
  it("una carpeta cuenta sólo si contiene DIRECTAMENTE un archivo analizado", () => {
    const p = populatedFolders(files("a/b/c/x.js"));
    expect(p.has("a/b/c")).toBe(true);
    expect(p.has("a/b")).toBe(false);
    expect(p.has("a")).toBe(false);
  });

  it("un archivo en la raíz del repo puebla la raíz (cadena vacía)", () => {
    expect(populatedFolders(files("index.js")).has("")).toBe(true);
  });

  it("varias carpetas distintas se acumulan sin duplicar", () => {
    const p = populatedFolders(files("a/x.js", "a/y.js", "b/z.js"));
    expect([...p].sort()).toEqual(["a", "b"]);
  });
});

describe("countRealLayersCrossed", () => {
  it("guava, medido: el paquete Java entero (src/com/google/common) cuenta CERO capas — es namespace", () => {
    // `android/guava/src`, `…/src/com`, `…/com/google` y `…/google/common` no contienen
    // NINGÚN archivo en el árbol real de guava; `android/guava` sólo tiene un pom.xml, que
    // el analizador no ingiere.
    const p = populatedFolders(
      files(
        "android/guava-testlib/src/com/google/common/testing/ClassSanityTester.java",
        "android/guava/src/com/google/common/collect/ArrayListMultimap.java",
      ),
    );
    const target = "android/guava/src/com/google/common/collect".split("/");
    // commonLen = 1 ("android"), skippedLevels de ruta = 7 - 1 - 1 = 5.
    expect(target.length - 1 - 1).toBe(5);
    expect(countRealLayersCrossed(p, target, 1)).toBe(0);
  });

  it("guava, medido: futures/failureaccess/src SÍ contiene module-info.java, así que ese par cruza UNA capa real", () => {
    const p = populatedFolders(
      files(
        "guava/src/com/google/common/util/concurrent/AbstractFuture.java",
        "futures/failureaccess/src/module-info.java",
        "futures/failureaccess/src/com/google/common/util/concurrent/internal/InternalFutureFailureAccess.java",
      ),
    );
    const target = "futures/failureaccess/src/com/google/common/util/concurrent/internal".split("/");
    expect(countRealLayersCrossed(p, target, 0)).toBe(1);
  });

  it("eslint, medido: lib/languages NO tiene archivos y lib/languages/js SÍ (index.js) — una capa real, no dos", () => {
    const p = populatedFolders(
      files("lib/api.js", "lib/languages/js/index.js", "lib/languages/js/source-code/index.js"),
    );
    const target = "lib/languages/js/source-code".split("/");
    expect(target.length - 1 - 1).toBe(2); // dos niveles de RUTA
    expect(countRealLayersCrossed(p, target, 1)).toBe(1); // …una sola capa real
  });

  it("sqlalchemy, medido: lib/ no tiene archivos, lib/sqlalchemy sí — una capa real", () => {
    const p = populatedFolders(
      files("examples/versioned_history/history_meta.py", "lib/sqlalchemy/__init__.py", "lib/sqlalchemy/orm/exc.py"),
    );
    expect(countRealLayersCrossed(p, "lib/sqlalchemy/orm".split("/"), 0)).toBe(1);
  });

  it("hugo, medido: resources/ y resources/page/ tienen archivos propios — dos capas reales", () => {
    const p = populatedFolders(
      files(
        "hugolib/content_map.go",
        "resources/resource.go",
        "resources/page/page.go",
        "resources/page/pagemeta/pagemeta.go",
      ),
    );
    expect(countRealLayersCrossed(p, "resources/page/pagemeta".split("/"), 0)).toBe(2);
  });

  it("la carpeta PROPIA del destino nunca cuenta (llegar ahí es el hallazgo, no el camino)", () => {
    const p = populatedFolders(files("a/x.js", "a/b/c/deep.js", "a/b/c/otro.js"));
    // `a/b/c` está poblada (dos archivos) pero es la carpeta del destino; `a/b` no lo está.
    expect(countRealLayersCrossed(p, "a/b/c".split("/"), 0)).toBe(1); // sólo `a`
    expect(countRealLayersCrossed(p, "a/b/c".split("/"), 1)).toBe(0); // desde `a`: sólo `a/b`, vacía
  });

  it("el rango es exactamente el de `nivelesSalteados`: nunca puede devolver más que la cuenta de niveles de ruta", () => {
    const target = "a/b/c/d/e".split("/");
    const p = populatedFolders(files("a/x.js", "a/b/x.js", "a/b/c/x.js", "a/b/c/d/x.js", "a/b/c/d/e/x.js"));
    const commonLen = 1;
    const rutaLevels = target.length - commonLen - 1;
    expect(countRealLayersCrossed(p, target, commonLen)).toBe(rutaLevels);
  });

  it("piso declarado: 1 — la condición de existencia del fenómeno, no una magnitud", () => {
    expect(MIN_REAL_LAYERS).toBe(1);
  });
});
