/**
 * `repo-name-index.ts` — EL ÍNDICE DE TEXTO DEL REPO, y por qué esta ola lo
 * construye después de que cuatro detectores midieran por debajo del 20 %.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EL PROBLEMA, MEDIDO SOBRE EL BANCO Y NO SUPUESTO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `unused-symbol` (8,8 %), `orphan-file` (19,2 %), `unreachable-code` (16,7 %)
 * y `speculative-abstraction` (9,7 %) comparten UN modo de falla, el mismo en
 * los seis lenguajes: **CONSUMO POR NOMBRE**. Un decorador de Python
 * (`@cli.command()`), un `require` perezoso indexado por string
 * (`"no-sync": () => require("./no-sync")` en eslint), un `Dir[...].each {
 * require }` disparado desde un YAML de RuboCop, un `<template>` de Vue, una
 * acción de Stimulus escrita en una vista ERB, la reflexión de C#, una
 * fixture cargada por ruta. En los 159 falsos de `unused-symbol` juzgados a
 * mano, **143 tienen el nombre del símbolo escrito en algún byte del repo
 * fuera de su propia declaración** — o sea: la evidencia que los refuta
 * SIEMPRE estuvo en el árbol, y el analizador no la miraba.
 *
 * No la miraba por dos razones, las dos estructurales:
 *
 *  1. El grafo sólo ve los SEIS lenguajes con gramática. El YAML, el ERB, el
 *     `.hbs`, el `package.json`, el `tox.ini` y el `.rubocop.yml` no producen
 *     ni un nodo.
 *  2. `code-analyzer.ts#collectFiles` PODA el árbol de test entero
 *     (`isTestDirName`, D-TEST) antes de producir `FileFacts`. En `nest`, 12
 *     de 15 falsos de `unused-symbol` son símbolos usados SÓLO desde
 *     `test/`/`*.spec.ts` — invisibles por construcción.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA REGLA, Y POR QUÉ PASA LA PRUEBA DE `Extract Method`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La precondición que este índice vuelve verificable es:
 *
 *     «el nombre no aparece en NINGÚN byte del repositorio fuera del tramo de
 *      líneas de su propia declaración»
 *
 * Es (1) un HECHO del código, (2) VISIBLE en lo que el analizador carga — se
 * carga acá, es justamente el punto — y (3) suficiente para que sea un
 * PROBLEMA: si el identificador no está escrito en ningún lado, no hay
 * decorador, ni YAML, ni plantilla, ni reflexión que pueda alcanzarlo. Es la
 * misma clase de precondición que "esta función es larga y este bloque tiene
 * un nombre", no una opinión sobre el futuro.
 *
 * *** ES UNA COMPUERTA, NO UNA FUENTE DE VERDAD. *** Sólo puede APAGAR un
 * candidato, nunca encenderlo: un nombre que aparece en otro lado puede ser
 * una coincidencia léxica (`run`, `build`, `size`), y por eso el índice
 * responde "sí, aparece afuera" ⇒ **no lo reportes**, y "no aparece" ⇒ *el
 * detector sigue con sus otras puertas*. En la dirección en que se usa, un
 * falso positivo del índice (coincidencia léxica) sólo puede CALLAR un
 * hallazgo, nunca inventar uno.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ SE LEE Y QUÉ NO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Se lee TODO archivo de texto del repo, incluidos los que el análisis poda:
 * el árbol de test, los dotfiles, `docs/`, las plantillas, los `.yml`. Ésa es
 * la mitad del valor. Se saltan sólo los directorios que escribe una
 * herramienta de paquetes (`SKIP_DIRS_TEXTO`, el mismo criterio que
 * `code-analyzer.ts#SKIP_DIRS`: lo que hay adentro no lo escribió este
 * proyecto), los archivos binarios (byte nulo en los primeros 8 KB) y los
 * archivos de más de `MAX_BYTES_ARCHIVO`.
 *
 * Costo: UNA pasada de bytes por repo, perezosa (sólo si un detector la
 * pide), memoizada por `RepoUnit` con un `WeakMap` — los dos detectores que
 * la usan comparten una sola construcción por corrida.
 *
 * NADA DE VOCABULARIO POR LENGUAJE. El tokenizador es
 * `[A-Za-z_][A-Za-z0-9_]*`, la intersección de las seis gramáticas. Los
 * sufijos de predicado de Ruby (`osx?`, `save!`) y los `=` de asignación se
 * NORMALIZAN en la CONSULTA (`normalizeName`), no en el índice: buscar `osx`
 * en vez de `osx?` sólo puede encontrar MÁS ocurrencias, o sea callar más —
 * la dirección segura. El mismo criterio para los nombres calificados
 * (`DeviseOverrides::SessionsController` ⇒ `SessionsController`): se consulta
 * el último segmento.
 */
