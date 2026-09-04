/**
 * `inheritance-family` — Ola 11a, P2 (registro de pendientes "Problema 2":
 * los 12 rojos de `hypotheses/hypothesis-state-gate.test.ts`, Template
 * Method×6).
 *
 * EL HUECO QUE CIERRA — verificado corriendo `analyzeRepo` real sobre
 * `tests/fixtures/patterns/template_method/` (`scripts/measure-p2-wrapping-
 * diagnosis.mts`): la fixture canónica (Template Method YA aplicado —
 * `DataMiner.mine()` es el esqueleto, `CsvDataMiner`/`LogDataMiner` sólo
 * overridean el paso variable `extractData`) NO produce NINGÚN `Finding` —
 * 0 en las 6 variantes de lenguaje. Los 4 anclas de
 * `hypotheses/template-method.ts` (`distributed-duplication`,
 * `parallel-hierarchies`, `large-class`, `refused-bequest`) no disparan:
 * las dos primeras son `inter-file` (piso de similitud/duplicación que 3
 * clases de 1-5 líneas no alcanzan), y las dos últimas (`intra-file`,
 * agregadas en la Ola 10 precisamente para este hueco — ver el docstring de
 * `hypotheses/template-method.ts`, sección "ANCLAS ESTRUCTURALES NUEVAS")
 * exigen una clase de ~47 miembros o un override que ANULA comportamiento
 * heredado — ninguna de las dos es la forma de una jerarquía LIMPIA. El
 * propio docstring de `template-method.ts` lo declara sin cerrar: *"una
 * clase LIMPIA con ≥2 hermanas que ya comparten el esqueleto en la base...
 * nunca llegaba a ningún estado — 0 hipótesis, igual que Decorator sobre
 * ColorDecorator"*.
 *
 * LA SALIDA — declarada, no de contrabando (instrucción 3 del encargo): NO
 * hay olor que inventar (el código está BIEN, no mal). `hypotheses/
 * template-method.ts` YA sabe clasificar la familia completa por AST
 * (`findAstFamily`/`astStructuralAncestorFacts`, agregadas en la Ola 10 para
 * las anclas estructurales, pero nunca alcanzadas por una clase limpia): lo
 * único que falta es el `Finding` ancla. Mismo reparto de trabajo que
 * `homonymous-delegation.ts` (Decorator, esta misma tarea): el detector
 * confirma la FORMA cruda (¿existe una familia clase-base + subclases en
 * ESTE archivo?), la hipótesis decide el `PatternState` exacto.
 *
 * RELACIÓN, ESTRUCTURAL: una clase `B` (declarada en este archivo) es la
 * base (`extends`/`superclass`/`bases`, MISMA extracción por campo genérico
 * que `refused-bequest.ts#extractSuperclassName` — DUPLICADA acá a
 * propósito, mismo argumento ya documentado ahí y en
 * `hypotheses/template-method.ts#extractSuperclassNameTM`: tres copias
 * hoy, cada una en su capa, para no crear una dependencia cruzada por un
 * detalle que sólo a los tres archivos les importa) de MÁS DE UNA (`presencia()`,
 * R3 — ver `thresholds` más abajo) subclases DISTINTAS, TAMBIÉN declaradas en
 * este archivo. Cero vocabulario
 * de nombre de método: no importa QUÉ overridean las subclases, sólo que
 * la familia (base + hermanas resolubles en el mismo archivo) exista — la
 * misma forma que `hypotheses/template-method.ts#findAstFamily` busca para
 * decidir el excluder, así que el ancla de acá y el excluder de allá miran
 * EXACTAMENTE la misma relación.
 *
 * ANCLA EN LA BASE: el `Finding` ancla en `B` (no en una subclase) — el
 * símbolo (`locations[0].symbol`) es el nombre de la base, que
 * `findAstFamily(root, sets, anchorSymbol)` acepta tanto si `anchorSymbol`
 * es la base como si es una subclase (ver su propio código); anclar en la
 * base es la opción más estable (una sola por familia, sin importar cuántas
 * hermanas tenga).
 *
 * PRESENCIA, NO MAGNITUD (R3: `presencia()`, no `pisoDeclarado` — ver
 * `thresholds`): el piso de subclases es el mismo `MIN_DISTINCT_UNITS` (2)
 * que `hypotheses/template-method.ts` ya exige para que `findAstFamily`
 * encuentre una familia — con menos de 2 hermanas esa función igualmente
 * devuelve `null` (brecha estructural, no de este umbral) y la magnitud
 * exacta (¿el esqueleto vive en la base sin fuga? ¿hay un gancho
 * confirmado?) la decide `astStructuralAncestorFacts`, no este detector.
 *
 * LÍMITE DECLARADO — GO: sin nodos de clase (`sets.classNodes` vacío en Go,
 * que usa composición por embedding, no herencia de implementación), este
 * detector nunca encuentra una familia en Go — mismo límite, mismas
 * palabras, que `hypotheses/template-method.ts` ya declara ("BRECHA
 * DECLARADA (Go)") y que `refused-bequest.ts`/`large-class.ts` heredan de
 * la ausencia estructural de clases en ese lenguaje. La fixture canónica de
 * Template Method en Go usa una forma DISTINTA (función de orden superior
 * con el paso variable inyectado por parámetro, sin ninguna jerarquía que
 * esta ruta pueda ver) — brecha declarada, sin cerrar en esta tarea: cerrarla
 * exigiría un TERCER camino de anclaje (y de resolución, en
 * `hypotheses/template-method.ts`) para la forma "esqueleto en una función +
 * llamadas con distinto callback", que esta tarea no llegó a construir. Ver
 * el informe de esta ola.
 */
