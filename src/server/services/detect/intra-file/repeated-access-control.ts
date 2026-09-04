/**
 * `repeated-access-control` — EL ANCLA-FUERZA DE PROXY (Ola AE, frente AE13).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA FUERZA QUE PROXY RESUELVE, escrita como la resuelve el patrón
 * ─────────────────────────────────────────────────────────────────────────
 *
 * *Hay que INTERPONER un control —acceso, carga diferida, caché, conteo—
 * entre el cliente y el objeto, y ese control está REPETIDO EN CADA CLIENTE
 * en vez de vivir detrás de una sola puerta con la misma interfaz.*
 *
 * Este detector NO ancla en un síntoma correlacionado (clase grande, firma
 * larga, campo temporal — los tres medidos y fallidos en olas anteriores).
 * Ancla en la situación literal: **el MISMO control gobierna el acceso al
 * MISMO objeto desde N miembros distintos, y ninguno de ellos pasa por una
 * puerta.**
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LAS TRES CONDICIONES DE LA RECETA, CADA UNA CON SU INTENCIÓN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * (1) FUERZA — EL CONTROL GOBIERNA EL ACCESO AL OBJETO. No alcanza con que
 *     el condicional exista en el mismo miembro: el uso del objeto tiene que
 *     estar DENTRO del condicional, o el condicional tiene que ser una
 *     SALIDA TEMPRANA (`return`/`throw`/`raise`/`break`/`continue` en su
 *     subárbol) situada ANTES del uso. Ésa es la diferencia entre "acá hay
 *     un `if` y acá se usa un campo" (correlación) y "acá se INTERPONE un
 *     control entre el cliente y el objeto" (la fuerza).
 *
 * (2) FUERZA — EL CONTROL ES EL MISMO. Se agrupa por el TEXTO NORMALIZADO de
 *     la condición. Dos miembros que consultan cosas distintas antes de usar
 *     el mismo objeto no repiten un control: hacen dos cosas distintas. Que
 *     el texto sea idéntico es lo que convierte "varios ifs" en "la misma
 *     lógica de control copiada". Cubre de una sola vez las cuatro formas
 *     que el patrón nombra —control de acceso (`if (!user.canRead()) return`),
 *     carga diferida (`if (x == null)`), caché (`if (!cache.has(k))`) y
 *     conteo/traza (`if (!isDebugMode()) return`)— sin listar ni un nombre
 *     de dominio: la condición se compara consigo misma, nunca contra un
 *     vocabulario.
 *
 * (3) ESCALA — `lugaresQueRepiten >= 3`. RAZÓN, ESCRITA ANTES DE MEDIR: con
 *     DOS miembros la mitigación más barata es extraer una función privada
 *     compartida y llamarla desde los dos sitios; abrir una puerta con la
 *     interfaz del objeto no paga. Es exactamente la condición de ESCALA que
 *     AC2 midió que le faltaba a su ancla de State (7 máquinas de estados
 *     REALES, 6 de ellas con 2-4 estados de una línea) y la misma razón, con
 *     el mismo número, que AD4 escribió para `lugares` en Facade.
 *
 * (4) RESOLUCIÓN VERIFICADA, PUERTA DE ADENTRO — ninguno de los miembros que
 *     repiten es INVOCADO por otro miembro del mismo grupo. INTENCIÓN: *si
 *     uno de ellos ya fuera la puerta, los demás lo llamarían en vez de
 *     repetir el control.* Hace falta como chequeo propio porque una puerta
 *     escrita como UN miembro que hace "control + acceso" tiene, en el
 *     árbol, exactamente la misma forma que un miembro más que repite: lo
 *     único que las distingue es si los demás pasan por ella.
 *
 * (5) RESOLUCIÓN VERIFICADA, PUERTA YA EXISTENTE EN LA UNIDAD — no hay otro
 *     miembro CORTO (cuerpo de <= `PUERTA_MAX_SENTENCIAS` sentencias) que
 *     tenga el MISMO control y toque el MISMO objeto y a quien alguien ya
 *     llame. INTENCIÓN: *si la puerta ya está escrita, lo que falta es
 *     USARLA, y ésa es OTRA refactorización.* El detector se CALLA ahí — es
 *     el mismo silencio que AD4 midió como la condición más selectiva de su
 *     ancla, y hay tests que lo exigen.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ ES "EL OBJETO", Y POR QUÉ NO ES VOCABULARIO
 * ─────────────────────────────────────────────────────────────────────────
 *
 * El objeto es un ACCESO AL ESTADO PROPIO usado como RECEPTOR de algo:
 * `this.x.m()` / `self.x.m()` / `@x.m()` / `recv.x.m()` (Go) / `x.m()` cuando
 * `x` es un campo DECLARADO por la gramática en la unidad contenedora y NO
 * está ligado dentro del miembro (parámetro o local). Ninguna lista de
 * nombres, ningún lexema de dominio: sólo tipos de nodo y el hecho
 * gramatical "esta declaración es un campo de esta unidad".
 *
 * LA VÍA DEL CAMPO DESNUDO ES OBLIGATORIA, Y ESTÁ MEDIDA: sin ella el
 * detector daba **0 hallazgos en guava (1.983 archivos Java) y 0 en
 * newtonsoft-json (241 archivos C#)** — no porque la forma no exista ahí,
 * sino porque Java y C# escriben el campo propio DESNUDO por convención
 * (`locks.compareAndSet(...)`, no `this.locks...`). Con la vía puesta, en el
 * árbol final: **45 hallazgos en guava y 8 en newtonsoft-json**. Un detector
 * que sólo mirara `this.`/`self.`/`@` habría declarado un silencio falso en
 * los dos lenguajes de mayor volumen del corpus.
 *
 * EL SOMBREADO SE RESUELVE, NO SE IGNORA: un nombre que el miembro LIGA
 * (parámetro o variable local) deja de contar como campo dentro de ESE
 * miembro. Sin esta resta, `Iterables.filter(Iterable iterable, ...)` de
 * guava leía su propio parámetro `iterable` como campo de la clase porque
 * una clase ANIDADA declaraba un campo con ese nombre — medido y corregido
 * (los campos se recolectan sin descender a unidades anidadas, y además se
 * resta lo ligado en el miembro).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ NO ES UN CONTROL — MEDIDO, NO SUPUESTO
 * ─────────────────────────────────────────────────────────────────────────
 *
 * UN BUCLE NO ES UN CONTROL INTERPUESTO: es iteración. La primera versión
 * aceptaba cualquier nodo de rama con campo `condition`, y el resultado
 * medido sobre guava fue que la clase de falso MÁS grande era
 * `for (int i = 0; i < reps; i++)` en los benchmarks —`i < reps` repetido en
 * 8 métodos del mismo archivo, con el mismo campo tocado adentro—. Excluir
 * los tipos de nodo de forma de bucle bajó guava **de 87 a 55 hallazgos en
 * esa iteración**, y las 32 que se fueron eran TODAS de esa forma. Se excluye
 * por FORMA DEL NOMBRE DE TIPO (`LOOP_NODE_TYPE`), el mismo criterio genérico
 * con el que este proyecto ya reconoce `CALL_NODE_TYPE`/`COMMENT_NODE_TYPE`,
 * nunca por lenguaje.
 *
 * Y UN NODO CON `condition` PERO SIN RAMA TAMPOCO ES UN CONTROL: la
 * navegación segura de C# (`reader.Value?.ToString`) parsea como
 * `conditional_access_expression` con campo `condition` y nada más
 * (confirmado por sonda directa). Por eso `esControl` exige ADEMÁS una rama
 * (`consequence`/`body`/`alternative`/`then`).
 *
 * POR QUÉ `esControl` Y NO `sets.branchNodes`, MEDIDO: ese conjunto lo deriva
 * `code-grammar.ts` de una SONDA por lenguaje, y los MODIFICADORES de Ruby
 * (`return nil unless @ready`, nodo `unless_modifier` con `condition`+`body`,
 * confirmado por sonda directa contra `tree-sitter-ruby`) no entran ahí —
 * la forma que la derivación testea pide `alternative`, y un modificador no
 * lo tiene. Ruby escribe la guarda de salida así casi siempre, así que
 * apoyarse en `branchNodes` dejaba el detector MUDO en los cuatro repos ruby
 * del corpus. Con la forma de nodo, `corpus-app/chatwoot` produce 7 y
 * `corpus-app/redmine` 2.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA BRECHA QUE DECLARO Y NO CIERRO
 * ─────────────────────────────────────────────────────────────────────────
 *
 * EL ALCANCE ES LA UNIDAD, NO EL REPO. La fuerza dice "repetido en cada
 * CLIENTE" y este detector lee "repetido en cada MIEMBRO de la unidad que
 * tiene el objeto". Los clientes de OTROS archivos no se ven. La razón es de
 * granularidad, no de gusto: comparar el ÁRBOL de varios archivos a la vez
 * no lo permite ninguna granularidad de detector de este analizador (un
 * `inter-file` recibe `RepoUnit`, que ya liberó los árboles — ver
 * `detect/types.ts#RepoFunctionUnit`), y sin árbol no hay condicional ni
 * orden, que son las dos mitades de la condición (1). Queda escrito en el
 * `toConfirm` de la hipótesis para que quien la lea sepa qué NO se verificó.
 *
 * DUPLICACIÓN DECLARADA: las primitivas de forma (`namedChildren`,
 * `objectOf`, `isSelfFieldAccess`, `goReceiverOf`, ...) son copia deliberada
 * del mismo subconjunto que `hypotheses/proxy.ts` y
 * `detect/intra-file/lazy-init-repetida.ts` ya traen — `detect/*` no puede
 * importar de `hypotheses/*` (capas invertidas) y no soy dueño del segundo.
 * Mismo criterio que esos dos archivos ya declaran para sí mismos.
 *
 * RELACIÓN CON `lazy-init-repetida`, que es su hermano y NO su reemplazo:
 * aquél exige que la guarda CONSTRUYA el campo (`if (!x) x = new Y()`), o
 * sea sólo el proxy VIRTUAL, y por eso emite 2 hallazgos en los 13 repos y 4
 * en `corpus-app/` (medido hoy). Éste no pide construcción: pide que el
 * MISMO control gobierne el acceso, que es el envolvente de las cuatro
 * formas del patrón. Los dos conviven; no se toca ni una línea del otro.
 */
