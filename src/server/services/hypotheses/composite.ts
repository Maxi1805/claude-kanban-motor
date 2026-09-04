/**
 * Composite — Ola 10 (relanzamiento), CONTRATO-F10.md §0.4/§2, tarea propia
 * de este agente ("las tres formas de Composite"). Reemplaza el excluder de
 * CONTAINMENT laxo (`references`/`instantiates` hacia el tipo compartido,
 * versión F6/Ola 9 de este archivo) por la RECURSIÓN ESTRUCTURAL exacta que
 * el encargo especifica:
 *
 *   COMPLETA:  C --implements|satisfies--> I  ∧  sym:C.m --calls(role
 *              receiver-member)--> sym:I.m'  con (name,arity) igual  ∧  C≠I
 *              ∧  ∃ hoja L --implements|satisfies--> I  SIN esa arista.
 *              "Composite = un implementador que reenvía a su propia
 *              interfaz + al menos uno que no." → `ya-aplicado`, NUNCA una
 *              sugerencia (Requisito 1 del encargo).
 *   PARCIAL:   la recursión existe (`sym:C.m --calls(receiver-member)-->
 *              sym:C.m` — MISMO tipo, sin interfaz común) — recursión ad hoc
 *              sobre la propia colección, sin base compartida con las hojas.
 *   AUSENTE:   lo de siempre — `distributed-duplication` entre el manejo de
 *              "uno" y el de "muchos" (`composite.ts` es uno de los 4 de C1
 *              sin ancla propia, ver `ancla propia: no` del encargo).
 *
 * ── REQUISITO 2 DEL ENCARGO: EL EXCLUDER DEJA DE MIRAR VOCABULARIO ────────
 * La versión anterior de este archivo (F6/Ola 9) ya NO usaba regex de
 * nombres para el EXCLUDER (`findRelevantProtocol` ya consultaba
 * `implements`/`extends`/`satisfies` + `references`/`instantiates`) — el
 * vocabulario (`CHILDREN_WORD`/`EMPTINESS_WORD`) sólo alimentaba el
 * `required` (la detección del OLOR, sobre texto de clon, sin AST — ver más
 * abajo por qué eso se queda). Lo que SÍ era impreciso en el excluder viejo:
 * "containment" (`references`/`instantiates` hacia el tipo) es una
 * aproximación de "guarda un campo de ese tipo", NO de "reenvía el mismo
 * mensaje" — un implementador puede referenciar el tipo compartido por
 * cualquier motivo (un parámetro, un cast) sin recursar nunca. Esta versión
 * reemplaza esa aproximación por la terna exacta del encargo: `calls` con
 * rol `receiver-member` entre miembros de igual `(name, arity)`
 * (`memberSignatures`), excluyendo `¬extends` para no confundir
 * `super.operation()` con recursión — mismo criterio que
 * `wrapping-chain.ts` ya declara para la Forma de envoltura general.
 *
 * ── MEDIDO, NO ADIVINADO: LA ARISTA `calls(receiver-member)` NO SOBREVIVE
 *    LA RESOLUCIÓN HOY, EN NINGÚN LENGUAJE PROBADO ────────────────────────
 * Antes de fijar el diseño de arriba se probó, con el pipeline REAL
 * (`analyzeRepo`/`onGraph`, `scripts/debug-composite-graph.mts`, borrado al
 * cerrar la tarea):
 *   1. La fixture canónica real (`tests/fixtures/patterns/composite/*`, los
 *      6 lenguajes): CERO aristas `implements`/`extends` hacia `Shape` (no
 *      está declarado en el archivo — la base es externa/no resuelta) y
 *      CERO `calls` para `c.render()`/`child.render()` dentro del recorrido,
 *      en los 6 lenguajes.
 *   2. Un archivo TypeScript de control con `interface Shape { render():
 *      void }`, `Circle implements Shape` y `ShapeGroup implements Shape`
 *      con `for (const c of this.children) c.render()`: las aristas
 *      `implements` SÍ aparecen (`Circle -> Shape`, `ShapeGroup -> Shape`),
 *      pero la llamada `c.render()` sigue sin producir NINGUNA arista
 *      `calls`/`references` — ni ambigua, ni con rol.
 *   3. Recursión directa por campo (`this.a.render(); this.b.render();`,
 *      sin loop, campos tipados `Shape`): MISMO resultado, cero aristas para
 *      la llamada.
 * Los tres casos confirman, de forma independiente, el mismo hallazgo que
 * `wrapping-chain.ts` ya declaraba medido sobre los 8 repos (0 de 3.451
 * `calls`/0 de 55.040 `references` de guava con rol `receiver-member`): la
 * resolución de este proyecto es mayormente por NOMBRE/ámbito, no por TIPO
 * de receptor — un acceso `obj.miembro()` necesita saber el tipo de `obj`
 * para resolverse, y las 9 etapas de la cascada no hacen ese salto salvo
 * casos puntuales. La consecuencia declarada por Requisito 3 del encargo:
 * **COMPLETA, tal como la pide el contrato, es hoy estructuralmente correcta
 * pero DORMIDA en producción** — el mismo diagnóstico que `wrapping-chain.ts`
 * ya documenta para 11 de los 17 patrones, no un defecto de este archivo.
 * Queda probada contra grafos SINTÉTICOS (`composite.test.ts`, mismo rigor
 * que `wrapping-chain.test.ts`) y lista para el día en que la resolución de
 * receptor-tipado exista (no es tarea de esta ola: tocaría
 * `graph/resolve.ts`/`graph/references.ts`, ninguno de los archivos propios
 * de este encargo).
 *
 * ── POR QUÉ `required` YA NO EXIGE SÓLO TEXTO (nuevo, y por qué es seguro) ─
 * Antes, `ya-aplicado` estaba DECLARADO no alcanzable: `required` exigía
 * evidencia textual de recorrido MANUAL reinventado en >=2 sitios, así que
 * llegar a `appliedState` YA implicaba que el patrón NO estaba limpiamente
 * aplicado ahí. Esta versión separa las dos preguntas ("¿hay algo que mirar
 * cerca de estos archivos?" vs. "¿qué tan aplicado está el patrón?"), con el
 * mismo criterio que `prototype.ts` ya declara para su propia ancla
 * (`speculative-abstraction`): *"el Finding ancla NO se reutiliza como
 * evidencia... se usa sólo para decidir QUÉ ARCHIVO(S) mirar"*. Acá
 * `required` pasa con CUALQUIERA de dos señales independientes: (a) texto
 * (como antes) o (b) el grafo YA muestra, cerca de esos archivos, un
 * protocolo compartido o una recursión ad hoc — sin necesitar que el texto
 * del clon ALSO lo confirme. Con (b) sola, `appliedState` puede alcanzar
 * `ya-aplicado` genuinamente. Con (a) Y (b) a la vez (protocolo completo +
 * recorrido manual textual confirmado EN EL MISMO hallazgo), el estado es
 * `aplicado-eludido`: el protocolo ya existe cerca, y esta duplicación en
 * particular lo está puenteando.
 *
 * ── LA FORMA "PARCIAL: recursión ad hoc sobre el propio tipo" — DECLARADA
 *    CON SU LÍMITE, NO ESCONDIDA (Requisito 3) ────────────────────────────
 * A nivel de SÍMBOLO (no de instancia), `sym:X.m` llamando al miembro
 * homónimo de OTRO objeto del MISMO tipo `X` es la MISMA arista
 * (`sym:X.m --calls--> sym:X.m`) que produciría una recursión ORDINARIA sin
 * ninguna relación con Composite (`factorial`, `mergesort`, un recorrido de
 * árbol binario sin interfaz). El grafo no distingue instancias, sólo
 * símbolos — no hay forma de separar "otro objeto de mi tipo" de "yo mismo"
 * con lo que existe hoy. Por eso este check SÓLO se evalúa cuando YA hay un
 * `Finding` `distributed-duplication` anclando el archivo (nunca corre
 * suelto sobre cualquier función recursiva del repo) y su `why` declara la
 * ambigüedad explícitamente — el techo sigue en `"media"`, nunca sube a
 * `"alta"` por este check solo. Sumado al mismo hallazgo del punto anterior
 * (rol `receiver-member` dormido en producción), esta forma es, hoy, tan
 * dormida como COMPLETA.
 *
 * ── EL REFUERZO DEL ENCARGO (`invokes-indirect` hacia un portador
 *    `collection-element`) — probado, declarado inerte ───────────────────
 * `hasCollectionReinforcement` implementa literalmente lo que pide el
 * encargo. Igual que arriba: `graph/edges/invocacion-indirecta.ts` sólo
 * implementa hoy la Forma 3(a) ("`this.handler()` directo"); la Forma 4
 * ("recorro una colección e invoco el elemento") — la que este refuerzo
 * necesita — NO existe (registro de pendientes §C1, archivo de Cimientos,
 * Ola 11). Es un discriminador, nunca decisivo: sube un peldaño de la
 * escalera cuando pasa, declara por qué no pasa cuando no.
 *
 * ── LENGUAJES SIN CLASES / SIN INTERFAZ DECLARADA: cubierto por diseño ────
 * `findRelevantProtocol`/`findAdHocRecursion` no filtran por `family`: un
 * `struct`/`interface` de Go, un módulo Ruby, o una función de nivel de
 * archivo con capacidades de recursión ad hoc entran igual — sólo se apoyan
 * en aristas (`implements`/`satisfies`/`calls`/`contains`), nunca en la
 * forma de declaración de clase.
 *
 * ── SE CONFUNDE CON (declarado, ver `TO_CONFIRM`) ─────────────────────────
 * Recorrido genérico de array/JSON sin jerarquía real, e Iterator (recorrido
 * plano). Y ahora, explícito: cualquier `ya-aplicado`/`parcial` estructural
 * de este archivo es una PISTA fuerte de grafo, no una prueba leída del
 * código — confirmar a mano que el reenvío realmente ocurre.
 *
 * ── RAÍZ EXACTA DEL "DORMIDA EN PRODUCCIÓN" (esta pasada, requisito 4 del
 *    encargo) — no una sospecha, la línea exacta ─────────────────────────
 * Confirmado leyendo `graph/resolve.ts` (`syntacticRoleStage`, ~línea 174):
 * TODO candidato `role === "receiver-member"` con calificador NO-constante
 * se RECHAZA de forma incondicional, en la primerísima etapa de la cascada,
 * con el motivo textual "receptor explícito no-constante — sin tipos, la
 * arista no se emite" — antes de que `class-member`/`bare-constant-receiver`
 * lleguen a correr. No es una pérdida de rol en algún punto intermedio (como
 * `wrapping-chain.ts` lo dejaba, más cauto): es un rechazo TERMINAL, por
 * diseño, para los 9 lenguajes, sin excepción. Confirmado con DOS sondas
 * sintéticas propias (`this.a.render()`/`this.doOther()` con `Shape`
 * declarado, `implements` presentes, cero `calls`; `helperFn()` SIN receptor
 * sí produce `calls`) — nunca un array/campo/variable como receptor puede
 * disparar la recursión de Composite HOY, sin tocar `graph/resolve.ts`
 * (fuera de alcance de este encargo).
 *
 * ── MEDIDO SOBRE LOS 8 REPOS DEL CORPUS (`analyzeRepo` real, esta pasada) ──
 * `distributed-duplication`: click/cobra/jekyll/lodash/preact = 0 hallazgos
 * (Composite NUNCA se invoca ahí). vueuse 1 hallazgo y guava 4 — `required`
 * NO se cumple en ninguno (0 hipótesis): la duplicación real no tiene forma
 * hoja/hijos. newtonsoft-json (C#): 71 hallazgos, 20 `parcial` (0 `ausente`,
 * 0 `ya-aplicado`, 0 `aplicado-eludido`), 51 sin hipótesis. Los 20 `parcial`
 * colapsan a sólo 5 "protocolos" distintos (`JsonReaderStubWithIsClosed`,
 * `SqlDateTimeConverter`, `KnownTypesBinder`, `ReadJson.File`,
 * `DynamicContractResolver`) — los 5 verificados a mano leyendo el fuente:
 * los 5 son subclases HERMANAS concretas de una misma base (`JsonReader`,
 * `JsonConverter`, `DefaultContractResolver`) o implementadoras de una
 * interfaz externa (`ISerializationBinder`), nunca una relación
 * hoja/compuesto — 0 de 5 son un Composite real. Es el riesgo `SATISFIES_RISK`
 * (A9) ya declarado arriba, ahora MEDIDO: en este corpus, el 100% de la señal
 * de `parcial` que produce esta hipótesis viene del lado de riesgo declarado,
 * no del lado confiable (`implements`). Sobre `fixtures-multi/composite/`
 * (101 fixtures canónicas): 0/101 levantan NINGÚN `Finding` (ni siquiera
 * `distributed-duplication`) — el ancla de esta hipótesis nunca se dispara
 * ahí (gap de anclaje, independiente del gap de `calls` de arriba). Con esto,
 * el requisito 4 del encargo (`ya-aplicado` verificable sobre las fixtures
 * canónicas) queda declarado NO satisfecho hoy, con las dos causas exactas
 * documentadas — no adivinado, no escondido.
 *
 * ── OLA — nuevo ancla `self-referential-member` ("Composite, ancla ciega a
 *    la forma real") ────────────────────────────────────────────────────────
 * DIAGNÓSTICO MEDIDO: `distributed-duplication` (el único ancla de arriba)
 * exige código LITERALMENTE duplicado en >=2 archivos sin conexión. La forma
 * más común de Composite en código real — UNA sola clase con un árbol
 * autorreferencial (`class Folder { children: Folder[] }`,
 * `has_many :children, class_name: 'Folder'`) — nunca duplica texto entre
 * archivos: vive entera en un solo lugar, así que esta hipótesis nunca
 * llegaba a evaluarse ahí. Caso real que expuso el hueco (verificado a
 * mano): `<repo privado del usuario>/Backend/app/models/folder.rb` —
 * `has_many :children` (línea 11) + `belongs_to :parent` (línea 10), con
 * `not_empty?`/`ensure_empty` ya usando el vocabulario exacto que
 * `CHILDREN_WORD`/`EMPTINESS_WORD` esperaban, y un recorrido manual de
 * ancestros (`parent_is_not_descendant`, `while ancestor`) — la forma ad hoc
 * que Composite reemplazaría — sin ninguna duplicación entre archivos.
 *
 * EL ANCLA NUEVA (`detect/intra-file/self-referential-member.ts`, id/kind
 * propios, archivo propio — nunca toca un detector compartido): un tipo
 * cuyo campo o colección apunta a su propio tipo, confirmado por AST vía dos
 * caminos — TIPADO (TS/Java/C#: un campo con `type` cuyo subárbol contiene
 * el propio nombre de clase) o SIN TIPOS (Ruby: un par clave/valor genérico
 * dentro de un miembro cuyo VALOR es el propio nombre de clase). Cero
 * vocabulario de framework: nunca se hardcodea `has_many`/`belongs_to`/
 * `class_name` — sólo forma (campo `type`, forma par clave/valor,
 * comparación de texto EXACTA contra el propio nombre). Ver el docstring de
 * ese archivo para el detalle completo, incluida la normalización compartida
 * (`Tags::System` ~ `System` cuando la clase vive en `module Tags`).
 *
 * CÓMO SE INTEGRABA ACÁ, Y POR QUÉ SE REVIRTIÓ EN LA OLA V (leer la sección
 * "OLA V (frente V2)" más abajo antes que ésta): el `required` de entonces
 * pasaba con la SOLA existencia del ancla (`isSelfReferentialAnchor`) — "la
 * existencia del ancla YA ES la recursión estructural". Medido después: esa
 * inferencia es falsa. El ancla dice "este tipo se nombra a sí mismo", que es
 * cierto el 85 % de las veces, y de ahí no se sigue que haya una jerarquía
 * parte/todo: 81 hipótesis, 8 juzgadas, 0 verdaderas. Hoy el ancla sigue
 * siendo la puerta de entrada (sin él, esta hipótesis no se evalúa), pero la
 * candidatura la deciden los dos `required` de la Ola V.
 *
 * VERIFICADO A MANO sobre los 4 modelos reales de Rails con esta forma:
 * `Folder` (`class_name: 'Folder'`), `Hookable` (`class_name: 'Hookable'`),
 * `Comment` (`class_name: :Comment`, símbolo), `Tags::System`
 * (`class_name: 'Tags::System'`, con normalización de módulo). Dos
 * declarados SIN cerrar (falsos negativos, no forzados): `Tag` (el árbol es
 * un self-join muchos-a-muchos vía `Tags::Relation`, sin ningún
 * `class_name: 'Tag'` literal en `tag.rb`) y `Tags::Relation` (no es en sí
 * autorreferencial — sus dos `belongs_to` apuntan a `Tag`, correctamente NO
 * detectado).
 *
 * ── OLA V (frente V2) — POR QUÉ LAS 81 HIPÓTESIS DE ESTE ARCHIVO ERAN 0 %
 *    DE PRECISIÓN, Y QUÉ PREGUNTA SE AGREGÓ ─────────────────────────────────
 * MEDIDO al abrir la ola (censo propio, `scripts/v2-censo.mts`, `analyzeRepo`
 * sin caché, 9 repos): las 81 hipótesis del censo cuelgan **todas** de
 * `self-referential-member` y **todas son recomendaciones reales** — 60
 * `ausente` + 21 `parcial` con el grafo ya cableado por V1 (81 `ausente` sin
 * él, que es como cerró la Ola U). Las 8 juzgadas a mano en la Ola U dieron
 * **0 verdaderas**. El ancla NO es el problema: mide
 * 85 % [64 %, 95 %] con n=20 — cuando dice "este tipo tiene un miembro de su
 * propio tipo", tiene razón. Lo que estaba mal es la INFERENCIA: hasta esta
 * ola, `required` pasaba con la SOLA existencia del ancla
 * (`isSelfReferentialAnchor`), o sea que este archivo afirmaba
 * "acá falta Composite" cada vez que un tipo se nombraba a sí mismo.
 *
 * Los 8 falsos juzgados, leídos uno por uno (archivo:línea en el informe
 * `ola-v/informes/V2.md`), son CUATRO formas que se nombran a sí mismas y
 * ninguna es una jerarquía parte/todo:
 *   - **vista cacheada / memoización**: `UnmodifiableNavigableMap<K,V>
 *     descendingMap` (guava `Maps.java:3566`), `UnmodifiableNavigableSet<E>
 *     descendingSet` (`Sets.java:2031`), `TreeMultiset<E>
 *     deserializationReplacement` (`TreeMultiset.java:127`);
 *   - **lista enlazada intrusiva**: `Listener next` (pila de Treiber,
 *     `AbstractFuture.java:138`);
 *   - **puntero al padre**: `InstanceWrapper rootInquirer`
 *     (nest `instance-wrapper.ts:95`);
 *   - **interfaz fluida** (devolver `self` para encadenar): `get: () =>
 *     UseFetchReturn<T>` (vueuse `useFetch/index.ts:75`).
 * Y las dos formas que SÍ tienen una colección de hijos real
 * (eslint `index.d.ts:152` `childScopes: Scope[]`, newtonsoft
 * `JsonSchema.cs:154` `IList<JsonSchema> Items`) se juzgaron igualmente
 * negativas por la MISMA razón escrita dos veces: *"sin evidencia de
 * duplicación uno-vs-muchos en el código citado"* / *"la lógica real vive
 * fuera de este repo"* — es decir: **hay un árbol de datos, pero nadie opera
 * sobre él acá, así que no hay ningún tratamiento hoja/compuesto que
 * unificar**.
 *
 * LAS DOS PREGUNTAS DE INTENCIÓN QUE ESO PIDE, y que ahora son `required`
 * (`hay-arbol-parte-todo` y `alguien-opera-sobre-los-hijos`, abajo):
 *   1. **MUCHOS.** Composite trata "uno" y "muchos" de forma uniforme. Si el
 *      tipo se refiere a sí mismo por un enlace ESCALAR, no hay "muchos": es
 *      un padre, un siguiente, un gemelo o una vista. La pregunta se contesta
 *      con la GRAMÁTICA, no con nombres: ¿el propio nombre aparece DENTRO de
 *      una forma de arreglo (`Folder[]`) o como ARGUMENTO de un genérico de
 *      otro tipo (`List<Folder>`, `IList<JsonSchema>`), o aparece como el
 *      tipo entero (`Folder parent`) / instanciándose a sí mismo con sus
 *      propios parámetros (`Folder<K,V> cachedView`, la forma de vista
 *      cacheada)?
 *   2. **ALGUIEN OPERA.** Composite existe para que el CLIENTE no distinga
 *      hoja de compuesto. Si ningún miembro de la propia clase LEE esa
 *      colección, no hay operación que unificar: es una estructura de datos
 *      (un DTO, un `.d.ts` de tipos), no un Composite ausente.
 * El tercer dato — que ese recorrido se haga A MANO, dentro de un `if`/`for`
 * que decide hoja-o-compuesto — queda de DISCRIMINADOR
 * (`recorrido-manual-de-la-coleccion`), no de `required`: es lo que sube la
 * confianza, no lo que hace candidata a la hipótesis.
 *
 * ── OLA V — LA HIPÓTESIS DE "DORMIDO POR UNA CAUSA AJENA" SE PROBÓ, Y ES
 *    FALSA PARA EL ESTADO `ausente` ──────────────────────────────────────────
 * El plan de intenciones (§9) daba por sentado que este archivo no tenía nada
 * que arreglar y que todo se destrabaría cuando las hipótesis vieran el grafo
 * (frente V1 de esta ola). MEDIDO en cuanto ese cableado existió: de las 29
 * hipótesis de los repos no-Java del censo, el grafo cambió **dos**, y las dos
 * para PEOR — newtonsoft `XmlNodeConverter.cs:396` y `JToken.cs:66` pasaron de
 * `ausente` a `parcial` afirmando un "protocolo compartido" que es
 * `BsonObjectIdConverter` (11 implementadores) y `IJsonLineInfo` (5): interfaces
 * que no tienen NADA que ver con el árbol del tipo anclado. La causa es
 * `findRelevantProtocol`, que tomaba *el primer protocolo con >=2
 * implementadores del que ALGÚN implementador viva en el archivo del hallazgo*
 * — un vecino de archivo, no el tipo anclado. Arreglo de esta ola
 * (`protocoloDelTipoAncla`): para el ancla autorreferencial, el protocolo tiene
 * que ser una interfaz que implemente **el propio tipo del hallazgo**. La forma
 * COMPLETA sigue dormida por lo que este docstring ya declaraba (la arista
 * `calls` con rol `receiver-member` no sobrevive la resolución), y eso NO se
 * arregla desde acá — pero la evidencia irrelevante sí.
 *
 * ── OLA W (frente W3) — DEVOLVERLE COBERTURA A self-referential-member SIN
 *    REABRIR EL EMBUDO DE LA OLA V ──────────────────────────────────────────
 * MEDIDO al abrir esta ola (`scripts/dump-hallazgos.mts` sobre newtonsoft-json/
 * guava/nest/eslint/preact): de los 18 hallazgos `self-referential-member`
 * juzgados `verdadero` en el nivel 1 sobre el corpus, 0 producían una
 * hipótesis — el mismo embudo de la Ola V (66 mueren por "no es colección",
 * 13 por "colección que nadie opera") sigue matando el 100 % de los
 * verdaderos, no sólo los falsos que motivaron el arreglo. Antes de tocar
 * nada, se abrieron los 18 archivos reales, uno por uno, para separar tres
 * grupos:
 *
 *   1. **Correctamente excluidos, no es un bug** (11 de 18): enlaces
 *      escalares de una lista/árbol enlazado (`AbstractFutureState.Waiter.
 *      next`, `RunnableExecutorPair.next`, `DefaultJsonNameTable.Entry.Next`,
 *      `BsonToken.Parent`, `AbstractBiMap.inverse`) o colecciones reales que
 *      genuinamente nadie opera en la propia clase (`JsonSchemaNode`/
 *      `JsonSchema` — el `required` ya lo dice: "hay un árbol de datos, pero
 *      nadie opera sobre él acá", y es CIERTO, verificado leyendo las 86/41
 *      líneas completas de ambos archivos). Ninguno de estos se toca.
 *   2. **Bug de OTRO archivo, declarado, no arreglado acá** (1 de 18):
 *      `nest/.../topology-tree/tree-node.ts` — `class TreeNode<T>` con
 *      `children = new Set<TreeNode<T>>()` es Composite de manual
 *      (`addChild`/`removeChild`/`relink` operan sobre `children`), pero el
 *      ANCLA (`detect/intra-file/self-referential-member.ts`) sólo emitió la
 *      ubicación de `parent` (tipado explícito): `children` no tiene
 *      anotación de tipo (`= new Set<...>()`, inferida) y el detector hoy
 *      exige anotación explícita — verificado en el propio veredicto
 *      (`nest.verdicts.csv`, nota: "children no detectado por no tener
 *      anotación de tipo explícita"). **PIDO A OTRO FRENTE**: ver más abajo.
 *   3. **Bug de ESTE archivo, arreglado acá** (1 de 18, con al menos un caso
 *      más fuera de la muestra de 18 dado que el mecanismo es general, no ad
 *      hoc): `newtonsoft-json/.../XmlNodeConverter.cs:392 interface IXmlNode`
 *      — una interfaz PURA (sólo firmas: `List<IXmlNode> ChildNodes { get; }`,
 *      sin cuerpo) no tiene NINGÚN miembro function-like con cuerpo propio
 *      que `alguienOperaSobreLosHijos` pueda recorrer — el `required` fallaba
 *      SIEMPRE para toda interfaz autorreferencial, sin importar si el
 *      recorrido existe. Y SÍ existe, en el MISMO archivo:
 *      `:212 class XmlNodeWrapper : IXmlNode` construye y recorre
 *      `ChildNodes` recorriendo `_node.ChildNodes` del XML nativo de .NET.
 *      `hermanosQueImplementan`/`declaraHerenciaDe` (nuevas, abajo) buscan,
 *      SÓLO como fallback (cuando la propia clase no tiene operador) y SÓLO
 *      en el MISMO archivo (nunca cruzando al grafo — ver el docstring de
 *      esas funciones para por qué), un hermano cuya CABECERA declare
 *      heredar/implementar el tipo anclado, y cuenta su operación como la
 *      del ancla. Verificado que NO reabre el embudo: las tres formas
 *      escalares del grupo 1 (`Waiter.next`, etc.) siguen `escalar`, nunca
 *      llegan a `alguienOperaSobreLosHijos`; `JsonSchemaNode`/`JsonSchema`
 *      no tienen ningún hermano en su archivo cuya cabecera las nombre (son
 *      DTOs sin subtipos), así que el fallback no encuentra nada y siguen
 *      excluidos igual. Los `.d.ts`/interfaces puramente descriptivas de un
 *      runtime EXTERNO sin implementador en el propio archivo
 *      (`eslint/.../Scope`, `preact/.../ContainerNode`) siguen sin candidata
 *      — correctamente: no hay NINGÚN cuerpo en el repo con el que confirmar
 *      la operación.
 *
 * **PIDO A OTRO FRENTE** (`detect/intra-file/self-referential-member.ts`,
 * fuera de este archivo): reconocer también un campo con inicializador
 * genérico de colección SIN anotación explícita (`= new Set<X>()`,
 * `= new List<X>()`, `= []` con inferencia) cuando el argumento de tipo del
 * inicializador es el propio nombre de la clase — el caso exacto de
 * `TreeNode.children` de arriba, "árbol literal, caso textbook" según el
 * propio juicio del nivel 1, invisible hoy.
 *
 * NO SE INTENTÓ (evaluado y descartado, con la razón escrita): generalizar
 * `arbolParteTodo`/`clasificarPosicion` para reconocer >= 2 campos ESCALARES
 * autorreferenciales con nombres distintos (`left`/`right` de un árbol AVL,
 * `guava/.../TreeMultiset.java:598 AvlNode`) como "colección" — verificado
 * que la MISMA forma (varios campos escalares autorreferenciales en la
 * misma clase) también la tienen `HashBiMap.Node` (encadenamiento de hash +
 * orden de inserción) y `LinkedHashMultimap.ValueEntry` (encadenamiento
 * doble), y NINGUNA gramática distingue "dos campos que particionan un árbol
 * binario" de "varios campos que encadenan listas independientes" sin mirar
 * el NOMBRE de los campos (`left`/`right` vs. `next`/`predecessor` — léxico
 * de dominio, prohibido por el encargo de esta ola). Generalizar sin ese
 * discriminador habría sumado 2 falsos (`HashBiMap.Node`,
 * `LinkedHashMultimap.ValueEntry`, éste último con DOS copias en el corpus)
 * por 1 verdadero (`AvlNode`) — mala proporción, y sin discriminador seguro
 * a la vista. Queda declarado para quien encuentre una señal estructural
 * (no léxica) que separe las dos formas.
 */
