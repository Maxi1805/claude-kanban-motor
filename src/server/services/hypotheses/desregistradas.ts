/**
 * LAS HIPOTESIS DELIBERADAMENTE SIN REGISTRAR — la lista UNICA, Ola AZ, frente AZ1.
 *
 * POR QUE EXISTE COMO MODULO Y NO COMO CONSTANTE DE UN TEST. Vivio adentro de
 * `registries.test.ts` desde la Ola AX. La Ola AZ da de baja CUATRO patrones de una vez
 * (`Composite`, `Iterator`, `Null Object`, `Singleton`) y eso puso al descubierto que la lista
 * la necesitan DOS compuertas, no una:
 *
 *   · `registries.test.ts` — «un archivo de hipotesis en disco tiene que estar en `HYPOTHESES`,
 *     salvo que este declarado aca». Es la compuerta del REGISTRO.
 *   · `hypotheses/consumo-mecanismos.test.ts` — «ningun mecanismo del motor retrocede por debajo
 *     del piso medido». Es la compuerta del CONSUMO, y cuenta ARCHIVOS EN DISCO.
 *
 * La segunda se rompia sin esta lista, y se rompia MINTIENDO. Un desregistro deja el archivo en
 * disco con su codigo intacto —esa es literalmente la condicion 2 del encargo, «se desregistra,
 * no se borra»—, asi que ningun archivo dejo de consumir ningun mecanismo; lo unico que cambio
 * es cuantos de ellos estan en el arreglo `HYPOTHESES`. Contar solo los registrados hacia caer
 * cuatro mecanismos por debajo de su piso (`memberSignatures` 11→8, `arity` 15→11,
 * `instantiates` 10→8, `satisfies` 10→7) y la unica salida hubiera sido bajar los pisos, que es
 * re-congelar un baseline para que pase, que esta prohibido.
 *
 * Dos listas escritas a mano en dos lugares es exactamente como `scratchpad-ax7/censo-patrones.py`
 * quedo ciego a `Proxy` durante toda una ola. UNA sola lista, importada por las dos compuertas —
 * mismo convenio que `detect/precision/olas-bajo-compuerta.ts` y que
 * `detect/precision/patrones-retirados.ts`.
 *
 * LA RELACION CON `patrones-retirados.ts`, porque son DOS registros y cubren DOS cosas distintas:
 * aca va el ARCHIVO (para las compuertas que miran archivos en disco y el registro); alla va el
 * NOMBRE DE PATRON (para el instrumento de precision, que tiene que poder leer una clave historica
 * `<id>::<Patron>` de una hipotesis que dejo de emitirse sin abortar). Una baja de patron escribe
 * en los DOS.
 *
 * NO BORRAR UNA ENTRADA SIN BORRAR EL ARCHIVO: `registries.test.ts` se pone rojo solo si el
 * archivo desaparece del disco o si alguien lo re-registra sin sacar la declaracion.
 */
export interface HipotesisSinRegistrar {
  /** La ruta del archivo relativa a `src/server/services/`. */
  readonly file: string;
  /** El `id` del `HypothesisBuilder`, que es tambien el basename del archivo. */
  readonly id: string;
  readonly razon: string;
}

