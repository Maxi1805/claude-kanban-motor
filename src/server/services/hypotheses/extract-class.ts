/**
 * `Extract Class` — Ola AS, frente AS3. **Absorbe `Extract Subclass`**
 * (refactoring.guru/es/extract-class · /es/extract-subclass).
 *
 * ── EL AVISO QUE ESTE ARCHIVO EXISTE PARA NO REPETIR ───────────────────────
 * `large-class` es el ancla con el peor precedente de recomendación de todo
 * el proyecto: **`Template Method · large-class` da 0 de 27** con el ancla
 * midiendo bien. Los 27 problemas eran REALES y la recomendación falló las 27
 * veces. La lección no es "el ancla es mala" — medido sobre
 * `tests/golden/precision/*.verdicts.csv` con el filtro de vigencia de
 * `detect/precision/gate-logic.ts`, **`large-class` mide 28/43 = 65,1 %
 * vigente (29/44 histórico), el 12.º mejor de los 48 kinds con n>=5**. La
 * lección es que **"la clase es grande" es un SÍNTOMA DE TAMAÑO, no una
 * fuerza**: dice que hay un problema, no cuál es el remedio.
 *
 * ── LA PARTE QUE FALTA, Y QUE ACÁ SE MIDE ──────────────────────────────────
 * Fowler pide para `Extract Class` una condición que el conteo de miembros no
 * mira: *"a subset of the data and a subset of the methods seem to go
 * together"*. La forma verificable de eso, y la que este archivo exige:
 *
 *   > **LOS MÉTODOS DE LA CLASE SE PARTEN EN DOS O MÁS RACIMOS QUE NO
 *   > COMPARTEN NI UN SOLO CAMPO.**
 *
 * Se calcula así: dos métodos quedan en el mismo racimo si TOCAN UN CAMPO EN
 * COMÚN; los racimos son las componentes conexas de esa relación. Que dos
 * racimos existan y no compartan campos NO es una opinión sobre el futuro: es
 * un hecho del archivo, se abre y se cuenta. Es exactamente la mitad "baja
 * cohesión" (LCOM/TCC) que el propio `detect/intra-file/large-class.ts`
 * declara como simplificación pendiente en su docstring — acá se paga, del
 * lado de la hipótesis, sin tocar `detect/**`.
 *
 * ── LA DECISIÓN DE MODELADO MÁS GRANDE: EL CONSTRUCTOR NO CUENTA ───────────
 * Un constructor que inicializa todos los campos los une a todos, y con él
 * adentro TODA clase es una sola componente y esta hipótesis no hablaría
 * nunca. Se excluye por la misma razón, y con el mismo criterio ya medido,
 * con que `detect/intra-file/feature-envy-intra.ts` excluye constructores de
 * su recuento de hermanos ("incluirlos suprimía el propio ejemplo canónico de
 * Fowler"). Declarado acá porque es la línea que decide si la familia habla o
 * no, no un detalle.
 *
 * ── NADA DE HARDCODEOS DE LENGUAJE ────────────────────────────────────────
 * Los campos que toca un método se leen por TIPO DE NODO de la gramática
 * (acceso a miembro con base auto-referencia, `instance_variable` de Ruby) Y
 * por los nombres DESNUDOS que la propia clase declara en este archivo — esa
 * segunda vía es la que hace que Java, C#, Go y Ruby no queden mudos, porque
 * en esos cuatro un campo se escribe sin receptor la mayor parte del tiempo.
 * Es el mismo mecanismo de `feature-envy-intra.ts#classMemberNames`, que
 * existe exactamente por ese motivo. El vocabulario genérico se importa de
 * `move-member.ts` (ver su docstring: los tres archivos de este frente
 * comparten un solo bloque, sin crear un cuarto archivo compartido).
 */
import type { AstNode, Finding, FileUnit, FunctionUnit, RoleLocation } from "../detect/types.js";
import type { ProbeNode } from "../code-grammar.js";
import type { CodeGraph } from "../graph/types.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext } from "./types.js";
import {
  ARGUMENT_LIST_FIELDS,
  ASSIGNMENT_NODE_WORD,
  CALL_TARGET_FIELDS,
  GO_RECEIVER_FIELDS,
  SELF_DATA_NODE_TYPE,
  SELF_NODE_TYPE,
  accessOf,
  assignmentTargets,
  bareName,
  autoReferenciaDe,
  esAutoReferencia,
  fieldOf,
  isIdentifierLike,
  parameterNames,
  receiverNamesOf,
  textOf,
  walk,
} from "./move-member.js";

const ANCHOR_LARGE_CLASS = "large-class";
const ANCHOR_DIVERGENT = "divergent-change";

/**
 * Métodos que tiene que tener el racimo MÁS CHICO de los dos para que
 * extraerlo pague. Escrito antes de medir: con 1 o 2 métodos el remedio
 * barato es mover esos métodos (que es `Move Member`, la familia hermana de
 * este frente) y no fabricar un tipo nuevo — `refactoring.guru`, "Extract
 * Class · cuándo NO conviene": *"no lo hagas si la clase nueva va a ser tan
 * pequeña que su existencia agrega más indirección que orden"*.
 */
const MIN_METODOS_RACIMO = 3;

/**
 * Campos DISTINTOS que tiene que tocar ese racimo chico. Con uno solo, lo que
 * hay es un campo con sus accesores y el remedio es `Encapsulate Field`, no
 * una clase nueva.
 */
const MIN_CAMPOS_RACIMO = 2;

/**
 * Métodos CON campos que la clase necesita para que "se parte en dos" sea
 * medible y no un artefacto de tres métodos sueltos. Deliberadamente MUY por
 * debajo del piso del ancla `large-class` (47 miembros, p95 derivado) — este
 * número no es un piso de tamaño (ese ya lo puso el ancla, y
 * `threshold-alignment.test.ts` audita que una hipótesis no baje el de su
 * ancla), es el piso de MEDIBILIDAD del racimo.
 */
const MIN_METODOS_CON_CAMPOS = 6;

/**
 * ── EL CAMBIO DE LA OLA AT, FRENTE AT1 ────────────────────────────────────
 * La versión de la Ola AS exigía un ABSOLUTO: dos componentes conexas de
 * "comparten un campo" **sin ni un campo en común**. Medido: de 563
 * candidatas **513 mueren ahí (91 %)**, y de las que pasan, 13 de 23 sujetos
 * juzgados son falsos. El diagnóstico: **es una compuerta BINARIA sobre un
 * fenómeno GRADUAL**. Un candidato real de `Extract Class` tiene cohesión
 * BAJA, no solapamiento CERO; exigir cero selecciona los casos DEGENERADOS
 * (la clase de utilidad cuyos métodos no tocan ningún campo cumple la
 * condición vacuamente) y descarta los buenos (la clase mal cohesionada que
 * tiene un `logger` que todos tocan).
 *
 * TCC — Tight Class Cohesion (Bieman & Kang): la fracción de PARES de
 * métodos que comparten al menos un campo. `large-class.ts` declara en su
 * docstring que mide **una** de las tres patas de la estrategia de God Class
 * de Lanza & Marinescu (WMC) y que **cohesión (TCC) y ATFD quedaron fuera de
 * alcance**; la estrategia canónica es `WMC alto ∧ ATFD > pocos ∧ TCC < 1/3`.
 *
 * ── POR QUÉ 1/3 **NO** PUEDE SER LA COMPUERTA DE `Extract Class`, CON LA
 *    ARITMÉTICA QUE LO PRUEBA (medido en la Ola AT, frente AT1) ────────────
 * Una clase partida en DOS racimos internamente completos de `k` métodos
 * tiene, como COTA SUPERIOR, `TCC = 2·C(k,2)/C(2k,2) = (k-1)/(2k-1)`, que va
 * de **0,400** (k = 3) a **0,497** (k = 100) — SIEMPRE por encima de 1/3. Con
 * TRES racimos la cota es `(k-1)/(3k-1)`: **0,250 a 0,310** — siempre por
 * debajo. Verificado además sobre el fixture canónico de este archivo
 * (`PARTIDA`, dos racimos de 4 sin ni un campo en común): **TCC = 0,357 >
 * 1/3**, o sea que el umbral de Lanza & Marinescu RECHAZARÍA el propio
 * ejemplo de manual de `Extract Class`.
 *
 * **`TCC < 1/3` es, aritméticamente, una compuerta de "TRES O MÁS
 * responsabilidades pegadas" — que es exactamente lo que "God Class"
 * significa. `Extract Class` es el caso de DOS.** Por eso acá TCC NO es
 * `required`: es un DISCRIMINADOR (cuando se cumple, la clase tiene tres o
 * más responsabilidades y la propuesta es más fuerte), y la compuerta la pone
 * la PUREZA del corte, que es la medida gradual que sí corresponde.
 */
const TCC_MAXIMO = 1 / 3;

/**
 * PUREZA MÍNIMA del corte. Se asigna cada campo al lado que más lo toca y se
 * cuenta qué fracción de las incidencias (método, campo) NO cruza la frontera
 * nueva. `1,0` es EXACTAMENTE el absoluto de la Ola AS; `0,90` es "como mucho
 * uno de cada diez accesos a campo de la clase cruza la frontera".
 *
 * Es el único de los cuatro números de esta familia que se eligió acá y no
 * está publicado; se eligió por LEGIBILIDAD (un décimo) y se fijó ANTES de
 * ver el histograma con el que después se mide la precisión — la razón exacta
 * por la que la Ola AS descartó su propia variante "campo-cubo".
 */
const PUREZA_MINIMA = 0.9;

/**
 * Hasta qué nivel se recorre la ESCALERA DE UMBRAL DE ARISTA. A `t = 1` la
 * relación es "comparten al menos UN campo" (= la Ola AS exacta); a `t = 2`,
 * "al menos DOS", y una clase pegada por un solo campo de infraestructura se
 * parte acá — que es justo lo que el absoluto no veía. **`t` se RECORRE, no
 * se elige**: se generan los racimos de los seis niveles y se ordena por
 * pureza. Seis porque más allá el racimo deja de ser reconocible como grupo.
 */
const T_MAXIMO = 6;

/**
 * ── LA COMPUERTA DEL HUB (Ola AX) — pre-registrada en `ola-ax/informes/AX1.md` §0
 *
 * AW1 §6.2 dejó escrita, SIN MEDIR, la forma de los falsos de esta familia:
 * *"el racimo lo pega un campo (o un método) QUE USA TODA LA CLASE"* —
 * `PreviewImage` en el viewmodel de ShareX, `httpServer` en el adaptador de
 * nest, `_echo` en el `Connection` de sqlalchemy, `loaded_path` en el `Config`
 * de rubocop, `Parent`/`Next` en el `JToken` de newtonsoft, `date_from` en el
 * `Gantt` de redmine. La frase tiene DOS conjuntos y los dos son HECHOS del
 * archivo, verificables abriéndolo:
 *
 *   (a) **"la usa toda la clase"** — el campo lo tocan al menos la mitad de los
 *       métodos de la clase que tocan algún campo. Es infraestructura (un asa,
 *       un cerrojo, un handle), no una responsabilidad.
 *   (b) **"lo PEGA"** — sacándole ese campo a todos los métodos, el racimo deja
 *       de ser una componente conexa de >= `MIN_METODOS_RACIMO` al mismo
 *       peldaño `t` en el que se lo encontró.
 *
 * **Cumpliéndose LAS DOS, la propuesta no sale.**
 *
 * **EL UMBRAL 0,50 ESTÁ FIJADO ANTES DE MIRAR UN SOLO SUJETO Y NO SE MUEVE.**
 * La lectura literal de "toda la clase" sería 1,00, pero un campo-cubo siempre
 * se saltea unos ayudantes puros; 0,50 es la lectura MÁS DÉBIL de la frase que
 * todavía la separa de "dos métodos comparten un campo". Barrer el umbral
 * después de ver los falsos es la trampa 1 de la Ola AB.
 *
 * **SE ETIQUETA, NO SE DESCARTA** (como todo lo demás en este archivo): el
 * veredicto viaja SIEMPRE en la traza (`hubDelCorte`, `usoClaseHub`,
 * `metodosMedidos`, `sobreviveSinHub`), y `COMPUERTA_HUB` decide si además
 * gatea. Un solo volcado da los DOS números.
 */
const HUB_FRACCION_CLASE = 0.5;

/** ¿La compuerta del hub GATEA la emisión, o sólo se etiqueta? Se mide con
 *  `false` (la traza trae el veredicto y el número gateado se deriva offline)
 *  y se pone en `true` sólo si el usuario decide aterrizarla. */
