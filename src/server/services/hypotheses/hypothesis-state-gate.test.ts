/**
 * Compuerta por ESTADO de hipótesis — paquete P3 (PENDIENTES.md "Problema 2":
 * cada patrón tiene tres formas [ausente/parcial/ya-aplicado, más
 * aplicado-eludido] y el resto del proyecto sólo mira una).
 *
 * EL HUECO QUE CIERRA: al momento de escribirse, `census-golden` contaba
 * `patron:${opportunity.pattern}` — OPORTUNIDADES del ranking LEGACY
 * (`analysis.opportunities`, `code-opportunities.ts`), un sistema totalmente
 * distinto del de `hypotheses/*.ts` (`finding.hypotheses`). Por diseño,
 * `state === "ya-aplicado"` implica `confidence: null` y NUNCA es una
 * oportunidad — así que ese censo era CIEGO al estado de una hipótesis: una
 * fixture donde el patrón ya está aplicado y correctamente reconocido, y una
 * fixture donde el pipeline se queda MUDO (cero hipótesis, ni siquiera
 * "ausente"), producían exactamente el mismo censo (nada). F-RETIRO-VÍA-VIEJA
 * retiró esa familia `patron:` entera junto con `analysis.opportunities`
 * (decisión del usuario) — el hueco que este archivo cierra ya no puede
 * volver a abrirse por esa vía específica, pero el gate por ESTADO que sigue
 * abajo sigue siendo la única protección real contra un pipeline que se
 * queda mudo en vez de clasificar: `measure-proxy-canonical.mts` y
 * `measure-observer-canonical.mts` (Ola 10) medían esto, pero a mano, sin
 * `expect`, corridos una vez: no protegían nada. Este archivo es el gate real.
 *
 * ALCANCE — originalmente 4 patrones con fixture canónica MULTI-LENGUAJE
 * (`tests/fixtures/patterns/{proxy,observer,decorator,template_method}/`),
 * hoy 3 activos + Proxy con su propio `describe` "APAGADO" (ver más abajo,
 * junto al piso global). Medido por mí, ANTES de escribir este archivo
 * (reproducción con `analyzeRepo` real, un proceso por carpeta, sin corpus):
 *
 *   - Proxy: 5/6 lenguajes daban `ya-aplicado` (falta vue.vue — gap
 *     preexistente, no es el bug de P2) — MEDICIÓN VIGENTE SÓLO HASTA la ola
 *     de precisión posterior a la Ola D, que apagó `hypotheses/proxy.ts`
 *     (0/28 verdaderas contra código real; ver el docstring de cabecera de
 *     ese archivo). Este archivo dejó de proteger esa forma A PROPÓSITO —
 *     ver el `describe` "Proxy — APAGADO" al final.
 *   - Observer: 6/6 lenguajes dan `ya-aplicado`.
 *   - Decorator: 0/6 — SILENCIO TOTAL en los 6 lenguajes.
 *   - Template Method: 0/6 — SILENCIO TOTAL en los 6 lenguajes.
 *
 * Los otros 13 patrones registrados (Singleton, Builder, Composite, Facade,
 * Factory Method, Iterator, Null Object, Prototype, State, Strategy, Command,
 * Chain of Responsibility, Abstract Factory) TAMBIÉN están en silencio total
 * sobre su propia fixture canónica — verificado igual, un proceso por
 * carpeta — pero NO por el bug de P2: sus anclas son hallazgos `inter-file`
 * con un piso de repetición que una fixture de un ejemplo por lenguaje nunca
 * alcanza (p.ej. `scattered-instantiation` de Singleton exige
 * `MIN_SITES_SPEC = pisoDeclarado(6, ...)` archivos distintos instanciando el
 * MISMO tipo — piso que, per PENDIENTES.md, "no se alcanza NI EN GUAVA").
 * Meterlos acá haría caer la compuerta por una razón ajena a P2 y violaría
 * el ALCANCE CONGELADO del proyecto (PENDIENTES.md). Quien retome esto — el
 * hueco es real, sólo que es un problema de CALIBRACIÓN DE PISOS, no de
 * cableado — que abra un paquete nuevo, no reutilice este archivo.
 *
 * QUÉ HACE ESTA COMPUERTA HOY — actualizado en la Ola 11b, el texto anterior
 * ("las 12 aserciones de Decorator y Template Method FALLAN") quedó vencido
 * dos olas atrás y hay que leerlo con fecha:
 *
 *   - Ola 11a cerró 11 de esos 12 arreglando el detector, con dos anclas
 *     nuevas (`homonymous-delegation.ts`, `inheritance-family.ts`).
 *   - Quedó UNO: Template Method sobre `go.go`. La Ola 11b lo DIAGNOSTICÓ y
 *     lo DECLARÓ con la causa medida en `knownGaps` (ver ahí: es un hueco de
 *     ANCLAJE para la forma funcional del patrón en un lenguaje sin clases,
 *     no un bug de clasificación) — no lo cerró.
 *
 * Sigue sin usarse `.skip`/`.todo` para nada: un hueco declarado tiene su
 * causa escrita al lado Y su propio caso que exige que siga siendo un hueco,
 * así que cerrarlo pone este archivo en rojo y obliga a retirar la
 * declaración. Declarar no es silenciar: la diferencia es que esto se vence.
 */
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { analyzeRepo } from "../code-analyzer.js";
import type { CodeAnalysis, CodeFindingHypothesisState } from "../../../shared/types.js";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const FIXTURES_DIR = path.join(ROOT, "tests", "fixtures", "patterns");

