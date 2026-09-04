/**
 * PRNG con semilla, determinista — el muestreo de precisión (`sample.ts`) NO
 * puede usar `Math.random()` sin semilla: la misma corrida (mismo
 * `analyzeRepo`, mismo `seed`) tiene que elegir SIEMPRE los mismos
 * hallazgos, o la planilla de una corrida no es comparable con la de otra y
 * "la precisión medida hoy" deja de servir de línea base mañana — el
 * requisito explícito del encargo de este archivo.
 *
 * mulberry32 (dominio público, Tommy Ettinger): no es criptográfico, y no
 * hace falta que lo sea — el único requisito es reproducibilidad exacta
 * entre corridas de Node en cualquier plataforma, no impredictibilidad.
 */

/** Generador [0,1) con semilla — misma semilla ⇒ misma secuencia siempre. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a de 32 bits — sólo para convertir un string (`"${seed}:${slug}:${kind}"`)
 * en un entero que alimente `mulberry32`. No es para nada criptográfico: dos
 * kinds distintos deben mezclar a semillas distintas para que el orden de
 * muestreo de uno no arrastre al del otro, y eso es todo lo que necesita.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Fisher-Yates con el PRNG de arriba — misma `seed` ⇒ misma permutación
 * siempre, para cualquier `items` con el mismo orden de entrada (por eso
 * `sample.ts` ordena el pool por `id` ANTES de llamar a esto: el orden de
 * `analysis.findings` no está garantizado estable entre versiones del
 * analizador, y un shuffle determinista sobre un orden que no lo es no sirve
 * de nada).
 */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}
