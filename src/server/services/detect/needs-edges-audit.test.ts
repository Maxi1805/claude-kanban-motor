/**
 * LA COMPUERTA MECÁNICA DE `needsEdges` — Ola A3, criterio de cierre 2.
 *
 * `language-coverage.test.ts` ya congela QUÉ declara cada detector hoy (una
 * lista literal, "sacar una línea se nota"), pero una lista congelada no
 * atrapa el caso inverso: un detector que empieza a LEER un `EdgeKind` nuevo
 * sin agregar esa línea. Ese es exactamente el agujero que este archivo
 * cierra — "que sea una compuerta, no una convención" (brief de esta ola).
 *
 * CÓMO AUDITA, SIN PARSEAR TypeScript de verdad: para cada detector
 * `inter-file` registrado (convención ya exigida por `registry.ts`: el
 * archivo vive en `inter-file/<id>.ts`), se lee su propio código fuente, se
 * despojan los comentarios (con un mini state-machine que respeta strings —
 * ver `stripComments`, así una URL `https://...` o una prosa que CITA código
 * entre comentarios no ensucia la extracción) y se buscan dos formas en las
 * que un detector puede "leer" un `EdgeKind`:
 *
 *   1. Comparación directa: `algo.kind === "<kind>"` o `algo.kind !== "<kind>"`.
 *   2. Vocabulario en lista: cualquier literal `[ "a", "b", ... ]` del código
 *      (los `Set<EdgeKind>([...])`/arrays que arman `IMPLEMENTER_EDGE_KINDS`,
 *      `CONSUMER_EDGE_KINDS`, etc.) — se extrae cualquier elemento que sea
 *      un `EdgeKind` válido, sin exigir que TODOS los elementos del array lo
 *      sean (así una lista mixta no esconde el que sí importa).
 *
 * El resultado es el conjunto TOCADO por el archivo. Cada kind tocado tiene
 * que aparecer en UNA de tres partes, para el mismo detector:
 *   - `needsEdges` (conjunción: el detector lo declara porque sin ÉL —
 *     junto con el resto de la lista — no corre de verdad), o
 *   - `needsAnyEdge` (alternativa: el detector lo declara junto con otros
 *     kinds que juegan el MISMO rol, y alcanza con que UNO CUALQUIERA del
 *     grupo esté presente — ver `types.ts#InterFileDetector.needsAnyEdge`,
 *     "CÓMO NO VOLVER A CONFUNDIRLO", para el criterio AND/OR), o
 *   - `DELIBERATELY_EXCLUDED` (este archivo, con la razón: el detector lo lee
 *     pero su ausencia NO le impide encontrar nada — sólo ajusta confianza/
 *     severidad, o lo usa para EXCLUIR candidatos que ya tienen otra cosa, o
 *     es `"contains"`, la arista estructural de fondo — ver
 *     `types.ts#InterFileDetector.needsEdges`).
 *
 * Esta compuerta NO audita si un kind quedó en el campo correcto (AND vs OR)
 * — sólo que esté declarado EN ALGUNO de los dos. Esa segunda distinción la
 * fija `language-coverage.test.ts` (`NEEDS_EDGES_DECLARADOS`/
 * `NEEDS_ANY_EDGE_DECLARADOS`, congelados) y, en última instancia, se
 * verifica leyendo el filtro real de `run()` — nunca el docstring.
 *
 * Un kind tocado que no está en NINGUNA de las tres listas pone este archivo
 * en rojo — un detector nuevo (o uno viejo al que se le agrega un filtro de
 * arista) no puede quedar mudo por omisión.
 *
 * LÍMITE DECLARADO, NO ESCONDIDO: esta auditoría lee sólo el TEXTO del propio
 * archivo del detector. Un detector que consume un vocabulario de kinds
 * IMPORTADO de otro módulo (p.ej. `distributed-duplication.ts` usa
 * `connectedComponentsMetric.edgeKinds`, definido en `graph/metrics/
 * componentes.ts`) no expone esos literales en su propio texto, así que esta
 * compuerta no los ve — no puede, sin parsear e inlinear imports, algo fuera
 * de alcance para un test. Para esos casos, la declaración de `needsEdges`
 * quedó decidida a mano (ver el comentario `OLA A3` en cada detector) y esta
 * compuerta protege lo que SÍ puede ver: cualquier filtro de arista escrito
 * directamente en el archivo del detector, que es donde el 100% de los
 * casos nuevos previsibles va a aparecer (un detector nuevo escribe su
 * propio filtro, no importa uno ajeno).
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DETECTORS } from "./registry.js";
import type { EdgeKind } from "../graph/types.js";

const INTER_FILE_DIR = path.join(import.meta.dirname, "inter-file");

/** Espejo del tipo `EdgeKind` (`graph/types.ts`) — el test de tipo de abajo
 *  asegura que esta lista no se desincroniza en silencio si el tipo gana o
 *  pierde un miembro. */