export const HIPOTESIS_DELIBERADAMENTE_SIN_REGISTRAR: readonly HipotesisSinRegistrar[] = [
  {
    file: "hypotheses/composite.ts",
    id: "composite",
    razon:
      "Ola AZ, frente AZ1 — BAJA DECIDIDA POR EL USUARIO con la tabla de los 17 patrones delante " +
      "(«yo apagaria todos los que no se pueden solucionar»). CONSTRUIDO Y MEDIDO con el " +
      "instrumento arreglado por AY1 sobre los 21 repos (Ghost adentro): 3/25 = 12 % [4 %, 30 %], " +
      "poblacion viva 25, ENTERA juzgada. PRECIO: 3 verdaderas, nombradas una por una en " +
      "ola-az/informes/AZ1.md §2 (hugo common/hmaps/params.go:338, jenkins " +
      "core/src/main/java/hudson/cli/DisablePluginCommand.java:144, newtonsoft-json " +
      "Src/Newtonsoft.Json/Bson/BsonBinaryWriter.cs:72) — las tres de `recursive-collection-descent`. " +
      "22 falsas apagadas, razon 7,3 falsas por verdadera. Sus dos anclas: " +
      "`recursive-collection-descent` queda HUERFANA (ninguna otra hipotesis la declara) y " +
      "`distributed-duplication` la siguen usando Command y Template Method. Delta de nivel 1 " +
      "CERO: los dos detectores-ancla siguen registrados y emitiendo, incluida la `advice.pattern` " +
      "de nivel 1 que nombra a Composite. Ver ola-az/informes/AZ1.md.",
  },
  {
    file: "hypotheses/iterator.ts",
    id: "iterator",
    razon:
      "Ola AZ, frente AZ1 — BAJA DECIDIDA POR EL USUARIO, misma decision que Composite. " +
      "CONSTRUIDO Y MEDIDO: 1/19 = 5 % [1 %, 25 %] sobre los 21 repos, poblacion viva 19, ENTERA " +
      "juzgada. PRECIO: 1 verdadera (eslint lib/rules/multiline-comment-style.js:408, ancla " +
      "`exposed-container-traversal`). 18 falsas apagadas, razon 18,0 falsas por verdadera — la " +
      "mejor de las tres bajas con costo. Sus dos anclas: `exposed-container-traversal` queda " +
      "HUERFANA y `distributed-duplication` la siguen usando Command y Template Method. Delta de " +
      "nivel 1 CERO. Ver ola-az/informes/AZ1.md.",
  },
  {
    file: "hypotheses/move-member.ts",
    id: "move-member",
    razon:
      "Ola AX, aterrizaje: entra como DEPENDENCIA de `extract-class.ts` (le provee el vocabulario de " +
      "acceso a miembros y auto-referencia), no como familia. Sus tres anclas — feature-envy-intra, " +
      "feature-envy-inter, inappropriate-intimacy — están las tres DESREGISTRADAS (AW4, AX8), así que " +
      "registrarlo daría de alta una familia que emite cero y que nadie midió. Ver ola-ax/informes/ATERRIZAJE.md.",
  },
  {
    file: "hypotheses/null-object.ts",
    id: "null-object",
    razon:
      "Ola AZ, frente AZ1 — BAJA DECIDIDA POR EL USUARIO, misma decision que Composite. " +
      "CONSTRUIDO Y MEDIDO: 5/52 = 10 % [4 %, 21 %] sobre los 21 repos, poblacion viva 66 (52 en " +
      "la base V+F mas 14 `problema-si-patron-no`), ENTERA juzgada. PRECIO: 5 verdaderas — 3 de " +
      "`repeated-absence-check` (ShareX ShareX/TaskManager.cs:169, gitea " +
      "models/issues/issue_search.go:131, gitea routers/api/packages/api.go:98) y 2 de " +
      "`duplication` (gitea models/actions/task.go:112, jenkins " +
      "core/src/main/java/hudson/slaves/SlaveComputer.java:484). 47 falsas apagadas mas 14 " +
      "`problema-si-patron-no`, razon 9,4 falsas por verdadera. Sus tres anclas: " +
      "`repeated-absence-check` queda HUERFANA; `duplication` la siguen usando Consolidate " +
      "Conditional, Extract Duplicated Method, Prototype y Proxy (inicializacion perezosa) — dos " +
      "de ellas FAMILIAS DE REFACTORIZACION, verificado ancla por ancla sobre `HYPOTHESES.anchors`; " +
      "`distributed-duplication` la siguen usando Command y Template Method. Delta de nivel 1 " +
      "CERO: el detector `duplication` y el consejo de nivel 1 «Introduce Special Case (Introduce " +
      "Null Object)» de `code-suggest.ts` no se tocan. Ver ola-az/informes/AZ1.md.",
  },
  {
    file: "hypotheses/observer.ts",
    id: "observer",
    razon:
      "Ola AY, frente AY6: CONSTRUIDO Y MEDIDO, 0/21 = 0 % [0 %, 15 %] sobre los 21 repos, con la poblacion viva " +
      "ENTERA juzgada (21 de 21) y CERO `verdadero` en toda la historia del banco (36 falso + 1 problema-si-patron-no " +
      "en 162 archivos de veredictos). V = 0, asi que desregistrarlo es de costo cero POR DEFINICION: no hay " +
      "numerador que perder. Sus dos anclas — `manual-notification` y `hard-wired-notification` — son EXCLUSIVAS de " +
      "Observer (ninguna otra hipotesis las declara), asi que no arrastra a nadie; los dos detectores siguen " +
      "registrados y emitiendo, el delta de nivel 1 es CERO. Ver ola-ay/informes/AY6.md.",
  },
  {
    file: "hypotheses/singleton.ts",
    id: "singleton",
    razon:
      "Ola AZ, frente AZ1 — BAJA DECIDIDA POR EL USUARIO, y la UNICA de las cuatro de COSTO CERO. " +
      "CONSTRUIDO Y MEDIDO: 0/11 = 0 % [0 %, 26 %] sobre los 21 repos, poblacion viva 11, ENTERA " +
      "juzgada, y CERO `verdadero` en toda la historia del banco (verificado por AY6 por tres " +
      "caminos independientes: instrumento arreglado, barrido crudo de los 162 archivos aceptando " +
      "`verdict` y `veredicto`, y lectura a mano de 4 de 11 con techo-de-raiz-de-N como piso). " +
      "PRECIO: 0 verdaderas. 11 falsas apagadas. Su unica ancla, `scattered-instantiation`, la sigue " +
      "usando Proxy (inicializacion perezosa): no queda huerfana. Delta de nivel 1 CERO. " +
      "AY6 no pudo aterrizarla porque la baja bajaba `instantiates` de 10 a 9 contra un piso de 10 " +
      "en `consumo-mecanismos.test.ts`; AZ1 lo resolvio SIN bajar el piso, corrigiendo la POBLACION " +
      "que ese test analiza (este mismo modulo). Ver ola-ay/informes/AY6.md §6 y ola-az/informes/AZ1.md.",
  },
];
