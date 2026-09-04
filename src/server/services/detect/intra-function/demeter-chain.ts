/**
 * `demeter-chain` — cadena de acceso a través de varios objetos (PLAN.md
 * §4.1 "Ley de Demeter | función | Sí, confianza baja fija | gramática. Una
 * cadena fluida de Builder tiene forma idéntica").
 *
 * RELACIÓN (qué mide, sin jerga de AST): una expresión `a.b.c.d` (o
 * `a.b().c().d()`) cuyo número de ESLABONES — accesos encadenados, cada uno
 * "sobre la base del anterior" — alcanza un umbral.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: ningún nombre de propiedad/método
 * importa, sólo la FORMA. Un nodo es un eslabón cuando resuelve un campo
 * GENÉRICO de "base de acceso" (`BASE_FIELDS` abajo) — nunca un nombre de
 * TIPO de nodo por lenguaje. Confirmado por sonda directa contra las 7
 * gramáticas soportadas (ruby, typescript —familia que también cubre
 * javascript/tsx/vue—, python, java, go, csharp):
 *   - `object`: `member_expression` (JS/TS/Vue), `attribute` (Python),
 *     `field_access`/`method_invocation` (Java).
 *   - `operand`: `selector_expression` (Go).
 *   - `receiver`: `call` (Ruby — fusiona receptor+método en un único nodo,
 *     así que Ruby no necesita el desenvuelto de invocación de abajo).
 *   - `expression`: `member_access_expression` (C#).
 * Un nodo de INVOCACIÓN que NO tiene base propia (JS/TS/Vue/Go
 * `call_expression`, Python `call`, C# `invocation_expression` — los cuatro
 * exponen su callee bajo el campo genérico `function`, confirmado por la
 * misma sonda) se atraviesa TRANSPARENTEMENTE para seguir contando: sin este
 * paso, `a.b().c().d()` mediría 0 eslabones, porque el `object` del acceso
 * más externo apunta al `call_expression` que lo envuelve, no directamente
 * al siguiente acceso. Java y Ruby nunca necesitan este desenvuelto: su
 * propio nodo de invocación YA es el eslabón (`method_invocation.object`,
 * `call.receiver`).
 *
 * *** YA NO CONFIANZA BAJA FIJA — JUICIO DE PRECISIÓN (frente de ruido de
 * nivel 1, agosto 2026): se intenta distinguir el caso legítimo, y la
 * medición muestra que SÍ se puede. *** Diagnóstico previo, confirmado por
 * esta ola con datos frescos: una cadena fluida de Builder/API fluida
 * (`query.select(x).where(y).orderBy(z)`, `crypto.createHash('sha1')
 * .update(buf).digest()`) y el protocolo de iterador (`index.keys()
 * .next().value`) tienen EXACTAMENTE la misma FORMA sintáctica que una
 * violación real de la Ley de Demeter — pero la Ley no habla de "cuántos
 * puntos", habla de ATRAVESAR OBJETOS AJENOS para llegar a un dato: ninguna
 * de las dos formas cruza hacia estructura ajena, las dos se quedan
 * navegando la MISMA API pública que su propio paso anterior ya devolvió.
 *
 * 38 hallazgos vivos juzgados a mano en `tests/golden/precision/*.verdicts.csv`
 * (5 lenguajes — python/csharp/go/ruby/javascript —, 6 repos: click,
 * newtonsoft-json, jekyll, guava, preact, ck-analyzer) tras el piso-4:
 * **36 de 36 falsos NINGUNO accede, en ningún eslabón, a un nombre marcado
 * privado/interno por convención** (guión bajo inicial) — builders de Guava
 * textbook (`new MapMaker().initialCapacity(...)`, `NetworkBuilder.from(...)
 * .expectedNodeCount(...)`, `Hasher...newHasher().putBytes(...)`), reflexión
 * + LINQ de C#, el protocolo de iterador, estructura de datos PROPIA con
 * optional-chaining (`problem.finding.locations[0]?.file`), y accesos a
 * puntos de entrada PÚBLICOS documentados (`@context.registers[:site]
 * .filter_cache[...]`, un `attr_reader` público de Jekyll::Site). **Los 2
 * verdaderos SÍ acceden a un nombre privado por convención**: `vnode
 * ._component.__hooks._list.forEach` y `hookState._component.__hooks
 * ._list.some` (preact) — el paquete `compat`/`hooks` cruzando hacia los
 * campos INTERNOS (`_`/`__`) de un `vnode`/`hookState` que pertenece a
 * `core`, exactamente la forma que la Ley describe: estructura que su dueño
 * marcó como no-contrato, de la que este código ahora depende igual.
 *
 * EL ARREGLO: `crossesIntoPrivateStructure` exige que AL MENOS un eslabón
 * de la cadena acceda a un nombre que empieza con `_` (`isPrivateByConvention`)
 * — nunca una lista de nombres de dominio, un solo carácter posicional,
 * misma técnica que `SELF_WORDS` ya usa en otro archivo para otro propósito.
 * `accessedNameOf` resuelve ese nombre por CAMPO genérico (`property`/
 * `attribute`/`field`/`name`/`method`, confirmado por sonda directa contra
 * las 7 gramáticas — `method` de Ruby resuelve aun con argumentos de por
 * medio, no se confunde con la lista de argumentos), nunca por posición de
 * texto. Sin este arreglo, `.getKey()`/`.asList()`/`.entrySet()` de Java (4
 * eslabones, TODOS llamada, misma forma sintáctica que el positivo de
 * preact) es indistinguible de `._list`/`.__hooks`/`._component`.
 *
 * LÍMITE DECLARADO, A PROPÓSITO: la convención del guión bajo es de
 * PYTHON/JS/TS nativamente y de adopción dispareja en el resto — Ruby marca
 * "privado" con la palabra clave `private`, no con el nombre (el falso de
 * Jekyll, `filter_cache`, es snake_case público sin guión inicial: la señal
 * no lo alcanza, y tampoco alcanzaría un violación real en Ruby que no siga
 * la convención). Es un FALSO NEGATIVO posible, no uno positivo — el mismo
 * costado que la ola pidió proteger (no bajar volumen a cero sin medir): la
 * señal reduce falsos positivos con una convención de nombres verificable,
 * no inventa una resolución de tipos que este detector (`intra-function`,
 * sin grafo) no tiene cómo pagar. Ver el resultado de la tarea para el
 * volumen medido en el corpus completo, no sólo en las 38 filas juzgadas.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *   - No distingue acceso a CAMPO (dato ajeno, la violación clásica de
 *     Demeter) de LLAMADA A MÉTODO encadenada (que puede ser una API fluida
 *     bien aplicada) — ambas formas cuentan igual. Ver "PRÓXIMA SEÑAL
 *     CANDIDATA" más abajo: esta misma simplificación es, medida, la
 *     candidata más prometedora para separar mejor las dos formas.
 *   - No resuelve si la base es `this`/`self` (Demeter permite navegar la
 *     propia estructura interna sin restricción). Resolverlo exigiría el
 *     mismo vocabulario de auto-referencia que `pattern-wrapping.ts`
 *     (`SELF_WORDS`) usa para OTRO propósito; este detector no se acopla a
 *     ese módulo y prefiere sobre-contar (documentado acá) a inventar una
 *     dependencia cruzada.
 *
 * LÍMITES DECLARADOS POR LENGUAJE — CONFIRMADO, MEDIDO (frente A5a, agosto
 * 2026, investigando el outlier "medido en sólo 2 lenguajes" que motivó esta
 * ola): la afirmación previa de este párrafo ("ninguno confirmado") estaba
 * MAL — nunca se había medido go específicamente. `BASE_FIELDS` sí resuelve
 * la cadena por igual en las 7 gramáticas (`operand` de Go incluido, ver el
 * docstring de arriba), pero el GATE de precisión (`crossesIntoPrivateStructure`,
 * más abajo) SÍ es ciego a un lenguaje entero, y no por la forma del árbol
 * sino por la CONVENCIÓN que reconoce.
 *
 *   - **GO: recall perdido MASIVO, confirmado por sonda con el gate
 *     desactivado y REVERTIDO tras medir** (nunca se shipeó el bypass). Go no
 *     marca "no exportado" con un guión bajo — lo marca con la INICIAL
 *     MINÚSCULA del identificador, una regla del LENGUAJE, no una convención
 *     de estilo (`isPrivateByConvention` no la reconoce: busca `_` inicial,
 *     que en Go no es idiomático). Medido sobre 941 archivos `.go` reales del
 *     corpus (cobra, 36 archivos, y hugo, 905 archivos):
 *       - **hugo: 138 cadenas de ≥4 eslabones existen y hoy se suprimen a 0**
 *         (2370 hallazgos con el gate desactivado vs 2232 con el gate activo,
 *         MISMO corpus, MISMO piso — la diferencia completa, 138, es
 *         `demeter-chain`). De esas 138: 68 son un CAMINO DE CAMPOS puro (sin
 *         una sola llamada en la cadena — `r.Pipe.Decl[1].Ident[0]`,
 *         `p.p.s.init.menus.Value`, `ns.deps.ResourceSpec.Imaging.Codec.
 *         DecodeConfig`) y 70 incluyen al menos una llamada (mezcla de
 *         candidatos reales — `c.rs.ExecHelper.Sec().HTTP.MediaTypes.Accept`
 *         — y APIs fluidas textbook que el piso-4 ya sabía descartar en otros
 *         lenguajes pero que en Go, sin la señal de privacidad, vuelven a
 *         colarse: `l.WithField(...).WithField(...).WithField(...)` — logging
 *         estructurado encadenado —, `wazero.NewModuleConfig().WithStderr(...)
 *         .WithStdout(...)` — builder público de una librería externa).
 *       - **cobra: 0 tanto con el gate activo como desactivado** — no hay
 *         cadenas de ≥4 eslabones en absoluto en este repo (36 archivos,
 *         mayormente definiciones de comando cortas); no es evidencia de que
 *         el gate esté mal, es evidencia de que este repo puntual no tiene la
 *         forma.
 *     **Respuesta a la pregunta del brief ("¿no dispara o dispara y nadie lo
 *     juzgó?"): NO DISPARA — y no por falta de candidatos (hugo tiene 138),
 *     sino porque el GATE de precisión usa una convención de nombres que Go
 *     no sigue.** No se implementa un arreglo esta pasada (ver "PRÓXIMA SEÑAL
 *     CANDIDATA" abajo): tratar "inicial minúscula" como señal de privacidad
 *     en Go es MUCHO más ruidoso que el guión bajo en JS/Python (la INMENSA
 *     mayoría de los identificadores Go cotidianos empiezan en minúscula —
 *     variables locales, la mayoría de los campos — así que la señal
 *     dispararía en casi cualquier cadena de 4 eslabones, no en una minoría
 *     reconocible) y, sin información de PAQUETE (que este detector
 *     `intra-function` sin grafo no tiene), no se puede saber si un
 *     identificador minúsculo es ajeno de verdad o simplemente un dato propio
 *     del mismo paquete — verificarlo bien exigiría un muestreo de precisión
 *     dedicado que esta pasada no tuvo presupuesto para hacer con el rigor
 *     que este proyecto exige. Bypass de diagnóstico armado, medido y
 *     REVERTIDO — nunca se shipeó código condicionado por un flag de
 *     depuración.
 *   - **VUE: NO es un límite confirmado, a diferencia de Go** — medido sobre
 *     vueuse (corpus completo) con el mismo bypass de diagnóstico: 604
 *     hallazgos totales IDÉNTICOS con el gate activo y desactivado — cero
 *     cadenas de ≥4 eslabones en este repo con O SIN el filtro de privacidad.
 *     A diferencia de Go, la convención de guión bajo SÍ aplica a Vue/TS (la
 *     misma gramática que ya validó 2 verdaderos reales en preact) — la
 *     ausencia acá es del ESTILO de este repo puntual (funciones composable
 *     cortas, orientadas a `.value` de una sola reactividad, no a rutas de
 *     acceso profundas), no evidencia de un defecto del detector. Sigue
 *     siendo una muestra de UN solo repo Vue en el corpus: no se puede
 *     descartar que otro repo Vue con más profundidad de objeto lo dispare.
 *   - `tsx` (bucket de lenguaje separado en `language-coverage.ts`) no se
 *     midió aparte de `typescript`/`javascript` esta pasada — misma
 *     gramática exacta (`tree-sitter-typescript.wasm`), sin motivo estructural
 *     para esperar una diferencia, pero no medido y no se afirma.
 *
 * PRÓXIMA SEÑAL CANDIDATA (investigada, NO implementada esta pasada — mismo
 * criterio de honestidad que ya usa `data-clump.ts` para "UN DESPACHADOR Y
 * SUS VARIANTES"): distinguir CAMINO DE CAMPOS puro (ningún eslabón es una
 * llamada — `isCallShaped`, mismo vocabulario que ya valida
 * `argument-mutation.ts#CALL_TOKENS`/`data-clump.ts`) de CADENA DE LLAMADAS
 * (la forma de una API fluida/builder) podría ser una señal MÁS ROBUSTA que
 * la convención de nombres, porque no depende de que el lenguaje/equipo siga
 * ninguna convención — y candidata a resolver el hueco de Go sin inventar una
 * heurística de "minúscula = privado" ruidosa: de las 138 cadenas de hugo,
 * 68 son camino-de-campos puro (candidato más limpio) contra 70 con alguna
 * llamada (mezcla real/fluida). NO implementado: exige su propio muestreo de
 * precisión (¿el camino-de-campos puro discrimina mejor QUE la convención de
 * guión bajo, o sólo distinto?) sobre varios lenguajes, con el rigor de sonda
 * que este proyecto exige — trabajo real para la próxima vez que se toque
 * este detector, no una línea.
 */
