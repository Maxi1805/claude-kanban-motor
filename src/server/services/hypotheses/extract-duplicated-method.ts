/**
 * `Extract Duplicated Method` — Ola AU, frente AU2.
 *
 * ── EL HUECO QUE TAPA ──────────────────────────────────────────────────────
 * `duplication` es el detector con la población más grande del catálogo
 * (3.011 hallazgos sobre 20 repos, medido en el volcado de la Ola AS) y
 * **ninguna de las once familias de refactorización registradas propone lo
 * único que la duplicación literalmente pide**: sacar el fragmento repetido a
 * UN lugar y llamarlo desde los demás. `consolidate-conditional`, `proxy`,
 * `prototype` y `null-object` declaran `duplication` entre sus anclas, pero
 * ninguno emite ese remedio. Este archivo es esa propuesta.
 *
 * ── LA PRECONDICIÓN, Y POR QUÉ PASA LA PRUEBA DEL FRENTE ───────────────────
 * La regla del encargo: *si la precondición no se verifica ABRIENDO EL
 * ARCHIVO, la familia repite el 17,9 % de los patrones*. La de acá es:
 *
 *   > **Hay N >= 2 fragmentos EN EL MISMO ARCHIVO, de >= 8 líneas, con el
 *   > MISMO texto (o el mismo texto salvo hasta 2 identificadores sustituidos
 *   > de forma consistente), que no son una declaración entera y que no saltan
 *   > fuera de sí mismos (`return`/`break`/`continue`).**
 *
 * Se abre el archivo, se leen los dos fragmentos, se comparan carácter por
 * carácter y se mira si adentro hay un `return`. No hay nada que opinar sobre
 * el futuro. Es la misma clase de hecho que sostiene a `Extract Method`
 * (73,6 %) y no la clase de opinión que hundió a los patrones.
 *
 * ── LA TRAMPA DE ESTA FAMILIA, Y CÓMO SE CIERRA ────────────────────────────
 * **No toda duplicación se debe eliminar.** Dos bloques iguales por
 * coincidencia, o que van a divergir, no son un problema. La compuerta tiene
 * que exigir MISMO CONCEPTO, no misma forma. Acá el concepto se prueba por
 * **conjunción de tres hechos, no por una heurística de nombres**:
 *
 *   1. **IDENTIDAD DE TEXTO** (no "90 % de similitud"). AS4 midió el precio de
 *      un piso de similitud flojo sobre cuerpos cortos y lo pagó tres veces en
 *      tres lenguajes: `jenkins LabelExpression:157` (`And.accept` llama
 *      `onAnd`, `Or.accept` llama `onOr` — el ÚNICO token que difiere ES la
 *      semántica del doble despacho de Visitor), `sqlalchemy exc.py:452`,
 *      `chatwoot messages`. Acá el default es identidad total; la ruta
 *      parametrizada (abajo) existe pero prohíbe justamente esa forma.
 *   2. **MISMO ARCHIVO**. Dos fragmentos de >= 8 líneas idénticas dentro de un
 *      mismo archivo no son una coincidencia: son un copiar-pegar. Y además es
 *      lo que hace que el remedio sea barato de verdad — un helper privado en
 *      ese mismo archivo, sin tocar ninguna firma pública, sin mover nada de
 *      módulo. Es la mitad "MISMO ALCANCE" del encargo; la otra mitad
 *      (hermanas de una jerarquía) vive en `pull-up-duplicated-member.ts`.
 *   3. **TAMAÑO**. El piso de aguas arriba es 6 líneas / 28 nodos
 *      (`code-analyzer.ts#MIN_CLONE_LINES`). Acá se sube a 8, y es una
 *      decisión de PRODUCTO declarada de antemano, no un umbral ajustado
 *      después de mirar los datos: extraer un helper cuesta una firma más una
 *      llamada por sitio, así que por debajo de ~8 líneas el remedio no ahorra
 *      código, sólo lo mueve. Cuántos candidatos mueren exactamente ahí queda
 *      en la traza (`ExtractDuplicatedMethodTraceEntry.diesAt`) para que la
 *      próxima ola pueda revisar el número sin volver a construir nada.
 *
 * ── LA RUTA PARAMETRIZADA, Y SU PROHIBICIÓN ────────────────────────────────
 * El encargo la nombra: *"los bloques son equivalentes salvo por N
 * identificadores, y esos N se pueden pasar como parámetros. Si la diferencia
 * es estructural —un `if` de más, un `return` en el medio— NO aplica"*.
 * Implementada así, y las tres condiciones son mecánicas:
 *   · las dos secuencias de tokens tienen **la misma longitud** (una diferencia
 *     estructural cambia la longitud: ésa es la compuerta, y es exacta, no
 *     aproximada);
 *   · las posiciones que difieren son todas identificadores o literales, y la
 *     sustitución es una **biyección consistente** (todo `a` de la copia 1 es
 *     `b` en la copia 2, siempre) — un clon Tipo-2 del vocabulario clásico;
 *   · **ningún token que difiere está en posición de LLAMADA ni de MIEMBRO**
 *     (seguido de `(`, o precedido de `.`/`::`/`->`). Si lo que cambia es a
 *     QUÉ se llama o QUÉ campo se toca, la diferencia no es un parámetro: es
 *     el comportamiento. Ésta es exactamente la falla del Visitor de
 *     `jenkins LabelExpression:157`, cerrada por construcción.
 *
 * ── EL SALTO DE CONTROL ────────────────────────────────────────────────────
 * Un `return`/`break`/`continue`/`yield` adentro del bloque hace que extraerlo
 * cambie el flujo (el `return` pasaría a devolver del helper, no de la función
 * original). Se verifica **sobre el árbol**, contra los TIPOS DE NODO, con la
 * misma técnica de palabra-en-el-tipo que `code-grammar.ts` ya usa para
 * `LOOP_WORD`/`EXCEPTION_WORD`/`SWITCH_WORD` — nunca contra el texto fuente ni
 * contra una palabra clave de un lenguaje concreto. Sin árbol vivo, el check
 * NO se cumple (`holds: false`): un `required` que aprueba por no poder mirar
 * no es un `required` (`no-permissive-required.test.ts`).
 *
 * ── ARBITRAJE: POR QUÉ NO PUEDE BORRAR UNA VERDADERA DE LOS 19 ─────────────
 * `engine.ts#arbitrateRivalHypotheses` retira una OPORTUNIDAD cuando otro
 * patrón sobre el mismo `Finding` está `ya-aplicado`/`aplicado-eludido` y sus
 * `places` solapan. `duplication` es ancla compartida con Proxy, Prototype,
 * Null Object y Consolidate Conditional. **Esta hipótesis NUNCA emite un
 * estado confirmado**: su `appliedState` devuelve siempre `ausente`. Leyendo
 * el filtro (`isOpportunity(h) && overlappingRivals(h).length > 0`, y
 * `overlappingRivals` sólo cuenta rivales CONFIRMADOS), una hipótesis que sólo
 * emite oportunidades no puede retirar nada. El conjunto de supervivientes de
 * los 19 es idéntico con y sin ella **por construcción**, y se mide igual.
 *
 * ── LENGUAJES ──────────────────────────────────────────────────────────────
 * `needs: []`. No hay una sola expresión regular sobre un prefijo de receptor,
 * una palabra clave ni un nombre de tipo de ningún lenguaje:
 *   · los TOKENS salen de las hojas del ÁRBOL (`tokensDelNodo`), no de un lexer
 *     de texto — y con ellos `esValor` es `leaf.isNamed`, que es la misma
 *     distinción en las seis gramáticas;
 *   · los tipos de nodo se consultan contra `ctx.setsFor(lenguaje)`;
 *   · las palabras de salto y las de literal se buscan en el NOMBRE DEL TIPO DE
 *     NODO de la gramática, nunca en el fuente.
 * Es la lección de `state.ts#SELF_PREFIX` aplicada por construcción, y tiene
 * prueba: los seis lenguajes se ejercitan con árbol real en el test.
 */
