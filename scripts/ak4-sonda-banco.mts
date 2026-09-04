/**
 * AK4 — SONDA SOBRE EL BANCO DE `State · temporary-field`.
 *
 * NO es producción. Parsea CADA archivo del banco con la MISMA gramática que
 * usa el analizador (`LANGUAGE_DECLS` de `code-analyzer.ts` + el arnés real
 * `detect/testing.ts`), corre el detector-ancla REAL (`temporary-field.ts`)
 * sobre ese archivo, localiza el hallazgo del banco por (clase, campo) y
 * calcula las SEÑALES candidatas a discriminador declaradas en
 * `scratchpad-ak4/CRITERIO.md` — sin tocar producción y sin correr `analyzeRepo`.
 *
 * Uso: npx tsx scripts/ak4-sonda-banco.mts <banco.json> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { LANGUAGE_DECLS } from "../src/server/services/code-analyzer.js";
import { detector as temporaryFieldDetector } from "../src/server/services/detect/intra-file/temporary-field.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, testContext } from "../src/server/services/detect/testing.js";
import type { AstNode, FileUnit, RawFinding } from "../src/server/services/detect/types.js";
import type { DerivedNodeSets } from "../src/server/services/code-grammar.js";

const [, , bancoPath, outPath] = process.argv;
if (!bancoPath || !outPath) {
  console.error("Uso: npx tsx scripts/ak4-sonda-banco.mts <banco.json> <salida.json>");
  process.exit(1);
}

/* ── vocabulario copiado de `detect/intra-file/temporary-field.ts` ── */
const SELF_WORDS = new Set(["this", "self"]);
const RUBY_IVAR_TYPE = "instance_variable";
const OBJECT_FIELDS = ["object", "operand"];
const COMMENT_NODE_TYPE = /comment/i;
const NULL_NODE_TYPE = /^(null|nil|none|null_literal|undefined)$/i;
const NULL_WORD = /^(null|nil|none|undefined)$/i;
const FIELD_DECL_NODE_TYPE = /(^|_)(field|property)_(declaration|definition)$/;

/** `parent` no está en el tipo `AstNode` del proyecto pero sí en el árbol real de web-tree-sitter (sonda, no producción). */
function parentOf(node: AstNode): AstNode | null {
  return ((node as unknown as { parent?: AstNode | null }).parent ?? null);
}

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && !COMMENT_NODE_TYPE.test(c.type)) out.push(c);
  }
  return out;
}
function hasField(node: AstNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}
function findAllDescendants(node: AstNode, pred: (n: AstNode) => boolean, maxDepth: number, out: AstNode[]): void {
  if (pred(node)) out.push(node);
  if (maxDepth <= 0) return;
  for (const c of namedChildren(node)) findAllDescendants(c, pred, maxDepth - 1, out);
}
function findDescendant(node: AstNode, pred: (n: AstNode) => boolean, maxDepth = 8): AstNode | null {
  if (pred(node)) return node;
  if (maxDepth <= 0) return null;
  for (const c of namedChildren(node)) {
    const hit = findDescendant(c, pred, maxDepth - 1);
    if (hit) return hit;
  }
  return null;
}
function isAssignmentLike(node: AstNode): boolean {
  return hasField(node, "left") && hasField(node, "right");
}
function unwrapSingleChild(node: AstNode): AstNode {
  const kids = namedChildren(node);
  return kids.length === 1 ? unwrapSingleChild(kids[0]!) : node;
}
function objectOf(node: AstNode): AstNode | null {
  for (const f of OBJECT_FIELDS) {
    const c = node.childForFieldName(f) as AstNode | null;
    if (c) return c;
  }
  return null;
}
function memberNameOf(node: AstNode): string | null {
  const obj = objectOf(node);
  if (!obj) return null;
  for (let i = node.childCount - 1; i >= 0; i--) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && c !== obj) return c.text;
  }
  return null;
}
function selfFieldNameOf(node: AstNode, selfNames: ReadonlySet<string>, declaredFields: ReadonlySet<string>): string | null {
  if (node.type === RUBY_IVAR_TYPE) return node.text;
  const obj = objectOf(node);
  if (obj && selfNames.has(obj.text)) return memberNameOf(node);
  if (node.type === "identifier" && declaredFields.has(node.text)) return node.text;
  return null;
}
function isNullLiteral(node: AstNode): boolean {
  if (NULL_NODE_TYPE.test(node.type)) return true;
  return NULL_WORD.test(node.text.trim());
}
function goReceiverOf(fnNode: AstNode): { paramName: string; typeName: string } | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  const decl = namedChildren(receiver)[0] ?? receiver;
  const paramName = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
  const typeNode = findDescendant(decl, (n) => n.type === "type_identifier", 3);
  if (!paramName || !typeNode) return null;
  return { paramName, typeName: typeNode.text };
}
function declaredFieldNames(classNode: AstNode): Set<string> {
  const names = new Set<string>();
  const decls: AstNode[] = [];
  findAllDescendants(classNode, (n) => FIELD_DECL_NODE_TYPE.test(n.type), 3, decls);
  for (const decl of decls) {
    const declarators: AstNode[] = [];
    findAllDescendants(decl, (n) => /declarator$/.test(n.type), 3, declarators);
    if (declarators.length > 0) {
      for (const d of declarators) {
        const name = (d.childForFieldName("name") as AstNode | null)?.text ?? namedChildren(d)[0]?.text ?? null;
        if (name) names.add(name);
      }
      continue;
    }
    const name = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
    if (name) names.add(name);
  }
  return names;
}
function parameterNamesOf(fnNode: AstNode): Set<string> {
  const names = new Set<string>();
  const paramsNode =
    (fnNode.childForFieldName("parameters") as AstNode | null) ??
    namedChildren(fnNode).find((c) => /parameter/i.test(c.type)) ??
    null;
  if (!paramsNode) return names;
  const idents: AstNode[] = [];
  findAllDescendants(paramsNode, (n) => /identifier$/.test(n.type), 4, idents);
  for (const id of idents) names.add(id.text);
  return names;
}

