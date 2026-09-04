/**
 * `refused-bequest` — herencia anulada (PLAN.md §4.1 "Refused Bequest |
 * archivo | gramática + herencia").
 *
 * RELACIÓN: una subclase declara heredar de una clase base, esa clase base
 * está DEFINIDA EN EL MISMO ARCHIVO, y la subclase sobreescribe un método
 * heredado — mismo nombre, misma clase contenedora inmediata — cuyo cuerpo en
 * la BASE tiene contenido real, con un cuerpo VACÍO en la subclase. La
 * subclase no usa lo que hereda: lo anula en silencio.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: "hereda de" se lee por CAMPO genérico
 * (`superclass`/`superclasses`/`bases`, la misma técnica de extracción por
 * campo que ya usa `pattern-structural.ts#extractSuperclass` — repetida acá a
 * propósito, ver la nota de `extractSuperclassName` más abajo, NUNCA
 * importada, para no crear una dependencia de `detect/` hacia la capa de
 * análisis legado por un detalle que sólo a este detector le importa, mismo
 * criterio que ya documentan `capabilities.ts` sobre `TERNARY_NAME` y
 * `repeated-switch.ts` sobre `SUBJECT_FIELDS`). "Sobreescribe" se lee
 * comparando el NOMBRE del método (dato, no vocabulario) entre los miembros
 * de la subclase y los de la base — ambos ya agrupados por
 * `FunctionMetrics.className`, el mismo campo que `large-class.ts` usa. "Vacío"
 * se lee contando hijos NOMBRADOS del campo `body` — la misma técnica
 * estructural que `empty-catch.ts#isEmptyHandler`, incluida su excepción de
 * Ruby (el campo `body` no resuelve en absoluto cuando el método está vacío;
 * confirmado por sonda directa, igual que Ruby's `rescue`).
 *
 * SIMPLIFICACIONES DECLARADAS: Fowler describe Refused Bequest como "la
 * subclase usa sólo una parte pequeña de lo que hereda", una noción amplia
 * que incluye tanto "sobreescribe un método real para no hacer nada" como
 * "nunca llama/usa la mayoría de los miembros heredados". Esta ola mide
 * ÚNICAMENTE la primera forma — el override que anula comportamiento real —
 * porque es la única medible sin resolución de llamadas/dataflow (fuera de
 * alcance intra-file); la segunda forma ("apenas usa la interfaz que
 * hereda") necesitaría rastrear referencias dentro de los propios métodos de
 * la subclase, que es análisis de uso, no de forma, y queda fuera de esta
 * ola. Se declara así para no sobre-vender la cobertura.
 *
 * LÍMITE DECLARADO — CROSS-FILE: si la clase base está en OTRO archivo, este
 * detector NO la ve (`FileUnit` es la única entrada; no re-lee disco ni
 * re-parsea, regla general de `detect/`) y por lo tanto no emite nada para
 * esa subclase — ni siquiera "no aplicable": simplemente no hay par
 * base/subclase que comparar en esta unidad. Resolver la base a través de
 * archivos es exactamente el caso que el grafo de F5 (`CodeGraph`,
 * `graph/types.ts`) existe para resolver; esta ola no lo tiene y no lo
 * simula. Ver el test "brecha declarada — clase base en otro archivo".
 *
 * RENDIMIENTO EMPÍRICO DECLARADO, MEDIDO DE NUEVO EN LA OLA Z (frente Z5) —
 * instrumentación por compuerta sobre los 13 repos del corpus de medición:
 * de 12.531 clases, 5.127 declaran una base, 913 la tienen DEFINIDA EN ESTE
 * ARCHIVO, y 340 llegan a "override de un método con contenido real en la
 * base" — el candidato completo. **0 de esos 340 son un override VACÍO.**
 * No es un techo por umbral (`presencia()`, ya es el único valor posible) ni
 * un bug de cableado: cuantos más candidatos reales se junten, la forma
 * angosta que Fowler describe ("anula, no delega, no usa") sigue sin
 * aparecer en ESTE corpus de 13 repos. **Pero SÍ aparece en código de
 * aplicación real**: `corpus-app/jenkins` (Java, fuera del corpus de
 * medición) tiene 93 candidatos de la misma forma y **1 nullified real**
 * (`hudson.model.Cause$DeeplyNestedUpstreamCause#onLoad`, que vacía el
 * `onLoad(Job, int)` con cuerpo real de `Cause` — ver el informe de la
 * tarea, juzgado a mano). La conclusión no es "el olor no existe": es que
 * es RARO incluso donde existe, y los 13 repos de bibliotecas/herramientas
 * de este corpus dieron, por composición, cero instancias — no hay nada
 * que aflojar acá, el detector funciona sobre población real cuando la hay.
 *
 * LÍMITE DECLARADO — PYTHON: un override "vacío" en Python casi nunca es
 * literalmente vacío — la sintaxis obliga a escribir `pass`, que es un
 * `pass_statement` NOMBRADO dentro de `body` (confirmado por sonda directa:
 * `def speak(self): pass` resuelve `body` con exactamente un hijo nombrado).
 * Tratar "vacío" como "cero hijos nombrados" — la misma regla que se aplica
 * IDÉNTICAMENTE a todos los lenguajes — dejaría a Python's `pass`-only
 * override sin detectar bajo esta definición. Reconocer `pass_statement` por
 * NOMBRE sería exactamente la lista de nombres de nodo por lenguaje que la
 * regla 4 prohíbe, así que Python queda, a propósito, SIN detección del caso
 * "override reducido a `pass`" — un límite escrito, no una adivinanza. Python
 * SÍ tiene la capacidad `herencia` (su probe de producción declara
 * `class Shape(Base):`) y el detector SÍ corre sobre Python — sólo esta forma
 * específica de vacío queda fuera. Ver el test que lo documenta.
 *
 * LÍMITE DECLARADO — CONSTRUCTORES EXCLUIDOS A PROPÓSITO: un constructor no
 * participa de esta comparación (`FunctionMetrics.isConstructor`, ya
 * calculado por el walker — no algo que este detector re-derive). Dos
 * razones: (1) un constructor no es despacho polimórfico en el sentido en
 * que Refused Bequest lo entiende — no hay "override" real, cada clase tiene
 * el suyo; (2) en JS/TS/Vue el constructor de AMBAS clases se llama
 * literalmente `"constructor"` (keyword-literal de la gramática, no una
 * convención de estilo — ver `CONSTRUCTOR_NAMES` en `code-grammar.ts`), así
 * que sin esta exclusión un constructor vacío en la subclase (con frecuencia
 * legítimo: no necesita inicialización propia) empataría por nombre contra
 * el constructor con cuerpo real de la base y se leería como "anulado" sin
 * serlo.
 *
 * FALSOS POSITIVOS CONOCIDOS (documentados, no resueltos):
 *   - Null Object / Special Case (patrón LEGÍTIMO): una subclase deliberada
 *     como `NullLogger extends Logger` que vacía TODOS sus métodos a
 *     propósito es, estructuralmente, indistinguible de un Refused Bequest —
 *     la diferencia es de INTENCIÓN, no de forma. Este detector no la
 *     descarta.
 *   - Dobles de test (mocks/stubs) que heredan de una clase real y vacían
 *     métodos concretos para aislar comportamiento en un test: misma forma
 *     estructural, intención legítima.
 *   - Un override que SÍ delega (`return super.metodo();` o similar) no
 *     dispara — tiene contenido real en su `body` — así que no es un falso
 *     positivo de este detector, pero es la forma "bien aplicada" con la que
 *     el hallazgo se confunde si alguien lo lee por encima: "sobreescribe
 *     con vacío" y "sobreescribe delegando" son estructuralmente distintos
 *     acá, a propósito.
 *   - Un hook de Template Method (la base declara el método vacío A
 *     PROPÓSITO, para que subclases lo llenen) no dispara: se exige que la
 *     BASE tenga contenido real (`hasRealFunctionBody`); anular un hook que
 *     ya estaba vacío no descarta nada.
 */
