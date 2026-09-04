/**
 * `impact` — CONTRATO-F5.md §1.4. Cuánto importa el PROBLEMA que detecta un
 * detector, no cuánto de él haya en este repo. Una constante por
 * `detectorId`, declarada a mano, una línea por detector, orden alfabético
 * (mismo patrón de choque mínimo que `registry.ts`/`graph/metrics/registry.ts`).
 *
 * REGLAS DURAS (repetidas del contrato, para quien edite esto sin haberlo
 * leído):
 *   - NO se calibra contra el corpus. Es un juicio de producto, auditado por
 *     `impact.test.ts` (exhaustividad sobre `DETECTORS`), no por un barrido.
 *     Calibrarlo contra volumen medido reproduciría exactamente el sesgo que
 *     CONTRATO-F5 corrige (que "aparece mucho" pase por "importa mucho").
 *   - Un tier no se mueve para que un número de §1.7 (M1/M2/M5) pase. Si el
 *     barrido sólo pasa moviendo un tier, el veredicto es que la fórmula no
 *     sirve, no que el tier estaba mal.
 *
 * Los CUATRO TIERS, con el criterio de cada uno (CONTRATO-F5.md §1.4):
 *   - `correccion` (1.00): puede ser un bug HOY, no deuda a futuro.
 *   - `arquitectura` (0.75): limita CÓMO se puede cambiar el sistema —
 *     todos los ejemplos del contrato son inter-file: el problema no vive
 *     en un lugar, vive en la relación entre lugares.
 *   - `mantenibilidad` (0.50): cuesta LEERLO y CAMBIARLO, pero no impide
 *     nada estructuralmente. El bucket más grande: la mayoría de los
 *     smells de diseño clásicos (Fowler) — cuestan lectura, no rompen nada.
 *   - `higiene` (0.25): real pero barato y LOCAL — un fix mecánico de una
 *     función, sin blast radius sobre el resto del repo.
 *
 * Los detectores QUE EL CONTRATO YA EJEMPLIFICA usan exactamente su tier
 * dado ahí. Los seis que el contrato no ejemplifica (`boolean-complexity`,
 * `conditional-chain`, `data-clump`, `primitive-obsession`, `refused-bequest`,
 * `repeated-switch`) se deciden acá por el mismo criterio: los seis son
 * smells de diseño clásicos que cuestan lectura/cambio sin limitar por sí
 * solos cómo evoluciona el sistema (a diferencia de un ciclo de dependencia
 * o un archivo huérfano) → `mantenibilidad`, la misma categoría que
 * `complexity`/`feature-envy-intra`/`demeter-chain`, con los que comparten
 * naturaleza (cuesta razonar sobre el código, no un bug ni un candado
 * arquitectónico).
 */
export type ImpactTier = "correccion" | "arquitectura" | "mantenibilidad" | "higiene";

export const IMPACT_TIER_VALUE: Readonly<Record<ImpactTier, number>> = {
  correccion: 1.0,
  arquitectura: 0.75,
  mantenibilidad: 0.5,
  higiene: 0.25,
};

/**
 * Una línea por `detectorId` registrado, alfabético. `impact.test.ts` exige
 * exhaustividad exacta contra `DETECTORS` (`registry.ts`): ni falta ni sobra
 * ninguna — un detector nuevo que no agregue su línea acá falla ese test,
 * nunca cae en un default silencioso.
 */
