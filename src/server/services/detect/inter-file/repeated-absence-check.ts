/**
 * `repeated-absence-check` — OLA AE, frente AE10. EL ANCLA-FUERZA DE NULL OBJECT.
 *
 * ─── POR QUÉ EXISTE, CON EL NÚMERO QUE LO MOTIVA ──────────────────────────
 *
 * Null Object tenía dos anclas —`distributed-duplication` y `duplication`— y
 * las dos son la MISMA cosa: el índice de huellas estructurales de
 * `code-analyzer.ts` (`repo.clones`), o sea CÓDIGO DUPLICADO. Medido por AE10
 * sobre un volcado propio de las dos poblaciones (13 bibliotecas + las 8
 * aplicaciones de `corpus-app/`): **43 hipótesis en total — 5 en biblioteca y
 * 38 en aplicación—, y `distributed-duplication` no construye NI UNA en
 * ninguna de las dos poblaciones (0 sobre 10 y 0 sobre 30 hallazgos crudos).**
 * En toda la historia del proyecto, Null Object lleva **0 recomendaciones
 * juzgadas verdaderas** (Ola AD, integrador §1.2: 0/3 en biblioteca, 0/2 en
 * aplicación).
 *
 * LA CAUSA NO ES EL VOLUMEN: ES QUE EL ANCLA PREGUNTA OTRA COSA. La fuerza que
 * Null Object resuelve es que **el CHEQUEO de ausencia esté REPETIDO**; el
 * ancla de hoy exige que el CÓDIGO esté DUPLICADO. Son cosas distintas y la
 * diferencia es medible: cinco clientes que preguntan `if (x == nil)` y cada
 * uno hace algo DISTINTO a continuación no son duplicación —sus huellas
 * estructurales no coinciden— y hoy son invisibles. El propio
 * `hypotheses/null-object.ts` lo dejó escrito en su docstring desde la Ola X
 * ("`distributed-duplication` ubica CUALQUIER par de fragmentos parecidos
 * estructuralmente, sin importar SI el fragmento es un guard contra
 * ausencia... casi ningún candidato de esta ancla tiene ADENTRO lo que esta
 * hipótesis busca") y nadie había construido el ancla que sí pregunta.
 *
 * ─── LA FUERZA, ESCRITA COMO LA RESUELVE EL PATRÓN ────────────────────────
 *
 * *El MISMO colaborador es chequeado contra AUSENCIA por MUCHOS clientes
 * distintos, repartidos en varios archivos, y cada cliente decide por su
 * cuenta qué hacer cuando no está.*
 *
 * Es una propiedad de QUIÉN PREGUNTA, no de si el código se parece. Un Null
 * Object existe para que el cliente no tenga que preguntar: el colaborador
 * ausente se sustituye por uno que contesta neutro a los mismos mensajes.
 *
 * ─── LAS CONDICIONES, CON LA INTENCIÓN DE CADA UNA ────────────────────────
 *
 * (F1) EL COLABORADOR TIENE IDENTIDAD — el nombre chequeado es un acceso
 *      CALIFICADO (`ctx.doer`, `pr.headRepo`) o un miembro del propio dueño
 *      (`self.x`/`this.x`/`@x`, y entonces la identidad incluye el nombre del
 *      tipo dueño, que `CloneCandidate.className` aporta).
 *      INTENCIÓN: *"que el chequeo se repita sobre el MISMO objeto"*. Un
 *      identificador DESNUDO (`err`, `ok`, `v`, `found`) es una local o un
 *      parámetro: dos funciones que lo chequean no chequean lo mismo, el
 *      nombre coincide por casualidad. **Medido por AE10 antes de escribir
 *      este archivo, sobre hugo y gitea: agrupando por nombre desnudo, los
 *      cinco "colaboradores" más repetidos de gitea son `ok` (244 clientes),
 *      `err` (205), `has` (134), `exist` (41) y `found` (26) — los cinco son
 *      variables locales del idioma de Go.** Es el mismo falso que P4 ya había
 *      medido en `click` (8/8 conceptos eran un parámetro) y que
 *      `hypotheses/null-object.ts` cubre con `atLeastOneMemberAccessGuard`;
 *      acá la condición es más fuerte, porque además de exigir el receptor
 *      usa el receptor COMO IDENTIDAD.
 *
 * (F2) EL COLABORADOR TIENE PROTOCOLO — al menos uno de los mensajes que los
 *      clientes le mandan (`<colaborador>.<mensaje>(`) resuelve, en el grafo, a
 *      un símbolo `function-like` que es MIEMBRO de un tipo
 *      (`memberOfClassLike`).
 *      INTENCIÓN: *"hay algo que un objeto neutro pueda IMPLEMENTAR"*. Un Null
 *      Object sustituye a un colaborador al que se le MANDAN MENSAJES; si lo
 *      que falta es un dato (una bandera, un número), lo que corresponde es un
 *      valor por defecto, no un objeto. Es además el único anclaje del
 *      colaborador contra el grafo que este proyecto puede hacer: **medido,
 *      los CAMPOS no son nodos del grafo** (en gitea, `Doer` no tiene ni un
 *      nodo; `AvatarLink`, `DisplayName`, `HTMLURL`, `LoadOwner` tienen 2, 7,
 *      5 y 5, todos `function-like` con `memberOfClassLike`), así que el
 *      colaborador se ancla por lo que se le PIDE, no por cómo se llama.
 *
 * (E1) ESCALA — >= `clientes` funciones distintas chequean su ausencia.
 * (E2) ESCALA — esas funciones viven en >= `archivosQueChequean` archivos.
 * (E3) ESCALA — >= `protocoloDelColaborador` mensajes resueltos (ver F2).
 *      Los tres pisos, con su razón, están en `thresholds` más abajo, escritos
 *      ANTES de medir el embudo.
 *
 * (R) RESOLUCIÓN VERIFICADA — NO existe ya, en el repo, un SUSTITUTO NEUTRO
 *     que cubra el protocolo: un tipo `class-like` cuyos miembros
 *     no-constructores (>=1) tienen TODOS fan-out `calls` = 0 y un cuerpo de
 *     span trivial, que declara por nombre TODOS los mensajes del colaborador,
 *     y que tiene >= 1 arista `instantiates` ENTRANTE.
 *     INTENCIÓN: *"no proponer lo que ya está puesto"*. Si el objeto neutro ya
 *     existe y ya se usa, la mitigación correcta es "usá el que ya hay", que es
 *     OTRA refactorización. Es la tercera condición de la receta de la Ola AC,
 *     la que AD4 midió que descartaba el 91 % de sus candidatos.
 *
 * ─── DE DÓNDE SALE LA SINTAXIS, Y QUÉ SE PIERDE POR AHÍ (declarado) ───────
 *
 * Un detector `inter-file` NO recibe árboles: `crossAnalyze` los libera archivo
 * por archivo y sólo los vuelve a parsear DESPUÉS de correr los detectores
 * `inter-file` (`code-analyzer.ts`, `resolveLiveFileUnit` sobre
 * `interFileEvidencePaths`). La única fuente de SINTAXIS repo-wide que existe
 * en `RepoUnit` es `clones`: el texto de cada nodo de `cloneNodes` con >= 28
 * nodos y >= 6 líneas, con los espacios colapsados
 * (`code-analyzer.ts#normalizeSource`), con su archivo, su función y su clase.
 * Este detector lee ESE texto, igual que `duplication`/`distributed-duplication`
 * leen el mismo `repo.clones` para otra pregunta.
 *
 * **EL PRECIO ESTÁ MEDIDO, NO ESTIMADO.** AE10 corrió el extractor de guardas
 * que ya existe (`hypotheses/null-object.ts#scanFile`, sobre árboles vivos
 * reales) contra los mismos repos y comparó cuántos colaboradores sobreviven al
 * piso de tamaño de `repo.clones`: **click 9→9, excalidraw 44→43, gitea
 * 165→163, hugo 61→61, nest 16→16, netbox 13→13** (colaboradores con >= 2
 * clientes en >= 2 archivos). El piso de `repo.clones` cuesta **2 de 308**.
 * Lo que se pierde son guardas dentro de funciones de menos de 6 líneas.
 *
 * ─── LO QUE ESTE DETECTOR NO VE, Y NO LO ESCONDE ──────────────────────────
 *
 *  (a) La NEGACIÓN TRUTHY (`if (!x)`) no cuenta como chequeo de ausencia. Es la
 *      misma decisión que `hypotheses/null-object.ts` ya toma al marcarla
 *      `strict: false` ("puede ser un chequeo defensivo genérico, no
 *      necesariamente ausente"), acá llevada hasta el final: sin ella el ruido
 *      de `if (!list.length)` entraría entero.
 *  (b) El orden invertido (`null == x`) no se reconoce.
 *  (c) La forma `self.x` casi nunca cruza el archivo, así que casi nunca pasa
 *      (E2). **Medido: en netbox (python, 951 archivos) y excalidraw, CERO
 *      candidatos sobreviven a (E2).** Es el resultado CORRECTO —dentro de un
 *      solo tipo la mitigación más barata es un accesor privado con default, no
 *      un tipo nuevo—, pero hay que decir que la consecuencia es que este ancla
 *      es casi ciega al idioma `self.x is None` de Python.
 *  (d) El "comportamiento por defecto" de cada cliente se lee como los DOS
 *      primeros tokens que siguen al chequeo. Alcanza para publicar la
 *      divergencia como EVIDENCIA, y **NO se usa como compuerta: medido, no
 *      descarta nada** (gitea 14→14, hugo 2→2), o sea que sería un chequeo
 *      vacuo — exactamente el defecto que AD4 encontró y corrigió en su propio
 *      peldaño de estado.
 */