import { CONSTRUCTOR_NAMES } from "../code-grammar.js";
import { deriveAnchor } from "../detect/ids.js";
import {
  RECURSIVE_COLLECTION_DESCENT_KIND,
  ROLE_RAMA_EXPLICITA,
} from "../detect/intra-file/recursive-collection-descent.js";
import { SELF_REFERENTIAL_MEMBER_KIND } from "../detect/intra-file/self-referential-member.js";
import type { AstNode, Anchor, CloneCandidate, FileUnit, Finding, RoleLocation } from "../detect/types.js";
import { walkTree } from "../detect/tree-walk.js";
import { confidentEdges } from "../detect/inter-file/confident-edges.js";
import {
  anchorNodeId,
  edgeHasRole,
  memberSignatures,
  type CodeGraph,
  type CodeGraphEdge,
  type CodeGraphNode,
  type EdgeKind,
  type GraphIndex,
  type MemberSignature,
} from "../graph/types.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternState } from "./types.js";

/** Vocabulario textual — SÓLO alimenta la detección del OLOR (`required`),
 *  nunca el excluder de `ya-aplicado`/`aplicado-eludido` (ver docstring del
 *  módulo). Se queda porque `distributed-duplication` es inter-file: no hay
 *  AST vivo para confirmar la forma con nodos, sólo el texto normalizado del
 *  clon (`ctx.repo.clones`) — mismo límite que la versión anterior ya
 *  declaraba. */
const CHILDREN_WORD = /child|children|kids|items|nodes?|elements|entries|subitems/i;
/**
 * Ola 11b (D2), retiro aplicado por el integrador al cierre: SALIÓ `blank\?`,
 * por el MISMO argumento ya escrito y medido en
 * `pattern-wrapping.ts#EMPTINESS_WORD` — `blank?` no es Ruby, es ActiveSupport
 * (Rails), y es una de las tres constantes que el usuario nombró como
 * prohibidas. Esta era la SEGUNDA copia de la misma constante, fuera del
 * alcance de `lexicon-inventory.json` (que escanea 7 archivos y no incluye
 * `hypotheses/`), así que retirarla sólo de `pattern-wrapping.ts` dejaba la
 * palabra viva en el producto: los revisores de la ola la encontraron acá.
 *
 * Lo que queda es grafía de LENGUAJE o de biblioteca estándar para el mismo
 * test ("¿está vacía esta colección?"): `empty`/`length`/`len(`/`count`/
 * `size`/`any`/`none` (JS/TS/Python/Ruby/Go), `nil?` (Ruby CORE, no Rails) y
 * la comparación contra cero.
 *
 * Riesgo del retiro, acotado sobre las líneas base congeladas del censo (no
 * estimado): esta constante sólo alimenta el `required` de Composite, y
 * `patron:Composite` aparece congelado únicamente en `guava` (Java) y
 * `newtonsoft-json` (C#), dos lenguajes donde `blank?` no es sintaxis válida.
 * `jekyll`, el único repo Ruby del corpus, no tiene ni una clave
 * `patron:Composite`. El retiro no puede producir una baja en ninguna línea
 * base, con corpus o sin él.
 */
