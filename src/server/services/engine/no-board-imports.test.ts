/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA COMPUERTA DE LA OLA BC: EL MOTOR NO IMPORTA NADA DEL TABLERO.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * POR QUÉ ES UN TEST Y NO UNA REGLA ESCRITA. Una regla escrita se rompe en la
 * ola siguiente y nadie se entera hasta que alguien intenta usar el motor
 * afuera y descubre que arrastra medio tablero. Un import prohibido tiene que
 * poner la suite en ROJO, no aparecer en una revisión.
 *
 * QUÉ MIDE, exactamente: para cada archivo del motor (`manifest.ts`), resuelve
 * TODO especificador de import/export/`import()`/`require` con el scanner del
 * propio TypeScript —no con una expresión regular: los archivos del analizador
 * están llenos de fixtures con `import` adentro de template literals, y una
 * regex los confunde con imports de verdad— y exige que el destino caiga dentro
 * del motor o en la lista blanca.
 *
 * ES UNA LISTA BLANCA, NO UNA NEGRA. Lo que no está explícitamente permitido
 * está prohibido, incluido el módulo del tablero que alguien escriba mañana.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * OLA BD — LA COMPUERTA ERA CIEGA, Y NO A UNA FORMA RARA
 * ───────────────────────────────────────────────────────────────────────────
 *
 * La versión de la Ola BC descartaba TODO especificador que no empezara con
 * `.` (`if (!spec.startsWith(".")) continue;`) con el argumento de que un
 * especificador no relativo sólo puede ser un paquete de `node_modules`. **Eso
 * es falso en este repo**: `tsconfig.json` define `baseUrl: "."` y
 * `paths: { "@shared/*": ["src/shared/*"] }`, así que hay DOS formas no
 * relativas de escribir un import del tablero que compilan igual.
 *
 * Medido, no razonado (Ola BD, informe BD1 §1): con
 * `import type { Repositories } from "@shared/interfaces.js"` inyectado en el
 * bloque de imports real de `census.ts` —un archivo del motor importando el
 * contrato del tablero— esta compuerta pasaba **5/5 en verde** y `tsc` cerraba
 * **exit 0**. Y como `import type` se borra al compilar, nunca iba a fallar en
 * runtime: nadie se enteraba.
 *
 * LA CORRECCIÓN NO ES "TAPAR `@shared`". Es resolver el especificador como lo
 * resuelve el compilador: los `paths` se LEEN DE `tsconfig.json` (no se
 * escriben acá), así que el alias que alguien agregue mañana queda cubierto sin
 * tocar este archivo; y las formas equivalentes de nombrar el mismo destino
 * —sin extensión, por `baseUrl`, apuntando a la carpeta para que resuelva el
 * `index.ts`— caen todas en el mismo resolvedor. El describe
 * "LAS FORMAS DE ESCRIBIR UN IMPORT DEL TABLERO" de abajo tiene una por caso, y
 * cada una **falla con la versión BC de este archivo**.
 *
 * PROBADO EN ROJO (obligación de la Ola BC, cicatriz 3: "un test que no se pone
 * rojo sin el cambio no prueba nada"). Ola BC: se agregó a mano
 * `import type { Repositories } from "../../../shared/interfaces.js";` en
 * `code-analyzer.ts` y el caso "producción" falló nombrando el archivo y el
 * destino; se agregó `import { initDb } from "../../db/index.js";` en
 * `census.ts` y volvió a fallar. Ola BD: las once formas del describe nuevo,
 * más la inyección real de `@shared/interfaces.js` en `census.ts`, que ahora
 * pone en rojo el caso "producción".
 *
 * ESTE TEST NO ARREGLA NADA: FIJA. Medido antes de esas olas, el motor ya
 * importaba, fuera de `src/server/services/`, exactamente `shared/types.ts`.
 * La línea existía y no la sostenía nadie; ahora la sostiene esto.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  ALLOWED_EXTERNAL_MODULES,
  ALLOWED_EXTERNAL_MODULES_IN_TESTS,
  BOARD_MODULES,
  ENGINE_DIRS,
  ENGINE_FILES,
} from "./manifest.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
}

/** Todo archivo `.ts` del motor, absoluto. */
function engineFiles(): string[] {
  const out: string[] = [];
  for (const d of ENGINE_DIRS) walk(path.join(REPO_ROOT, d), out);
  for (const f of ENGINE_FILES) out.push(path.join(REPO_ROOT, f));
  return out.sort();
}