import { pisoDeclarado, presencia } from "../thresholds.js";
import type { AstNode, FileUnit, IntraFileDetector, RawFinding, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "lugaresQueRepiten" | "objetoConControl";

/* ── Primitivas de forma (duplicación declarada, ver el docstring) ─────── */

/** Cualquier nodo "de comentario", por FORMA del nombre de tipo. Se excluye
 *  de `namedChildren` porque en varias gramáticas un comentario ES un hijo
 *  NOMBRADO del bloque que lo contiene, y eso inflaría el conteo de
 *  sentencias con el que se decide si un miembro es una puerta CORTA. */
const COMMENT_NODE_TYPE = /comment/i;

/** Nodo de BUCLE por FORMA del nombre de tipo — un bucle NO interpone un
 *  control ante el acceso: itera. Ver "QUÉ NO ES UN CONTROL" arriba. */
const LOOP_NODE_TYPE = /(^|_)(while|until|for|foreach|each|loop|do)(_|$)/i;

/** Ranuras con que las gramáticas nombran la RAMA de un condicional. Un nodo
 *  con `condition` PERO SIN rama no es un control: es navegación segura
 *  (`reader.Value?.ToString` de C# parsea como `conditional_access_expression`
 *  con campo `condition` y nada más). Se exige la rama para que "condicional"
 *  signifique lo que dice. */
const BRANCH_FIELDS = ["consequence", "body", "alternative", "then"] as const;

/** Salida del flujo, por FORMA del nombre de tipo — lo que convierte un
 *  condicional en una GUARDA que gobierna todo lo que viene después. */
const EXIT_NODE_TYPE = /(^|_)(return|throw|raise|break|continue|yield_break)(_|$)/i;

/** Tipos de nodo que PUEDEN llevar un receptor, por FORMA del nombre de tipo
 *  (acceso a miembro, selector, atributo, campo, llamada, índice). Sin este
 *  filtro, el campo `expression` —que en varias gramáticas cuelga de nodos
 *  que no son un acceso (patrón, cast, paréntesis)— haría leer un receptor
 *  donde no hay ninguno. */
const RECEIVER_HOST_TYPE = /(member|selector|attribute|field|call|invocation|subscript|index|element_access)/i;

/** Declaración de campo/propiedad, por FORMA del nombre de tipo. */
const FIELD_DECL_TYPE = /(^|_)(field|property)_declaration$/;

/** Ruby: `@x` es un único token con sigilo, sin receptor explícito. */
const RUBY_IVAR_TYPE = "instance_variable";
const SELF_WORDS: ReadonlySet<string> = new Set(["this", "self"]);
/** Las cuatro ranuras con que las gramáticas soportadas nombran al receptor
 *  de un acceso: `object` (JS/TS/Python/Java), `operand` (Go), `receiver`
 *  (Ruby/Go), `expression` (C#). La capa por lenguaje TRADUCE, no decide. */
const RECEIVER_FIELDS = ["object", "operand", "receiver", "expression"] as const;

/** Cuántas sentencias puede tener un miembro para contar como "la puerta ya
 *  escrita" en la condición (5). Presupuesto de FORMA, no umbral de
 *  detección: una puerta es "control + acceso", dos o tres sentencias; un
 *  miembro largo que casualmente repite el control es un cliente más, no una
 *  puerta. Sólo puede hacer que el detector EMITA de más, nunca de menos. */
const PUERTA_MAX_SENTENCIAS = 3;

/**
 * ESCALA — cuántos miembros distintos tienen que repetir el MISMO control
 * sobre el MISMO objeto. Exportado para que `hypotheses/proxy.ts` re-escanee
 * con EL MISMO piso que el detector usó al emitir (y para que
 * `hypotheses/threshold-alignment.test.ts` pueda verificar que son el mismo
 * número, no dos copias que se desincronizan). La RAZÓN está en el
 * `thresholds` de abajo, escrita antes de medir.
 */
export const LUGARES_QUE_REPITEN_MIN = 3;

/** Tope de profundidad de recorrido — presupuesto de trabajo, nunca decide. */
const MAX_DEPTH = 80;

/** Largo máximo del texto de una condición que se considera "el mismo
 *  control". Presupuesto: una condición de 200 caracteres ya no es un
 *  control repetido sino una expresión propia de cada sitio, y compararla
 *  entera cuesta sin decidir nada. */
const MAX_COND_CHARS = 200;

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && !COMMENT_NODE_TYPE.test(c.type)) out.push(c);
  }
  return out;
}