const EMPTINESS_WORD = /empty|length|len\(|count|size|any|none|nil\?|==\s*0|===\s*0/i;
const ITERATION_HINT = /\.\s*(forEach|map|each|each_with_index)\b|\b(for|while|until)\b/i;

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ────────────────────────────────────────────────────────────────────────
 * OLA V (V2) — LA FORMA REAL DEL ANCLA AUTORREFERENCIAL, LEÍDA DEL ÁRBOL
 *
 * Todo lo de esta sección contesta DOS preguntas de intención sobre el
 * `Finding` `self-referential-member` que ancla la hipótesis (ver la sección
 * "OLA V (frente V2)" del docstring del módulo): ¿el tipo se compone de
 * MUCHOS de sí mismo, o se enlaza a UNO? ¿alguien OPERA sobre esos muchos?
 *
 * Se lee de `ctx.file` (el árbol vivo del archivo del hallazgo, no-nulo en
 * las dos pasadas que construyen hipótesis para un ancla `intra-file` — ver
 * `ola-v/CONTRATO-GRAFO-HIPOTESIS.md` §2/§3). Nunca del texto del `role` del
 * `Finding`, aunque ahí también viaje el tipo declarado: ese texto es prosa
 * de otro módulo y `code-analyzer.ts#toCodeFinding` ni siquiera lo publica.
 *
 * DUPLICACIÓN DELIBERADA respecto de
 * `detect/intra-file/self-referential-member.ts` (`normalize`,
 * `isQualifiedReference`, el reconocimiento de la instanciación genérica de
 * sí mismo): las capas no se pueden compartir hacia abajo, y estas piezas
 * tienen que caer sobre EXACTAMENTE el mismo nodo que el detector matcheó —
 * si divergen, esta clasificación se vuelve muda (`no-clasificable`) en vez
 * de mentir. Mismo criterio que `proxy.ts` declara para sus primitivas de
 * forma respecto de `detect/intra-file/lazy-init-repetida.ts`.
 * ──────────────────────────────────────────────────────────────────────── */

/** Igual que `self-referential-member.ts#normalize`: sin comillas, sin sigilo
 *  `:` de símbolo Ruby, sólo el último segmento tras `::`. */
function normalizarNombre(text: string): string {
  const stripped = text.trim().replace(/^:/, "").replace(/^['"]|['"]$/g, "");
  const segments = stripped.split("::");
  return (segments[segments.length - 1] ?? "").trim();
}

function hijosNombrados(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

/** Referencia CALIFICADA (`Externo.Interno`): un hijo anónimo cuyo texto es
 *  ".". El detector no la cuenta como autorreferencia y acá tampoco se
 *  desciende dentro — mismo nodo, misma regla. */
function esReferenciaCalificada(n: AstNode): boolean {
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i) as AstNode | null;
    if (c && !c.isNamed && c.text === ".") return true;
  }
  return false;
}

const NODO_ARGUMENTOS_DE_TIPO = /^type_arguments$|^type_argument_list$/;
const CAMPO_PARAMETROS_DE_CLASE = "type_parameters";
/** Un hijo cuyo texto son SÓLO corchetes/comas/espacios es el marcador de
 *  dimensión de un arreglo en las tres gramáticas tipadas donde este ancla
 *  tiene población — confirmado por sonda directa (`scripts/v2-sonda-tipos.mts`):
 *  TypeScript lo trae como dos hijos ANÓNIMOS (`[`, `]`) de `array_type`,
 *  Java como un hijo `dimensions` (`[]`), C# como un `array_rank_specifier`
 *  (`[]`). Se pregunta por la FORMA del hijo, no por el nombre del nodo, para
 *  no tener que reconocer tres nombres distintos de la misma cosa. */
const SOLO_CORCHETES = /^\s*\[[\],\s]*\]?\s*$/;

function esNodoDeArgumentos(n: AstNode): boolean {
  return NODO_ARGUMENTOS_DE_TIPO.test(n.type);
}

function argumentosDeTipo(n: AstNode): AstNode | null {
  for (const c of hijosNombrados(n)) if (esNodoDeArgumentos(c)) return c;
  return null;
}

function esFormaDeArreglo(n: AstNode): boolean {
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i) as AstNode | null;
    if (c && SOLO_CORCHETES.test(c.text)) return true;
  }
  return false;
}

/** Los parámetros de tipo propios de la clase (`["K","V"]` para `class Foo<K,V>`),
 *  en orden — `[]` si no es genérica. Copia deliberada de
 *  `self-referential-member.ts#classTypeParamNames`. */
function parametrosDeTipoDeLaClase(classNode: AstNode): string[] {
  const params = classNode.childForFieldName(CAMPO_PARAMETROS_DE_CLASE) as AstNode | null;
  if (!params) return [];
  return hijosNombrados(params).map((p) => normalizarNombre((hijosNombrados(p)[0] ?? p).text));
}

/**
 * DÓNDE aparece el propio nombre del tipo dentro del tipo declarado de un
 * miembro. Es LA pregunta de multiplicidad de Composite, contestada por la
 * gramática:
 *
 *   `coleccion` — el propio nombre está dentro de una forma de arreglo
 *                 (`Folder[]`) o es ARGUMENTO de un genérico de otro tipo
 *                 (`List<Folder>`, `IList<JsonSchema>`, `Map<K, Folder>`,
 *                 `(RouteTree | Type)[]`): el tipo guarda MUCHOS de sí mismo.
 *   `escalar`   — el propio nombre ES el tipo entero (`Folder parent`,
 *                 `Listener next`), o está bajo envoltorios que no multiplican
 *                 (unión `Folder | null`, anulable `Folder?`), o es el CABEZAL
 *                 de una instanciación de sí mismo con sus propios parámetros
 *                 (`UnmodifiableNavigableMap<K,V> descendingMap` — la forma
 *                 exacta de las vistas cacheadas de guava): UN enlace, no una
 *                 composición.
 *   `firma`     — el propio nombre aparece bajo un tipo de función (un nodo
 *                 con campo `parameters`): `get: () => UseFetchReturn<T>` es
 *                 una interfaz FLUIDA que devuelve `self` para encadenar, no
 *                 un miembro que guarde hijos.
 *
 * `null` ⇒ no se encontró el nodo autorreferencial (el miembro no tiene tipo
 * declarado — camino "literal" del detector, Ruby — o la clasificación no
 * cayó sobre el mismo nodo que el detector). "No clasificable" NUNCA se lee
 * como "colección": un `required` que aprueba por no haber podido mirar no es
 * un `required`.
 */
type PosicionAutorreferencia = "coleccion" | "escalar" | "firma";

/**
 * ¿Esta lista de argumentos de tipo incluye, como argumento DIRECTO, alguno de
 * los propios parámetros de tipo de la clase? Entonces el genérico está
 * parametrizado POR la clase que lo declara (el modismo de tipo propio:
 * `WeakValueReference<K, V, StrongKeyWeakValueEntry<K, V>>` dentro de
 * `class StrongKeyWeakValueEntry<K, V>` — guava
 * `MapMakerInternalMap.java:484`), y eso es una CELDA parametrizada por su
 * contenedor, no una colección de hijos: guarda UNO.
 *
 * Una colección de hijos se parametriza por el tipo del ELEMENTO y nada más
 * (`List<Folder>`, `Map<String, Folder>`, `Map<String, Folder<K, V>>` — donde
 * `K`/`V` viajan DENTRO del argumento, no como argumento suelto), así que la
 * regla no la toca. Es la misma familia de exclusión que el detector ya hace
 * para `Foo<K, V> vistaCacheada`.
 */
function parametrizadoPorLaPropiaClase(args: AstNode, paramsDeClase: readonly string[]): boolean {
  if (paramsDeClase.length === 0) return false;
  return hijosNombrados(args).some((a) => paramsDeClase.includes(normalizarNombre(a.text)));
}

function clasificarPosicion(typeNode: AstNode, nombrePropio: string, paramsDeClase: readonly string[]): PosicionAutorreferencia | null {
  const encontradas: PosicionAutorreferencia[] = [];

  const visitar = (n: AstNode, multiplicado: boolean, enFirma: boolean): void => {
    if (esReferenciaCalificada(n)) return;
    const registrar = (): void => {
      encontradas.push(enFirma ? "firma" : multiplicado ? "coleccion" : "escalar");
    };

    const args = argumentosDeTipo(n);
    if (args) {
      // Por TIPO de nodo, nunca por identidad de objeto: `n.child(i)` de
      // web-tree-sitter materializa un objeto JS nuevo en cada llamada, así que
      // `c === args` es falso incluso para el MISMO nodo del árbol (medido: con
      // la comparación por identidad, `IList<JsonSchema>` dentro de
      // `class JsonSchema` se clasificaba `escalar`).
      const cabezal = hijosNombrados(n).find((c) => !esNodoDeArgumentos(c));
      if (cabezal && normalizarNombre(cabezal.text) === nombrePropio) {
        // Instanciación de SÍ MISMO. Cuenta como autorreferencia sólo si los
        // argumentos son los propios parámetros de la clase, en orden — misma
        // regla que el detector (una instanciación con otros argumentos es una
        // vista/transformación, no contención) — y NO se desciende: sus
        // argumentos son parámetros de tipo, no hijos del árbol.
        const nombresArg = hijosNombrados(args).map((a) => normalizarNombre(a.text));
        if (paramsDeClase.length > 0 && nombresArg.length === paramsDeClase.length && nombresArg.every((a, i) => a === paramsDeClase[i])) {
          registrar();
        }
        return;
      }
    }

    if (normalizarNombre(n.text) === nombrePropio) {
      registrar();
      return;
    }

    // Un nodo con campo `parameters` es un tipo de función: todo lo que cuelga
    // de él (parámetros y retorno) es FIRMA, no un miembro que guarde hijos.
    const firmaAcá = enFirma || n.childForFieldName("parameters") !== null;
    const arreglo = esFormaDeArreglo(n);
    const multiplicaSusArgumentos = args !== null && !parametrizadoPorLaPropiaClase(args, paramsDeClase);
    for (const c of hijosNombrados(n)) {
      // Cruzar hacia los ARGUMENTOS de un genérico de otro tipo, o hacia
      // adentro de una forma de arreglo, es cruzar una multiplicidad. Cruzar
      // una unión/anulable/paréntesis no cambia nada: se sigue con la misma
      // marca que traía.
      visitar(c, multiplicado || arreglo || (multiplicaSusArgumentos && esNodoDeArgumentos(c)), firmaAcá);
    }
  };

  visitar(typeNode, false, false);
  if (encontradas.length === 0) return null;
  if (encontradas.includes("coleccion")) return "coleccion";
  if (encontradas.includes("escalar")) return "escalar";
  return "firma";
}

interface MiembroAutorreferencial {
  readonly nombre: string | null;
  readonly linea: number;
  readonly tipoTexto: string | null;
  /** `null` ⇒ no clasificable (sin tipo declarado, o el nodo no se pudo ubicar). */
  readonly posicion: PosicionAutorreferencia | null;
  /** Miembros function-like de la MISMA clase que leen este miembro por su nombre. */
  readonly operadoPor: readonly string[];
  /** De `operadoPor`, los que lo leen DENTRO de una estructura de control
   *  (`sets.branchNodes`: `if`/`for`/`while`/`switch`/ternario) — el recorrido
   *  o la decisión hoja-vs-compuesto hecha a mano. */
  readonly recorridoPor: readonly string[];
}

interface FormaDelAncla {
  readonly clase: string;
  readonly miembros: readonly MiembroAutorreferencial[];
}

/** Nombre del miembro, con los tres desenvolvimientos que usa el detector
 *  (campo `name` directo; `declarator` de Java; forma posicional de C#). */
function nombreDelMiembro(member: AstNode): string | null {
  const directo = (member.childForFieldName("name") as AstNode | null)?.text;
  if (directo) return directo;
  const viaDeclarador = ((member.childForFieldName("declarator") as AstNode | null)?.childForFieldName("name") as AstNode | null)?.text;
  if (viaDeclarador) return viaDeclarador;
  for (const c of hijosNombrados(member)) {
    if (c.childForFieldName("type") === null) continue;
    const declarador = hijosNombrados(c).find((d) => d.childForFieldName("type") === null && hijosNombrados(d).length > 0);
    const nombre = declarador ? hijosNombrados(declarador)[0]?.text : null;
    if (nombre) return nombre;
  }
  return null;
}

/** Nodo de tipo del miembro: el campo `type` directo (Java/TypeScript/Ruby),
 *  o el de la envoltura posicional de C# (`variable_declaration`). */
function nodoDeTipoDelMiembro(member: AstNode): AstNode | null {
  const directo = member.childForFieldName("type") as AstNode | null;
  if (directo) return directo;
  for (const c of hijosNombrados(member)) {
    const anidado = c.childForFieldName("type") as AstNode | null;
    if (anidado) return anidado;
  }
  return null;
}

/**
 * ¿Este miembro function-like es un CONSTRUCTOR? Los dos mecanismos que ya usa
 * el resto del proyecto: el nodo dedicado de la gramática
 * (`sets.constructorNodes`, Java/C#) y la grafía que el LENGUAJE impone
 * (`CONSTRUCTOR_NAMES` de `code-grammar.ts`: `constructor`/`initialize`/
 * `__init__`; en Java/C# el constructor además se llama como la clase).
 *
 * POR QUÉ SE EXCLUYE DE "alguien opera sobre los hijos": construir o copiar la
 * colección no es operar sobre el árbol. Medido — es la diferencia entre las
 * dos formas del corpus que sobrevivían por esta puerta:
 * `newtonsoft/Schema/JsonSchemaNode.cs:45` (`Dictionary<string,
 * JsonSchemaNode> Properties`, leída SÓLO por sus dos constructores, que la
 * inicializan y la copian) es un nodo de datos, no un tipo que distinga hoja de
 * compuesto al ejecutar una operación.
 */
function esConstructor(file: FileUnit, fn: AstNode): boolean {
  if (file.sets.constructorNodes.has(fn.type)) return true;
  const nombre = nombreDelMiembro(fn);
  return nombre !== null && CONSTRUCTOR_NAMES.has(nombre.toLowerCase());
}

/** ¿El subárbol de `n` lee el identificador `nombre` (nodo hoja, texto exacto)? */
function leeIdentificador(n: AstNode, nombre: string): boolean {
  if (n.childCount === 0) return n.text === nombre;
  for (const c of hijosNombrados(n)) if (leeIdentificador(c, nombre)) return true;
  return false;
}

/** ¿Alguna estructura de control DENTRO de `n` lee `nombre`? */
function leeIdentificadorEnControl(n: AstNode, nombre: string, ramas: ReadonlySet<string>): boolean {
  for (const c of hijosNombrados(n)) {
    if (ramas.has(c.type) && leeIdentificador(c, nombre)) return true;
    if (leeIdentificadorEnControl(c, nombre, ramas)) return true;
  }
  return false;
}

/**
 * OLA W (W3) — el texto de la CABECERA de una declaración de clase/interfaz:
 * todo lo que precede al `body` (`extends X`, `implements Y, Z` en Java/TS,
 * `: Y, Z` en C#) — nunca el cuerpo, para no confundir un identificador
 * usado ADENTRO con una relación de herencia DECLARADA.
 */
function encabezadoDeClase(classNode: AstNode, body: AstNode): string {
  const partes: string[] = [];
  for (const c of hijosNombrados(classNode)) {
    if (c === body) break;
    partes.push(c.text);
  }
  return partes.join(" ");
}

/** ¿La cabecera de `classNode` nombra a `nombre` (`extends`/`implements`/`: Base`)? Relación DECLARADA en el propio texto de herencia, nunca inferida por miembros compartidos (prohibido — ver `graph/edges/satisfies-derive.ts`). */
function declaraHerenciaDe(classNode: AstNode, body: AstNode, nombre: string): boolean {
  return new RegExp(`\\b${escapeForRegex(nombre)}\\b`).test(encabezadoDeClase(classNode, body));
}

