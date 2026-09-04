/**
 * Stable ids for the `CodeFinding`s `code-analyzer.ts` emits — F2 needs a
 * stable id to key `code_finding_decisions` by, and CONTRATOS.md §1.4
 * already specifies and `detect/ids.ts` already implements exactly that
 * algorithm. This module reuses `findingId` from there rather than
 * inventing a second one: same hash, same "no line numbers, no metric
 * value, no severity" guarantee, so editing a file — or a count moving from
 * 48 to 51 members — never mints a new id and never orphans a discard.
 *
 * `kind` stands in for `detectorId`: `CodeFinding` does not carry one
 * directly, and this is the closest stable identifier it already carries.
 * `CodeLocation` does not have `detect/types.ts`'s `RoleLocation.anchor`, so
 * the anchor is built directly from `file` + `symbol` — the exact fallback
 * `deriveAnchor` uses when a `RoleLocation` lacks one.
 */
import crypto from "node:crypto";

import { findingId } from "./detect/ids.js";
import type { Anchor } from "./detect/types.js";
import type { CodeFinding } from "../../shared/types.js";

function locationAnchor(file: string, symbol: string | undefined): Anchor {
  return { file, symbolPath: symbol ? [symbol] : [] };
}

export function stableFindingId(finding: CodeFinding): string {
  const anchors = finding.locations.map((l) => locationAnchor(l.file, l.symbol));
  return findingId(finding.kind, undefined, anchors);
}

/* ────────────────────────────────────────────────────────────────────────
 * ANCLA CON ORDINAL DE LECTURA — Ola AJ, frente AJ1
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * EL DEFECTO QUE ESTO ARREGLA, y por qué NO alcanzaba con arreglar los
 * detectores — medido, no razonado.
 *
 * `detect/types.ts#RoleLocation.anchor` existe exactamente para que un
 * detector pueda decir "la identidad de esta ubicación es ÉSTA y no
 * `(archivo, símbolo)`", y `detect/ids.ts#serializeAnchor` ya sabe escribir
 * el ordinal (`archivo#a.b@n`). TRES detectores lo usan, cada uno con su
 * medición escrita en su propio docstring:
 * `intra-function/type-switch.ts` ("sin ordinal 44 de 331 ids se repetían"),
 * `intra-file/temporary-field.ts` ("sin ordinal, 24 de 195 ids se repetían")
 * y `intra-file/enumerated-field-dispatch.ts`.
 *
 * **Y ninguno de los tres llega al id que se juzga.** `code-analyzer.ts`
 * (`toCodeFinding`) TIRA el `anchor` — su propio docstring lo declara: "`role`
 * /`anchor`/`id`/`detectorId`/`scope`/`language` … are dropped here" — y
 * `stableFindingId`, arriba, vuelve a derivar el ancla de `(archivo,
 * símbolo)`. El ordinal que el detector calculó NO PUEDE llegar a la salida
 * POR CONSTRUCCIÓN. Medido sobre los 21 repos del corpus, volcado del
 * 21-08-2026: `temporary-field` sigue publicando **exactamente 24 filas sin
 * dirección propia en las 13 bibliotecas** — el mismo dígito que su docstring
 * dice haber arreglado.
 *
 * QUÉ HACE ESTA FUNCIÓN: acuña el id del k-ésimo hallazgo (k >= 1) de un
 * conjunto que compartía ancla, poniéndole `ordinal: k` a TODAS sus anclas y
 * pasándolo por el MISMO `findingId` de siempre. El id resultante es una
 * función pura del ancla —`(kind, archivo, símbolo, ordinal)`— igual que
 * cualquier otro: quien tenga el ancla lo reproduce, y `serializeAnchor` ya
 * sabe leerla. No es un id sintético paralelo.
 *
 * POR QUÉ EL ORDINAL Y NO LA LÍNEA: CONTRATOS.md §1.4 prohíbe la línea en el
 * id (editar un archivo no puede acuñar un id nuevo ni huerfanar un
 * descarte). El ordinal de lectura es la única señal que distingue dos
 * hallazgos del mismo kind, archivo y símbolo sin meter la línea. Lo que se
 * debilita queda declarado: insertar un hallazgo del mismo kind POR ENCIMA de
 * los colisionados les corre el ordinal. Es el mismo intercambio que
 * `desambiguarIdsRepetidos` documenta un piso más abajo, y se paga sólo en
 * los hallazgos que HOY no tienen id propio en absoluto.
 */