function objectOf(node: AstNode): AstNode | null {
  if (!RECEIVER_HOST_TYPE.test(node.type)) return null;
  for (const f of RECEIVER_FIELDS) {
    const c = node.childForFieldName(f) as AstNode | null;
    if (c) return c;
  }
  return null;
}

/** Mismo nodo, comparado POR POSICIÓN y no por identidad: los envoltorios de
 *  `node.child(i)` se crean frescos en cada llamada, así que `===` entre dos
 *  lecturas del mismo nodo es SIEMPRE falso — encontrado midiendo (la primera
 *  versión de la sonda daba CERO grupos en los 16 repos por esto). */
function samePos(a: AstNode, b: AstNode): boolean {
  return (
    a.startPosition.row === b.startPosition.row &&
    a.startPosition.column === b.startPosition.column &&
    a.endPosition.row === b.endPosition.row &&
    a.endPosition.column === b.endPosition.column
  );
}

function memberNameOf(node: AstNode): string | null {
  const obj = objectOf(node);
  if (!obj) return null;
  for (let i = node.childCount - 1; i >= 0; i--) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && !samePos(c, obj)) return c.text;
  }
  return null;
}

/** `true` si `node` es un acceso al estado propio de la unidad: sigilo Ruby,
 *  receptor `this`/`self`/el receptor de Go, o un identificador desnudo que
 *  la gramática declaró como campo de la unidad y que el miembro NO liga. */