/**
 * OLA W (W3) — hermanos del MISMO ARCHIVO que declaran heredar/implementar
 * el tipo anclado. Por qué hace falta: cuando el ancla es una INTERFAZ pura
 * (sólo firmas, sin cuerpo — `internal interface IXmlNode { List<IXmlNode>
 * ChildNodes { get; } ... }`), NINGÚN miembro de la interfaz tiene un cuerpo
 * que `leeIdentificador` pueda recorrer: el patrón sólo puede estar aplicado
 * (o ausente) en quien la IMPLEMENTA, nunca en la interfaz misma — antes de
 * esta ola, `alguienOperaSobreLosHijos` fallaba SIEMPRE para estos casos, sin
 * distinguir "nadie opera" de "la operación vive en el implementador".
 *
 * VERIFICADO EN EL CORPUS (`newtonsoft-json/Converters/XmlNodeConverter.cs`):
 * `:212 class XmlNodeWrapper : IXmlNode` construye Y RECORRE `ChildNodes`
 * (`foreach (XmlNode childNode in _node.ChildNodes) ...`) en el MISMO
 * archivo que declara `:392 internal interface IXmlNode`. Antes de esta
 * ola, `self-referential-member:...XmlNodeConverter.cs:396` (juzgado
 * `verdadero`, "árbol DOM real, Composite genuino") no producía ninguna
 * hipótesis — medido con `scripts/dump-hallazgos.mts` antes del arreglo.
 *
 * ALCANCE DELIBERADAMENTE ANGOSTO: sólo el MISMO archivo (nunca el grafo —
 * cruzar a otro archivo para leer un cuerpo ajeno exigiría un árbol que esta
 * pasada no tiene vivo) y sólo por relación DECLARADA en la cabecera de la
 * clase (`declaraHerenciaDe`) — nunca por conjunto de miembros compartidos.
 * `.d.ts`/interfaces puramente descriptivas de un runtime EXTERNO (sin
 * ningún implementador en el propio archivo — verificado el mismo patrón en
 * `eslint/lib/types/index.d.ts` `Scope`/`CodePathSegment`,
 * `preact/src/index.d.ts` `ContainerNode`) siguen sin candidata: es el límite
 * correcto, no un descuido — ahí no hay NINGÚN cuerpo en todo el repo con el
 * que confirmar la operación, y `required` no debe aprobar por no poder
 * mirar (`no-permissive-required.test.ts`).
 */
function hermanosQueImplementan(file: FileUnit, nombreClase: string, propio: AstNode): readonly AstNode[] {
  const out: AstNode[] = [];
  walkTree(file.root, (raw) => {
    const n = raw as AstNode;
    if (n === propio || !n.isNamed || !file.sets.classNodes.has(n.type)) return;
    const body = n.childForFieldName("body") as AstNode | null;
    if (!body) return;
    if (declaraHerenciaDe(n, body, nombreClase)) out.push(n);
  });
  return out;
}

/**
 * La clase del hallazgo dentro del árbol vivo: el nodo tipo-clase MÁS INTERNO
 * cuyo nombre normalizado es el `symbol` del hallazgo y cuyo rango cubre la
 * primera ubicación. El "más interno" importa por las clases anidadas
 * (`ImmutableMultimap.Builder`), donde el nombre simple se repite.
 */
function claseDelAncla(file: FileUnit, nombre: string, linea: number): AstNode | null {
  let mejor: AstNode | null = null;
  let mejorDesde = -1;
  walkTree(file.root, (raw) => {
    const n = raw as AstNode;
    if (!n.isNamed || !file.sets.classNodes.has(n.type)) return;
    const nombreNodo = (n.childForFieldName("name") as AstNode | null)?.text;
    if (!nombreNodo || normalizarNombre(nombreNodo) !== nombre) return;
    const desde = n.startPosition.row + 1;
    const hasta = n.endPosition.row + 1;
    if (linea < desde || linea > hasta) return;
    if (desde > mejorDesde) {
      mejor = n;
      mejorDesde = desde;
    }
  });
  return mejor;
}

/**
 * La forma del ancla `self-referential-member`, o `null` si no hay árbol vivo
 * / el hallazgo no trae símbolo / la clase no se pudo ubicar. `null` NUNCA se
 * lee como "cumple": los dos `required` de abajo lo tratan como "no evaluado
 * ⇒ no candidata".
 *
 * EXPORTADA sólo para el medidor de este frente (`scripts/v2-funnel.mts`), que
 * necesita contar POR QUÉ muere cada hallazgo del censo sin volver a correr el
 * analizador entero — medir el embudo con una SEGUNDA implementación de la
 * misma clasificación sería medir otra cosa. Producción la llama únicamente
 * desde `build()`, más abajo.
 */
export function analizarFormaDelAncla(problem: Finding, ctx: HypothesisContext): FormaDelAncla | null {
  const file = ctx.file;
  const primera = problem.locations[0];
  if (!file || !primera?.symbol) return null;
  if (file.path !== primera.file) return null;
  const nombreClase = normalizarNombre(primera.symbol);
  const classNode = claseDelAncla(file, nombreClase, primera.startLine);
  if (!classNode) return null;
  const body = classNode.childForFieldName("body") as AstNode | null;
  if (!body) return null;

  const params = parametrosDeTipoDeLaClase(classNode);
  const cuerpo = hijosNombrados(body);
  const funciones = cuerpo.filter((m) => file.sets.functionNodes.has(m.type));

  // OLA W (W3) — hermanos que implementan/extienden a `nombreClase` en este
  // MISMO archivo, sólo computados si hace falta (perezoso: un caminado del
  // archivo entero, pagado como máximo una vez por hallazgo, nunca por
  // miembro). Ver `hermanosQueImplementan` para la intención completa.
  let hermanosMemo: readonly AstNode[] | undefined;
  const hermanos = (): readonly AstNode[] => (hermanosMemo ??= hermanosQueImplementan(file, nombreClase, classNode));

  const miembros: MiembroAutorreferencial[] = [];
  for (const loc of problem.locations) {
    const member = cuerpo.find((m) => m.startPosition.row + 1 === loc.startLine);
    if (!member) {
      miembros.push({ nombre: null, linea: loc.startLine, tipoTexto: null, posicion: null, operadoPor: [], recorridoPor: [] });
      continue;
    }
    const typeNode = nodoDeTipoDelMiembro(member);
    const nombre = nombreDelMiembro(member);
    const posicion = typeNode ? clasificarPosicion(typeNode, nombreClase, params) : null;
    const operadoPor: string[] = [];
    const recorridoPor: string[] = [];
    // Sólo se busca la operación sobre las COLECCIONES: es la única forma que
    // puede llegar a candidata, y recorrer el cuerpo de cada método por cada
    // miembro escalar sería trabajo tirado (en guava, clases de miles de
    // líneas con decenas de métodos).
    if (nombre && posicion === "coleccion") {
      for (const fn of funciones) {
        if (esConstructor(file, fn)) continue;
        if (!leeIdentificador(fn, nombre)) continue;
        const nombreFn = nombreDelMiembro(fn) ?? fn.type;
        operadoPor.push(nombreFn);
        if (leeIdentificadorEnControl(fn, nombre, file.sets.branchNodes)) recorridoPor.push(nombreFn);
      }
      // FALLBACK — ver `hermanosQueImplementan`: cuando NADIE dentro de la
      // propia clase opera (el caso típico de una interfaz sin cuerpos
      // propios), buscar en hermanos del archivo que declaran heredar/
      // implementar este tipo. Etiquetado "Clase.miembro" para que la
      // evidencia diga SIEMPRE de dónde sale la operación — nunca se
      // atribuye en silencio a la clase anclada.
      if (operadoPor.length === 0) {
        for (const h of hermanos()) {
          const hBody = h.childForFieldName("body") as AstNode | null;
          if (!hBody) continue;
          const hNombre = (h.childForFieldName("name") as AstNode | null)?.text ?? "?";
          for (const hfn of hijosNombrados(hBody)) {
            if (!file.sets.functionNodes.has(hfn.type)) continue;
            if (esConstructor(file, hfn)) continue;
            if (!leeIdentificador(hfn, nombre)) continue;
            const etiqueta = `${normalizarNombre(hNombre)}.${nombreDelMiembro(hfn) ?? hfn.type}`;
            operadoPor.push(etiqueta);
            if (leeIdentificadorEnControl(hfn, nombre, file.sets.branchNodes)) recorridoPor.push(etiqueta);
          }
        }
      }
    }
    miembros.push({
      nombre,
      linea: loc.startLine,
      // TypeScript trae el tipo dentro de un `type_annotation`, cuyo texto
      // empieza por ":" — se saca sólo para mostrarlo (`"children": Folder[]`,
      // no `"children": : Folder[]`); la clasificación usa el nodo, no el texto.
      tipoTexto: typeNode ? typeNode.text.replace(/^:\s*/, "") : null,
      posicion,
      operadoPor,
      recorridoPor,
    });
  }
  return { clase: nombreClase, miembros };
}

function colecciones(forma: FormaDelAncla): readonly MiembroAutorreferencial[] {
  return forma.miembros.filter((m) => m.posicion === "coleccion");
}

function describirMiembros(forma: FormaDelAncla): string {
  return forma.miembros
    .map((m) => `"${m.nombre ?? "(miembro)"}"${m.tipoTexto ? `: ${m.tipoTexto}` : ""} → ${m.posicion ?? "no clasificable"}`)
    .join("; ");
}

interface CompositeSite {
  location: RoleLocation;
  clone: CloneCandidate | null;
  /** Vocabulario de hijos + vacío presente en el texto normalizado del clon. */
  hasShape: boolean;
  /** Auto-llamada por el propio nombre de función, co-ocurriendo con una pista de iteración. */
  recurses: boolean;
  childrenWord: string | null;
}

interface CompositeProblem {
  finding: Finding;
  sites: readonly CompositeSite[];
  /**
   * OLA V (V2). La forma REAL del ancla autorreferencial leída del árbol vivo
   * — `null` cuando el ancla es `distributed-duplication` (ahí no hay UN tipo
   * anclado, hay sitios duplicados) o cuando no hubo árbol/símbolo con el que
   * clasificar. Se calcula UNA vez por `build()`, no una por check.
   */
  forma: FormaDelAncla | null;
  /**
   * OLA V (V2). El índice del grafo, memoizado por `build()`. Antes cada check
   * llamaba `buildIndex(graph)` por su cuenta y cada uno de esos recorría y
   * copiaba TODAS las aristas del repo (`confidentEdges`) — hasta 3 veces por
   * hipótesis candidata, el costo que `ola-v/CONTRATO-GRAFO-HIPOTESIS.md` §7
   * mide como el 92 % de lo que agrega la pasada de grafo (50.461 aristas y
   * 1,4 ms por llamada en hugo). Ahora es una sola vez por hipótesis.
   */
  indice(): Index | null;
}

function matchClone(clones: readonly CloneCandidate[], loc: RoleLocation): CloneCandidate | null {
  return clones.find((c) => c.file === loc.file && c.startLine === loc.startLine && c.endLine === loc.endLine) ?? null;
}

function analyzeSite(clone: CloneCandidate | null): Omit<CompositeSite, "location" | "clone"> {
  if (!clone) return { hasShape: false, recurses: false, childrenWord: null };
  const text = clone.normalized;
  const hasShape = CHILDREN_WORD.test(text) && EMPTINESS_WORD.test(text);
  const childrenWord = CHILDREN_WORD.exec(text)?.[0] ?? null;
  const fnName = clone.functionName;
  const recurses =
    hasShape &&
    !!fnName &&
    ITERATION_HINT.test(text) &&
    new RegExp(`\\.${escapeForRegex(fnName)}\\s*\\(|\\b${escapeForRegex(fnName)}\\s*\\(`).test(text);
  return { hasShape, recurses, childrenWord };
}

function confirmedSites(problem: CompositeProblem): readonly CompositeSite[] {
  return problem.sites.filter((s) => s.hasShape && s.recurses);
}

const allSitesConfirm: Check<CompositeProblem, CodeGraph | null> = {
  id: "todos-los-sitios-confirman",
  describe: "TODOS los sitios de la duplicación (no sólo 2) muestran la forma hoja/hijos + recursión.",
  run(problem) {
    const confirmed = confirmedSites(problem).length;
    return {
      holds: problem.sites.length > 0 && confirmed === problem.sites.length,
      evidence: `${confirmed} de ${problem.sites.length} sitios confirman la forma completa (vocabulario).`,
    };
  },
};