export const DETECTOR_IMPACT: Readonly<Record<string, ImpactTier>> = {
  "argument-mutation": "correccion",
  "boolean-complexity": "mantenibilidad",
  "boolean-flag-param": "higiene",
  // Ola AU (AU6): el remedio no admite discusión — borrar el bloque, el
  // historial ya lo guarda. Mecánico, local, sin firma ni llamador que
  // tocar: mismo tier que `boolean-flag-param`/`many-returns`.
  "commented-out-code": "higiene",
  complexity: "mantenibilidad",
  // DIP violation A -> B concreto habiendo I disponible: la relación vive
  // entre A/B/I, no en ninguno de los tres por separado.
  "concrete-over-abstraction": "arquitectura",
  "conditional-chain": "mantenibilidad",
  "data-clump": "mantenibilidad",
  "dependency-cycle": "arquitectura",
  // Mismo fingerprint estructural que `duplication` (ya arquitectura); la
  // variante "sin camino en el grafo" es, si acaso, más difícil de
  // descubrir para quien la escribió, no menos arquitectónica.
  "distributed-duplication": "arquitectura",
  duplication: "arquitectura",
  "empty-catch": "correccion",
  // Ola AE (AE5): un solo sitio reparte la misma solicitud entre N destinos que
  // NADIE MÁS enumera. El costo no es local —la función puede leerse bien— sino
  // estructural y verificado con el grafo: mientras la elección viva ahí, cada
  // destino nuevo obliga a editar ese sitio, y ese sitio es el único punto del
  // repo que sabe que la familia existe. Mismo tier, y por el mismo motivo, que
  // `repeated-collaborator-set`: la evidencia es una relación entre símbolos,
  // no el contenido de un archivo.
  "exclusive-dispatch-ladder": "arquitectura",
  // La representación interna de un tipo —cómo guarda sus elementos— se
  // recorre a mano desde varios archivos que no son el suyo: el defecto no es
  // la legibilidad de ningún cuerpo, es que un detalle de representación se
  // volvió un contrato público de hecho y cambiarlo obliga a tocar a todos sus
  // clientes. Evidencia: una relación entre símbolos de archivos distintos,
  // igual que `repeated-collaborator-set` y `exclusive-dispatch-ladder`.
  "exposed-container-traversal": "arquitectura",
  // Hub con fan-out alto y vecinos que no se conocen entre sí: el defecto
  // es el rol estructural del archivo frente a sus dependencias, no su
  // contenido local.
  "fanout-without-cohesion": "arquitectura",
  // Kerievsky, Refactoring to Patterns cap. 8: un acumulador con ≥3 capas
  // condicionales apiladas cuesta lectura y cambio (cada combinación nueva
  // exige tocar la misma función), pero no traba nada estructuralmente
  // fuera de ella — misma naturaleza que `boolean-complexity`/`conditional-chain`.
  "flag-accumulator": "mantenibilidad",
  // Hub-Like Dependency (Arcan/Pigazzini et al.): fan-in y fan-out altos
  // simultáneos hacen del archivo un cuello de botella por el que casi
  // todo cambio del repo termina pasando.
  "god-component": "arquitectura",
  // OLA AE (frente AE3) — ancla-FUERZA de Abstract Factory: `arquitectura`, el
  // MISMO tier que `parallel-hierarchies`, la otra ancla del patron. Lo que
  // describe no vive en un lugar: vive en la RELACION entre varios lugares que
  // eligen, cada uno por su cuenta, la misma combinacion de variantes. Agregar
  // una familia obliga a tocar todos esos lugares a la vez, que es exactamente
  // la traba estructural que el contrato reserva para este tier — y no la
  // legibilidad de un cuerpo, que seria `mantenibilidad`.
  "hardwired-subtype-combination": "arquitectura",
  // OLA AE (frente AE11) — ancla-FUERZA de Observer: `arquitectura`, y NO el
  // `mantenibilidad` de su hermana vieja `manual-notification`, con la que
  // comparte familia pero no consecuencia. `manual-notification` describe UN
  // cableado repetido dentro de una clase (cuesta lectura, no traba nada fuera
  // de ella). Este kind describe que la LISTA DE INTERESADOS está soldada en
  // varios puntos de cambio del dueño del estado: agregar un interesado obliga
  // a tocarlos todos, y el dueño del estado queda amarrado por nombre a cada
  // uno de sus destinatarios. Es el mismo candado que `scattered-instantiation`
  // (`arquitectura`) — un conjunto de sitios fijos que traba introducir un
  // punto único sin tocarlos a todos —, no la legibilidad de un cuerpo.
  "hard-wired-notification": "arquitectura",
  // Ola 11a (P2): evidencia ESTRUCTURAL, no un problema — un reenvío
  // homónimo a un colaborador propio es la mitad de un Decorator/Proxy/
  // Composite ya aplicado o ad hoc (CONTRATO-F10.md §0.4). Mismo
  // razonamiento de tier que `lazy-init-repetida`/`manual-notification`:
  // intra-clase, cuesta lectura, no traba nada fuera de la clase.
  "homonymous-delegation": "mantenibilidad",
  // OLA AE (frente AE8) — `arquitectura`, y NO el `mantenibilidad` de su
  // hermana `homonymous-divergent-sequence`, con la que comparte forma pero no
  // consecuencia. Lo que este kind describe es que la elección del TIPO
  // CONCRETO que se construye está soldada dentro de cada hermano de una
  // familia repartida en varios archivos: cada variante nueva obliga a copiar
  // el procedimiento entero en un archivo más. Es el mismo candado que
  // `scattered-instantiation` (`arquitectura`): un sitio de construcción fijo
  // que traba introducir un punto de creación sin tocar a todos ellos — no la
  // legibilidad de un cuerpo, que es lo que mide `mantenibilidad`.
  "homonymous-divergent-construction": "arquitectura",
  // Ola AC (AC3): la misma secuencia de pasos escrita en varios hermanos con
  // pasos propios. A diferencia de `inheritance-family`/`homonymous-delegation`
  // —que son evidencia estructural pura— acá SÍ hay repetición real que cuesta
  // lectura y cambio (tocar el orden obliga a tocar N cuerpos), pero sigue
  // encerrada en una familia de un archivo: no traba nada fuera de ella.
  "homonymous-divergent-sequence": "mantenibilidad",
  // A conoce la organización interna de B varios niveles adentro de su
  // carpeta: traba cómo se puede reorganizar B sin romper a A. Mismo
  // criterio y fórmula que `layer-skip`.
  "import-depth-demeter": "arquitectura",
  // Ola 11a (P2): evidencia ESTRUCTURAL, no un problema — una familia de
  // subclases con base común en el mismo archivo es la mitad de un
  // Template Method (u otra jerarquía compartida) ya aplicado, parcial o
  // ausente. Mismo tier que `homonymous-delegation`, mismo razonamiento.
  "inheritance-family": "mantenibilidad",
  // OLA AE (frente AE6) — `arquitectura`, y por la MISMA razón por la que
  // `repeated-collaborator-set` lo es: lo que describe es cómo están repartidas
  // las dependencias entre módulos —un tratamiento invariante copiado en cada
  // lugar, con la operación soldada a cada copia—, no la legibilidad de un
  // cuerpo. Agregar una operación nueva obliga a escribir otra copia del
  // tratamiento en otro archivo: es una traba estructural, no de lectura.
  "invariant-scaffold-varying-call": "arquitectura",
  "large-class": "mantenibilidad",
  // STOPGAP (agente de Proxy, Ola 10): entrada mínima agregada para poder
  // correr `analyzeRepo`/`scoreFindings` sobre el corpus (que exige
  // exhaustividad total contra `DETECTORS`, ver `impactOf` abajo) mientras el
  // agente de Observer (dueño real de `manual-notification`, mismo patrón
  // intra-file que `lazy-init-repetida`) todavía no agregó la suya. Mismo
  // razonamiento que `flag-accumulator`/`lazy-init-repetida`: repetición
  // intra-clase, cuesta lectura y cambio, no traba nada fuera de la clase —
  // el dueño real puede ajustar el tier si su propio criterio difiere.
  "manual-notification": "mantenibilidad",
  // Salta la superficie de un módulo para tocar su interior: traba cómo
  // se puede reorganizar ese módulo sin romper a quien lo saltea. Mismo
  // criterio y fórmula que `import-depth-demeter`.
  "layer-skip": "arquitectura",
  // Intra-file (una clase, un archivo): cuesta lectura y cambio (cada
  // sitio nuevo que toque el campo repite la guarda o el reenvío por su
  // cuenta), pero no es un candado inter-file como `scattered-instantiation`
  // — misma naturaleza que `data-clump`/`large-class`, no la de un problema
  // que viva en la relación ENTRE archivos.
  "lazy-init-repetida": "mantenibilidad",
  "long-function": "mantenibilidad",
  "long-parameter-list": "higiene",
  "many-returns": "higiene",
  // Ola AD (AD3): capacidades opcionales elegidas desde afuera y consultadas
  // como guarda en varias operaciones de la MISMA unidad-tipo. Cuesta lectura
  // y cambio (agregar una capacidad obliga a tocar la unidad entera y a que
  // quien la usa se entere), pero queda encerrado en esa unidad: no traba
  // nada fuera de ella. Mismo tier y mismo razonamiento que `flag-accumulator`,
  // con el que comparte naturaleza (banderas opcionales tejidas en el código).
  "optional-behavior-flags": "mantenibilidad",
  // OLA AE (frente AE4) — ancla-FUERZA de Builder: `arquitectura`, y NO el
  // `higiene` de su hermana vieja `long-parameter-list`, con la que comparte
  // patrón pero no consecuencia. `long-parameter-list` describe UNA firma que
  // cuesta recordar: un fix local y mecánico, sin blast radius. Este kind
  // describe que la COMBINATORIA de construcción de una entidad está resuelta a
  // mano en N sitios repartidos por el repo: agregar una ranura opcional obliga
  // a que cada uno de esos sitios se entere, y no hay ningún punto por el que
  // pasar para cambiarlo. Es el mismo candado que `scattered-instantiation`
  // (`arquitectura`) — un conjunto de sitios de construcción fijos que traba
  // introducir un punto único sin tocarlos a todos —, no la legibilidad de un
  // cuerpo, que es lo que mide `mantenibilidad`. La evidencia es, además, una
  // relación entre símbolos de archivos distintos, igual que en
  // `repeated-collaborator-set`.
  "optional-construction-combinations": "arquitectura",
  "orphan-file": "arquitectura",
  "primitive-obsession": "mantenibilidad",
  // OLA AE (frente AE7) — ancla-FUERZA de Composite: varias operaciones del
  // mismo dueño deciden a mano si son hoja o compuesto antes de descender
  // sobre la misma colección. Es intra-clase (la decisión y el recorrido
  // viven adentro del mismo dueño) y cuesta lectura y cambio — cada
  // operación nueva vuelve a escribir la decisión —, pero no traba nada
  // fuera de esa unidad. Mismo tier y mismo razonamiento que
  // `self-referential-member`, la otra ancla de Composite.
  "recursive-collection-descent": "mantenibilidad",
  "refused-bequest": "mantenibilidad",
  // OLA AE (frente AE10) — `arquitectura`. El mismo chequeo de ausencia del
  // MISMO colaborador repetido en funciones de varios archivos describe cómo
  // está repartido el conocimiento de que ese colaborador puede faltar: cada
  // cliente nuevo tiene que enterarse y volver a escribirlo, y cambiar la
  // política de ausencia obliga a tocar todos los archivos a la vez. Es una
  // traba estructural entre lugares, no la legibilidad de un cuerpo — el
  // mismo criterio con el que `repeated-collaborator-set` y `shotgun-surgery`
  // están en este tier, y la razón por la que NO comparte el
  // `mantenibilidad` de `duplication`, que es intra-cuerpo.
  "repeated-absence-check": "arquitectura",
  // OLA AE (frente AE13) — ancla-FUERZA de Proxy: varios miembros de la misma
  // unidad repiten el MISMO control antes de llegar al MISMO objeto. Es
  // intra-clase (el control y el acceso viven adentro de la misma unidad) y
  // cuesta lectura y cambio —cada cliente nuevo tiene que acordarse de
  // escribir el control, y cambiarlo obliga a tocar N sitios—, pero no traba
  // nada fuera de esa unidad: no es un candado inter-file. Mismo tier y mismo
  // razonamiento que `lazy-init-repetida`, su hermano de forma (aquél exige
  // que la guarda CONSTRUYA el campo; éste, que el control GOBIERNE el acceso).
  "repeated-access-control": "mantenibilidad",
  // OLA AD (frente AD4) — `arquitectura`, el MISMO tier que las otras dos
  // anclas de Facade (`fanout-without-cohesion`, `god-component`): lo que
  // describe es cómo están repartidas las dependencias entre módulos —
  // una coordinación de varias piezas repetida en cada cliente —, no la
  // legibilidad de un cuerpo.
  "repeated-collaborator-set": "arquitectura",
  // OLA AE (frente AE12) — `mantenibilidad`, y no `arquitectura` aunque sea
  // pariente de `duplication`: el mismo armado configurado reescrito en varios
  // puntos cuesta LEERLO y CAMBIARLO (cambiar un valor del estado inicial
  // obliga a tocar N puntos), pero no limita cómo puede evolucionar el
  // sistema — la repetición vive DENTRO de un archivo, no en la relación
  // entre módulos, y el contrato reserva `arquitectura` para lo que "no vive
  // en un lugar, vive en la relación entre lugares". Mismo tier y mismo
  // criterio que `data-clump`/`repeated-switch`, con los que comparte
  // naturaleza (smell de diseño clásico que cuesta lectura y cambio).
  "repeated-configured-assembly": "mantenibilidad",
  "repeated-switch": "mantenibilidad",
  // Mismo tipo concreto instanciado desde muchos archivos distintos: cada
  // sitio disperso es un candado contra introducir una Factory/DI sin
  // tocar a todos ellos — el acoplamiento clásico que ese patrón existe
  // para remover.
  "scattered-instantiation": "arquitectura",
  // Ancla nueva de Composite (encargo "ancla ciega a la forma real"):
  // evidencia ESTRUCTURAL, no un problema — un tipo con un miembro (campo o
  // colección) de su propio tipo es la mitad de un árbol/Composite ya
  // aplicado, ad hoc o ausente. Mismo razonamiento de tier que
  // `homonymous-delegation`/`inheritance-family`/`manual-notification`:
  // intra-clase, cuesta lectura, no traba nada fuera de la clase.
  "self-referential-member": "mantenibilidad",
  // Ola X (B7). Campo temporal (Fowler): la clase entera queda obligada a
  // tolerar que el campo esté vacío, pero el defecto no cruza el archivo ni
  // traba cómo evoluciona el sistema — cuesta leerlo y cambiarlo. Misma
  // naturaleza y mismo tier que `lazy-init-repetida`, su forma espejo.
  "temporary-field": "mantenibilidad",
  // Ola X (B7). Despacho por tipo (Fowler, "Switch Statements"): cada tipo
  // nuevo obliga a volver a la misma función y nada avisa si alguien se
  // olvida — cuesta lectura y cambio, no es un bug hoy ni un candado
  // inter-file. Mismo tier que `conditional-chain`/`repeated-switch`, con
  // los que comparte naturaleza exacta.
  "type-switch": "mantenibilidad",
  "unreachable-code": "correccion",
  // Violación literal del Stable Dependencies Principle (Martin) entre
  // dos módulos: el defecto se define enteramente por la relación entre
  // sus dos métricas de inestabilidad, ninguna por separado.
  "unstable-dependency": "arquitectura",
  "unused-symbol": "arquitectura",
};

/**
 * `impact(f) ∈ [0, 1]` para un `detectorId` registrado. Lanza si el
 * `detectorId` no está en la tabla — nunca un default silencioso (un
 * detector sin tier no debe puntuar como si tuviera uno "promedio"):
 * `impact.test.ts` ya garantiza que esto no pasa en producción para
 * cualquier detector de `DETECTORS`, así que lanzar acá sólo puede
 * dispararse por un bug de integración, no por datos reales.
 */
export function impactOf(detectorId: string): number {
  const tier = DETECTOR_IMPACT[detectorId];
  if (!tier) throw new Error(`detect/impact.ts: "${detectorId}" no tiene tier declarado en DETECTOR_IMPACT.`);
  return IMPACT_TIER_VALUE[tier];
}