function isOwnStateAccess(node: AstNode, selfNames: ReadonlySet<string>, fields: ReadonlySet<string>): boolean {
  if (node.type === RUBY_IVAR_TYPE) return true;
  if (fields.has(node.text)) return true;
  const obj = objectOf(node);
  return obj !== null && selfNames.has(obj.text);
}

/** Si `node` es un acceso/llamada a un MIEMBRO del propio receptor
 *  (`this.m(...)` / `self.m(...)` / `recv.m(...)` / `@obj.m` con receptor
 *  desnudo `this`), devuelve el nombre de ese miembro. Es la mitad que
 *  `isOwnStateAccess` NO cubre: aquélla mira el CAMPO (`this.logger`), ésta
 *  mira el MIEMBRO invocado sobre el propio receptor (`this.trace`). */
function ownMemberNameOf(node: AstNode, selfNames: ReadonlySet<string>): string | null {
  const recv = objectOf(node);
  if (!recv || !selfNames.has(recv.text)) return null;
  return memberNameOf(node);
}

function ownStateKeyOf(node: AstNode, fields: ReadonlySet<string>): string {
  if (node.type === RUBY_IVAR_TYPE) return node.text;
  if (fields.has(node.text)) return node.text;
  return memberNameOf(node) ?? node.text;
}

/** Único vehículo de Go para "campo propio" y "unidad dueña": el `receiver`
 *  de un método libre — Go no tiene ni `this` ni `class`. */
function goReceiverOf(fnNode: AstNode): { paramName: string; typeName: string } | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  const decl = namedChildren(receiver)[0] ?? receiver;
  const paramName = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
  let typeNode: AstNode | null = null;
  const queue: AstNode[] = [decl];
  let guard = 0;
  while (queue.length > 0 && guard++ < 64) {
    const n = queue.shift()!;
    if (n.type === "type_identifier") {
      typeNode = n;
      break;
    }
    queue.push(...namedChildren(n));
  }
  if (!paramName || !typeNode) return null;
  return { paramName, typeName: typeNode.text };
}

/**
 * EL CONTROL: un condicional de verdad — tiene CONDICIÓN y tiene RAMA, y no
 * es un bucle.
 *
 * NO se usa `sets.branchNodes` y la razón está medida: ese conjunto lo deriva
 * `code-grammar.ts` de una SONDA por lenguaje, y los MODIFICADORES de Ruby
 * (`return nil unless @ready`, nodo `unless_modifier` con `condition`+`body`,
 * confirmado por sonda directa contra `tree-sitter-ruby`) no entran ahí. Ruby
 * escribe la guarda de salida con el modificador casi siempre, así que
 * apoyarse en `branchNodes` dejaba el detector MUDO en los cuatro repos ruby
 * del corpus. La forma se decide por la FORMA DEL NODO, que es lo que este
 * proyecto ya hace para reconocer llamadas y comentarios.
 */
function esControl(node: AstNode): AstNode | null {
  if (LOOP_NODE_TYPE.test(node.type)) return null;
  const cond = node.childForFieldName("condition") as AstNode | null;
  if (!cond) return null;
  for (const f of BRANCH_FIELDS) if (node.childForFieldName(f)) return cond;
  return null;
}