export function idPorOrdinalDeLectura(finding: CodeFinding, ordinal: number): string {
  const anchors = finding.locations.map((l) => ({ ...locationAnchor(l.file, l.symbol), ordinal }));
  return findingId(finding.kind, undefined, anchors);
}

/* ────────────────────────────────────────────────────────────────────────
 * DESAMBIGUACIÓN DE IDS REPETIDOS — Ola AI, frente AI3
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * EL DEFECTO QUE ESTO ARREGLA, con archivo y línea, y NO es sólo de
 * direccionamiento: HOY SE PIERDE UN HALLAZGO.
 *
 * `detect/ids.ts#findingId` hashea `(detectorId, variant, anclas)` y
 * `deriveAnchor` arma el ancla con `(file, symbol)` — NUNCA con la línea, a
 * propósito (CONTRATOS.md §1.4: editar un archivo no puede acuñar un id
 * nuevo). Consecuencia directa: dos hallazgos DISTINTOS del mismo detector,
 * en el mismo archivo y con el mismo `symbol`, reciben EL MISMO `Finding.id`.
 * Pasa por tres gramáticas distintas y no es una rareza:
 *
 *   · dos miembros con el MISMO NOMBRE en el mismo archivo — sobrecargas de
 *     Java, dos métodos homónimos de dos clases del mismo archivo, dos
 *     funciones internas homónimas;
 *   · `symbol` VACÍO — el detector no nombra símbolo y todas las ubicaciones
 *     del archivo colapsan en una;
 *   · función ANÓNIMA — el detector escribe un literal fijo como símbolo
 *     (p. ej. `intra-function/complexity.ts`, `fn.name ?? "(anónima)"`), así
 *     que TODAS las anónimas de un archivo comparten ancla.
 *
 * Y lo que lo vuelve pérdida y no molestia:
 *
 *   · `code-analyzer.ts#crossAnalyze` arma `codeById = new Map(...)` y un
 *     `Map` ante clave repetida SE QUEDA CON LA ÚLTIMA; después
 *     `toGroupedCodeFinding` resuelve CADA grupo por `codeById.get(id)`, de
 *     modo que los N grupos rinden EL MISMO `CodeFinding`. En un volcado eso
 *     se ve como N filas byte a byte idénticas, y los otros N-1 hallazgos
 *     reales desaparecen de la salida.
 *   · `graph/finding-nodes.ts#attachFindingNodes` deduplica por
 *     `finding:${id}` (`seenFindingNodeIds`): N hallazgos colisionados
 *     producen UN SOLO nodo de grafo, así que las hipótesis que miran el
 *     vecindario ven uno donde hay N.
 *
 * POR QUÉ VIVE ACÁ Y NO EN CADA DETECTOR: `type-switch.ts` y
 * `temporary-field.ts` ya resolvieron su parte con un `Anchor.ordinal`
 * propio, cada uno puertas adentro y con su medición escrita. Esto es la red
 * de seguridad GENÉRICA para todos los demás: se aplica sobre la lista
 * completa de `rawFindings`, después de que los detectores hicieron lo suyo,
 * y sólo toca lo que quedó repetido.
 *
 * POR QUÉ ES ADITIVO — la propiedad de la que depende todo lo demás:
 * dentro de un grupo repetido, **el primero conserva su id BYTE A BYTE**. El
 * conjunto de ids de salida es un SUPERCONJUNTO del de hoy: ningún id
 * desaparece (ningún veredicto humano queda huérfano) y aparecen los que
 * faltaban. Si en cambio los N recibieran ids nuevos, todo veredicto colgado
 * de ese id quedaría sin resolver.
 *
 * QUÉ SE DEBILITA, DECLARADO Y NO ESCONDIDO: para los miembros 2..N la
 * garantía de CONTRATOS.md §1.4 se debilita — insertar una función por
 * encima de ellos corre el ordinal y les acuña un id nuevo. Es un
 * intercambio consciente: hoy esos hallazgos no tienen id propio EN
 * ABSOLUTO y encima uno de ellos ni siquiera sale. Para los hallazgos con id
 * único, que son la enorme mayoría, la garantía queda intacta: esta función
 * no los toca.
 */

