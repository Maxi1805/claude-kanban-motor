/**
 * `homonymous-divergent-signature` — Ola AX, frente AX4.
 *
 * EL HUECO QUE TAPA, MEDIDO POR OTRO FRENTE Y NO POR MÍ. `Alternative Classes
 * with Different Interfaces` es la ÚNICA fila del catálogo canónico cuya
 * hipótesis (`hypotheses/unify-alternative-interfaces.ts`) está REGISTRADA y
 * EMITIENDO pero con **n = 5 juicios**, que no alcanza para afirmar nada. La
 * causa no es la hipótesis: es que **ningún `kind` de nivel 1 nombra la forma
 * que la familia busca**, y por eso sólo le llegan los sujetos que caen dentro
 * de un hallazgo de otras dos anclas prestadas.
 *
 *   · `homonymous-divergent-sequence` es **intra-file** y **exige que las
 *     ARIDADES COINCIDAN** — es el complemento exacto de lo que esta familia
 *     busca.
 *   · `homonymous-divergent-construction` es inter-file pero pide que los
 *     hermanos CONSTRUYAN cosas distintas, que es otra forma.
 *
 * `ola-aw/informes/AW3.md` §2.6 midió el tamaño del hueco sobre el grafo:
 * **el 100 % de los pares (ancestro, miembro) que cumplen la precondición
 * entera son MULTI-ARCHIVO** (jenkins 16/16, nest 5/5), *"~21 sujetos en dos
 * repos, del orden de 100 sobre los 21, todos hoy inalcanzables"*. Y dejó
 * escrita, textual, la definición del `kind` que faltaba:
 *
 *   > *"≥2 subtipos del mismo ancestro declaran un miembro homónimo con
 *   > aridades distintas"*
 *
 * Este archivo es eso, con dos condiciones más que NO son de forma sino de
 * PROBLEMA (ver G4 y G5 abajo).
 *
 * ── LA PRECONDICIÓN ES UN HECHO, Y SE VERIFICA ABRIENDO EL ARCHIVO ────────
 * La regla de diseño de la ola: una precondición tiene que ser (1) un HECHO,
 * (2) VISIBLE EN LO QUE EL ANALIZADOR CARGA y (3) suficiente para que sea un
 * PROBLEMA y no sólo una FORMA. Las cinco compuertas, y cuál de las tres
 * cubre cada una:
 *
 *   G1  ≥2 subtipos `class-like` de un ancestro común, por
 *       `extends`/`implements`/`mixes-in`/`satisfies` con `provenance` ∈
 *       {`declared`, `resolved`}.                      → hecho (1), grafo (2)
 *   G2  ≥2 de esos subtipos declaran un miembro `function-like` del MISMO
 *       nombre (ni constructor, ni el nombre del propio tipo). → (1) (2)
 *   G3  ≥2 de esas declaraciones tienen aridad CONOCIDA y hay ≥2 aridades
 *       DISTINTAS.                                            → (1) (2)
 *   G4  el ancestro declara ≥1 miembro **y NO declara ya** el homónimo. → (3)
 *   G5  ≥1 arista `calls` ENTRANTE a alguna de esas declaraciones desde FUERA
 *       de su propia unidad-tipo.                                     → (3)
 *
 * **G4 Y G5 NO SALIERON DE MIRAR FALSOS — son dos `required` que AW3 ya
 * publicó y midió** para la hipótesis (`el-ancestro-no-declara-ya-el-contrato`
 * y `alguien-la-invoca-desde-afuera`). Lo que hace este archivo es SUBIRLOS al
 * nivel 1, que es donde el hecho tiene que estar. Sin ellos el detector
 * describiría una FORMA —dos hermanos sobrecargan un nombre— y no un problema:
 *
 *   · sin G4, si el ancestro YA declara el miembro, el contrato unificado
 *     **existe** y no hay nada que unificar; y un ancestro sin ningún miembro
 *     es una interfaz MARCADORA, por la que nadie invoca nada.
 *   · sin G5, el miembro es un **helper interno repetido** (o un gancho que el
 *     framework rutea por otro camino) y **no hay ninguna llamada polimórfica
 *     que unificar**. AW3 lo midió: de las tres falsas que juzgó, DOS mueren
 *     exactamente ahí — `nest · Server.getPublisher` (sólo se invoca como
 *     `this.getPublisher(…)` dentro de la propia subclase) y
 *     `jenkins · ModelObjectWithChildren.doConfigSubmit` (tres endpoints que
 *     Stapler rutea por URL, cero llamadas en el código).
 *
 * ── LO QUE ESTE DETECTOR **NO** CUBRE, DECLARADO Y NO ESCONDIDO ───────────
 * **La mitad canónica del olor —dos clases SIN PARENTESCO cuya operación se
 * llama DISTINTO— sigue sin detector.** Este `kind` exige ancestro común y
 * nombre igual, igual que sus dos hermanos. Encontrar "dos clases que hacen lo
 * mismo con nombres distintos" pide comparar cuerpos entre todos los pares de
 * tipos del repo sin ninguna arista que los junte, y eso es otro problema.
 *
 * **Y HAY UN LÍMITE DE GRAMÁTICA QUE NINGÚN UMBRAL ARREGLA: Go.** El grafo
 * casi no tiene aristas de herencia en Go —AW3 midió que gitea entero produce
 * UNA familia—: Go no tiene `extends` y los métodos se declaran fuera del
 * tipo. **Este detector es y va a seguir siendo casi mudo en Go, y se dice acá
 * antes de medirlo, no después.** Cero hardcodeos de lenguaje: todo sale de
 * `graph.nodes`/`graph.edges` y de `node.arity`, que la gramática de cada
 * lenguaje llena o deja en `null`. `arity === null` ("la gramática no expuso
 * lista de parámetros" — Ruby sin paréntesis) NO es "cero" y esa declaración
 * NO participa: es el mismo criterio que `formaPorGrafo` ya aplica.
 *
 * ── LA ESCALA, ESCRITA ANTES DE MEDIR ─────────────────────────────────────
 * Un hallazgo de este `kind` es una FAMILIA ENTERA (un par ancestro/miembro
 * con todas sus declaraciones), no un sitio. AW3 estimó ~100 sujetos sobre los
 * 21 repos. `maxFindings = 20` por repo: veinte familias por repo ya es más de
 * lo que nadie acciona en una sesión, y el tope existe para que un repo
 * atípico no publique cientos de tarjetas del mismo kind.
 */
