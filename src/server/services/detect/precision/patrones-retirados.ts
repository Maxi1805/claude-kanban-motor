/**
 * LOS PATRONES DE NIVEL 2 RETIRADOS — Ola AY, guardián (cierre). HALLAZGO A de AY7
 * (`ola-ay/informes/AY7.md` §2).
 *
 * POR QUÉ EXISTE. El encargo de la Ola AY autoriza retirar un patrón con `V = 0` porque es "de
 * costo cero por definición". Retirar una hipótesis la saca de DOS lugares a la vez: de
 * `HYPOTHESES` (por el desregistro, `registries.test.ts#HIPOTESIS_DELIBERADAMENTE_SIN_REGISTRAR`)
 * y del censo (porque deja de emitir). El instrumento oficial
 * (`scripts/v-int-precision-nivel2.mts`) y la compuerta de forma (`formato-veredictos.test.ts`)
 * derivan la lista de patrones aceptados de esos dos lugares —es la regla que AY1 escribió para
 * cerrar el defecto hermano de `Proxy`: nunca escribir la lista de patrones a mano—, así que TODA
 * clave histórica `<id>::<Patrón>` que una ola anterior escribió sobre un patrón retirado deja de
 * resolver: pasa a ser "un patrón que no existe", que es una ofensa FATAL bajo compuerta.
 *
 * Medido por AY7: retirar `Observer` sin este archivo produce **27 ofensas fatales** y `EXIT=2`
 * con CERO líneas de tabla, sobre `ola-ae/AE11.json` y `ola-ae/AE14.json` — dos archivos de olas
 * BAJO COMPUERTA que nadie de esta ola puede reescribir sin mover veredictos históricos bajo una
 * firma ajena. Confirmado por el guardián de forma independiente (`scratchpad-guardian-ay/`).
 *
 * LA REGLA: un patrón retirado entra ACÁ, con su nombre COMPLETO (el mismo que emitía el censo el
 * día que tenía población) y su razón, para que una clave histórica se lea como "veredicto de una
 * hipótesis que dejó de emitirse" —que es lo que es, y lo que el bloque «QUÉ MATÓ LA OLA» existe
 * para contar— y no como un nombre inventado. La entrada del ARCHIVO/DETECTOR (desregistro) sigue
 * viviendo en `registries.test.ts#HIPOTESIS_DELIBERADAMENTE_SIN_REGISTRAR`; ésta es la del NOMBRE
 * DE PATRÓN que el instrumento de PRECISIÓN necesita para no abortar. Son dos registros porque
 * cubren dos compuertas distintas (una mira archivos en disco, la otra nombres en JSON).
 *
 * NO BORRAR NUNCA UNA ENTRADA DE ACÁ, aun si algún día se te ocurre que "ya no hace falta": un
 * patrón retirado tiene veredictos históricos escritos por una docena de olas, para siempre.
 * Borrar la entrada revive el aborto exacto que este archivo existe para cerrar.
 *
 * Con esto puesto, un patrón retirado deja de aparecer en la tabla principal (su población es 0
 * porque el censo ya no lo emite) y sus veredictos históricos caen en el bloque «QUÉ MATÓ LA
 * OLA» como `V=<lo que tenía> F=<lo que tenía>` — la prueba, publicada, de que el retiro fue de
 * costo cero.
 */
export interface PatronRetirado {
  /** El nombre COMPLETO del patrón, copiado del censo el día que tenía población. */
  readonly pattern: string;
  readonly ola: string;
  readonly razon: string;
}