import { walkTree } from "../detect/tree-walk.js";
import type { AstNode, CloneCandidate, Finding, RoleLocation } from "../detect/types.js";
import type { CodeGraph } from "../graph/types.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

const ANCHOR_KIND = "duplication";

/** Ver el docstring de cabecera, punto 3: decisión de PRODUCTO, declarada antes de medir. */
const MIN_LINEAS = 8;

/** Cuántos identificadores puede sustituir la ruta parametrizada. 2, no "N": tres
 *  parámetros ya es una firma que hay que diseñar, no un movimiento mecánico. */
const MAX_PARAMETROS = 2;

/** Un bloque "grande" — discriminador, nunca `required`. */
const LINEAS_GRANDES = 20;

/**
 * Palabras de SALTO buscadas en el NOMBRE DEL TIPO DE NODO (`return_statement`,
 * `break_statement`, `continue_statement`, `yield`, `goto_statement`, y el
 * `return`/`break`/`next` pelado de Ruby). Misma técnica, byte por byte, que
 * `code-grammar.ts#LOOP_WORD`/`EXCEPTION_WORD`: se pregunta por la GRAMÁTICA,
 * no por el texto fuente, así que ningún lenguaje queda mudo por vocabulario.
 */
const SALTO_WORD = /(^|_)(return|break|continue|yield|goto|next|redo|retry)(_|$)/;

/**
 * Tipos de nodo que se toman ENTEROS, sin recorrer: un literal de texto, de
 * carácter, de expresión regular o una plantilla. Ver `tokensDelNodo` para la
 * medición que obligó a esto. Palabra buscada en el TIPO DE NODO de la
 * gramática, misma técnica que `SALTO_WORD`.
 */
const ATOMO_WORD = /(^|_)(string|char|regex|template|heredoc)(_|$)|^(string|char|regex)$/;