const COMPUERTA_HUB = false;

interface Racimo {
  readonly metodos: readonly FunctionUnit[];
  readonly campos: readonly string[];
}

interface Corte {
  /** Nivel de la escalera en el que el racimo es una componente conexa. */
  readonly t: number;
  readonly metodos: readonly FunctionUnit[];
  /** Los campos que quedan del lado del racimo (los que él toca más que el resto). */
  readonly campos: readonly string[];
  /** Fracción de incidencias (método, campo) que NO cruzan la frontera. */
  readonly pureza: number;
  /** Incidencias que SÍ cruzan: el precio exacto, en accesos, de extraer. */
  readonly cruces: number;
  readonly metodosRestantes: number;
}

interface ExtractClassProblem {
  readonly kind: string;
  readonly file: string;
  readonly clase: string | null;
  readonly conArbol: boolean;
  readonly metodosConCampos: number;
  /** Componentes conexas de "comparten un campo", de mayor a menor. */
  readonly racimos: readonly Racimo[];
  /** Llamadas de un método de un racimo a un método de OTRO racimo. */
  readonly llamadasEntreRacimos: number;
  /** Solo para la traza: tamanos de racimo si se saca el campo mas compartido. */
  readonly racimosSinHub: readonly number[];
  readonly hub: string | null;
  readonly hubMetodos: number;
  /** LA COMPUERTA DEL HUB (Ola AX): el campo del CORTE que más métodos de la
   *  clase tocan, cuántos lo tocan, cuántos métodos con campos tiene la clase,
   *  y si el corte sobrevive como componente al sacárselo. */
  readonly hubDelCorte: string | null;
  readonly usoClaseHub: number;
  readonly sobreviveSinHub: boolean;
  readonly metodosMedidos: number;
  /** Un tipo del repo que ya declara, junto, el conjunto de campos del racimo chico. */
  /** TCC (Bieman & Kang) de los métodos con campos. `null` si hay menos de dos. */
  readonly tcc: number | null;
  /** El mejor racimo separable de la escalera, o `null` si no hay ninguno. */
  readonly corte: Corte | null;
  readonly duenoExistente: string | null;
  readonly locations: readonly RoleLocation[];
  /**
   * SOLO PARA LA SONDA: incidencia cruda metodo->campos, CON constructores
   * marcados. **AU3 la deja con LAS DOS LECTURAS DEL MODELO DE CAMPOS en la
   * misma corrida** (`campos` = el modelo de AU3, `camposAT1` = el de AT1) y
   * con `enArgumento` marcado, para que el delta del cambio de modelo se
   * atribuya offline sin una segunda pasada pesada. Es el mismo principio que
   * le salvó la corrida a AT1: se vuelca el HECHO CRUDO, no la conclusión.
   */
  readonly incidencia: readonly {
    m: string;
    s: number;
    e: number;
    ctor: boolean;
    /** nombre → sus PROCEDENCIAS (ver `Procedencia`). El hecho crudo. */
    campos: Record<string, readonly string[]>;
    enArgumento: boolean;
  }[];
  /** Los nombres que la clase DECLARA o ESCRIBE. Con esto y `incidencia`, cualquier
   *  variante del modelo de campos se reconstruye offline, sin re-correr nada. */
  readonly declaraOEscribe: readonly string[];
  /** LA QUINTA PUERTA (Ola AX): lo declarado con `static`/`const`. No es estado
   *  de instancia; viaja para atribuir el delta offline. */
  readonly estaticos: readonly string[];
  /** Nombres que SÓLO entran por una escritura a `@otro.x`: la mitad de
   *  escritura del defecto que arregla la Ola AW. Viajan para el delta. */
  readonly escritosAjenos: readonly string[];
  /** Nombres que SÓLO entran por una escritura de una CLASE ANIDADA: la
   *  tercera puerta del mismo defecto. Viajan para el delta. */
  readonly escritosAnidados: readonly string[];
}

/* ────────────────────────────────────────────────────────────────────────
 * Qué declara la clase como miembro — la vía que evita el mutismo en los
 * lenguajes sin receptor obligatorio.
 * ──────────────────────────────────────────────────────────────────────── */

const DECLARATOR_NODE_WORD = /(^|_)declarator$/;

/**
 * ── LA CUARTA PUERTA (Ola AX): UN MÉTODO ESCRITO COMO PROPIEDAD DE CLASE ───
 *
 * `excalidraw/.../linearElementEditor.ts:787,838` declara
 * `static getEditorMidPoints = (…) => {…}` y `static getSegmentMidpointHitCoords = (…) => {…}`:
 * son MÉTODOS, escritos con la sintaxis de una propiedad. `functionNodes` no
 * los reconoce (el nodo de clase es `public_field_definition`, no
 * `method_definition`), así que `camposDeclarados` los mete en `campos` por la
 * rama del `name` — y desde ahí **unen a todo método que los llame**. Eso es
 * literalmente lo que pasó: el racimo emitido son siete manejadores de puntero
 * pegados por DOS NOMBRES DE MÉTODO ESTÁTICO.
 *
 * Es el MISMO defecto que las tres puertas de la Ola AW —contar como estado
 * compartido algo que no lo es— pero por otro mecanismo: allá era un `this`
 * que no era el de esta clase; acá es **un nombre que no es un dato**.
 *
 * **LA REGLA, Y NO NOMBRA NINGÚN LENGUAJE:** una declaración del cuerpo de la
 * clase cuyo INICIALIZADOR es una función va a `metodos`, no a `campos`. Se
 * pregunta por la gramática (el campo `value`/`right`/`initializer` y, si no
 * hay campo nombrado, los hijos nombrados directos — la forma de C#/Java, donde
 * la lambda cuelga del `variable_declarator`), igual que
 * `ARGUMENT_LIST_FIELDS` o `CALL_TARGET_FIELDS`, y se compara contra
 * `file.sets.functionNodes`, que es lo que `ctx.setsFor` derivó de ESA
 * gramática. Medido con `scratchpad-ax1/probe-prop.mts` sobre las seis:
 * muerde en TypeScript y C# (y Java, misma forma que C#); en JavaScript,
 * Python, Ruby y Go la forma no llegaba a `campos` por otra razón, así que la
 * regla es un no-op y no les quita nada.
 */
const VALOR_DECLARADO_FIELDS = ["value", "right", "initializer", "default_value"] as const;

/**
 * ── LA QUINTA PUERTA (Ola AX) — una CONSTANTE ESTÁTICA no es estado de instancia
 *
 * **Es el MISMO defecto que la cuarta, en su tercera forma: un nombre que no es
 * un dato de ESTE objeto.** El testigo lo destapó juzgar
 * `jenkins/core/src/main/java/hudson/model/Run.java`, que emite un racimo de
 * **23 de 60 métodos** sobre `ARTIFACTS, DELETE, UPDATE, description,
 * displayName, id`, y donde:
 *
 * ```java
 * public static final Permission DELETE = new Permission(PERMISSIONS, "Delete", …);   // 2566
 * public static final Permission UPDATE = new Permission(PERMISSIONS, "Update", …);   // 2567
 * ```
 *
 * **`DELETE` y `UPDATE` son CONSTANTES DE CLASE.** Dos métodos que las leen no
 * comparten NADA: no hay estado que mover, no hay objeto escondido. Y sin
 * embargo pegaban `setDisplayName` con `setDescription` con `delete`, que es
 * justo lo que esta familia mide. **Es un hecho de la gramática —hay un
 * modificador `static`/`const` en la declaración— así que se verifica abriendo
 * el archivo, que es la prueba que el encargo le exige a toda precondición.**
 *
 * **LA REGLA, Y NO NOMBRA NINGÚN LENGUAJE:** una declaración del cuerpo de la
 * clase que lleva el modificador `static` o `const` no declara estado de
 * instancia. Los modificadores se leen de la GRAMÁTICA, en las tres formas que
 * `scratchpad-ax1/probe-static.mts` encontró sondeándolas:
 *
 *   · **Java** — un hijo nombrado `modifiers`, cuyos hijos son los tokens.
 *   · **C#**   — varios hijos nombrados `modifier`, uno por palabra.
 *   · **TS**   — tokens ANÓNIMOS hijos directos (`static`, `readonly`).
 *
 * Las tres se cubren mirando los hijos directos MÁS los hijos de un envoltorio
 * cuyo tipo sea `modifier(s)`, y comparando por TIPO y por TEXTO.
 *
 * **`final`/`readonly` NO cuentan, y es a propósito:** un campo `final` de
 * instancia sigue siendo estado de instancia (`private final Foo lock` es el
 * cerrojo dedicado que AW1 §6.2 nombró como señal de un VERDADERO). El único
 * modificador que dice "esto no es de este objeto" es `static` — y `const`, que
 * en C# lo implica.
 *
 * **NO le quita nada a Python, Ruby ni Go**, que no tienen la palabra: la regla
 * es un no-op ahí, igual que la cuarta puerta. `@@x` de Ruby sigue contando,
 * porque una variable de clase de Ruby **es estado mutable compartido**, no una
 * constante.
 *
 * **EL ORDEN IMPORTA Y ESTÁ FIJADO:** primero la CUARTA puerta (¿el
 * inicializador es una función?), después ésta. `static mid = (p) => p` es un
 * MÉTODO —va a `metodos`, que es de donde se restan los campos— y no una
 * constante; invertir el orden rompería el test 23.
 *
 * **SE ETIQUETA, NO SE DESCARTA**, como todo lo demás en este archivo: los
 * nombres viajan en la traza (`estaticos`) y en `camposAT1`, así que el delta
 * se atribuye offline sin re-correr.
 */
const MODIFICADOR_NO_INSTANCIA_WORD = /^(static|const)$/;
const MODIFICADORES_NODE_WORD = /^modifiers?$/;

function esDeclaracionNoInstancia(node: ProbeNode): boolean {
  const esPalabra = (n: ProbeNode): boolean =>
    MODIFICADOR_NO_INSTANCIA_WORD.test(n.type) ||
    (!n.isNamed && MODIFICADOR_NO_INSTANCIA_WORD.test(textOf(n)));
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (!c) continue;
    if (esPalabra(c)) return true;
    // El envoltorio `modifiers` de Java: sus hijos son los tokens.
    if (c.isNamed && MODIFICADORES_NODE_WORD.test(c.type)) {
      for (let j = 0; j < c.childCount; j++) {
        const t = c.child(j);
        if (t && esPalabra(t)) return true;
      }
      // Java expone `modifiers` con los tokens como hijos ANÓNIMOS; si la
      // gramática no los expone, el TEXTO del envoltorio es la última palabra.
      if (/(^|\s)(static|const)(\s|$)/.test(textOf(c))) return true;
    }
  }
  return false;
}

/** Los nombres que una declaración declara — para poder ETIQUETARLOS en la
 *  traza sin bajar al subárbol por las vías normales. */
function nombresDeUnaDeclaracion(node: ProbeNode): string[] {
  const out: string[] = [];
  const d0 = nombreDeclarado(node);
  if (d0) out.push(d0);
  walk(node, (n) => {
    if (n.isNamed && DECLARATOR_NODE_WORD.test(n.type)) {
      const d = nombreDeclarado(n);
      if (d) out.push(d);
    }
  });
  return out;
}

function inicializadorFuncionLike(node: ProbeNode, functionNodes: ReadonlySet<string>): boolean {
  const esFn = (n: ProbeNode): boolean => n.isNamed && functionNodes.has(n.type);
  const nombrados = (n: ProbeNode): ProbeNode[] => {
    const out: ProbeNode[] = [];
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i);
      if (c && c.isNamed) out.push(c);
    }
    return out;
  };
  // El valor: el campo de gramática si lo hay, si no el ÚLTIMO hijo nombrado
  // (`variable_declarator` de C#, cuyos hijos son el nombre y la cláusula `=`).
  let v = fieldOf(node, VALOR_DECLARADO_FIELDS);
  if (!v) {
    const hijos = nombrados(node);
    v = hijos[hijos.length - 1] ?? null;
  }
  // Se atraviesan hasta DOS envoltorios de un solo hijo nombrado
  // (`equals_value_clause` de C#: `= (p) => p`). Un envoltorio con más de un
  // hijo nombrado NO se atraviesa: `= list.Select(x => x)` tiene la lambda
  // adentro de una llamada y ESO ES UN CAMPO, no un método.
  for (let d = 0; v !== null && d < 2 && !esFn(v); d++) {
    const hijos = nombrados(v);
    v = hijos.length === 1 ? hijos[0]! : null;
  }
  return v !== null && esFn(v);
}