/**
 * Los miembros DISTINTOS que contienen las ubicaciones del hallazgo, contados
 * POR POSICIÓN (la función más angosta que contiene cada sitio), nunca por
 * NOMBRE: en TS/JS un miembro escrito como propiedad de clase con función
 * flecha no tiene campo `name`, así que CINCO miembros distintos salen los
 * cinco como "(anónima)" y un conteo por nombre los colapsa en uno.
 * `null` = no se pudo resolver algún sitio (sin árbol vivo o sin función
 * contenedora): el llamador NO debe afirmar nada.
 */
function miembrosPorPosicion(file: FileUnit, locs: readonly { startLine: number; endLine: number }[]): number | null {
  const ids = new Set<number>();
  for (const l of locs) {
    let best: { startLine: number; endLine: number } | null = null;
    for (const fn of file.functions) {
      if (fn.startLine > l.startLine || fn.endLine < l.endLine) continue;
      if (!best || fn.endLine - fn.startLine < best.endLine - best.startLine) best = fn;
    }
    if (!best) return null;
    ids.add(best.startLine);
  }
  return ids.size;
}

/* ── SEÑALES CANDIDATAS ─────────────────────────────────────────────── */

/** ¿`node` está, por posición, dentro del subárbol `condition`/`alternative-guard` de algún ancestro rama? */
const CONDITION_FIELDS = ["condition"];

const LOOP_WORD = /(^|_)(while|until|for|do)(_|$)/;
const CREATION_WORD = /(^|_)(new|creation)(_|$)/;


interface Signals {
  /** miembros que NO escriben el campo y lo LEEN */
  readers: number;
  /** D1a — algún LECTOR (no escritor) usa el campo dentro de una CONDICIÓN */
  d1a_readerCondition: boolean;
  /** D1b — algún LECTOR compara el campo contra el literal nulo, o lo usa como condición desnuda */
  d1b_readerNullTest: boolean;
  /** D1c — CUALQUIER miembro (lector o escritor) compara el campo contra el literal nulo o lo usa como condición desnuda */
  d1c_anyNullTest: boolean;
  /** D3 — nº de miembros distintos que participan del ciclo (escrituras fuera del constructor) */
  writerMembers: number;
  /** D5 — algún LLENADO está guardado por una prueba de nulidad del propio campo (memoización) */
  d5_guardedFill: boolean;
  /** B1 — alguna ESCRITURA del campo ocurre dentro de un nodo de bucle */
  b1_writeInLoop: boolean;
  /** B1r — alguna LECTURA del campo ocurre dentro de un nodo de bucle */
  b1r_readInLoop: boolean;
  /** B2 — algún LLENADO construye un objeto/arreglo nuevo en su lado derecho */
  b2_fillIsCreation: boolean;
  /** B3 — algún LLENADO lee OTRO campo del propio objeto en su lado derecho */
  b3_fillFromOwnField: boolean;
  /** B7 — existe un miembro que LEE el campo y ADEMÁS lo vacía a nulo (ranura de entrega) */
  b7_consumeAndClear: boolean;
  /** B11 — existe un miembro que LLENA y VACÍA el campo (el ciclo entero dentro de un solo miembro) */
  b11_cycleInOneMember: boolean;
  /** B10 — algún LLENADO copia directamente un PARÁMETRO del miembro */
  b10_fillFromParameter: boolean;
}