import fs from "node:fs";
import path from "node:path";

import type { RepoUnit } from "../types.js";

/** Un tramo de líneas de UN archivo: la declaración cuyas propias menciones no cuentan. */
export interface DeclSpan {
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
}

/**
 * Los mismos directorios que `code-analyzer.ts#SKIP_DIRS` — el criterio es
 * "lo escribe una herramienta, no el proyecto". **NO se replica acá la poda
 * de árbol de test**: leer el test es exactamente lo que este índice viene a
 * agregar.
 */
/**
 * *** LA LISTA ES CORTA A PROPÓSITO, Y ESO ES UN ARREGLO MEDIDO. *** La primera
 * versión de este módulo copiaba `code-analyzer.ts#SKIP_DIRS` entera. Está mal
 * para un índice de TEXTO, y produjo falsos positivos en la primera corrida:
 * `SKIP_DIRS` contiene `deps` (por Mix/Elixir) y **hugo tiene un paquete Go
 * llamado `deps/`** — así que `resources.NewSpec` y `hugofs.NewHasBytesReceiver`,
 * los dos llamados desde `deps/deps.go:270` y `:226`, aparecían como "el nombre
 * no está escrito en ningún lado". Lo mismo acecha con `out`, `obj`, `build`,
 * `target`, `public`, `storage` y `lib`, que son nombres de paquete perfectamente
 * normales.
 *
 * Para el ANÁLISIS, saltear de más cuesta cobertura. Para este ÍNDICE cuesta
 * CORRECCIÓN, y en la dirección peligrosa: un directorio no leído es evidencia
 * no vista, o sea un hallazgo INVENTADO. Por eso acá sólo se saltean los
 * directorios que contienen copias de paquetes instalados por una herramienta,
 * donde el texto no lo escribió este proyecto. `vendor` NO está: vendorizar es
 * copiar código que sí puede usar un símbolo del proyecto, y leerlo sólo puede
 * CALLAR un hallazgo.
 */
const SKIP_DIRS_TEXTO: ReadonlySet<string> = new Set([
  ".git", "node_modules", "__pycache__", ".venv", "venv",
  "site-packages", "dist-packages", "bower_components", "jspm_packages", "web_modules",
]);

/** Techo por archivo: un `.min.js` vendorizado o un dump de datos no aporta señal y sí costo. */
const MAX_BYTES_ARCHIVO = 4_000_000;
/** Techo por repo, defensivo: ningún repo del corpus se acerca (el peor, `jenkins`, ronda los 400 MB de texto). */
const MAX_ARCHIVOS = 200_000;

const TOKEN = /[A-Za-z_][A-Za-z0-9_]*/g;
/** Segmento final de una ruta escrita como texto, sin extensión: `./no-sync` ⇒ `no-sync`, `"eslintrc-plugins"` ⇒ `eslintrc-plugins`. */
const RUTA = /[A-Za-z0-9_][A-Za-z0-9_./\\-]*/g;

/**
 * Normaliza un nombre DECLARADO a la forma con la que se lo busca en el
 * índice: último segmento calificado, sin sufijo de predicado/asignación de
 * Ruby, sin genéricos. Ver el docstring del módulo: normalizar acá sólo puede
 * encontrar MÁS ocurrencias, y más ocurrencias ⇒ menos hallazgos.
 */