/**
 * ── GO, QUE ESTABA MUDO — y NO era un arreglo de una línea ─────────────────
 *
 * AW1 §4 localizó el mutismo (`porNombre` exige `symbolClase !== null` y
 * `divergent-change` no trae símbolo) y dejó escrito que el remedio era leerle
 * el `name` al nodo de la clase. **Medido acá, ESE REMEDIO NO ALCANZA**, y la
 * sonda `scratchpad-ax1/probe-go.mts` lo muestra sin interpretación: con el
 * ancla `large-class`, que SÍ trae símbolo (`Ed`), Go sigue dando
 * `metodosConCampos = 0`, porque
 *
 *     {"name":"h1", "className": null, "type":"method_declaration"}
 *
 * — **`FunctionMetrics.className` es `null` para todo método de Go.** El
 * walker lo deriva del ANIDAMIENTO, y en Go el método no está anidado en el
 * tipo. Así que `porNombre` es `false` SIEMPRE en Go, se cae al filtro por
 * span, y el span de `type S struct{…}` no contiene ningún método.
 *
 * **EL ARREGLO:** cuando `className` no dice nada, se le pregunta a la
 * gramática por el RECEPTOR (`GO_RECEIVER_FIELDS`, que el vocabulario
 * compartido ya expone y ya usa `receiverNamesOf`) y se le saca el TIPO. No
 * hay `if (language === "go")`: un lenguaje sin campo `receiver` devuelve
 * `null` y queda exactamente como estaba.
 */
function tipoReceptorDe(fnNode: ProbeNode): string | null {
  const recv = fieldOf(fnNode, GO_RECEIVER_FIELDS);
  if (!recv) return null;
  let tipoNodo: ProbeNode | null = null;
  walk(recv, (n) => {
    if (tipoNodo !== null) return;
    const t = fieldOf(n, ["type"]);
    if (t) tipoNodo = t;
  });
  // El nombre del tipo es la última HOJA nombrada del nodo de tipo: en Go es un
  // `type_identifier`, que `isIdentifierLike` excluye a propósito (un tipo no
  // es una variable) — acá es justamente lo que se busca. Con un tipo
  // calificado (`pkg.Ed`) la última hoja es `Ed`, que es el nombre que
  // `claseDelHallazgo` compara.
  let ultimo: string | null = null;
  walk(tipoNodo ?? recv, (n) => {
    if (n.isNamed && n.childCount === 0) ultimo = textOf(n);
  });
  return ultimo;
}

/** El nombre de la clase a la que pertenece este método: el que derivó el
 *  walker y, cuando no derivó ninguno, el TIPO DEL RECEPTOR. */
function claseDe(fn: FunctionUnit): string | null {
  return fn.metrics.className ?? tipoReceptorDe(fn.node);
}
const SYMBOL_NODE_TYPE = /(^|_)symbol$/;
/**
 * ANOTACIONES / DECORADORES — no son campos, y contarlos como campos es un
 * FALSO SISTEMÁTICO, MEDIDO: en `guava`, `@GuardedBy` unía los 8 métodos de
 * `Monitor` en un racimo y `@GwtIncompatible`/`@J2ktIncompatible` unían los 4
 * de `ImmutableList` — dos de las nueve propuestas que esta familia emitió en
 * ese repo en la primera pasada salieron ENTERAS de ahí. `marker_annotation`/
 * `annotation` (Java), `attribute_list` (C#), `decorator` (Python/TS/JS):
 * tipos de nodo, confirmados por sonda. **`attribute` a secas NO entra: en
 * Python ése es el nodo del acceso a miembro (`o.a`)**, y excluirlo dejaría a
 * Python mudo — la trampa 1 otra vez, escondida en un nombre compartido.
 */
const ANNOTATION_NODE_WORD = /(^|_)(annotation|decorator)(_|$)|^attribute_list$/;

/**
 * LA LISTA DE ARGUMENTOS, por TIPO de nodo. `ARGUMENT_LIST_FIELDS` del
 * vocabulario compartido da los mismos dos nombres como CAMPOS de gramática;
 * acá hace falta la forma de TIPO, porque lo que se necesita es "¿este nodo
 * está DEBAJO de una lista de argumentos?" y eso se contesta bajando, no
 * mirando un campo del padre.
 *
 * **VERIFICADO CON SONDA EN LOS SIETE PARSERS**, no supuesto
 * (`scratchpad-au3/sonda-args.mts`): `arguments` en TypeScript y JavaScript;
 * `argument_list` en Python, Ruby, Java, C# y Go. En los siete, el lambda del
 * caso (`f(1, x => ...)`) queda adentro. Es la trampa 1 del proyecto —
 * `SELF_PREFIX` en `state.ts` dejó a Go mudo cuatro olas— y por eso se sondea
 * en vez de escribirse de memoria.
 */
const ARGUMENT_LIST_NODE_WORD = /(^|_)(arguments|argument_list)$/;

function nombreDeclarado(node: ProbeNode): string | null {
  const byField = fieldOf(node, ["name"]);
  if (byField && isIdentifierLike(byField)) return textOf(byField);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && isIdentifierLike(child)) return textOf(child);
  }
  return null;
}

/**
 * ── EL CAMBIO DE LA OLA AU, FRENTE AU3: QUÉ ES UN CAMPO ────────────────────
 * AT1 midió que **el 35 % de las propuestas de esta familia tenía entre los
 * "campos" de su racimo algo que NO ES UN CAMPO**, y lo dejó como la compuerta
 * que ahora limita a la familia. Los casos con nombre y archivo: `self.class`
 * de Ruby (`jekyll/document.rb`), `__class__` de Python
 * (`sqlalchemy/engine/default.py`), `zero?`, el blanco de `def_delegators`
 * (`rubocop/config.rb`), y los MÉTODOS HEREDADOS leídos por `this.`
 * (`nest/ExpressAdapter#getInstance`, `jenkins/AbstractBuild#getAction`,
 * `netbox/GraphQLTestCase#assertEqual`). En los tres primeros el racimo entero
 * SALE de ese pseudo-campo: sin él la propuesta no existe.
 *
 * **LA CAUSA ES UNA SOLA Y ES DE MODELO, NO DE LENGUAJE:** la vía de acceso
 * por receptor (`this.X` / `self.X`) aceptaba CUALQUIER miembro leído a través
 * de uno mismo. Leer `self.X` no dice que `X` sea un campo de esta clase: dice
 * que existe en algún lado — en la clase base, en la biblioteca núcleo, en un
 * `method_missing`, en un delegador. **Nada de eso está en lo que el
 * analizador carga**, que es la regla que la Ola AS dejó escrita para
 * `Remove Dead Code`.
 *
 * **LA REGLA QUE LO REEMPLAZA, y es la misma en los seis lenguajes:**
 *
 *   > **UN CAMPO ES UN NOMBRE QUE LA CLASE DECLARA O ESCRIBE.** Leerlo por
 *   > receptor sin declararlo ni escribirlo nunca NO lo convierte en campo.
 *
 * NO es una lista negra de palabras. Una lista `{class, __class__, zero?}`
 * sería exactamente el hardcodeo que `state.ts` pagó dejando a Go mudo en
 * cuatro anclas durante varias olas: cubre las tres palabras que se midieron y
 * ninguna de las que no. La regla de arriba no nombra ni un lenguaje y cubre
 * las tres FAMILIAS de la causa (builtin, heredado, delegado) de una vez.
 *
 * Se comprueba abriendo el archivo, que es la prueba que esta capa exige:
 * `self.class` no se le asigna nunca ni se declara en ningún lado del archivo;
 * `@label` sí. Las dos vías inequívocas se conservan sin condición: la
 * variable de instancia de Ruby (`@x` es sintaxis de propiedad, no una
 * suposición) y todo lo que la clase declara FUERA de un cuerpo de función.
 */
function camposEscritosPorSiMismo(
  classNode: ProbeNode,
  classNodes: ReadonlySet<string>,
  language: string,
): { propios: ReadonlySet<string>; ajenos: ReadonlySet<string>; anidados: ReadonlySet<string> } {
  const propios = new Set<string>();
  const ajenos = new Set<string>();
  const anidados = new Set<string>();
  const receptores = receiverNamesOf(classNode);
  // ── LA TERCERA PUERTA DEL MISMO DEFECTO (Ola AW) ───────────────────────
  // `walk` baja a TODO el subárbol, CLASES ANIDADAS INCLUIDAS, y adentro de
  // una clase anidada `this` es el `this` DE ELLA. `camposDeclarados` ya para
  // en la clase anidada ("sus campos son suyos") y ésta no paraba, así que los
  // campos de la anidada entraban en la lista blanca de la de afuera.
  //
  // TESTIGO, con archivo y línea: `guava/…/util/concurrent/Monitor.java`. Su
  // clase anidada `Guard` (línea 307) declara `final Condition condition` (310)
  // y `@Weak final Monitor monitor` (309), y su constructor hace
  // `this.condition = monitor.lock.newCondition()` (321). Resultado medido en
  // la traza de AU3: `declaraOEscribe` de `Monitor` = ["activeGuards",
  // "condition", "fair", "lock", **"monitor"**] — DOS de los cinco son campos
  // de `Guard`. Y no es cosmético: `await`, `awaitNanos` y
  // `awaitUninterruptibly` se pegan al racimo SÓLO por `condition`
  // (`guard.condition.await()`), así que la propuesta de 7 métodos que guava
  // emite dos veces (el árbol espejo `android/guava/`) cuelga de un campo ajeno.
  //
  // Es EL MISMO defecto que los otros dos, por la tercera puerta: un `this` que
  // no es el de esta clase. Se recorre a mano, como `camposDeclarados`.
  const visitar = (n: ProbeNode): void => {
    if (n.isNamed && n !== classNode && classNodes.has(n.type)) {
      // La anidada: sus escrituras son suyas. Se ANOTAN igual (no se descartan)
      // para poder atribuir el delta offline, que es la regla de este archivo.
      walk(n, (m) => {
        if (!m.isNamed || !ASSIGNMENT_NODE_WORD.test(m.type)) return;
        for (const t of assignmentTargets(m)) {
          if (SELF_DATA_NODE_TYPE.test(t.type)) { anidados.add(bareName(textOf(t))); continue; }
          const acc = accessOf(t);
          if (acc && isIdentifierLike(acc.member)) anidados.add(textOf(acc.member));
        }
      });
      return;
    }
    mirar(n);
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i);
      if (c) visitar(c);
    }
  };
  const mirar = (n: ProbeNode): void => {
    if (!n.isNamed || !ASSIGNMENT_NODE_WORD.test(n.type)) return;
    for (const t of assignmentTargets(n)) {
      if (SELF_DATA_NODE_TYPE.test(t.type)) {
        propios.add(bareName(textOf(t)));
        continue;
      }
      const acc = accessOf(t);
      if (!acc || !isIdentifierLike(acc.member)) continue;
      // **LA MITAD DE ESCRITURA DEL DEFECTO DE LA OLA AW.** `@otro.x = 1` le
      // escribe a `@otro`, no a uno mismo: `x` es campo del COLABORADOR. Antes
      // entraba en la lista blanca `declaraOEscribe` y desde ahí volvía a colar
      // el miembro ajeno como campo propio POR LA PUERTA DE ATRÁS — la lectura
      // se filtraba en `camposDe` y la escritura no. Se separan en dos
      // conjuntos, no se descarta uno: el volcado lleva los dos y el modelo se
      // elige offline (la lección que le salvó la corrida a AT1).
      switch (autoReferenciaDe(acc.base, language, receptores)) {
        case "self": propios.add(textOf(acc.member)); break;
        case "campo-propio": ajenos.add(textOf(acc.member)); break;
        default: break;
      }
    }
  };
  visitar(classNode);
  return { propios, ajenos, anidados };
}

/**
 * Todo nombre que esta unidad tipo-clase declara como CAMPO en este archivo.
 * Sólo campos: los METODOS se excluyen a propósito (un método llamado desde
 * otro método no es "datos compartidos" y uniría racimos que no comparten
 * estado — que es justo lo que este archivo mide).
 *
 * Devuelve DOS conjuntos: `campos` (el modelo de AU3, arriba) y `camposAT1`
 * (el de AT1, que aceptaba cualquier `this.X`). El segundo no lo usa ningún
 * check — viaja sólo en la traza, para que el delta del cambio de modelo se
 * pueda atribuir offline sin una segunda corrida pesada.
 */