import { pisoDeclarado } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FunctionUnit, IntraFunctionDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "linkCount";

/**
 * Campos GENÉRICOS de "base de acceso" — nunca un nombre de nodo. Misma
 * técnica que `SUBJECT_FIELDS` (`repeated-switch.ts`) y `OBJECT_FIELDS`
 * (`pattern-wrapping.ts`, que sólo cubre `object`/`operand`: acá se agregan
 * `receiver` y `expression` porque este detector sí necesita cubrir Ruby y
 * C#, confirmado por sonda directa — ver el docstring del módulo).
 */
const BASE_FIELDS = ["object", "operand", "receiver", "expression"];

/**
 * Campo genérico bajo el que un nodo de INVOCACIÓN sin base propia expone su
 * callee — ver el docstring del módulo. Java/Ruby nunca lo necesitan: su
 * nodo de invocación ya resuelve una base directamente vía `BASE_FIELDS`.
 */
const CALLEE_FIELD = "function";

function baseOf(node: AstNode): AstNode | null {
  for (const field of BASE_FIELDS) {
    const child = node.childForFieldName(field);
    if (child) return child as AstNode;
  }
  return null;
}

/**
 * Atraviesa, recursivamente, un nodo de invocación SIN base propia hasta su
 * callee (`CALLEE_FIELD`). Un nodo que YA es un eslabón (`baseOf` resuelve)
 * se devuelve tal cual — nunca se desenvuelve un eslabón real.
 */