/**
 * Segmentos de ruta y nombres de archivo que NO son código de producto. AS4
 * midió esta compuerta como necesaria en TRES familias distintas a la vez
 * (`sqlalchemy examples/inheritance/single.py`, donde la duplicación **es** el
 * ejemplo; `jekyll benchmark/...`; `chatwoot db/migrate/...`, registros
 * inmutables que por convención no se refactorizan; 12 de 13 de `nest` en
 * `sample/`). Es una lista de CONVENCIONES DE DIRECTORIO, no de sintaxis de
 * ningún lenguaje, y por eso no cae bajo la prohibición de hardcodeos.
 */
const SEGMENTOS_NO_PRODUCTO = new Set([
  "test", "tests", "spec", "specs", "__tests__", "__mocks__", "testdata", "test_data",
  "fixture", "fixtures", "example", "examples", "sample", "samples", "demo", "demos",
  "benchmark", "benchmarks", "vendor", "third_party", "thirdparty", "node_modules",
  "migrate", "migrations", "generated", "dist",
]);

/**
 * EL INDICE DE CLONES POR RANGO, UNA VEZ POR CORRIDA. `build()` corre una vez
 * por `Finding` y `duplication` tiene MILES de hallazgos en los repos grandes;
 * `repo.clones` tiene decenas de miles de entradas. Reconstruir el indice
 * adentro de cada llamada es cuadratico sobre el repo, asi que se cachea contra
 * la identidad del arreglo (que `analyzeRepo` arma una sola vez por corrida).
 */
const INDICE_POR_RANGO = new WeakMap<object, Map<string, CloneCandidate[]>>();

function indicePorRango(clones: readonly CloneCandidate[]): Map<string, CloneCandidate[]> {
  const cached = INDICE_POR_RANGO.get(clones as unknown as object);
  if (cached) return cached;
  const porRango = new Map<string, CloneCandidate[]>();
  for (const c of clones) {
    const k = `${c.file} ${c.startLine} ${c.endLine}`;
    const l = porRango.get(k);
    if (l) l.push(c);
    else porRango.set(k, [c]);
  }
  INDICE_POR_RANGO.set(clones as unknown as object, porRango);
  return porRango;
}

/** `foo.test.ts`, `foo_test.go`, `FooTest.java`, `foo_spec.rb`, `test_foo.py`. */
const NOMBRE_NO_PRODUCTO = /(^|[._-])(test|tests|spec|specs)([._-]|$)|(test|tests|spec|specs)$/i;

export function esRutaDeProducto(ruta: string): boolean {
  const partes = ruta.split("/");
  const base = partes.pop() ?? "";
  for (const p of partes) if (SEGMENTOS_NO_PRODUCTO.has(p.toLowerCase())) return false;
  const stem = base.replace(/\.[^.]+$/, "");
  return !NOMBRE_NO_PRODUCTO.test(stem);
}

/* ══════════════════════════════════════════════════════════════════════════
 * RECONSTRUIR EL GRUPO DE CLONES DEL `Finding`
 * ══════════════════════════════════════════════════════════════════════════
 * El `Finding` de `duplication` trae `locations` (archivo + rango por copia) y
 * el conteo, pero NO el texto ni el tipo de nodo — eso vive en
 * `RepoUnit.clones`, que `ctx.repo` sí expone. Se cruza por rango EXACTO y se
 * elige la huella que aparece en TODAS las ubicaciones: dos subárboles pueden
 * compartir un rango de líneas (un nodo y su único hijo), así que emparejar
 * por rango a secas puede tomar el equivocado; exigir la huella común lo
 * resuelve sin ambigüedad.
 */