export function normalizeName(name: string): string {
  let n = name.trim();
  const lt = n.indexOf("<");
  if (lt > 0) n = n.slice(0, lt);
  for (const sep of ["::", ".", "#", "\\"]) {
    const i = n.lastIndexOf(sep);
    if (i >= 0) n = n.slice(i + sep.length);
  }
  return n.replace(/[?!=]+$/, "");
}

export interface RepoNameIndex {
  /** Archivos de texto leídos. `0` ⇒ el índice no pudo leer nada: toda consulta responde "aparece afuera" (compuerta inerte). */
  readonly filesRead: number;
  /**
   * ¿El identificador aparece escrito en algún byte del repo FUERA de los
   * tramos dados? `true` también cuando el índice está vacío o el nombre es
   * inconsultable (vacío, anónimo) — la respuesta conservadora es siempre
   * "sí, alguien podría estar usándolo".
   */
  usedOutside(name: string, spans: readonly DeclSpan[]): boolean;
  /** ¿Esta clave de ruta (`no-sync`, `resource`, `conf`) aparece escrita como texto en algún archivo distinto de `exceptFile`? */
  pathMentioned(key: string, exceptFile: string): boolean;
  /**
   * LA FORMA DE LA DECLARACIÓN, leída de los renglones del propio archivo — la
   * razón por la que "nadie escribe este nombre" NO alcanza. Devuelve el motivo
   * por el que el NOMBRE de esta declaración no es su manija, o `null` si lo es.
   * Ver `SHAPE_REASONS` para el porqué de cada uno, cada uno con el caso real
   * que lo motivó.
   */
  nameIsNotTheHandle(file: string, startLine: number, endLine: number): string | null;
}

interface Sitio {
  readonly file: string;
  readonly line: number;
}

const INERTE: RepoNameIndex = {
  filesRead: 0,
  usedOutside: () => true,
  pathMentioned: () => true,
  nameIsNotTheHandle: () => null,
};

const CACHE = new WeakMap<RepoUnit, RepoNameIndex>();

/**
 * El índice de ESTA corrida para ESTE `RepoUnit`, construido a lo sumo una
 * vez y compartido entre los detectores que lo pidan. Sin `repo.dir` (todo
 * test que arma un `RepoUnit` literal, y cualquier productor que no lo pase)
 * devuelve el índice INERTE: la compuerta no se aplica y el detector se
 * comporta EXACTAMENTE como antes de esta ola. AUSENTE ≠ vacío.
 */
export function repoNameIndex(repo: RepoUnit): RepoNameIndex {
  const cached = CACHE.get(repo);
  if (cached) return cached;
  const dir = (repo as { dir?: string }).dir;
  const idx = dir ? build(dir) : INERTE;
  CACHE.set(repo, idx);
  return idx;
}