function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Recorre el cuerpo PROPIO: se detiene al entrar en un miembro anidado.
 *
 *  NO ES COSMÉTICO Y ESTÁ MEDIDO: sin esta parada, una función y las dos
 *  clausuras anidadas dentro de ella cuentan la MISMA guarda tres veces y el
 *  grupo llega a 3 miembros sin que exista ninguna repetición — medido sobre
 *  `nest`, donde 3 de 8 grupos eran exactamente eso
 *  (`router-explorer.ts#applyCallbackToRouter` + sus dos clausuras). */
function walkOwn(node: AstNode, stopAt: ReadonlySet<string>, visit: (n: AstNode) => void, depth = 0): void {
  if (depth > MAX_DEPTH) return;
  visit(node);
  for (const c of namedChildren(node)) {
    if (stopAt.has(c.type)) continue;
    walkOwn(c, stopAt, visit, depth + 1);
  }
}

/** Los nombres que la gramática declara como campo/propiedad de ESTA unidad,
 *  sin descender a unidades anidadas ni a cuerpos de miembro. */
function declaredFieldsOf(clsNode: AstNode, fnStop: ReadonlySet<string>, clsStop: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  const rec = (n: AstNode, depth: number): void => {
    if (depth > 40) return;
    if (FIELD_DECL_TYPE.test(n.type)) {
      const named = n.childForFieldName("name") as AstNode | null;
      if (named) out.add(named.text);
      const rec2 = (x: AstNode, d2: number): void => {
        if (d2 > 12) return;
        if (/variable_declarator/.test(x.type)) {
          const nm = (x.childForFieldName("name") as AstNode | null) ?? namedChildren(x)[0] ?? null;
          if (nm) out.add(nm.text);
        }
        for (const c of namedChildren(x)) rec2(c, d2 + 1);
      };
      rec2(n, 0);
      return;
    }
    for (const c of namedChildren(n)) {
      if (fnStop.has(c.type)) continue;
      if (c !== n && clsStop.has(c.type)) continue;
      rec(c, depth + 1);
    }
  };
  rec(clsNode, 0);
  return out;
}

/** Nombres LIGADOS dentro del miembro (parámetros + variables locales): un
 *  identificador ligado acá NO es el campo de la unidad aunque se llame
 *  igual — el sombreado se resuelve, no se ignora. */
function boundNamesOf(fnNode: AstNode, body: AstNode, fnStop: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  const params = fnNode.childForFieldName("parameters") as AstNode | null;
  if (params) {
    const rec = (n: AstNode, depth: number): void => {
      if (depth > 10) return;
      const nm = n.childForFieldName("name") as AstNode | null;
      if (nm) out.add(nm.text);
      else if (/identifier/.test(n.type)) out.add(n.text);
      for (const c of namedChildren(n)) rec(c, depth + 1);
    };
    rec(params, 0);
  }
  walkOwn(body, fnStop, (n) => {
    if (!/variable_declarator|declaration_pattern/.test(n.type)) return;
    const nm = (n.childForFieldName("name") as AstNode | null) ?? namedChildren(n)[0] ?? null;
    if (nm) out.add(nm.text);
  });
  return out;
}

/* ── El barrido ────────────────────────────────────────────────────────── */

interface Miembro {
  name: string;
  startLine: number;
  endLine: number;
  fnNode: AstNode;
  body: AstNode;
  selfNames: ReadonlySet<string>;
  fields: ReadonlySet<string>;
  unitKey: string;
  unitName: string;
}

interface Control {
  text: string;
  startLine: number;
  endLine: number;
  /** El condicional contiene una salida del flujo: gobierna lo que sigue. */
  esSalidaTemprana: boolean;
  /**
   * La CONDICIÓN delega en un miembro de la propia unidad (`if (!this.isDebugMode())`)
   * en vez de leer estado crudo (`if (value == null)`). Es la mitad de la
   * puerta que YA está construida: la DECISIÓN está centralizada, la
   * INTERPOSICIÓN no. Es lo que separa `parcial` de `ausente` en la hipótesis.
   */
  delegaLaDecision: boolean;
}

export interface LugarQueRepite {
  memberName: string;
  startLine: number;
  endLine: number;
  guardLine: number;
  usoLine: number;
  /** El uso está DENTRO del condicional (vs. guarda de salida anterior). */
  dentro: boolean;
}

export interface AccessControlGrupo {
  unitKey: string;
  unitName: string;
  objeto: string;
  control: string;
  /** Ver `Control.delegaLaDecision`. */
  delegaLaDecision: boolean;
  lugares: LugarQueRepite[];
}

/** El resultado del barrido de un archivo, expuesto para los tests y para
 *  la sonda de medición — nunca para producción, que consume `run`. */