const ENGINE_SET = new Set(engineFiles());
const ALLOWED = new Set(ALLOWED_EXTERNAL_MODULES.map((m) => path.join(REPO_ROOT, m)));
const ALLOWED_TESTS = new Set(
  [...ALLOWED_EXTERNAL_MODULES, ...ALLOWED_EXTERNAL_MODULES_IN_TESTS].map((m) => path.join(REPO_ROOT, m)),
);

/* ───────────────────────────────────────────────────────────────────────────
 * CÓMO RESUELVE EL COMPILADOR, LEÍDO DE `tsconfig.json`
 * ─────────────────────────────────────────────────────────────────────────── */

interface Alias {
  readonly prefijo: string;
  readonly sufijo: string;
  readonly destinos: readonly string[];
  readonly comodin: boolean;
}

/**
 * `baseUrl` y `paths` del `tsconfig.json` REAL. Se leen, no se escriben acá: el
 * día que alguien agregue `"@tablero/*"` esta compuerta lo cubre sola. Si el
 * archivo dejara de tener `paths`, el test "el resolvedor lee los alias de
 * verdad" se pone rojo en vez de dejar el agujero abierto en silencio.
 */
function leerTsconfig(): { baseUrl: string; alias: Alias[] } {
  const file = path.join(REPO_ROOT, "tsconfig.json");
  const leido = ts.readConfigFile(file, ts.sys.readFile);
  const co = (leido.config?.compilerOptions ?? {}) as { baseUrl?: string; paths?: Record<string, string[]> };
  const baseUrl = path.resolve(REPO_ROOT, co.baseUrl ?? ".");
  const alias: Alias[] = [];
  for (const [patron, destinos] of Object.entries(co.paths ?? {})) {
    const i = patron.indexOf("*");
    alias.push(
      i === -1
        ? { prefijo: patron, sufijo: "", destinos, comodin: false }
        : { prefijo: patron.slice(0, i), sufijo: patron.slice(i + 1), destinos, comodin: true },
    );
  }
  return { baseUrl, alias };
}

const TSCONFIG = leerTsconfig();

/** Los destinos posibles de un especificador ya mapeado, en orden de preferencia. */
function candidatos(base: string): string[] {
  const out: string[] = [];
  const m = /\.(js|mjs|cjs)$/.exec(base);
  if (m) {
    const sin = base.slice(0, -m[0].length);
    out.push(`${sin}.ts`, `${sin}.tsx`, `${sin}.mts`, `${sin}.cts`, `${sin}.d.ts`, base);
  } else if (/\.(ts|tsx|mts|cts|json)$/.test(base)) {
    out.push(base);
  } else {
    out.push(`${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.d.ts`, `${base}.json`, base);
  }
  // Apuntar a la CARPETA y dejar que resuelva el `index` es una forma más de
  // escribir el mismo import, y la versión BC no la veía.
  out.push(path.join(base, "index.ts"), path.join(base, "index.tsx"), path.join(base, "index.js"));
  return out;
}