function throughCallWrapper(node: AstNode): AstNode {
  if (baseOf(node) !== null) return node;
  const callee = node.childForFieldName(CALLEE_FIELD);
  return callee ? throughCallWrapper(callee as AstNode) : node;
}

/**
 * Clave posicional estable para "ya contado" — nunca identidad de objeto:
 * dos llamadas a `childForFieldName`/`child()` sobre el mismo nodo lógico
 * pueden devolver wrappers distintos según el binding, así que sólo la
 * posición (que si viene del mismo árbol real es estable) sirve de clave.
 */
function positionKey(node: AstNode): string {
  return `${node.startPosition.row}:${node.startPosition.column}:${node.endPosition.row}:${node.endPosition.column}`;
}

/**
 * Los eslabones de la cadena que arranca en `root` (que ya es un eslabón:
 * `baseOf(root) !== null`), de afuera hacia adentro, hasta llegar a algo sin
 * base (un identificador, un literal). La LONGITUD de la lista es el número
 * de accesos encadenados — `root` mismo cuenta como el primero.
 */
function chainLinks(root: AstNode): AstNode[] {
  const links: AstNode[] = [];
  let current: AstNode | null = root;
  while (current && baseOf(current) !== null) {
    links.push(current);
    current = throughCallWrapper(baseOf(current)!);
  }
  return links;
}

