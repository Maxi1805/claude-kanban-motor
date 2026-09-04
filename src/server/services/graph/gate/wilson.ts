/**
 * Intervalo de confianza de Wilson para una proporción — usado por la
 * compuerta de precisión/recall de F3 para no reportar un punto suelto sobre
 * muestras chicas (p.ej. 20 filas en el estrato `scope`).
 *
 * Wilson en vez de la aproximación normal porque no se rompe en los bordes
 * (p=0 o p=1 con n chico, que es exactamente el caso de `scope`: 0/20).
 */

export interface WilsonInterval {
  readonly lower: number;
  readonly upper: number;
}

/** z de 95% de dos colas. */
export const Z_95 = 1.959963985;

/** `n <= 0` devuelve `[0, 1]`: sin observaciones no hay nada que acotar. */
export function wilsonInterval(successes: number, n: number, z: number = Z_95): WilsonInterval {
  if (n <= 0) return { lower: 0, upper: 1 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}
