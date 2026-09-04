/**
 * Tests de `n10-no-es-producto.ts` — Ola O, frente N10.
 *
 * TODAS las cabeceras de la sección de procedencia son TEXTO REAL de
 * archivos reales del corpus, copiado verbatim y con su ruta escrita al
 * lado. No hay ni una cabecera inventada, y el motivo está medido: el
 * informe del frente A4b de la ola anterior documenta un bug de heurística
 * de texto que sus fixtures sintéticos NO encontraron y que apareció recién
 * al correr la función contra código real. Una heurística sobre texto se
 * prueba contra el texto que existe, no contra el que uno escribiría para
 * demostrar que funciona.
 */
import { describe, expect, it } from "vitest";

import {
  arnesPorNombreDeDescubrimiento,
  esProcedenciaAjena,
  esSubarbolAutocontenido,
  firmaDeProcedencia,
  MIN_FIRMADOS,
  paresDeArchivoDelGrafo,
  procedenciaDominante,
  subarbolesAutocontenidos,
} from "./n10-no-es-producto.js";

function fn(name: string | null, parameters: number) {
  return { name, metrics: { parameters } };
}

describe("arnesPorNombreDeDescubrimiento — contrato de descubrimiento por nombre", () => {
  it("reconoce el método que un runner reflexivo descubre y ejecuta sin argumentos", () => {
    // corpus/guava/guava-testlib/src/com/google/common/collect/testing/testers/MapRemoveTester.java
    expect(arnesPorNombreDeDescubrimiento(fn("testRemove_wrongType", 0))?.motivo).toBe("arnes-por-nombre");
    // corpus/click, corpus/sqlalchemy: la grafía de pytest/unittest.
    expect(arnesPorNombreDeDescubrimiento(fn("test_wrap_chunks", 0))?.motivo).toBe("arnes-por-nombre");
    // La grafía exportada de Go (`go test` exige la mayúscula inicial).
    expect(arnesPorNombreDeDescubrimiento(fn("TestParseFlags", 0))?.motivo).toBe("arnes-por-nombre");
    // El nombre pelado, sin sufijo: sigue siendo el prefijo entero.
    expect(arnesPorNombreDeDescubrimiento(fn("test", 0))?.motivo).toBe("arnes-por-nombre");
  });

  it("el detalle nombra la función y las dos mitades del contrato, para poder auditar sin releer nada", () => {
    const motivo = arnesPorNombreDeDescubrimiento(fn("testRemove_wrongType", 0));
    expect(motivo?.detalle).toContain("testRemove_wrongType");
    expect(motivo?.detalle).toContain("sin parámetros");
  });

  it("NO reconoce una palabra que apenas EMPIEZA con las mismas letras — la frontera es la mitad del criterio", () => {
    // `guava-testlib` publica decenas de clases `XxxTester` cuyos métodos son API de producción.
    for (const name of ["tester", "testing", "testable", "testimony", "testsuite"]) {
      expect(arnesPorNombreDeDescubrimiento(fn(name, 0)), name).toBeNull();
    }
  });

  it("NO reconoce una función con parámetros: ningún runner reflexivo tendría qué pasarle", () => {
    expect(arnesPorNombreDeDescubrimiento(fn("testConnection", 1))).toBeNull();
    expect(arnesPorNombreDeDescubrimiento(fn("test_and_set", 2))).toBeNull();
    // El límite declarado del módulo, escrito como test para que no se pierda:
    // un test de pytest con fixture tiene aridad > 0 y NO cae acá.
    expect(arnesPorNombreDeDescubrimiento(fn("test_algo", 1))).toBeNull();
  });

  it("una función anónima nunca cae: sin nombre no hay contrato de descubrimiento", () => {
    expect(arnesPorNombreDeDescubrimiento(fn(null, 0))).toBeNull();
  });

  it("NO reconoce nombres de producción reales del mismo árbol medido", () => {
    // Los símbolos que SOBREVIVEN en la medición de `empty-catch` sobre guava
    // tras aplicar el criterio: helpers de arnés y código vendorizado que este
    // criterio deliberadamente NO toca (ver el informe del frente).
    for (const name of ["getUnsafe", "expectReturnsFalseOrThrows", "expectSetCountFailure", "measureSize", "run", "equals", "isCompatible"]) {
      expect(arnesPorNombreDeDescubrimiento(fn(name, 0)), name).toBeNull();
    }
  });
});