/** Fijo: los 6 lenguajes con los que TODAS las carpetas de
 *  `tests/fixtures/patterns/` vienen pobladas (ver `ls` de cada carpeta). */
const LANGUAGE_FILES = ["go.go", "javascript.js", "python.py", "ruby.rb", "typescript.ts", "vue.vue"] as const;

interface CanonicalPattern {
  /** Subcarpeta de `tests/fixtures/patterns/`. */
  folder: string;
  /** `hypotheses/<x>.ts`'s `pattern` — el string exacto que cuelga de `finding.hypotheses[].pattern`. */
  pattern: string;
  /**
   * Lenguajes donde la fixture canónica de este patrón NO produce hoy
   * ninguna hipótesis, por un motivo YA VERIFICADO y AJENO al bug de P2
   * (ver el docstring del módulo) — excluidos de la aserción de silencio
   * para no confundir "P2 no cerró esto" con "gap preexistente distinto".
   *
   * OLA 11b (frente B1): dejó de ser una lista de nombres y pasó a ser
   * `archivo → CAUSA MEDIDA`. Un hueco sin causa escrita es un
   * silenciamiento; con la causa al lado es una declaración auditable. Y no
   * es gratis: cada entrada genera su propio `it` que exige que el hueco
   * SIGA existiendo, así que el día que alguien lo cierre este archivo se
   * pone rojo y obliga a borrar la declaración. Un waiver que no se puede
   * vencer es un waiver que se pudre.
   */
  knownGaps?: Readonly<Record<string, string>>;
}

