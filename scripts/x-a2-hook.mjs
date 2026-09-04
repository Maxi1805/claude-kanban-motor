/**
 * OLA X — FRENTE A2. Sonda de SOLO LECTURA: gancho de resolución de módulos.
 *
 * POR QUÉ EXISTE. El encargo pide instrumentar los 17 embudos y prohíbe tocar
 * una sola compuerta. `hypotheses/engine.ts` y `hypotheses/run.ts` son de otros
 * frentes (B1 está editando `engine.ts` ahora mismo), así que la sonda NO los
 * modifica: genera una COPIA instrumentada en un directorio temporal y redirige
 * la resolución del módulo hacia ella. El árbol de `src/` queda intacto, byte a
 * byte, y la copia se regenera en cada corrida desde el disco — si otro frente
 * cambia el original, la sonda mide el original nuevo o falla ruidosamente
 * (`x-a2-embudo.mts` verifica que cada sustitución ocurrió).
 *
 * Es un gancho de `resolve`, no de `load`: así la copia pasa por el mismo
 * transpilador (tsx) que el original, sin que esta sonda reimplemente nada.
 */
let MAP = new Map();

export function initialize(data) {
  MAP = new Map(Object.entries(data ?? {}));
}

export async function resolve(specifier, context, nextResolve) {
  const r = await nextResolve(specifier, context);
  for (const [suffix, target] of MAP) {
    if (r.url.endsWith(suffix)) return { url: target, format: "module", shortCircuit: true };
  }
  return r;
}
