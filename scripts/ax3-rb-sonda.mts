/**
 * OLA AX - FRENTE AX3 - SONDA DE POBLACION de `Refused Bequest`.
 *
 * LA PREGUNTA, Y POR QUE HACE FALTA UNA SONDA PROPIA. El detector
 * `refused-bequest` da UN solo hallazgo en 21 repos. La ola AU lo dejo escrito
 * como "no hay que medir: el detector no encuentra sujetos". Eso mezcla DOS
 * cosas distintas: (a) el detector esta roto/limitado, (b) no hay poblacion.
 * Esta sonda las separa: parsea con las MISMAS gramaticas de produccion, aplica
 * la MISMA definicion de "override anulado" que `refused-bequest.ts`, pero
 * SIN la restriccion intra-archivo — que es el limite declarado del detector.
 *
 * EL EMBUDO SE ESCRIBE ANTES DE MIRAR LOS DATOS (trampa 1 de la ola):
 *   C0  clases declaradas
 *   C1  ... que declaran una base
 *   C2  ... cuya base se resuelve DENTRO del repo por nombre simple
 *       C2a  base en el MISMO archivo   (lo unico que el detector ve hoy)
 *       C2b  base en OTRO archivo       (la brecha declarada)
 *   C3  ... con al menos un override por nombre (no-constructor)
 *   C4  ... donde el metodo de la BASE tiene cuerpo real
 *   C5  ... donde el metodo de la SUBCLASE esta vacio  <- EL HALLAZGO
 *
 * Cada nivel se reporta partido en mismo-archivo / otro-archivo, por repo y por
 * lenguaje. Se reportan ademas dos variantes de "vacio" que el detector fusiona:
 *   - "bloque"  el campo `body` resuelve y no tiene hijos nombrados
 *   - "sinBody" el campo `body` NO resuelve (Java/C# `abstract`, Ruby `def m;end`)
 * y una variante EXTRA que el detector no puede usar (prohibicion de nombres de
 * nodo por lenguaje) pero que la sonda si puede medir para saber cuanto cuesta:
 *   - "soloPass" el cuerpo es un unico hijo nombrado tipo `pass`/docstring
 *
 * Uso: npx tsx scripts/ax3-rb-sonda.mts <dir> <nombre> <salida.json>
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const S0 = "../scratchpad-ax3/src0";
const { collectFiles, LANGUAGE_DECLS } = await import(`${S0}/server/services/code-analyzer.js`);
const { deriveNodeSets, CONSTRUCTOR_NAMES } = await import(`${S0}/server/services/code-grammar.js`);

const require = createRequire(import.meta.url);
/* eslint-disable */
const mod = require("web-tree-sitter") as any;
const Parser = mod.Parser ?? mod.default ?? mod;
await Parser.init();
const Language = Parser.Language ?? mod.Language;
function wasmPath(f: string) {
  return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", f);
}
const cache = new Map<string, any>();
async function langFor(decl: any) {
  const hit = cache.get(decl.id);
  if (hit) return hit;
  const lang = await Language.load(wasmPath(decl.wasm));
  const p = new Parser();
  p.setLanguage(lang);
  const probe = p.parse(decl.probeSource);
  const sets = deriveNodeSets(probe.rootNode, decl.extraCloneNodes, decl.functionExclusions);
  probe.delete?.();
  const v = { parser: p, sets };
  cache.set(decl.id, v);
  return v;
}