/* ── Cabeceras REALES del corpus ─────────────────────────────────────────── */

/** corpus/hugo/tpl/internal/go_templates/htmltemplate/css.go — copia vendorizada de la stdlib de Go. */
const HUGO_VENDORIZADO = `// Copyright 2011 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package template
`;

/** corpus/hugo/commands/hugobuilder.go — archivo propio de hugo (grafía con "-present"). */
const HUGO_PROPIO = `// Copyright 2024-present The Hugo Authors. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
package commands
`;

/** corpus/guava/android/guava/src/com/google/common/hash/Striped64.java — copia de JSR-166. */
const GUAVA_VENDORIZADO = `/*
 * Written by Doug Lea with assistance from members of JCP JSR-166
 * Expert Group and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

package com.google.common.hash;
`;

/** corpus/guava/guava-testlib/src/com/google/common/collect/testing/testers/MapRemoveTester.java — archivo propio. */
const GUAVA_PROPIO = `/*
 * Copyright (C) 2008 The Guava Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

package com.google.common.collect.testing.testers;
`;

/** corpus/newtonsoft-json/Src/Newtonsoft.Json/Utilities/LinqBridge.cs — librería de terceros copiada adentro. */
const NEWTONSOFT_VENDORIZADO = `#region License, Terms and Author(s)
//
// LINQBridge
// Copyright (c) 2007 Atif Aziz, Joseph Albahari. All rights reserved.
//
#endregion
`;

/**
 * corpus/sqlalchemy/tools/normalize_file_headers.py — EL CONFUNDIDOR: un
 * script propio del proyecto que ARMA cabeceras, y por lo tanto lleva una
 * plantilla de copyright con interpolaciones adentro. Es el único falso
 * positivo que la primera versión del criterio produjo sobre los 13 repos.
 */
const SQLALCHEMY_PLANTILLA = `from datetime import date

license_ = f"""
# Copyright (C) 2005-{this_year} the SQLAlchemy authors and \\
contributors
# <see AUTHORS file>
#
"""
`;

/** corpus/sqlalchemy/lib/sqlalchemy/engine/base.py — archivo propio, la grafía normal. */
const SQLALCHEMY_PROPIO = `# engine/base.py
# Copyright (C) 2005-2025 the SQLAlchemy authors and contributors
# <see AUTHORS file>
#
# This module is part of SQLAlchemy and is released under
# the MIT License
`;

/** corpus/preact/src/index.js — un repo entero sin ninguna cabecera de atribución. */
const SIN_CABECERA = `import { render, hydrate } from './render';
export { createElement, createRef, Fragment, Component } from './create-element';
`;

describe("firmaDeProcedencia — la atribución que el archivo declara de sí mismo", () => {
  it("extrae la misma firma de dos escrituras del mismo autor (con y sin '-present', con y sin muletillas)", () => {
    expect(firmaDeProcedencia(HUGO_PROPIO)).toBe(firmaDeProcedencia("// Copyright 2019 The Hugo Authors\n"));
  });

  it("distingue dos autores distintos en el MISMO archivo de lenguaje y estilo de comentario", () => {
    expect(firmaDeProcedencia(HUGO_VENDORIZADO)).not.toBe(firmaDeProcedencia(HUGO_PROPIO));
  });

  it("reconoce la atribución sin la palabra 'copyright' (la forma de JSR-166 dentro de guava)", () => {
    expect(firmaDeProcedencia(GUAVA_VENDORIZADO)).not.toBeNull();
    expect(firmaDeProcedencia(GUAVA_VENDORIZADO)).not.toBe(firmaDeProcedencia(GUAVA_PROPIO));
  });

  it("funciona igual en los cinco estilos de comentario del corpus (//, /* */, #, #region)", () => {
    expect(firmaDeProcedencia(NEWTONSOFT_VENDORIZADO)).not.toBeNull();
    expect(firmaDeProcedencia(SQLALCHEMY_PROPIO)).not.toBeNull();
  });

  it("`null` cuando el archivo no declara ninguna atribución — la ausencia de evidencia no es evidencia", () => {
    expect(firmaDeProcedencia(SIN_CABECERA)).toBeNull();
  });

  it("`null` cuando la atribución está DEBAJO de la cabecera: una cita en el medio no habla del archivo", () => {
    const tarde = "x\n".repeat(60) + "// Copyright 2011 The Go Authors\n";
    expect(firmaDeProcedencia(tarde)).toBeNull();
  });

  it("`null` cuando la atribución no está en un comentario (una plantilla en una cadena de código)", () => {
    expect(firmaDeProcedencia('const t = "Copyright 2011 The Go Authors";\n')).toBeNull();
  });
});

