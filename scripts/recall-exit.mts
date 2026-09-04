/**
 * EL VEREDICTO DE SALIDA DEL INSTRUMENTO DE RECALL — la decisión pura de con qué
 * código sale `recall-report.mts`, separada del script para que se pueda probar
 * sin spawnear un proceso ni leer el árbol.
 *
 * ═══ POR QUÉ ESTE ARCHIVO EXISTE: OCHO OLAS DE UNA RED QUE NO ATRAPA NADA ═══
 *
 * `recall-report.mts --exigir-vigente` SALÍA CON CÓDIGO 0 AUNQUE HUBIERA
 * PÉRDIDAS SIN DECLARAR. El script IMPRIMÍA la lista ("— pérdidas SIN DECLARAR
 * (n) — esto rompe recall-gate.test.ts —") y después devolvía 0, porque su
 * ÚNICO `process.exit` colgaba de `r.stale.length > 0` y de nada más. Está
 * reportado con esas palabras en el cierre de las últimas ocho olas y nadie lo
 * tocó. El costo no es cosmético: todo el proyecto lee "0 SIN DECLARAR" de este
 * instrumento, y un instrumento cuyo código de salida no depende de lo que mide
 * puede decir que sí mientras un verdadero se muere.
 *
 * ═══ LOS TRES AGUJEROS, MEDIDOS SOBRE EL ÁRBOL DE HOY (Ola AI, frente AI2) ═══
 *
 * Reproducidos uno por uno sobre una COPIA aislada del árbol (`src` + `tests/
 * golden/precision` + este script), re-sellando la huella del analizador de la
 * copia para que el chequeo de vigencia no tapara nada. Base limpia: medidos 797
 * · vivos 771 · 26 declaradas · 0 SIN DECLARAR · exit 0.
 *
 *   1. Un `verdadero` pasa a `perdido` sin `lossReason`
 *      → "1 SIN DECLARAR" impreso, **exit 0** — con y sin `--exigir-vigente`.
 *   2. Ese mismo `verdadero` DESAPARECE del `status` del snapshot
 *      → "0 SIN DECLARAR", el denominador baja 797 → 796 en silencio, **exit 0**.
 *      La fila cae en `unmeasured/fuera-del-snapshot`, que es "no se sabe" — y
 *      "no se sabe" leído como verde es la misma mentira con otro disfraz.
 *   3. Se borra el snapshot ENTERO de `guava`
 *      → base 797 → 623 (173 verdaderos evaporados), recall 96,7 % → 96,5 %,
 *      "0 SIN DECLARAR", **exit 0**. El instrumento devuelve un número MEJOR
 *      sobre MENOS datos y el código de salida no se entera.
 *
 * ═══ QUÉ INTENCIÓN VERIFICA CADA CÓDIGO ═══
 *
 * `EXIT_PERDIDA_SIN_DECLARAR` (3) — *"¿murió un verdadero y nadie escribió por
 * qué?"* Se chequea SIEMPRE, con flags o sin flags, porque una pérdida
 * silenciosa es un defecto en cualquier momento de la ola y porque
 * `recall-gate.test.ts` ya falla por exactamente esto: que el script opinara
 * distinto que la compuerta es lo que hizo posible el agujero. La vía de escape
 * NO es aflojar esto: es escribir el motivo en `lossReason` (ver
 * `types.ts#lossReason`), que cambia el veredicto y nunca la cifra.
 *
 * `EXIT_VERDADERO_SIN_MEDIR` (4) — *"¿el número de arriba se calculó sobre TODOS
 * los verdaderos medibles?"* Sólo bajo `--exigir-vigente`, y la asimetría es
 * deliberada: durante la ola un frente carga veredictos nuevos y todavía no
 * regeneró snapshots, y ahí `fuera-del-snapshot` es honesto y transitorio. Al
 * CIERRE no lo es: un verdadero sin medir es un verdadero sobre el que la
 * compuerta no puede opinar, y el promedio se calcula sin él. `ck-analyzer`
 * queda afuera por construcción (`POBLACIONES_SIN_SHA_CONGELADO`): su código lo
 * reescribimos nosotros y ahí un verdadero desaparece porque el archivo ya no
 * existe. Medido hoy: los ÚNICOS `unmeasured` del árbol son sus 34 ⇒ este
 * chequeo nace VERDE y no re-congela ni afloja nada.
 *
 * `EXIT_SNAPSHOT_VIEJO` (2) — *"¿el número de arriba es el de HOY?"* Es el ÚNICO
 * chequeo que ya existía y **conserva su código 2 tal cual**, para no romper a
 * ningún lector histórico. Sólo bajo `--exigir-vigente`, y la razón está en el
 * docstring de `recall-gate.test.ts`: todo frente cambia el analizador, así que
 * una compuerta que falle por vejez estaría roja siempre y terminaría
 * desactivada.
 *
 * ═══ ORDEN DE SEVERIDAD, y por qué se imprimen TODAS ═══
 *
 * Cuando hay más de una falla se devuelve el código de la MÁS GRAVE
 * (3 > 4 > 2: un verdadero muerto pesa más que uno sin medir, y uno sin medir
 * más que un número viejo) pero `fallas` las trae TODAS y el script las imprime
 * TODAS. Un instrumento que reporta sólo la primera obliga a arreglar de a una
 * y a volver a correr — que es como se pierden las otras dos.
 */