/** Lo mínimo que esta pasada necesita ver de un hallazgo. Deliberadamente estructural: sirve igual a `Finding` (nivel 1) que a cualquier otra fila con id y ubicación. `id` es mutable a propósito — ver `desambiguarIdsRepetidos`. */
export interface DesambiguableFinding {
  id: string;
  readonly title: string;
  readonly locations: readonly { readonly file: string; readonly startLine: number; readonly endLine: number }[];
}

/**
 * Id derivado para el k-ésimo miembro (k >= 1) de un grupo que comparte id.
 *
 * Forma: `${prefijo}:${sha1(idViejo + " dup" + k)}` en base64url, 16 chars —
 * EXACTAMENTE la misma forma que produce `detect/ids.ts#findingId`
 * (`${detectorId}:${16 chars}`), para que ningún consumidor que valide el
 * formato del id (hay tests que lo hacen con `/^kind:[A-Za-z0-9_-]{16}$/`)
 * vea algo distinto. No se reusa `findingId` con un `variant` sintético
 * porque `variant` es un campo REAL de los detectores y meter ahí un valor
 * inventado podría chocar con uno legítimo.
 */
export function idDesambiguado(idOriginal: string, k: number): string {
  const prefijo = idOriginal.slice(0, idOriginal.indexOf(":") + 1);
  const hash = crypto.createHash("sha1").update(`${idOriginal} dup${k}`, "utf8").digest().toString("base64url").slice(0, 16);
  return `${prefijo}${hash}`;
}

/**
 * ORDEN DE LECTURA — el criterio con el que se decide quién conserva el id.
 *
 * Dentro de un grupo colisionado TODOS los miembros comparten
 * `(kind, archivo, símbolo)`: lo único que los separa para un humano es
 * DÓNDE están, y quien juzga abre el archivo en una línea. Por eso el orden
 * es el orden de aparición en el código. `title` y el índice original entran
 * sólo como desempate determinista, para que dos corridas sobre el mismo
 * árbol produzcan siempre la misma asignación.
 */
/** Lo único que `ordenDeLectura` mira. Estructural a propósito: lo cumplen `DesambiguableFinding` (nivel 1) y `CodeFinding` (la salida), y así el criterio de "quién conserva el id" es UNO SOLO en los dos pisos. */
interface OrdenableFinding {
  readonly title: string;
  readonly locations: readonly { readonly file: string; readonly startLine: number; readonly endLine: number }[];
}

function ordenDeLectura(a: { f: OrdenableFinding; i: number }, b: { f: OrdenableFinding; i: number }): number {
  const la = a.f.locations[0];
  const lb = b.f.locations[0];
  const fa = la?.file ?? "";
  const fb = lb?.file ?? "";
  if (fa !== fb) return fa < fb ? -1 : 1;
  const sa = la?.startLine ?? 0;
  const sb = lb?.startLine ?? 0;
  if (sa !== sb) return sa - sb;
  const ea = la?.endLine ?? 0;
  const eb = lb?.endLine ?? 0;
  if (ea !== eb) return ea - eb;
  if (a.f.title !== b.f.title) return a.f.title < b.f.title ? -1 : 1;
  return a.i - b.i;
}