function collectSignals(file: FileUnit, className: string, field: string): Signals {
  const sets: DerivedNodeSets = file.sets;
  const readers = new Set<string>();
  const writerMembers = new Set<string>();
  let d1a = false;
  let d1b = false;
  let d1c = false;
  let d5 = false;
  let b1 = false;
  let b1r = false;
  let b2 = false;
  let b3 = false;
  let b7 = false;
  let b11 = false;
  let b10 = false;

  const matchesClass = (name: string): boolean => name === className;

  const inLoop = (node: AstNode, stop: AstNode): boolean => {
    let cur: AstNode | null = parentOf(node);
    let d = 0;
    while (cur && d < 40) {
      if (LOOP_WORD.test(cur.type)) return true;
      if (cur === stop) return false;
      cur = parentOf(cur);
      d++;
    }
    return false;
  };

  const visit = (node: AstNode, cls: { name: string; fields: ReadonlySet<string> } | null): void => {
    let nextCls = cls;
    if (sets.classNodes.has(node.type)) {
      const name = (node.childForFieldName("name") as AstNode | null)?.text ?? `(anónima)@${node.startPosition.row}`;
      nextCls = { name, fields: declaredFieldNames(node) };
    } else if (sets.functionNodes.has(node.type)) {
      const goReceiver = goReceiverOf(node);
      const selfNames = new Set(SELF_WORDS);
      let methodCls = nextCls;
      if (goReceiver) {
        selfNames.add(goReceiver.paramName);
        methodCls = { name: goReceiver.typeName, fields: new Set<string>() };
      }
      const body = (node.childForFieldName("body") as AstNode | null) ?? (node.childForFieldName("consequence") as AstNode | null);
      const methodName = (node.childForFieldName("name") as AstNode | null)?.text ?? "(anónima)";
      if (body && methodCls && matchesClass(methodCls.name)) {
        const shadowed = parameterNamesOf(node);
        const visibleFields = new Set([...methodCls.fields].filter((f) => !shadowed.has(f)));
        const params = parameterNamesOf(node);
        const assigns: AstNode[] = [];
        findAllDescendants(body, isAssignmentLike, 12, assigns);
        let writesField = false;
        let clearsHere = false;
        let fillsHere = false;
        const clearLefts: AstNode[] = [];
        for (const assign of assigns) {
          const leftRaw = assign.childForFieldName("left") as AstNode | null;
          const rightRaw = assign.childForFieldName("right") as AstNode | null;
          if (!leftRaw || !rightRaw) continue;
          const left = unwrapSingleChild(leftRaw);
          const right = unwrapSingleChild(rightRaw);
          const f = selfFieldNameOf(left, selfNames, visibleFields);
          if (f !== field) continue;
          // MISMO ORDEN QUE EL DETECTOR: una `binary_expression` (`in == null`)
          // también expone `left`/`right`, así que "escribe el campo" sólo vale
          // DESPUÉS del filtro de operador y del filtro `F = F`.
          const operator = (assign.childForFieldName("operator") as AstNode | null)?.text ?? "=";
          if (operator !== "=" && operator !== ":=") continue;
          const toNull = isNullLiteral(right);
          if (!toNull) {
            const readsOnlyItself =
              selfFieldNameOf(right, selfNames, visibleFields) === field || (right.type === "identifier" && right.text === field);
            if (readsOnlyItself) continue;
          }
          writesField = true;
          if (inLoop(assign, body)) b1 = true;
          if (toNull) {
            clearsHere = true;
            clearLefts.push(left);
          } else {
            fillsHere = true;
            const creations: AstNode[] = [];
            findAllDescendants(right, (n) => CREATION_WORD.test(n.type), 8, creations);
            if (creations.length > 0) b2 = true;
            const ownFields: AstNode[] = [];
            findAllDescendants(right, (n) => {
              const nm = selfFieldNameOf(n, selfNames, visibleFields);
              return nm !== null && nm !== field;
            }, 8, ownFields);
            if (ownFields.length > 0) b3 = true;
            if (right.type === "identifier" && params.has(right.text)) b10 = true;
            // D5: ¿este llenado está DENTRO de una guarda que prueba la nulidad del propio campo?
            let anc: AstNode | null = parentOf(assign);
            let depth = 0;
            while (anc && depth < 10) {
              const cond = anc.childForFieldName("condition") as AstNode | null;
              if (cond && nullTestOf(cond, field, selfNames, visibleFields)) {
                d5 = true;
                break;
              }
              anc = parentOf(anc);
              depth++;
            }
          }
        }
        if (writesField) writerMembers.add(methodName);
        if (clearsHere && fillsHere) b11 = true;

        const accesses: AstNode[] = [];
        findAllDescendants(body, (n) => selfFieldNameOf(n, selfNames, visibleFields) === field, 12, accesses);
        if (accesses.length > 0) {
          if (!writesField) readers.add(methodName);
          const realReads = accesses.filter((a) => !clearLefts.includes(a));
          if (clearsHere && realReads.length > 0) b7 = true;
          for (const acc of accesses) {
            if (inLoop(acc, body)) b1r = true;
            const inCond = insideCondition(acc, body);
            if (inCond) {
              d1c ||= isNullTestContext(acc, field, selfNames, visibleFields);
              if (!writesField) {
                d1a = true;
                d1b ||= isNullTestContext(acc, field, selfNames, visibleFields);
              }
            }
          }
        }
      }
    }
    for (const c of namedChildren(node)) visit(c, nextCls);
  };
  visit(file.root, null);
  return {
    readers: readers.size,
    d1a_readerCondition: d1a,
    d1b_readerNullTest: d1b,
    d1c_anyNullTest: d1c,
    writerMembers: writerMembers.size,
    d5_guardedFill: d5,
    b1_writeInLoop: b1,
    b1r_readInLoop: b1r,
    b2_fillIsCreation: b2,
    b3_fillFromOwnField: b3,
    b7_consumeAndClear: b7,
    b11_cycleInOneMember: b11,
    b10_fillFromParameter: b10,
  };
}

