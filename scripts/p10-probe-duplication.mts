/**
 * OLA P, FRENTE P10 — sonda A/B de VOLUMEN de `duplication`.
 *
 * QUÉ MIDE. Replica exactamente la cuenta de `census.ts#censusOf` (`Σ
 * memberCount` por cada archivo DISTINTO entre las `locations` del hallazgo) y
 * la cruza por LENGUAJE — el desglose que el integrador de la Ola O tuvo que
 * reconstruir a mano y que la lección más cara del proyecto (un kind que cayó
 * de 2.259 a 723 matando cuatro lenguajes) volvió obligatorio.
 *
 * POR QUÉ A/B EN UN SOLO PROCESO, y no "corro, edito, vuelvo a correr": doce
 * frentes están editando el mismo árbol al mismo tiempo, así que dos corridas
 * separadas por media hora no comparan MI cambio, comparan dos árboles
 * distintos. Acá el antes y el después salen del MISMO árbol, el MISMO proceso
 * y la MISMA ventana de reloj: lo único que cambia entre las dos corridas es
 * si el detector `duplication` declara o no su `groupKey` de Nivel 1
 * (`detect/grouping.ts`), que es exactamente la línea bajo estudio. El
 * interruptor vive ACÁ y no en `src/`: un `process.env` dentro del detector
 * envenenaría el caché de análisis compartido, que no lleva variables de
 * entorno en su clave (`GUIA-PROXIMA-OLA.md` §8).
 *
 * Uso: CK_ANALYSIS_CACHE=0 npx tsx scripts/p10-probe-duplication.mts <dir> [<dir> ...]
 */
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { DETECTORS } from "../src/server/services/detect/registry.js";
import type { CodeAnalysis } from "../src/shared/types.js";

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("Uso: npx tsx scripts/p10-probe-duplication.mts <dir> [<dir> ...]");
  process.exit(1);
}

const KIND = process.env.P10_KIND ?? "duplication";

type Mutable = { groupKey?: unknown };
const target = DETECTORS.find((d) => d.id === KIND) as unknown as Mutable | undefined;
if (!target) throw new Error(`no existe el detector ${KIND}`);
const groupKeyReal = target.groupKey;

function resumen(a: { findings: readonly any[]; files: readonly any[] }) {
  const langOf = new Map<string, string>();
  for (const f of a.files) langOf.set(f.path, f.language);

  const volPorLang = new Map<string, number>();
  const cardsPorLang = new Map<string, number>();
  let cards = 0;
  let members = 0;
  let volumen = 0;
  let peorTarjeta = { m: 0, files: 0, vol: 0, ancla: "" };

  for (const f of a.findings) {
    if (f.kind !== KIND) continue;
    const mc = f.memberCount ?? 1;
    const files = new Set<string>(f.locations.map((l: any) => l.file));
    cards += 1;
    members += mc;
    const vol = mc * files.size;
    volumen += vol;
    if (vol > peorTarjeta.vol) {
      peorTarjeta = { m: mc, files: files.size, vol, ancla: f.locations[0]?.file ?? "" };
    }
    for (const file of files) {
      const lang = langOf.get(file) ?? "?";
      volPorLang.set(lang, (volPorLang.get(lang) ?? 0) + mc);
    }
    const lang0 = langOf.get(f.locations[0]?.file ?? "") ?? "?";
    cardsPorLang.set(lang0, (cardsPorLang.get(lang0) ?? 0) + 1);
  }

  return {
    cards,
    members,
    volumen,
    peorTarjeta,
    volPorLang: Object.fromEntries([...volPorLang].sort()),
    cardsPorLang: Object.fromEntries([...cardsPorLang].sort()),
  };
}

for (const dir of dirs) {
  const corrida = async (): Promise<CodeAnalysis> => {
    const { analysis } = await analyzeRepoCached({ dir, repoName: "p10", limits: { maxFindings: "unlimited" } });
    return analysis;
  };

  target.groupKey = undefined; // ANTES: Nivel 2 (localidad genérica archivo+kind)
  const antes = await corrida();
  const rAntes = resumen(antes as any);

  target.groupKey = groupKeyReal; // DESPUÉS: Nivel 1 declarado por el detector
  const despues = await corrida();
  const rDespues = resumen(despues as any);

  console.log(
    JSON.stringify(
      {
        dir,
        kind: KIND,
        antes: rAntes,
        despues: rDespues,
        deltaVolumen: rDespues.volumen - rAntes.volumen,
        // Σ memberCount tiene que ser IDÉNTICO: la agrupación no puede perder
        // ni un hallazgo. Si esto no da 0, el cambio perdió recall.
        deltaMiembros: rDespues.members - rAntes.members,
      },
      null,
      1,
    ),
  );
}