/** Qué pasó en una corrida de `desambiguarIdsRepetidos` — para que quien la llame pueda declarar su delta sin volver a contar. */
export interface DesambiguacionReport {
  /** Cuántos ids nombraban a más de un hallazgo. */
  idsRepetidos: number;
  /** Cuántos hallazgos vivían bajo un id repetido (incluye al que lo conserva). */
  hallazgosImplicados: number;
  /** Cuántos hallazgos recibieron un id nuevo. Es `hallazgosImplicados - idsRepetidos`. */
  idsAcunados: number;
}

/**
 * Reescribe EN EL SITIO el `id` de los hallazgos que comparten uno, y
 * devuelve el conteo de lo que hizo. No toca ningún otro campo, no cambia el
 * orden, no agrega ni saca hallazgos.
 *
 * POR QUÉ MUTA Y NO DEVUELVE COPIAS — y esto NO es una comodidad, es la
 * única versión correcta. `crossAnalyze` arma `rawFindings` juntando
 * `perFileFindings` e `interFile.findings`, y DESPUÉS de ese punto sigue
 * colgándoles hipótesis MUTANDO esos mismos objetos, pero a través de los
 * arreglos ORIGINALES: `attachHypotheses(interFile.findings)`,
 * `rebuildHypothesesWithGraph` y `refreshHypotheses(perFileFindings)`. Una
 * versión pura que devolviera `{...f, id}` dejaría a `rawFindings` con
 * COPIAS congeladas en el instante de la mezcla, y todas esas hipótesis
 * —incluidas las `inter-file`, que se cuelgan enteras después— se perderían
 * en silencio. Exactamente la clase de pérdida que este frente vino a
 * arreglar. Mutar el `id` deja un solo objeto por hallazgo, que es lo que el
 * resto del pipeline ya asume.
 *
 * Y es idempotente: correrla dos veces sobre la misma lista no cambia nada la
 * segunda vez, porque después de la primera ya no hay ids repetidos.
 */
export function desambiguarIdsRepetidos(findings: readonly DesambiguableFinding[]): DesambiguacionReport {
  const porId = new Map<string, { f: DesambiguableFinding; i: number }[]>();
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i]!;
    const grupo = porId.get(f.id);
    if (grupo) grupo.push({ f, i });
    else porId.set(f.id, [{ f, i }]);
  }

  const aRenombrar: { f: DesambiguableFinding; id: string }[] = [];
  let idsRepetidos = 0;
  let hallazgosImplicados = 0;
  for (const grupo of porId.values()) {
    if (grupo.length < 2) continue;
    idsRepetidos++;
    hallazgosImplicados += grupo.length;
    const ordenados = [...grupo].sort(ordenDeLectura);
    // `k = 0` NO se toca: es el que conserva el id original. Ver el docstring
    // de arriba — de eso depende que el cambio sea aditivo.
    for (let k = 1; k < ordenados.length; k++) aRenombrar.push({ f: ordenados[k]!.f, id: idDesambiguado(ordenados[k]!.f.id, k) });
  }

  const report = { idsRepetidos, hallazgosImplicados, idsAcunados: hallazgosImplicados - idsRepetidos };
  if (aRenombrar.length === 0) return report;

  // Última red: un id acuñado no puede chocar con NINGÚN id de la corrida
  // (ni con uno original ni con otro acuñado). sha1 lo hace astronómicamente
  // improbable, pero "improbable" no es "verificado" y esto es barato.
  const vistos = new Set(findings.map((f) => f.id));
  for (const { f, id } of aRenombrar) {
    let candidato = id;
    let intento = 1;
    while (vistos.has(candidato)) candidato = idDesambiguado(id, 1000 + intento++);
    vistos.add(candidato);
    f.id = candidato;
  }
  return report;
}

/** Qué hizo `conIdsEstables` — para que quien la llame pueda declarar su delta sin volver a contar. */
export interface IdsDeSalidaReport {
  /** Cuántos ids de SALIDA nombraban a más de una fila. */
  idsRepetidos: number;
  /** Cuántas filas vivían bajo un id repetido (incluye la que lo conserva). */
  filasImplicadas: number;
  /** Cuántas filas reciben un id nuevo. Es `filasImplicadas - idsRepetidos`. */
  idsAcunados: number;
}