// ── las MISMAS reglas que refused-bequest.ts, copiadas literalmente ───────────
function namedChildCount(node: any): number {
  let c = 0;
  for (let i = 0; i < node.childCount; i++) {
    const ch = node.child(i);
    if (ch && ch.isNamed) c++;
  }
  return c;
}
/** "vacio" segun el detector, mas la ETIQUETA de por que lo es. */
function emptyKind(node: any): "no" | "bloque" | "sinBody" | "soloPass" {
  const body = node.childForFieldName("body");
  if (!body) return "sinBody";
  const n = namedChildCount(body);
  if (n === 0) return "bloque";
  if (n === 1) {
    const only = (() => {
      for (let i = 0; i < body.childCount; i++) {
        const ch = body.child(i);
        if (ch && ch.isNamed) return ch;
      }
      return null;
    })();
    // SOLO para la sonda: el detector NO puede mirar el nombre del nodo.
    if (only && /(^|_)pass(_|$)/.test(only.type)) return "soloPass";
    if (only && /expression_statement/.test(only.type) && /^\s*["'`]/.test(only.text ?? "")) return "soloPass";
  }
  return "no";
}
function extractSuperclassName(classNode: any): string | null {
  const direct = classNode.childForFieldName("superclass")?.text;
  if (direct) {
    const cleaned = direct.replace(/^[<:]\s*/, "").replace(/^extends\s+/, "").trim();
    return cleaned || null;
  }
  const plural = classNode.childForFieldName("superclasses")?.text;
  if (plural) {
    const inner = /\(([^)]+)\)/.exec(plural)?.[1] ?? plural;
    const first = inner.split(",")[0]?.trim();
    return first || null;
  }
  const bases = classNode.childForFieldName("bases")?.text;
  if (bases) {
    const first = bases.replace(/^:\s*/, "").split(",")[0]?.trim();
    return first || null;
  }
  for (let i = 0; i < classNode.childCount; i++) {
    const ch = classNode.child(i);
    if (ch && /heritage/i.test(ch.type)) {
      const m = /extends\s+([A-Za-z_$][\w$.]*)/.exec(ch.text ?? "");
      if (m?.[1]) return m[1];
    }
  }
  return null;
}
/** Nombre SIMPLE: sin genericos, sin calificacion de modulo/paquete. */
function simpleName(raw: string): string {
  let s = raw.replace(/<.*$/s, "").replace(/\(.*$/s, "").trim();
  s = s.split("::").pop() ?? s;
  s = s.split(".").pop() ?? s;
  return s.replace(/[^\w$]/g, "").trim();
}

type Metodo = { nombre: string; aridad: number; ctor: boolean; vacio: "no" | "bloque" | "sinBody" | "soloPass"; linea: number };
type Clase = {
  nombre: string;
  base: string | null;
  file: string;
  lang: string;
  linea: number;
  metodos: Metodo[];
};

const LAXO = process.env.CK_AX3_LAXO === "1";
const ARIDAD = process.env.CK_AX3_ARIDAD === "1";
const clave = (m: Metodo): string => (ARIDAD ? `${m.nombre}/${m.aridad}` : m.nombre);
const [, , dir, nombre, out] = process.argv;
if (!dir || !nombre || !out) {
  console.error("Uso: npx tsx scripts/ax3-rb-sonda.mts <dir> <nombre> <salida.json>");
  process.exit(1);
}

const byExt = new Map<string, any>();
for (const d of LANGUAGE_DECLS as any[]) for (const e of d.extensions) byExt.set(e, d);

const files = await collectFiles(dir);
const clases: Clase[] = [];
let archivos = 0;

for (const f of files as any[]) {
  const decl = byExt.get(path.extname(f.path));
  if (!decl) continue;
  let source: string;
  try {
    source = readFileSync(path.join(dir, f.path), "utf8");
  } catch {
    continue;
  }
  if (source.length > 900_000) continue;
  const { parser, sets } = await langFor(decl);
  let tree: any = null;
  try {
    tree = parser.parse(source);
  } catch {
    continue;
  }
  if (!tree) continue;
  archivos++;
  try {
    // Recorrido con la clase contenedora INMEDIATA en la mano: un metodo
    // pertenece a la clase mas cercana que lo envuelve (equivale al campo
    // `FunctionMetrics.className` que usa el detector).
    const pila: Clase[] = [];
    const visitar = (node: any) => {
      if (!node) return;
      let empujada = false;
      if (node.isNamed && sets.classNodes.has(node.type)) {
        const nm = node.childForFieldName("name")?.text;
        if (nm) {
          const raw = extractSuperclassName(node);
          const c: Clase = {
            nombre: nm,
            base: raw ? simpleName(raw) || null : null,
            file: f.path,
            lang: decl.id,
            linea: node.startPosition.row + 1,
            metodos: [],
          };
          clases.push(c);
          pila.push(c);
          empujada = true;
        }
      } else if (node.isNamed && sets.functionNodes.has(node.type)) {
        const duena = pila[pila.length - 1];
        if (duena) {
          const nm = node.childForFieldName("name")?.text ?? null;
          const esCtorPorNodo = sets.constructorNodes.has(node.type);
          if (nm || esCtorPorNodo) {
            const par = node.childForFieldName("parameters");
            let aridad = 0;
            if (par) { for (let k = 0; k < par.childCount; k++) { const c = par.child(k); if (c && c.isNamed) aridad++; } }
            duena.metodos.push({
              nombre: nm ?? "<ctor>",
              aridad,
              ctor: esCtorPorNodo || (nm !== null && (CONSTRUCTOR_NAMES as Set<string>).has(nm)),
              vacio: emptyKind(node),
              linea: node.startPosition.row + 1,
            });
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) visitar(node.child(i));
      if (empujada) pila.pop();
    };
    visitar(tree.rootNode);
  } catch (e) {
    console.error("ERR", f.path, e);
  } finally {
    tree.delete?.();
  }
}

// ── indice repo-wide por nombre SIMPLE ───────────────────────────────────────
const porNombre = new Map<string, Clase[]>();
for (const c of clases) {
  const k = simpleName(c.nombre);
  if (!k) continue;
  let a = porNombre.get(k);
  if (!a) {
    a = [];
    porNombre.set(k, a);
  }
  a.push(c);
}

// ── el embudo ────────────────────────────────────────────────────────────────
const cero = () => ({ C0: 0, C1: 0, C2: 0, C2a: 0, C2b: 0, C3a: 0, C3b: 0, C4a: 0, C4b: 0, C5a: 0, C5b: 0 });
const total = cero();
const porLang: Record<string, ReturnType<typeof cero>> = {};
const bump = (lang: string, k: keyof ReturnType<typeof cero>) => {
  total[k]++;
  (porLang[lang] ??= cero())[k]++;
};

const hallazgos: any[] = [];
let ambiguos = 0;

for (const c of clases) {
  bump(c.lang, "C0");
  if (!c.base) continue;
  bump(c.lang, "C1");
  const cands = (porNombre.get(c.base) ?? []).filter((b) => b !== c);
  if (cands.length === 0) continue;
  // ESTRICTO (default, la regla del detector): un nombre visto en MAS DE UNA
  // declaracion es ambiguo y no entra en juego — es una COTA INFERIOR.
  // LAXO (`CK_AX3_LAXO=1`): se prueban TODOS los candidatos y el sujeto cuenta
  // si ALGUNO da anulacion — es la COTA SUPERIOR. Las dos se publican; ninguna
  // se elige despues de ver los datos.
  if (cands.length > 1) {
    ambiguos++;
    if (!LAXO) continue;
  }

  let mejor: { base: Clase; overrides: number; conCuerpoReal: number; anulados: any[] } | null = null;
  for (const base of cands) {
    const baseByName = new Map<string, Metodo>();
    for (const bm of base.metodos) if (!bm.ctor && bm.nombre) baseByName.set(clave(bm), bm);
    if (baseByName.size === 0) continue;
    let overrides = 0;
    let conCuerpoReal = 0;
    const anulados: any[] = [];
    for (const sm of c.metodos) {
      if (sm.ctor || !sm.nombre) continue;
      const bm = baseByName.get(clave(sm));
      if (!bm) continue;
      overrides++;
      if (bm.vacio !== "no") continue; // la base no daba nada real que anular
      conCuerpoReal++;
      if (sm.vacio === "no") continue; // la subclase conserva comportamiento
      anulados.push({ metodo: sm.nombre, linea: sm.linea, comoVacio: sm.vacio, baseLinea: bm.linea });
    }
    const cand = { base, overrides, conCuerpoReal, anulados };
    if (
      !mejor ||
      cand.anulados.length > mejor.anulados.length ||
      (cand.anulados.length === mejor.anulados.length && cand.conCuerpoReal > mejor.conCuerpoReal)
    ) {
      mejor = cand;
    }
  }

  const base = mejor?.base ?? cands[0]!;
  bump(c.lang, "C2");
  const mismo = base.file === c.file;
  bump(c.lang, mismo ? "C2a" : "C2b");
  if (!mejor) continue;

  if (mejor.overrides > 0) bump(c.lang, mismo ? "C3a" : "C3b");
  if (mejor.conCuerpoReal > 0) bump(c.lang, mismo ? "C4a" : "C4b");
  if (mejor.anulados.length > 0) {
    bump(c.lang, mismo ? "C5a" : "C5b");
    hallazgos.push({
      repo: nombre,
      lang: c.lang,
      mismoArchivo: mismo,
      ambiguo: cands.length > 1,
      subclase: c.nombre,
      file: c.file,
      linea: c.linea,
      base: base.nombre,
      baseFile: base.file,
      baseLinea: base.linea,
      anulados: mejor.anulados,
    });
  }
}

writeFileSync(
  out,
  JSON.stringify({ repo: nombre, archivos, clases: clases.length, ambiguos, total, porLang, hallazgos }, null, 1),
);
console.log(
  `${nombre}: C0=${total.C0} C1=${total.C1} C2=${total.C2} (mismo ${total.C2a} / otro ${total.C2b}) ` +
    `C4=${total.C4a}/${total.C4b} C5=${total.C5a}/${total.C5b} amb=${ambiguos} arch=${archivos}`,
);