function camposDeclarados(
  classNode: ProbeNode,
  classNodes: ReadonlySet<string>,
  functionNodes: ReadonlySet<string>,
  language: string,
): {
  campos: ReadonlySet<string>;
  camposAT1: ReadonlySet<string>;
  metodos: ReadonlySet<string>;
  /** Los que sólo entran por una escritura a `@otro.x`. Viajan en la traza para
   *  que el delta del arreglo de la Ola AW se atribuya offline. */
  escritosAjenos: ReadonlySet<string>;
  /** Los que sólo entran por una escritura de una CLASE ANIDADA (`Guard` de
   *  `guava/Monitor.java`). La tercera puerta del mismo defecto; viajan en la
   *  traza por la misma razón. */
  escritosAnidados: ReadonlySet<string>;
  /** LA QUINTA PUERTA (Ola AX): los nombres declarados con `static`/`const`.
   *  No son estado de instancia; viajan en la traza para atribuir el delta
   *  offline, igual que `escritosAjenos` y `escritosAnidados`. */
  estaticos: ReadonlySet<string>;
} {
  const { propios: escritos, ajenos: escritosAjenos, anidados: escritosAnidados } =
    camposEscritosPorSiMismo(classNode, classNodes, language);
  const campos = new Set<string>();
  const camposAT1 = new Set<string>();
  /** Los NOMBRES de los métodos de la clase. Se restan de los campos: dos
   *  métodos que se llaman entre sí NO comparten estado, y si `this.otro()`
   *  contara como campo, todo racimo quedaría pegado al que lo invoca — que
   *  es justo lo que este archivo mide y lo que su docstring promete. */
  const metodos = new Set<string>();
  const estaticos = new Set<string>();
  const visit = (node: ProbeNode, dentroDeFuncion: boolean): void => {
    if (node.isNamed && node !== classNode) {
      if (classNodes.has(node.type)) return; // clase anidada: sus campos son suyos
      if (ANNOTATION_NODE_WORD.test(node.type)) return; // una anotación no es un campo
      // LA QUINTA PUERTA (Ola AX): una declaración `static`/`const` del cuerpo
      // de la clase NO es estado de instancia. Se etiqueta y NO SE BAJA — su
      // subárbol no puede declarar campos propios. La CUARTA puerta va primero:
      // `static mid = (p) => p` es un MÉTODO, no una constante.
      if (!dentroDeFuncion && !functionNodes.has(node.type) &&
          esDeclaracionNoInstancia(node) && !inicializadorFuncionLike(node, functionNodes)) {
        for (const n of nombresDeUnaDeclaracion(node)) { estaticos.add(n); camposAT1.add(n); }
        return;
      }
      if (SELF_DATA_NODE_TYPE.test(node.type)) {
        // `@x` de Ruby: sintaxis de propiedad, no una suposición. Sin condición.
        campos.add(bareName(textOf(node)));
        camposAT1.add(bareName(textOf(node)));
      }
      if (functionNodes.has(node.type)) {
        const nombre = fieldOf(node, ["name"]);
        if (nombre && isIdentifierLike(nombre)) metodos.add(textOf(nombre));
        dentroDeFuncion = true;
      } else {
        const acc = accessOf(node);
        const auto = acc && isIdentifierLike(acc.member) ? autoReferenciaDe(acc.base, language, new Set()) : null;
        if (acc && auto !== null && isIdentifierLike(acc.member)) {
          const m = textOf(acc.member);
          // `camposAT1` reproduce el modelo de la ola anterior —que confundía
          // `@otro.x` con `self.x`— y viaja SÓLO en la traza.
          camposAT1.add(m);
          // LA REGLA DE AU3: leer `self.X` no declara nada. Sólo entra si la
          // clase LO ESCRIBE por receptor en algún punto del archivo. Lo que
          // declara fuera de una función entra por las ramas de abajo.
          // LA REGLA DE AW1: y además tiene que ser `self.X`, no `@otro.X`.
          if (auto === "self" && escritos.has(m)) campos.add(m);
        } else if (!dentroDeFuncion) {
          // LA CUARTA PUERTA (Ola AX): si lo declarado tiene un INICIALIZADOR
          // FUNCIÓN, es un MÉTODO escrito con sintaxis de propiedad
          // (`static getEditorMidPoints = (…) => {…}`), no un dato. Va a
          // `metodos`, que es de donde se restan los campos más abajo — así el
          // nombre no puede pegar un racimo. `camposAT1` lo sigue contando,
          // como todo lo demás en este archivo, para poder atribuir el delta
          // offline sin re-correr.
          const fnProp = inicializadorFuncionLike(node, functionNodes);
          if (SYMBOL_NODE_TYPE.test(node.type)) {
            campos.add(bareName(textOf(node)));
            camposAT1.add(bareName(textOf(node)));
          } else if (DECLARATOR_NODE_WORD.test(node.type)) {
            const d = nombreDeclarado(node);
            if (d) { if (fnProp) metodos.add(d); else campos.add(d); camposAT1.add(d); }
          } else if (!acc) {
            const name = fieldOf(node, ["name"]);
            if (name && isIdentifierLike(name)) {
              const t = textOf(name);
              if (fnProp) metodos.add(t); else campos.add(t);
              camposAT1.add(t);
            }
          }
        }
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child, dentroDeFuncion);
    }
  };
  visit(classNode, false);
  for (const m of metodos) { campos.delete(m); camposAT1.delete(m); }
  // Lo que la clase ESCRIBE por receptor es campo aunque no aparezca declarado
  // en ninguna otra vía: es el caso normal de Python/JS/TS (`self.x = 1` en el
  // constructor) y el que hace que la regla no deje mudo a ningún lenguaje.
  for (const e of escritos) if (!metodos.has(e)) campos.add(e);
  for (const e of escritosAjenos) if (!metodos.has(e)) camposAT1.add(e);
  for (const e of escritosAnidados) if (!metodos.has(e)) camposAT1.add(e);
  // Una constante estática nunca es campo, ni siquiera si alguna otra vía la
  // metió (p. ej. una escritura `this.X = …` en un método estático).
  for (const e of estaticos) campos.delete(e);
  return { campos, camposAT1, metodos, escritosAjenos, escritosAnidados, estaticos };
}

/**
 * ── LA PROCEDENCIA DE CADA CAMPO — el hecho crudo, no la conclusión ────────
 * Un mismo nombre puede llegar a "campo" por vías que NO valen lo mismo, y la
 * Ola AU midió que la diferencia entre ellas decide propuestas enteras. Se
 * ETIQUETA cada aparición y se decide después, en un solo lugar
 * (`camposSegunModelo`), para que el volcado guarde el hecho y no el criterio:
 * es la lección que le salvó la corrida a AT1.
 *
 *   · `ivar`      — `@x` de Ruby. Sintaxis de propiedad: inequívoco.
 *   · `ivar-mem`  — **`@otro.x`**. `x` es miembro de OTRO objeto, nunca de esta
 *                   clase. `esAutoReferencia` los confunde porque da `true`
 *                   para todo `instance_variable` (§ del informe AU3).
 *   · `self-val`  — `this.x` usado como VALOR (`return this.x`, `this.x.y`,
 *                   `this.x + 1`). Es un DATO. Puede ser heredado y seguir
 *                   siendo un campo de verdad: `AbstractHttpAdapter.instance`.
 *   · `self-call` — `this.x(...)`, `x` como BLANCO DE LLAMADA. Es un MÉTODO
 *                   salvo que la clase declare o escriba ese nombre: heredado
 *                   (`assertEqual`, `getInstance`), builtin (`zero?`) o blanco
 *                   de un delegador (`def_delegators`).
 *   · `bare`      — nombre desnudo que la clase declara. La vía sin la cual
 *                   Java, C#, Go y Ruby quedarían mudos.
 *   · `reb-val` /  — lo mismo que `self-val`/`self-call`, pero el `this` está
 *     `reb-call`      adentro de una función anidada que ABRE SU PROPIO ENLACE
 *                     (el segundo defecto que arregla la Ola AW). Testigo:
 *                     `Ghost/email-event-processor.js:334`,
 *                     `recipientQuery.where(function () { this.orWhere(...) })`
 *                     — ése es el `this` de knex, no el de la clase, y `where`
 *                     y `orWhere` entraban como campos de `EmailEventProcessor`.
 *                     Se ETIQUETA en vez de descartarse: el modelo lo decide en
 *                     `camposSegunModelo` y el volcado permite reconstruir las
 *                     dos variantes offline.
 *   · `lex-val` /  — el `this` está adentro de una función anidada, PERO la
 *     `lex-call`     auto-referencia de este lenguaje es un NOMBRE LIGADO
 *                    (`self`/`cls` de Python, el receptor declarado de Go), no
 *                    un nodo dedicado. **Un nombre ligado lo captura la
 *                    clausura: ninguna función anidada lo puede reenlazar.**
 *                    Es un campo propio de verdad y el modelo AW1 lo CUENTA.
 *                    Sin esta tercera etiqueta, `def inner(): return self.c`
 *                    adentro de un método de Python perdía `c` — la trampa 1
 *                    del encargo (una regla que sólo vale en un lenguaje),
 *                    cometida en la dirección contraria.
 */
type Procedencia =
  | "ivar"
  | "ivar-mem"
  | "self-val"
  | "self-call"
  | "reb-val"
  | "reb-call"
  | "lex-val"
  | "lex-call"
  | "bare"
  | "bare-at1";

/**
 * ── LAS FORMAS DE FUNCIÓN QUE **CIERRAN** SOBRE LA AUTO-REFERENCIA ─────────
 * Un `this`/`self` adentro de una función anidada puede ser el de la clase (si
 * la función CIERRA sobre él) o el de otro objeto (si la función ABRE su propio
 * enlace). La diferencia es un hecho de la GRAMÁTICA —el tipo de nodo—, y se
 * escribe como los demás vocabularios de este archivo (`ASSIGNMENT_NODE_WORD`,
 * `DECLARATOR_NODE_WORD`), NO como una lista de lenguajes:
 *
 *   · `arrow_function` (JS/TS) · `lambda` (Python) · `lambda_expression` (Java,
 *     C#) · `block` / `do_block` (Ruby — un bloque **no** reenlaza `self`).
 *
 * Todo lo demás que esté en `functionNodes` abre su propio enlace:
 * `function_expression`/`function_declaration` de JS/TS, el `method_declaration`
 * de la clase anónima de Java, el `method` anidado de Ruby.
 *
 * **LA REGLA SOLA NO ALCANZA, Y LA SONDA LO MOSTRÓ.** "Estar adentro de una
 * función que abre su propio enlace" sólo puede reenlazar la auto-referencia si
 * la auto-referencia ES un enlace que la llamada fija — o sea, un NODO
 * DEDICADO (`this`/`self`/`super`). Cuando la auto-referencia es un NOMBRE
 * LIGADO —`self`/`cls` de Python, el receptor declarado de Go— la clausura lo
 * captura y ninguna función anidada lo mueve: `def inner(): return self.c`
 * adentro de un método es el `self` del método. Por eso el segundo factor:
 * `SELF_NODE_TYPE.test(acc.base.type)`. Sin él, esta regla le comía a Python
 * todo `self.x` adentro de un `def` anidado — la trampa 1 del encargo (una
 * regla que sólo vale en un lenguaje) cometida en la dirección contraria.
 *
 * **Y EL RESIDUO QUE HABÍA QUE DECLARAR NO EXISTE, TAMBIÉN POR SONDA**
 * (`scratchpad-aw1/probe-rebind.mts`): en C# el conjunto `functionNodes` que el
 * analizador usa es `{lambda_expression, method_declaration}` — ni
 * `local_function_statement` ni `anonymous_method_expression` (`delegate {}`)
 * están adentro, así que la regla NUNCA los marca. La sobre-restricción de C#
 * que la primera versión de este informe declaró **no puede ocurrir**, y no hay
 * que apagar nada.
 */
const CIERRA_SOBRE_SELF_NODE_WORD = /(^|_)(arrow|lambda|block)(_|$)/;

/**
 * Los campos que TOCA un método, cada uno con TODAS sus procedencias. Sin compuerta.
 * Las DOS listas de nombres declarados entran por separado a propósito: un nombre
 * desnudo vale como campo sólo contra la lista del modelo que lo pregunta, y usar
 * la lista ancha para las dos volvía a colar `assertEqual` e `items` por la puerta
 * de atrás — medido, y era la causa de que el arreglo no se viera.
 */