import type { ProbeNode } from "../../code-grammar.js";
import { presencia } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FileUnit, FunctionUnit, IntraFileDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "nullifiedOverrides";

/** Todo hijo NOMBRADO de `node` — misma técnica que `empty-catch.ts#namedChildCount`. */
function namedChildCount(node: ProbeNode): number {
  let count = 0;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.isNamed) count++;
  }
  return count;
}

/**
 * `true` cuando el método no tiene NINGÚN contenido real. Misma forma que
 * `empty-catch.ts#isEmptyHandler`: el campo `body` resuelve y no tiene hijos
 * nombrados (JS/TS/Vue/Java/C#/Python/Go), o el campo NO resuelve en
 * absoluto.
 *
 * OLA Z (Z5) — CORREGIDO: el `return language === "ruby"` original trataba
 * "el campo `body` no resuelve" como vacío SÓLO en Ruby, y como "tiene
 * contenido real" (`false`) en cualquier otro lenguaje. Eso es exactamente
 * al revés para un método SIN cuerpo por diseño — `abstract void m();` en
 * Java/C#, una firma de interfaz — donde no hay NADA que anular. Medido
 * contra `corpus-app/jenkins` (Java real, no el corpus de 13 repos): 1 de
 * los 2 hallazgos vivos ANTES de este arreglo era exactamente este caso
 * (`FileSystemProvisioner`/`Default` anula `prepareWorkspace`/
 * `discardWorkspace`, declarados `abstract` en la base — CERO cuerpo que
 * "anular"; falso, retirado por este arreglo). El otro (`Cause`/
 * `DeeplyNestedUpstreamCause#onLoad`) tiene una base con cuerpo real y
 * sigue vivo — ver el informe de la tarea, juzgado a mano. Confirmado por
 * sonda directa contra la gramática C# (`method_declaration
 * [body=arrow_expression_clause]`) que un método CON contenido pero sin
 * bloque — expression-bodied, `void M() => Foo();` — SÍ expone campo
 * `body`, con un hijo nombrado real: ese caso sigue entrando por la rama
 * `if (body)` de arriba, sin tocar esta rama. La única forma que golpea
 * "`body` no resuelve en absoluto" en las gramáticas de este corpus es una
 * declaración SIN implementación (Ruby `def m\nend`, Java/C#
 * `abstract`/interfaz) — `true` universal, no por nombre de lenguaje.
 */