/**
 * Campos GENÉRICOS bajo los que las 7 gramáticas exponen el NOMBRE accedido
 * de un eslabón — confirmado por sonda directa
 * (`scratchpad/probe-member-name-field.mjs`, JUICIO DE PRECISIÓN, ver el
 * docstring del módulo): `property` (JS/TS/Vue), `attribute` (Python),
 * `field` (Java `field_access`, Go `selector_expression`), `name` (Java
 * `method_invocation`, C# `member_access_expression`), `method` (Ruby
 * `call` — funciona AUNQUE haya argumentos de por medio, confirmado contra
 * `a.b.c(1,2,3)`: resuelve `"c"`, no se confunde con la lista de
 * argumentos).
 */
const ACCESSED_NAME_FIELDS = ["property", "attribute", "field", "name", "method"];

function accessedNameOf(link: AstNode): string | null {
  for (const field of ACCESSED_NAME_FIELDS) {
    const name = link.childForFieldName(field);
    if (name) return (name as AstNode).text;
  }
  return null;
}

/**
 * Un DUNDER de Python — `__name__`, `__table__`, `__class__`, `__init__`...
 * — guión bajo DOBLE en ambas puntas. Es el protocolo PÚBLICO de reflexión
 * del lenguaje (todo objeto/clase lo expone; frameworks como SQLAlchemy lo
 * adoptan para sus propios atributos "mágicos" públicos, `__table__`,
 * `__tablename__`) — LO OPUESTO de privado, aunque empiece con `_` igual
 * que la convención real. Confirmado por sonda directa contra el corpus
 * externo (JUICIO DE PRECISIÓN, ver el docstring del módulo): sin esta
 * exclusión, `clause.operator.__name__.rstrip('_')` (reflexión de función,
 * `sqlalchemy/orm/evaluator.py:165`) y `Customer.__table__.insert()...`
 * (API de mapeo ORM pública, `examples/performance/bulk_inserts.py:142`)
 * se marcaban falsamente "hacia estructura interna" SÓLO por el prefijo —
 * ambos casos, abiertos a mano, son API pública bien documentada, no
 * violación de Demeter. `__hooks` (el positivo real de preact,
 * `hooks/src/index.js:248`) NO es un dunder — sólo lleva el prefijo, sin el
 * sufijo — así que esta exclusión no lo toca.
 */