export const PATRONES_RETIRADOS: readonly PatronRetirado[] = [
  {
    pattern: "Composite",
    ola: "AZ (frente AZ1)",
    razon:
      "BAJA DECIDIDA POR EL USUARIO con la tabla de los 17 patrones delante. Medido con el " +
      "instrumento arreglado por AY1 sobre los 21 repos (Ghost adentro): 3/25 = 12 % [4 %, 30 %], " +
      "población viva 25, ENTERA juzgada. Costó 3 verdaderas, nombradas una por una en " +
      "`ola-az/informes/AZ1.md` §2; apagó 22 falsas (7,3 falsas por verdadera). El archivo y sus " +
      "tests quedan en disco, desregistrados y declarados en " +
      "`hypotheses/desregistradas.ts`. Delta de nivel 1 CERO: sus dos detectores-ancla " +
      "(`recursive-collection-descent`, `distributed-duplication`) siguen registrados y emitiendo, " +
      "con su `advice.pattern` de nivel 1 intacta.",
  },
  {
    pattern: "Iterator",
    ola: "AZ (frente AZ1)",
    razon:
      "BAJA DECIDIDA POR EL USUARIO. Medido: 1/19 = 5 % [1 %, 25 %] sobre los 21 repos, población " +
      "viva 19, ENTERA juzgada. Costó 1 verdadera (eslint · " +
      "`lib/rules/multiline-comment-style.js:408`); apagó 18 falsas (18,0 falsas por verdadera, la " +
      "mejor razón de las tres bajas con costo). Archivo y tests en disco, desregistrados y " +
      "declarados en `hypotheses/desregistradas.ts`. Delta de nivel 1 CERO.",
  },
  {
    pattern: "Null Object",
    ola: "AZ (frente AZ1)",
    razon:
      "BAJA DECIDIDA POR EL USUARIO. Medido: 5/52 = 10 % [4 %, 21 %] sobre los 21 repos, población " +
      "viva 66, ENTERA juzgada. Costó 5 verdaderas (3 de `repeated-absence-check`, 2 de " +
      "`duplication`), nombradas una por una en `ola-az/informes/AZ1.md` §2; apagó 47 falsas y 14 " +
      "`problema-si-patrón-no` (9,4 falsas por verdadera). De sus tres anclas sólo " +
      "`repeated-absence-check` queda huérfana: `duplication` la siguen usando Consolidate " +
      "Conditional, Extract Duplicated Method, Prototype y Proxy, y `distributed-duplication` " +
      "Command y Template Method. Delta de nivel 1 CERO — el consejo de nivel 1 «Introduce Special " +
      "Case (Introduce Null Object)» de `code-suggest.ts` no se toca.",
  },
  {
    pattern: "Observer",
    ola: "AY (frente AY6, aterrizado por el guardián de cierre)",
    razon:
      "V = 0 confirmado por tres caminos independientes (instrumento arreglado por AY1, barrido " +
      "crudo de toda la historia del banco aceptando `verdict` y `veredicto`, y lectura a mano con " +
      "techo-de-raíz-de-N como piso) sobre población viva entera juzgada (21/21 = 0 % [0 %, 15 %]). " +
      "Sus dos anclas (`manual-notification`, `hard-wired-notification`) son EXCLUSIVAS de Observer " +
      "(verificado recorriendo `HYPOTHESES.anchors` sobre el registro vivo): la baja no arrastra " +
      "ninguna otra hipótesis. Delta de nivel 1 cero por construcción: los dos detectores-ancla " +
      "siguen registrados y emitiendo. Ver `ola-ay/informes/AY6.md` §2-§4 y el informe del guardián.",
  },
  {
    pattern: "Singleton",
    ola: "AZ (frente AZ1)",
    razon:
      "BAJA DECIDIDA POR EL USUARIO, y la única de COSTO CERO de las cuatro de la Ola AZ. " +
      "0/11 = 0 % [0 %, 26 %] sobre los 21 repos, población viva 11, ENTERA juzgada, y CERO " +
      "`verdadero` en toda la historia del banco (verificado por AY6 por tres caminos " +
      "independientes). Apagó 11 falsas, costó 0 verdaderas. Su única ancla, " +
      "`scattered-instantiation`, la sigue usando Proxy (inicialización perezosa): no queda " +
      "huérfana. AY6 la midió pero no pudo aterrizarla porque bajaba `instantiates` de 10 a 9 " +
      "contra un piso de 10 en `consumo-mecanismos.test.ts`; AZ1 lo resolvió SIN bajar el piso, " +
      "corrigiendo la población que ese test analiza. Delta de nivel 1 CERO.",
  },
];