const CANONICAL_PATTERNS: readonly CanonicalPattern[] = [
  // Proxy — RETIRADO de este arreglo (ver el `describe` propio "Proxy —
  // APAGADO" más abajo, al lado del piso global): la ola de precisión
  // posterior a la Ola D midió 0/28 verdaderas contra código real y apagó
  // `hypotheses/proxy.ts` (`build`/`refresh` devuelven `null` siempre, ver su
  // docstring de cabecera para la medición y la condición de reactivación).
  // El piso "5/6 lenguajes en ya-aplicado" que este archivo protegía era
  // sobre la MISMA fixture canónica que la Ola D no midió — protegía la
  // FORMA, no la PRECISIÓN, y hoy es exactamente la señal que se apagó a
  // propósito. Sacarlo de acá (en vez de dejarlo rojo) sigue el mismo
  // convenio que `knownGaps` ya usa en este archivo: declarar con causa,
  // con un test que exige que la causa siga siendo cierta.
  // Observer — RETIRADO de este arreglo, Ola AY frente AY6, por el MISMO
  // convenio y por la misma causa que Proxy arriba: la ola de precision lo
  // midio 0/21 = 0 % [0 %, 15 %] sobre los 21 repos, con la poblacion viva
  // entera juzgada y cero `verdadero` en toda la historia del banco, y
  // `hypotheses/observer.ts` quedo DESREGISTRADO (declarado en
  // `registries.test.ts#HIPOTESIS_DELIBERADAMENTE_SIN_REGISTRAR`, con su
  // numero al lado). El piso "6/6 lenguajes en ya-aplicado" que este archivo
  // protegia era sobre la fixture canonica y protegia la FORMA reconocida,
  // nunca la PRECISION — y la precision es la que se midio en cero. Un
  // patron desregistrado no construye ninguna hipotesis, asi que dejar la
  // entrada aca no seria una compuerta: serian seis rojos permanentes sobre
  // una causa ya declarada. Ver ola-ay/informes/AY6.md.
  { folder: "decorator", pattern: "Decorator" },
  {
    folder: "template_method",
    pattern: "Template Method",
    knownGaps: {
      // OLA AC — HUECO CERRADO. Las 5 entradas (javascript.js, python.py,
      // ruby.rb, typescript.ts, vue.vue) se declararon cuando R1 retiró
      // `large-class` e `inheritance-family` de `template-method.ts`. Al
      // revertirse esa poda —el proyecto mejora de forma ADITIVA; los falsos
      // se recortan después y con un criterio de costo/beneficio acordado—
      // el patrón volvió a hablar sobre su fixture canónica en los 5
      // lenguajes con clases, y el propio test exigía borrar la declaración
      // cuando eso pasara. Borrada.
      "go.go":
        "OLA 11b (frente B1) — HUECO DE ANCLAJE, MEDIDO, NO UN BUG DE CLASIFICACIÓN. Corriendo `analyzeRepo` sobre " +
        "`tests/fixtures/patterns/template_method/` sola, `go.go` produce EXACTAMENTE UN Finding: `orphan-file`. " +
        "Ninguna de las 5 anclas de `hypotheses/template-method.ts` dispara, y las 5 por causas verificadas: " +
        "`large-class`/`refused-bequest`/`inheritance-family` declaran `needs` que Go no tiene " +
        "(`unidad-tipo-clase`/`herencia`) y el runner las reporta `no-aplicable` por capacidad — comprobado por " +
        "máquina, no deducido; `distributed-duplication` y `parallel-hierarchies` son `inter-file` y piden " +
        "duplicación o jerarquías paralelas que un archivo de 24 líneas no tiene. " +
        "LA CAUSA RAÍZ ES DE GENERICIDAD y está escrita desde la Ola 11a en el docstring de " +
        "`detect/intra-file/inheritance-family.ts` ('LÍMITE DECLARADO — GO'): la fixture aplica Template Method en " +
        "la forma que existe en un lenguaje SIN clases — una función de orden superior (`Mine(path, extract " +
        "ExtractStep)`) que recibe el paso variable como parámetro invocable —, y para esa forma hace falta un " +
        "TERCER camino de anclaje que nadie construyó todavía. " +
        "LO QUE NO ES LA CAUSA, medido para no volver a diagnosticarlo mal: el grafo SÍ lleva la forma entera. " +
        "Sobre esa fixture emite `calls MineCSV -> Mine`, `calls MineLog -> Mine` (dos llamadores distintos del " +
        "mismo esqueleto) y `references Mine -> ExtractStep` (el parámetro invocable). Falta el Finding ancla y la " +
        "rama de clasificación, no el dato. " +
        "POR QUÉ NO SE CERRÓ EN LA 11b: cerrarlo es un detector nuevo en `detect/intra-file/` MÁS una vía de " +
        "entrada y un excluder nuevos en `hypotheses/template-method.ts`, incluido tocar su `required` " +
        "(`sameNameDistinctUnitsGroup` exige >= 2 unidades con el MISMO nombre de método, y en la forma funcional " +
        "el esqueleto es uno solo) — o sea, el contrato de la hipótesis. Media implementación deja el patrón " +
        "sugiriendo 'extraer un Template Method' sobre código donde YA está aplicado, que es el falso positivo que " +
        "el usuario rechazó dos veces. Se declara entero y se hace entero, no a medias.",
    },
  },
];

/** Conteo (finding, hypothesis) que cumplen `pattern` y, si se pide, `state`. */
function countHypotheses(analysis: CodeAnalysis, pattern: string, state?: CodeFindingHypothesisState): number {
  let total = 0;
  for (const finding of analysis.findings) {
    for (const h of finding.hypotheses ?? []) {
      if (h.pattern !== pattern) continue;
      if (state !== undefined && h.state !== state) continue;
      total++;
    }
  }
  return total;
}

/** Hallazgos con una hipótesis de `pattern` que tocan el archivo `lang` (basename exacto, p.ej. "go.go"). */
function findingsForLanguage(analysis: CodeAnalysis, pattern: string, lang: string): number {
  let total = 0;
  for (const finding of analysis.findings) {
    const has = (finding.hypotheses ?? []).some((h) => h.pattern === pattern);
    if (!has) continue;
    if (finding.locations.some((l) => path.basename(l.file) === lang)) total++;
  }
  return total;
}