export interface AccessControlScan {
  grupos: readonly AccessControlGrupo[];
  embudo: Record<string, number>;
}

export function scanRepeatedAccessControl(file: Pick<FileUnit, "path" | "root" | "sets">, minLugares: number): AccessControlScan {
  const sets = file.sets;
  const embudo: Record<string, number> = {
    gruposCrudos: 0,
    descartadosPorEscala: 0,
    descartadosPorPuertaAdentro: 0,
    descartadosPorPuertaYaEscrita: 0,
    descartadosPorDedupe: 0,
    controlNoGobierna: 0,
  };

  /* Paso 1: los miembros, con su unidad y su noción de "estado propio". */
  const miembros: Miembro[] = [];
  const visit = (node: AstNode, unit: { name: string; key: string; fields: ReadonlySet<string> } | null, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    let next = unit;
    if (sets.classNodes.has(node.type)) {
      const name = (node.childForFieldName("name") as AstNode | null)?.text ?? `(anónima)@${node.startPosition.row}`;
      next = { name, key: `${name}@${node.startPosition.row}`, fields: declaredFieldsOf(node, sets.functionNodes, sets.classNodes) };
    } else if (sets.functionNodes.has(node.type)) {
      const go = goReceiverOf(node);
      const selfNames = new Set(SELF_WORDS);
      let owner = next;
      if (go) {
        selfNames.add(go.paramName);
        owner = { name: go.typeName, key: `receiver:${go.typeName}`, fields: new Set<string>() };
      }
      const body = (node.childForFieldName("body") as AstNode | null) ?? (node.childForFieldName("consequence") as AstNode | null);
      if (owner && body) {
        const bound = boundNamesOf(node, body, sets.functionNodes);
        const fields = new Set([...owner.fields].filter((f) => !bound.has(f)));
        miembros.push({
          name: (node.childForFieldName("name") as AstNode | null)?.text ?? "(anónima)",
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          fnNode: node,
          body,
          selfNames,
          fields,
          unitKey: owner.key,
          unitName: owner.name,
        });
      }
    }
    for (const c of namedChildren(node)) visit(c, next, depth + 1);
  };
  visit(file.root, null, 0);

  /** Los nombres de miembro de cada unidad — el hecho con el que se decide si
   *  la CONDICIÓN delega en un miembro propio (media puerta ya construida). */
  const miembrosDeLaUnidad = new Map<string, Set<string>>();
  for (const m of miembros) {
    const s0 = miembrosDeLaUnidad.get(m.unitKey) ?? new Set<string>();
    s0.add(m.name);
    miembrosDeLaUnidad.set(m.unitKey, s0);
  }

  /* Paso 2: por miembro, los objetos usados y los controles escritos. */
  const grupos = new Map<string, AccessControlGrupo>();
  for (const m of miembros) {
    const usos = new Map<string, number>();
    walkOwn(m.body, sets.functionNodes, (n) => {
      const recv = objectOf(n);
      if (!recv) return;
      if (!isOwnStateAccess(recv, m.selfNames, m.fields)) return;
      const key = ownStateKeyOf(recv, m.fields);
      const line = recv.startPosition.row + 1;
      const prev = usos.get(key);
      if (prev === undefined || prev > line) usos.set(key, line);
    });
    if (usos.size === 0) continue;

    const controles: Control[] = [];
    walkOwn(m.body, sets.functionNodes, (n) => {
      const cond = esControl(n);
      if (!cond) return;
      const text = normalizeText(cond.text);
      if (text.length === 0 || text.length > MAX_COND_CHARS) return;
      let salida = false;
      walkOwn(n, sets.functionNodes, (x) => {
        if (EXIT_NODE_TYPE.test(x.type)) salida = true;
      });
      const propios = miembrosDeLaUnidad.get(m.unitKey) ?? new Set<string>();
      let delega = false;
      walkOwn(cond, sets.functionNodes, (x) => {
        const propio = ownMemberNameOf(x, m.selfNames);
        if (propio && propios.has(propio)) delega = true;
        const recv = objectOf(x);
        if (recv && isOwnStateAccess(recv, m.selfNames, m.fields)) {
          const mn = memberNameOf(x);
          if (mn && propios.has(mn)) delega = true;
        }
        if (/call/i.test(x.type)) {
          const callee = (x.childForFieldName("function") ?? x.childForFieldName("method")) as AstNode | null;
          if (callee && !callee.text.includes(".") && propios.has(callee.text)) delega = true;
        }
      });
      controles.push({
        text,
        startLine: n.startPosition.row + 1,
        endLine: n.endPosition.row + 1,
        esSalidaTemprana: salida,
        delegaLaDecision: delega,
      });
    });
    if (controles.length === 0) continue;

    for (const [objeto, usoLine] of usos) {
      for (const ctl of controles) {
        // (1) EL CONTROL TIENE QUE GOBERNAR EL ACCESO.
        const dentro = ctl.startLine <= usoLine && usoLine <= ctl.endLine;
        const guardaDeSalida = ctl.esSalidaTemprana && ctl.startLine <= usoLine;
        if (!dentro && !guardaDeSalida) {
          embudo.controlNoGobierna!++;
          continue;
        }
        const key = `${m.unitKey}\u0000${objeto}\u0000${ctl.text}`;
        const g = grupos.get(key) ?? {
          unitKey: m.unitKey,
          unitName: m.unitName,
          objeto,
          control: ctl.text,
          delegaLaDecision: ctl.delegaLaDecision,
          lugares: [],
        };
        if (!g.lugares.some((l) => l.memberName === m.name && l.startLine === m.startLine)) {
          g.lugares.push({ memberName: m.name, startLine: m.startLine, endLine: m.endLine, guardLine: ctl.startLine, usoLine, dentro });
        }
        grupos.set(key, g);
      }
    }
  }

  /* Paso 3: a quién llama cada miembro y cuán corto es su cuerpo — los dos
   * hechos que necesitan las dos formas de RESOLUCIÓN VERIFICADA. */
  const llamaA = new Map<string, ReadonlySet<string>>();
  const sentencias = new Map<string, number>();
  for (const m of miembros) {
    const k = `${m.name}\u0000${m.startLine}`;
    const nombres = new Set<string>();
    walkOwn(m.body, sets.functionNodes, (n) => {
      const propio = ownMemberNameOf(n, m.selfNames);
      if (propio) nombres.add(propio);
      const recv = objectOf(n);
      if (recv && isOwnStateAccess(recv, m.selfNames, m.fields)) {
        const mn = memberNameOf(n);
        if (mn) nombres.add(mn);
      }
      if (/call/i.test(n.type)) {
        const callee = (n.childForFieldName("function") ?? n.childForFieldName("method")) as AstNode | null;
        if (callee && !callee.text.includes(".")) nombres.add(callee.text);
      }
    });
    llamaA.set(k, nombres);
    sentencias.set(k, namedChildren(m.body).length);
  }

  /* Paso 4: las dos condiciones de RESOLUCIÓN VERIFICADA y el dedupe. */
  const candidatos: AccessControlGrupo[] = [];
  for (const g of grupos.values()) {
    embudo.gruposCrudos!++;
    if (g.lugares.length < minLugares) {
      embudo.descartadosPorEscala!++;
      continue;
    }
    const nombresDelGrupo = new Set(g.lugares.map((l) => l.memberName));
    // (4) puerta de adentro.
    const puertaAdentro = g.lugares.some((l) => {
      const llama = llamaA.get(`${l.memberName}\u0000${l.startLine}`);
      if (!llama) return false;
      for (const n of llama) if (n !== l.memberName && nombresDelGrupo.has(n)) return true;
      return false;
    });
    if (puertaAdentro) {
      embudo.descartadosPorPuertaAdentro!++;
      continue;
    }
    // (5) LA PUERTA YA ESTA ESCRITA Y ALGUIEN PASA POR ELLA: uno de los que
    // repiten es un miembro CORTO (control + acceso y poco mas) al que algun
    // OTRO miembro del archivo ya invoca. Ese no es "un cliente mas": es la
    // puerta, y lo que falta es que los demas la usen — OTRA refactorizacion.
    //
    // ES UNA PREGUNTA DISTINTA DE LA (4), y la primera version la escribio mal:
    // buscaba la puerta ENTRE LOS MIEMBROS QUE NO ESTAN EN EL GRUPO, y eso no
    // puede pasar nunca — un miembro que tiene el MISMO control sobre el MISMO
    // objeto ESTA, por definicion, en el grupo. La condicion quedaba verde por
    // construccion; se encontro escribiendo el test que la ejercita.
    const puertaEscrita = g.lugares.some((l) => {
      const k = `${l.memberName}\u0000${l.startLine}`;
      if ((sentencias.get(k) ?? Number.MAX_SAFE_INTEGER) > PUERTA_MAX_SENTENCIAS) return false;
      for (const [otro, llama] of llamaA) {
        if (otro === k) continue;
        if (llama.has(l.memberName)) return true;
      }
      return false;
    });
    if (puertaEscrita) {
      embudo.descartadosPorPuertaYaEscrita!++;
      continue;
    }
    candidatos.push(g);
  }

  /* Dedupe: el MISMO control repetido por los MISMOS miembros es UN solo
   * refactor aunque toque dos objetos — emitirlo dos veces sería contar dos
   * veces la misma recomendación. Gana el objeto con más lugares. */
  const salida: AccessControlGrupo[] = [];
  const vistos = new Set<string>();
  for (const g of [...candidatos].sort((a, b) => b.lugares.length - a.lugares.length || a.objeto.localeCompare(b.objeto))) {
    const k = `${g.unitKey}\u0000${g.control}\u0000${[...g.lugares].map((l) => `${l.memberName}@${l.startLine}`).sort().join("|")}`;
    if (vistos.has(k)) {
      embudo.descartadosPorDedupe!++;
      continue;
    }
    vistos.add(k);
    salida.push(g);
  }
  salida.sort((a, b) => (a.lugares[0]?.startLine ?? 0) - (b.lugares[0]?.startLine ?? 0) || a.objeto.localeCompare(b.objeto));
  return { grupos: salida, embudo };
}