describe("procedenciaDominante — las tres compuertas de seguridad", () => {
  const propia = firmaDeProcedencia(HUGO_PROPIO)!;
  const ajena = firmaDeProcedencia(HUGO_VENDORIZADO)!;
  const repetir = (firma: string | null, n: number): (string | null)[] => Array.from({ length: n }, () => firma);

  it("con una mayoría clara, cobertura alta y muestra suficiente, devuelve la firma del repo", () => {
    expect(procedenciaDominante([...repetir(propia, 200), ...repetir(ajena, 20)])).toBe(propia);
  });

  it("compuerta 1 — muestra chica: por debajo del piso absoluto NO hay dominante (el caso eslint)", () => {
    expect(procedenciaDominante(repetir(propia, MIN_FIRMADOS - 1))).toBeNull();
    expect(procedenciaDominante(repetir(propia, MIN_FIRMADOS))).toBe(propia);
  });

  it("compuerta 2 — cobertura baja: un repo que no usa cabeceras no tiene contra qué comparar", () => {
    // 100 firmados sobre 1.000 archivos = 10 %: por debajo del 25 % exigido.
    expect(procedenciaDominante([...repetir(propia, 100), ...repetir(null, 900)])).toBeNull();
  });

  it("compuerta 3 — sin mayoría clara: dos autores mitad y mitad no dejan a ninguno ser 'el del repo'", () => {
    expect(procedenciaDominante([...repetir(propia, 100), ...repetir(ajena, 100)])).toBeNull();
  });

  it("sin ningún archivo, o con todos sin firma, no hay dominante y no puede excluirse nada", () => {
    expect(procedenciaDominante([])).toBeNull();
    expect(procedenciaDominante(repetir(null, 500))).toBeNull();
  });
});

describe("esProcedenciaAjena — la decisión completa", () => {
  const hugoDominante = procedenciaDominante([
    ...Array.from({ length: 200 }, () => firmaDeProcedencia(HUGO_PROPIO)),
    ...Array.from({ length: 54 }, () => firmaDeProcedencia(HUGO_VENDORIZADO)),
  ]);

  it("marca la copia vendorizada real y NO marca el archivo propio real", () => {
    expect(esProcedenciaAjena(firmaDeProcedencia(HUGO_VENDORIZADO), hugoDominante)?.motivo).toBe("procedencia-ajena");
    expect(esProcedenciaAjena(firmaDeProcedencia(HUGO_PROPIO), hugoDominante)).toBeNull();
  });

  it("el detalle deja las DOS atribuciones escritas, para auditar la exclusión sin releer el archivo", () => {
    const motivo = esProcedenciaAjena(firmaDeProcedencia(HUGO_VENDORIZADO), hugoDominante);
    expect(motivo?.detalle).toContain("go");
    expect(motivo?.detalle).toContain("hugo");
  });

  it("EL CONFUNDIDOR MEDIDO: la plantilla de cabeceras de sqlalchemy NO es ajena (comparación por subconjunto)", () => {
    const dominante = procedenciaDominante(Array.from({ length: 200 }, () => firmaDeProcedencia(SQLALCHEMY_PROPIO)));
    expect(dominante).not.toBeNull();
    expect(esProcedenciaAjena(firmaDeProcedencia(SQLALCHEMY_PLANTILLA), dominante)).toBeNull();
  });

  it("un archivo sin firma NUNCA es ajeno, tenga el repo la convención que tenga", () => {
    expect(esProcedenciaAjena(firmaDeProcedencia(SIN_CABECERA), hugoDominante)).toBeNull();
  });

  it("sin dominante, NADA es ajeno — el modo de falla de las tres compuertas es no excluir", () => {
    expect(esProcedenciaAjena(firmaDeProcedencia(HUGO_VENDORIZADO), null)).toBeNull();
    expect(esProcedenciaAjena(firmaDeProcedencia(GUAVA_VENDORIZADO), null)).toBeNull();
  });
});

/* ── Criterio 3 — subárbol autocontenido (Ola Q, frente F2) ───────────────
 *
 * Las rutas son las de los casos MEDIDOS sobre el corpus (ver el bloque del
 * criterio en el módulo): el árbol de cops de `jekyll` y los DTO de las
 * muestras de integración de `nest` del lado que SÍ cae, y los paquetes de
 * producto de `newtonsoft-json`/`hugo`/`vueuse` del lado que NO puede caer.
 */