function isEmptyFunctionBody(node: ProbeNode): boolean {
  const body = node.childForFieldName("body");
  if (body) return namedChildCount(body) === 0;
  return true;
}

/** Lo opuesto de `isEmptyFunctionBody`: la base tiene comportamiento real que la subclase podría estar descartando. */
function hasRealFunctionBody(node: ProbeNode): boolean {
  return !isEmptyFunctionBody(node);
}

/**
 * Clave de emparejamiento de un override: NOMBRE **más ARIDAD**.
 *
 * OLA AX (AX3) — DEFECTO MEDIDO, la razón de que esta función exista. Hasta
 * esta ola el emparejamiento era por NOMBRE PELADO (`baseByName.set(bm.name,
 * bm)`), y eso tiene dos consecuencias, las dos medidas abriendo el archivo
 * sobre los 21 repos:
 *
 *   1. **Empareja métodos que NO son un override.** `hudson.model.AbstractBuild`
 *      declara `abstract void run()` (0 parámetros) y lo único que su base
 *      `Run` declara con ese nombre es `protected final void run(Runner job)`
 *      (1 parámetro): son métodos DISTINTOS y el detector los leía como
 *      "la subclase anuló lo que la base ofrecía". Lo mismo con
 *      `SimpleParameterDefinition.createValue(String)` contra las tres
 *      sobrecargas `createValue(StaplerRequest…)` de `ParameterDefinition`, y
 *      con `SidACL.hasPermission(Sid, Permission)` contra
 *      `ACL.hasPermission(Permission)`. **3 de los 18 sujetos que la sonda
 *      `scripts/ax3-rb-sonda.mts` encuentra en los 21 repos (17 %) son este
 *      defecto y nada más**, y en Java/C#, donde la sobrecarga es idiomática,
 *      es la causa DOMINANTE del falso.
 *   2. **Contra QUÉ se compara dependía del ORDEN DE ESCRITURA.** El `Map` se
 *      sobrescribe, así que de varias sobrecargas homónimas ganaba la ÚLTIMA
 *      declarada en el archivo. Mover un método de lugar cambiaba el veredicto.
 *
 * La aridad se lee de `FunctionMetrics.parameters`, que el walker YA calcula
 * para todos los lenguajes — no es un dato nuevo ni una re-derivación, y no
 * introduce vocabulario de ningún lenguaje (regla 4 / trampa 2 de la ola: nada
 * de hardcodeos por lenguaje). **Anda en los seis**: la aridad es un entero,
 * no una forma sintáctica.
 *
 * LO QUE ESTA CLAVE NO RESUELVE, DECLARADO: dos sobrecargas con la MISMA
 * cantidad de parámetros y tipos distintos (`f(int)` / `f(String)`) siguen
 * colisionando. Medido: `SimpleParameterDefinition.createValue(String)` (1) y
 * `ParameterDefinition.createValue(StaplerRequest2)` (1) SIGUEN emparejando
 * mal, igual que `SidACL.hasPermission(Sid, Permission)` (2) contra
 * `ACL.hasPermission(Authentication, Permission)` (2). Distinguirlas necesita
 * resolución de tipos, que es exactamente lo que `detect/` no tiene. Es una
 * mejora estricta sobre el nombre pelado, no una solución completa.
 *
 * LO QUE ESTA CLAVE CUESTA, TAMBIÉN DECLARADO Y TAMBIÉN MEDIDO: un override
 * legítimo cuya base usa parámetros REST u OPCIONALES deja de emparejar,
 * porque las aridades escritas difieren aunque las firmas sean compatibles.
 * El caso real: `nest`, `TestingLogger.log(message: string)` (1) contra
 * `ConsoleLogger.log(message: any, ...optionalParams: any[])` (2) — es un
 * override de verdad y esta clave lo pierde. **Se acepta a sabiendas**: ese
 * sujeto está juzgado FALSO (es un Null Object declarado, ver el informe AX3),
 * así que el cambio no retira ni un verdadero de la población medida —
 * 0 verdaderos antes (0/18) y 0 después (0/16). Reconocer un parámetro rest
 * pediría nombres de nodo por lenguaje, que la regla 4 prohíbe.
 *
 * POR QUÉ SE HIZO IGUAL, SIN GANANCIA DE PRECISIÓN MEDIBLE: con 0 verdaderos
 * en toda la población, NINGUNA regla se puede mostrar mejor por precisión —
 * decirlo al revés sería inventar una diferencia. Lo que decide es el punto 2
 * de arriba: que el veredicto dependiera del orden de escritura del archivo no
 * se sostiene en ninguna lectura.
 *
 * SE MIDIÓ QUE NO APAGA NADA: el único hallazgo vivo del detector en los 21
 * repos (`Cause`/`DeeplyNestedUpstreamCause#onLoad`, jenkins) tiene la MISMA
 * aridad de los dos lados (`onLoad(Job<?,?>, int)`, 2 parámetros) y sigue
 * emitiéndose — ver el informe AX3.
 */