const PYTHON_DUNDER = /^__.+__$/;

/**
 * Convención de "privado/interno" — un guión bajo inicial, EXCLUYENDO los
 * dunders de Python (`PYTHON_DUNDER`, arriba — el caso opuesto: público por
 * protocolo). NUNCA una lista de nombres de dominio: un solo carácter
 * posicional (más la forma dunder, igual de estructural), la misma
 * convención que Python (`_foo`) y JS/TS (`_foo`/`__foo`, el prefijo doble
 * que marca "más interno todavía") ya usan de forma nativa y que el resto
 * de los lenguajes soportados reconocen por herencia de estilo aunque no la
 * impongan el compilador. Ver JUICIO DE PRECISIÓN, más abajo.
 */
function isPrivateByConvention(name: string): boolean {
  return name.startsWith("_") && !PYTHON_DUNDER.test(name);
}

/**
 * `true` cuando AL MENOS uno de los eslabones de `links` accede a un nombre
 * marcado como privado por convención — la señal que JUICIO DE PRECISIÓN
 * (ver el docstring del módulo) mide que separa una violación real de Demeter
 * de una API fluida/protocolo de iterador/estructura propia.
 */
function crossesIntoPrivateStructure(links: readonly AstNode[]): boolean {
  return links.some((link) => {
    const name = accessedNameOf(link);
    return name !== null && isPrivateByConvention(name);
  });
}