function camposDe(
  fn: FunctionUnit,
  language: string,
  declaraOEscribe: ReadonlySet<string>,
  declaradosAT1: ReadonlySet<string>,
  metodos: ReadonlySet<string>,
  functionNodes: ReadonlySet<string>,
): Map<string, Set<Procedencia>> {
  const receptores = receiverNamesOf(fn.node);
  const locales = new Set(parameterNames(fn.node));
  const campos = new Map<string, Set<Procedencia>>();
  const anotar = (nombre: string, p: Procedencia): void => {
    const s = campos.get(nombre);
    if (s) s.add(p);
    else campos.set(nombre, new Set([p]));
  };
  // El propio NOMBRE del método es un identificador dentro de su nodo: sin
  // esto, un método se contaría a sí mismo como campo y quedaría unido a
  // cualquier hermano que lo invoque.
  const nombrePropio = fieldOf(fn.node, ["name"]);
  // Las anotaciones/decoradores del método no son accesos a campo: se saltea
  // el subárbol entero, no sólo el nodo. Ver `ANNOTATION_NODE_WORD`.
  const anotados = new Set<ProbeNode>();
  walk(fn.node, (n) => {
    if (n.isNamed && ANNOTATION_NODE_WORD.test(n.type)) walk(n, (m) => anotados.add(m));
  });
  // Los nodos que son BLANCO DE UNA LLAMADA: `f` en `f(...)`. Se recogen en una
  // pasada previa por TEXTO del subárbol destino, porque la gramática no da un
  // enlace al padre y comparar nodos por identidad no es seguro con este binding.
  const blancosDeLlamada = new Set<string>();
  walk(fn.node, (n) => {
    if (!n.isNamed) return;
    const args = fieldOf(n, ARGUMENT_LIST_FIELDS);
    if (!args) return;
    const destino = fieldOf(n, CALL_TARGET_FIELDS);
    if (destino) blancosDeLlamada.add(textOf(destino));
  });
  // Recorrido PROPIO en vez de `walk`, porque hace falta saber si el nodo está
  // adentro de una función anidada que REENLAZA la auto-referencia — un hecho
  // del camino, no del nodo, y `walk` no lo lleva.
  const visitar = (n: ProbeNode, reenlazado: boolean): void => {
    if (n.isNamed && n !== fn.node && functionNodes.has(n.type) && !CIERRA_SOBRE_SELF_NODE_WORD.test(n.type)) {
      reenlazado = true;
    }
    if (n.isNamed && n !== nombrePropio && !anotados.has(n)) {
      if (DECLARATOR_NODE_WORD.test(n.type)) {
        const d = nombreDeclarado(n);
        if (d) locales.add(d); // una local que TAPA el nombre del campo no cuenta como acceso al campo
      } else if (SELF_DATA_NODE_TYPE.test(n.type)) {
        // `@x` de Ruby es SIGILO, no un enlace: ninguna función anidada lo mueve.
        anotar(bareName(textOf(n)), "ivar");
      } else {
        const acc = accessOf(n);
        const auto = acc && isIdentifierLike(acc.member) ? autoReferenciaDe(acc.base, language, receptores) : null;
        if (acc && auto !== null) {
          const m = textOf(acc.member);
          if (!metodos.has(m)) {
            // `this.otro()` es control, no estado — por eso el `metodos.has`.
            if (auto === "campo-propio") {
              // `@otro.x` NO es un campo propio: `x` es de `@otro`.
              anotar(m, "ivar-mem");
            } else {
              const llamada = blancosDeLlamada.has(textOf(n));
              // El reenlace sólo es posible si la auto-referencia es un NODO
              // DEDICADO (`this`/`self`/`super`), que es lo que la llamada
              // fija. Si es un NOMBRE LIGADO (Python, Go), la clausura lo
              // captura y la función anidada no lo mueve: `lex-*`.
              const dedicado = SELF_NODE_TYPE.test(acc.base.type);
              anotar(
                m,
                reenlazado
                  ? dedicado
                    ? llamada ? "reb-call" : "reb-val"
                    : llamada ? "lex-call" : "lex-val"
                  : llamada ? "self-call" : "self-val",
              );
            }
          }
        } else if (isIdentifierLike(n)) {
          const t = textOf(n);
          if (!locales.has(t) && !metodos.has(t)) {
            if (declaraOEscribe.has(t)) anotar(t, "bare");
            else if (declaradosAT1.has(t)) anotar(t, "bare-at1");
          }
        }
      }
    }
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i);
      if (c) visitar(c, reenlazado);
    }
  };
  visitar(fn.node, false);
  return campos;
}

/**
 * ── EL MODELO DE CAMPOS, EN UN SOLO LUGAR ─────────────────────────────────
 * `AT1` reproduce el modelo de la ola anterior (todo cuenta) y viaja SÓLO en la
 * traza, para que el delta se atribuya offline sin una segunda corrida pesada.
 * `AU3` es el vigente:
 *
 *   > **UN CAMPO ES UN DATO DE ESTA CLASE.** `@otro.x` es de `@otro`. Un
 *   > `this.x(...)` que la clase no declara ni escribe es un MÉTODO —heredado,
 *   > builtin o delegado— y no un dato. Todo lo demás entra.
 *
 * La segunda mitad es la que separa el miembro HEREDADO que sí es un campo
 * (`this.instance.set(...)`, `AbstractHttpAdapter.instance`: se usa como
 * VALOR) del que es un método (`this.getInstance()`, `this.assertEqual(1)`:
 * blanco de llamada). Es un hecho del archivo — se abre y se mira cómo se usa
 * el nombre — y no una lista de palabras por lenguaje.
 */
function camposSegunModelo(
  crudo: ReadonlyMap<string, Set<Procedencia>>,
  declaraOEscribe: ReadonlySet<string>,
  modelo: "AT1" | "AU3" | "AW1",
): ReadonlySet<string> {
  const out = new Set<string>();
  for (const [nombre, ps] of crudo) {
    if (modelo === "AT1") { out.add(nombre); continue; }
    // AU3 no distinguía el `this` REENLAZADO de una función anidada: lo contaba
    // como si fuera el de la clase. Se conserva computable para poder publicar
    // el delta exacto del arreglo de la Ola AW sin una segunda corrida.
    // `lex-val` cuenta en LOS DOS modelos: es un `self.x` de Python/Go adentro
    // de una función anidada, y ahí la auto-referencia es un nombre ligado que
    // la clausura captura — es un campo propio de verdad.
    const valor =
      ps.has("ivar") || ps.has("bare") || ps.has("self-val") || ps.has("lex-val") ||
      (modelo === "AU3" && ps.has("reb-val"));
    if (valor || declaraOEscribe.has(nombre)) out.add(nombre);
  }
  return out;
}

/**
 * La unidad tipo-clase del hallazgo. Tres vías, en este orden, porque los dos
 * anclas dan ubicaciones de forma distinta:
 *   1. `large-class` trae el NOMBRE de la clase en `locations[0].symbol` y un
 *      span que va del primer al último MIEMBRO — es decir, un span
 *      ESTRICTAMENTE INTERIOR al nodo de la clase (`class X {` queda afuera).
 *      Por eso "la clase que contiene el span" es la vía correcta acá y
 *      "la clase contenida en el span" NO lo sería.
 *   2. `divergent-change` trae el ARCHIVO entero y ningún símbolo: ahí ninguna
 *      clase contiene el span, y la elección correcta es la clase con más
 *      métodos del archivo.
 *   3. Si hay nombre, gana el nombre.
 */
function claseDelHallazgo(file: FileUnit, symbol: string | null, startLine: number, endLine: number): ProbeNode | null {
  const clases: { node: ProbeNode; s: number; e: number; nombre: string | null }[] = [];
  walk(file.root, (n) => {
    if (!n.isNamed || !file.sets.classNodes.has(n.type)) return;
    const a = n as AstNode;
    const nombreNodo = n.childForFieldName("name");
    clases.push({
      node: n,
      s: a.startPosition.row + 1,
      e: a.endPosition.row + 1,
      nombre: nombreNodo ? (nombreNodo as AstNode).text : null,
    });
  });
  if (clases.length === 0) return null;

  if (symbol !== null) {
    const porNombre = clases.filter((c) => c.nombre === symbol);
    if (porNombre.length === 1) return porNombre[0]!.node;
    if (porNombre.length > 1) {
      // Homónimas: la que solapa el span del hallazgo.
      const solapa = porNombre.filter((c) => c.s <= endLine && startLine <= c.e);
      if (solapa.length > 0) return solapa[0]!.node;
      return porNombre[0]!.node;
    }
  }

  const contienen = clases.filter((c) => c.s <= startLine && c.e >= endLine);
  if (contienen.length > 0) {
    return contienen.reduce((a, b) => (b.e - b.s < a.e - a.s ? b : a)).node;
  }

  // Ninguna contiene el span (el caso `divergent-change`, archivo entero): la
  // clase con más métodos, que es sobre la que este cálculo tiene algo que decir.
  let mejor = clases[0]!;
  let mejorN = -1;
  for (const c of clases) {
    const n = file.functions.filter((f) => f.startLine >= c.s && f.endLine <= c.e).length;
    if (n > mejorN) {
      mejorN = n;
      mejor = c;
    }
  }
  return mejor.node;
}

/** Union-find chiquito: los racimos son componentes conexas de "comparten un campo". */
function racimosDe(metodos: readonly { fn: FunctionUnit; campos: ReadonlySet<string> }[]): Racimo[] {
  const padre = metodos.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (padre[r] !== r) r = padre[r]!;
    let c = i;
    while (padre[c] !== c) {
      const next = padre[c]!;
      padre[c] = r;
      c = next;
    }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) padre[ra] = rb;
  };
  const porCampo = new Map<string, number[]>();
  for (const [i, m] of metodos.entries()) {
    for (const campo of m.campos) {
      let l = porCampo.get(campo);
      if (!l) porCampo.set(campo, (l = []));
      l.push(i);
    }
  }
  for (const l of porCampo.values()) for (let k = 1; k < l.length; k++) union(l[0]!, l[k]!);

  const grupos = new Map<number, number[]>();
  for (let i = 0; i < metodos.length; i++) {
    const r = find(i);
    let g = grupos.get(r);
    if (!g) grupos.set(r, (g = []));
    g.push(i);
  }
  return [...grupos.values()]
    .map((idxs) => {
      const campos = new Set<string>();
      for (const i of idxs) for (const c of metodos[i]!.campos) campos.add(c);
      return { metodos: idxs.map((i) => metodos[i]!.fn), campos: [...campos] };
    })
    .sort((a, b) => b.metodos.length - a.metodos.length);
}


/* ────────────────────────────────────────────────────────────────────────
 * LA MEDIDA GRADUAL — TCC, la escalera de umbral de arista, y la pureza
 * ──────────────────────────────────────────────────────────────────────── */

type Medido = { fn: FunctionUnit; campos: ReadonlySet<string> };

/** TCC (Bieman & Kang): fracción de PARES de métodos que comparten al menos un campo. */
function tccDe(medidos: readonly Medido[]): number | null {
  const n = medidos.length;
  if (n < 2) return null;
  let comparten = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let hay = false;
      for (const c of medidos[i]!.campos) {
        if (medidos[j]!.campos.has(c)) { hay = true; break; }
      }
      if (hay) comparten++;
    }
  }
  return comparten / ((n * (n - 1)) / 2);
}

/**
 * Componentes conexas de "comparten AL MENOS `t` campos" — el peldaño `t` de
 * la escalera. `t = 1` reproduce EXACTAMENTE la relación de la Ola AS.
 */
function componentesT(medidos: readonly Medido[], t: number): number[][] {
  const n = medidos.length;
  const padre = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (padre[r] !== r) r = padre[r]!;
    let c = i;
    while (padre[c] !== c) { const s = padre[c]!; padre[c] = r; c = s; }
    return r;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let comunes = 0;
      for (const c of medidos[i]!.campos) if (medidos[j]!.campos.has(c)) comunes++;
      if (comunes >= t) { const a = find(i); const b = find(j); if (a !== b) padre[a] = b; }
    }
  }
  const grupos = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let g = grupos.get(r);
    if (!g) grupos.set(r, (g = []));
    g.push(i);
  }
  return [...grupos.values()].sort((a, b) => b.length - a.length);
}

/**
 * PUREZA de un corte: cada campo se asigna al lado que MÁS lo toca (empate →
 * el resto, para no regalarle campos al racimo que se extrae) y se cuenta qué
 * fracción de las incidencias (método, campo) NO cruza la frontera. Es la
 * versión GRADUAL del absoluto "ni un campo en común", que es el caso
 * `pureza === 1`.
 */