function build(dir: string): RepoNameIndex {
  const sitios = new Map<string, Sitio[]>();
  /** Nombres con demasiadas apariciones: se deja de guardar sitios y se marca "usado en todos lados". */
  const saturados = new Set<string>();
  const rutas = new Map<string, Set<string>>();
  let filesRead = 0;

  const MAX_SITIOS = 64;

  const walk = (rel: string): void => {
    if (filesRead >= MAX_ARCHIVOS) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP_DIRS_TEXTO.has(e.name)) continue;
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(child);
        continue;
      }
      if (!e.isFile()) continue;
      let text: string;
      try {
        const st = fs.statSync(path.join(dir, child));
        if (st.size > MAX_BYTES_ARCHIVO || st.size === 0) continue;
        const buf = fs.readFileSync(path.join(dir, child));
        if (buf.subarray(0, 8192).includes(0)) continue; // binario
        text = buf.toString("utf8");
      } catch {
        continue;
      }
      filesRead++;
      let line = 1;
      let lastNl = -1;
      // Una sola pasada de tokens; la línea se deriva contando saltos entre
      // token y token (más barato que partir el archivo en líneas).
      TOKEN.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = TOKEN.exec(text)) !== null) {
        const at = m.index;
        for (let i = lastNl + 1; i < at; i++) if (text.charCodeAt(i) === 10) line++;
        lastNl = at - 1;
        const name = m[0];
        if (saturados.has(name)) continue;
        let arr = sitios.get(name);
        if (!arr) {
          arr = [];
          sitios.set(name, arr);
        }
        if (arr.length >= MAX_SITIOS) {
          saturados.add(name);
          sitios.delete(name);
          continue;
        }
        arr.push({ file: child, line });
      }
      RUTA.lastIndex = 0;
      let r: RegExpExecArray | null;
      while ((r = RUTA.exec(text)) !== null) {
        const tok = r[0];
        const slash = Math.max(tok.lastIndexOf("/"), tok.lastIndexOf("\\"));
        let seg = slash >= 0 ? tok.slice(slash + 1) : tok;
        const dot = seg.indexOf(".");
        if (dot > 0) seg = seg.slice(0, dot);
        if (seg.length < 2) continue;
        let set = rutas.get(seg);
        if (!set) {
          set = new Set();
          rutas.set(seg, set);
        }
        if (set.size < 8) set.add(child);
      }
    }
  };

  walk("");

  if (filesRead === 0) return INERTE;

  return {
    filesRead,
    usedOutside(name, spans) {
      const n = normalizeName(name);
      if (n.length === 0 || !/^[A-Za-z_]/.test(n)) return true;
      if (saturados.has(n)) return true;
      const arr = sitios.get(n);
      if (!arr) return false; // ni siquiera su propia declaración: el índice no vio el archivo ⇒ nada afuera
      for (const s of arr) {
        let dentro = false;
        for (const sp of spans) {
          if (sp.file === s.file && s.line >= sp.startLine && s.line <= sp.endLine) {
            dentro = true;
            break;
          }
        }
        if (!dentro) return true;
      }
      return false;
    },
    nameIsNotTheHandle(file, startLine, endLine) {
      return shapeReason(dir, file, startLine, endLine);
    },
    pathMentioned(key, exceptFile) {
      const set = rutas.get(key);
      if (!set) return false;
      for (const f of set) if (f !== exceptFile) return true;
      return false;
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * LA FORMA DE LA DECLARACIÓN — la segunda mitad del arreglo
 *
 * La compuerta de texto responde "nadie escribe este nombre". Eso NO alcanza,
 * y la medición dice exactamente por qué: hay declaraciones cuyo NOMBRE NO ES
 * SU MANIJA. Nadie las nombra porque a nadie le hace falta nombrarlas — las
 * alcanza otra cosa. Los seis casos de abajo salieron de abrir, uno por uno,
 * los sobrevivientes de la compuerta en ocho repos; cada uno trae el caso real
 * que lo motivó, y ninguno es vocabulario de dominio: son formas de las seis
 * gramáticas.
 *
 * Se lee el ARCHIVO, no el árbol, por una razón concreta: `CodeGraphNode` no
 * lleva ni anotaciones, ni `export default`, ni `declare`, ni si la
 * declaración es una propiedad de objeto literal. Cuando el grafo lleve esos
 * hechos, esta función se reemplaza por su lectura; hasta entonces, el renglón
 * es la única fuente que existe y es un HECHO igual de verificable (se abre el
 * archivo y se mira).
 * ──────────────────────────────────────────────────────────────────────── */

/** Prefijos de comentario de las seis gramáticas: un renglón así no corta un bloque de anotaciones. */
const COMENTARIO = ["//", "/*", "*", "#", "--", "<!--"];

/**
 * Vocabulario de GRAMÁTICA (no de dominio): las palabras con las que las seis
 * gramáticas introducen una DECLARACIÓN CON NOMBRE. Un renglón de declaración
 * que no tiene NINGUNA no es una declaración: es una PROPIEDAD de un objeto
 * literal — `module.exports = ruleExtender(x, { reportOverrides(meta, ctx) {…} })`
 * en `eslint/tools/internal-rules/multiline-comment-style.js:18`,
 * `{ setupNodeEvents(on, config) {…} }` en `eslint/cypress.config.js:11`,
 * `{ excludeThis(arr, url) {…} }` en `eslint/docs/src/_data/helpers.js:24`, los
 * tres juzgados FALSOS. Su nombre es una CLAVE, consumida por acceso a
 * propiedad, que es justo lo que el grafo no resuelve. Es la misma familia que
 * `<anon@N>`, y es el caso que el propio docstring de `unused-symbol` nombra
 * desde la Ola O (`export const detector = { run(repo, ctx) {…} }`).
 */
const PALABRA_DE_DECLARACION =
  /\b(function|def|class|func|interface|type|const|let|var|struct|enum|module|trait|impl|record|delegate|namespace|public|private|protected|internal|static|abstract|override|final|sealed|export|package)\b|=>/;

const CACHE_LINEAS = new Map<string, readonly string[]>();

function lineasDe(dir: string, file: string): readonly string[] {
  const clave = `${dir}\u0000${file}`;
  const hit = CACHE_LINEAS.get(clave);
  if (hit) return hit;
  let out: readonly string[] = [];
  try {
    out = fs.readFileSync(path.join(dir, file), "utf8").split("\n");
  } catch {
    out = [];
  }
  if (CACHE_LINEAS.size > 4096) CACHE_LINEAS.clear();
  CACHE_LINEAS.set(clave, out);
  return out;
}

function esComentario(t: string): boolean {
  return COMENTARIO.some((c) => t.startsWith(c));
}

function shapeReason(dir: string, file: string, startLine: number, endLine: number): string | null {
  // (1) ARCHIVO DE DECLARACIÓN DE TIPOS. Un `.d.ts` no tiene NINGUNA
  //     representación en tiempo de ejecución: describe la superficie de tipos
  //     que consumen paquetes de afuera. Caso: los seis de `preact/src/*.d.ts`
  //     (`PathAttributes`, `DevSource`, `DevtoolsEvent`…), todos falsos.
  if (file.endsWith(".d.ts")) return "archivo de declaración de tipos";

  const lineas = lineasDe(dir, file);
  if (lineas.length === 0) return null;
  const propia = lineas[startLine - 1] ?? "";
  const t = propia.trim();

  // (2) DECLARACIÓN DE AMBIENTE (`declare`): describe algo que existe AFUERA.
  //     Caso: `export declare class KafkaJSStaleTopicMetadataAssignment` en
  //     `nest/packages/microservices/external/kafka.interface.ts:1206`, dentro
  //     de la copia a mano de los tipos de kafkajs. Falso.
  if (/\bdeclare\b/.test(t)) return "declaración de ambiente";

  // (3) TIPO PURO (`interface`, alias de `type`): se borra al compilar, y sus
  //     únicos sitios de uso son posiciones de TIPO, que la cascada no
  //     resuelve. Caso: las ocho interfaces públicas de nest
  //     (`OnGatewayConnection`, `WebSocketServerOptions`,
  //     `IClientPublishOptions`…), todas falsas en el banco.
  //     COSTO DECLARADO: se pierde `MessageRequestProperties` (nest), que el
  //     banco juzgó VERDADERA. Un verdadero a cambio de ocho falsos.
  if (/\binterface\b/.test(t) || /^(export\s+)?type\s+\w+\s*[=<]/.test(t)) return "tipo puro";

  // (4) EXPORTACIÓN POR DEFECTO: quien la importa elige el nombre, así que el
  //     nombre declarado NO es la manija. Casos: los cuatro `demo/*.jsx` de
  //     preact (`export default function ZustandComponent()`), y el
  //     `EmojiPicker` de Ghost que el banco ya tenía juzgado falso con esta
  //     misma razón escrita a mano.
  if (propia.includes("export default")) return "exportación por defecto";

  // (5) EXPRESIÓN CON NOMBRE: `Module._resolveFilename = function resolveFilename(…)`
  //     (`nest/integration/_support/register-local-packages.ts:38`). El nombre
  //     existe para la traza de pila; la manija es la asignación. Falso.
  const iFn = propia.indexOf("function");
  if (iFn > 0 && propia.slice(0, iFn).includes("=")) return "expresión con nombre";

  // (6) PROPIEDAD DE OBJETO LITERAL — ver `PALABRA_DE_DECLARACION`.
  if (t.length > 0 && !PALABRA_DE_DECLARACION.test(propia)) return "propiedad de objeto literal";

  // (7) ANOTACIÓN/DECORADOR sobre la declaración: `@cli.command()` de Click,
  //     `@Module({…})` de Nest, `[AttributeUsage(…)]` de C#. La anotación ES el
  //     registro: un framework consume el símbolo por reflexión, sin nombrarlo.
  //     Casos: los cinco comandos de `click/examples/*` y los tres
  //     `*Attribute` de `newtonsoft-json/Utilities/NullableAttributes.cs`.
  //     El bloque se recorre hacia arriba y CORTA en el primer renglón en
  //     blanco: sin ese corte, un `@ivar = …` de Ruby en el método de arriba se
  //     confundía con un decorador (medido: apagaba `sass_path`,
  //     `parse_content` y `dispatch` de jekyll por la razón equivocada).
  for (let i = startLine - 1; i >= 0 && startLine - i <= 32; i--) {
    const r = (lineas[i] ?? "").trim();
    if (r.length === 0) break;
    if (esComentario(r)) {
      // DIRECTIVA DE HERRAMIENTA dentro de un comentario. Una máquina lee ese
      // renglón y consume el símbolo por él, sin escribir su nombre nunca.
      // Medido, y es el segundo apagón más grande de la ola después de Rails:
      // `gitea/routers/api/v1/swagger/` declara 27 tipos `swaggerResponse*`,
      // cada uno precedido por `// swagger:response User`, y go-swagger los lee
      // de ahí — los 27 falsos, y `gitea` pasa de 29 propuestas a 1. También
      // cubre `//lint:ignore U1000 useful for debugging` sobre
      // `hugo/hugolib/filesystems/basefs.go:872`, donde el AUTOR declaró por
      // escrito que el símbolo no se usa a propósito: reportarlo es ruido
      // aunque el hecho sea cierto.
      //
      // La forma es `palabra:palabra` SIN espacio y empezando en minúscula
      // (`swagger:response`, `go:build`, `nolint:all`, `lint:ignore`,
      // `pylint:disable`), que es la convención de directiva de las seis
      // gramáticas. El espacio la distingue de la prosa: `Note: this…` no
      // matchea, `swagger:response` sí.
      const contenido = r.replace(/^[/*#<!-]+/, "").trim();
      if (/^[a-z][\w.-]*(:[\w.-]+|-(disable|ignore|enable)\b)/.test(contenido)) return "directiva de herramienta en comentario";
      continue;
    }
    const cabeza = r.split("(")[0] ?? "";
    if (r.startsWith("@") && !cabeza.includes("=")) return "declaración anotada";
    if (r.startsWith("[") && r.endsWith("]")) return "declaración anotada";
  }

  // (8) LLAMA A `super`: el símbolo REDEFINE un miembro heredado, así que quien
  //     lo invoca es el dueño del contrato — la clase base, que puede vivir
  //     fuera del repo. `super` es la misma palabra en las seis gramáticas.
  //     Casos: `dispatch` de `jekyll/lib/jekyll/commands/serve/websockets.rb:42`
  //     (redefine el de EventMachine) y `search_index_file` de
  //     `servlet.rb:142` (redefine el de `WEBrick::HTTPServlet::FileHandler`),
  //     los dos falsos.
  //
  //     *** SÓLO PARA MIEMBROS, y es un arreglo medido. *** El constructor de
  //     TODA subclase llama a `super`, así que aplicar la regla también a una
  //     CLASE apaga cualquier clase derivada muerta. Medido: apagaba
  //     `InvalidMiddlewareConfigurationException`
  //     (`nest/packages/core/errors/exceptions/…`), que está en el snapshot de
  //     recall (`tests/golden/precision/recall/nest.recall.json`) como
  //     VERDADERA — o sea, habría puesto rojo el guardián.
  if (!/\b(class|struct|record|interface)\b/.test(propia)) {
    const cuerpo = lineas.slice(startLine - 1, endLine).join("\n");
    if (/\bsuper\b/.test(cuerpo)) return "redefine un miembro heredado";
  }

  return null;
}