export function reconstruirGrupo(problem: Finding, clones: readonly CloneCandidate[]): readonly CloneCandidate[] | null {
  if (problem.locations.length < 2) return null;
  const porRango = indicePorRango(clones);
  const candidatosPorUbicacion: CloneCandidate[][] = [];
  for (const loc of problem.locations) {
    const l = porRango.get(`${loc.file} ${loc.startLine} ${loc.endLine}`);
    if (!l || l.length === 0) return null;
    candidatosPorUbicacion.push(l);
  }
  // DESEMPATE POR TAMANO. Dos nodos pueden compartir el MISMO rango de lineas
  // (medido: en Python el `block` de un `function_definition` empieza en la
  // misma fila que la firma, y en TypeScript el `statement_block` de una
  // funcion abre y cierra en las mismas dos filas que su declaracion). Se
  // prueba primero el subarbol MAS GRANDE porque es el que el detector
  // prefiere: `duplication.ts` ordena sus candidatos por `nodes` descendente
  // ("estructuras mas grandes primero") y marca los anidados como cubiertos.
  // Sin este orden, la reconstruccion puede quedarse con el nodo equivocado y
  // leer un `functionName`/`normalized` que no es el del hallazgo.
  const primera = [...candidatosPorUbicacion[0]!].sort((x, y) => y.nodes - x.nodes);
  for (const c of primera) {
    const elegidas: CloneCandidate[] = [];
    let completo = true;
    for (const lista of candidatosPorUbicacion) {
      const m = lista.find((x) => x.fingerprint === c.fingerprint);
      if (!m) {
        completo = false;
        break;
      }
      elegidas.push(m);
    }
    if (completo) return elegidas;
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
 * TOKENIZACIÓN GENÉRICA Y EQUIVALENCIA TIPO-2
 * ══════════════════════════════════════════════════════════════════════════ */

interface Token {
  readonly texto: string;
  /** `true` para identificadores, números y literales de texto: lo único que
   *  un parámetro puede reemplazar. Puntuación y operadores nunca. */
  readonly esValor: boolean;
}

/**
 * TOKENIZACIÓN DESDE EL ÁRBOL, no desde el texto — y la razón está MEDIDA, no
 * razonada.
 *
 * La primera versión tokenizaba `CloneCandidate.normalized` con una expresión
 * regular. Sobre `excalidraw/packages/excalidraw/components/App.tsx:12470`
 * emitió una propuesta FALSA por un motivo que no tiene nada que ver con el
 * código analizado: el bloque lleva el comentario *"we don't want history"*, y
 * el apóstrofo de `don't` abre, para la regex, un literal de texto que se come
 * TODO el resto del bloque en un solo token. Los dos bloques quedaban
 * comparados como "un token gigante distinto" ⇒ un parámetro ⇒ propuesta
 * emitida, cuando lo que de verdad difiere es `startBinding` contra
 * `endBinding`, que está en posición de MIEMBRO y la compuerta tenía que
 * rechazar. **Un lexer de texto no puede distinguir un apóstrofo de un
 * comentario de una comilla de un literal, en ningún lenguaje.**
 *
 * El árbol sí. Se recorren las HOJAS del nodo del clon y:
 *   · las de tipo comentario se saltean (`/comment/i` sobre el TIPO de nodo,
 *     que es vocabulario de gramática, no de lenguaje);
 *   · `esValor` es exactamente `leaf.isNamed`. En tree-sitter, identificadores,
 *     números y literales de texto son nodos NOMBRADOS y la puntuación y las
 *     palabras clave son ANÓNIMAS. Es la definición correcta y es la misma en
 *     las seis gramáticas — la regex clasificaba `const`/`if` como "valor".
 *   · los operadores de varios caracteres (`?.`, `::`, `->`) llegan como UN
 *     token anónimo, así que la prueba de "posición de miembro" funciona; con
 *     la regex, `?.` se partía en `?` y `.` y `::` en `:` y `:`, y el chequeo
 *     no podía ver ninguno de los dos.
 *
 * `tokenizar` (texto) se conserva SÓLO para las pruebas unitarias de
 * `equivalenciaDe`: ninguna decisión de producción pasa ya por ahí.
 */
export function tokensDelNodo(node: AstNode): readonly Token[] {
  const out: Token[] = [];
  const visitar = (n: AstNode): void => {
    if (/comment/i.test(n.type)) return;
    // ÁTOMOS. Un literal de texto se toma ENTERO y no se recorre. Sin esto su
    // CONTENIDO desaparece — medido, no supuesto: en tree-sitter C# el texto
    // entre comillas no es un hijo del nodo `string_literal`, así que un
    // recorrido de hojas devuelve `" "` y dos mensajes de error distintos
    // quedan comparados como iguales. Encontrado sobre
    // `newtonsoft-json/.../JsonSerializerInternalReader.cs:1297`, donde tres
    // copias con TRES mensajes distintos ("Unable to find a constructor…",
    // "…a default constructor…", "…A class should either have…") salían como
    // una sola sustitución. La prueba es por el TIPO DE NODO de la gramática,
    // no por el texto fuente.
    if (n.childCount === 0 || ATOMO_WORD.test(n.type)) {
      const t = n.text;
      if (t.trim().length > 0) out.push({ texto: t, esValor: n.childCount === 0 ? n.isNamed : true });
      return;
    }
    const antes = out.length;
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i) as AstNode | null;
      if (c) visitar(c);
    }
    // RED DE SEGURIDAD para cualquier otra ranura de gramática que esconda su
    // contenido igual que los literales de C#: si un nodo con texto real no
    // aportó ni un token, se toma entero. Nunca se pierde contenido en
    // silencio.
    if (out.length === antes && n.text.trim().length > 0) out.push({ texto: n.text, esValor: true });
  };
  visitar(node);
  return out;
}

/** Tokenizador de TEXTO — sólo para las pruebas unitarias de `equivalenciaDe`.
 *  Ver `tokensDelNodo` para por qué la producción NO lo usa. */