function purezaDe(medidos: readonly Medido[], enRacimo: ReadonlySet<number>): { pureza: number; cruces: number; campos: string[] } {
  const cuenta = new Map<string, [number, number]>();
  let total = 0;
  for (const [i, m] of medidos.entries()) {
    for (const c of m.campos) {
      let a = cuenta.get(c);
      if (!a) cuenta.set(c, (a = [0, 0]));
      a[enRacimo.has(i) ? 1 : 0]++;
      total++;
    }
  }
  if (total === 0) return { pureza: 0, cruces: 0, campos: [] };
  const delRacimo = new Set<string>();
  for (const [c, a] of cuenta) if (a[1] > a[0]) delRacimo.add(c);
  let cruces = 0;
  for (const [i, m] of medidos.entries()) {
    const dentro = enRacimo.has(i);
    for (const c of m.campos) if (delRacimo.has(c) !== dentro) cruces++;
  }
  return { pureza: 1 - cruces / total, cruces, campos: [...delRacimo].sort() };
}

/**
 * EL MEJOR RACIMO SEPARABLE. Recorre la escalera `t = 1..T_MAXIMO`, toma cada
 * componente conexa que cumpla los pisos de tamaño, y se queda con la de mayor
 * PUREZA (a igual pureza gana el `t` más chico: el racimo más generoso).
 *
 * **El racimo sale SIEMPRE de una componente conexa**, nunca de una búsqueda
 * libre que optimice la pureza. Medido durante la construcción: optimizar la
 * pureza a secas (refinamiento tipo Kernighan-Lin) produce cortes de pureza
 * 1,000 formados por TRES MÉTODOS HUÉRFANOS que no se tocan entre sí —
 * `jekyll/Document` tiene componentes [29, 1, 1, 1, 1] y juntar los tres
 * singletones da pureza perfecta con una "clase" que no es una clase. La
 * pureza sola premia la bolsa de huérfanos; por eso ordena y no busca.
 */
/**
 * EL ORDEN ENTRE DOS CORTES, explícito para que no dependa del orden de
 * iteración. Manda la PUREZA; los tres desempates sólo actúan ante empates
 * exactos y cada uno tiene su razón escrita:
 *   1. **el racimo MÁS CHICO** — la clase nueva debe ser la pieza que se
 *      desprende, no la mitad que ES la clase. Es la misma elección que hacía
 *      la Ola AS al tomar `racimos[1]` (la segunda componente por tamaño).
 *   2. **el que EMPIEZA MÁS ABAJO en el archivo** — una clase grande crece
 *      por acreción, y ante dos racimos del mismo tamaño el que se agregó
 *      después es el apéndice; el de arriba suele ser la identidad original.
 *   3. **el peldaño `t` más chico** — el racimo más generoso de los dos.
 */
function ordenDeCortes(a: Corte, b: Corte): number {
  if (Math.abs(a.pureza - b.pureza) > 1e-12) return b.pureza - a.pureza;
  if (a.metodos.length !== b.metodos.length) return a.metodos.length - b.metodos.length;
  const ia = Math.min(...a.metodos.map((m) => m.startLine));
  const ib = Math.min(...b.metodos.map((m) => m.startLine));
  if (ia !== ib) return ib - ia;
  return a.t - b.t;
}

function mejorCorte(medidos: readonly Medido[]): Corte | null {
  const n = medidos.length;
  if (n < 2 * MIN_METODOS_RACIMO) return null;
  let mejor: Corte | null = null;
  for (let t = 1; t <= T_MAXIMO; t++) {
    const comps = componentesT(medidos, t);
    if (comps.length < 2) continue;
    for (const comp of comps) {
      // EL RACIMO A EXTRAER ES SIEMPRE LA MINORÍA — defecto medido y corregido en esta ola.
      // Sin esta línea, `jekyll/Document` (componentes [29, 1, 1, 1, 1, 1, 1]) proponía
      // "extraé estos 29 métodos y dejá 5 sueltos": la componente grande pasa los pisos de
      // tamaño y tiene pureza 1,0 por ser disjunta, así que gana. Pero 29 de 34 métodos NO
      // son un apéndice: SON la clase. La Ola AS lo evitaba por accidente, al mirar sólo
      // `racimos[1]` (nunca la primera); acá se dice explícitamente.
      if (comp.length * 2 > n) continue;
      if (comp.length < MIN_METODOS_RACIMO || n - comp.length < MIN_METODOS_RACIMO) continue;
      const enRacimo = new Set(comp);
      const { pureza, cruces, campos } = purezaDe(medidos, enRacimo);
      if (campos.length < MIN_CAMPOS_RACIMO) continue;
      const cand: Corte = { t, metodos: comp.map((i) => medidos[i]!.fn), campos, pureza, cruces, metodosRestantes: n - comp.length };
      if (mejor === null || ordenDeCortes(cand, mejor) < 0) mejor = cand;
    }
  }
  return mejor;
}

/** Nombres de métodos propios que este método invoca (para medir el acoplamiento entre racimos). */
function llamadasPropiasDe(fn: FunctionUnit, language: string): ReadonlySet<string> {
  const receptores = receiverNamesOf(fn.node);
  const nombres = new Set<string>();
  walk(fn.node, (n) => {
    if (!n.isNamed || !fieldOf(n, ARGUMENT_LIST_FIELDS)) return;
    const target = fieldOf(n, CALL_TARGET_FIELDS);
    if (!target) return;
    const acc = accessOf(target);
    if (acc && isIdentifierLike(acc.member) && esAutoReferencia(acc.base, language, receptores)) {
      nombres.add(textOf(acc.member));
    } else if (isIdentifierLike(target)) {
      nombres.add(textOf(target)); // llamada sin receptor: en Ruby/Python/Java es un método propio
    }
  });
  return nombres;
}

/** ¿Algún OTRO tipo del repo ya declara, JUNTO, el conjunto de campos del racimo chico? */
function duenoExistente(graph: CodeGraph | null, campos: readonly string[], claseActual: string | null): string | null {
  if (!graph || campos.length < MIN_CAMPOS_RACIMO) return null;
  const porUnidad = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    if (node.kind !== "symbol" || node.symbolPath.length < 2) continue;
    const unidad = node.symbolPath.slice(0, -1).join(".");
    const miembro = node.symbolPath[node.symbolPath.length - 1];
    if (miembro === undefined) continue;
    let s = porUnidad.get(unidad);
    if (!s) porUnidad.set(unidad, (s = new Set()));
    s.add(miembro);
  }
  for (const [unidad, miembros] of porUnidad) {
    if (claseActual !== null && unidad.endsWith(claseActual)) continue;
    let hits = 0;
    for (const c of campos) if (miembros.has(c)) hits++;
    if (hits === campos.length) return unidad;
  }
  return null;
}