const ALL_EDGE_KINDS = [
  "contains",
  "references",
  "extends",
  "implements",
  "mixes-in",
  "instantiates",
  "imports",
  "satisfies",
  "calls",
  "affects",
  "carries",
  "invokes-indirect",
  // Ola R (R1) — `declares-type`. Sincronización MECÁNICA del espejo, que es
  // exactamente para lo que esta lista existe (el `AssertAllEdgeKinds` de
  // abajo la rompe si falta un miembro). Cero lógica nueva, cero aserción
  // aflojada.
  "declares-type",
  // Ola R (R3) — `stores`, el eslabón `construye → guarda` de la cadena de
  // identidad. Misma sincronización MECÁNICA del espejo, por el mismo motivo.
  "stores",
] as const;
type AssertAllEdgeKinds = typeof ALL_EDGE_KINDS[number] extends EdgeKind
  ? EdgeKind extends typeof ALL_EDGE_KINDS[number]
    ? true
    : ["falta en ALL_EDGE_KINDS un miembro de EdgeKind — sincronizar la lista"]
  : ["ALL_EDGE_KINDS tiene un miembro que ya no está en EdgeKind — sincronizar la lista"];
const _edgeKindsSincronizado: AssertAllEdgeKinds = true as AssertAllEdgeKinds;
void _edgeKindsSincronizado;

const EDGE_KIND_SET = new Set<string>(ALL_EDGE_KINDS);

/**
 * Despoja `/* … *\/` y `// …` de código fuente TS, respetando strings
 * (simple/doble/template, con escapes) para que una URL `https://` o una
 * prosa que cita código entre comentarios no se lea como comentario ni
 * ensucie lo que sigue. No es un parser completo (no necesita serlo: sólo
 * alimenta la extracción de literales de abajo, nunca se re-emite como
 * código ejecutable).
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  type State = "code" | "line-comment" | "block-comment" | "string-s" | "string-d" | "template";
  let state: State = "code";
  while (i < n) {
    const c = src[i]!;
    const c2 = src[i + 1];
    if (state === "code") {
      if (c === "/" && c2 === "/") {
        state = "line-comment";
        i += 2;
        continue;
      }
      if (c === "/" && c2 === "*") {
        state = "block-comment";
        i += 2;
        continue;
      }
      if (c === "'") {
        state = "string-s";
        out += c;
        i++;
        continue;
      }
      if (c === '"') {
        state = "string-d";
        out += c;
        i++;
        continue;
      }
      if (c === "`") {
        state = "template";
        out += c;
        i++;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    if (state === "line-comment") {
      if (c === "\n") {
        state = "code";
        out += c;
      }
      i++;
      continue;
    }
    if (state === "block-comment") {
      if (c === "*" && c2 === "/") {
        state = "code";
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    // Los tres estados de string comparten la misma forma: copiar, respetar
    // escapes, volver a "code" al ver la comilla de cierre sin escapar.
    const closer = state === "string-s" ? "'" : state === "string-d" ? '"' : "`";
    out += c;
    if (c === "\\") {
      out += src[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (c === closer) state = "code";
    i++;
  }
  return out;
}

/** `algo.kind === "X"` / `algo.kind !== "X"` — cualquier dirección cuenta como "el archivo lee este kind". */
const KIND_COMPARISON = /\.kind\s*(?:===|!==)\s*"([a-z][a-z-]*)"/g;