export const detector: IntraFunctionDetector<ThresholdKey, "demeter-chain"> = {
  id: "demeter-chain",
  kind: "demeter-chain",
  scope: "intra-function",
  title: "Cadena de acceso (Ley de Demeter)",
  needs: [],
  thresholds: {
    // *** PISO SUBIDO DE 3 A 4, MEDIDO ESTA TAREA *** — el piso 3 venía de
    // consenso de comunidad de estilo ("no more than one dot"), sin paper ni
    // herramienta externa (PLAN.md §7). Muestreado a mano 107 hallazgos
    // reales sobre 6 lenguajes (TypeScript propio ×2 corridas, Ruby/jekyll,
    // Python/click, JS-TS-JSX/preact, Java/guava, C#/newtonsoft-json — ver
    // `tests/golden/precision/*.verdicts.csv`): con piso 3, **0 de ~87
    // verdaderos** (0% — API fluida/Builder/pipeline de Array·LINQ/reflexión/
    // acceso a la propia estructura de datos, EN LOS SEIS LENGUAJES por
    // igual — incluido Java/guava, la biblioteca de builders fluidos por
    // excelencia: MapMaker, NetworkBuilder, Hasher, su propio framework de
    // testlib, 15/15 falsos); con piso 4, **2 de ~20 verdaderos** (~10% —
    // `compat/src/suspense.js:45` y `hooks/src/index.js:248` de preact, dos
    // casos reales de un PAQUETE cruzando hacia los campos internos
    // `_component.__hooks._list` de OTRO paquete). El piso 4 NO alcanza el
    // 50% (sigue `impreciso`, no `preciso`) y la mejora es MODESTA, no
    // transformadora — medida honestamente, no inflada — pero es real
    // (recorta ~80% del volumen sin costar un solo verdadero) y no se
    // encontró ninguna señal estructural adicional (ver el docstring del
    // módulo, sección "CONFIANZA BAJA FIJA") que separe mejor cadena-sobre-
    // el-mismo-valor de cadena-que-cruza-colaboradores sin inferencia de
    // tipos, que el analizador no tiene.
    linkCount: pisoDeclarado(4, {
      rationale:
        "Ley de Demeter: consenso de comunidad de estilo ('no more than one dot'), sin paper ni herramienta " +
        "externa que fije el número — piso subido de 3 a 4 tras muestreo manual de 107 hallazgos en 6 lenguajes " +
        "(~0/87 verdaderos con piso 3, ~2/20 con piso 4 — ver tests/golden/precision/*.verdicts.csv), el punto a " +
        "partir del cual la cadena deja de ser un acceso directo y empieza a mostrar señal (modesta, no fuerte).",
    }),
  },
  run(fn: FunctionUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("linkCount");
    const claimed = new Set<string>();
    const findings: RawFinding[] = [];

    walkTree(fn.node, (node) => {
      if (!node.isNamed) return;
      const real = node as AstNode;
      if (baseOf(real) === null) return; // no es un eslabón: nada que medir desde acá
      const key = positionKey(real);
      if (claimed.has(key)) return; // ya contado como parte de una cadena más externa

      const links = chainLinks(real);
      for (const link of links) claimed.add(positionKey(link));
      if (links.length < threshold.value) return;

      // JUICIO DE PRECISIÓN (ver el docstring del módulo): sin esta señal,
      // la cadena mide "cuántos puntos" — que una API fluida y una
      // violación real comparten EXACTAMENTE. Con ella, la pregunta pasa a
      // ser la que la Ley de Demeter realmente hace: ¿esta cadena atraviesa
      // hacia estructura AJENA (marcada privada/interna por convención en
      // AL MENOS un eslabón)? Si ningún eslabón cruza esa línea, no hay
      // evidencia de que se esté atravesando nada ajeno — no se emite.
      if (!crossesIntoPrivateStructure(links)) return;

      const startLine = real.startPosition.row + 1;
      const endLine = real.endPosition.row + 1;
      const text = real.text.replace(/\s+/g, " ").trim();
      const display = text.length > 80 ? `${text.slice(0, 77)}...` : text;

      findings.push({
        title: `Cadena de ${links.length} eslabones hacia estructura interna: "${display}"`,
        detail:
          "Esta expresión atraviesa varios objetos intermedios para llegar al dato final, y al menos uno de esos " +
          "eslabones accede a un nombre marcado como privado/interno por convención (guión bajo inicial) — quien " +
          "la escribe conoce y depende de la estructura INTERNA de un colaborador ajeno, no sólo de su interfaz " +
          "pública, así que un cambio en esa estructura interna (que su dueño puede considerar libre de romper, " +
          "precisamente porque es privada) rompe este código igual. Distinto de una API fluida/Builder " +
          "(`query.select(x).where(y)`, cada eslabón público, devolviendo `this`/una instancia nueva) o del " +
          "protocolo de iterador (`.keys().next().value`): ninguna de esas dos formas accede a un nombre marcado " +
          "privado, así que no disparan esta variante — confirmar igual a mano antes de refactorizar.",
        trigger: [{ label: "eslabones", value: links.length, threshold }],
        locations: [
          {
            file: fn.file,
            startLine,
            endLine,
            symbol: fn.name ?? undefined,
            role: "cadena de acceso hacia estructura interna ajena",
          },
        ],
        // Techo más alto que antes (65 en vez de 45): con la señal de
        // estructura privada la confianza YA NO es baja por diseño (ver el
        // docstring del módulo) — sigue sin ser una detección de certeza
        // absoluta (la convención del guión bajo se puede violar), así que
        // el techo sube pero no llega al de un hallazgo confirmado.
        severity: Math.min(65, 30 + links.length * 5),
        advice: {
          primary: {
            name: "Hide Delegate / Extract Method",
            kind: "refactorizacion",
            why:
              "Delegar el paso intermedio (o extraer la cadena a un método con nombre) evita que quien llama " +
              "tenga que conocer la estructura interna de un colaborador ajeno para llegar al dato que necesita.",
            source: "https://refactoring.guru/es/smells/message-chains",
          },
        },
      });
    });

    return findings;
  },
};