const consistentVocabulary: Check<CompositeProblem, CodeGraph | null> = {
  id: "vocabulario-de-hijos-consistente",
  describe: "El mismo nombre de campo de \"hijos\" se repite en >=2 sitios confirmados (no es coincidencia de vocabulario distinto).",
  run(problem) {
    const confirmed = confirmedSites(problem);
    const words = new Set(confirmed.map((s) => s.childrenWord!.toLowerCase()));
    const holds = confirmed.length >= 2 && words.size === 1;
    return {
      holds,
      evidence:
        confirmed.length < 2
          ? "Menos de 2 sitios confirmados (vocabulario): no hay nada que comparar."
          : words.size === 1
            ? `Los ${confirmed.length} sitios confirmados usan el mismo campo: "${[...words][0]}".`
            : `Vocabulario distinto entre sitios confirmados: ${[...words].join(", ")}.`,
    };
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * ESTRUCTURA — la terna de recursión de Composite (ver docstring del
 * módulo). `Index` es un índice mínimo local, mismo idioma que
 * `wrapping-chain.ts#Index` (duplicado a propósito: distinta forma exacta,
 * ver docstring — acá la recursión es X.m -> I.m, la INTERFAZ misma, no un
 * hermano concreto Y.m).
 * ──────────────────────────────────────────────────────────────────────── */

const PROTOCOL_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set(["implements", "satisfies"]);

interface Index {
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
  readonly edgesFrom: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  /** miembro function-like -> su owner, inverso de `contains` — para saber si un `calls` target pertenece al MISMO tipo que el llamador. */
  readonly ownerOfMember: ReadonlyMap<string, string>;
}

function buildIndex(graph: CodeGraph): Index {
  const nodeById = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);

  const edgesFrom = new Map<string, CodeGraphEdge[]>();
  const ownerOfMember = new Map<string, string>();
  for (const e of confidentEdges(graph)) {
    const list = edgesFrom.get(e.from);
    if (list) list.push(e);
    else edgesFrom.set(e.from, [e]);
    if (e.kind === "contains") {
      const target = nodeById.get(e.to);
      if (target?.kind === "symbol" && target.family === "function-like") ownerOfMember.set(e.to, e.from);
    }
  }
  return { nodeById, edgesFrom, ownerOfMember };
}

function asGraphIndex(index: Index): GraphIndex {
  return {
    nodeById: (id) => index.nodeById.get(id) ?? null,
    edgesFrom: (id) => index.edgesFrom.get(id) ?? [],
  };
}

function membersOf(index: Index, ownerId: string): readonly MemberSignature[] {
  return memberSignatures(asGraphIndex(index), ownerId);
}

/** Id del nodo símbolo del miembro `name` de `ownerId`, leído de la MISMA arista `contains` que `memberSignatures` recorre — nunca reconstruido a mano. */
function memberNodeId(index: Index, ownerId: string, name: string): string | null {
  for (const e of index.edgesFrom.get(ownerId) ?? []) {
    if (e.kind !== "contains") continue;
    const target = index.nodeById.get(e.to);
    if (target?.kind === "symbol" && target.family === "function-like" && target.symbolPath[target.symbolPath.length - 1] === name) {
      return target.id;
    }
  }
  return null;
}

function extendsEdge(index: Index, fromId: string, toId: string): boolean {
  return (index.edgesFrom.get(fromId) ?? []).some((e) => e.kind === "extends" && e.to === toId);
}

function callsReceiverMember(index: Index, fromId: string, toId: string): boolean {
  return (index.edgesFrom.get(fromId) ?? []).some((e) => e.kind === "calls" && e.to === toId && edgeHasRole(e, "receiver-member"));
}

interface ProtocolImplementer {
  readonly id: string;
  readonly viaSatisfies: boolean;
}

/** interfaceId -> implementadores, sobre TODO el grafo (`implements`/`satisfies` confidentes, nunca `ambiguous`). */
function implementersByInterface(index: Index): Map<string, ProtocolImplementer[]> {
  const out = new Map<string, ProtocolImplementer[]>();
  for (const edges of index.edgesFrom.values()) {
    for (const e of edges) {
      if (!PROTOCOL_EDGE_KINDS.has(e.kind)) continue;
      const list = out.get(e.to) ?? [];
      list.push({ id: e.from, viaSatisfies: e.kind === "satisfies" });
      out.set(e.to, list);
    }
  }
  return out;
}

interface Recursion {
  readonly member: MemberSignature;
  readonly memberId: string;
}

/**
 * `true` si `x` tiene un miembro que llama, con rol `receiver-member`, al
 * miembro HOMÓNIMO (mismo `(name, arity)`, vía `memberSignatures`) declarado
 * en `interfaceId` — LA RECURSIÓN ESTRUCTURAL de Composite:
 * `child.operation()` donde `child` tiene el tipo de la interfaz, así que la
 * llamada resuelve contra `I.operation` (no contra un hermano concreto —
 * esa es la forma que `wrapping-chain.ts` ya cubre, `X.m -> Y.m` entre DOS
 * implementadores). `¬extends` excluye `super.operation()` (misma forma
 * exacta, no recursión) — mismo criterio que `wrapping-chain.ts` declara.
 */
function recursesThroughInterface(index: Index, x: string, interfaceId: string): Recursion | null {
  if (x === interfaceId || extendsEdge(index, x, interfaceId)) return null;
  const xMembers = membersOf(index, x);
  const iMembers = membersOf(index, interfaceId);
  for (const mx of xMembers) {
    const mi = iMembers.find((m) => m.name === mx.name && m.arity === mx.arity);
    if (!mi) continue;
    const xMemberId = memberNodeId(index, x, mx.name);
    const iMemberId = memberNodeId(index, interfaceId, mi.name);
    if (!xMemberId || !iMemberId) continue;
    if (callsReceiverMember(index, xMemberId, iMemberId)) return { member: mx, memberId: xMemberId };
  }
  return null;
}

/**
 * PARCIAL: `x` llama, con rol `receiver-member`, a un miembro homónimo cuyo
 * OWNER es el propio `x` (mismo tipo, sin interfaz compartida) — recursión
 * ad hoc. DECLARADO (ver docstring del módulo): a nivel de símbolo esto es
 * INDISTINGUIBLE de una recursión ordinaria sin relación con Composite
 * (`factorial`, `mergesort`) — por eso sólo se consulta cuando YA hay un
 * `Finding` `distributed-duplication` anclando el archivo, nunca suelto.
 */
function recursesOverOwnType(index: Index, x: string): Recursion | null {
  const xMembers = membersOf(index, x);
  for (const mx of xMembers) {
    const xMemberId = memberNodeId(index, x, mx.name);
    if (!xMemberId) continue;
    const hit = (index.edgesFrom.get(xMemberId) ?? []).some((e) => {
      if (e.kind !== "calls" || !edgeHasRole(e, "receiver-member")) return false;
      if (index.ownerOfMember.get(e.to) !== x) return false;
      const targetNode = index.nodeById.get(e.to);
      const targetName = targetNode?.symbolPath[targetNode.symbolPath.length - 1];
      return targetName === mx.name;
    });
    if (hit) return { member: mx, memberId: xMemberId };
  }
  return null;
}

interface ProtocolSignal {
  readonly interfaceId: string;
  readonly implementers: readonly ProtocolImplementer[];
  readonly viaSatisfies: boolean;
}

/**
 * Primer protocolo (interfaz con >=2 implementadores `implements`/`satisfies`
 * confidentes) donde AL MENOS UNO vive en un archivo de este hallazgo —
 * simplificación DECLARADA, igual que la versión anterior: no rankea entre
 * varios candidatos, toma el primero relevante.
 */
function findRelevantProtocol(index: Index, siteFiles: ReadonlySet<string>): ProtocolSignal | null {
  for (const [interfaceId, implementers] of implementersByInterface(index)) {
    if (implementers.length < 2) continue;
    const relevant = implementers.some((imp) => siteFiles.has(index.nodeById.get(imp.id)?.file ?? ""));
    if (!relevant) continue;
    return { interfaceId, implementers, viaSatisfies: implementers.some((i) => i.viaSatisfies) };
  }
  return null;
}

/** Recursión ad hoc (PARCIAL) sobre cualquier símbolo cuyo archivo esté entre los de este hallazgo, cuando NO hay protocolo compartido. */
function findAdHocRecursion(index: Index, siteFiles: ReadonlySet<string>): { owner: string; recursion: Recursion } | null {
  for (const n of index.nodeById.values()) {
    if (n.kind !== "symbol" || !siteFiles.has(n.file)) continue;
    const hit = recursesOverOwnType(index, n.id);
    if (hit) return { owner: n.id, recursion: hit };
  }
  return null;
}

interface ProtocolClassification {
  readonly recursors: readonly { imp: ProtocolImplementer; recursion: Recursion }[];
  readonly leaves: readonly ProtocolImplementer[];
}

function classifyProtocol(index: Index, signal: ProtocolSignal): ProtocolClassification {
  const recursors: { imp: ProtocolImplementer; recursion: Recursion }[] = [];
  const leaves: ProtocolImplementer[] = [];
  for (const imp of signal.implementers) {
    const r = recursesThroughInterface(index, imp.id, signal.interfaceId);
    if (r) recursors.push({ imp, recursion: r });
    else leaves.push(imp);
  }
  return { recursors, leaves };
}

/**
 * El refuerzo del encargo: `invokes-indirect` desde el MIEMBRO recursor
 * hacia un portador `carrierForm: "collection-element"` — confirmaría que la
 * recursión ocurre sobre una COLECCIÓN, no un único campo. DECLARADO
 * INERTE: `graph/edges/invocacion-indirecta.ts` sólo implementa hoy la
 * Forma 3(a) (`this.handler()` directo); la Forma 4 (recorrido de colección
 * + invocación del elemento) no existe (registro de pendientes §C1, Ola 11,
 * archivo de Cimientos). Se deja escrita y probada para cuando exista.
 */
function hasCollectionReinforcement(index: Index, recursorMemberId: string): boolean {
  return (index.edgesFrom.get(recursorMemberId) ?? []).some((e) => {
    if (e.kind !== "invokes-indirect") return false;
    const carrier = index.nodeById.get(e.to);
    return carrier?.kind === "carrier" && carrier.carrierForm === "collection-element";
  });
}

function siteFilesOf(problem: CompositeProblem): ReadonlySet<string> {
  return new Set(problem.sites.map((s) => s.location.file));
}

/**
 * OLA V (V2) — el nodo de grafo del TIPO ANCLADO: `kind: "symbol"`, familia
 * `class-like`, en el archivo del hallazgo, cuyo ÚLTIMO segmento de
 * `symbolPath` es el nombre de la clase.
 *
 * Por qué el último segmento y no `symbolNodeId(file, [clase])`: el grafo
 * escribe el camino completo del símbolo, que en C#/Java incluye el espacio de
 * nombres (`Newtonsoft.Json.Linq.JToken`), mientras que el `symbol` del
 * hallazgo es el nombre simple (`JToken`) — un id armado a mano nunca calza.
 * Es el mismo desajuste que hace fallar hoy a `ctx.neighborhood.ego` sobre
 * estos hallazgos ("Sin nodo de grafo para …#JToken"), medido en el censo de
 * esta ola.
 */
function nodoDelTipoAncla(index: Index, forma: FormaDelAncla, archivo: string): CodeGraphNode | null {
  for (const n of index.nodeById.values()) {
    if (n.kind !== "symbol" || n.family !== "class-like" || n.file !== archivo) continue;
    if (n.symbolPath[n.symbolPath.length - 1] === forma.clase) return n;
  }
  return null;
}

/**
 * OLA V (V2) — el protocolo (interfaz con >=2 implementadores) que implementa
 * **el propio tipo anclado**, no un vecino de archivo.
 *
 * LA INTENCIÓN QUE VERIFICA: el tratamiento uniforme de hoja y compuesto sólo
 * puede venir de una interfaz que ESTE tipo implemente. Medido en esta ola,
 * con el grafo recién cableado por V1: `findRelevantProtocol` (que toma el
 * primer protocolo con >=2 implementadores del que ALGÚN implementador viva en
 * el archivo del hallazgo) le atribuyó a `XmlNodeConverter` el protocolo
 * `BsonObjectIdConverter` (11 implementadores) y a `JToken` el
 * `IJsonLineInfo` (5) — dos interfaces sin ninguna relación con el árbol del
 * tipo anclado, y dos `parcial` falsos que antes del cableado no existían.
 */
function protocoloDelTipoAncla(index: Index, forma: FormaDelAncla, archivo: string): ProtocolSignal | null {
  const tipo = nodoDelTipoAncla(index, forma, archivo);
  if (!tipo) return null;
  const porInterfaz = implementersByInterface(index);
  for (const e of index.edgesFrom.get(tipo.id) ?? []) {
    if (!PROTOCOL_EDGE_KINDS.has(e.kind)) continue;
    const implementers = porInterfaz.get(e.to) ?? [];
    if (implementers.length < 2) continue;
    return { interfaceId: e.to, implementers, viaSatisfies: implementers.some((i) => i.viaSatisfies) };
  }
  return null;
}

/** El protocolo que corresponde al ancla de ESTE problema: anclado al tipo
 *  cuando el ancla es autorreferencial, por archivos del hallazgo cuando es
 *  una duplicación distribuida (ahí no hay UN tipo anclado). */
function protocoloRelevante(index: Index, problem: CompositeProblem): ProtocolSignal | null {
  const forma = problem.forma;
  const archivo = problem.finding.locations[0]?.file;
  if (forma && archivo) return protocoloDelTipoAncla(index, forma, archivo);
  return findRelevantProtocol(index, siteFilesOf(problem));
}

/* ────────────────────────────────────────────────────────────────────────
 * Ola 11a (P5, registro de pendientes — "1 de 17 lee ctx.neighborhood") —
 * los dos discriminadores nuevos que consumen el vecindario DIRECTO, sin
 * `refresh()`: `distributed-duplication` es inter-file, así que la ÚNICA
 * llamada de producción a `build()` (hypotheses/run.ts, llamada (2), dentro
 * de `crossAnalyze`) ya recibe `repo.graph` Y `ctx.neighborhood` REALES —
 * no hace falta esperar a una segunda pasada.
 * ──────────────────────────────────────────────────────────────────────── */

/** [provisional] — piso de "pocas otras duplicaciones distribuidas" para separar una jerarquía puntual de un repo entero que duplica (encargo de la ola). */
const ISOLATED_HIERARCHY_MAX_PEERS = 3;

/**
 * `ctx.neighborhood.countOfKind` — separa "una jerarquía puntual que pide
 * Composite" de "un repo entero que duplica todo" (encargo de la ola): si
 * hay pocas otras `distributed-duplication` visibles por el vecindario, esta
 * es más compatible con un árbol hoja/compuesto específico; si hay muchas,
 * es más compatible con ruido difuso de todo el repo (otro problema, no
 * necesariamente Composite). Nunca decisivo — discriminador, sube un peldaño.
 */
function isolatedHierarchyCheck(ctx: HypothesisContext): Check<CompositeProblem, CodeGraph | null> {
  return {
    id: "jerarquia-aislada-no-ruido-de-repo",
    describe: `ctx.neighborhood.countOfKind("distributed-duplication") <= ${ISOLATED_HIERARCHY_MAX_PEERS}: esta es una jerarquía puntual que pide Composite, no ruido de un repo entero que duplica todo.`,
    run() {
      const other = ctx.neighborhood.countOfKind("distributed-duplication");
      const holds = other <= ISOLATED_HIERARCHY_MAX_PEERS;
      return {
        holds,
        evidence: holds
          ? `${other} otra(s) duplicación(es) distribuida(s) visible(s) por el vecindario (ctx.neighborhood.countOfKind): señal aislada, compatible con una jerarquía puntual que pide Composite.`
          : `${other} otras duplicaciones distribuidas visibles por el vecindario (ctx.neighborhood.countOfKind): más compatible con un repo entero que duplica de forma difusa que con una jerarquía puntual — no sube la escalera.`,
      };
    },
  };
}

/**
 * `ctx.neighborhood.ego(ancla, 2)` — ¿los símbolos duplicados de ESTE
 * hallazgo cuelgan ya del MISMO árbol en el grafo (conectados a <=2 saltos),
 * o están sueltos? Necesita >=2 sitios con símbolo propio (`RoleLocation.symbol`)
 * para comparar algo — sin eso, no evaluado (nunca decisivo).
 */
function treeAlreadyFormedCheck(ctx: HypothesisContext): Check<CompositeProblem, CodeGraph | null> {
  return {
    id: "arbol-ya-formado-segun-vecindario",
    describe: "ctx.neighborhood.ego(2 saltos): los símbolos de los sitios duplicados cuelgan del MISMO árbol en el grafo (conectados a <=2 saltos), no sueltos.",
    run(problem, graph) {
      if (!graph) return { holds: false, evidence: "Sin grafo: no evaluado." };
      const anchors: Anchor[] = problem.sites.map((s) => deriveAnchor(s.location)).filter((a) => a.symbolPath.length > 0);
      if (anchors.length < 2) {
        return { holds: false, evidence: "Menos de 2 sitios con símbolo propio en sus locations: no hay con qué comparar conectividad de vecindario (ego)." };
      }
      const [first, ...rest] = anchors;
      const ego = ctx.neighborhood.ego(first!, 2);
      if (!ego) {
        return { holds: false, evidence: `Sin nodo de grafo para "${first!.file}#${first!.symbolPath.join(".")}" en ctx.neighborhood: ego(2) no disponible.` };
      }
      const egoIds = new Set(ego.nodes.map((n) => n.node.id));
      const connected = rest.filter((a) => egoIds.has(anchorNodeId(a)));
      return {
        holds: connected.length > 0,
        evidence:
          connected.length > 0
            ? `${connected.length}/${rest.length} de los otros sitios comparten vecindario a <=2 saltos con "${first!.file}#${first!.symbolPath.join(".")}" (ctx.neighborhood.ego) — el árbol ya está formado en el grafo, no son símbolos sueltos.`
            : `Ninguno de los otros ${rest.length} sitio(s) aparece dentro de ego(2 saltos) de "${first!.file}#${first!.symbolPath.join(".")}" — símbolos sueltos, según el vecindario.`,
      };
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * required / discriminators / appliedState
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * TERCER CAMINO (este encargo — "Composite, ancla ciega a la forma real"):
 * el propio `Finding` ancla YA es `self-referential-member`
 * (`detect/intra-file/self-referential-member.ts`) — un tipo con un miembro
 * (campo o colección) cuyo tipo es el tipo que lo declara, confirmado por
 * AST, sin necesitar duplicación de texto entre archivos. Ver el docstring
 * del módulo, sección "OLA — nuevo ancla `self-referential-member`", para el
 * diagnóstico completo (`distributed-duplication` es ciego a la forma de UNA
 * sola clase con árbol autorreferencial — la forma más común de Composite en
 * código real) y el caso de prueba verificado a mano
 * (`app/models/folder.rb`). A diferencia de los otros dos caminos (textual y
 * grafo), éste no necesita re-confirmar nada más: la propia existencia del
 * ancla YA es la recursión estructural — `problem.sites` sólo aporta las
 * ubicaciones para el resto de la escalera (discriminadores), nunca
 * evidencia adicional que este camino necesite.
 *
 * PISO ALINEADO CON EL DETECTOR (compuerta `threshold-alignment.test.ts`):
 * `detect/intra-file/self-referential-member.ts#pisoDeclarado(1, …)` — copia
 * a propósito, mismo argumento que ya declara `strategy.ts#STRATEGY_MIN_
 * BRANCHES`/`state.ts#STATE_MIN_BRANCHES` para el piso de SU propia ancla:
 * sin este chequeo, un `Finding` `self-referential-member` sintético con
 * `trigger[0].value` por debajo del piso real del detector (que en
 * producción nunca puede existir — el detector no lo emitiría) igual sería
 * aceptado acá, un desajuste mudo que la compuerta existe para atrapar.
 */
const SELF_REFERENTIAL_MEMBER_FLOOR = 1;

function isSelfReferentialAnchor(problem: CompositeProblem): boolean {
  return problem.finding.kind === SELF_REFERENTIAL_MEMBER_KIND && (problem.finding.trigger[0]?.value ?? 0) >= SELF_REFERENTIAL_MEMBER_FLOOR;
}

/**
 * REQUIRED 1 — **¿hay una relación PARTE/TODO?** La intención de Composite es
 * tratar "uno" y "muchos" de forma uniforme: sin MUCHOS del propio tipo no hay
 * nada que componer. Contra qué se defiende, medido (ver el docstring del
 * módulo, sección "OLA V"): las vistas cacheadas (`descendingMap`), las listas
 * enlazadas intrusivas (`Listener next`), los punteros al padre
 * (`rootInquirer`) y las interfaces fluidas (`get: () => Self`) son, todas,
 * tipos que se nombran a sí mismos y ninguna es un árbol parte/todo.
 *
 * Para el ancla `distributed-duplication` la pregunta es la MISMA — ¿los
 * sitios duplicados reinventan el recorrido hoja/hijos, o el grafo muestra una
 * recursión estructural relevante? — y se contesta como siempre, con el texto
 * del clon y el grafo, porque ahí no hay UN tipo anclado que clasificar.
 */
const arbolParteTodo: Check<CompositeProblem, CodeGraph | null> = {
  id: "hay-arbol-parte-todo",
  describe:
    "El tipo anclado guarda MUCHOS de su propio tipo (una colección: arreglo o argumento de un genérico), " +
    "no un enlace escalar (padre/siguiente/vista cacheada) ni una firma que devuelve self (interfaz fluida) — " +
    "o, para una duplicación distribuida, al menos 2 sitios reinventan el recorrido hoja/hijos o el grafo " +
    "muestra una recursión estructural relevante a esos archivos.",
  // Sin `graph`: el índice ya viene memoizado en el problema (`indice()`
  // devuelve `null` cuando no hay grafo), así que este check no necesita el
  // segundo parámetro del motor.
  run(problem) {
    if (isSelfReferentialAnchor(problem)) {
      const forma = problem.forma;
      if (!forma) {
        return {
          holds: false,
          evidence:
            `El ancla es "${SELF_REFERENTIAL_MEMBER_KIND}" pero no hubo árbol vivo del archivo (o el hallazgo no ` +
            "trae el símbolo de su tipo) con el que clasificar sus miembros: la relación parte/todo queda sin " +
            "evaluar, y sin evaluar no es candidata.",
        };
      }
      const cols = colecciones(forma);
      if (cols.length === 0) {
        return {
          holds: false,
          evidence:
            `"${forma.clase}" se nombra a sí mismo, pero ninguno de sus ${forma.miembros.length} miembro(s) ` +
            `autorreferencial(es) guarda MUCHOS del propio tipo — ${describirMiembros(forma)}. Un enlace escalar ` +
            "es un padre, un siguiente, un gemelo o una vista cacheada; una firma que devuelve el propio tipo es " +
            "una interfaz fluida: ninguna de las dos es una jerarquía parte/todo que Composite pueda unificar.",
        };
      }
      return {
        holds: true,
        evidence:
          `"${forma.clase}" guarda MUCHOS de su propio tipo en ${cols.length} miembro(s) — ` +
          `${cols.map((m) => `"${m.nombre ?? "(miembro)"}"${m.tipoTexto ? `: ${m.tipoTexto}` : ""}`).join(", ")} — ` +
          "el propio nombre aparece dentro de una forma de arreglo o como argumento de un genérico de otro tipo: " +
          "relación parte/todo confirmada por el árbol.",
      };
    }

    const confirmed = confirmedSites(problem);
    const textualHolds = confirmed.length >= 2;
    let structuralNote: string | null = null;
    const index = problem.indice();
    if (index) {
      const siteFiles = siteFilesOf(problem);
      const protocol = findRelevantProtocol(index, siteFiles);
      if (protocol) {
        structuralNote = `protocolo compartido ("${protocol.interfaceId}", ${protocol.implementers.length} implementadores) relevante a estos archivos`;
      } else {
        const adHoc = findAdHocRecursion(index, siteFiles);
        if (adHoc) structuralNote = `recursión ad hoc sobre el propio tipo en "${adHoc.owner}"`;
      }
    }
    if (!textualHolds && structuralNote === null) {
      return {
        holds: false,
        evidence:
          `Ninguno de los ${problem.sites.length} sitios de esta duplicación distribuida muestra la forma ` +
          "if/else de vacío-de-hijos + auto-llamada recursiva, y el grafo no muestra un protocolo/recursión " +
          "estructural relevante a estos archivos: es duplicación de otra naturaleza, no un árbol implícito.",
      };
    }
    const parts: string[] = [];
    if (textualHolds) parts.push(`${confirmed.length} de ${problem.sites.length} sitios confirman la forma por vocabulario`);
    if (structuralNote) parts.push(structuralNote);
    return { holds: true, evidence: parts.join("; ") + "." };
  },
};

/**
 * REQUIRED 2 — **¿alguien OPERA sobre esos hijos?** Composite existe para que
 * el cliente no tenga que distinguir hoja de compuesto al ejecutar una
 * operación. Si ningún miembro de la propia clase lee la colección de hijos,
 * no hay ninguna operación que unificar: es una estructura de datos
 * autorreferencial (un DTO, un archivo de tipos `.d.ts`), y proponer Composite
 * ahí es proponer una interfaz para nadie.
 *
 * MEDIDO: es exactamente la razón que el juicio de la Ola U escribió, dos
 * veces, sobre los dos únicos casos del censo que SÍ tenían una colección real
 * de hijos — newtonsoft `JsonSchema.cs:154` (`IList<JsonSchema> Items`,
 * propiedad autoimplementada de un DTO: nadie la recorre en la clase) y eslint
 * `index.d.ts:152` (`childScopes: Scope[]` en un `.d.ts`: "la lógica real vive
 * fuera de este repo").
 *
 * Para el ancla `distributed-duplication` este check DELEGA en el anterior: la
 * operación que recorre los hijos ES la duplicación que `hay-arbol-parte-todo`
 * ya confirmó sitio por sitio (mismo criterio de delegación explícita que
 * `decorator.ts#REQUIRED_ACCUMULATOR` declara para su propia escalera).
 */
const alguienOperaSobreLosHijos: Check<CompositeProblem, CodeGraph | null> = {
  id: "alguien-opera-sobre-los-hijos",
  describe:
    "Algún miembro function-like de la MISMA clase — o, si el ancla es una interfaz sin cuerpos propios, de un " +
    "hermano del mismo archivo que declara implementarla/extenderla (ver `hermanosQueImplementan`) — lee la " +
    "colección de hijos: existe una operación real que hoy tiene que distinguir hoja de compuesto (para una " +
    "duplicación distribuida, esa operación son los propios sitios duplicados, ya confirmados por el check anterior).",
  run(problem) {
    if (!isSelfReferentialAnchor(problem)) {
      return {
        holds: true,
        evidence:
          `El ancla es "${problem.finding.kind}", no un tipo autorreferencial: la operación que recorre los hijos ` +
          "son los propios sitios duplicados, que el check `hay-arbol-parte-todo` ya evaluó uno por uno — este " +
          "check delega ahí y no agrega una segunda pregunta.",
      };
    }
    const forma = problem.forma;
    if (!forma) {
      return {
        holds: false,
        evidence: "Sin árbol vivo del archivo del hallazgo no hay forma de ver qué miembros leen la colección: queda sin evaluar, y sin evaluar no es candidata.",
      };
    }
    const cols = colecciones(forma);
    const operadas = cols.filter((m) => m.operadoPor.length > 0);
    if (operadas.length === 0) {
      return {
        holds: false,
        evidence:
          `Ningún miembro function-like de "${forma.clase}" ni de un hermano del archivo que declare implementarla/extenderla lee ` +
          `${cols.length > 0 ? `su(s) colección(es) de hijos (${cols.map((m) => `"${m.nombre ?? "?"}"`).join(", ")})` : "ninguna colección de hijos"}` +
          ": el tipo declara el árbol pero nadie opera sobre él en este archivo — es una estructura de datos, no un " +
          "tratamiento hoja/compuesto hecho a mano que Composite pueda reemplazar.",
      };
    }
    return {
      holds: true,
      evidence: operadas
        .map((m) => `"${m.nombre ?? "?"}" lo leen ${m.operadoPor.length} miembro(s) de la clase (${m.operadoPor.slice(0, 4).join(", ")})`)
        .join("; ") + ".",
    };
  },
};

/**
 * DISCRIMINADOR — el recorrido hoja/compuesto hecho A MANO: la colección de
 * hijos se lee DENTRO de una estructura de control (`sets.branchNodes`:
 * `if`/`for`/`while`/`switch`/ternario). Es la línea exacta que Composite
 * borra ("si no tiene hijos hago X, si tiene recorro y llamo a cada uno"), y
 * por eso sube la confianza — pero no hace candidata a la hipótesis: una
 * operación que simplemente agrega o devuelve la colección ya alcanza para que
 * exista un tratamiento que unificar.
 */
const recorridoManualDeLaColeccion: Check<CompositeProblem, CodeGraph | null> = {
  id: "recorrido-manual-de-la-coleccion",
  describe:
    "La colección de hijos se lee dentro de una estructura de control (if/for/while/switch) de algún miembro " +
    "de la clase: la distinción hoja-vs-compuesto se está haciendo a mano justo ahí.",
  run(problem) {
    const forma = problem.forma;
    if (!forma) return { holds: false, evidence: "Ancla sin tipo autorreferencial clasificable: este discriminador no aplica." };
    const conRecorrido = colecciones(forma).filter((m) => m.recorridoPor.length > 0);
    if (conRecorrido.length === 0) {
      return {
        holds: false,
        evidence: `Ninguna colección de hijos de "${forma.clase}" se lee dentro de un if/for/while/switch: hay operación, pero no un recorrido ni una decisión hoja-vs-compuesto visible.`,
      };
    }
    return {
      holds: true,
      evidence: conRecorrido
        .map((m) => `"${m.nombre ?? "?"}" se recorre o se decide dentro de una estructura de control en ${m.recorridoPor.slice(0, 4).join(", ")}`)
        .join("; ") + ".",
    };
  },
};

const collectionReinforcement: Check<CompositeProblem, CodeGraph | null> = {
  id: "refuerzo-coleccion",
  describe:
    "Refuerzo (nunca decisivo): el recursor confirmado tiene además un `invokes-indirect` hacia un portador " +
    "`carrierForm: collection-element` — la recursión ocurre sobre una COLECCIÓN, no un campo único.",
  run(problem, graph) {
    if (!graph) return { holds: false, evidence: "Sin grafo: no evaluado." };
    const index = problem.indice();
    if (!index) return { holds: false, evidence: "Sin grafo: no evaluado." };
    const protocol = protocoloRelevante(index, problem);
    if (!protocol) return { holds: false, evidence: "Sin protocolo compartido relevante: no aplica." };
    const { recursors } = classifyProtocol(index, protocol);
    for (const { imp, recursion } of recursors) {
      if (hasCollectionReinforcement(index, recursion.memberId)) {
        return {
          holds: true,
          evidence: `"${imp.id}" recursa Y además tiene invokes-indirect hacia un portador collection-element: confirmado que ocurre sobre una colección.`,
        };
      }
    }
    return {
      holds: false,
      evidence:
        "Ningún recursor confirmado muestra invokes-indirect hacia un portador collection-element — DECLARADO: " +
        "`graph/edges/invocacion-indirecta.ts` sólo implementa hoy la Forma 3(a) (llamada directa a un campo-" +
        "callback), no la Forma 4 (recorrido de colección + invocación del elemento, registro de pendientes " +
        "§C1) — este refuerzo está descrito y probado, pero inerte en producción hasta que esa forma exista.",
    };
  },
};

const APPLIED_LABEL =
  "¿El grafo muestra, cerca de estos archivos, un implementador que reenvía a su propia interfaz " +
  "(recursión confirmada) más al menos una hoja que no, o recursión ad hoc sobre el propio tipo sin interfaz?";

/** La MISMA pregunta que `APPLIED_LABEL`, pero hecha sobre el TIPO anclado en
 *  vez de "cerca de estos archivos" — ver `estadoAplicadoDelTipoAncla`. */
const APPLIED_LABEL_TIPO =
  "¿El tipo de este hallazgo implementa una interfaz que reenvía el MISMO miembro a sus hijos (recursión " +
  "confirmada) y existe al menos una hoja que implementa esa interfaz SIN reenviar?";

const SATISFIES_RISK =
  " Riesgo declarado (registro de pendientes §A9): al menos una de estas relaciones se resolvió por " +
  "`satisfies` (estructural) en vez de `implements` (declarado) — el umbral de esa derivación nunca se " +
  "auditó sobre C#.";

const DORMANT_ROLE_NOTE =
  " DECLARADO: esta ausencia no es evidencia de que no recurse — las aristas `calls` con rol " +
  "`receiver-member` rara vez sobreviven la resolución hoy (mismo hallazgo medido en `wrapping-chain.ts`: " +
  "0 de miles de aristas `calls`/`references` de guava llevan ese rol; confirmado de nuevo acá con " +
  "sondas directas — ver docstring del módulo). El protocolo compartido se ve, la recursión no se puede " +
  "confirmar NI descartar con los hechos disponibles hoy.";

/**
 * OLA V (V2) — el estado del patrón cuando el ancla es UN TIPO
 * autorreferencial (no una duplicación entre archivos). La pregunta es la del
 * plan de intenciones: *¿este tipo implementa una interfaz `I`, reenvía el
 * MISMO mensaje a sus hijos a través de `I`, y existe al menos una HOJA que
 * implementa `I` sin ese reenvío?* — la última cláusula es la que separa
 * Composite de una delegación cualquiera.
 *
 * Las tres diferencias con la rama de duplicación distribuida, todas por la
 * misma razón (acá SÍ hay un tipo anclado, así que se le puede preguntar a él
 * en vez de a sus vecinos de archivo):
 *   1. el protocolo es el que implementa EL TIPO (`protocoloDelTipoAncla`);
 *   2. sin protocolo, `ausente` dice qué le falta al TIPO, no al archivo;
 *   3. con protocolo pero SIN recursión confirmada el estado es `ausente`, no
 *      `parcial`: "existe una interfaz que este tipo implementa" no es
 *      "Composite está a medio aplicar" — el reenvío uniforme es justamente lo
 *      que no se ve, y el `DORMANT_ROLE_NOTE` explica que no se ve porque las
 *      aristas `calls` con rol `receiver-member` no sobreviven la resolución
 *      hoy, no porque se haya comprobado que no existe.
 */
function estadoAplicadoDelTipoAncla(problem: CompositeProblem, forma: FormaDelAncla, index: Index): AppliedStateResult {
  const archivo = problem.finding.locations[0]?.file ?? "";
  const protocol = protocoloDelTipoAncla(index, forma, archivo);
  if (!protocol) {
    return {
      state: "ausente",
      checks: [
        {
          label: APPLIED_LABEL_TIPO,
          passed: false,
          why:
            `"${forma.clase}" no implementa (implements/satisfies) ninguna interfaz con >=2 implementadores en el ` +
            "grafo: hoja y compuesto no comparten todavía ningún tipo común, así que no hay forma de tratarlos " +
            "igual — Composite no está aplicado sobre este árbol.",
          role: "applied",
        },
      ],
    };
  }

  const { recursors, leaves } = classifyProtocol(index, protocol);
  const risk = protocol.viaSatisfies ? SATISFIES_RISK : "";

  if (recursors.length === 0) {
    return {
      state: "ausente",
      checks: [
        {
          label: APPLIED_LABEL_TIPO,
          passed: false,
          why:
            `"${forma.clase}" implementa "${protocol.interfaceId}" (${protocol.implementers.length} implementadores), ` +
            "pero ninguna arista `calls` con rol receiver-member muestra que alguno reenvíe el miembro homónimo de " +
            "esa interfaz a sus hijos: la interfaz existe, el tratamiento uniforme del árbol no se ve." +
            DORMANT_ROLE_NOTE +
            risk,
          role: "applied",
        },
      ],
    };
  }

  if (leaves.length === 0) {
    return {
      state: "parcial",
      checks: [
        {
          label: APPLIED_LABEL_TIPO,
          passed: true,
          why:
            `Los ${recursors.length} implementadores de "${protocol.interfaceId}" recursan confirmados, pero ninguno ` +
            "es una hoja (todos reenvían): sin un caso base observable no se puede confirmar la forma completa " +
            "hoja/compuesto." +
            risk,
          role: "applied",
        },
      ],
    };
  }

  return {
    state: "ya-aplicado",
    checks: [
      {
        label: APPLIED_LABEL_TIPO,
        passed: true,
        why:
          `"${protocol.interfaceId}" ya tiene ${recursors.length} implementador(es) que reenvían al miembro homónimo ` +
          `de la interfaz (recursión confirmada, rol receiver-member) y ${leaves.length} hoja(s) que NO recurren: ` +
          `Composite ya está aplicado sobre el árbol de "${forma.clase}".` + risk,
        role: "applied",
      },
    ],
  };
}

function appliedState(problem: CompositeProblem, graph: CodeGraph | null): AppliedStateResult {
  if (!graph) {
    return {
      state: "ausente",
      checks: [
        {
          label: APPLIED_LABEL,
          passed: false,
          why: "Sin grafo entre archivos no hay forma de ver implements/satisfies/calls: no evaluado. Se resuelve `ausente` por falta de evidencia — nunca `ya-aplicado`/`aplicado-eludido` sin poder confirmarlo con el grafo (regla dura del motor).",
          role: "applied",
        },
      ],
    };
  }

  const index = problem.indice();
  if (!index) {
    return {
      state: "ausente",
      checks: [{ label: APPLIED_LABEL, passed: false, why: "Sin índice de grafo: no evaluado. Se resuelve `ausente` por falta de evidencia.", role: "applied" }],
    };
  }
  if (problem.forma) return estadoAplicadoDelTipoAncla(problem, problem.forma, index);

  const siteFiles = siteFilesOf(problem);
  const textualConfirmed = confirmedSites(problem).length >= 2;
  const protocol = findRelevantProtocol(index, siteFiles);

  if (!protocol) {
    const adHoc = findAdHocRecursion(index, siteFiles);
    if (adHoc) {
      return {
        state: "parcial",
        checks: [
          {
            label: APPLIED_LABEL,
            passed: true,
            why:
              `"${adHoc.owner}" llama a su propio miembro "${adHoc.recursion.member.name}" (aridad ` +
              `${adHoc.recursion.member.arity ?? "desconocida"}) sobre otro receptor del mismo tipo (rol ` +
              "receiver-member confirmado) — recursión ad hoc confirmada, pero SIN una interfaz común: no hay " +
              "forma de tratar hoja y compuesto igual todavía. DECLARADO: a nivel de símbolo esto es " +
              "indistinguible de una recursión ordinaria sin relación con Composite (factorial, mergesort) — " +
              "sólo se reporta porque ya hay una duplicación distribuida anclando este archivo.",
            role: "applied",
          },
        ],
      };
    }
    return {
      state: "ausente",
      checks: [
        {
          label: APPLIED_LABEL,
          passed: false,
          why:
            "Ningún tipo del grafo tiene >=2 implementadores implements/satisfies relevantes a estos archivos, " +
            "ni recursión ad hoc confirmada sobre el propio tipo: no hay evidencia estructural de un protocolo " +
            "hoja/compuesto cerca de estos sitios.",
          role: "applied",
        },
      ],
    };
  }

  const { recursors, leaves } = classifyProtocol(index, protocol);
  const risk = protocol.viaSatisfies ? SATISFIES_RISK : "";

  if (recursors.length === 0) {
    return {
      state: "parcial",
      checks: [
        {
          label: APPLIED_LABEL,
          passed: true,
          why:
            `"${protocol.interfaceId}" ya tiene ${protocol.implementers.length} implementadores relevantes a ` +
            "estos archivos, pero ninguna arista `calls` con rol receiver-member confirma que alguno reenvíe " +
            "al miembro homónimo de la interfaz." +
            DORMANT_ROLE_NOTE +
            risk,
          role: "applied",
        },
      ],
    };
  }

  if (leaves.length === 0) {
    return {
      state: "parcial",
      checks: [
        {
          label: APPLIED_LABEL,
          passed: true,
          why:
            `Los ${recursors.length} implementadores de "${protocol.interfaceId}" relevantes a estos archivos ` +
            "recursan confirmados, pero ninguno es una hoja (todos reenvían): sin un caso base observable no " +
            "se puede confirmar la forma completa hoja/compuesto." +
            risk,
          role: "applied",
        },
      ],
    };
  }

  // COMPLETA: >=1 recursor confirmado + >=1 hoja sin la arista.
  const state: PatternState = textualConfirmed ? "aplicado-eludido" : "ya-aplicado";
  const why =
    state === "ya-aplicado"
      ? `"${protocol.interfaceId}" ya tiene ${recursors.length} implementador(es) que reenvían al miembro ` +
        `homónimo de la interfaz (recursión confirmada, rol receiver-member) y ${leaves.length} hoja(s) que ` +
        "NO recurren: Composite ya está aplicado limpiamente cerca de estos archivos."
      : `"${protocol.interfaceId}" ya tiene la forma completa (${recursors.length} recursor(es), ` +
        `${leaves.length} hoja(s)) cerca de estos archivos, pero el recorrido manual detectado en el propio ` +
        "hallazgo (>=2 sitios reinventan hoja/hijos con vocabulario) lo está PUENTEANDO — quien duplica no está " +
        "usando el protocolo ya disponible.";

  return {
    state,
    checks: [{ label: APPLIED_LABEL, passed: true, why: why + risk, role: "applied" }],
  };
}

const SOURCE =
  "refactoring.guru/design-patterns/composite — \"Aplicabilidad\": " +
  "\"cuando tengas que implementar una estructura de objetos con forma de árbol\"; " +
  "Kerievsky, Refactoring to Patterns, cap. 9: \"Replace Implicit Tree with Composite\".";

const TO_CONFIRM: readonly string[] = [
  "Confirmar que hay una jerarquía real hoja/compuesto en cada sitio (no sólo un array o JSON anidado " +
    "genérico) antes de introducir clases.",
  "Descartar Iterator: si el recorrido es plano (una sola lista, sin distinguir hoja de nodo con hijos), " +
    "el smell es otro, no Composite.",
  "La multiplicidad se lee de la GRAMÁTICA del tipo declarado, no de su significado: un genérico de otro " +
    "tipo con el propio tipo como argumento cuenta como colección, así que un envoltorio de uno solo " +
    "(`Optional<Self>`, `Promise<Self>`, `Lazy<Self>`) puede colarse — confirmar que la colección tiene " +
    "de verdad más de un elemento.",
  "Un `ya-aplicado`/`parcial` estructural de esta hipótesis es una pista de grafo, no una prueba leída del " +
    "código: las aristas `calls` con receptor rara vez sobreviven la resolución hoy (ver docstring del " +
    "módulo) — confirmar a mano que el reenvío realmente ocurre.",
];


/* ════════════════════════════════════════════════════════════════════════
 * OLA AE (frente AE7) — EL CAMINO DEL ANCLA-FUERZA `recursive-collection-descent`
 *
 * TODO lo de esta sección es CÓDIGO NUEVO detrás de
 * `problem.kind === RECURSIVE_COLLECTION_DESCENT_KIND`. **No toca ni un
 * `required`, ni un discriminador, ni una rama de `appliedState`, ni un umbral
 * de los DOS caminos que ya existían** (`distributed-duplication` y
 * `self-referential-member`): esta ola es ADITIVA y la prueba está por
 * construcción, además de por medición (informe AE7 §3).
 *
 * POR QUÉ HACE FALTA UN CAMINO PROPIO Y NO SE REUSA EL DE ARRIBA. Los dos
 * caminos viejos preguntan por la ESTRUCTURA del árbol: `arbolParteTodo`
 * clasifica el TIPO declarado de un miembro autorreferencial (y devuelve
 * `holds:false` cuando no hay tipo declarado, que es el caso de Ruby, Python,
 * JavaScript y Go), y `alguienOperaSobreLosHijos` busca quién LEE ese miembro.
 * El ancla nueva no trae un miembro autorreferencial: trae OPERACIONES que
 * deciden a mano. Meterla por el camino viejo la dejaría muda siempre, por una
 * razón falsa.
 * ════════════════════════════════════════════════════════════════════════ */

/** PISO ALINEADO CON EL DETECTOR (compuerta `threshold-alignment.test.ts`):
 *  `detect/intra-file/recursive-collection-descent.ts#MIN_MIEMBROS_QUE_DISTINGUEN`.
 *  Copia deliberada, mismo argumento que `SELF_REFERENTIAL_MEMBER_FLOOR` de
 *  arriba ya declara: sin este chequeo un `Finding` sintético por debajo del
 *  piso real del detector sería aceptado acá, un desajuste mudo. */
const DESCENSO_MIN_OPERACIONES = 2;

function esAnclaDeDescenso(problem: CompositeProblem): boolean {
  return problem.finding.kind === RECURSIVE_COLLECTION_DESCENT_KIND;
}

/** El dueño del recorrido: el `symbolPath` de las ubicaciones es
 *  `[Tipo, miembro]`, así que el dueño es todo menos el último segmento.
 *  `null` cuando el recorrido son funciones sueltas sin tipo que las envuelva
 *  — un caso legítimo (Go, Python, JavaScript de módulo) que NO descalifica:
 *  sólo hace que el discriminador `hay-un-tipo-donde-poner-la-jerarquia` no
 *  suba un peldaño. */
function duenoDelDescenso(problem: CompositeProblem): string | null {
  const path = problem.finding.locations[0]?.anchor?.symbolPath ?? [];
  return path.length > 1 ? path[path.length - 2]! : null;
}

function operacionesDelDescenso(problem: CompositeProblem): readonly string[] {
  return [...new Set(problem.finding.locations.map((l) => l.symbol).filter((s): s is string => !!s))];
}

/** El nodo class-like del dueño en el grafo, buscado por ÚLTIMO segmento del
 *  `symbolPath` dentro del archivo del hallazgo — mismo desajuste
 *  nombre-simple/camino-completo que `nodoDelTipoAncla` ya documenta para el
 *  otro camino, resuelto igual. */
function nodoDelDueno(index: Index, dueno: string, archivo: string): CodeGraphNode | null {
  for (const n of index.nodeById.values()) {
    if (n.kind !== "symbol" || n.family !== "class-like" || n.file !== archivo) continue;
    if (n.symbolPath[n.symbolPath.length - 1] === dueno) return n;
  }
  return null;
}

/** Cuántos subtipos declara cada tipo (destino de `implements`/`satisfies`/
 *  `extends`) — se recorre el índice una vez por consulta, y sólo lo consulta
 *  el camino nuevo. */
function subtiposPorTipo(index: Index): Map<string, number> {
  const out = new Map<string, number>();
  for (const edges of index.edgesFrom.values()) {
    for (const e of edges) {
      if (e.kind !== "implements" && e.kind !== "satisfies" && e.kind !== "extends") continue;
      out.set(e.to, (out.get(e.to) ?? 0) + 1);
    }
  }
  return out;
}

interface PuertaDelDescenso {
  /** Supertipo con >=2 subtipos que YA declara una de las operaciones. */
  readonly tipoConLaOperacion: string | null;
  /** Cualquier supertipo declarado por el dueño, aunque no traiga la operación. */
  readonly algunSupertipo: string | null;
}

function puertaDelDescenso(index: Index, problem: CompositeProblem): PuertaDelDescenso {
  const vacia: PuertaDelDescenso = { tipoConLaOperacion: null, algunSupertipo: null };
  const dueno = duenoDelDescenso(problem);
  const archivo = problem.finding.locations[0]?.file;
  if (!dueno || !archivo) return vacia;
  const tipo = nodoDelDueno(index, dueno, archivo);
  if (!tipo) return vacia;
  const operaciones = new Set(operacionesDelDescenso(problem));
  const subtipos = subtiposPorTipo(index);
  let algunSupertipo: string | null = null;
  for (const e of index.edgesFrom.get(tipo.id) ?? []) {
    if (e.kind !== "implements" && e.kind !== "satisfies" && e.kind !== "extends") continue;
    algunSupertipo ??= e.to;
    if ((subtipos.get(e.to) ?? 0) < 2) continue;
    for (const m of membersOf(index, e.to)) {
      if (operaciones.has(m.name)) return { tipoConLaOperacion: e.to, algunSupertipo: algunSupertipo ?? e.to };
    }
  }
  return { tipoConLaOperacion: null, algunSupertipo };
}

/**
 * REQUIRED 1 del camino nuevo — **¿la decisión está REPETIDA?** Composite
 * cuesta un tipo común, un tipo hoja y un tipo compuesto: con UNA sola
 * operación que decide hoja-vs-compuesto la mitigación más barata es dejar la
 * rama donde está. Es la condición de ESCALA de la receta, re-preguntada acá
 * al grano del `Finding` (el detector la decidió al grano del grupo).
 */
const decisionRepetida: Check<CompositeProblem, CodeGraph | null> = {
  id: "la-decision-esta-repetida",
  describe:
    "Al menos dos operaciones DISTINTAS del mismo dueño deciden a mano si son hoja o compuesto antes de " +
    "descender sobre la misma colección: la distinción se repite, así que cada operación nueva la va a repetir.",
  run(problem) {
    const operaciones = operacionesDelDescenso(problem);
    const valor = problem.finding.trigger[0]?.value ?? operaciones.length;
    const holds = operaciones.length >= DESCENSO_MIN_OPERACIONES && valor >= DESCENSO_MIN_OPERACIONES;
    return {
      holds,
      evidence: holds
        ? `${operaciones.length} operaciones deciden hoja-vs-compuesto sobre la misma colección: ${operaciones.map((o) => `"${o}"`).join(", ")}.`
        : `Sólo ${operaciones.length} operación(es) con la decisión escrita a mano (piso ${DESCENSO_MIN_OPERACIONES}): con una sola, la mitigación más barata es dejar la rama donde está.`,
    };
  },
};

/**
 * REQUIRED 2 del camino nuevo — **RESOLUCIÓN VERIFICADA: ¿el tratamiento
 * uniforme YA existe?** Si el dueño del recorrido ya implementa/extiende un
 * tipo con ≥2 subtipos que DECLARA una de estas operaciones, entonces hoja y
 * compuesto ya comparten un tipo con esa operación y el cliente ya podría no
 * distinguir: lo que falta no es Composite, es usar el que hay (Replace
 * Conditional with Polymorphism). **Sin grafo NO aprueba** — `holds:false` con
 * "no pude mirar", nunca un `required` permisivo
 * (`no-permissive-required.test.ts`).
 */
const sinTipoComunParaLaOperacion: Check<CompositeProblem, CodeGraph | null> = {
  id: "hoja-y-compuesto-sin-tipo-comun",
  describe:
    "El dueño del recorrido NO implementa/extiende todavía ningún tipo con >=2 subtipos que declare alguna de " +
    "estas operaciones: no existe un tratamiento uniforme de hoja y compuesto al que el cliente pudiera acudir.",
  run(problem) {
    const index = problem.indice();
    if (!index) {
      return {
        holds: false,
        evidence:
          "Sin grafo entre archivos no hay forma de ver si el dueño ya implementa un tipo común que declare " +
          "estas operaciones: queda sin evaluar, y sin evaluar no es candidata.",
      };
    }
    const puerta = puertaDelDescenso(index, problem);
    if (puerta.tipoConLaOperacion) {
      return {
        holds: false,
        evidence:
          `"${puerta.tipoConLaOperacion}" ya tiene >=2 subtipos y declara una de estas operaciones: el tratamiento ` +
          "uniforme de hoja y compuesto YA está disponible. Lo que falta acá no es un Composite nuevo sino usar el " +
          "que hay — es otra refactorización (Replace Conditional with Polymorphism), no ésta.",
      };
    }
    return {
      holds: true,
      evidence:
        "Ningún tipo con >=2 subtipos declarado por el dueño trae estas operaciones: hoja y compuesto no tienen " +
        "todavía forma de responder al mismo mensaje.",
    };
  },
};

/** DISCRIMINADOR — más operaciones que deciden = más trabajo que el tipo común
 *  ahorra. Nunca decisivo. */
const tresOMasOperaciones: Check<CompositeProblem, CodeGraph | null> = {
  id: "tres-o-mas-operaciones-que-deciden",
  describe: "Tres o más operaciones repiten la decisión hoja-vs-compuesto: cuantas más, más trabajo ahorra el tipo común.",
  run(problem) {
    const n = operacionesDelDescenso(problem).length;
    return { holds: n >= 3, evidence: `${n} operaciones repiten la decisión.` };
  },
};

/** DISCRIMINADOR — la forma más fuerte de la decisión: una rama explícita
 *  (`if hoja … else recorrer`) en vez de sólo salidas tempranas. La rama
 *  explícita es literalmente la línea que Composite borra. */
const ramaExplicita: Check<CompositeProblem, CodeGraph | null> = {
  id: "al-menos-una-rama-explicita",
  describe:
    "Al menos una de las operaciones escribe la decisión como una rama explícita (una rama recorre, la otra no), " +
    "no sólo como una salida temprana: es exactamente la línea que Composite borra.",
  run(problem) {
    const conRama = problem.finding.locations.filter((l) => l.role.includes(ROLE_RAMA_EXPLICITA));
    return {
      holds: conRama.length > 0,
      evidence:
        conRama.length > 0
          ? `${conRama.length} operación(es) con rama explícita: ${conRama.map((l) => `"${l.symbol ?? "?"}"`).join(", ")}.`
          : "Todas las operaciones escriben la decisión como salida temprana (guarda), no como dos ramas.",
    };
  },
};

/** DISCRIMINADOR — ¿hay un TIPO donde poner la jerarquía? Un recorrido escrito
 *  en funciones sueltas de un archivo sin tipo que las envuelva sigue siendo
 *  candidato (la fuerza está), pero la mitigación cuesta más: hay que inventar
 *  el tipo antes de poder repartirlo en hoja y compuesto. */
const tipoDondePonerLaJerarquia: Check<CompositeProblem, CodeGraph | null> = {
  id: "hay-un-tipo-donde-poner-la-jerarquia",
  describe:
    "Las operaciones que deciden pertenecen a un tipo que el grafo ya conoce: hay dónde poner la hoja y el " +
    "compuesto sin inventar primero el tipo.",
  run(problem) {
    const dueno = duenoDelDescenso(problem);
    if (!dueno) return { holds: false, evidence: "El recorrido está escrito en funciones sueltas, sin un tipo que las envuelva: no evaluado." };
    const index = problem.indice();
    const archivo = problem.finding.locations[0]?.file;
    if (!index || !archivo) return { holds: false, evidence: "Sin grafo: no evaluado." };
    const nodo = nodoDelDueno(index, dueno, archivo);
    return {
      holds: nodo !== null,
      evidence: nodo ? `El dueño "${dueno}" existe como tipo en el grafo.` : `"${dueno}" no aparece como tipo en el grafo de este archivo.`,
    };
  },
};

const APPLIED_LABEL_DESCENSO =
  "¿Hoja y compuesto ya comparten un tipo, y ese tipo ya declara la operación que hoy cada cliente decide a mano?";

/**
 * LA ESCALERA DE ESTADO DEL CAMINO NUEVO, con su límite escrito:
 *
 *   - `parcial` — el dueño YA declara algún supertipo, pero ninguno con >=2
 *     subtipos que traiga estas operaciones: **media puerta**. El tipo común
 *     existe; el mensaje uniforme, no.
 *   - `ausente` — el dueño no declara ningún supertipo: ni el tipo ni el
 *     mensaje.
 *
 * **`ya-aplicado` y `aplicado-eludido` son INALCANZABLES desde este camino, y
 * lo digo con todas las letras**, con el mismo criterio con el que AD4 lo dijo
 * de su propia ancla: el detector se CALLA cuando la puerta ya existe (sus
 * condiciones (4) y (5)) y este `required` la vuelve a verificar, así que un
 * hallazgo que llega hasta acá es, por construcción, uno donde el tratamiento
 * uniforme no está. **Que no produzca `ya-aplicado` NO es mérito suyo.** Lo
 * que sí es mérito medible es el silencio del detector cuando la puerta existe,
 * y hay cuatro tests que lo exigen.
 */
function estadoDelDescenso(problem: CompositeProblem): AppliedStateResult {
  const index = problem.indice();
  if (!index) {
    return {
      state: "ausente",
      checks: [
        {
          label: APPLIED_LABEL_DESCENSO,
          passed: false,
          why: "Sin grafo entre archivos no hay forma de ver implements/satisfies/extends: no evaluado. Se resuelve `ausente` por falta de evidencia — nunca `ya-aplicado`/`aplicado-eludido` sin poder confirmarlo con el grafo (regla dura del motor).",
          role: "applied",
        },
      ],
    };
  }
  const dueno = duenoDelDescenso(problem);
  const puerta = puertaDelDescenso(index, problem);
  if (puerta.algunSupertipo) {
    return {
      state: "parcial",
      checks: [
        {
          label: APPLIED_LABEL_DESCENSO,
          passed: true,
          why:
            `"${dueno ?? "el dueño del recorrido"}" ya declara el supertipo "${puerta.algunSupertipo}", pero ninguno de sus ` +
            "supertipos con >=2 subtipos declara las operaciones que hoy deciden a mano: el tipo común ya existe y el " +
            "mensaje uniforme todavía no. Media puerta — mover estas operaciones al tipo que ya está es más barato que " +
            "construir la jerarquía desde cero.",
          role: "applied",
        },
      ],
    };
  }
  return {
    state: "ausente",
    checks: [
      {
        label: APPLIED_LABEL_DESCENSO,
        passed: false,
        why:
          `"${dueno ?? "el dueño del recorrido"}" no declara ningún supertipo en el grafo: hoja y compuesto no comparten ` +
          "todavía ningún tipo, así que no hay forma de tratarlos igual. Composite no está aplicado sobre este árbol.",
        role: "applied",
      },
    ],
  };
}

const TO_CONFIRM_DESCENSO: readonly string[] = [
  "Confirmar que los elementos sobre los que se desciende son del MISMO tipo que el que desciende (un árbol " +
    "real, no una recursión sobre otra estructura): el grafo de este proyecto no resuelve el tipo del receptor " +
    "(`graph/resolve.ts#syntacticRoleStage` rechaza de forma terminal `receiver-member` con calificador " +
    "no-constante), así que esa mitad NO está verificada por la herramienta.",
  "Descartar Iterator: si lo único que pasa es que hay que recorrer una colección plana, el patrón es otro.",
  "Confirmar que la rama \"hoja\" y la rama \"compuesto\" hacen la MISMA operación con distinta multiplicidad. Si " +
    "hacen cosas genuinamente distintas, la rama no es una distinción hoja/compuesto y Composite no la borra.",
  "Si el dueño ya pertenece a una jerarquía (estado `parcial`), la mitigación más barata es mover estas " +
    "operaciones al tipo que ya existe, no crear una jerarquía nueva.",
];

function buildDescensoSpec(): HypothesisSpec<CompositeProblem, CodeGraph | null> {
  return {
    pattern: "Composite",
    ceiling: "media",
    needs: [],
    required: [decisionRepetida, sinTipoComunParaLaOperacion],
    discriminators: [tresOMasOperaciones, ramaExplicita, tipoDondePonerLaJerarquia],
    appliedState: (problem) => estadoDelDescenso(problem),
    toConfirm: TO_CONFIRM_DESCENSO,
    source: SOURCE,
  };
}

function buildSpec(compositeProblem: CompositeProblem, ctx: HypothesisContext): HypothesisSpec<CompositeProblem, CodeGraph | null> {
  return {
    pattern: "Composite",
    ceiling: "media",
    needs: [],
    required: [arbolParteTodo, alguienOperaSobreLosHijos],
    discriminators: [
      recorridoManualDeLaColeccion,
      allSitesConfirm,
      consistentVocabulary,
      collectionReinforcement,
      treeAlreadyFormedCheck(ctx),
      isolatedHierarchyCheck(ctx),
    ],
    appliedState,
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * OLA AI, FRENTE AI6 — LA TRAZA DEL EMBUDO. Mismo mecanismo, misma forma y
 * mismo default que `strategy.ts#startStrategyTrace` (Ola AH) y que
 * `engine.ts#startArbitrationTrace`: ningún `process.env` en el camino de
 * análisis, se prende llamando `startAi6Trace()` desde un script de medición
 * y se apaga sola al leerla. `null` (el default de producción) ⇒ costo cero:
 * ni una rama de más por hallazgo, ni un check de más corrido.
 *
 * QUÉ CONTESTA, y por qué el volcado de producción no puede contestarlo: el
 * volcado sólo publica lo que SOBREVIVE — `engine.ts#build` devuelve `null`
 * en cuanto UN `required` no se sostiene, y con él se pierde CUÁL no se
 * sostuvo. La pregunta de esta ola ("¿hay un `required` que, para un
 * subconjunto identificable de su entrada, no se pueda satisfacer POR
 * CONSTRUCCIÓN?") no es respondible sin el resultado de CADA `required`
 * también en los hallazgos que no emiten. Con la traza prendida se re-corren
 * los `required` y `appliedState` de esta hipótesis (son puros: leen
 * `problem`/`graph`/`ctx` y no escriben nada) para registrar el resultado
 * por check y el estado que la hipótesis HABRÍA tenido.
 * ──────────────────────────────────────────────────────────────────────── */

export interface Ai6TraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly language: string | null;
  readonly file: string;
  readonly line: number;
  readonly symbol: string;
  /** `locations[0].role` — el detector escribe ahí la sub-forma (p.ej. `(tipado)`/`(literal)`). */
  readonly role: string;
  /** Cuál de los caminos del archivo corrió (un archivo puede tener specs distintos por ancla). */
  readonly camino: string;
  readonly withGraph: boolean;
  /** ¿había árbol vivo? — el eje que separa "no se pudo confirmar" de "se confirmó que no". */
  readonly withFile: boolean;
  readonly checks: readonly { readonly id: string; readonly holds: boolean; readonly why: string }[];
  /** El primero de `required` que NO se sostiene; `null` si todos se sostienen. Con `spec === null` (muerte ANTES del motor) lleva el motivo, prefijado `pre-spec:`. */
  readonly diesAt: string | null;
  /** El estado que `appliedState` decide — se registra TAMBIÉN cuando un `required` mata la hipótesis, porque es el dato que dice qué se está perdiendo. */
  readonly appliedState: string;
  readonly emitted: boolean;
}

let ai6Trace: Ai6TraceEntry[] | null = null;

export function startAi6Trace(): void {
  ai6Trace = [];
}

export function takeAi6Trace(): readonly Ai6TraceEntry[] {
  const t = ai6Trace ?? [];
  ai6Trace = null;
  return t;
}

export function ai6TraceEnabled(): boolean {
  return ai6Trace !== null;
}

function ai6Record<P, G>(
  camino: string,
  spec: HypothesisSpec<P, G> | null,
  problem: Finding,
  p: P,
  g: G,
  ctx: HypothesisContext,
  graphPresent: boolean,
  emitted: boolean,
  motivo?: string,
): void {
  if (!ai6Trace) return;
  const loc = problem.locations[0];
  const checks = spec
    ? spec.required.map((c) => {
        const r = c.run(p, g);
        return { id: c.id, holds: r.holds, why: r.evidence };
      })
    : [];
  ai6Trace.push({
    findingId: problem.id,
    kind: problem.kind,
    language: problem.language,
    file: loc?.file ?? "",
    line: loc?.startLine ?? 0,
    symbol: loc?.symbol ?? "",
    role: loc?.role ?? "",
    camino,
    withGraph: graphPresent,
    withFile: ctx.file !== null,
    checks,
    diesAt: spec ? (checks.find((c) => !c.holds)?.id ?? null) : `pre-spec:${motivo ?? "?"}`,
    // `appliedState` sólo se evalúa cuando TODOS los `required` se sostienen —
    // que es exactamente cuando producción también lo evalúa. Evaluarlo
    // siempre (la forma de `strategy.ts#recordStrategyTrace`) multiplicaba por
    // ~2 el costo de guava: `command.ts#appliedState` recorre el grafo del
    // repo y el ancla `duplication` tiene 1.089 hallazgos en ese repo, de los
    // que 1.067 mueren en el primer `required`. Medido: 4,7 min → 8,3 min.
    appliedState: spec ? (checks.every((c) => c.holds) ? spec.appliedState(p, g).state : "(no evaluado: murió en un required)") : "(sin spec)",
    emitted,
  });
}

export const composite: HypothesisBuilder = {
  id: "composite",
  pattern: "Composite",
  layer: "patron",
  // OLA AE (AE7): el array SUMA el ancla-fuerza y conserva las dos viejas.
  //
  // OLA AY (frente AY5) — BAJA DE `self-referential-member` COMO ANCLA DE ESTA HIPOTESIS.
  // NO SE BORRA NADA: el detector `detect/intra-file/self-referential-member.ts` sigue
  // emitiendo su hallazgo de NIVEL 1 (y sigue en `detect/impact.ts`), `analizarFormaDelAncla`
  // y toda la rama `self-ref` de este modulo siguen en pie con sus tests. Lo unico que
  // cambia es que esta hipotesis deja de COLGAR una recomendacion de `Composite` de ese
  // hallazgo. Delta de nivel 1: CERO por construccion.
  //
  // EL NUMERO QUE LO DECIDE, medido con el instrumento que AY1 dejo arreglado, sobre el
  // censo de los 21 repos (`scratchpad-aterrizaje/censo-despues`) y los 162 archivos de
  // veredictos: la celda `Composite · self-referential-member` tiene **poblacion viva 13 y
  // las 13 estan juzgadas: V = 0, F = 13**. No es una muestra: es la poblacion ENTERA.
  // Y no es la lectura de un frente solo — la juzgaron CINCO frentes en CUATRO olas
  // (`ola-v/V7`, `ola-v/INTEGRADOR`, `ola-w/INTEGRADOR`, `ola-ad/AD5`, `ola-ag/AG2`),
  // sobre java, csharp y cuatro repos distintos (jenkins, guava, ShareX, newtonsoft-json),
  // y las 13 notas dicen lo mismo con distintas palabras: un miembro del propio tipo es
  // una ARISTA (padre, ancestro, grafo de compatibilidad, trie, octree, lista de
  // adyacencia), no la coleccion de hijos de un compuesto — o el Composite YA esta puesto.
  //
  // COSTO SOBRE VERDADERAS JUZGADAS: CERO, y por definicion, no por estimacion — V = 0 con
  // la poblacion completa juzgada. El limite que la Ola AY no negocia queda respetado.
  anchors: ["distributed-duplication", RECURSIVE_COLLECTION_DESCENT_KIND],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext) {
    const sites: CompositeSite[] = problem.locations.map((location) => {
      const clone = matchClone(ctx.repo.clones, location);
      return { location, clone, ...analyzeSite(clone) };
    });
    // La forma del ancla se lee UNA vez (recorre el árbol vivo) y el índice
    // del grafo se construye UNA vez y sólo si algún check lo pide — ver el
    // docstring de `CompositeProblem.indice`.
    let indiceMemo: Index | null | undefined;
    const compositeProblem: CompositeProblem = {
      finding: problem,
      sites,
      // Mismas dos condiciones que `isSelfReferentialAnchor` (kind + piso del
      // detector): así `forma` y esa función no pueden discrepar sobre si el
      // ancla es autorreferencial, que es lo que decide qué rama corren los
      // dos `required` y `appliedState`.
      forma:
        problem.kind === SELF_REFERENTIAL_MEMBER_KIND && (problem.trigger[0]?.value ?? 0) >= SELF_REFERENTIAL_MEMBER_FLOOR
          ? analizarFormaDelAncla(problem, ctx)
          : null,
      indice: () => {
        if (indiceMemo === undefined) indiceMemo = graph ? buildIndex(graph) : null;
        return indiceMemo;
      },
    };
    const spec = esAnclaDeDescenso(compositeProblem) ? buildDescensoSpec() : buildSpec(compositeProblem, ctx);

    const outcome = runEngine(spec, ctx.capabilities, compositeProblem, graph);
    if (ai6TraceEnabled()) {
      ai6Record(esAnclaDeDescenso(compositeProblem) ? "recursive-collection-descent" : "self-ref/dup", spec, problem, compositeProblem, graph, ctx, graph !== null, outcome !== null);
    }
    if (!outcome) return null;

    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: problem.locations,
      cost: esAnclaDeDescenso(compositeProblem)
        ? "Un tipo común para hoja y compuesto, más mover el recorrido adentro del compuesto: se paga una vez y " +
          "cada operación futura deja de pagar la decisión que hoy repite."
        : "Una interfaz común para hoja y compuesto (o un protocolo estructural en lenguajes sin clases) que " +
          "reemplace la rama if/else de cada sitio — se paga una vez, elimina la duplicación real de recorridos " +
          "entre estos sitios.",
    });
  },
};