function overrideKey(fn: FunctionUnit): string {
  return `${fn.name ?? ""}/${fn.metrics.parameters}`;
}

/**
 * Nombre de la clase base que `classNode` declara heredar, o `null` si no
 * declara ninguna. Extracción por CAMPO genérico — misma técnica que
 * `pattern-structural.ts#extractSuperclass`, reescrita acá a propósito (ver
 * el docstring del módulo) para no crear una dependencia de `detect/` hacia
 * la capa de análisis legado.
 *
 * Formas confirmadas por sonda directa contra las seis gramáticas con
 * `herencia` real: Ruby (`superclass` → texto `"< Animal"`), Java (`superclass`
 * → texto `"extends Animal"` — MISMO nombre de campo, forma de texto
 * distinta), Python (`superclasses` → `argument_list` con texto `"(Animal)"`,
 * primera base ante herencia múltiple), C# (`bases` → `base_list` con texto
 * `": Animal, IFoo"`, primera entrada). JS/TS/Vue no exponen NINGÚN campo de
 * herencia en esta gramática (`class_heritage` es un hijo posicional, no un
 * campo — confirmado por sonda directa) — el fallback genérico de abajo
 * cubre esa forma buscando, entre los hijos SIN campo, uno cuyo TIPO matchee
 * el vocabulario genérico "heritage" (mismo vocabulario que
 * `capabilities.ts#INTERFACE_WORD`/`MODULE_WORD` usan para sus propias
 * capacidades) y extrayendo el primer identificador de un patrón
 * `extends X` genérico sobre su texto.
 */
