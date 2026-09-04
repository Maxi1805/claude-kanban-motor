/**
 * LAS OLAS CUYOS ARCHIVOS DE VEREDICTOS ESTÁN BAJO COMPUERTA DE FORMATO — Ola AY, frente AY1.
 *
 * POR QUÉ EXISTE, y el defecto exacto que cierra. Esta lista vivía SOLA dentro de
 * `formato-veredictos.test.ts`, y **se atrasó dos veces**: cuatro olas en la Ola AU (medido:
 * de 1.070 juicios, el instrumento oficial contaba 72) y dos olas más en la AX
 * (`ola-aw`/`ola-ax` fuera de la lista → **18 verdaderas de `Extract Class` y 195 juicios de
 * `unused-symbol` que el instrumento oficial no podía leer**, declarado en
 * `ola-ax/informes/ATERRIZAJE.md` §9.2). Se atrasa porque el que la tiene que actualizar
 * —el frente que abre la ola— no la ve: está adentro de un test que él no abre.
 *
 * La saco acá porque desde la Ola AY el instrumento oficial (`scripts/v-int-precision-nivel2.mts`)
 * **la usa también**, para decidir a qué archivo le ABORTA por estar fuera de formato y a cuál
 * sólo le reporta el rechazo. Dos listas escritas a mano en dos lugares es exactamente cómo
 * `scratchpad-ax7/censo-patrones.py` quedó ciego a `Proxy` durante toda una ola. **UNA sola
 * lista, importada por los dos.**
 *
 * ALCANCE, y por qué arranca en `ae`: las olas anteriores a la AE ya están contadas en la serie
 * publicada, y re-formatearlas movería veredictos históricos bajo una firma que no es la suya.
 * Quedan afuera A PROPÓSITO; el instrumento las RECHAZA RUIDOSAMENTE (las nombra, las cuenta y
 * NO las procesa) en vez de abortar.
 *
 * **LA OLA EN CURSO VA ACÁ EL DÍA 1.** Dejar afuera la ola que se está escribiendo es
 * literalmente cómo esta lista se atrasó las dos veces.
 */

/** Las olas bajo compuerta, de la más nueva a la más vieja. La primera es la OLA EN CURSO. */
export const OLAS_BAJO_COMPUERTA = [
  "az", "ay", "ax", "aw", "au", "at", "as", "ar", "aq", "ap",
  "ao",
  "an", "am", "al", "ak", "aj", "ai", "ah", "ag", "af", "ae",
] as const;

/** Los directorios bajo compuerta, relativos a la raíz del repo del analizador. */
export const DIRS_VEREDICTOS: readonly string[] = OLAS_BAJO_COMPUERTA.map(
  (o) => `../claude-kanban-docs/ola-${o}/veredictos`,
);

/**
 * ¿La ruta de un archivo de veredictos cae en una ola bajo compuerta?
 *
 * Se decide por el segmento `ola-<slug>` de la ruta, no por prefijo de cadena: el instrumento
 * recibe rutas absolutas y el test rutas relativas, y las dos tienen que dar lo mismo.
 */
export function estaBajoCompuerta(ruta: string): boolean {
  const segmentos = ruta.split(/[\\/]/);
  const ola = segmentos.find((s) => /^ola-[a-z]+$/.test(s));
  if (ola === undefined) return false;
  return (OLAS_BAJO_COMPUERTA as readonly string[]).includes(ola.slice("ola-".length));
}