import type { RecallGateResult, RecallUnmeasured } from "../src/server/services/detect/precision/recall-logic.js";

export const EXIT_OK = 0;
/** Snapshots medidos con OTRO analizador. Código HISTÓRICO: era el único que el script tenía y se conserva. */
export const EXIT_SNAPSHOT_VIEJO = 2;
/** Un `verdadero` que el analizador ya no emite y que nadie declaró. La falla más grave. */
export const EXIT_PERDIDA_SIN_DECLARAR = 3;
/** Un `verdadero` medible sobre el que ningún snapshot puede opinar. */
export const EXIT_VERDADERO_SIN_MEDIR = 4;

export interface RecallFalla {
  readonly code: number;
  readonly titulo: string;
  readonly detalle: string;
}

export interface RecallExitVerdict {
  /** `EXIT_OK` si no hay ninguna falla; si no, el código de la más grave. */
  readonly code: number;
  /** TODAS las fallas, en orden de severidad decreciente. */
  readonly fallas: readonly RecallFalla[];
}

/**
 * Los `unmeasured` que SON un agujero. `poblacion-sin-sha-congelado` no lo es:
 * está excluido por diseño y por medición (`ola-p/informes/AVISO-recall-ck-analyzer.md`),
 * no por conveniencia. Las otras dos razones —`sin-snapshot` y
 * `fuera-del-snapshot`— significan las dos lo mismo: hay un verdadero y no hay
 * medición.
 */
export function unmeasuredQueCuenta(unmeasured: readonly RecallUnmeasured[]): readonly RecallUnmeasured[] {
  return unmeasured.filter((u) => u.reason !== "poblacion-sin-sha-congelado");
}

/** Lo mínimo de `evaluateRecallGate` que la decisión mira. Se pide un `Pick` y no el resultado entero para que un test no tenga que construir 12 campos que no usa. */
export type RecallExitInput = Pick<RecallGateResult, "silentLoss" | "unmeasured" | "stale">;

export function evaluateRecallExit(r: RecallExitInput, opts: { readonly exigirVigente: boolean }): RecallExitVerdict {
  const fallas: RecallFalla[] = [];

  if (r.silentLoss.length > 0) {
    fallas.push({
      code: EXIT_PERDIDA_SIN_DECLARAR,
      titulo: `${r.silentLoss.length} pérdida(s) SIN DECLARAR`,
      detalle:
        `${r.silentLoss.length} hallazgo(s) juzgado(s) VERDADERO por un humano dejaron de emitirse (ni por id ni por contenido)\n` +
        "y nadie escribió por qué. Están listados arriba con su id.\n" +
        "  · Si los mataste a propósito: escribí el motivo en la columna `lossReason` de\n" +
        "    tests/golden/precision/<slug>.verdicts.csv. Eso cambia el VEREDICTO, nunca la CIFRA.\n" +
        "  · Si no era a propósito: es una regresión de recall. Se arregla el detector, no la compuerta.",
    });
  }

  if (opts.exigirVigente) {
    const sinMedir = unmeasuredQueCuenta(r.unmeasured);
    if (sinMedir.length > 0) {
      const total = sinMedir.reduce((acc, u) => acc + u.judgedTrue, 0);
      fallas.push({
        code: EXIT_VERDADERO_SIN_MEDIR,
        titulo: `${total} verdadero(s) medible(s) SIN MEDIR, en ${sinMedir.length} entrada(s)`,
        detalle:
          "El recall de arriba NO los incluye: salieron del denominador sin contarse como pérdida.\n" +
          sinMedir.map((u) => `  · ${u.slug}: ${u.judgedTrue} verdadero(s) — ${u.reason}`).join("\n") +
          "\n  Volcá esos repos (scripts/dump-hallazgos.mts) y regenerá su medición (scripts/recall-snapshot.mts).",
      });
    }
    if (r.stale.length > 0) {
      fallas.push({
        code: EXIT_SNAPSHOT_VIEJO,
        titulo: `${r.stale.length} snapshot(s) viejo(s)`,
        detalle:
          "El número de arriba no es el de hoy: se midió con OTRA versión del analizador.\n" +
          r.stale.map((s) => `  · ${s.slug} — medido ${s.measuredAt}`).join("\n") +
          "\n  Re-volcá esos repos y regenerá su snapshot antes de creerle al verde.",
      });
    }
  }

  return { code: fallas.length === 0 ? EXIT_OK : fallas[0]!.code, fallas };
}

/** El bloque que el script escribe a stderr. Separado para que el test pueda afirmar sobre el TEXTO sin re-implementarlo. */
export function formatRecallExit(v: RecallExitVerdict): string {
  if (v.fallas.length === 0) return "";
  return (
    "\n══ EL INSTRUMENTO DE RECALL SALE EN ROJO ══\n" +
    v.fallas.map((f) => `\n[código ${f.code}] ${f.titulo}\n${f.detalle}`).join("\n") +
    `\n\nCódigo de salida: ${v.code} (el de la falla más grave de las ${v.fallas.length} de arriba).\n`
  );
}