/**
 * ESTAMPA EL ID DE SALIDA SOBRE LA LISTA COMPLETA, y desambigua las filas que
 * compartirían uno. Es la ÚNICA versión de `stableFindingId` que puede
 * distinguir dos hallazgos, porque la ambigüedad no es visible desde UNA fila:
 * hace falta ver a las hermanas.
 *
 * POR QUÉ ES ADITIVA, y de esto depende todo lo demás: dentro de un conjunto
 * que comparte id **la primera EN ORDEN DE LECTURA conserva su id BYTE A
 * BYTE**. El conjunto de ids de salida es un SUPERCONJUNTO del de hoy —
 * NINGÚN id desaparece— así que ningún veredicto de nivel 1 ni ninguna
 * planilla de precisión que cruce por id deja de resolver, y la compuerta de
 * recall (que cruza por id) no puede perder nada. Lo que aparece son los ids
 * que faltaban.
 *
 * LO QUE SÍ SE MUEVE, MEDIDO Y NO ESTIMADO (21 repos, volcado del 21-08-2026):
 * 1.487 filas pasan a tener dirección propia (331 en bibliotecas · 1.156 en
 * aplicaciones) y las claves `<id>::<Patrón>` distintas suben de 2.970 a 3.047
 * en bibliotecas y de 5.211 a 5.482 en aplicaciones. **16 claves de nivel 2
 * dejan de resolver** —13 `falso`, 2 `verdadero`, 1 `dudoso`— y son
 * exactamente aquéllas cuyo PATRÓN no lo cuelga la fila que conserva el id
 * sino una hermana; las 16 tienen destino ÚNICO verificado (14 por tener un
 * solo candidato, 2 por la ubicación que el propio juez escribió). La tabla de
 * migración va en `claude-kanban-docs/ola-aj/informes/AJ1.md`.
 *
 * NO REORDENA: devuelve un arreglo nuevo en el MISMO orden que recibió. El
 * orden de lectura se usa sólo para decidir quién conserva el id.
 *
 * NO DEPENDE DE LA PAGINACIÓN: quien la llame tiene que pasarle la lista
 * COMPLETA, antes de cualquier corte. Si se aplicara sobre una página, la
 * misma fila recibiría ids distintos según el `offset` pedido — el defecto
 * exacto que este módulo existe para no tener.
 */
export function conIdsEstables(findings: readonly CodeFinding[]): { findings: CodeFinding[]; report: IdsDeSalidaReport } {
  // Copia SIEMPRE, aunque la fila ya traiga id: abajo se muta `id`, y mutar el
  // objeto de quien llama sería un efecto lateral invisible desde la firma.
  const conId: CodeFinding[] = findings.map((f) => ({ ...f, id: f.id ?? stableFindingId(f) }));

  const porId = new Map<string, { f: CodeFinding; i: number }[]>();
  for (let i = 0; i < conId.length; i++) {
    const f = conId[i]!;
    const grupo = porId.get(f.id!);
    if (grupo) grupo.push({ f, i });
    else porId.set(f.id!, [{ f, i }]);
  }

  const aRenombrar: { f: CodeFinding; id: string }[] = [];
  let idsRepetidos = 0;
  let filasImplicadas = 0;
  for (const grupo of porId.values()) {
    if (grupo.length < 2) continue;
    idsRepetidos++;
    filasImplicadas += grupo.length;
    const ordenados = [...grupo].sort(ordenDeLectura);
    // `k = 0` NO se toca: es la que conserva el id original, y de eso depende
    // que el cambio sea aditivo. Ver el docstring de arriba.
    for (let k = 1; k < ordenados.length; k++) {
      const f = ordenados[k]!.f;
      aRenombrar.push({ f, id: idPorOrdinalDeLectura(f, k) });
    }
  }

  const report = { idsRepetidos, filasImplicadas, idsAcunados: filasImplicadas - idsRepetidos };
  if (aRenombrar.length === 0) return { findings: conId, report };

  // Última red, igual que en `desambiguarIdsRepetidos`: un id acuñado no puede
  // chocar con NINGÚN id de la corrida. sha1 lo hace astronómicamente
  // improbable, pero "improbable" no es "verificado" y esto es barato.
  const vistos = new Set(conId.map((f) => f.id!));
  for (const { f, id } of aRenombrar) {
    let candidato = id;
    let intento = 1;
    while (vistos.has(candidato)) candidato = idDesambiguado(id, 1000 + intento++);
    vistos.add(candidato);
    f.id = candidato;
  }
  return { findings: conId, report };
}