import { presencia, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import { CONSTRUCTOR_NAMES } from "../../code-grammar.js";
import type { CodeGraph, CodeGraphNode } from "../../graph/types.js";
import type { InterFileDetector, RawFinding, RepoUnit, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "hermanos" | "aridadesDistintas" | "llamadasExternas";

/** G1 — las cuatro formas de decir "es-un". ALTERNATIVA, no conjunción: Ruby no
 *  tiene `implements`/`satisfies`, Go no tiene `extends`/`mixes-in`. */
const ARISTAS_DE_FAMILIA: ReadonlySet<string> = new Set(["extends", "implements", "mixes-in", "satisfies"]);
/** Evidencia POSITIVA de parentesco ⇒ `inferred`/`ambiguous` quedan afuera.
 *  Mismo criterio que `hypotheses/unify-alternative-interfaces.ts` y que
 *  `dependency-cycle.ts`/`divergent-change.ts` ya aplican. */
const PROVENANCE_CONFIABLE: ReadonlySet<string> = new Set(["declared", "resolved"]);

const HERMANOS_SPEC = presencia({
  rationale:
    "con UNA sola declaración no hay dos interfaces que unificar: la forma que este detector busca ('el mismo miembro declarado por hermanos de la misma familia, con firmas que no coinciden') no existe por debajo de dos. Mismo MIN_HERMANOS (2) que hypotheses/unify-alternative-interfaces.ts ya exige y mismo criterio que homonymous-divergent-construction.ts#hermanos; no hay magnitud que calibrar, la pregunta es binaria.",
});

const ARIDADES_SPEC = presencia({
  rationale:
    "'firmas DISTINTAS' es, por definición, más de una firma: 2 aridades declaradas distintas es el mínimo para que la divergencia exista. Si las k declaraciones comparten aridad no hay nada que unificar (ese caso es de 'Form Template Method', y es exactamente lo que homonymous-divergent-sequence ya cubre). Piso de FORMA, binario, no una magnitud calibrada.",
});

const LLAMADAS_SPEC = presencia({
  rationale:
    "el olor duele cuando alguien que tiene una referencia al ancestro TIENE que saber cuál subtipo es. Con CERO llamadas desde fuera de la unidad-tipo que lo declara, el miembro es un helper interno repetido o un gancho que el framework rutea por otro camino, y no hay ninguna llamada polimórfica que unificar. Binario: la pregunta es si existe al menos un llamador externo, no cuántos. Medido por AW3 sobre las falsas de la hipótesis: dos de tres mueren exactamente acá.",
});

const MAX_FINDINGS_SPEC = presupuesto(20, {
  rationale:
    "un hallazgo de este kind es una FAMILIA entera (un par ancestro/miembro con todas sus declaraciones), no un sitio: veinte familias por repo ya es más de lo que nadie acciona en una sesión. Es un tope de VOLUMEN, no de detección, y existe para que un repo atípico no publique cientos de tarjetas del mismo kind.",
});

interface Declaracion {
  readonly subId: string;
  readonly sub: CodeGraphNode;
  readonly miembro: CodeGraphNode;
  readonly arity: number;
}

function nombreDe(n: CodeGraphNode): string {
  return n.symbolPath[n.symbolPath.length - 1] ?? "";
}

interface Indice {
  readonly byId: ReadonlyMap<string, CodeGraphNode>;
  /** ancestro → subtipos `class-like` (G1). */
  readonly subtipos: ReadonlyMap<string, ReadonlySet<string>>;
  /** contenedor → hijos `function-like` directos (aristas `contains`). */
  readonly miembros: ReadonlyMap<string, readonly string[]>;
  /** destino de una arista `calls` → orígenes. */
  readonly llamadoresDe: ReadonlyMap<string, readonly string[]>;
}

function indexar(graph: CodeGraph): Indice {
  const byId = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) if (n.kind === "symbol" && !byId.has(n.id)) byId.set(n.id, n);

  const subtipos = new Map<string, Set<string>>();
  const miembros = new Map<string, string[]>();
  const llamadoresDe = new Map<string, string[]>();

  for (const e of graph.edges) {
    if (e.kind === "contains") {
      const hijo = byId.get(e.to);
      if (!hijo || hijo.family !== "function-like") continue;
      const l = miembros.get(e.from);
      if (l) l.push(e.to);
      else miembros.set(e.from, [e.to]);
      continue;
    }
    if (e.kind === "calls") {
      const l = llamadoresDe.get(e.to);
      if (l) l.push(e.from);
      else llamadoresDe.set(e.to, [e.from]);
      continue;
    }
    if (!ARISTAS_DE_FAMILIA.has(e.kind) || !PROVENANCE_CONFIABLE.has(e.provenance)) continue;
    if (e.from === e.to) continue;
    const sub = byId.get(e.from);
    const anc = byId.get(e.to);
    if (!sub || !anc || sub.family !== "class-like" || anc.family !== "class-like") continue;
    const s = subtipos.get(e.to);
    if (s) s.add(e.from);
    else subtipos.set(e.to, new Set([e.from]));
  }

  return { byId, subtipos, miembros, llamadoresDe };
}

/**
 * G5 — cuántas de estas declaraciones tienen al menos un llamador FUERA de su
 * propia unidad-tipo, y cuántas llamadas externas hay en total.
 *
 * "Fuera de su unidad-tipo" = el nodo de origen de la arista `calls` no
 * comparte (archivo, primera componente de `symbolPath`) con el nodo destino.
 * Un método que se llama a sí mismo, o al que llama un hermano de su propia
 * clase, NO cuenta: eso es uso interno, no un contrato que alguien de afuera
 * tenga que conocer. Mismo criterio, palabra por palabra, que
 * `hypotheses/unify-alternative-interfaces.ts#invocacionesDesdeAfuera`, que es
 * el que AW3 midió.
 */
function llamadasExternas(idx: Indice, decls: readonly Declaracion[]): { total: number; declsAlcanzadas: number } {
  let total = 0;
  let declsAlcanzadas = 0;
  for (const d of decls) {
    let propias = 0;
    for (const fromId of idx.llamadoresDe.get(d.miembro.id) ?? []) {
      const origen = idx.byId.get(fromId);
      const mismoDuenio =
        origen !== undefined &&
        origen.file === d.miembro.file &&
        origen.symbolPath.length > 0 &&
        d.miembro.symbolPath.length > 0 &&
        origen.symbolPath[0] === d.miembro.symbolPath[0];
      if (!mismoDuenio) propias++;
    }
    total += propias;
    if (propias > 0) declsAlcanzadas++;
  }
  return { total, declsAlcanzadas };
}

/** Un grupo que YA paso las cinco compuertas, antes de deduplicar. */
interface Grupo {
  readonly ancestro: CodeGraphNode;
  readonly miembro: string;
  readonly decls: readonly Declaracion[];
  readonly miembrosDelAncestro: ReadonlySet<string>;
  readonly total: number;
  readonly declsAlcanzadas: number;
}

/**
 * LA MISMA DIVERGENCIA NO SE REPORTA UNA VEZ POR ANCESTRO — el defecto que
 * midio esta ola sobre `jenkins` (java) ANTES de juzgar nada, y por eso se
 * arregla como DEDUPLICACION y no como compuerta de precision: no cambia QUE
 * divergencias se reportan, solo cuantas veces se reporta cada una.
 *
 * EL HECHO MEDIDO: con herencia multiple (interfaces de java, mixins de ruby,
 * `implements` multiple de typescript) dos hermanos comparten VARIOS ancestros
 * a la vez, asi que el MISMO par de declaraciones sale una vez por cada uno.
 * En jenkins, `doDoDelete` salia CUATRO veces —bajo `AccessControlled` (6
 * declaraciones), `DescriptorByNameOwner` (5), `Actionable` (4) y `Loadable`
 * (3)— y `updateNewComputer`/`updateComputerList` DOS veces cada una, con el
 * mismo par de declaraciones: 22 hallazgos crudos para 12 divergencias
 * distintas. Cuatro tarjetas para el mismo trabajo no son cuatro problemas.
 *
 * LA REGLA, y es la mas conservadora que existe: para un MISMO nombre de
 * miembro, un grupo se descarta solo si su conjunto de declaraciones es un
 * SUBCONJUNTO del de otro grupo que ya se conservo. Se conserva siempre el mas
 * ANCHO (el que reune mas declaraciones divergentes), que es el que describe el
 * problema entero; el mas angosto no agrega ni una declaracion que el ancho no
 * lleve. Dos grupos con conjuntos que se cruzan sin contenerse SOBREVIVEN LOS
 * DOS: son divergencias distintas. Mismo criterio y mismo precedente que
 * `parallel-hierarchies.ts#dedupeMirroredComponents`.
 */
function deduplicar(grupos: readonly Grupo[]): readonly Grupo[] {
  const porMiembro = new Map<string, Grupo[]>();
  for (const g of grupos) {
    const l = porMiembro.get(g.miembro);
    if (l) l.push(g);
    else porMiembro.set(g.miembro, [g]);
  }
  const salida: Grupo[] = [];
  for (const [, lista] of porMiembro) {
    // Del mas ancho al mas angosto; desempate estable por nombre del ancestro.
    const orden = [...lista].sort((a, b) => b.decls.length - a.decls.length || (nombreDe(a.ancestro) < nombreDe(b.ancestro) ? -1 : 1));
    const conservados: { g: Grupo; ids: ReadonlySet<string> }[] = [];
    for (const g of orden) {
      const ids = new Set(g.decls.map((d) => d.miembro.id));
      if (conservados.some((c) => [...ids].every((id) => c.ids.has(id)))) continue;
      conservados.push({ g, ids });
    }
    for (const c of conservados) salida.push(c.g);
  }
  return salida;
}

export function buildHomonymousDivergentSignatureFindings(
  graph: CodeGraph,
  hermanos: Threshold,
  aridadesDistintas: Threshold,
  llamadas: Threshold,
): readonly RawFinding[] {
  const idx = indexar(graph);
  const grupos: Grupo[] = [];

  const ancestros = [...idx.subtipos.keys()].sort();
  for (const ancestroId of ancestros) {
    const subs = idx.subtipos.get(ancestroId)!;
    // `presencia()` resuelve SIEMPRE a `value === 1` (`thresholds.ts#presencia`):
    // la comparación que expresa "más de uno" es `> value`, no `>= value`.
    // Mismo idiom, misma razón, que `parallel-hierarchies.ts` con su
    // `minGroupSize` (`sortedGroup.length > minGroupSize.value (1) >= 1`).
    if (subs.size <= hermanos.value) continue;
    const ancestro = idx.byId.get(ancestroId);
    if (!ancestro) continue;

    // G4, primera mitad: un ancestro SIN miembros propios es una interfaz
    // MARCADORA — dos tipos que sólo comparten una marca no se invocan por ella.
    const miembrosDelAncestro = new Set<string>();
    for (const h of idx.miembros.get(ancestroId) ?? []) {
      const n = idx.byId.get(h);
      if (n) miembrosDelAncestro.add(nombreDe(n));
    }
    if (miembrosDelAncestro.size === 0) continue;

    // G2 — miembro homónimo declarado por >= 2 subtipos DISTINTOS. Una sola
    // declaración por subtipo (la primera en orden estable): dos sobrecargas
    // del mismo nombre DENTRO de un subtipo son overloading legítimo, no dos
    // interfaces alternativas de la familia.
    const porMiembro = new Map<string, Declaracion[]>();
    for (const subId of [...subs].sort()) {
      const sub = idx.byId.get(subId);
      if (!sub) continue;
      const nombreDelSub = nombreDe(sub);
      const vistos = new Set<string>();
      for (const h of idx.miembros.get(subId) ?? []) {
        const m = idx.byId.get(h);
        if (!m) continue;
        const nombre = nombreDe(m);
        if (!nombre || CONSTRUCTOR_NAMES.has(nombre) || nombre === nombreDelSub) continue;
        if (vistos.has(nombre)) continue;
        vistos.add(nombre);
        // G3, primera mitad: aridad CONOCIDA. `null` es "la gramática no expuso
        // lista de parámetros", no "cero" — esa declaración no participa.
        if (typeof m.arity !== "number") continue;
        const l = porMiembro.get(nombre);
        const d: Declaracion = { subId, sub, miembro: m, arity: m.arity };
        if (l) l.push(d);
        else porMiembro.set(nombre, [d]);
      }
    }

    for (const nombre of [...porMiembro.keys()].sort()) {
      const decls = porMiembro.get(nombre)!;
      if (decls.length <= hermanos.value) continue;
      // G4, segunda mitad: si el ancestro YA declara el miembro, el contrato
      // unificado EXISTE. No hay nada que unificar.
      if (miembrosDelAncestro.has(nombre)) continue;
      // G3, segunda mitad: las aridades tienen que DIFERIR.
      const aridades = [...new Set(decls.map((d) => d.arity))].sort((a, b) => a - b);
      if (aridades.length <= aridadesDistintas.value) continue;
      // G5.
      // G5 — acá `presencia` SÍ se lee como `>= value`: la pregunta es si
      // EXISTE al menos un llamador externo (1), no si hay "más de uno".
      const { total, declsAlcanzadas } = llamadasExternas(idx, decls);
      if (total < llamadas.value) continue;

      grupos.push({ ancestro, miembro: nombre, decls, miembrosDelAncestro, total, declsAlcanzadas });
    }
  }

  const findings: RawFinding[] = [];
  for (const g of deduplicar(grupos)) {
    const { ancestro, miembro: nombre, decls, miembrosDelAncestro, total, declsAlcanzadas } = g;
    const aridades = [...new Set(decls.map((d) => d.arity))].sort((a, b) => a - b);
    {
      const ancho = aridades[aridades.length - 1]!;
      const angosto = aridades[0]!;
      const ordenadas = [...decls].sort((a, b) =>
        a.miembro.file === b.miembro.file
          ? (a.miembro.startLine ?? 1) - (b.miembro.startLine ?? 1)
          : a.miembro.file < b.miembro.file
            ? -1
            : 1,
      );
      const archivos = new Set(ordenadas.map((d) => d.miembro.file));
      const retornos = new Set(ordenadas.map((d) => d.miembro.returnType).filter((t): t is string => t !== undefined));

      const locations: RoleLocation[] = ordenadas.map((d) => ({
        file: d.miembro.file,
        startLine: d.miembro.startLine ?? d.sub.startLine ?? 1,
        endLine: d.miembro.endLine ?? d.miembro.startLine ?? d.sub.endLine ?? 1,
        symbol: d.miembro.symbolPath.join("."),
        role:
          d.arity === ancho
            ? `declara "${nombre}" con ${d.arity} parámetro(s) — la firma más ancha de la familia`
            : `declara "${nombre}" con ${d.arity} parámetro(s): quien tiene una referencia a "${nombreDe(ancestro)}" no la puede invocar igual que la de ${ancho}`,
      }));
      locations.push({
        file: ancestro.file,
        startLine: ancestro.startLine ?? 1,
        endLine: ancestro.endLine ?? ancestro.startLine ?? 1,
        symbol: ancestro.symbolPath.join("."),
        role: `el ancestro que reúne a los ${ordenadas.length} tipos, y que NO declara "${nombre}"`,
      });

      findings.push({
        variant: nombre,
        title: `${ordenadas.length} hermanos de "${nombreDe(ancestro)}" declaran "${nombre}" con firmas que no coinciden (${aridades.join(" vs ")} parámetros)`,
        detail:
          `${ordenadas.length} subtipos de "${nombreDe(ancestro)}", en ${archivos.size} archivo(s), declaran cada uno su propio "${nombre}", ` +
          `y las firmas no coinciden: ${aridades.join(", ")} parámetros. "${nombreDe(ancestro)}" declara ${miembrosDelAncestro.size} miembro(s) propio(s) pero NO declara "${nombre}", ` +
          `así que no existe una firma única por la que invocarla: quien tiene una referencia al ancestro tiene que saber cuál subtipo es. ` +
          `Hay ${total} llamada(s) a "${nombre}" desde fuera de las unidades-tipo que la declaran, sobre ${declsAlcanzadas} de las ${ordenadas.length} declaraciones: ` +
          "no es un ayudante interno repetido, hay quien la usa sin ser ella misma. " +
          (retornos.size > 1
            ? `Los tipos de retorno ESCRITOS también difieren (${[...retornos].sort().join(" vs ")}); la covarianza es normal, así que eso solo no probaría nada — lo que dispara este hallazgo es la aridad. `
            : "") +
          "Esto no afirma que las dos operaciones sean la misma: es la evidencia cruda de la SITUACIÓN (el mismo nombre, la misma familia, firmas que no se pueden usar igual). " +
          "Si de verdad hacen lo mismo, y con qué remedio, lo decide la hipótesis correspondiente, no este detector.",
        trigger: [
          { label: "hermanos que declaran el mismo miembro", value: ordenadas.length, threshold: hermanos },
          { label: "aridades declaradas distintas entre ellos", value: aridades.length, threshold: aridadesDistintas },
          { label: "llamadas desde fuera de la unidad-tipo que lo declara", value: total, threshold: llamadas },
        ],
        evidence: [
          { label: "diferencia entre la firma más ancha y la más angosta", value: ancho - angosto, note: `${angosto} → ${ancho} parámetro(s)` },
          { label: "archivos distintos que participan", value: archivos.size, note: archivos.size === 1 ? "familia de un solo archivo" : "familia repartida: ningún detector intra-file la puede ver entera" },
          { label: "declaraciones con al menos un llamador externo", value: declsAlcanzadas, note: `de ${ordenadas.length}` },
          {
            label: "miembros que el ancestro sí declara",
            value: miembrosDelAncestro.size,
            note: `condición de RESOLUCIÓN VERIFICADA: "${nombre}" NO está entre ellos — si lo estuviera, el contrato unificado ya existiría y este hallazgo no existiría`,
          },
        ],
        locations: locations as [RoleLocation, ...RoleLocation[]],
        severity: Math.min(100, 30 + ordenadas.length * 6 + (ancho - angosto) * 4 + (archivos.size > 1 ? 6 : 0)),
        advice: {
          primary: {
            name: "Rename Method / Add Parameter",
            kind: "refactorizacion",
            why:
              `Igualar las ${ordenadas.length} firmas de "${nombre}" en la más ancha (${ancho} parámetro(s)), con valor por omisión para los que sobran, ` +
              "es el primer paso mecánico que el catálogo nombra para este olor: deja las declaraciones intercambiables sin tocar ningún cuerpo. " +
              "Declarar la operación una sola vez en el ancestro viene después, y es una decisión de diseño, no una refactorización.",
            source: "https://refactoring.guru/es/smells/alternative-classes-with-different-interfaces",
          },
        },
      });
    }
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "homonymous-divergent-signature"> = {
  id: "homonymous-divergent-signature",
  kind: "homonymous-divergent-signature",
  scope: "inter-file",
  needsGraph: true,
  title: "Hermanos de la misma familia que declaran el mismo miembro con firmas que no coinciden",
  // Ningún `Capability` de gramática: la señal es puramente de FORMA del grafo
  // (aristas de familia + `contains` + `arity`), igual que
  // `homonymous-divergent-construction`, `parallel-hierarchies` y
  // `dependency-cycle`. Un repo sin ninguna arista de familia simplemente no
  // tiene candidatos — el límite de Go, declarado en el docstring.
  needs: [],
  // CONJUNCIÓN REAL: sin `calls` no hay forma de contestar G5 —¿alguien la
  // invoca desde fuera?—, que es la compuerta que separa un PROBLEMA de una
  // FORMA. Faltando `calls` este detector no puede encontrar nada, no
  // "encuentra cero". `contains` es la arista estructural de fondo y va en
  // `needs-edges-audit.test.ts#DELIBERATELY_EXCLUDED`, igual que en
  // `homonymous-divergent-construction`.
  needsEdges: ["calls"],
  // ALTERNATIVA: alcanza con UNA de las cuatro para que exista "familia".
  // Ruby no tiene `implements`/`satisfies`, Go no tiene `extends`/`mixes-in`;
  // declararlas en conjunción apagaría el detector entero en esos lenguajes —
  // la regresión exacta que `types.ts#needsAnyEdge` documenta.
  needsAnyEdge: ["extends", "implements", "mixes-in", "satisfies"],
  thresholds: {
    hermanos: HERMANOS_SPEC,
    aridadesDistintas: ARIDADES_SPEC,
    llamadasExternas: LLAMADAS_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph === null`
    // ANTES de llamar a `run()` — mismo comentario que `god-component.ts`.
    if (!graph) return [];
    return buildHomonymousDivergentSignatureFindings(
      graph,
      ctx.threshold("hermanos"),
      ctx.threshold("aridadesDistintas"),
      ctx.threshold("llamadasExternas"),
    );
  },
};