/** Elementos válidos de `EdgeKind` dentro de CUALQUIER literal `[ ... ]` del archivo (Set/array). */
function extractBracketedKinds(text: string): Set<string> {
  const out = new Set<string>();
  const bracketRe = /\[([^[\]]*)]/g;
  let m: RegExpExecArray | null;
  while ((m = bracketRe.exec(text))) {
    const inner = m[1]!;
    const strRe = /"([a-z][a-z-]*)"/g;
    let sm: RegExpExecArray | null;
    while ((sm = strRe.exec(inner))) {
      if (EDGE_KIND_SET.has(sm[1]!)) out.add(sm[1]!);
    }
  }
  return out;
}

function extractTouchedEdgeKinds(source: string): ReadonlySet<string> {
  const clean = stripComments(source);
  const touched = new Set<string>();
  let m: RegExpExecArray | null;
  KIND_COMPARISON.lastIndex = 0;
  while ((m = KIND_COMPARISON.exec(clean))) {
    if (EDGE_KIND_SET.has(m[1]!)) touched.add(m[1]!);
  }
  for (const k of extractBracketedKinds(clean)) touched.add(k);
  return touched;
}

/**
 * Kinds que un detector TOCA en su propio archivo pero cuya ausencia NO le
 * impide encontrar nada — sólo ajusta confianza/severidad, o EXCLUYE
 * candidatos que ya tienen otra cosa (nunca decide si se emite un
 * hallazgo). Cada entrada es una decisión tomada leyendo el `run()` real de
 * ese detector (ver el comentario `OLA A3` en el archivo del detector para
 * el razonamiento completo) — nunca un relleno para hacer pasar el test.
 * `"contains"` se repite en casi todos a propósito: es la arista
 * estructural de fondo, ver `types.ts#needsEdges`.
 */
