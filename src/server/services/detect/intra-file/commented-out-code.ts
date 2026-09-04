/**
 * `commented-out-code` — CÓDIGO COMENTADO (Ola AU, frente AU6).
 *
 * Uno de los DOS detectores que le faltaban al catálogo canónico de 22 code
 * smells: *Comments*. El smell de Fowler tiene dos formas y este detector
 * construye UNA sola, a propósito:
 *
 *   1. **CÓDIGO COMENTADO** — líneas que son código del lenguaje y están
 *      dentro de un comentario. Precondición SINTÁCTICA: se verifica abriendo
 *      el archivo, y el remedio no admite discusión (borrarlo: el historial
 *      de versiones ya lo guarda). ESTA es la que se construye.
 *   2. **El comentario que explica código malo** — "si necesitás un
 *      comentario para explicar qué hace este bloque, extraé un método".
 *      NO se construye: decidir que un comentario "explica código malo" es
 *      una opinión sobre el texto, no un hecho del árbol, y repetiría el
 *      17,9 % de precisión de los patrones (Ola AS: *la precondición tiene
 *      que ser (1) un HECHO, (2) VISIBLE EN LO QUE EL ANALIZADOR CARGA y (3)
 *      suficiente para que sea un PROBLEMA y no sólo una FORMA*).
 *
 * ────────────────────────────────────────────────────────────────────────
 * LA FORMA QUE SE BUSCA — un BLOQUE contiguo de comentario que es TODO código
 * ────────────────────────────────────────────────────────────────────────
 *
 * El disparo NO es "esta línea parece código". Es más exigente, y la
 * exigencia es exactamente lo que separa este detector de un contador de
 * comentarios:
 *
 *   (a) un BLOQUE de filas contiguas ocupadas ÍNTEGRAMENTE por comentario
 *       (nada de código real a la izquierda ni a la derecha de la fila:
 *       un `foo(); // nota` no participa);
 *   (b) al menos `lineasDeCodigo` de esas filas tienen forma de SENTENCIA
 *       (ver `STRONG_SHAPES`);
 *   (c) y **NINGUNA fila del bloque es prosa**. Cero. Un bloque mixto
 *       —una línea de explicación y tres de código— NO dispara.
 *
 * La condición (c) es la que hace que el número sea alto, y no es un umbral
 * elegido por gusto: es la única compuerta barata que separa CÓDIGO
 * COMENTADO de **EJEMPLO DE USO EN LA DOCUMENTACIÓN**, que es el falso
 * positivo dominante de esta forma y el que hundiría la precisión. Un
 * ejemplo de uso vive dentro de un docblock que ADEMÁS explica algo en
 * castellano/inglés; código comentado no explica nada, es código y nada más.
 *
 * ────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO SE RE-PARSEA (y qué se hace en su lugar)
 * ────────────────────────────────────────────────────────────────────────
 *
 * La definición literal de la forma es *"parsea como código del lenguaje"*, y
 * la implementación literal sería volver a parsear el texto del comentario
 * con la misma gramática. No se puede, y la razón es de contrato, no de
 * gusto: `detect/types.ts` dice, textual, *"Ningún detector re-parsea ni
 * re-lee disco: si algo no está en este nodo, no está disponible en esta
 * granularidad"*, y `IntraFileDetector.run` es SÍNCRONO mientras que cargar
 * una gramática (`Parser.init` + `Language.load`) es asíncrono. Un detector
 * que quisiera parsear tendría que exportar el caché de parsers de
 * `code-analyzer.ts` — un archivo compartido que esta ola no toca.
 *
 * Lo que se hace en su lugar es una gramática de SENTENCIA de un solo token
 * de ancho, aplicada IDÉNTICAMENTE a los seis lenguajes: terminador de
 * sentencia, asignación, llamada completa con paréntesis balanceados,
 * apertura de bloque después de una lista de parámetros, y línea de puro
 * delimitador de cierre. Ninguna de las cinco nombra un lenguaje ni una
 * palabra clave: son signos de puntuación y la forma `identificador
 * (.|::|->) identificador`. Es DELIBERADAMENTE más angosta que un parser —
 * pierde `return foo` sin punto y coma, pierde una condición suelta, pierde
 * el `<div>` comentado de un `.vue` — y esa angostura se paga en recall, no
 * en precisión, que es el lado correcto donde equivocarse.
 *
 * ────────────────────────────────────────────────────────────────────────
 * GENERICIDAD — qué listas de texto hay acá y por qué cada una es legítima
 * ────────────────────────────────────────────────────────────────────────
 *
 * Precedente que hay que no repetir: `SELF_PREFIX = /^(?:self\.|this\.|@)/`
 * en `state.ts` dejó a Go MUDO en cuatro anclas durante varias olas. Acá hay
 * exactamente TRES listas de texto, y ninguna es de un lenguaje:
 *
 *   · `MARKER_PREFIX`/`MARKER_SUFFIX` — los sigilos con los que las
 *     gramáticas ABREN y CIERRAN un comentario (`//`, `/*`, `*`, `#`,
 *     `<!--`). Es vocabulario de GRAMÁTICA, la misma clase que
 *     `code-grammar.ts` ya declara permitida (`LOOP_WORD`, `SWITCH_WORD`).
 *     Cubre los seis lenguajes con los mismos cinco sigilos, no uno por
 *     lenguaje.
 *   · `DOC_MARKER` — los sigilos de comentario de DOCUMENTACIÓN (`/**`,
 *     `///`, `//!`, `#'`). Misma clase, y la convención es compartida entre
 *     Java/C#/JS/TS/Rust, no propia de uno.
 *   · `PROSE_TAG` — las marcas de PROSA que ningún lenguaje define pero
 *     todos los comentarios del mundo usan (`@param`, `TODO`, `Copyright`,
 *     una URL, un `>>>` de doctest). Es vocabulario de COMENTARIO, aplicado
 *     idénticamente a los seis. Sólo VETA: nunca hace disparar nada, así que
 *     un idioma que no esté en la lista no puede producir un falso positivo
 *     por ausencia — puede, a lo sumo, no evitarlo.
 *
 * Nada acá lee `ctx.language` ni `file.language`. El detector es agnóstico
 * de lenguaje por construcción: sólo mira nodos cuyo tipo contiene la
 * palabra `comment` (que las seis gramáticas nombran así — la misma
 * convención que `temporary-field.ts#COMMENT_NODE_TYPE` ya usa) y el texto
 * fuente que `AstNode.text` ya trae.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LO QUE NO ES — las exclusiones, cada una con su razón
 * ────────────────────────────────────────────────────────────────────────
 *
 *   - **Comentario al final de una línea de código** (`foo(); // ver #123`).
 *     La fila tiene código real: no es un bloque de comentario. Se excluye
 *     mirando el texto de la fila a la izquierda del nodo, no adivinando.
 *   - **Docblock con ejemplo de uso.** Tiene prosa ⇒ condición (c).
 *   - **Encabezado de licencia.** Es prosa ⇒ condición (c), y además
 *     `PROSE_TAG` lo veta explícitamente.
 *   - **Bloque abierto con sigilo de documentación** (`/**`, `///`). Aunque
 *     todas sus filas pasaran la gramática de sentencia, un docblock es una
 *     API documentada, no código apagado. Se veta.
 *   - **Una sola línea.** `lineasDeCodigo` pide DOS: un `// x = 1` suelto es
 *     tan probablemente una nota como código apagado, y a esa escala el
 *     volumen se vuelve el problema (ver `MAX_FINDINGS_SPEC`).
 *
 * PATRÓN/REMEDIO: ninguno. El remedio de código comentado es BORRARLO, y por
 * eso este detector — a diferencia de los catorce smells que se detectan sin
 * saber qué recomendar — nace con su remedio resuelto en el propio `advice`:
 * no necesita una hipótesis de refactorización colgada encima.
 */