function extractSuperclassName(classNode: AstNode): string | null {
  const direct = (classNode.childForFieldName("superclass") as AstNode | null)?.text;
  if (direct) {
    const cleaned = direct
      .replace(/^[<:]\s*/, "")
      .replace(/^extends\s+/, "")
      .trim();
    return cleaned || null;
  }

  const plural = (classNode.childForFieldName("superclasses") as AstNode | null)?.text;
  if (plural) {
    const inner = /\(([^)]+)\)/.exec(plural)?.[1] ?? plural;
    const first = inner.split(",")[0]?.trim();
    return first || null;
  }

  const bases = (classNode.childForFieldName("bases") as AstNode | null)?.text;
  if (bases) {
    const first = bases
      .replace(/^:\s*/, "")
      .split(",")[0]
      ?.trim();
    return first || null;
  }

  for (let i = 0; i < classNode.childCount; i++) {
    const child = classNode.child(i);
    if (child && /heritage/i.test(child.type)) {
      const m = /extends\s+([A-Za-z_$][\w$.]*)/.exec((child as AstNode).text);
      if (m?.[1]) return m[1];
    }
  }
  return null;
}

export const detector: IntraFileDetector<ThresholdKey, "refused-bequest"> = {
  id: "refused-bequest",
  kind: "refused-bequest",
  scope: "intra-file",
  title: "Herencia anulada",
  needs: ["herencia"],
  thresholds: {
    // Presencia, no magnitud (mismo caso especial que `empty-catch.ts`): un
    // solo método heredado que la subclase vacía en vez de usar ya descarta
    // comportamiento real que quien llama a través del tipo base espera
    // encontrar — no hay una cantidad previa "razonable" que umbralizar.
    nullifiedOverrides: presencia({
      rationale:
        "un único método heredado con contenido real, anulado en la subclase, ya es el hallazgo completo: es presencia/ausencia de comportamiento descartado, no una magnitud — mismo criterio que empty-catch.ts.",
    }),
  },
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("nullifiedOverrides");

    // Paso 1: clases del archivo, por nombre. Sólo se compara contra una
    // base DEFINIDA EN ESTE ARCHIVO — ver el límite declarado del docstring.
    //
    // OLA Z (Z5) — AMBIGÜEDAD DE NOMBRE, no colapsada: dos declaraciones de
    // clase DISTINTAS pueden compartir el mismo nombre SIMPLE en un mismo
    // archivo — el caso medido es C# genérico, `class Foo<T> : Foo` (el
    // campo `name` no lleva la lista de parámetros de tipo, así que la base
    // no-genérica y la derivada genérica quedan con el MISMO texto de
    // `name`). Medido en newtonsoft-json: `JsonConverter<T> : JsonConverter`
    // colapsaba las DOS declaraciones a una sola entrada — `methodsByClass`
    // (Paso 2) terminaba comparando el método ABSTRACTO de la base contra su
    // propia implementación REAL en la derivada, y el resultado leía
    // exactamente al revés ("la subclase anula lo que la base ofrece" cuando
    // en realidad la subclase ES la que aporta el cuerpo real). No se puede
    // decidir CUÁL de las dos declaraciones es "la" clase de ese nombre sin
    // resolución de tipos — así que ninguna de las dos entra en juego: un
    // nombre visto en MÁS DE UNA declaración de clase en este archivo queda
    // fuera, tanto de lado base como de lado subclase (regla de esta ola:
    // "lo ambiguo viaja como ambiguo", nunca colapsado a un candidato).
    const classNodeByName = new Map<string, AstNode>();
    const ambiguousClassNames = new Set<string>();
    walkTree(file.root, (node) => {
      if (!node.isNamed || !file.sets.classNodes.has(node.type)) return;
      const real = node as AstNode;
      const name = (real.childForFieldName("name") as AstNode | null)?.text;
      if (!name) return;
      if (classNodeByName.has(name)) ambiguousClassNames.add(name);
      classNodeByName.set(name, real);
    });
    for (const name of ambiguousClassNames) classNodeByName.delete(name);

    // Paso 2: métodos agrupados por clase contenedora inmediata — mismo
    // campo (`FunctionMetrics.className`) que `large-class.ts` ya usa, sin
    // volver a derivarlo.
    const methodsByClass = new Map<string, FunctionUnit[]>();
    for (const fn of file.functions) {
      const className = fn.metrics.className;
      if (className === null) continue;
      const list = methodsByClass.get(className) ?? [];
      list.push(fn);
      methodsByClass.set(className, list);
    }

    const findings: RawFinding[] = [];

    for (const [className, classNode] of classNodeByName) {
      const superclassName = extractSuperclassName(classNode);
      if (!superclassName) continue; // esta clase no declara herencia

      const baseNode = classNodeByName.get(superclassName);
      if (!baseNode) continue; // la base no está en ESTE archivo — brecha declarada, no un hallazgo

      const baseMethods = methodsByClass.get(superclassName) ?? [];
      const baseByName = new Map<string, FunctionUnit>();
      for (const bm of baseMethods) {
        if (bm.name && !bm.metrics.isConstructor) baseByName.set(overrideKey(bm), bm);
      }
      if (baseByName.size === 0) continue;

      const subMethods = methodsByClass.get(className) ?? [];
      const nullified: { sub: FunctionUnit; base: FunctionUnit }[] = [];
      for (const sm of subMethods) {
        if (!sm.name || sm.metrics.isConstructor) continue;
        const bm = baseByName.get(overrideKey(sm));
        if (!bm) continue; // no es un override: no existe en la base con esa aridad
        if (!hasRealFunctionBody(bm.node)) continue; // la base no daba nada real que anular
        if (!isEmptyFunctionBody(sm.node)) continue; // la subclase conserva o agrega comportamiento
        nullified.push({ sub: sm, base: bm });
      }

      if (nullified.length < threshold.value) continue;

      const classStart = classNode.startPosition.row + 1;
      const classEnd = classNode.endPosition.row + 1;
      const methodNames = nullified.map((n) => n.sub.name).join(", ");

      const [firstNullified, ...restNullified] = nullified;
      if (!firstNullified) continue; // inalcanzable: nullified.length >= threshold.value >= 1

      findings.push({
        title: `"${className}" anula ${nullified.length} método(s) heredado(s) de "${superclassName}"`,
        detail:
          `"${className}" declara heredar de "${superclassName}" pero vacía el/los método(s) ${methodNames} en vez de usarlos o extenderlos: ` +
          "quien llama a través del tipo base espera ese comportamiento y en la subclase desaparece en silencio. " +
          "Es evidencia de que la relación de herencia declarada no es genuina — la subclase toma sólo una parte de lo que la base ofrece.",
        trigger: [{ label: "métodos heredados anulados", value: nullified.length, threshold }],
        locations: [
          {
            file: file.path,
            startLine: classStart,
            endLine: classEnd,
            symbol: className,
            role: "subclase que anula comportamiento heredado real",
          },
          ...[firstNullified, ...restNullified].map((n) => ({
            file: file.path,
            startLine: n.sub.startLine,
            endLine: n.sub.endLine,
            symbol: n.sub.name ?? undefined,
            role: `anula el método heredado "${n.sub.name}" con un cuerpo vacío`,
          })),
        ],
        severity: Math.min(100, 45 + nullified.length * 15),
        advice: {
          primary: {
            name: "Replace Inheritance with Delegation",
            kind: "refactorizacion",
            why: "Una subclase que anula el comportamiento real de su base en vez de usarlo no está especializando: reemplazar la herencia por composición/delegación hace explícito qué parte de la interfaz de la base la subclase realmente necesita.",
            source: "https://refactoring.guru/es/smells/refused-bequest",
          },
        },
      });
    }

    return findings;
  },
};