import { CONSTRUCTOR_NAMES } from "../../code-grammar.js";
import type { CodeGraph, CodeGraphNode } from "../../graph/types.js";
import { pisoDeclarado, presencia, presupuesto } from "../thresholds.js";
import type { CloneCandidate, InterFileDetector, RawFinding, RepoUnit, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "clientes" | "archivosQueChequean" | "protocoloDelColaborador" | "caracteresPorClon";

/**
 * Prefijos de `RoleLocation.role`. `hypotheses/null-object.ts` los importa para
 * recuperar, del `Finding`, cuál ubicación es cada cosa — mismo mecanismo que
 * `repeated-collaborator-set.ts#ROLE_REPEATS`/`ROLE_PIECE` (Ola AD).
 */
export const ROLE_CLIENTE = "chequea la ausencia";
export const ROLE_MEDIA_PUERTA = "sustituto neutro incompleto";

/* ────────────────────────────────────────────────────────────────────────
 * §A — EL CHEQUEO DE AUSENCIA, RECONOCIDO POR GRAMÁTICA
 *
 * Las tres formas de abajo son las MISMAS que `hypotheses/null-object.ts
 * #conditionGuard` ya reconoce desde F6, menos la negación truthy (ver (a) del
 * docstring), más la polaridad inversa (`!=`): las dos polaridades son el MISMO
 * hecho —el cliente TIENE QUE PREGUNTAR si el colaborador está—, y la fuerza es
 * la pregunta, no cuál de sus dos ramas escribió el autor.
 *
 * `null`/`nil`/`None`/`undefined` son LITERALES DE GRAMÁTICA (la palabra con la
 * que cada lenguaje escribe la ausencia), no vocabulario de dominio: el mismo
 * criterio y las mismas cuatro palabras que `conditionGuard` usa desde F6.
 * ──────────────────────────────────────────────────────────────────────── */

/** Una ruta de acceso: `x`, `ctx.doer`, `a?.b.c`, `@x`. */
const RUTA = String.raw`[A-Za-z_$@][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*`;
const COMPARA_CON_AUSENTE = new RegExp(String.raw`(${RUTA})\s*(?:===?|!==?)\s*(?:null|nil|None|undefined)\b`, "g");
const ES_NONE = new RegExp(String.raw`(${RUTA})\s+is\s+(?:not\s+)?None\b`, "g");
const NIL_INTERROGATIVO = new RegExp(String.raw`(${RUTA})\.nil\?`, "g");
const FORMAS_DE_CHEQUEO = [COMPARA_CON_AUSENTE, ES_NONE, NIL_INTERROGATIVO] as const;

/** El receptor PROPIO en las gramáticas que lo escriben: `self.`, `this.`, `@`. */
const RECEPTOR_PROPIO = /^(?:self|this)\.|^@/;

/** `?.` y `.` son la misma navegación para identificar al colaborador. */
function normalizarRuta(ruta: string): string {
  return ruta.replace(/\?\./g, ".");
}

/**
 * La IDENTIDAD del colaborador (condición F1), o `null` si no la tiene.
 *  - receptor propio ⇒ `<tipo dueño>.<resto>`: dos clases distintas con un
 *    campo homónimo NO son el mismo colaborador. Sin dueño conocido no hay
 *    identidad (se descarta, nunca se inventa una).
 *  - receptor ajeno ⇒ la ruta entera.
 *  - identificador desnudo ⇒ NO hay identidad: es una local/parámetro.
 */
function identidadDelColaborador(rutaCruda: string, className: string | null): string | null {
  const ruta = normalizarRuta(rutaCruda);
  if (RECEPTOR_PROPIO.test(ruta)) {
    const resto = ruta.replace(/^(?:self|this)\./, "").replace(/^@/, "");
    if (resto.length === 0) return null;
    return className === null ? null : `${className}.${resto}`.toLowerCase();
  }
  if (!ruta.includes(".")) return null;
  return ruta.toLowerCase();
}

/** Los DOS primeros tokens después del chequeo — la "forma" del comportamiento por defecto. Ver (d) del docstring: es evidencia, nunca compuerta. */
function formaDelDefecto(texto: string, desde: number): string {
  const cola = texto.slice(desde, desde + 90).replace(/^[^A-Za-z0-9_$]*/, "");
  return cola
    .split(/[^A-Za-z0-9_$.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
}

function escaparParaRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ────────────────────────────────────────────────────────────────────────
 * §B — LA FORMA PÚBLICA. `hypotheses/null-object.ts` importa `ausenciasRepetidas`
 * para reconstruir, desde el `Finding` ancla (por `variant`), el candidato
 * entero sin que el detector tenga que serializarlo en un `role`.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ClienteQueChequea {
  readonly file: string;
  readonly fn: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly formaDefecto: string;
}

export interface SustitutoNeutro {
  readonly id: string;
  readonly descripcion: string;
  /** Cuántos de los mensajes del colaborador declara por nombre. */
  readonly cubre: number;
  readonly instanciado: boolean;
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface AusenciaRepetida {
  /** Identidad del colaborador — también el `variant` del hallazgo. */
  readonly colaborador: string;
  readonly clientes: readonly ClienteQueChequea[];
  readonly archivos: readonly string[];
  /** Mensajes que los clientes le mandan al colaborador. */
  readonly mensajes: readonly string[];
  /** Los que resuelven a un miembro `function-like` de un tipo, en el grafo (condición F2). */
  readonly mensajesConProtocolo: readonly string[];
  readonly formasDefecto: readonly string[];
  /** Sustituto neutro COMPLETO e instanciado: si existe, este candidato NO se emite (condición R). */
  readonly sustitutoCompleto: SustitutoNeutro | null;
  /** El mejor sustituto neutro incompleto — "media puerta". `null` si no hay ninguno. */
  readonly mediaPuerta: SustitutoNeutro | null;
}

/**
 * Los pisos por defecto, EXPORTADOS para que la hipótesis reconstruya el mismo
 * candidato que el detector emitió sin depender de un `RunContext`. Son
 * `piso-declarado`/`presencia`, o sea que `resolveThreshold` los devuelve tal
 * cual (no hay `derivado` acá): el detector y la hipótesis leen el mismo número.
 */
export const UMBRALES_AUSENCIA_REPETIDA = {
  clientes: 4,
  archivosQueChequean: 2,
  protocoloDelColaborador: 1,
  caracteresPorClon: 40000,
} as const;

export interface UmbralesAusencia {
  readonly clientes: number;
  readonly archivosQueChequean: number;
  readonly protocoloDelColaborador: number;
  readonly caracteresPorClon: number;
}

interface Acumulado {
  clientes: Map<string, ClienteQueChequea>;
  mensajes: Set<string>;
  formas: Set<string>;
}

/* ── El índice de grafo de este detector. Cada detector arma el suyo, sin
 *    fábrica compartida — misma disciplina que `null-object.ts` §A declara. ── */
interface IndiceGrafo {
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
  readonly miembrosDe: ReadonlyMap<string, readonly CodeGraphNode[]>;
  readonly llamadasSalientes: ReadonlyMap<string, number>;
  readonly instanciacionesEntrantes: ReadonlyMap<string, number>;
  /** Tipos que alguien EXTIENDE/IMPLEMENTA/SATISFACE — son el PROTOCOLO, nunca la hoja neutra. */
  readonly esRaizDeProtocolo: ReadonlySet<string>;
  /** Nombre de miembro `function-like` con `memberOfClassLike` ⇒ existe (condición F2). */
  readonly nombresDeMiembro: ReadonlySet<string>;
}

const SPAN_TRIVIAL = 2;

/**
 * LAS DOS EXCLUSIONES QUE SEPARAN "EL PROTOCOLO" DE "LA HOJA NEUTRA" — portadas
 * VERBATIM, con su razón, de `hypotheses/null-object.ts#isProtocolRootType`/
 * `isDeclaredInterfaceType` (Ola Y, Y1), que las escribió después de medir sobre
 * archivos reales que `guava/Ticker` (clase ABSTRACTA) y `guava/TestSetGenerator`
 * (INTERFAZ) calificaban como objetos neutros. **Un tipo sin cuerpos no tiene
 * aristas `calls` salientes, así que su fan-out es cero POR CONSTRUCCIÓN: la
 * lectura es una tautología, no evidencia.** Y son, conceptualmente, lo
 * CONTRARIO del patrón: un Null Object es la implementación HOJA que cumple un
 * protocolo, nunca el protocolo.
 *
 * **AE10 lo verificó abriendo el archivo, y por eso está acá y no sólo copiado:**
 * sin estas dos exclusiones, `hugo` reportaba `common/loggers/logger.go#Logger`
 * —la interfaz de logging del repo, sin ninguna relación con el colaborador— como
 * "objeto neutro a medias" del candidato `po.pco`, sólo porque una interfaz no
 * llama a nadie. El efecto era degradar a `parcial` una hipótesis que es
 * `ausente`, o sea justo el estado que esta ola busca producir.
 */
const ARISTAS_DE_SUBTIPADO: ReadonlySet<string> = new Set(["extends", "implements", "satisfies", "mixes-in"]);
/** `shapeNodeType ?? nodeType`, el único lugar donde la gramática ya dijo cuál de las dos cosas es (`SymbolFamily` colapsa clase/struct/interfaz en `class-like`). Vocabulario de GRAMÁTICA (`interface_declaration`, `interface_type`), nunca de dominio. */
const TIPO_DE_NODO_INTERFAZ = /(^|_)interface(_|$)/;

function esInterfazDeclarada(n: CodeGraphNode): boolean {
  const declarado = n.shapeNodeType ?? n.nodeType;
  return declarado !== undefined && TIPO_DE_NODO_INTERFAZ.test(declarado);
}

function indexar(graph: CodeGraph): IndiceGrafo {
  const nodeById = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);

  const miembrosDe = new Map<string, CodeGraphNode[]>();
  const llamadasSalientes = new Map<string, number>();
  const instanciacionesEntrantes = new Map<string, number>();
  const esRaizDeProtocolo = new Set<string>();
  for (const e of graph.edges) {
    if (e.kind === "contains") {
      const hijo = nodeById.get(e.to);
      if (hijo && hijo.kind === "symbol") {
        const lista = miembrosDe.get(e.from);
        if (lista) lista.push(hijo);
        else miembrosDe.set(e.from, [hijo]);
      }
      continue;
    }
    if (e.kind === "calls") {
      llamadasSalientes.set(e.from, (llamadasSalientes.get(e.from) ?? 0) + 1);
      continue;
    }
    if (e.kind === "instantiates") {
      instanciacionesEntrantes.set(e.to, (instanciacionesEntrantes.get(e.to) ?? 0) + 1);
      continue;
    }
    if (ARISTAS_DE_SUBTIPADO.has(e.kind)) esRaizDeProtocolo.add(e.to);
  }

  const nombresDeMiembro = new Set<string>();
  for (const n of graph.nodes) {
    if (n.kind !== "symbol" || n.family !== "function-like") continue;
    if (n.memberOfClassLike !== true) continue;
    const ultimo = n.symbolPath[n.symbolPath.length - 1];
    if (ultimo !== undefined) nombresDeMiembro.add(ultimo);
  }

  return { nodeById, miembrosDe, llamadasSalientes, instanciacionesEntrantes, esRaizDeProtocolo, nombresDeMiembro };
}

function esConstructor(nombre: string, dueño: string | undefined): boolean {
  if (CONSTRUCTOR_NAMES.has(nombre.toLowerCase())) return true;
  return dueño !== undefined && nombre === dueño;
}

interface Neutro {
  readonly nodo: CodeGraphNode;
  readonly nombres: ReadonlySet<string>;
  readonly instanciado: boolean;
}

/**
 * Los tipos ESTRUCTURALMENTE NEUTROS del repo — la mitad estructural de la
 * condición (R). "Neutro" = todos sus miembros no-constructores (>=1) tienen
 * fan-out `calls` = 0 y un cuerpo que cabe en `SPAN_TRIVIAL` líneas. Es el
 * MISMO criterio que `hypotheses/null-object.ts#isStructurallyEmpty` aplica
 * desde la Ola 10 (fan-out cero + span trivial + exclusión del constructor),
 * escrito acá contra el grafo crudo porque un detector no puede importar una
 * hipótesis. Con su MISMO hueco declarado: fan-out cero significa "sin llamadas
 * que el grafo pudo RESOLVER", no "cuerpo vacío" — acá sólo puede hacer que el
 * detector se calle de más, nunca que emita de más.
 */
function tiposNeutros(idx: IndiceGrafo, graph: CodeGraph): readonly Neutro[] {
  const out: Neutro[] = [];
  for (const N of graph.nodes) {
    if (N.kind !== "symbol" || N.family !== "class-like") continue;
    // Las dos exclusiones de la Ola Y, portadas: el protocolo nunca es el
    // objeto neutro, y su fan-out cero es una tautología. Van ANTES del
    // recorrido de miembros porque son más baratas.
    if (idx.esRaizDeProtocolo.has(N.id)) continue;
    if (esInterfazDeclarada(N)) continue;
    const dueño = N.symbolPath[N.symbolPath.length - 1];
    const miembros = (idx.miembrosDe.get(N.id) ?? []).filter((m) => m.family === "function-like");
    const nombres = new Set<string>();
    let propios = 0;
    let neutro = true;
    for (const m of miembros) {
      const nombre = m.symbolPath[m.symbolPath.length - 1];
      if (nombre === undefined) continue;
      nombres.add(nombre);
      if (esConstructor(nombre, dueño)) continue;
      propios++;
      if ((idx.llamadasSalientes.get(m.id) ?? 0) > 0) {
        neutro = false;
        break;
      }
      if (m.startLine !== undefined && m.endLine !== undefined && m.endLine - m.startLine > SPAN_TRIVIAL) {
        neutro = false;
        break;
      }
    }
    if (!neutro || propios === 0) continue;
    out.push({ nodo: N, nombres, instanciado: (idx.instanciacionesEntrantes.get(N.id) ?? 0) > 0 });
  }
  return out;
}

function describir(n: CodeGraphNode): string {
  return n.symbolPath.length > 0 ? `${n.file}#${n.symbolPath.join(".")}` : n.file;
}

function aSustituto(n: Neutro, cubre: number): SustitutoNeutro {
  return {
    id: n.nodo.id,
    descripcion: describir(n.nodo),
    cubre,
    instanciado: n.instanciado,
    file: n.nodo.file,
    startLine: n.nodo.startLine ?? 1,
    endLine: n.nodo.endLine ?? n.nodo.startLine ?? 1,
  };
}

/**
 * UN CLIENTE ES UNA FUNCIÓN, NO UNA OCURRENCIA — y hay que descontar el
 * ANIDAMIENTO, porque si no un mismo chequeo se cuenta dos veces.
 *
 * `RepoUnit.clones` trae un candidato por CADA nodo de `cloneNodes` que pase el
 * piso de tamaño, y esos nodos se contienen unos a otros: el clon de un método
 * contiene el de la clausura que ese método define, y el texto del método
 * INCLUYE el texto de la clausura. Así que un chequeo escrito dentro de una
 * clausura se encuentra DOS veces —una como cliente "método", otra como cliente
 * "(anónima)"— y la condición de ESCALA (E1) contaría 2 donde el código escribe
 * 1.
 *
 * Se queda el cliente MÁS EXTERNO de cada anidamiento: un chequeo escrito una
 * vez pertenece a UNA función. Sólo puede BAJAR el conteo de clientes, nunca
 * subirlo, así que sólo puede hacer que un candidato no llegue al piso — nunca
 * inventar uno.
 */
function clientesExternos(todos: readonly ClienteQueChequea[]): ClienteQueChequea[] {
  return todos.filter(
    (c) => !todos.some((otro) => otro !== c && otro.file === c.file && otro.startLine <= c.startLine && otro.endLine >= c.endLine && (otro.startLine < c.startLine || otro.endLine > c.endLine)),
  );
}

/**
 * TODOS los candidatos del repo que pasan F1+F2+E1+E2+E3, con su condición (R)
 * ya resuelta en `sustitutoCompleto`/`mediaPuerta` — el que tenga
 * `sustitutoCompleto` NO es un hallazgo (el detector lo descarta), pero se
 * devuelve igual para que quien mida el embudo pueda contarlo.
 *
 * Puro respecto de `(repo.clones, repo.graph, umbrales)`; nunca lanza.
 */
export function ausenciasRepetidas(
  clones: readonly CloneCandidate[],
  graph: CodeGraph | null,
  umbrales: UmbralesAusencia = UMBRALES_AUSENCIA_REPETIDA,
): readonly AusenciaRepetida[] {
  if (!graph) return [];
  const idx = indexar(graph);

  const porColaborador = new Map<string, Acumulado>();
  for (const c of clones) {
    // Sólo clones-FUNCIÓN: el clon de una clase entera contiene el texto de
    // todos sus métodos, así que contarlo además del método duplicaría al
    // mismo cliente. Precio declarado: una guarda dentro de un método
    // demasiado corto para ser su propio clon queda fuera.
    if (c.functionName === null) continue;
    const texto = c.normalized;
    if (texto.length > umbrales.caracteresPorClon) continue;

    for (const forma of FORMAS_DE_CHEQUEO) {
      forma.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = forma.exec(texto)) !== null) {
        const rutaCruda = m[1]!;
        const colaborador = identidadDelColaborador(rutaCruda, c.className);
        if (colaborador === null) continue;

        let acc = porColaborador.get(colaborador);
        if (!acc) {
          acc = { clientes: new Map(), mensajes: new Set(), formas: new Set() };
          porColaborador.set(colaborador, acc);
        }

        const clave = `${c.file} ${c.functionName}`;
        const previo = acc.clientes.get(clave);
        const span = c.endLine - c.startLine;
        if (!previo || span < previo.endLine - previo.startLine) {
          acc.clientes.set(clave, {
            file: c.file,
            fn: c.functionName,
            startLine: c.startLine,
            endLine: c.endLine,
            formaDefecto: formaDelDefecto(texto, m.index + m[0].length),
          });
        }
        acc.formas.add(formaDelDefecto(texto, m.index + m[0].length));

        const mensajero = new RegExp(`${escaparParaRegex(rutaCruda)}\\??\\.([A-Za-z_$][\\w$]*)\\s*\\(`, "g");
        let mm: RegExpExecArray | null;
        while ((mm = mensajero.exec(texto)) !== null) acc.mensajes.add(mm[1]!);
      }
    }
  }

  if (porColaborador.size === 0) return [];
  const neutros = tiposNeutros(idx, graph);

  const out: AusenciaRepetida[] = [];
  for (const [colaborador, acc] of [...porColaborador].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    // Corto ANTES del descuento de anidamiento porque ese descuento sólo puede
    // BAJAR el conteo: lo que ya no llega al piso no va a llegar después. Es
    // trabajo ahorrado, no una compuerta.
    if (acc.clientes.size < umbrales.clientes) continue;
    const clientes = clientesExternos([...acc.clientes.values()]).sort((a, b) =>
      a.file === b.file ? a.startLine - b.startLine : a.file < b.file ? -1 : 1,
    );
    if (clientes.length < umbrales.clientes) continue; // (E1)
    const archivos = [...new Set(clientes.map((c) => c.file))].sort();
    if (archivos.length < umbrales.archivosQueChequean) continue; // (E2)

    const mensajes = [...acc.mensajes].sort();
    const mensajesConProtocolo = mensajes.filter((m) => idx.nombresDeMiembro.has(m));
    if (mensajesConProtocolo.length < umbrales.protocoloDelColaborador) continue; // (F2)+(E3)

    // (R) — el sustituto neutro tiene que cubrir TODOS los mensajes resueltos
    // y estar instanciado para que se considere "ya puesto".
    let completo: SustitutoNeutro | null = null;
    let media: SustitutoNeutro | null = null;
    for (const n of neutros) {
      let cubre = 0;
      for (const msg of mensajesConProtocolo) if (n.nombres.has(msg)) cubre++;
      if (cubre === 0) continue;
      if (cubre === mensajesConProtocolo.length && n.instanciado) {
        completo = aSustituto(n, cubre);
        break;
      }
      if (!media || cubre > media.cubre) media = aSustituto(n, cubre);
    }

    out.push({
      colaborador,
      clientes,
      archivos,
      mensajes,
      mensajesConProtocolo,
      formasDefecto: [...acc.formas].sort(),
      sustitutoCompleto: completo,
      mediaPuerta: completo ? null : media,
    });
  }
  return out;
}

export const detector: InterFileDetector<ThresholdKey, "repeated-absence-check"> = {
  id: "repeated-absence-check",
  kind: "repeated-absence-check",
  scope: "inter-file",
  // Compuerta DURA y honesta: sin grafo no se puede contestar (F2) —el
  // colaborador no queda anclado a ningún protocolo— ni la condición (R). Sin
  // grafo este detector no tiene nada que decir, no "encuentra cero".
  needsGraph: true,
  title: "El mismo colaborador, chequeado contra ausente en cada cliente",
  needs: [],
  thresholds: {
    clientes: pisoDeclarado(4, {
      rationale:
        "cuántas funciones distintas tienen que chequear la ausencia del MISMO colaborador para que un objeto neutro pague. Null Object compite con una mitigación que existe siempre y cuesta O(1): poner el default UNA VEZ, en el accesor o en el productor del colaborador. Con DOS clientes la respuesta es extraer una función compartida; con TRES sigue siendo más barato el default en el accesor. CUATRO es el primer número en el que el chequeo ya está escrito más veces de las que un accesor solo suele centralizar, y donde declarar un tipo que implemente el protocolo y sustituirlo en el sitio de producción sale más barato que mantener los chequeos. Es a propósito MÁS EXIGENTE que el NULL_OBJECT_MIN_OCCURRENCES = 3 que hypotheses/null-object.ts declara [provisional] desde F6 y que nunca se re-derivó: la Ola AC midió que quedarse en el piso viejo es el modo documentado de fallar la condición de ESCALA. Piso de ESCALA declarado, no una magnitud calibrada contra un corpus.",
    }),
    archivosQueChequean: pisoDeclarado(2, {
      rationale:
        "el chequeo tiene que CRUZAR el archivo. Si los N clientes viven en el mismo archivo, una función privada de ese archivo (o un accesor privado del mismo tipo, cuando el colaborador es un miembro propio) los borra sin declarar ningún tipo nuevo: proponer un objeto neutro ahí sería más caro que el problema. Es la misma pregunta binaria, y la misma razón, que la condición (3) de repeated-collaborator-set (Ola AD).",
    }),
    protocoloDelColaborador: presencia({
      rationale:
        "al colaborador hay que MANDARLE al menos un mensaje que el grafo resuelva a un miembro de un tipo. Es presencia/ausencia y no una magnitud: un objeto neutro existe para contestar mensajes, así que con UNO ya hay protocolo que implementar y con CERO lo que falta es un valor por defecto, no un objeto. Doble función declarada: es también el único anclaje del colaborador contra el grafo que este proyecto permite, porque los CAMPOS no son nodos del grafo (medido en gitea: `Doer` no tiene ni un nodo; `DisplayName`, `HTMLURL` y `LoadOwner` tienen 7, 5 y 5, todos `function-like` con `memberOfClassLike`).",
    }),
    caracteresPorClon: presupuesto(40000, {
      rationale:
        "tope de TRABAJO, no de detección: el texto de un clon puede llegar a 400 líneas (`code-analyzer.ts#MAX_TEXT_SPAN_LINES`) y este detector lo barre con tres expresiones regulares por clon sobre repos de decenas de miles de clones (guava: 27.182 clones-función). Saltear un clon gigante sólo puede hacer que un candidato NO se encuentre — nunca inventa uno.",
    }),
  },
  maxFindings: presupuesto(200, {
    rationale:
      "tope de volumen por repo, del mismo orden que el resto del catálogo inter-file. Medido: el repo más poblado de las dos poblaciones (gitea) queda muy por debajo con estos pisos, así que hoy no recorta nada — está para que un repo atípico no publique cientos de tarjetas del mismo kind.",
  }),
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph === null`
    // ANTES de llamar a `run()` — mismo comentario que `god-component.ts`.
    if (!repo.graph) return [];

    const umbrales: UmbralesAusencia = {
      clientes: ctx.threshold("clientes").value,
      // `pisoDeclarado(2)` ⇒ la comparación es `>= 2`, ver `ausenciasRepetidas`.
      archivosQueChequean: ctx.threshold("archivosQueChequean").value,
      // `presencia` ⇒ value 1 ⇒ la comparación es `>= 1`.
      protocoloDelColaborador: ctx.threshold("protocoloDelColaborador").value,
      caracteresPorClon: ctx.threshold("caracteresPorClon").value,
    };

    const candidatos = ausenciasRepetidas(repo.clones, repo.graph, umbrales);
    const findings: RawFinding[] = [];
    for (const c of candidatos) {
      // (R) RESOLUCIÓN VERIFICADA — el objeto neutro ya existe y ya se usa:
      // silencio. La mitigación correcta es "usá el que ya hay", que es otra
      // refactorización, no ésta.
      if (c.sustitutoCompleto) continue;

      const locations: RoleLocation[] = c.clientes.map((cl) => ({
        file: cl.file,
        startLine: cl.startLine,
        endLine: cl.endLine,
        symbol: cl.fn,
        role: `${ROLE_CLIENTE} de "${c.colaborador}" y decide por su cuenta qué hacer (${cl.formaDefecto || "sin cola legible"})`,
      }));
      if (c.mediaPuerta) {
        locations.push({
          file: c.mediaPuerta.file,
          startLine: c.mediaPuerta.startLine,
          endLine: c.mediaPuerta.endLine,
          role: `${ROLE_MEDIA_PUERTA}: cubre ${c.mediaPuerta.cubre} de ${c.mensajesConProtocolo.length} mensaje(s)${c.mediaPuerta.instanciado ? " y ya se instancia" : " y todavía no se instancia"}`,
        });
      }
      if (locations.length === 0) continue;

      findings.push({
        variant: c.colaborador,
        title: `${c.clientes.length} lugares chequean si "${c.colaborador}" está ausente`,
        detail:
          `${c.clientes.length} funciones distintas, repartidas en ${c.archivos.length} archivos, comparan "${c.colaborador}" contra el valor ausente antes de usarlo, y cada una decide por su cuenta qué hacer cuando no está (${c.formasDefecto.length} continuaciones distintas). ` +
          `Los clientes le mandan ${c.mensajes.length} mensaje(s), de los cuales ${c.mensajesConProtocolo.length} resuelven a un miembro de un tipo en el grafo: ${c.mensajesConProtocolo.slice(0, 6).join(", ")}. ` +
          "Esto no afirma que falte un patrón: es la evidencia cruda de la SITUACIÓN (el mismo chequeo de ausencia escrito de nuevo en cada cliente) — " +
          "si conviene un objeto neutro, si ya hay uno a medias, o si la ausencia es una condición de error que corresponde hacer fallar rápido, lo decide la hipótesis correspondiente, no este detector.",
        trigger: [
          { label: "funciones distintas que chequean su ausencia", value: c.clientes.length, threshold: ctx.threshold("clientes") },
          { label: "archivos distintos donde vive el chequeo", value: c.archivos.length, threshold: ctx.threshold("archivosQueChequean") },
          { label: "mensajes del colaborador resueltos a un miembro de un tipo", value: c.mensajesConProtocolo.length, threshold: ctx.threshold("protocoloDelColaborador") },
        ],
        evidence: [
          { label: "comportamientos por defecto distintos", value: c.formasDefecto.length, note: c.formasDefecto.slice(0, 6).join(" | ") },
          { label: "mensajes que el grafo NO resolvió", value: c.mensajes.length - c.mensajesConProtocolo.length, note: "lo ambiguo viaja como ambiguo: puede ser un método de una dependencia externa o un campo" },
          {
            label: "sustitutos neutros que ya cubren TODO el protocolo",
            value: 0,
            note: "condición de RESOLUCIÓN VERIFICADA: si hubiera uno instanciado, este hallazgo no existiría",
          },
        ],
        locations: locations as [RoleLocation, ...RoleLocation[]],
        severity: Math.min(100, 20 + c.clientes.length * 3 + c.archivos.length * 2),
        advice: {
          primary: {
            name: "Introduce Special Case",
            kind: "refactorizacion",
            why:
              `El chequeo contra ausente de "${c.colaborador}" está escrito en ${c.clientes.length} funciones de ${c.archivos.length} archivos. ` +
              "Un caso especial que conteste los mismos mensajes deja a cada cliente sin la pregunta.",
            source: "https://refactoring.com/catalog/introduceSpecialCase.html",
          },
        },
      });
    }
    return findings;
  },
};