/**
 * IDENTIDAD DE CONTENIDO — para `detect/precision/**` únicamente. NO reemplaza
 * `stableFindingId` (el contrato de F2, del que dependen los discards y que
 * NINGÚN otro consumidor puede ver cambiar de significado): ese id incluye
 * TODAS las ubicaciones de un hallazgo, así que un detector que empieza a
 * adjuntar (o dejar de adjuntar) una ubicación secundaria — sin cambiar nada
 * de lo que un humano LEE — cambia el hash entero. Caso medido: dos cadenas
 * `demeter-chain` de preact (`compat/src/suspense.js:45`, `detachedClone` y
 * `hooks/src/index.js:248`, `useReducer`) con MISMO kind/file/symbol/title/
 * detail/evidence en dos corridas distintas, pero id distinto — el veredicto
 * humano ("verdadero", con nota) quedó huérfano bajo el id viejo mientras el
 * hallazgo (idéntico a los ojos de quien lo juzgó) seguía vivo bajo uno nuevo.
 *
 * Por qué (kind, file, symbol, title) — y no menos: la integración anterior
 * cruzaba por (kind, archivo, símbolo) a mano, pero eso COLISIONA de verdad en
 * este corpus — `coupling-without-abstraction` y `duplication` emiten varios
 * hallazgos reales y DISTINTOS por (kind, file, símbolo="") (un archivo puede
 * acoplarse sin abstracción a VARIOS otros, o duplicar con VARIOS otros) y
 * `title` es, medido contra las 9 planillas del corpus, el campo que los
 * distingue (0 colisiones falsas de 51 grupos con contenido distinto — el
 * único grupo restante, `unused-symbol` de `click`, no es una colisión: son
 * dos corridas del MISMO hallazgo agregado con su conteo actualizado, que es
 * exactamente el caso que esto tiene que reconciliar).
 *
 * Por qué no más — no lleva `detail`/`evidence`: ambos pueden cambiar de
 * REDACCIÓN (una plantilla que se reescribe, un conteo agregado que sube o
 * baja) sin que el hallazgo deje de ser, para quien lo juzgó, el mismo. Esta
 * clave nunca se persiste (se recalcula en memoria en cada corrida de
 * `mergeRows`/`sample-findings-for-judgment.mts`) y nunca reemplaza `id` en la
 * planilla — sólo decide, dentro de una reconciliación, qué fila vieja
 * corresponde a qué hallazgo vivo.
 */
export interface FindingContentIdentity {
  kind: string;
  file: string;
  symbol: string;
  title: string;
}

/** Separador NUL, no espacio: `file`/`symbol`/`title` son texto libre y pueden contener
 * espacios -- un separador que tambien puede aparecer DENTRO de un campo dejaria que dos
 * tuplas distintas concatenaran al mismo string. */
export function contentFindingKey(identity: FindingContentIdentity): string {
  return [identity.kind, identity.file, identity.symbol, identity.title].join("\u0000");
}

/** `contentFindingKey` a partir de un `CodeFinding` real — usa la PRIMERA ubicación, la misma que `detect/precision/sample.ts#toPrecisionRow` vuelca a la planilla (así que la clave siempre se puede recalcular igual de un lado y del otro). */
export function contentKeyForFinding(finding: CodeFinding): string {
  const loc = finding.locations[0];
  return contentFindingKey({ kind: finding.kind, file: loc?.file ?? "", symbol: loc?.symbol ?? "", title: finding.title });
}