/** Un repo de juguete: `archivos` con sus líneas, `aristas` como pares de ruta. */
function repo(archivos: readonly (readonly [string, number])[]) {
  return archivos.map(([path, lines]) => ({ path, lines }));
}

describe("criterio 3 — subárbol autocontenido", () => {
  // 10 archivos cableados entre sí (cobertura 1,00) + un subárbol suelto.
  const cableados = Array.from({ length: 10 }, (_, i) => [`lib/nucleo/m${String(i)}.rb`, 100] as const);
  const aristasCableadas = cableados
    .slice(1)
    .map((a) => [a[0], cableados[0]![0]] as const);

  it("una carpeta SIN NI UNA arista con el resto del repo es autocontenida", () => {
    const sat = subarbolesAutocontenidos(
      repo([...cableados, ["cops/no_p.rb", 30], ["cops/no_puts.rb", 30]]),
      aristasCableadas,
    );
    expect(sat.has("cops")).toBe(true);
    expect(sat.has("lib/nucleo")).toBe(false);
    expect(esSubarbolAutocontenido(["cops/no_p.rb", "cops/no_puts.rb"], sat)).not.toBeNull();
  });

  it("LAS DOS DIRECCIONES: una carpeta que SÓLO usa al resto del repo (nadie depende de ella) NO es autocontenida", () => {
    // Es el caso que descartó la variante amplia: `Src/Newtonsoft.Json/Utilities`,
    // `hugo/tpl/compare`, `vueuse/packages/router` — producto sin aristas entrantes.
    const sat = subarbolesAutocontenidos(
      repo([...cableados, ["util/reflexion.rb", 30]]),
      [...aristasCableadas, ["util/reflexion.rb", cableados[0]![0]] as const],
    );
    expect(sat.has("util")).toBe(false);
  });

  it("y tampoco lo es una carpeta de la que el resto del repo SÍ depende", () => {
    const sat = subarbolesAutocontenidos(
      repo([...cableados, ["util/reflexion.rb", 30]]),
      [...aristasCableadas, [cableados[0]![0], "util/reflexion.rb"] as const],
    );
    expect(sat.has("util")).toBe(false);
  });

  it("COMPUERTA 1 — sin cobertura de aristas en el repo no se declara NADA autocontenido", () => {
    // 5 archivos, 1 arista: 2 de 5 cableados (0,40). Es la cobertura del fixture
    // sintético que disparó esta compuerta; los 13 repos del corpus van de 0,80 a 1,00.
    const sat = subarbolesAutocontenidos(
      repo([["a/x.java", 60], ["b/y.java", 60], ["c/z.java", 60], ["d/p.ts", 60], ["d/q.ts", 60]]),
      [["d/p.ts", "d/q.ts"] as const],
    );
    expect(sat.size).toBe(0);
  });

  it("COMPUERTA 2 — el subárbol donde vive el grueso del código NO puede ser satélite", () => {
    const sat = subarbolesAutocontenidos(
      repo([...cableados, ["gordo/todo.js", 100_000]]),
      aristasCableadas,
    );
    expect(sat.has("gordo")).toBe(false);
  });

  it("UNA sola copia fuera de los satélites y el hallazgo se emite igual", () => {
    const sat = subarbolesAutocontenidos(
      repo([...cableados, ["cops/no_p.rb", 30], ["cops/no_puts.rb", 30]]),
      aristasCableadas,
    );
    expect(esSubarbolAutocontenido(["cops/no_p.rb", "lib/nucleo/m0.rb"], sat)).toBeNull();
  });

  it("un archivo suelto en la raíz nunca cae: la raíz no es un subárbol, es el repo", () => {
    const sat = subarbolesAutocontenidos(repo([...cableados, ["suelto.rb", 10]]), aristasCableadas);
    expect(esSubarbolAutocontenido(["suelto.rb"], sat)).toBeNull();
  });

  it("sin grafo no hay pares, y sin pares no hay satélites: el filtro nunca oculta de más", () => {
    expect(paresDeArchivoDelGrafo(null)).toEqual([]);
    expect(subarbolesAutocontenidos(repo(cableados), paresDeArchivoDelGrafo(null)).size).toBe(0);
    expect(esSubarbolAutocontenido(["cops/no_p.rb"], new Set())).toBeNull();
  });
});
