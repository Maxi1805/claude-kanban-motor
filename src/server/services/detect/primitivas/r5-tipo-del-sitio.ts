/**
 * EL PUENTE ENTRE UN DETECTOR `intra-*` Y `declares-type` — Ola R, frente R5.
 *
 * `graph/edges/declara-tipo.ts` contesta *de dónde viene un valor* a partir
 * del **id del nodo `carrier`** (`declaredTypeOf`) o del **sitio**
 * (`declaredTypeOfDeclaration(index, file, containerPath, name)`). Un detector
 * `intra-*` tiene lo segundo… casi: lo que tiene es un `FunctionUnit`, y
 * `FunctionUnit.symbolPath` es `[className, name]` — **dos segmentos**,
 * derivados de `FunctionInfo.className` (`facts/units.ts`), que es la clase
 * SINTÁCTICA inmediata y nada más.
 *
 * El `containerPath` del grafo, en cambio, es el camino COMPLETO que
 * `graph/symbols.ts` produce, namespace incluido. Medido sobre
 * newtonsoft-json real (`scratchpad/r5/probe-carriers.mts`): el parámetro
 * `val` de `ConvertUtils.IEEE754.PackDouble` vive en
 * `carrier:…ConvertUtils.cs#Newtonsoft.Json.Utilities.ConvertUtils.IEEE754.PackDouble.val@0`,
 * mientras que su `FunctionUnit.symbolPath` es `["IEEE754", "PackDouble"]`.
 * Llamar a `declaredTypeOfDeclaration` con ese `symbolPath` construye un id
 * que NO EXISTE y devuelve `"no-fact"` para todo — un "no pude mirar" falso,
 * que es exactamente lo que la regla 2 de la ola prohíbe fabricar.
 *
 * LO QUE HACE ESTE MÓDULO, y es lo único que hace: buscar el nodo `carrier`
 * del MISMO archivo cuyo `symbolPath` **termina** con el sufijo pedido, y
 * delegar en `declaredTypeOf`. No reimplementa ni una línea de la respuesta:
 * los seis `outcome` salen de `declara-tipo.ts` tal cual.
 *
 * DOS REGLAS QUE NO SE NEGOCIAN, las dos de la Ola R:
 *
 *   1. **UN sufijo que empareja con DOS carriers ⇒ `"no-fact"`.** Dos
 *      declaraciones homónimas en dos contenedores distintos del mismo
 *      archivo (`A.run(x)` y `B.run(x)`, con `symbolPath` local
 *      `["run", "x"]` para las dos) no son "una de estas dos": son "no sé
 *      cuál miré". Elegir la primera sería atribuirle a un sitio el tipo de
 *      otro. Es la misma limitación que `CONTRATO-DECLARA-TIPO.md` §6.6 ya
 *      declara para los hermanos homónimos, un nivel más arriba.
 *   2. **Ningún carrier que empareje ⇒ `"no-fact"`**, nunca `"unresolved"`.
 *      "No hay sitio de declaración con tipo escrito acá" es *no pude mirar*;
 *      `"unresolved"` es *miré, hay un nombre escrito y no es del repo*.
 *
 * PROHIBIDO INFERIR POR CONJUNTO DE MIEMBROS (regla 3): este módulo no mira
 * NI UN miembro. Empareja por camino de declaración y nada más.
 *
 * Prefijo `r5-` por la regla de archivos nuevos de la ola (siete frentes
 * editan el mismo árbol y dos no pueden crear el mismo archivo) — mismo
 * criterio que `u1-grafo-en-contexto.ts`/`n10-no-es-producto.ts`.
 */
import { declaredTypeOf, type DeclaredTypeAnswer } from "../../graph/edges/declara-tipo.js";
import type { CodeGraph, CodeGraphNode, GraphIndex } from "../../graph/types.js";

const NO_FACT: DeclaredTypeAnswer = { outcome: "no-fact" };

/**
 * Los nodos `carrier` de cada archivo, memoizados POR GRAFO. El runner
 * construye UN grafo por corrida y se lo pasa a todos los archivos, así que
 * este recorrido O(N) se paga una vez por repo y no una vez por función —
 * mismo mecanismo, y por el mismo motivo, que
 * `feature-envy-intra.ts#DECLARED_MEMBERS_BY_UNIT`.
 */
const CARRIERS_BY_FILE = new WeakMap<CodeGraph, ReadonlyMap<string, readonly CodeGraphNode[]>>();

function carriersByFile(graph: CodeGraph): ReadonlyMap<string, readonly CodeGraphNode[]> {
  const cached = CARRIERS_BY_FILE.get(graph);
  if (cached) return cached;
  const index = new Map<string, CodeGraphNode[]>();
  for (const node of graph.nodes) {
    if (node.kind !== "carrier") continue;
    if (node.declaredTypeForm === undefined) continue; // sin forma escrita no hay hecho que consultar (ver `declaredTypeOf`).
    const list = index.get(node.file);
    if (list) list.push(node);
    else index.set(node.file, [node]);
  }
  CARRIERS_BY_FILE.set(graph, index);
  return index;
}

function endsWith(path: readonly string[], suffix: readonly string[]): boolean {
  if (suffix.length > path.length) return false;
  for (let i = 0; i < suffix.length; i++) {
    if (path[path.length - suffix.length + i] !== suffix[i]) return false;
  }
  return true;
}

/**
 * Qué tipo sostiene el sitio de declaración `name` dentro del contenedor
 * `containerSuffix` del archivo `file`. `containerSuffix` es el sufijo del
 * camino de contenedores tal como lo conoce el detector (típicamente
 * `FunctionUnit.symbolPath` para un parámetro/local, o `[className]` para un
 * campo propio) — nunca hace falta el namespace completo.
 *
 * Puro y O(carriers del archivo). Sobre un grafo de antes de la Ola R
 * devuelve `"no-fact"` para todo, y con `graph`/`index` nulos también: un
 * detector que corra en la pasada sin grafo se comporta EXACTAMENTE como
 * antes.
 */
export function declaredTypeAtSite(
  graph: CodeGraph | null,
  index: GraphIndex | null,
  file: string,
  containerSuffix: readonly string[],
  name: string,
): DeclaredTypeAnswer {
  if (!graph || !index) return NO_FACT;
  const suffix = [...containerSuffix, name];
  let hit: CodeGraphNode | null = null;
  for (const node of carriersByFile(graph).get(file) ?? []) {
    if (!endsWith(node.symbolPath, suffix)) continue;
    if (hit) return NO_FACT; // regla 1: dos sitios homónimos no son "uno de estos dos", son "no sé cuál".
    hit = node;
  }
  if (!hit) return NO_FACT; // regla 2: sin sitio, "no pude mirar" — nunca `unresolved`.
  return declaredTypeOf(index, hit.id);
}