/** ¿`node` cae dentro del subárbol `condition` de algún ancestro (hasta `stop`)? */
function insideCondition(node: AstNode, stop: AstNode): boolean {
  let cur: AstNode | null = parentOf(node);
  let depth = 0;
  while (cur && depth < 40) {
    for (const f of CONDITION_FIELDS) {
      const cond = cur.childForFieldName(f) as AstNode | null;
      if (cond && contains(cond, node)) return true;
    }
    if (cur === stop) return false;
    cur = parentOf(cur);
    depth++;
  }
  return false;
}

function contains(outer: AstNode, inner: AstNode): boolean {
  const so = outer.startPosition;
  const si = inner.startPosition;
  const eo = outer.endPosition;
  const ei = inner.endPosition;
  const startsBefore = so.row < si.row || (so.row === si.row && so.column <= si.column);
  const endsAfter = eo.row > ei.row || (eo.row === ei.row && eo.column >= ei.column);
  return startsBefore && endsAfter;
}

/**
 * ¿`acc` (una lectura del campo) participa de una PRUEBA DE PRESENCIA?
 *   - comparado contra el literal nulo (`F == null`, `F != nil`, `F is None`), o
 *   - usado como condición DESNUDA (`if (F)`, `if (!F)`, `F && …`).
 */
function isNullTestContext(acc: AstNode, field: string, selfNames: ReadonlySet<string>, fields: ReadonlySet<string>): boolean {
  let cur: AstNode | null = parentOf(acc);
  let depth = 0;
  while (cur && depth < 4) {
    const left = cur.childForFieldName("left") as AstNode | null;
    const right = cur.childForFieldName("right") as AstNode | null;
    if (left && right) {
      const l = unwrapSingleChild(left);
      const r = unwrapSingleChild(right);
      if (selfFieldNameOf(l, selfNames, fields) === field && isNullLiteral(r)) return true;
      if (selfFieldNameOf(r, selfNames, fields) === field && isNullLiteral(l)) return true;
    }
    cur = parentOf(cur);
    depth++;
  }
  // condición desnuda: el acceso ES (o es el único hijo nombrado de) el subárbol `condition`
  let p: AstNode | null = parentOf(acc);
  let d = 0;
  while (p && d < 4) {
    const cond = p.childForFieldName("condition") as AstNode | null;
    if (cond) {
      const bare = unwrapSingleChild(cond);
      if (bare === acc) return true;
      // `!F` / `not F` — un operador unario alrededor del acceso
      const kids = namedChildren(bare);
      if (kids.length === 1 && kids[0] === acc) return true;
      return false;
    }
    p = parentOf(p);
    d++;
  }
  return false;
}

