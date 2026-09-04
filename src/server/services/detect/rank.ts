/**
 * Rango normalizado — CONTRATO-F5.md §1.3/§1.5.
 *
 * La única forma medida de comparar un número entre grupos que usan escalas
 * distintas (severidad de un detector contra la de otro — §1.1: `orphan-file`
 * emite una constante, `duplication` satura en 100) o que tienen cola larga
 * (fan-in: un archivo con fan-in 400 contra una mediana de 2) sin elegir log,
 * winsorizar, ni ningún otro tratamiento a mano de la distribución: el rango
 * la aplasta a [0,1] por construcción y es invariante a cualquier monotonía
 * de la métrica de origen.
 *
 * Usado por dos consumidores con dominios de agrupación distintos:
 * `ranking.ts` (R_sev, dentro de cada `detectorId`) y `reach.ts` (R(pagerank),
 * R(fanIn), dentro de todos los archivos proyectados del repo) — este módulo
 * no sabe cuál es cuál, sólo recibe el grupo ya armado.
 */

/**
 * `(posición_media_en_empate) / (n - 1)`, ascendente: el valor MÁS ALTO del
 * grupo recibe 1.0, el MÁS BAJO 0.0, empates comparten la posición media
 * entre ellos (rango "fraccionario", el mismo criterio que Kendall/Spearman
 * usan para empates). `n === 1` ⇒ 0.5: un grupo de un solo elemento no puede
 * afirmar que ese elemento sea su mejor NI su peor caso — 0.5 es la única
 * lectura honesta, y evita que un detector con un solo hallazgo (o un archivo
 * que es el único nodo de su proyección) compre el tope gratis.
 *
 * `values[i]` se corresponde 1:1 con `result[i]` — el llamador decide qué
 * identidad (detectorId, archivo) va con cada posición.
 */
export function normalizedRanks(values: readonly number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [0.5];

  const order = values.map((_, i) => i).sort((a, b) => values[a]! - values[b]!);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]!] === values[order[i]!]) j++;
    // Posición media (0-indexada, ascendente) del bloque empatado [i, j],
    // normalizada a [0, 1] por (n - 1).
    const normalized = (i + j) / 2 / (n - 1);
    for (let k = i; k <= j; k++) ranks[order[k]!] = normalized;
    i = j + 1;
  }
  return ranks;
}