export function tokenizar(texto: string): readonly Token[] {
  const out: Token[] = [];
  const re = /(["'`])(?:\\.|(?!\1)[^\\])*\1|[\p{L}_$][\p{L}\p{N}_$]*|\d[\d._]*|\s+|[^\s]/gu;
  for (const m of texto.matchAll(re)) {
    const t = m[0];
    if (/^\s+$/.test(t)) continue;
    const esValor = /^["'`]/.test(t) || /^[\p{L}_$]/u.test(t) || /^\d/.test(t);
    out.push({ texto: t, esValor });
  }
  return out;
}

export interface Equivalencia {
  /** `identica` = cero parámetros; `parametrizable` = biyección consistente; `no` = no aplica. */
  readonly clase: "identica" | "parametrizable" | "no";
  /** Los pares sustituidos, `a->b`, para la evidencia. Vacío en `identica`. */
  readonly pares: readonly string[];
  /** Por qué NO, cuando `clase === "no"`. */
  readonly razon: string;
}

/** ¿El token de la posición `i` está en posición de LLAMADA o de MIEMBRO? */
function esPosicionDeComportamiento(toks: readonly Token[], i: number): boolean {
  const sig = toks[i + 1]?.texto;
  if (sig === "(") return true;
  const ant = toks[i - 1]?.texto;
  return ant === "." || ant === "::" || ant === "->" || ant === "?." || ant === "&.";
}

/**
 * El corazón de la compuerta. Ver el docstring de cabecera, "LA RUTA
 * PARAMETRIZADA": misma longitud de tokens (una diferencia ESTRUCTURAL cambia
 * la longitud — compuerta exacta), diferencias sólo en valores, biyección
 * consistente en las DOS direcciones, tope de parámetros, y prohibición de
 * posición de llamada/miembro.
 */
export function equivalenciaDe(textos: readonly string[]): Equivalencia {
  return equivalenciaDeTokens(textos.map((t) => tokenizar(t)));
}

/**
 * El corazón de la compuerta, sobre TOKENS ya producidos — desde el árbol en
 * producción (`tokensDelNodo`), desde el texto sólo en las pruebas unitarias.
 */
export function equivalenciaDeTokens(copias: readonly (readonly Token[])[]): Equivalencia {
  if (copias.length < 2) return { clase: "no", pares: [], razon: "menos de dos copias." };
  const textoDe = (t: readonly Token[]): string => t.map((x) => x.texto).join("\u0000");
  const base = textoDe(copias[0]!);
  if (copias.every((t) => textoDe(t) === base)) return { clase: "identica", pares: [], razon: "" };

  const tb = copias[0]!;
  const mapa = new Map<string, string>();
  const inverso = new Map<string, string>();
  for (const to of copias.slice(1)) {
    if (to.length !== tb.length) {
      return { clase: "no", pares: [], razon: `las copias tienen ${tb.length} y ${to.length} tokens: la diferencia es ESTRUCTURAL, no una sustitución de identificadores.` };
    }
    for (let i = 0; i < tb.length; i++) {
      const a = tb[i]!;
      const b = to[i]!;
      if (a.texto === b.texto) continue;
      if (!a.esValor || !b.esValor) {
        return { clase: "no", pares: [], razon: `difieren en el token ${i} (\`${a.texto}\` contra \`${b.texto}\`), que no es un identificador ni un literal: no se puede pasar como parámetro.` };
      }
      if (esPosicionDeComportamiento(tb, i) || esPosicionDeComportamiento(to, i)) {
        return { clase: "no", pares: [], razon: `lo que difiere (\`${a.texto}\` contra \`${b.texto}\`) está en posición de LLAMADA o de MIEMBRO: lo que cambia es a qué se llama o qué campo se toca, no un valor. Eso es comportamiento distinto, no un parámetro.` };
      }
      const ya = mapa.get(a.texto);
      if (ya !== undefined && ya !== b.texto) {
        return { clase: "no", pares: [], razon: `\`${a.texto}\` se sustituye por \`${ya}\` en un lugar y por \`${b.texto}\` en otro: la sustitución no es consistente.` };
      }
      const inv = inverso.get(b.texto);
      if (inv !== undefined && inv !== a.texto) {
        return { clase: "no", pares: [], razon: `\`${b.texto}\` corresponde a \`${inv}\` y a \`${a.texto}\` a la vez: la sustitución no es una biyección.` };
      }
      mapa.set(a.texto, b.texto);
      inverso.set(b.texto, a.texto);
    }
  }
  const pares = [...mapa].map(([a, b]) => `${a}->${b}`);
  if (pares.length === 0) return { clase: "identica", pares: [], razon: "" };
  if (pares.length > MAX_PARAMETROS) {
    return { clase: "no", pares, razon: `harían falta ${pares.length} parámetros (${pares.join(", ")}), más de ${MAX_PARAMETROS}: ya no es un movimiento mecánico sino una firma que hay que diseñar.` };
  }
  return { clase: "parametrizable", pares, razon: "" };
}

/* ══════════════════════════════════════════════════════════════════════════
 * EL ÁRBOL: nodo del clon, tipo de nodo, y salto de control
 * ══════════════════════════════════════════════════════════════════════════ */

/** El nodo cuyo rango coincide EXACTAMENTE con el del clon (el que el walker de
 *  `code-analyzer.ts` hasheó), preferido el más grande si hay varios. */
function nodoDelClon(root: AstNode, clone: CloneCandidate): AstNode | null {
  let mejor: AstNode | null = null;
  let mejorHijos = -1;
  walkTree(root, (n) => {
    const a = n as AstNode;
    if (a.startPosition.row + 1 !== clone.startLine || a.endPosition.row + 1 !== clone.endLine) return;
    if (a.type !== clone.type) return;
    if (a.childCount > mejorHijos) {
      mejor = a;
      mejorHijos = a.childCount;
    }
  });
  return mejor;
}

function tieneSalto(node: AstNode): boolean {
  let hay = false;
  walkTree(node, (n) => {
    if (SALTO_WORD.test((n as AstNode).type)) hay = true;
  });
  return hay;
}

/* ══════════════════════════════════════════════════════════════════════════
 * EL CONTEXTO
 * ══════════════════════════════════════════════════════════════════════════ */

interface Ctx {
  readonly grupo: readonly CloneCandidate[] | null;
  readonly archivos: readonly string[];
  readonly mismoArchivo: boolean;
  readonly equivalencia: Equivalencia;
  readonly lineas: number;
  /** `null` = no había árbol vivo para mirar. */
  readonly esDeclaracion: boolean | null;
  /** `null` = no había árbol vivo para mirar. */
  readonly conSalto: boolean | null;
  readonly deProducto: boolean;
  readonly funciones: readonly string[];
  readonly funcionesDistintas: number;
  readonly copias: number;
  readonly tipoNodo: string;
}

type Graph = CodeGraph | null;

function contextoDe(problem: Finding, ctx: HypothesisContext): Ctx {
  const grupo = reconstruirGrupo(problem, ctx.repo.clones);
  const archivos = [...new Set(problem.locations.map((l) => l.file))];
  const copias = problem.locations.length;
  const lineas = Math.max(...problem.locations.map((l) => l.endLine - l.startLine + 1));
  const deProducto = problem.locations.every((l) => esRutaDeProducto(l.file));
  if (!grupo) {
    return {
      grupo: null,
      archivos,
      mismoArchivo: archivos.length === 1,
      equivalencia: { clase: "no", pares: [], razon: "no hubo forma de reconstruir el grupo de clones de este hallazgo contra `repo.clones`: no demostrado." },
      lineas,
      esDeclaracion: null,
      conSalto: null,
      deProducto,
      funciones: [],
      funcionesDistintas: 0,
      copias,
      tipoNodo: "",
    };
  }
  const funciones = grupo.map((c) => c.functionName ?? "");
  const funcionesDistintas = new Set(funciones.filter((f) => f.length > 0 && !f.startsWith("("))).size;

  let esDeclaracion: boolean | null = null;
  let conSalto: boolean | null = null;
  const primero = grupo[0]!;
  const file = ctx.fileAt(primero.file);
  // LOS NODOS DE CADA COPIA. La equivalencia se decide sobre los TOKENS DEL
  // ÁRBOL, nunca sobre el texto (ver `tokensDelNodo`): sin nodo para alguna
  // copia no hay comparación fiable y la compuerta NO se cumple, que es la
  // dirección segura.
  const nodos = grupo.map((c) => {
    const f = ctx.fileAt(c.file);
    return f ? nodoDelClon(f.root, c) : null;
  });
  if (file) {
    const sets = ctx.setsFor(file.language);
    esDeclaracion = sets.functionNodes.has(primero.type) || sets.classNodes.has(primero.type);
    const nodo = nodos[0];
    if (nodo) conSalto = tieneSalto(nodo);
  }
  const equivalencia: Equivalencia = nodos.every((n): n is AstNode => n !== null)
    ? equivalenciaDeTokens(nodos.map((n) => tokensDelNodo(n)))
    : { clase: "no", pares: [], razon: "no hubo árbol vivo para alguna de las copias: la equivalencia se decide sobre los tokens del árbol, no sobre el texto. No demostrado." };
  return {
    grupo,
    archivos,
    mismoArchivo: archivos.length === 1,
    equivalencia,
    lineas,
    esDeclaracion,
    conSalto,
    deProducto,
    funciones,
    funcionesDistintas,
    copias,
    tipoNodo: primero.type,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * LOS CHECKS
 * ══════════════════════════════════════════════════════════════════════════ */

const mismoAlcance: Check<Ctx, Graph> = {
  id: "copias-en-el-mismo-archivo",
  describe: "las copias viven todas en el MISMO archivo (el helper se agrega ahí, privado, sin tocar ninguna firma pública ni mover nada de módulo)",
  run: (c) => ({
    holds: c.mismoArchivo,
    evidence: c.mismoArchivo
      ? `las ${c.copias} copias están en ${c.archivos[0]}.`
      : `las copias se reparten en ${c.archivos.length} archivos (${c.archivos.slice(0, 4).join(", ")}): el remedio de acá no aplica; si son clases hermanas, la propuesta correcta es subir el miembro.`,
  }),
};

const equivalentes: Check<Ctx, Graph> = {
  id: "copias-equivalentes",
  describe: `las copias tienen el MISMO texto, o el mismo texto salvo hasta ${MAX_PARAMETROS} identificadores sustituidos de forma consistente y en posición de VALOR (nunca de llamada ni de miembro)`,
  run: (c) => {
    if (c.equivalencia.clase === "identica") return { holds: true, evidence: `las ${c.copias} copias son idénticas carácter por carácter (tras colapsar espacios): el helper no lleva ni un parámetro.` };
    if (c.equivalencia.clase === "parametrizable") return { holds: true, evidence: `difieren sólo en ${c.equivalencia.pares.length} identificador(es) sustituido(s) de forma consistente: ${c.equivalencia.pares.join(", ")}. Cada uno pasa a ser un parámetro.` };
    return { holds: false, evidence: c.equivalencia.razon };
  },
};

const esFragmento: Check<Ctx, Graph> = {
  id: "es-un-fragmento-no-una-declaracion",
  describe: "lo repetido es un fragmento de cuerpo, no una declaración entera de función o clase (una declaración repetida pide otro remedio: subirla, o borrar la copia)",
  run: (c) =>
    c.esDeclaracion === null
      ? { holds: false, evidence: "no hubo árbol vivo para clasificar el nodo del clon: no demostrado." }
      : {
          holds: !c.esDeclaracion,
          evidence: c.esDeclaracion
            ? `el nodo repetido es \`${c.tipoNodo}\`, una declaración entera según la gramática de este lenguaje.`
            : `el nodo repetido es \`${c.tipoNodo}\`, que no es una declaración de función ni de clase en esta gramática.`,
        },
};

const sinSalto: Check<Ctx, Graph> = {
  id: "sin-salto-de-control",
  describe: "el bloque no contiene `return`/`break`/`continue`/`yield` (si los tuviera, extraerlo cambiaría el flujo de la función que lo contiene y dejaría de ser mecánico)",
  run: (c) =>
    c.conSalto === null
      ? { holds: false, evidence: "no hubo árbol vivo para recorrer el bloque: no demostrado." }
      : {
          holds: !c.conSalto,
          evidence: c.conSalto
            ? "el bloque contiene un nodo de salto (return/break/continue/yield) según la gramática: extraerlo cambia el flujo."
            : "ningún nodo de salto adentro del bloque: extraerlo preserva el flujo de la función que lo contiene.",
        },
};

const tamanoUtil: Check<Ctx, Graph> = {
  id: "bloque-de-tamano-util",
  describe: `el bloque tiene al menos ${MIN_LINEAS} líneas (por debajo, el helper cuesta casi tanto como lo que ahorra)`,
  run: (c) => ({ holds: c.lineas >= MIN_LINEAS, evidence: `${c.lineas} líneas, piso ${MIN_LINEAS}.` }),
};

const codigoDeProducto: Check<Ctx, Graph> = {
  id: "codigo-de-producto",
  describe: "ninguna copia vive en `test/`, `spec/`, `example/`, `sample/`, `benchmark/`, `fixture/`, `vendor/`, `migrate/` ni equivalente (ahí la repetición es deliberada, o el archivo es un registro inmutable)",
  run: (c) => ({
    holds: c.deProducto,
    evidence: c.deProducto ? "todas las copias están en rutas de código de producto." : `alguna copia vive en una ruta que no es de producto: ${c.archivos.join(", ")}.`,
  }),
};

/* ── discriminadores ────────────────────────────────────────────────────── */

const tresOMas: Check<Ctx, Graph> = {
  id: "tres-o-mas-copias",
  describe: "hay tres copias o más (cada edición futura tiene que acordarse de las tres)",
  run: (c) => ({ holds: c.copias >= 3, evidence: `${c.copias} copias.` }),
};

const enFuncionesDistintas: Check<Ctx, Graph> = {
  id: "copias-en-funciones-distintas",
  describe: "las copias están en funciones distintas (la repetición cruza responsabilidades, no es un bucle desenrollado dentro de una sola)",
  run: (c) => ({
    holds: c.funcionesDistintas >= 2,
    evidence:
      c.funcionesDistintas >= 2
        ? `contenidas por ${c.funcionesDistintas} funciones distintas: ${[...new Set(c.funciones)].filter((f) => f).join(", ")}.`
        : `contenidas por ${c.funcionesDistintas} función(es) con nombre.`,
  }),
};

const sinParametros: Check<Ctx, Graph> = {
  id: "sin-parametros",
  describe: "el helper no lleva ningún parámetro (las copias son idénticas): la extracción es puramente mecánica",
  run: (c) => ({ holds: c.equivalencia.clase === "identica", evidence: c.equivalencia.clase === "identica" ? "copias idénticas." : `${c.equivalencia.pares.length} parámetro(s).` }),
};

const bloqueGrande: Check<Ctx, Graph> = {
  id: "bloque-grande",
  describe: `el bloque pasa de ${LINEAS_GRANDES} líneas`,
  run: (c) => ({ holds: c.lineas >= LINEAS_GRANDES, evidence: `${c.lineas} líneas.` }),
};

/**
 * SIEMPRE `"ausente"` — ver "ARBITRAJE" en el docstring de cabecera. El caso
 * que naturalmente sería "ya aplicado" (el helper ya existe y alguien igual
 * copió) no se puede distinguir de "todavía no existe" sin resolver llamadas,
 * y afirmarlo de más pondría en riesgo las 287 verdaderas expuestas de los 19
 * patrones. La afirmación que sí se puede hacer, y es la que va: mientras haya
 * N copias, el helper no está en uso en esos N sitios.
 */
function appliedState(c: Ctx): AppliedStateResult {
  return {
    state: "ausente",
    checks: [
      {
        label: "las N copias siguen escritas una por una",
        passed: true,
        why: `hay ${c.copias} copias del mismo bloque en el árbol: si el helper ya existiera y se usara en esos sitios, no habría ${c.copias} copias que hashear.`,
      },
    ],
  };
}

const SOURCE = "https://refactoring.guru/es/extract-method";
const TO_CONFIRM: readonly string[] = [
  "Que las variables que el bloque LEE existan con el mismo significado en los dos sitios: el texto es idéntico, pero dos locales homónimas pueden llevar cosas distintas.",
  "Que el bloque no dependa de un `this`/`self` distinto en cada sitio (dos métodos de clases distintas del mismo archivo).",
  "Cuándo NO conviene: si las dos copias van a divergir por razones distintas (dos reglas de negocio que hoy coinciden), unificarlas crea un acoplamiento falso. La pregunta es si los dos sitios cambiarían POR LA MISMA razón.",
];

function buildSpec(): HypothesisSpec<Ctx, Graph> {
  return {
    pattern: "Extract Duplicated Method",
    ceiling: "alta",
    needs: [],
    required: [mismoAlcance, equivalentes, esFragmento, sinSalto, tamanoUtil, codigoDeProducto],
    discriminators: [tresOMas, enFuncionesDistintas, sinParametros, bloqueGrande],
    appliedState: (c) => appliedState(c),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

/* ── la traza ───────────────────────────────────────────────────────────── */

export interface ExtractDuplicatedMethodTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly copias: number;
  readonly archivos: number;
  readonly lineas: number;
  readonly equivalencia: string;
  /** POR QUE no son equivalentes — sin esto el embudo dice "murieron acá" y no
   *  "murieron acá por esto", que es lo único con lo que se puede decidir si la
   *  compuerta está bien puesta. Sólo traza: no entra en ninguna decisión. */
  readonly razon: string;
  readonly tipoNodo: string;
  readonly withFile: boolean;
  readonly language: string;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  readonly diesAt: string | null;
  readonly emitted: boolean;
}

let trace: ExtractDuplicatedMethodTraceEntry[] | null = null;
export function startExtractDuplicatedMethodTrace(): void {
  trace = [];
}
export function takeExtractDuplicatedMethodTrace(): readonly ExtractDuplicatedMethodTraceEntry[] {
  const t = trace ?? [];
  trace = null;
  return t;
}

function placesOf(c: Ctx): readonly RoleLocation[] {
  const g = c.grupo ?? [];
  return g.map((clone, i) => {
    const dentro = [clone.className, clone.functionName].filter((n): n is string => !!n && !n.startsWith("(")).join(".");
    return {
      file: clone.file,
      startLine: clone.startLine,
      endLine: clone.endLine,
      symbol: dentro || undefined,
      role:
        i === 0
          ? `copia #1 - el bloque que se convierte en el helper${dentro ? `, hoy dentro de ${dentro}` : ""}`
          : `copia #${i + 1} - se reemplaza por la llamada${dentro ? `, hoy dentro de ${dentro}` : ""}`,
    };
  });
}

function costOf(c: Ctx): string {
  const params = c.equivalencia.clase === "parametrizable" ? c.equivalencia.pares.length : 0;
  const firma = params === 0 ? "sin parámetros" : `con ${params} parámetro(s) (${c.equivalencia.pares.join(", ")})`;
  return (
    `Una función nueva en ${c.archivos[0]}, ${firma}, y ${c.copias} llamadas donde hoy hay ${c.copias} copias de ${c.lineas} líneas. ` +
    "Ninguna firma pública cambia: el helper puede ser privado al archivo. El trabajo real es elegir el nombre — que es donde " +
    "se decide si las dos copias son de verdad el mismo concepto — y verificar que las locales que el bloque lee significan lo " +
    "mismo en los dos sitios. El análisis no propone el nombre a propósito."
  );
}

export const hypothesis: HypothesisBuilder = {
  id: "extract-duplicated-method",
  pattern: "Extract Duplicated Method",
  layer: "refactorizacion",
  anchors: [ANCHOR_KIND],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    const c = contextoDe(problem, ctx);
    const spec = buildSpec();
    const outcome = runEngine(spec, ctx.capabilities, c, graph);
    if (trace) {
      const checks = spec.required.map((k) => ({ id: k.id, holds: k.run(c, graph).holds }));
      trace.push({
        findingId: problem.id,
        kind: problem.kind,
        file: problem.locations[0]?.file ?? "",
        copias: c.copias,
        archivos: c.archivos.length,
        lineas: c.lineas,
        equivalencia: c.equivalencia.clase,
        razon: c.equivalencia.razon.slice(0, 220),
        tipoNodo: c.tipoNodo,
        withFile: ctx.file !== null,
        language: ctx.fileAt(problem.locations[0]?.file ?? "")?.language ?? "",
        checks,
        diesAt: checks.find((k) => !k.holds)?.id ?? null,
        emitted: outcome !== null,
      });
    }
    if (!outcome || !c.grupo) return null;
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: placesOf(c),
      cost: costOf(c),
    });
  },
};