function nullTestOf(cond: AstNode, field: string, selfNames: ReadonlySet<string>, fields: ReadonlySet<string>): boolean {
  const hits: AstNode[] = [];
  findAllDescendants(cond, (n) => selfFieldNameOf(n, selfNames, fields) === field, 8, hits);
  for (const h of hits) if (isNullTestContext(h, field, selfNames, fields)) return true;
  return false;
}

/* ── driver ─────────────────────────────────────────────────────────── */

interface BankRow {
  key: string;
  verdict: string;
  repo: string;
  pop: string;
  title: string;
  cls: string;
  field: string;
  path: string;
  states: string[];
}

const bank = JSON.parse(readFileSync(bancoPath, "utf8")) as BankRow[];
const setsCache = new Map<string, Promise<DerivedNodeSets>>();
function setsFor(decl: (typeof LANGUAGE_DECLS)[number]): Promise<DerivedNodeSets> {
  const k = decl.id;
  let p = setsCache.get(k);
  if (!p) {
    p = nodeSetsFor(decl.wasm, decl.probeSource, decl.extraCloneNodes, decl.functionExclusions);
    setsCache.set(k, p);
  }
  return p;
}

const byExt = new Map<string, (typeof LANGUAGE_DECLS)[number]>();
for (const d of LANGUAGE_DECLS) for (const e of d.extensions) byExt.set(e, d);

const out: Record<string, unknown>[] = [];
let noDecl = 0;
let noFinding = 0;

// cache por archivo: parsear una sola vez aunque el banco traiga varios campos del mismo archivo
const fileCache = new Map<string, { file: FileUnit; findings: readonly RawFinding[] }>();

for (const row of bank) {
  const root = row.pop === "LIB" ? "corpus" : "corpus-app";
  const abs = path.join("/home/maxi1805/claude-kanban", root, row.repo, row.path);
  const decl = byExt.get(path.extname(row.path));
  if (!decl) {
    noDecl++;
    out.push({ ...row, error: "sin gramática" });
    continue;
  }
  let entry = fileCache.get(abs);
  if (!entry) {
    const sets = await setsFor(decl);
    const src = readFileSync(abs, "utf8");
    const astRoot = await parseRoot(decl.wasm, src);
    const file = fileUnitFrom(astRoot, sets, decl.id, { file: row.path });
    const findings = temporaryFieldDetector.run(file, testContext(temporaryFieldDetector, decl.id));
    entry = { file, findings };
    fileCache.set(abs, entry);
  }
  const hit = entry.findings.find((f) => f.title === row.title);
  if (!hit) noFinding++;
  const readerEvidence = hit?.evidence?.find((e) => e.label === "miembros que sólo lo leen")?.value ?? null;
  const clears = hit?.evidence?.find((e) => e.label === "sitios que vacían el campo")?.value ?? null;
  const fills = hit?.evidence?.find((e) => e.label === "sitios que lo llenan")?.value ?? null;
  // EXACTAMENTE lo que ve producción: `problem.locations[].symbol`.
  const locSymbols = new Set((hit?.locations ?? []).map((l) => l.symbol).filter((x): x is string => Boolean(x)));
  const sig = collectSignals(entry.file, row.cls, row.field);
  out.push({
    key: row.key,
    verdict: row.verdict,
    repo: row.repo,
    pop: row.pop,
    cls: row.cls,
    field: row.field,
    path: row.path,
    states: row.states,
    anclaReproducida: Boolean(hit),
    readersAncla: readerEvidence,
    clearsAncla: clears,
    fillsAncla: fills,
    sitiosAncla: (hit?.locations ?? []).length,
    escritoresDeLocations: locSymbols.size,
    escritoresPorPosicion: hit ? miembrosPorPosicion(entry.file, hit.locations) : null,
    ...sig,
  });
}

writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`filas ${out.length} · sin gramática ${noDecl} · ancla NO reproducida ${noFinding}`);