function esArchivo(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Todo lo que un especificador NO relativo puede querer decir según `paths` + `baseUrl`. */
function mapeosNoRelativos(spec: string): string[] {
  const out: string[] = [];
  for (const a of TSCONFIG.alias) {
    if (a.comodin) {
      if (spec.length >= a.prefijo.length + a.sufijo.length && spec.startsWith(a.prefijo) && spec.endsWith(a.sufijo)) {
        const estrella = spec.slice(a.prefijo.length, spec.length - a.sufijo.length);
        for (const d of a.destinos) out.push(path.resolve(REPO_ROOT, d.replace("*", estrella)));
      }
    } else if (spec === a.prefijo) {
      for (const d of a.destinos) out.push(path.resolve(REPO_ROOT, d));
    }
  }
  // `baseUrl` sola: `import … from "src/shared/interfaces.js"` compila igual.
  out.push(path.resolve(TSCONFIG.baseUrl, spec));
  return out;
}

/**
 * A QUÉ ARCHIVO DEL PROYECTO apunta un especificador, o `undefined` si no apunta
 * a ninguno.
 *
 * `undefined` cubre los dos casos legítimos y NO los confunde con "permitido":
 * un paquete de `node_modules` (`vitest`, `typescript`, `node:fs`) y una cadena
 * que sólo PARECE un import — los archivos del analizador están llenos de
 * fixtures con `import java.util.List;` adentro de template literals, y el
 * scanner de TS los reporta cuando el fixture es TypeScript válido. Los dos
 * terminan sin archivo en disco.
 */
function resolverEspecificador(desdeArchivo: string, spec: string): string | undefined {
  const bases = spec.startsWith(".")
    ? [path.resolve(path.dirname(desdeArchivo), spec)]
    : mapeosNoRelativos(spec);
  for (const b of bases) for (const c of candidatos(b)) if (esArchivo(c)) return c;
  return undefined;
}

/**
 * Los especificadores REALES de un archivo, según el pre-procesador de
 * TypeScript: `import`, `export ... from`, `import()` dinámico y `require`.
 */
function importSpecifiers(file: string): string[] {
  const src = fs.readFileSync(file, "utf8");
  return ts
    .preProcessFile(src, /* readImportFiles */ true, /* detectJavaScriptImports */ true)
    .importedFiles.map((f) => f.fileName);
}

interface Violation {
  readonly file: string;
  readonly spec: string;
  readonly target: string;
}

/** El juicio, aislado de la lectura de disco: así el describe de las formas lo puede ejercitar. */
function violacionesDe(file: string, specs: readonly string[], allowed: ReadonlySet<string>): Violation[] {
  const bad: Violation[] = [];
  for (const spec of specs) {
    const target = resolverEspecificador(file, spec);
    if (target === undefined) continue;
    if (ENGINE_SET.has(target) || allowed.has(target)) continue;
    bad.push({ file: path.relative(REPO_ROOT, file), spec, target: path.relative(REPO_ROOT, target) });
  }
  return bad;
}

function violationsIn(files: readonly string[], allowed: ReadonlySet<string>): Violation[] {
  return files.flatMap((f) => violacionesDe(f, importSpecifiers(f), allowed));
}

const ALL = engineFiles();
const PRODUCTION = ALL.filter((f) => !f.endsWith(".test.ts"));
const TESTS = ALL.filter((f) => f.endsWith(".test.ts"));

/** Un archivo del motor cualquiera, para atribuirle los imports sintéticos del describe de abajo. */
const UN_ARCHIVO_DEL_MOTOR = path.join(REPO_ROOT, "src/server/services/census.ts");

describe("Ola BC — el motor de análisis no depende del tablero", () => {
  it("el manifiesto describe archivos que existen de verdad", () => {
    for (const f of ENGINE_FILES) {
      expect(fs.existsSync(path.join(REPO_ROOT, f)), `${f} no existe`).toBe(true);
    }
    for (const d of ENGINE_DIRS) {
      expect(fs.existsSync(path.join(REPO_ROOT, d)), `${d} no existe`).toBe(true);
    }
    // Si esto baja mucho, alguien sacó medio motor del manifiesto y la
    // compuerta pasó a proteger nada.
    expect(PRODUCTION.length).toBeGreaterThan(150);
  });

  it("EL CÓDIGO DE PRODUCCIÓN DEL MOTOR sólo importa el motor y la lista blanca", () => {
    const bad = violationsIn(PRODUCTION, ALLOWED);
    expect(
      bad,
      bad.length === 0
        ? ""
        : `El motor importa código de fuera del motor:\n${bad
            .map((v) => `  ${v.file}\n    import "${v.spec}"  ->  ${v.target}`)
            .join("\n")}\n\nSi el destino es del MOTOR, agregalo a engine/manifest.ts. Si es del TABLERO, el import está mal: el motor tiene que poder analizar un directorio sin que exista una tarea.`,
    ).toEqual([]);
  });

  it("LOS TESTS DEL MOTOR sólo suman `db/index.ts` (armar una base de juguete)", () => {
    const bad = violationsIn(TESTS, ALLOWED_TESTS);
    expect(
      bad,
      bad.length === 0
        ? ""
        : `Un test del motor importa código del tablero fuera de la concesión nombrada:\n${bad
            .map((v) => `  ${v.file}\n    import "${v.spec}"  ->  ${v.target}`)
            .join("\n")}`,
    ).toEqual([]);
  });

  it("la lista blanca de producción tiene UNA entrada, y es `shared/types.ts`", () => {
    // El valor de este test es que crecer la lista blanca cueste una edición
    // deliberada acá, no un import distraído en un archivo cualquiera.
    expect([...ALLOWED_EXTERNAL_MODULES]).toEqual(["src/shared/types.ts"]);
  });

  it("`shared/interfaces.ts` (Repositories, CodePageRequest, CodeInspectorService) NO es importable por el motor", () => {
    const target = path.join(REPO_ROOT, "src/shared/interfaces.ts");
    expect(fs.existsSync(target)).toBe(true);
    expect(ALLOWED.has(target)).toBe(false);
    expect(ENGINE_SET.has(target)).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * OLA BD — LAS FORMAS DE ESCRIBIR UN IMPORT DEL TABLERO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * POR QUÉ EXISTE ESTE BLOQUE. Los tres casos de arriba escanean el árbol tal
 * como está: hoy están verdes porque no hay ni un import prohibido, y de eso
 * NO se deduce que agarrarían el que venga mañana. Ésa es exactamente la
 * ilusión que la Ola BD vino a cerrar (y la tercera ola seguida con un test que
 * declaraba cubrir algo que no cubría: AX probaba seis de siete `required`, BA
 * paraba un eslabón antes del defecto).
 *
 * Acá el juicio se ejercita DIRECTO, con especificadores sintéticos atribuidos
 * a un archivo del motor real. Cada fila es una forma distinta de nombrar el
 * MISMO destino del tablero, y todas tienen que doler igual. **Con el
 * resolvedor de la Ola BC pasaban EN VERDE las filas 1, 2, 3, 4 y 7 — las dos
 * por alias, las dos por `baseUrl` y la que apunta a la carpeta.**
 */
const DEL_TABLERO: ReadonlyArray<readonly [forma: string, spec: string, destino: string]> = [
  ["alias `@shared/*` con extensión .js", "@shared/interfaces.js", "src/shared/interfaces.ts"],
  ["alias `@shared/*` sin extensión", "@shared/interfaces", "src/shared/interfaces.ts"],
  ["por `baseUrl`, desnudo", "src/shared/interfaces.js", "src/shared/interfaces.ts"],
  ["por `baseUrl`, a `db/index`", "src/server/db/index.js", "src/server/db/index.ts"],
  ["relativo con extensión .js", "../../shared/interfaces.js", "src/shared/interfaces.ts"],
  ["relativo sin extensión", "../../shared/interfaces", "src/shared/interfaces.ts"],
  ["relativo a la CARPETA (resuelve el index)", "../db", "src/server/db/index.ts"],
  ["relativo a `db/index` sin extensión", "../db/index", "src/server/db/index.ts"],
  ["relativo a `db/index.js`", "../db/index.js", "src/server/db/index.ts"],
  ["el traductor del tablero, en la MISMA carpeta", "./code-inspector.js", "src/server/services/code-inspector.ts"],
  ["el router HTTP", "../api/code.js", "src/server/api/code.ts"],
  ["la config del tablero", "../config.js", "src/server/config.ts"],
];

describe("Ola BD — la compuerta VE todas las formas de escribir el import prohibido", () => {
  it("el resolvedor lee los alias de verdad de `tsconfig.json`, no una copia escrita acá", () => {
    // Si `paths` desaparece del tsconfig, esto se pone rojo — en vez de dejar
    // el resolvedor cubriendo un alias que ya no existe y descubierto el que sí.
    expect(TSCONFIG.alias.length, "tsconfig.json ya no define `paths`").toBeGreaterThan(0);
    expect(TSCONFIG.alias.map((a) => a.prefijo)).toContain("@shared/");
    expect(resolverEspecificador(UN_ARCHIVO_DEL_MOTOR, "@shared/types.js")).toBe(
      path.join(REPO_ROOT, "src/shared/types.ts"),
    );
  });

  it.each(DEL_TABLERO)("ROJO: %s — `%s`", (_forma, spec, destino) => {
    const bad = violacionesDe(UN_ARCHIVO_DEL_MOTOR, [spec], ALLOWED);
    expect(bad.map((v) => v.target), `la compuerta NO vio \`import "${spec}"\` desde census.ts`).toEqual([destino]);
  });

  it("TODO módulo del tablero de `BOARD_MODULES` es visible por su ruta relativa", () => {
    const invisibles: string[] = [];
    for (const m of BOARD_MODULES) {
      const abs = path.join(REPO_ROOT, m);
      const rel = path.relative(path.dirname(UN_ARCHIVO_DEL_MOTOR), abs).replace(/\.ts$/, ".js");
      const spec = rel.startsWith(".") ? rel : `./${rel}`;
      if (violacionesDe(UN_ARCHIVO_DEL_MOTOR, [spec], ALLOWED).length === 0) invisibles.push(`${m} (via "${spec}")`);
    }
    expect(invisibles, `módulos del tablero que la compuerta no vería:\n  ${invisibles.join("\n  ")}`).toEqual([]);
  });

  it("VERDE: lo que NO es un import del tablero no se reporta", () => {
    const inocentes = [
      "node:fs",
      "node:path",
      "typescript",
      "vitest",
      "better-sqlite3",
      "../../shared/types.js", // la lista blanca
      "@shared/types.js", // la MISMA lista blanca, por alias
      "./census.js", // el motor mismo
      "./analyze-cache.js",
      "./no-existe-en-disco.js", // una cadena de fixture dentro de un template literal
      "java.util.List", // el fixture Java que casi engaña al verificador de la Ola BC
    ];
    expect(violacionesDe(UN_ARCHIVO_DEL_MOTOR, inocentes, ALLOWED)).toEqual([]);
  });
});