const DELIBERATELY_EXCLUDED: Readonly<Record<string, readonly string[]>> = {
  // `instantiates` (Ola O, "SITIO DE CONSTRUCCIÓN" en el docstring del módulo)
  // sólo EXCLUYE una arista `references` de clase que coincide con el sitio
  // donde ese mismo origen construye B (`new B(...)`) — nunca gatilla el
  // hallazgo, sólo evita contar la construcción misma como "cliente que
  // depende de la concreta". `contains` sigue siendo la de fondo.
  // Ola R (frente R5) — dos agregados, ninguno cambia si `run()` encuentra algo:
  //   - `calls` es la partición CALLEE de la MISMA cascada que ya produce
  //     `references` (`build.ts#relabelKind` por `isCallee`; una arista es
  //     una O la otra, nunca las dos). `references` sigue siendo la
  //     representante MANDATORIA de esa unión genérica en `needsEdges`
  //     (`types.ts#needsEdges`, "Unión GENÉRICA": declarar sólo el kind más
  //     universal, no la unión entera) — la ausencia de `calls` nunca apaga
  //     el detector, sólo deja de ver `b.foo()` además de `b.foo`.
  //   - `declares-type` (`graph/edges/declara-tipo.ts`) sólo DESAMBIGUA un
  //     candidato `references`/`calls` que YA llegó `provenance: "ambiguous"`
  //     (`collectConsumers`: sin `declaredTypeFiles` esa arista ambigua se
  //     descarta entera; el resto de candidatos no ambiguos sigue igual) —
  //     nunca origina un candidato nuevo. Misma categoría que `instantiates`
  //     arriba: selecciona/excluye entre candidatos que ya tienen otra cosa.
  "concrete-over-abstraction": ["contains", "instantiates", "calls", "declares-type"],
  "dependency-cycle": ["contains"],
  // OLA AE (frente AE8): `contains` es la arista ESTRUCTURAL DE FONDO — ubica
  // qué miembros declara cada tipo, y su ausencia está cubierta por
  // `needsGraph`, no por este campo (`types.ts#needsEdges`). Las cuatro aristas
  // de familia (`extends`/`implements`/`mixes-in`/`satisfies`) son ALTERNATIVA
  // y viven en `needsAnyEdge`; `instantiates` y `calls` son mandatorias y viven
  // en `needsEdges`.
  "homonymous-divergent-construction": ["contains"],
  // OLA AE (frente AE6): las seis clases de arista que este detector lee además
  // de `calls` sólo pueden RETIRAR candidatos o anotar un discriminador, nunca
  // originar un hallazgo. `contains` ubica al DUEÑO de cada operación y de cada
  // lugar; `implements`/`satisfies` contestan la condición (5b) —¿ya hay un
  // protocolo compartido?—; `carries`/`invokes-indirect` contestan la (5c)
  // —¿ya hay una cola de comandos?—; `extends`/`mixes-in` anotan el
  // discriminador de hermandad, que no es compuerta. Sin ninguna de las seis el
  // detector es MÁS generoso, nunca mudo. `calls` sí es mandatoria y va en
  // `needsEdges`.
  "invariant-scaffold-varying-call": ["contains", "implements", "satisfies", "extends", "mixes-in", "carries", "invokes-indirect"],
  "layer-skip": ["contains"],
  // OLA AE (frente AE10): las TRES aristas que este detector lee sólo pueden
  // CALLARLO, nunca originar un hallazgo. El candidato nace del texto de
  // `repo.clones` y de dos campos de NODO (`family`, `memberOfClassLike`), sin
  // ninguna arista. `contains` reúne los miembros de un tipo, `calls` mide su
  // fan-out y `instantiates` dice si ese tipo ya se usa: las tres juntas
  // contestan una sola pregunta, la condición (R) de RESOLUCIÓN VERIFICADA
  // ("¿ya existe un objeto neutro que cubre este protocolo?"), cuya única
  // consecuencia es DESCARTAR el candidato. Sin ninguna de las tres el
  // detector es MÁS generoso (no encuentra ningún sustituto y no se calla
  // nunca), jamás mudo — que es exactamente el criterio por el que
  // `types.ts#needsEdges` prohíbe declarar acá una arista que sólo excluye.
  // `contains`, además, es la arista de fondo que ese mismo docstring dice
  // que NUNCA se declara en `needsEdges`.
  // (Las cuatro aristas de subtipado se leen por el mismo motivo y con el mismo
  // signo: `esRaizDeProtocolo` sólo puede SACAR un tipo de la lista de neutros,
  // o sea hacer que el detector se calle MENOS.)
  "repeated-absence-check": ["contains", "calls", "instantiates", "extends", "implements", "satisfies", "mixes-in"],
  // OLA AD (frente AD4): `references` se lee junto con `calls` para dos cosas
  // que NUNCA originan un hallazgo — el testimonio de que las piezas del
  // núcleo se conocen entre sí (condición (4)) y el de que una puerta ya
  // existente está siendo usada (condición (5), que sólo EXCLUYE). Sin
  // `references` la cohesión se lee sólo de `calls`: más estricta, nunca
  // muda. `calls` sí es mandatoria y va en `needsEdges`.
  "repeated-collaborator-set": ["references"],
  // OLA AE (frente AE4): `instantiates` y `contains` se leen, y ninguna de
  // las dos puede ORIGINAR un hallazgo. `contains` es la arista estructural
  // de fondo (resuelve el dueno class-like de un miembro constructor).
  // `instantiates` sirve UNICAMENTE a la condicion (5b), que EXCLUYE
  // candidatos con un Builder ya puesto: sin ella el detector se calla
  // MENOS, nunca mas. `calls` si es mandatoria y va en `needsEdges`.
  "optional-construction-combinations": ["contains", "instantiates"],
  // OLA AE (frente AE3): tres tipos de arista se leen SIN ser mandatorias.
  // `implements`/`satisfies` sólo AMPLIAN el conjunto de huecos de producto que
  // `extends` ya abre (son la misma pregunta escrita como la escribe cada
  // lenguaje): sin ellas el detector ve menos huecos, nunca ninguno.
  // `calls`/`references` sólo alimentan las puertas (6b)/(6c), que EXCLUYEN
  // candidatos: sin ellas el detector es MENOS silencioso, nunca mudo.
  // `contains` ubica el miembro dentro de su clase dueña; sin ella cada lugar
  // cae a la granularidad de archivo, que sigue produciendo hallazgos.
  // `extends` e `instantiates` sí son mandatorias y van en `needsEdges`.
  "hardwired-subtype-combination": ["implements", "satisfies", "calls", "references", "contains"],
  "orphan-file": ["contains"],
  // `hasCompositionLink` (cross-check de Bridge) sólo BAJA severidad si
  // encuentra una referencia/instanciación cruzada entre las dos familias —
  // nunca decide si el hallazgo primario (extends/implements) se emite. Ver
  // "CON QUÉ SE CONFUNDE" en el docstring del módulo.
  "parallel-hierarchies": ["references", "instantiates"],
  // `extends`/`implements`/`satisfies` (evidencia positiva, `declared`/
  // `resolved`) sólo EXCLUYEN un tipo ya candidateado por `instantiates`
  // (`needsEdges`, declarado) — ver "PARTICIPACIÓN EN JERARQUÍA" en el
  // docstring del módulo: su ausencia nunca impide encontrar un candidato,
  // sólo deja de descartar el caso (exceptions/adapters) que resuelve.
  // `contains` (Ola P, frente P6, SÉPTIMO CASO) — sólo EXCLUYE un tipo ya
  // candidateado por `instantiates` que no tiene NINGÚN miembro `function-like`
  // propio (ver "SÉPTIMO CASO — VALOR PURO SIN COMPORTAMIENTO PROPIO" en el
  // docstring del módulo): su ausencia nunca impide encontrar un candidato,
  // sólo deja de descartar el caso (struct de sólo datos) que resuelve. Es la
  // misma arista estructural de fondo que casi todos los detectores excluyen
  // acá arriba (ver el comentario del encabezado de esta constante).
  // `stores`/`references`/`calls` (Ola R, frente R6, OCTAVO CASO — LA CADENA
  // DE IDENTIDAD) — sólo EXCLUYEN un tipo ya candidateado por `instantiates`
  // que no tiene, en NINGÚN punto del repo, un binding de módulo/clase que lo
  // guarde (`stores`) y se lea desde otro archivo (`references`/`calls`
  // entrante, ver "OCTAVO CASO" en el docstring del módulo): su ausencia
  // nunca impide encontrar un candidato — sólo deja de descartar el caso
  // (valor efímero/excepción sin identidad establecida) que resuelve. Mismo
  // espíritu que `contains`/SÉPTIMO CASO arriba: `stores` en particular es
  // `optional: true` y ausente por diseño en C# (ver
  // `graph/edges/cadena-identidad.ts`), así que declararlo en `needsEdges`
  // apagaría el detector ENTERO en ese lenguaje aunque `instantiates` sí
  // esté — exactamente lo que este archivo existe para NO hacer.
  "scattered-instantiation": ["extends", "implements", "satisfies", "contains", "stores", "references", "calls"],
};