import { presencia } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FileUnit, IntraFileDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "subclasses";

/**
 * Nombre de la clase base que `classNode` declara heredar — EXTRACCIÓN
 * IDÉNTICA a `refused-bequest.ts#extractSuperclassName` (duplicada a
 * propósito, ver docstring del módulo): campo `superclass` (Ruby/Java,
 * forma de texto distinta por gramática), `superclasses` (Python, primera
 * base ante herencia múltiple), `bases` (C#, primera entrada), o el
 * fallback genérico por vocabulario de tipo de nodo ("heritage", JS/TS/Vue,
 * que no exponen ningún campo de herencia en esta gramática).
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
    const child = classNode.child(i) as AstNode | null;
    if (child && /heritage/i.test(child.type)) {
      const m = /extends\s+([A-Za-z_$][\w$.]*)/.exec(child.text);
      if (m?.[1]) return m[1];
    }
  }
  return null;
}

export const detector: IntraFileDetector<ThresholdKey, "inheritance-family"> = {
  id: "inheritance-family",
  kind: "inheritance-family",
  scope: "intra-file",
  title: "Familia de subclases con base común en el mismo archivo",
  needs: ["herencia"],
  thresholds: {
    // R3 (auditoría de umbrales inventados): el propio docstring del módulo
    // ya lo llamaba "PRESENCIA, NO MAGNITUD" — con 1 sola subclase no hay
    // 'hermanas' que comparar, y `findAstFamily` devolvería `null` igual; no
    // hay número que calibrar. Antes `pisoDeclarado(2, …)`.
    subclasses: presencia({
      rationale:
        "mismo MIN_DISTINCT_UNITS (2) que hypotheses/template-method.ts#findAstFamily ya exige para reconocer una familia: con 1 sola subclase no hay 'hermanas' que comparar, y esa función devolvería null igual — el piso lo fija la forma que el excluder busca, no una elección nueva de este detector.",
    }),
  },
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("subclasses");

    const classNodeByName = new Map<string, AstNode>();
    walkTree(file.root, (node) => {
      if (!node.isNamed || !file.sets.classNodes.has(node.type)) return;
      const real = node as AstNode;
      const name = (real.childForFieldName("name") as AstNode | null)?.text;
      if (name) classNodeByName.set(name, real);
    });

    const subclassesByBase = new Map<string, string[]>();
    for (const [name, node] of classNodeByName) {
      const superclassName = extractSuperclassName(node);
      if (!superclassName || superclassName === name || !classNodeByName.has(superclassName)) continue;
      const list = subclassesByBase.get(superclassName) ?? [];
      list.push(name);
      subclassesByBase.set(superclassName, list);
    }

    const findings: RawFinding[] = [];
    for (const [baseName, subclasses] of subclassesByBase) {
      // `threshold.value` es 1 (`presencia()`, R3): `> 1` es exactamente `>= 2`.
      if (subclasses.length <= threshold.value) continue;
      const baseNode = classNodeByName.get(baseName)!;
      const startLine = baseNode.startPosition.row + 1;
      const endLine = baseNode.endPosition.row + 1;
      const sorted = [...subclasses].sort();

      findings.push({
        title: `"${baseName}" es la base común de ${sorted.length} subclases en este archivo`,
        detail:
          `"${sorted.join(", ")}" declaran heredar de "${baseName}", TODAS resolubles en este mismo archivo — una familia de clases ` +
          "emparentadas es la forma estructural que un esqueleto compartido (Template Method) o una jerarquía paralela necesitan para " +
          "existir. Esto no es un problema: es la evidencia cruda que permite clasificar si el esqueleto ya vive en la base, se " +
          "duplica entre hermanas, o directamente no existe todavía — esa clasificación exacta la hace la hipótesis correspondiente, " +
          "no este detector.",
        trigger: [{ label: "subclases distintas con esta base", value: sorted.length, threshold }],
        locations: [
          {
            file: file.path,
            startLine,
            endLine,
            symbol: baseName,
            role: `base común de ${sorted.length} subclases: ${sorted.join(", ")}`,
          },
        ],
        severity: 15,
        advice: {
          primary: {
            name: "Confirm shared base is Template-Method-shaped",
            kind: "patron_de_diseno",
            why:
              "Una base con varias subclases en el mismo archivo es, estructuralmente, la mitad de un Template Method ya aplicado, " +
              "parcial o ausente — confirmar si el esqueleto de pasos ya vive en la base o si cada hermana lo repite.",
            source: "https://refactoring.guru/design-patterns/template-method",
          },
        },
      });
    }

    return findings;
  },
};