import { pisoDeclarado, presupuesto } from "../thresholds.js";
import type { AstNode, FileUnit, IntraFileDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "lineasDeCodigo";

/** La misma convención que `temporary-field.ts#COMMENT_NODE_TYPE`: las seis gramáticas nombran `comment` a su nodo de comentario. */
const COMMENT_NODE_TYPE = /comment/i;

/** Sigilos de APERTURA de comentario — vocabulario de gramática, compartido por los seis lenguajes. */
const MARKER_PREFIX = /^\s*(?:\/\/+!?|\/\*+|\*+\/?|#+|<!--+)\s?/;
/** Sigilos de CIERRE. */
const MARKER_SUFFIX = /\s*(?:\*\/|-->)\s*$/;
/** Sigilo de comentario de DOCUMENTACIÓN: un docblock es una API documentada, nunca código apagado. */
const DOC_MARKER = /^\s*(?:\/\*\*|\/\/\/|\/\/!|#')/;
/**
 * LA FILA CON ASTERISCO — la firma del bloque en ESTILO DOCUMENTACIÓN, y una
 * de las compuertas que más falsos saca por su cuenta (medido: siete de
 * veintitrés sobre los 21 repos).
 *
 * Un `/*` cuyas filas interiores arrancan con `*` es un bloque escrito para
 * ser leído: quien apaga código con un `/*` no vuelve a pasar poniéndole un
 * asterisco a cada fila. Y lo que aparece adentro de un bloque así, aunque
 * tenga forma de sentencia, es un EJEMPLO — los tres bloques de `eslint`
 * (`var {a} = foo;` / `fix const { a: { b } } = foo;`) documentan qué arregla
 * el fixer, no son código apagado.
 *
 * La fila de CIERRE (exactamente `*` + `/`) no cuenta: la tiene todo bloque,
 * incluidos los que sí apagan código.
 */
const STARRED_ROW = /^\*(?!\/)/;

/** Ruby abre y cierra su comentario de bloque con estas dos filas, que no son ni código ni prosa. */
const RUBY_BLOCK_FENCE = /^=(?:begin|end)\b/;

/**
 * Marcas de PROSA — vocabulario de COMENTARIO (no de lenguaje), aplicado
 * idénticamente a los seis. Sólo VETA, nunca dispara.
 */
const PROSE_TAG =
  /(?:https?:\/\/|www\.|(?:^|\s)@[A-Za-z]\w*|:param\b|:returns?\b|:rtype\b|\bTODO\b|\bFIXME\b|\bXXX\b|\bHACK\b|\bNOTE\b|\bNOTA\b|\bCopyright\b|\bSPDX\b|\bLicen[sc]e[ds]?\b|\bDeprecated\b|>>>|```|#\s*=>|\be\.g\.|\bi\.e\.|\betc\.|\bp\.ej\.)/i;

/* ── la gramática de SENTENCIA, de un solo token de ancho ────────────────── */

const IDENT = String.raw`[A-Za-z_$@][A-Za-z0-9_$]*`;
/** `foo`, `foo.bar`, `Foo::bar`, `p->q`, `xs[0].y` — receptor calificado, sin ninguna palabra clave. */
const RECEIVER = String.raw`${IDENT}(?:\s*(?:\.|::|->)\s*${IDENT}|\[[^\[\]]{0,60}\])*`;

/** Termina en punto y coma: ninguna de las seis gramáticas termina una frase en prosa así. */
const ENDS_STATEMENT = /;\s*$/;
/** Asignación real (nunca `==`, `=>`, `=~`). */
const ASSIGN = new RegExp(String.raw`^${RECEIVER}\s*(?::=|\+=|-=|\*=|/=|%=|\|\|=|&&=|\?\?=|<<=|>>=|=(?![=>~]))\s*\S`);
/**
 * La línea ENTERA es una llamada — SIN espacio entre el receptor y el
 * paréntesis. El espacio es el discriminador, y está medido: `DEFAULT ('value'
 * | CURRENT_TIMESTAMP...)`, `STORAGE (DISK|MEMORY)`, `Attributes (e.g. CSS
 * classes)` y `right top (3)` son prosa con un paréntesis; `buffer.fill(x)` y
 * `fmt.Println(stack())` son llamadas. Ninguno de los seis lenguajes obliga a
 * escribir el espacio y prácticamente ningún estilo real lo usa.
 */
const CALL_LINE = new RegExp(String.raw`^${RECEIVER}\(.*\)\s*[;,]?\s*$`);
/** Lista de parámetros seguida de apertura de bloque: `func f(a int) {`, `def foo(a):`. */
const DECL_OPEN = /\([^()]*\)\s*(?:->\s*[^\s]+\s*)?[:{]\s*$/;
/** La línea es puro delimitador de cierre/apertura: `}`, `});`, `],`. */
const DELIM_ONLY = /^[)}\]{,;]+\s*$/;

/** Un cierre seguido de una apertura: `} else {`, `} catch (e) {`, `}).then(x => {`. Arranca con delimitador, así que ninguna frase en prosa entra. */
const CLOSE_THEN_OPEN = /^[)}\]]+[^;]*[{:]\s*$/;

/**
 * OJO — el campo se llama `shape`, no `id`, A PROPÓSITO (Ola AU, guardián):
 * `registries.test.ts#ID_RE` escanea el archivo por el PRIMER `id: "..."`
 * literal que encuentra para identificar el detector, y estos cinco
 * literales locales aparecen ANTES que el `id: "commented-out-code"` real
 * del detector (más abajo). Con el campo llamado `id` acá, el escáner
 * confundía este archivo con un detector de id `"terminador"` y lo
 * reportaba como no registrado aunque `commented-out-code` SÍ lo estuviera.
 * Renombrar es puramente cosmético — no cambia ninguna decisión de emisión.
 */
const STRONG_SHAPES: readonly { readonly shape: string; readonly test: (line: string) => boolean }[] = [
  { shape: "terminador", test: (l) => ENDS_STATEMENT.test(l) },
  { shape: "asignacion", test: (l) => ASSIGN.test(l) },
  { shape: "llamada", test: (l) => CALL_LINE.test(l) },
  { shape: "apertura-de-bloque", test: (l) => DECL_OPEN.test(l) && l.includes("(") },
  { shape: "delimitador", test: (l) => DELIM_ONLY.test(l) || CLOSE_THEN_OPEN.test(l) },
];

/** Paréntesis/corchetes/llaves balanceados en el bloque entero: prosa con un cierre suelto no pasa. */
function balanced(lines: readonly string[]): boolean {
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const counts: Record<string, number> = { "(": 0, "[": 0, "{": 0 };
  for (const line of lines) {
    for (const ch of line) {
      if (ch === "(" || ch === "[" || ch === "{") counts[ch]!++;
      else if (ch === ")" || ch === "]" || ch === "}") counts[pairs[ch]!]!--;
    }
  }
  return counts["("] === 0 && counts["["] === 0 && counts["{"] === 0;
}

/** La forma de sentencia que reconoce esta fila, o `null` si ninguna. */
function shapeOf(line: string): string | null {
  for (const s of STRONG_SHAPES) if (s.test(line)) return s.shape;
  return null;
}

/**
 * PUNTUACIÓN DE CÓDIGO — la que ninguna frase en prosa usa. Deliberadamente
 * ANGOSTA: `*`, `/`, `+`, `-`, `|` y `&` aparecen en prosa todo el tiempo
 * (`above/below/left/right`, `config/locales/*.rb`, `a - b`), así que
 * contarlos como "esto es código" dejaba pasar frases enteras.
 */
const CODE_PUNCT = /[;{}()[\]=<>]/;
/** Palabras alfabéticas de la fila. */
const WORD = /[A-Za-z][A-Za-z']+/g;
/** Sin UNA sola marca de puntuación de código y con tres palabras: es una frase. */
const MIN_WORDS_WITHOUT_PUNCT = 3;
/**
 * CINCO palabras SEGUIDAS, aunque la fila tenga puntuación de código: también
 * es una frase. El piso es cinco y no cuatro por un caso medido:
 * `private const float rw = 0.3086f;` tiene CUATRO palabras seguidas y es una
 * declaración real de C#; `rejects proxy addresses in the SASL` tiene seis y
 * es inglés. Cuatro habría apagado la declaración.
 */
const MAX_WORD_RUN = 5;
/**
 * Tipografía de PROSA: flechas, comparadores tipográficos, puntos suspensivos,
 * rayas y viñetas. Ninguno de los seis lenguajes los admite fuera de un
 * literal de texto — y un literal de texto dentro de un comentario que además
 * es la fila entera es prosa, no código.
 */
const TYPOGRAPHIC = /[\u2190\u2192\u21d0\u21d2\u2264\u2265\u2260\u2026\u2014\u2013\u00b7\u2022]/;
/** Un rótulo: una palabra capitalizada y dos puntos (`Usage:`, `Example:`, `Ejemplo:`). Nunca una sentencia. */
const LABEL_LINE = /^[A-Z][a-z]+:$/;
/** `=` de asignación, sin contar `==`, `===`, `!=`, `<=`, `>=`, `=>`, `=~`. */
const ASSIGN_SIGN = /(?<![=!<>+\-*/%&|^])=(?![=>~])/g;

/** La corrida más larga de palabras alfabéticas separadas SÓLO por espacios. */
function longestWordRun(line: string): number {
  let best = 0;
  let run = 0;
  for (const token of line.split(/\s+/)) {
    if (/^[A-Za-z][A-Za-z']*$/.test(token)) {
      run++;
      if (run > best) best = run;
    } else run = 0;
  }
  return best;
}

type LineClass = "codigo" | "prosa" | "neutra";

/**
 * LAS TRES CLASES DE FILA — y por qué son tres y no dos.
 *
 * La primera versión clasificaba en dos (código / no código) y exigía que el
 * bloque fuera 100 % código. Medido sobre los 21 repos: 26 bloques. El motivo
 * no era que no hubiera código comentado — era que UNA fila que la gramática
 * de sentencia no reconoce (`} else {`, `end`, `for x in y:`, una fila de
 * guiones) mataba el bloque entero aunque las otras cinco fueran sentencias
 * inequívocas.
 *
 * La clase NEUTRA arregla eso sin aflojar la compuerta que importa: una fila
 * neutra no es evidencia a favor NI en contra, así que no cuenta para el piso
 * de `lineasDeCodigo` pero tampoco veta. La compuerta sigue siendo la misma
 * que hace alto el número: **una sola fila de PROSA mata el bloque**. Lo que
 * cambió es la definición de prosa — de "no reconocí esta fila" (una
 * confesión de la gramática) a "esta fila es una frase" (un hecho de la fila).
 */
function classify(line: string): LineClass {
  if (PROSE_TAG.test(line)) return "prosa";
  if (TYPOGRAPHIC.test(line)) return "prosa";
  if (LABEL_LINE.test(line)) return "prosa";
  if (longestWordRun(line) >= MAX_WORD_RUN) return "prosa";
  if (!CODE_PUNCT.test(line)) {
    const words = line.match(WORD);
    if (words && words.length >= MIN_WORDS_WITHOUT_PUNCT) return "prosa";
  }
  // Dos asignaciones en una fila SIN terminador no es una sentencia: es una
  // tabla de correspondencias escrita a mano (`text = "small", query = "mall",
  // not complete before`). Con terminador sí lo es (`int a = 1, b = 2;`).
  if (!ENDS_STATEMENT.test(line) && (line.match(ASSIGN_SIGN)?.length ?? 0) >= 2) return "neutra";
  return shapeOf(line) !== null ? "codigo" : "neutra";
}

/* ── el recorrido ────────────────────────────────────────────────────────── */

interface CommentRow {
  readonly row: number;
  /** El texto de la fila SIN el sigilo de comentario, ya recortado. */
  readonly content: string;
  /** `true` si la fila abre un comentario de DOCUMENTACIÓN. */
  readonly doc: boolean;
  /** `true` si la fila CRUDA arranca con un asterisco sin ser la fila de cierre: la firma del bloque en estilo documentación. */
  readonly starred: boolean;
}

function collectCommentNodes(root: AstNode, out: AstNode[]): void {
  if (root.isNamed && COMMENT_NODE_TYPE.test(root.type)) {
    out.push(root);
    return;
  }
  for (let i = 0; i < root.childCount; i++) {
    const c = root.child(i) as AstNode | null;
    if (c) collectCommentNodes(c, out);
  }
}

function strip(raw: string): string {
  let line = raw.replace(MARKER_PREFIX, "");
  line = line.replace(MARKER_SUFFIX, "");
  return line.trim();
}

/**
 * Las filas del archivo ocupadas ÍNTEGRAMENTE por comentario. Una fila con
 * código real a la izquierda (`foo(); // nota`) o a la derecha del cierre
 * NO entra: no es un bloque de comentario, es una anotación al margen.
 */
function commentRowsOf(file: FileUnit): Map<number, CommentRow> {
  const src = file.root.text.split("\n");
  const base = file.root.startPosition.row;
  const lineAt = (row: number): string => src[row - base] ?? "";

  const nodes: AstNode[] = [];
  collectCommentNodes(file.root, nodes);

  const rows = new Map<number, CommentRow>();
  for (const node of nodes) {
    const first = node.startPosition.row;
    const last = node.endPosition.row;
    // Código real a la izquierda de la apertura ⇒ comentario al margen.
    if (lineAt(first).slice(0, node.startPosition.column).trim() !== "") continue;
    // Código real a la derecha del cierre ⇒ ídem.
    if (lineAt(last).slice(node.endPosition.column).trim() !== "") continue;
    const doc = DOC_MARKER.test(lineAt(first));
    for (let row = first; row <= last; row++) {
      const raw = lineAt(row).trim();
      rows.set(row, { row, content: strip(lineAt(row)), doc, starred: STARRED_ROW.test(raw) });
    }
  }
  return rows;
}

interface Block {
  readonly startRow: number;
  readonly endRow: number;
  readonly lines: readonly string[];
  readonly doc: boolean;
  /** Alguna fila interior arranca con `*`: bloque en estilo documentación. */
  readonly starred: boolean;
}

/** Filas contiguas de comentario ⇒ un bloque. */
function blocksOf(rows: ReadonlyMap<number, CommentRow>): Block[] {
  const ordered = [...rows.keys()].sort((a, b) => a - b);
  const blocks: Block[] = [];
  let start: number | null = null;
  let prev: number | null = null;
  const flush = (): void => {
    if (start === null || prev === null) return;
    const lines: string[] = [];
    let doc = false;
    let starred = false;
    for (let r = start; r <= prev; r++) {
      const cell = rows.get(r);
      if (!cell) continue;
      lines.push(cell.content);
      if (cell.doc) doc = true;
      if (cell.starred) starred = true;
    }
    blocks.push({ startRow: start, endRow: prev, lines, doc, starred });
  };
  for (const row of ordered) {
    if (prev !== null && row === prev + 1) {
      prev = row;
      continue;
    }
    flush();
    start = row;
    prev = row;
  }
  flush();
  return blocks;
}

export interface CommentedOutBlock {
  readonly startLine: number;
  readonly endLine: number;
  readonly codeLines: number;
  readonly shapes: readonly string[];
  readonly sample: string;
}

/**
 * Los bloques que son ÍNTEGRAMENTE código. Exportado aparte de `detector.run`
 * para poder medirlo sin pasar por `RunContext` — mismo criterio que
 * `buildLongFunctionFinding`/`buildDivergentChangeFindings`.
 */
export function commentedOutBlocks(file: FileUnit, minCodeLines: number): readonly CommentedOutBlock[] {
  const out: CommentedOutBlock[] = [];
  for (const block of blocksOf(commentRowsOf(file))) {
    if (block.doc || block.starred) continue;
    const content = block.lines.filter((l) => l !== "" && !RUBY_BLOCK_FENCE.test(l));
    if (content.length === 0) continue;
    const shapes: string[] = [];
    let code = 0;
    let neutral = 0;
    let prose = 0;
    for (const line of content) {
      const cls = classify(line);
      if (cls === "prosa") {
        prose++;
        break;
      }
      if (cls === "codigo") {
        code++;
        shapes.push(shapeOf(line)!);
      } else neutral++;
    }
    if (prose > 0) continue;
    if (code < minCodeLines) continue;
    // Al menos la mitad del bloque tiene que ser sentencia reconocida: un
    // bloque de doce filas neutras con dos sentencias sueltas adentro no es
    // "código apagado", es una nota que menciona código.
    if (code < neutral) continue;
    if (!balanced(content)) continue;
    out.push({
      startLine: block.startRow + 1,
      endLine: block.endRow + 1,
      codeLines: code,
      shapes: [...new Set(shapes)].sort(),
      sample: content.slice(0, 3).join(" \u23ce ").slice(0, 160),
    });
  }
  return out;
}

/** Diagnóstico de calibración: TODO bloque de comentario con el motivo por el que pasó o no. No lo usa `run`. */
export interface CommentBlockDiagnostic {
  readonly startLine: number;
  readonly endLine: number;
  readonly lines: readonly string[];
  readonly reason: string;
}

export function commentBlockDiagnostics(file: FileUnit, minCodeLines: number): readonly CommentBlockDiagnostic[] {
  const out: CommentBlockDiagnostic[] = [];
  for (const block of blocksOf(commentRowsOf(file))) {
    const base = { startLine: block.startRow + 1, endLine: block.endRow + 1, lines: block.lines };
    if (block.doc || block.starred) {
      out.push({ ...base, reason: block.doc ? "doc-marker" : "estilo-documentacion" });
      continue;
    }
    const content = block.lines.filter((l) => l !== "" && !RUBY_BLOCK_FENCE.test(l));
    if (content.length === 0) {
      out.push({ ...base, reason: "vacio" });
      continue;
    }
    const prose = content.find((l) => classify(l) === "prosa");
    if (prose !== undefined) {
      out.push({ ...base, reason: `prosa:${prose.slice(0, 70)}` });
      continue;
    }
    const code = content.filter((l) => classify(l) === "codigo").length;
    const neutral = content.length - code;
    if (code < minCodeLines) {
      out.push({ ...base, reason: `pocas-sentencias:${code}` });
      continue;
    }
    if (code < neutral) {
      out.push({ ...base, reason: `mas-neutras-que-codigo:${code}/${neutral}` });
      continue;
    }
    if (!balanced(content)) {
      out.push({ ...base, reason: "desbalanceado" });
      continue;
    }
    out.push({ ...base, reason: "EMITIDO" });
  }
  return out;
}

/**
 * DOS filas, no una. Una sola línea comentada con forma de sentencia
 * (`// x = 1`) es tan probablemente una nota como código apagado, y a esa
 * escala el volumen deja de ser legible. Con dos filas contiguas, ambas con
 * forma de sentencia y sin una sola palabra de prosa en el bloque, la lectura
 * "esto era código y se apagó" deja de tener competencia razonable. MEDIDO,
 * no elegido: ver el informe de la Ola AU/AU6 para el volumen y la precisión
 * con uno y con dos.
 */
const MIN_CODE_LINES_SPEC = pisoDeclarado(2, {
  rationale:
    "una sola fila de comentario con forma de sentencia es ambigua entre una nota y código apagado; dos filas " +
    "CONTIGUAS, las dos con forma de sentencia y sin ninguna palabra de prosa en todo el bloque, no tienen otra " +
    "lectura razonable. Medido sobre los 21 repos del corpus en la Ola AU: ver el informe AU6 para el volumen y la " +
    "precisión con piso 1 y con piso 2.",
});

/** CONTRATO-F4.md §1.8: tope de VOLUMEN propio, no de detección. */
const MAX_FINDINGS_SPEC = presupuesto(120, {
  rationale:
    "el código comentado es barato de encontrar y caro de leer en masa: un panel que lista 3.000 bloques no se " +
    "lee. 120 por lenguaje deja ver los bloques más grandes de cada repo (los que ordenan por severidad, que acá " +
    "es el tamaño del bloque) sin convertir el panel en un listado. Es un tope de volumen, no un umbral de " +
    "detección.",
});

export const detector: IntraFileDetector<ThresholdKey, "commented-out-code"> = {
  id: "commented-out-code",
  kind: "commented-out-code",
  scope: "intra-file",
  title: "Código comentado",
  // Ningún `needs`: todo lenguaje tiene comentarios. No se declara
  // `unidad-tipo-clase` ni nada parecido — este detector no mira estructura
  // del lenguaje, sólo filas de comentario.
  needs: [],
  thresholds: { lineasDeCodigo: MIN_CODE_LINES_SPEC },
  maxFindings: MAX_FINDINGS_SPEC,
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("lineasDeCodigo");
    const findings: RawFinding[] = [];
    for (const block of commentedOutBlocks(file, threshold.value)) {
      findings.push({
        title: `${block.codeLines} líneas de código apagadas con un comentario`,
        detail:
          `Las filas ${block.startLine}–${block.endLine} son un bloque de comentario cuyas ${block.codeLines} ` +
          "filas tienen todas forma de sentencia del lenguaje, y ninguna es prosa: no hay una sola palabra de " +
          "explicación entre ellas. Eso es código que alguien apagó y dejó ahí. Nadie sabe si sigue siendo " +
          "válido, nadie lo compila, nadie lo prueba, y cada lector que pasa tiene que decidir de nuevo si " +
          "importa. El historial de versiones ya lo guarda: borrarlo no pierde nada.",
        trigger: [{ label: "filas de comentario con forma de sentencia", value: block.codeLines, threshold }],
        evidence: [{ label: "formas encontradas", value: block.shapes.length, note: block.shapes.join(", ") }],
        locations: [
          {
            file: file.path,
            startLine: block.startLine,
            endLine: block.endLine,
            role: `bloque comentado: ${block.sample}`,
          },
        ],
        severity: Math.min(100, 25 + block.codeLines * 4),
        advice: {
          primary: {
            name: "Borrar el código comentado",
            kind: "refactorizacion",
            why:
              "El control de versiones ya guarda lo que este bloque decía, con su fecha y su autor. Dejarlo " +
              "acá no lo conserva mejor: lo vuelve ruido que envejece en silencio y que el lector siguiente " +
              "tiene que volver a evaluar.",
            source: "https://refactoring.guru/es/smells/comments",
          },
        },
      });
    }
    return findings;
  },
};