describe("compuerta mecánica: todo EdgeKind que un detector inter-file toca está declarado o excluido con razón", () => {
  const interFileDetectors = DETECTORS.filter((d) => d.scope === "inter-file");

  it("invariante: hay detectores inter-file registrados (si esto falla, el resto del archivo no prueba nada)", () => {
    expect(interFileDetectors.length).toBeGreaterThan(0);
  });

  for (const detector of interFileDetectors) {
    it(`${detector.id}: ningún EdgeKind leído en el archivo queda sin declarar ni excluir`, () => {
      const filePath = path.join(INTER_FILE_DIR, `${detector.id}.ts`);
      const source = fs.readFileSync(filePath, "utf8");
      const touched = extractTouchedEdgeKinds(source);

      const declared = new Set<string>([
        ...((detector as { needsEdges?: readonly string[] }).needsEdges ?? []),
        ...((detector as { needsAnyEdge?: readonly string[] }).needsAnyEdge ?? []),
      ]);
      const excluded = new Set<string>(DELIBERATELY_EXCLUDED[detector.id] ?? []);

      const unaccounted = [...touched].filter((k) => !declared.has(k) && !excluded.has(k)).sort();

      expect(
        unaccounted,
        unaccounted.length === 0
          ? ""
          : `${detector.id} lee ${JSON.stringify(unaccounted)} (comparado con \`.kind\` o listado en un array/Set ` +
              `del propio archivo) sin declararlo en \`needsEdges\`/\`needsAnyEdge\` ni en \`DELIBERATELY_EXCLUDED\` ` +
              `de este test. Si el detector NECESITA esa arista (sola o junto con otras) para encontrar algo, agregala ` +
              `a \`needsEdges\` (conjunción) o \`needsAnyEdge\` (alternativa) en el detector — ver ` +
              `\`types.ts#InterFileDetector.needsAnyEdge\` para el criterio. Si sólo la usa para ajustar confianza/` +
              `severidad o para excluir candidatos, documentá la razón acá, en \`DELIBERATELY_EXCLUDED\`.`,
      ).toEqual([]);
    });
  }
});