function medir(problem: Finding, ctx: HypothesisContext, graph: CodeGraph | null): ExtractClassProblem {
  const loc = problem.locations[0]!;
  const file = ctx.file ?? ctx.fileAt(loc.file);
  const vacio: ExtractClassProblem = {
    kind: problem.kind,
    file: loc.file,
    clase: loc.symbol ?? null,
    conArbol: false,
    metodosConCampos: 0,
    racimos: [],
    llamadasEntreRacimos: 0,
    racimosSinHub: [],
    hub: null,
    hubMetodos: 0,
    hubDelCorte: null,
    usoClaseHub: 0,
    sobreviveSinHub: true,
    metodosMedidos: 0,
    tcc: null,
    corte: null,
    duenoExistente: null,
    locations: problem.locations,
    incidencia: [],
    declaraOEscribe: [],
    estaticos: [],
    escritosAjenos: [],
    escritosAnidados: [],
  };
  if (!file) return vacio;

  const symbolClase = loc.symbol ?? null;
  const classNode = claseDelHallazgo(file, symbolClase, loc.startLine, loc.endLine);
  if (!classNode) return { ...vacio, conArbol: true };
  const a = classNode as AstNode;
  const claseStart = a.startPosition.row + 1;
  const claseEnd = a.endPosition.row + 1;

  const { campos: declarados, camposAT1: declaradosAT1, metodos: metodosDeLaClase, escritosAjenos, escritosAnidados, estaticos } =
    camposDeclarados(classNode, file.sets.classNodes, file.sets.functionNodes, file.language);

  // ── EL SEGUNDO ARREGLO DE AU3: UN LAMBDA PASADO COMO ARGUMENTO NO ES UN MIEMBRO ──
  // AT1 midió el caso y localizó la causa: el chequeo de anidamiento de más
  // abajo excluye un lambda sólo si otra FUNCIÓN de `file.functions` lo
  // contiene, y hay contenedores que no son funciones. El ejemplo con archivo:
  // `ShareX/ApplicationSettingsViewModel.cs` emite una propuesta cuyos cuatro
  // "métodos" son `x => Settings.ThemeOptions.X = x`, los lambdas de cuatro
  // `set` de propiedad — el accesor de C# no está en `functionNodes`, así que
  // el lambda quedaba huérfano y pasaba por miembro.
  //
  // La causa REAL no es el accesor: es que **el lambda está adentro de una
  // LISTA DE ARGUMENTOS** (`SetSetting(..., x => ...)`), y eso lo hace un
  // argumento de una llamada, nunca un miembro de la clase — en los seis
  // lenguajes. Se resuelve con el campo de gramática que el vocabulario
  // compartido ya expone (`ARGUMENT_LIST_FIELDS`), sin nombrar un lenguaje ni
  // un tipo de nodo de accesor. Cubre de paso los 84 "métodos anónimos" de
  // `excalidraw/App.tsx` y los 4 de `chatwoot/DashboardAudioNotificationHelper.js`,
  // que son callbacks pasados a `.map(...)` y a suscriptores.
  const enArgumento = new Set<string>();
  {
    const marcar = (n: ProbeNode, dentro: boolean): void => {
      if (dentro && n.isNamed && file.sets.functionNodes.has(n.type)) {
        const q = n as AstNode;
        enArgumento.add(`${q.startPosition.row + 1}:${q.endPosition.row + 1}`);
      }
      const adentroAhora = dentro || (n.isNamed && ARGUMENT_LIST_NODE_WORD.test(n.type));
      for (let i = 0; i < n.childCount; i++) {
        const c = n.child(i);
        if (c) marcar(c, adentroAhora);
      }
    };
    marcar(classNode, false);
  }

  // A QUE METODOS MIRAR. Por `className` cuando el hallazgo nombra la clase, y
  // por SPAN solo cuando no la nombra.
  //
  // POR QUE EL NOMBRE MANDA, y no el span: **en Go los metodos NO viven
  // adentro de la declaracion del tipo** (`type S struct{...}` y `func (s *S)
  // M()` son hermanos de nivel de archivo). Un filtro por span deja a Go con
  // CERO metodos en toda clase — MEDIDO antes de este cambio: los dos
  // `large-class` de `hugo/config/configProvider.go` daban 0 metodos con
  // campos. Es la trampa 1 otra vez, en otra forma: una decision de
  // localizacion que un solo lenguaje no cumple. `FunctionMetrics.className`
  // ya lo resuelve (lo deriva el walker) y es ademas la MISMA agrupacion que
  // usa `detect/intra-file/large-class.ts` para contar los miembros del
  // hallazgo, asi que es el unico criterio que garantiza mirar el MISMO
  // conjunto de metodos que el ancla conto.
  // (Ola AX) `claseDe` cae al TIPO DEL RECEPTOR cuando el walker no derivó
  // `className` — que en Go es SIEMPRE. Ver el docstring de `tipoReceptorDe`.
  const porNombre = symbolClase !== null && file.functions.some((f) => claseDe(f) === symbolClase);
  const medidos: { fn: FunctionUnit; campos: ReadonlySet<string> }[] = [];
  const incidencia: { m: string; s: number; e: number; ctor: boolean; campos: Record<string, readonly string[]>; enArgumento: boolean }[] = [];
  for (const [i, fn] of file.functions.entries()) {
    if (porNombre) {
      if (claseDe(fn) !== symbolClase) continue;
    } else if (fn.startLine < claseStart || fn.endLine > claseEnd) continue;
    const esCtor = fn.metrics.isConstructor === true;
    // Un lambda anidado no es un miembro de la clase.
    let anidada = false;
    for (const [j, o] of file.functions.entries()) {
      if (i === j) continue;
      if (o.startLine === fn.startLine && o.endLine === fn.endLine) continue;
      if (o.startLine <= fn.startLine && o.endLine >= fn.endLine && (porNombre || o.startLine >= claseStart)) {
        anidada = true;
        break;
      }
    }
    const esArgumento = enArgumento.has(`${fn.startLine}:${fn.endLine}`);
    const crudo = camposDe(fn, file.language, declarados, declaradosAT1, metodosDeLaClase, file.sets.functionNodes);
    const campos = camposSegunModelo(crudo, declarados, "AW1");
    // La traza guarda TODO lo que el span/nombre alcanza, con la PROCEDENCIA de
    // cada campo y con el motivo de exclusión marcado: es el hecho crudo, y de
    // ahí sale la atribución offline de cualquier variante del modelo. Los
    // checks sólo ven `medidos`.
    if (crudo.size > 0) {
      const procedencias: Record<string, string[]> = {};
      for (const [k, v] of crudo) procedencias[k] = [...v].sort();
      incidencia.push({
        m: fn.name ?? "(anónima)", s: fn.startLine, e: fn.endLine, ctor: esCtor,
        campos: anidada ? {} : procedencias,
        enArgumento: esArgumento,
      });
    }
    if (anidada || esArgumento) continue;
    if (campos.size === 0) continue; // un método sin estado propio no pertenece a ningún racimo
    if (esCtor) continue; // ver el docstring: un constructor une TODOS los campos
    medidos.push({ fn, campos });
  }

  const racimos = racimosDe(medidos);

  // MEDIDA AUXILIAR, solo para la traza (no entra en ningun check): la clase,
  // ¿queda pegada por UN campo-cubo que todos tocan? Si al sacar el campo mas
  // compartido la clase SI se parte, la lectura correcta no es "es cohesiva"
  // sino "hay un campo de infraestructura". Se publica el numero en vez de
  // decidir por adelantado cual de las dos lecturas vale.
  const cuentaPorCampo = new Map<string, number>();
  for (const m of medidos) for (const c of m.campos) cuentaPorCampo.set(c, (cuentaPorCampo.get(c) ?? 0) + 1);
  let hub: string | null = null;
  let hubN = 0;
  for (const [c, n] of cuentaPorCampo) if (n > hubN) { hub = c; hubN = n; }
  const racimosSinHub =
    hub === null
      ? []
      : racimosDe(medidos.map((m) => ({ fn: m.fn, campos: new Set([...m.campos].filter((c) => c !== hub)) }))).map((r) => r.metodos.length);

  // Acoplamiento entre racimos: cuántas llamadas cruzan la frontera.
  const racimoDe = new Map<FunctionUnit, number>();
  for (const [ri, r] of racimos.entries()) for (const m of r.metodos) racimoDe.set(m, ri);
  let cruces = 0;
  for (const m of medidos) {
    const mi = racimoDe.get(m.fn);
    if (mi === undefined) continue;
    const llamadas = llamadasPropiasDe(m.fn, file.language);
    for (const o of medidos) {
      const oi = racimoDe.get(o.fn);
      if (oi === undefined || oi === mi) continue;
      if (o.fn.name !== null && llamadas.has(o.fn.name)) cruces++;
    }
  }

  const tcc = tccDe(medidos);
  const corte = mejorCorte(medidos);

  // LA COMPUERTA DEL HUB, calculada SIEMPRE y guardada en la traza (ver el
  // docstring de `HUB_FRACCION_CLASE`). Es un HECHO sobre el corte emitido, no
  // sobre la clase entera: `hub` (más arriba) mide el campo más compartido de
  // TODA la clase y es otra cosa, se conserva porque AW1 la dejó en la traza.
  let hubDelCorte: string | null = null;
  let usoClaseHub = 0;
  let sobreviveSinHub = true;
  if (corte) {
    const enCorte = new Set(corte.metodos);
    // LOS CANDIDATOS A HUB SON LOS CAMPOS QUE PEGAN EL RACIMO — los que tocan
    // DOS O MÁS métodos del corte —, **no** `corte.campos`. La corrección se
    // encontró con un fixture sintético, ANTES de mirar un solo sujeto del
    // corpus, y está declarada en `ola-ax/informes/AX1.md` §0.6: `corte.campos`
    // sale de `purezaDe`, que sólo deja el campo del lado del racimo si el
    // racimo lo toca MÁS que el resto (`a[1] > a[0]`), así que **un campo que
    // usa toda la clase queda excluido de `corte.campos` por construcción** —
    // justo el que la hipótesis de AW1 acusa. La conectividad, en cambio, la
    // calcula `componentesT` sobre los campos COMPLETOS de cada método, hub
    // incluido: ahí es donde el hub pega.
    const candidatos = new Set<string>();
    {
      const cuenta = new Map<string, number>();
      for (const m of medidos) if (enCorte.has(m.fn)) for (const c of m.campos) cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
      for (const [c, n] of cuenta) if (n >= 2) candidatos.add(c);
    }
    let usoCorteHub = -1;
    for (const c of [...candidatos].sort()) {
      const uClase = medidos.filter((m) => m.campos.has(c)).length;
      const uCorte = medidos.filter((m) => enCorte.has(m.fn) && m.campos.has(c)).length;
      if (uClase > usoClaseHub || (uClase === usoClaseHub && uCorte > usoCorteHub)) {
        hubDelCorte = c;
        usoClaseHub = uClase;
        usoCorteHub = uCorte;
      }
    }
    if (hubDelCorte !== null) {
      const sinHub = medidos.map((m) => ({ fn: m.fn, campos: new Set([...m.campos].filter((c) => c !== hubDelCorte)) }));
      const idxCorte = new Set(sinHub.map((m, i) => (enCorte.has(m.fn) ? i : -1)).filter((i) => i >= 0));
      sobreviveSinHub = componentesT(sinHub, corte.t).some(
        (comp) => comp.length >= MIN_METODOS_RACIMO && [...idxCorte].every((i) => comp.includes(i)),
      );
    }
  }
  const chico = racimos[1];
  return {
    kind: problem.kind,
    file: loc.file,
    clase: loc.symbol ?? null,
    conArbol: true,
    metodosConCampos: medidos.length,
    racimos,
    llamadasEntreRacimos: cruces,
    racimosSinHub,
    hub,
    hubMetodos: hubN,
    hubDelCorte,
    usoClaseHub,
    sobreviveSinHub,
    metodosMedidos: medidos.length,
    tcc,
    corte,
    duenoExistente: corte ? duenoExistente(graph, corte.campos, loc.symbol ?? null) : chico ? duenoExistente(graph, chico.campos, loc.symbol ?? null) : null,
    locations: problem.locations,
    incidencia,
    declaraOEscribe: [...declarados].sort(),
    estaticos: [...estaticos].sort(),
    escritosAjenos: [...escritosAjenos].sort(),
    escritosAnidados: [...escritosAnidados].sort(),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * LOS CHECKS
 * ══════════════════════════════════════════════════════════════════════════ */

const cohesionMuyBaja: Check<ExtractClassProblem, CodeGraph | null> = {
  id: "cohesion-muy-baja-tcc",
  describe: "TCC por debajo de 1/3 — el umbral de God Class de Lanza & Marinescu: tres o más responsabilidades",
  run(p) {
    if (p.tcc === null) return { holds: false, evidence: "Menos de dos métodos con campos: no hay pares que medir." };
    return p.tcc < TCC_MAXIMO
      ? {
          holds: true,
          evidence:
            `TCC = ${(p.tcc * 100).toFixed(1)} %, por debajo del ${(TCC_MAXIMO * 100).toFixed(1)} % de la estrategia de God Class de ` +
            "Lanza & Marinescu. Ese umbral es, aritméticamente, una condición de TRES O MÁS responsabilidades (dos racimos completos " +
            "no bajan de 0,40): cumplirlo dice que la clase no tiene un apéndice, tiene varias piezas.",
        }
      : {
          holds: false,
          evidence:
            `TCC = ${(p.tcc * 100).toFixed(1)} %, por encima del ${(TCC_MAXIMO * 100).toFixed(1)} % de God Class. NO es una objeción: ` +
            "una clase partida en DOS racimos internamente cohesivos tiene TCC entre 0,40 y 0,50 por construcción. Sólo dice que " +
            "la partición es en dos y no en tres o más.",
        };
  },
};

const racimoSeparable: Check<ExtractClassProblem, CodeGraph | null> = {
  id: "racimo-separable",
  describe: "Existe un racimo conexo de métodos cuyos accesos a campo casi no cruzan la frontera",
  run(p) {
    if (!p.conArbol) {
      return { holds: false, evidence: "No hubo árbol vivo de este archivo: el racimo es un hecho del texto y sin texto no se afirma." };
    }
    if (p.metodosConCampos < MIN_METODOS_CON_CAMPOS) {
      return {
        holds: false,
        evidence:
          `Sólo ${p.metodosConCampos} método(s) de la clase tocan algún campo propio (piso ${MIN_METODOS_CON_CAMPOS}): sin estado ` +
          "compartido no hay racimos que medir, y 'la clase es grande' por sí solo es un síntoma de tamaño, no una fuerza.",
      };
    }
    const c = p.corte;
    if (!c) {
      return {
        holds: false,
        evidence:
          `Ninguno de los ${T_MAXIMO} peldaños de la escalera ("comparten al menos t campos", t = 1..${T_MAXIMO}) parte los ` +
          `${p.metodosConCampos} métodos en un racimo de ≥${MIN_METODOS_RACIMO} métodos y ≥${MIN_CAMPOS_RACIMO} campos con un resto ` +
          `de ≥${MIN_METODOS_RACIMO}: no hay nada concreto que extraer, aunque la cohesión global sea baja.`,
      };
    }
    if (c.pureza < PUREZA_MINIMA) {
      return {
        holds: false,
        evidence:
          `El mejor racimo (t = ${c.t}, ${c.metodos.length} métodos) tiene pureza ${(c.pureza * 100).toFixed(1)} % (piso ` +
          `${(PUREZA_MINIMA * 100).toFixed(0)} %): ${c.cruces} acceso(s) a campo cruzarían la frontera, así que la clase nueva ` +
          "quedaría pidiéndole datos a la vieja y el acoplamiento no baja.",
      };
    }
    // LA COMPUERTA DEL HUB (Ola AX), pre-registrada en `ola-ax/informes/AX1.md` §0.
    if (COMPUERTA_HUB && p.hubDelCorte !== null && !p.sobreviveSinHub && p.metodosMedidos > 0 && p.usoClaseHub / p.metodosMedidos >= HUB_FRACCION_CLASE) {
      return {
        holds: false,
        evidence:
          `El racimo lo PEGA un solo campo: "${p.hubDelCorte}" lo tocan ${p.usoClaseHub} de los ${p.metodosMedidos} métodos con ` +
          `campos de la clase (${((p.usoClaseHub / p.metodosMedidos) * 100).toFixed(0)} %, piso ${(HUB_FRACCION_CLASE * 100).toFixed(0)} %), ` +
          "y sacándoselo el racimo deja de ser una componente conexa. Eso no es una responsabilidad separable: es un campo de " +
          "infraestructura que usa toda la clase (un asa, un cerrojo, un handle), y extraer el racimo dejaría a la clase nueva " +
          "pidiéndoselo a la vieja.",
      };
    }
    return {
      holds: true,
      evidence:
        `Racimo conexo al nivel t = ${c.t} ("comparten al menos ${c.t} campo${c.t > 1 ? "s" : ""}"): ${c.metodos.length} métodos ` +
        `(${c.metodos.map((m) => m.name ?? "(anónima)").slice(0, 6).join(", ")}) sobre ${c.campos.length} campos ` +
        `(${c.campos.slice(0, 6).join(", ")}), y el resto de la clase se queda con ${c.metodosRestantes}. ` +
        `PUREZA ${(c.pureza * 100).toFixed(1)} %: de todos los accesos a campo de la clase, sólo ${c.cruces} cruzarían la frontera nueva.`,
    };
  },
};

const purezaTotal: Check<ExtractClassProblem, CodeGraph | null> = {
  id: "pureza-total",
  describe: "El racimo no comparte NI UN campo con el resto",
  run(p) {
    const c = p.corte;
    if (!c) return { holds: false, evidence: "No hay racimo que evaluar." };
    return c.cruces === 0
      ? { holds: true, evidence: "Cero accesos cruzan la frontera: la separación en datos es total, no parcial." }
      : { holds: false, evidence: `${c.cruces} acceso(s) a campo cruzan la frontera (pureza ${(c.pureza * 100).toFixed(1)} %).` };
  },
};

const sinLlamadasEntreRacimos: Check<ExtractClassProblem, CodeGraph | null> = {
  id: "sin-llamadas-entre-racimos",
  describe: "Los dos racimos tampoco se llaman entre sí",
  run(p) {
    if (p.racimos.length < 2) return { holds: false, evidence: "No hay dos componentes que comparar en control." };
    return p.llamadasEntreRacimos === 0
      ? { holds: true, evidence: "Cero llamadas de un racimo al otro: la frontera es limpia en datos Y en control." }
      : { holds: false, evidence: `${p.llamadasEntreRacimos} llamada(s) cruzan la frontera: la clase nueva quedaría llamando a la vieja.` };
  },
};

const racimoChicoGrande: Check<ExtractClassProblem, CodeGraph | null> = {
  id: "racimo-chico-grande",
  describe: "El racimo a extraer es sustancial (seis métodos o más)",
  run(p) {
    const n = p.corte?.metodos.length ?? 0;
    return n >= 6
      ? { holds: true, evidence: `${n} métodos en el racimo a extraer.` }
      : { holds: false, evidence: `${n} métodos en el racimo a extraer: por encima del piso, pero la clase nueva sigue siendo chica.` };
  },
};

const masDeDosRacimos: Check<ExtractClassProblem, CodeGraph | null> = {
  id: "mas-de-dos-racimos",
  describe: "La clase se parte en tres o más racimos",
  run(p) {
    return p.racimos.length >= 3
      ? { holds: true, evidence: `${p.racimos.length} componentes disjuntas ya al nivel t = 1: no es una clase con un apéndice, son varias clases juntas.` }
      : { holds: false, evidence: `${p.racimos.length} componente(s) al nivel t = 1: la partición aparece más arriba en la escalera.` };
  },
};

/* ══════════════════════════════════════════════════════════════════════════
 * `appliedState`
 * ══════════════════════════════════════════════════════════════════════════ */

const YA_LABEL = "El tipo que agruparía esos campos ya existe en el repo";

/**
 * ── POR QUÉ ESTA FAMILIA NUNCA DICE `ya-aplicado`, Y ES UNA DECISIÓN MEDIDA ─
 *
 * La primera versión sí lo decía: si alguna unidad del grafo declaraba JUNTOS
 * todos los campos del racimo, se afirmaba "la clase ya existe, usala". Emitió
 * TRES confirmaciones sobre los 13 repos de biblioteca y **las tres son
 * falsas**, por la misma razón estructural:
 *
 *   · `guava .../cache/LocalCache.java` → "CacheBuilder ya declara
 *     `expireAfterWriteNanos`/`expireAfterAccessNanos`". Es cierto que los
 *     declara — y es correcto que lo haga: un `Builder` COPIA su configuración
 *     al producto. No hay ninguna clase que extraer ni ninguna duplicación que
 *     arreglar.
 *   · `sqlalchemy .../engine/default.py` → "MSDialect ya declara
 *     `insert_returning`/`update_returning`/…". `MSDialect` es una SUBCLASE de
 *     `DefaultDialect` que redefine esas banderas. Un override no es una
 *     extracción hecha.
 *
 * El mecanismo del grafo cruza NOMBRES de miembro (`symbolPath`), y por
 * construcción no distingue "otro tipo resolvió esto" de "un builder copia" o
 * "una subclase redefine". Sin aristas de herencia y de construcción que lo
 * separen, la afirmación no se sostiene, así que **no se afirma**: el dato se
 * conserva como EVIDENCIA para confirmar a mano, con el estado en `ausente`.
 *
 * Y hay una segunda consecuencia, deliberada, del lado del motor: `large-class`
 * es un ancla COMPARTIDA con `template-method.ts`, y
 * `engine.ts#arbitrateRivalHypotheses` retira una OPORTUNIDAD ajena cuando otra
 * hipótesis del mismo `Finding` está en `ya-aplicado`/`aplicado-eludido` y sus
 * `places` solapan. **Al no producir ningún estado confirmado, esta familia no
 * puede borrarle la propuesta a nadie — ni a `Template Method`, ni a
 * `Extract Method`, ni a `Value Object`.** Deja de ser una posibilidad que haya
 * que medir con una corrida de control: es imposible por construcción.
 */
function appliedState(p: ExtractClassProblem): AppliedStateResult {
  return {
    state: "ausente",
    checks: [
      {
        label: YA_LABEL,
        passed: false,
        why:
          p.duenoExistente !== null
            ? `"${p.duenoExistente}" declara los mismos NOMBRES de campo que el racimo a extraer. NO se afirma que la clase ya ` +
              "exista: el grafo cruza nombres y no distingue eso de un builder que copia su configuración al producto ni de una " +
              "subclase que redefine las mismas banderas — las dos formas se midieron y las dos daban esta coincidencia. Es un " +
              "lugar para mirar antes de extraer nada, no una confirmación."
            : p.racimos.length >= 2
              ? "Ninguna unidad del repo declara juntos los campos del racimo a extraer: el tipo no existe todavía."
              : "Sin racimo a extraer no hay tipo que buscar.",
        role: "applied",
      },
    ],
  };
}

const SOURCE =
  'Fowler, Refactoring, "Extract Class" (2.ª ed., cap. 7) — refactoring.guru/es/extract-class: ' +
  '"un subconjunto de los datos y un subconjunto de los métodos parecen ir juntos". La señal medida acá es TCC < 1/3 ' +
  "(Bieman & Kang; el umbral de la estrategia de God Class de Lanza & Marinescu, la pata que el ancla declara fuera de alcance) " +
  "más un racimo conexo cuyos accesos a campo casi no cruzan la frontera.";

const TO_CONFIRM: readonly string[] = [
  "Confirmar que los dos racimos son responsabilidades distintas y no dos VISTAS de la misma: dos grupos de campos pueden " +
    "estar separados por accidente (uno es caché del otro, uno es sólo de serialización) y separarlos duplicaría el invariante.",
  "Si la clase es una FACHADA o un punto de entrada por diseño, tener varios grupos de campos es lo que se le pidió: " +
    "`refactoring.guru`, 'Extract Class · cuándo NO conviene' — partirla mueve el problema a los clientes.",
  "Si los dos racimos se inicializan juntos y viven y mueren juntos, el tipo nuevo va a necesitar una referencia de vuelta y " +
    "el acoplamiento no baja: verificar el constructor antes de extraer (este cálculo lo EXCLUYE a propósito).",
  "Si el lenguaje resuelve esto con mixins/módulos/traits, extraer una clase puede ser más caro que extraer un módulo con el " +
    "mismo racimo adentro.",
  "Si el racimo chico es un grupo de helpers estáticos sin estado propio, lo que corresponde es moverlos, no crear un tipo.",
];

function buildSpec(): HypothesisSpec<ExtractClassProblem, CodeGraph | null> {
  return {
    pattern: "Extract Class",
    ceiling: "media",
    needs: ["unidad-tipo-clase"],
    required: [racimoSeparable],
    discriminators: [cohesionMuyBaja, purezaTotal, sinLlamadasEntreRacimos, racimoChicoGrande, masDeDosRacimos],
    appliedState: (p) => appliedState(p),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

function lugares(p: ExtractClassProblem): readonly RoleLocation[] {
  const chico = p.corte;
  if (!chico) return p.locations;
  const start = Math.min(...chico.metodos.map((m) => m.startLine));
  const end = Math.max(...chico.metodos.map((m) => m.endLine));
  const cabeza: RoleLocation = {
    file: p.file,
    startLine: start,
    endLine: end,
    symbol: p.clase ?? undefined,
    role:
      `racimo a extraer: ${chico.metodos.length} métodos sobre los campos ${chico.campos.slice(0, 6).join(", ")} ` +
      `(pureza ${(chico.pureza * 100).toFixed(0)} %: ${chico.cruces} acceso(s) cruzarían la frontera)`,
  };
  const resto: RoleLocation[] = chico.metodos.slice(0, 8).map((m) => ({
    file: p.file,
    startLine: m.startLine,
    endLine: m.endLine,
    symbol: m.name ?? undefined,
    role: "miembro del racimo a extraer",
  }));
  return [cabeza, ...resto];
}

export interface ExtractClassTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly clase: string | null;
  readonly conArbol: boolean;
  readonly metodosConCampos: number;
  readonly racimos: readonly number[];
  readonly camposRacimoChico: number;
  readonly llamadasEntreRacimos: number;
  readonly racimosSinHub: readonly number[];
  readonly hub: string | null;
  readonly hubMetodos: number;
  /** LA COMPUERTA DEL HUB (Ola AX): el campo del CORTE que más métodos de la
   *  clase tocan, cuántos lo tocan, cuántos métodos con campos tiene la clase,
   *  y si el corte sobrevive como componente al sacárselo. */
  readonly hubDelCorte: string | null;
  readonly usoClaseHub: number;
  readonly sobreviveSinHub: boolean;
  readonly metodosMedidos: number;
  readonly tcc: number | null;
  readonly pureza: number | null;
  readonly t: number | null;
  readonly cruces: number | null;
  readonly nRacimo: number | null;
  readonly diesAt: string | null;
  readonly appliedState: string;
  readonly emitted: boolean;
  /** El HECHO CRUDO: por método, cada nombre con sus PROCEDENCIAS (`Procedencia`).
   *  Con esto más `declaraOEscribe`, cualquier variante del modelo de campos se
   *  reconstruye offline sin volver a correr el analizador. */
  readonly incidencia: readonly { m: string; s: number; e: number; ctor: boolean; campos: Record<string, readonly string[]>; enArgumento: boolean }[];
  readonly declaraOEscribe: readonly string[];
  /** LA QUINTA PUERTA (Ola AX): lo declarado con `static`/`const`. No es estado
   *  de instancia; viaja para atribuir el delta offline. */
  readonly estaticos: readonly string[];
  readonly escritosAjenos: readonly string[];
  readonly escritosAnidados: readonly string[];
}

let trace: ExtractClassTraceEntry[] | null = null;

export function startExtractClassTrace(): void {
  trace = [];
}

export function takeExtractClassTrace(): readonly ExtractClassTraceEntry[] {
  const t = trace ?? [];
  trace = null;
  return t;
}

export const hypothesis: HypothesisBuilder = {
  id: "extract-class",
  pattern: "Extract Class",
  layer: "refactorizacion",
  anchors: [ANCHOR_LARGE_CLASS, ANCHOR_DIVERGENT],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext) {
    const p = medir(problem, ctx, graph);
    const spec = buildSpec();
    const outcome = runEngine(spec, ctx.capabilities, p, graph);
    if (trace) {
      const checks = spec.required.map((c) => ({ id: c.id, holds: c.run(p, graph).holds }));
      trace.push({
        findingId: problem.id ?? "",
        kind: problem.kind,
        file: p.file,
        clase: p.clase,
        conArbol: p.conArbol,
        metodosConCampos: p.metodosConCampos,
        racimos: p.racimos.map((r) => r.metodos.length),
        camposRacimoChico: p.racimos[1]?.campos.length ?? 0,
        llamadasEntreRacimos: p.llamadasEntreRacimos,
        racimosSinHub: p.racimosSinHub,
        hub: p.hub,
        hubMetodos: p.hubMetodos,
        hubDelCorte: p.hubDelCorte,
        usoClaseHub: p.usoClaseHub,
        sobreviveSinHub: p.sobreviveSinHub,
        metodosMedidos: p.metodosMedidos,
        tcc: p.tcc,
        pureza: p.corte?.pureza ?? null,
        t: p.corte?.t ?? null,
        cruces: p.corte?.cruces ?? null,
        nRacimo: p.corte?.metodos.length ?? null,
        diesAt: checks.find((c) => !c.holds)?.id ?? null,
        appliedState: spec.appliedState(p, graph).state,
        emitted: outcome !== null,
        incidencia: p.incidencia,
        declaraOEscribe: p.declaraOEscribe,
        estaticos: p.estaticos,
        escritosAjenos: p.escritosAjenos,
        escritosAnidados: p.escritosAnidados,
      });
    }
    if (!outcome) return null;
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: lugares(p),
      cost:
        "Una clase nueva con los campos del racimo chico adentro y sus métodos mudados. Se paga una vez, y a partir de ahí " +
        "cada cambio toca una de las dos y no las dos: el precio es una referencia entre ellas y el riesgo, que el corte " +
        "quede en un invariante compartido — por eso la lista de 'confirmar' empieza por ahí.",
    });
  },
};