describe("compuerta por estado de hipótesis (P3) — silencio vs. clasificación correcta", () => {
  for (const { folder, pattern, knownGaps } of CANONICAL_PATTERNS) {
    describe(`${pattern} — fixture canónica tests/fixtures/patterns/${folder}/`, () => {
      let analysis: CodeAnalysis;

      beforeAll(async () => {
        analysis = await analyzeRepo({
          dir: path.join(FIXTURES_DIR, folder),
          repoName: `canonical-${folder}`,
          limits: { maxFindings: "unlimited" },
        });
      }, 60_000);

      /*
       * OLA 11b — EL WAIVER SE PUEDE VENCER. Cada hueco declarado tiene su
       * propio caso que exige que SIGA siendo un hueco: si alguien construye
       * el anclaje que falta, este caso se pone rojo y obliga a borrar la
       * declaración en el mismo commit. Sin esto, un `knownGaps` cerrado se
       * queda para siempre y el gate deja de mirar ese lenguaje sin que nadie
       * se entere — que es exactamente la forma en que se pudren los waivers.
       */
      for (const [lang, causa] of Object.entries(knownGaps ?? {})) {
        it(`${lang}: HUECO DECLARADO — sigue sin producir hipótesis ${pattern} (si esto se pone rojo, BORRAR la declaración)`, () => {
          expect(
            findingsForLanguage(analysis, pattern, lang),
            `EL HUECO DECLARADO SE CERRÓ: tests/fixtures/patterns/${folder}/${lang} ahora SÍ produce una hipótesis ` +
              `"${pattern}". Esto no es una falla: es la señal de que la declaración venció. Sacá "${lang}" de ` +
              `\`knownGaps\` de "${folder}" para que el gate real vuelva a cubrir este lenguaje. Causa con la que ` +
              `se declaró: ${causa}`,
          ).toBe(0);
        });
      }

      for (const lang of LANGUAGE_FILES) {
        if (knownGaps && lang in knownGaps) continue;

        it(`${lang}: al menos una hipótesis ${pattern}, en cualquier estado (requisito 1 del paquete P3)`, () => {
          const matches = findingsForLanguage(analysis, pattern, lang);
          expect(
            matches,
            `SILENCIO TOTAL: tests/fixtures/patterns/${folder}/${lang} no produjo NINGUNA hipótesis "${pattern}" ` +
              `— ni siquiera 'ausente'. Una hipótesis silenciosa y una correctamente clasificada 'ya-aplicado' ` +
              `se ven IGUAL en el censo (census-golden sólo cuenta 'patron:X' del ranking legacy, que por diseño ` +
              `excluye 'ya-aplicado'/confidence:null) — por eso existe este test. Si el patrón mudo es Decorator ` +
              `o Template Method: es el bug de P2 (PENDIENTES.md "Problema 2" — el ancla de grafo/AST de esa ` +
              `hipótesis no reconoce la forma COMPLETA de esta fixture, o \`neighborhoodIndex\` sigue sin llegar ` +
              `a \`attachHypotheses\` per-file en code-analyzer.ts); arreglar ESE código, no este test. Si es ` +
              `Proxy u Observer: es una REGRESIÓN nueva sobre algo medido en verde por este mismo gate — no lo ` +
              `descartes como "conocido", diagnosticalo antes de tocar nada.`,
          ).toBeGreaterThan(0);
        });
      }
    });
  }

  /**
   * Requisito 2 del paquete P3: el conteo GLOBAL de `state === "ya-aplicado"`
   * sobre `fixtures-multi` (= `tests/fixtures/patterns/` completo, la MISMA
   * carpeta que `census-golden.test.ts` corre como `FIXTURES_MULTI_DIR`) no
   * puede ser cero, y no puede bajar de los pisos ya verificados hoy. Un
   * proceso, UNA corrida sobre el árbol completo — no la suma de las 4 de
   * arriba (que corren aisladas, una carpeta a la vez): correr aislado vs.
   * correr sobre el árbol entero puede dar cuentas distintas (verificado:
   * sobre el árbol completo aparecieron 2 "Null Object: ya-aplicado" espurios
   * colgando de archivos de `template_method/`, que NO aparecen corriendo esa
   * carpeta solo — cruce entre carpetas hermanas, fuera de este alcance,
   * anotado pero no perseguido acá).
   */
  describe("piso global de 'ya-aplicado' sobre fixtures-multi (tests/fixtures/patterns/ completo)", () => {
    let analysis: CodeAnalysis;

    beforeAll(async () => {
      analysis = await analyzeRepo({
        dir: FIXTURES_DIR,
        repoName: "fixtures-multi",
        limits: { maxFindings: "unlimited" },
      });
    }, 60_000);

    it("al menos una hipótesis 'ya-aplicado' en todo el árbol (el estado no puede desaparecer sin que nada lo note)", () => {
      let total = 0;
      for (const finding of analysis.findings) {
        for (const h of finding.hypotheses ?? []) if (h.state === "ya-aplicado") total++;
      }
      expect(
        total,
        "Cero hipótesis 'ya-aplicado' en TODO tests/fixtures/patterns/: el estado que distingue " +
          "'ya está aplicado, no lo sugieras' de silencio total dejó de aparecer en el único lugar donde " +
          "hoy se verifica con aserción — antes era invisible salvo corriendo measure-*-canonical.mts a mano.",
      ).toBeGreaterThan(0);
    });

    /*
     * Observer — EL PISO DE 6/6 'ya-aplicado' SE RETIRA, Ola AY frente AY6.
     * Mismo convenio que el `describe` "Proxy — APAGADO" de mas abajo:
     * `hypotheses/observer.ts` quedo DESREGISTRADO tras medir 0/21 = 0 %
     * [0 %, 15 %] con la poblacion viva entera juzgada y cero `verdadero` en
     * toda la historia del banco. Un patron desregistrado no construye
     * ninguna hipotesis en ningun estado, asi que este piso no puede
     * cumplirse por construccion. La causa esta escrita en
     * `registries.test.ts#HIPOTESIS_DELIBERADAMENTE_SIN_REGISTRAR` y el dia
     * que Observer vuelva a registrarse, este piso vuelve con el.
     *
     * LO QUE NO SE PIERDE: la asercion de arriba ("al menos una hipotesis
     * 'ya-aplicado' en todo el arbol") sigue cubriendo que el ESTADO
     * `ya-aplicado` no desaparezca del proyecto — que es lo que de verdad
     * protegia este bloque, y lo unico que Observer aportaba de forma
     * exclusiva era su propio conteo.
     */
  });

  /**
   * Proxy — APAGADO, ola de precisión posterior a la Ola D. El piso "5/6
   * lenguajes en ya-aplicado" que vivía acá (sobre la MISMA fixture canónica
   * `tests/fixtures/patterns/proxy/`) protegía la FORMA reconocida, nunca la
   * PRECISIÓN — y la precisión, medida a mano contra código real (Rails +
   * `src/`, no esta fixture), dio **0/28 verdaderas** (Wilson 95% [0%, 12%]).
   * Esta ola confirmó además, sobre las dos poblaciones reales completas
   * (606 archivos, 427 grupos clase-campo), **0 casos con guarda real
   * repetida** — la condición exacta de reactivación está en el docstring de
   * cabecera de `hypotheses/proxy.ts`. `build`/`refresh` devuelven `null`
   * siempre ahora (`evaluateProxyHypothesis`/`refreshProxyHypothesis`, la
   * MISMA lógica que reconocía esta fixture, se conservan exportadas y
   * probadas en `proxy.test.ts`).
   *
   * Mismo convenio que `knownGaps` en este archivo: declarar con causa, y un
   * test que exige que la causa siga siendo cierta — si Proxy vuelve a
   * emitir sin que se actualice `hypotheses/proxy.ts`, ESTE test se pone
   * rojo y hay que ir a leer la condición de reactivación antes de tocar
   * nada.
   */
  describe("Proxy (inicialización perezosa) — APAGADO (0/28 verdaderas medidas contra código real)", () => {
    it("fixture canónica tests/fixtures/patterns/proxy/: sigue sin producir NINGUNA hipótesis Proxy, en ningún lenguaje (si esto se pone rojo, ir a `hypotheses/proxy.ts` antes de tocar este test)", async () => {
      const analysis = await analyzeRepo({
        dir: path.join(FIXTURES_DIR, "proxy"),
        repoName: "canonical-proxy",
        limits: { maxFindings: "unlimited" },
      });
      const total = countHypotheses(analysis, "Proxy (inicialización perezosa)");
      expect(
        total,
        `Proxy produjo ${total} hipótesis sobre su propia fixture canónica — el apagado (build()/refresh() ⇒ null ` +
          "siempre) dejó de sostenerse. Antes de reactivar nada acá, releer la condición exacta de reactivación en " +
          "el docstring de cabecera de `hypotheses/proxy.ts` y actualizarla junto con este test.",
      ).toBe(0);
    });

    it("piso global de fixtures-multi: 0 hipótesis 'ya-aplicado' de Proxy (antes: piso de 5, Ola 10 — retirado a propósito, ver arriba)", async () => {
      const analysis = await analyzeRepo({
        dir: FIXTURES_DIR,
        repoName: "fixtures-multi",
        limits: { maxFindings: "unlimited" },
      });
      const count = countHypotheses(analysis, "Proxy (inicialización perezosa)", "ya-aplicado");
      expect(count, "Proxy volvió a dar 'ya-aplicado' sobre fixtures-multi — ver la nota de arriba antes de tocar nada.").toBe(0);
    });
  });
});
