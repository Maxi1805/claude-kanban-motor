/**
 * F4 — arma la `FileUnit`/`FunctionUnit` VIVAS que el registro de detectores
 * (`detect/run.ts`) necesita para correr los scopes `intra-function`/
 * `intra-file` — CONTRATO-F4.md §1.5.
 *
 * `walkFile` (`code-analyzer.ts`) ya visita cada nodo función y arma su
 * `FunctionInfo` en UN solo recorrido; su parámetro de salida opcional
 * `functionNodes` empuja el `AstNode` de esa misma función, en el MISMO
 * índice — así que `nodes[i]` es siempre el nodo que produjo `functions[i]`.
 * Construir la `FileUnit` acá no repite ningún walk: sólo empareja los dos
 * arreglos que `analyzeFile` ya tiene.
 */
import type { AstNode, FileUnit, FunctionUnit } from "../detect/types.js";
import type { FunctionInfo, LanguageSpec } from "../code-analyzer.js";

/**
 * Arma la unidad de archivo viva que corresponde a UN `FileFacts` en
 * construcción. `functions[i]`/`nodes[i]` deben venir del MISMO índice
 * (garantizado por cómo `walkFile` los empuja).
 */
export function buildFileUnit(
  root: AstNode,
  spec: LanguageSpec,
  path: string,
  lines: number,
  functions: readonly FunctionInfo[],
  nodes: readonly AstNode[],
): FileUnit {
  const units: FunctionUnit[] = functions.map((fn, i) => {
    const node = nodes[i];
    if (!node) {
      // No debería pasar nunca (walkFile los empuja en el mismo índice) —
      // si pasa, es un bug de cableado, no un archivo raro: mejor un error
      // claro acá (lo atrapa el try/catch de `analyzeFile`) que una
      // `FunctionUnit.node` mentirosa apuntando al nodo de otra función.
      throw new Error(`facts/units: falta el AstNode de la función #${i} ("${fn.name}") en "${path}"`);
    }

    // `FunctionUnit.name` es `string | null` REAL — nunca el centinela
    // "(anónima)" que `FunctionInfo.name` sí lleva (walkFile lo usa para el
    // texto de los cinco hallazgos legado) — CONTRATO-F4.md §1.5. Leído del
    // nodo crudo, no de `fn.name`. `childForFieldName` devuelve `ProbeNode`
    // (la firma heredada de `AstNode extends ProbeNode`, ver `detect/types.ts`);
    // el cast a `AstNode` es el mismo patrón que usa todo detector que
    // necesita `.text` de un hijo (ver `detect/intra-function/empty-catch.ts`).
    const name = (node.childForFieldName("name") as AstNode | null)?.text ?? null;

    // `FunctionMetrics` es `FunctionInfo` menos `name`/`file`/`startLine`/
    // `endLine` — se pasa el MISMO objeto vía destructuring en vez de
    // copiarlo campo por campo, así que un campo nuevo en `FunctionInfo`
    // viaja acá solo, sin que nadie tenga que acordarse de sumarlo.
    const { name: _sentinelName, file: _file, startLine: _startLine, endLine: _endLine, ...metrics } = fn;

    return {
      file: path,
      language: spec.id,
      name,
      startLine: fn.startLine,
      endLine: fn.endLine,
      // Mismo formato que `serializeAnchor` (`detect/ids.ts`) y
      // `symbolNodeId` (`graph/types.ts`): un hallazgo y un nodo del grafo
      // anclan al mismo lugar sin traductor.
      symbolPath: [fn.className, name].filter((part): part is string => Boolean(part)),
      node,
      sets: spec,
      metrics,
    };
  });

  return {
    path,
    language: spec.id,
    lines,
    root,
    sets: spec,
    functions: units,
  };
}