export const detector: IntraFileDetector<ThresholdKey, "repeated-access-control"> = {
  id: "repeated-access-control",
  kind: "repeated-access-control",
  scope: "intra-file",
  title: "Control de acceso repetido en cada cliente",
  // SIN "unidad-tipo-clase", por la MISMA razón medida que `lazy-init-repetida`
  // dejó escrita: Go NUNCA declara esa capacidad (`classNodes` de Go está
  // siempre vacío) y sin embargo tiene la forma "struct + método con
  // receptor" que este detector necesita, vía `goReceiverOf`.
  needs: [],
  thresholds: {
    lugaresQueRepiten: pisoDeclarado(LUGARES_QUE_REPITEN_MIN, {
      rationale:
        "ESCALA — el umbral que exige que el patrón PAGUE, escrito antes de medir. Con DOS miembros la mitigación " +
        "más barata es extraer una función privada compartida y llamarla desde los dos sitios: la fuerza está pero " +
        "abrir una puerta con la interfaz del objeto no paga. Recién con TRES el control interpuesto ahorra más de " +
        "lo que cuesta. Es la condición que AC2 midió que le faltaba a su ancla de State y el mismo número, con la " +
        "misma razón, que AD4 fijó para `lugares` en Facade.",
    }),
    objetoConControl: presencia({
      rationale:
        "Piso de FORMA: la pregunta es binaria — ¿el control GOBIERNA el acceso al objeto (el uso está dentro del " +
        "condicional, o el condicional es una salida temprana anterior al uso), sí o no? No hay magnitud intermedia " +
        "entre 'gobierna' y 'no gobierna' que calibrar.",
    }),
  },
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const minLugares = ctx.threshold("lugaresQueRepiten");
    const gobierna = ctx.threshold("objetoConControl");
    const { grupos } = scanRepeatedAccessControl(file, minLugares.value);
    const findings: RawFinding[] = [];

    for (const g of grupos) {
      const locations = g.lugares.map<RoleLocation>((l, i) => ({
        file: file.path,
        startLine: l.startLine,
        endLine: l.endLine,
        symbol: l.memberName,
        role:
          `cliente ${i + 1} de ${g.lugares.length} que repite el control antes de usar \`${g.objeto}\`` +
          (l.dentro ? " (el uso está dentro del condicional)" : " (guarda de salida temprana antes del uso)"),
      }));
      const primera = locations[0]!;
      findings.push({
        title: `${g.lugares.length} miembros de "${g.unitName}" repiten el mismo control antes de usar \`${g.objeto}\``,
        detail:
          `\`${g.lugares.map((l) => l.memberName).join("`, `")}\` gobiernan cada uno, por su cuenta, el acceso a ` +
          `\`${g.objeto}\` con la MISMA condición (\`${g.control}\`). El control vive repetido en cada cliente en vez ` +
          `de vivir detrás de una sola puerta con la misma interfaz del objeto: cada cliente nuevo tiene que acordarse ` +
          `de escribirlo, y cada cambio del control hay que hacerlo ${g.lugares.length} veces. ` +
          `Ningún miembro del grupo llama a otro (si uno fuera ya la puerta, los demás pasarían por él) y la unidad no ` +
          `tiene un miembro corto que ya haga control+acceso y alguien use.`,
        trigger: [
          { label: "clientes que repiten el mismo control", value: g.lugares.length, threshold: minLugares },
          { label: "el control gobierna el acceso al objeto", value: 1, threshold: gobierna },
        ],
        evidence: [
          { label: "usos gobernados desde adentro del condicional", value: g.lugares.filter((l) => l.dentro).length },
          { label: "usos gobernados por una guarda de salida temprana", value: g.lugares.filter((l) => !l.dentro).length },
        ],
        locations: [primera, ...locations.slice(1)],
        severity: Math.min(100, 45 + g.lugares.length * 5),
        advice: {
          primary: {
            name: "Extract Method",
            kind: "refactorizacion",
            why:
              "Un único punto de acceso que haga el control y devuelva el objeto (o lo use) borra la repetición " +
              "sin inventar ninguna estructura nueva. Es el paso barato y mecánico; si además el objeto tiene su " +
              "propio protocolo, ese punto de acceso es el lugar natural de un Proxy.",
            source: "https://refactoring.guru/es/smells/duplicate-code",
          },
        },
      });
    }
    return findings;
  },
};
