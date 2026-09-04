/**
 * AL2 — SONDA SOBRE EL BANCO DE `State · temporary-field`.
 *
 * NO es producción. Parsea cada archivo del banco con la MISMA gramática que
 * usa el analizador (`LANGUAGE_DECLS` + el arnés real `detect/testing.ts`),
 * corre el detector-ancla REAL (`temporary-field.ts`) encima, localiza el
 * hallazgo del banco por título y calcula las señales candidatas declaradas
 * en `scratchpad-al2/CRITERIO.md`.
 *
 * Continúa `scripts/ak4-sonda-banco.mts` (Ola AK): re-calcula sus 14 señales
 * para reproducir su tabla sobre MI banco, y agrega la dimensión que ese
 * frente no tocó — LA RELACIÓN ENTRE LOS MIEMBROS DEL CICLO y la forma del
 * sitio de vaciado.
 *
 * Uso: npx tsx scripts/al2-sonda-banco.mts <banco.json> <salida.json>
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
  console.error("Uso: npx tsx scripts/al2-sonda-banco.mts <banco.json> <salida.json>");
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
/* ── vocabulario nuevo de este frente ── */
/** llamada: el mismo criterio genérico que `hypotheses/proxy.ts#isCallLike` usa en producción. */
const CALL_NODE_TYPE = /call/i;
/** suscripción/indexado: la forma "F[…]" en las nueve gramáticas. */
const SUBSCRIPT_NODE_TYPE = /(^|_)(subscript|index_expression|array_access|element_access|element_reference|slice)(_expression)?$/;
const ARRAY_TYPE_TEXT = /\[\s*\]/;

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
/** El TEXTO del tipo declarado del campo `field` dentro de `classNode`, o null. */
function declaredFieldTypeText(classNode: AstNode, field: string): string | null {
  const decls: AstNode[] = [];
  findAllDescendants(classNode, (n) => FIELD_DECL_NODE_TYPE.test(n.type), 3, decls);
  for (const decl of decls) {
    const names: string[] = [];
    const declarators: AstNode[] = [];
    findAllDescendants(decl, (n) => /declarator$/.test(n.type), 3, declarators);
    if (declarators.length > 0) {
      for (const d of declarators) {
        const nm = (d.childForFieldName("name") as AstNode | null)?.text ?? namedChildren(d)[0]?.text ?? null;
        if (nm) names.push(nm);
      }
    } else {
      const nm = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
      if (nm) names.push(nm);
    }
    if (!names.includes(field)) continue;
    const t = decl.childForFieldName("type") as AstNode | null;
    if (t) return t.text;
    return decl.text.split("=")[0] ?? null;
  }
  return null;
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
function isCallLike(node: AstNode): boolean {
  return CALL_NODE_TYPE.test(node.type) || hasField(node, "arguments") || hasField(node, "function");
}
/** El nombre invocado de una llamada: el último identificador de su callee. */
function calleeNameOf(call: AstNode): string | null {
  const callee =
    (call.childForFieldName("function") as AstNode | null) ??
    (call.childForFieldName("method") as AstNode | null) ??
    (call.childForFieldName("name") as AstNode | null) ??
    null;
  if (!callee) return null;
  const txt = callee.text.trim();
  const parts = txt.split(/[.:]/);
  const last = parts[parts.length - 1] ?? "";
  return /^[A-Za-z_$@][A-Za-z0-9_$]*$/.test(last) ? last : null;
}
/** ¿El receptor de la llamada es el propio objeto (o no tiene receptor)? */
function callOnSelf(call: AstNode, selfNames: ReadonlySet<string>): boolean {
  const callee =
    (call.childForFieldName("function") as AstNode | null) ??
    (call.childForFieldName("method") as AstNode | null) ??
    null;
  if (!callee) return true;
  const obj = objectOf(callee);
  if (!obj) return true; // llamada desnuda: el receptor implícito es el propio objeto
  return selfNames.has(obj.text);
}
function contains(outer: AstNode, inner: AstNode): boolean {
  const so = outer.startPosition, si = inner.startPosition, eo = outer.endPosition, ei = inner.endPosition;
  const startsBefore = so.row < si.row || (so.row === si.row && so.column <= si.column);
  const endsAfter = eo.row > ei.row || (eo.row === ei.row && eo.column >= ei.column);
  return startsBefore && endsAfter;
}
function insideCondition(node: AstNode, stop: AstNode): boolean {
  let cur: AstNode | null = parentOf(node);
  let depth = 0;
  while (cur && depth < 40) {
    const cond = cur.childForFieldName("condition") as AstNode | null;
    if (cond && contains(cond, node)) return true;
    if (cur === stop) return false;
    cur = parentOf(cur);
    depth++;
  }
  return false;
}
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
  let p: AstNode | null = parentOf(acc);
  let d = 0;
  while (p && d < 4) {
    const cond = p.childForFieldName("condition") as AstNode | null;
    if (cond) {
      const bare = unwrapSingleChild(cond);
      if (bare === acc) return true;
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
const LOOP_WORD = /(^|_)(while|until|for|do)(_|$)/;
const CREATION_WORD = /(^|_)(new|creation)(_|$)/;

/** ¿`node` es (o está dentro de) la ÚLTIMA sentencia nombrada del cuerpo `body`? */
function isLastActOf(node: AstNode, body: AstNode): boolean {
  const stmts = namedChildren(body);
  const last = stmts[stmts.length - 1];
  if (!last) return false;
  return last === node || contains(last, node);
}

/** miembros de la unidad: nombre -> nodos función (puede haber homónimos) */
interface MemberInfo {
  node: AstNode;
  body: AstNode;
  name: string;
}

interface Signals {
  readers: number;
  readerMembers: string[];
  fillMembers: string[];
  clearMembers: string[];
  writerMembers: number;
  unitMembers: number;
  /* ── AK4 ── */
  d1a_readerCondition: boolean;
  d1b_readerNullTest: boolean;
  d1c_anyNullTest: boolean;
  d5_guardedFill: boolean;
  b1_writeInLoop: boolean;
  b1r_readInLoop: boolean;
  b2_fillIsCreation: boolean;
  b3_fillFromOwnField: boolean;
  b7_consumeAndClear: boolean;
  b11_cycleInOneMember: boolean;
  b10_fillFromParameter: boolean;
  /* ── AL2, nuevas ── */
  /** C1 — algún miembro que LLENA y algún miembro que VACÍA están unidos por una llamada directa */
  c1_cycleJoinedByCall: boolean;
  /** C1 (fuerte) — los miembros del ciclo colapsan en UN solo componente bajo llamadas intra-unidad */
  c1c_cycleComponents: number;
  /** C1b — un TERCER miembro de la unidad llama a ≥2 miembros del ciclo */
  c1b_orchestrated: boolean;
  /** C2 — algún VACIADO está guardado por una prueba de presencia del propio campo */
  c2_guardedClear: boolean;
  /** C3 — algún vaciado es el ÚLTIMO acto de su miembro */
  c3_clearIsLastAct: boolean;
  /** C3' — TODOS los vaciados son el último acto de su miembro */
  c3all_allClearsLastAct: boolean;
  /** C6 — algún LLENADO copia el resultado de una llamada al propio objeto */
  c6_fillFromOwnCall: boolean;
  /** C7 — algún acceso al campo (fuera del ciclo) es el objeto de una suscripción */
  c7_subscripted: boolean;
  /** C8 — el tipo declarado del campo es un ARREGLO */
  c8_arrayType: boolean;
  /** texto del tipo declarado (diagnóstico) */
  declaredType: string | null;
}

function collectSignals(file: FileUnit, className: string, field: string): Signals {
  const sets: DerivedNodeSets = file.sets;
  const readers = new Set<string>();
  const fillMembers = new Set<string>();
  const clearMembers = new Set<string>();
  const unitMembers = new Map<string, MemberInfo[]>();
  let d1a = false, d1b = false, d1c = false, d5 = false;
  let b1 = false, b1r = false, b2 = false, b3 = false, b7 = false, b11 = false, b10 = false;
  let c2 = false, c3 = false, c6 = false, c7 = false;
  let clearsTotal = 0, clearsLast = 0;
  let declaredType: string | null = null;

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
      if (matchesClass(name) && declaredType === null) declaredType = declaredFieldTypeText(node, field);
    } else if (sets.functionNodes.has(node.type)) {
      const goReceiver = goReceiverOf(node);
      const selfNames = new Set(SELF_WORDS);
      let methodCls = nextCls;
      if (goReceiver) {
        selfNames.add(goReceiver.paramName);
        methodCls = { name: goReceiver.typeName, fields: new Set<string>() };
      }
      const body = (node.childForFieldName("body") as AstNode | null) ?? (node.childForFieldName("consequence") as AstNode | null);
      const methodName = (node.childForFieldName("name") as AstNode | null)?.text ?? `(anónima)@${node.startPosition.row}`;
      if (body && methodCls && matchesClass(methodCls.name)) {
        const list = unitMembers.get(methodName) ?? [];
        list.push({ node, body, name: methodName });
        unitMembers.set(methodName, list);

        const shadowed = parameterNamesOf(node);
        const visibleFields = new Set([...methodCls.fields].filter((f) => !shadowed.has(f)));
        const params = parameterNamesOf(node);
        const assigns: AstNode[] = [];
        findAllDescendants(body, isAssignmentLike, 12, assigns);
        let writesField = false, clearsHere = false, fillsHere = false;
        const clearLefts: AstNode[] = [];
        const cycleAssigns: AstNode[] = [];
        for (const assign of assigns) {
          const leftRaw = assign.childForFieldName("left") as AstNode | null;
          const rightRaw = assign.childForFieldName("right") as AstNode | null;
          if (!leftRaw || !rightRaw) continue;
          const left = unwrapSingleChild(leftRaw);
          const right = unwrapSingleChild(rightRaw);
          const f = selfFieldNameOf(left, selfNames, visibleFields);
          if (f !== field) continue;
          const operator = (assign.childForFieldName("operator") as AstNode | null)?.text ?? "=";
          if (operator !== "=" && operator !== ":=") continue;
          const toNull = isNullLiteral(right);
          if (!toNull) {
            const readsOnlyItself =
              selfFieldNameOf(right, selfNames, visibleFields) === field || (right.type === "identifier" && right.text === field);
            if (readsOnlyItself) continue;
          }
          writesField = true;
          cycleAssigns.push(assign);
          if (inLoop(assign, body)) b1 = true;
          if (toNull) {
            clearsHere = true;
            clearLefts.push(left);
            clearsTotal++;
            if (isLastActOf(assign, body)) { clearsLast++; c3 = true; }
            // C2 — ¿este VACIADO está dentro de una guarda que prueba la presencia del propio campo?
            let anc: AstNode | null = parentOf(assign);
            let depth = 0;
            while (anc && depth < 10) {
              const cond = anc.childForFieldName("condition") as AstNode | null;
              if (cond && nullTestOf(cond, field, selfNames, visibleFields)) { c2 = true; break; }
              anc = parentOf(anc);
              depth++;
            }
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
            // C6 — el llenado copia el resultado de una llamada al PROPIO objeto
            const calls: AstNode[] = [];
            findAllDescendants(right, (n) => isCallLike(n), 6, calls);
            for (const c of calls) if (callOnSelf(c, selfNames)) { c6 = true; break; }
            let anc: AstNode | null = parentOf(assign);
            let depth = 0;
            while (anc && depth < 10) {
              const cond = anc.childForFieldName("condition") as AstNode | null;
              if (cond && nullTestOf(cond, field, selfNames, visibleFields)) { d5 = true; break; }
              anc = parentOf(anc);
              depth++;
            }
          }
        }
        if (writesField) {
          if (fillsHere) fillMembers.add(methodName);
          if (clearsHere) clearMembers.add(methodName);
        }
        if (clearsHere && fillsHere) b11 = true;

        const accesses: AstNode[] = [];
        findAllDescendants(body, (n) => selfFieldNameOf(n, selfNames, visibleFields) === field, 12, accesses);
        if (accesses.length > 0) {
          if (!writesField) readers.add(methodName);
          const realReads = accesses.filter((a) => !clearLefts.includes(a));
          if (clearsHere && realReads.length > 0) b7 = true;
          for (const acc of accesses) {
            if (inLoop(acc, body)) b1r = true;
            // C7 — ¿el acceso es el OBJETO de una suscripción?
            const p = parentOf(acc);
            if (p && (SUBSCRIPT_NODE_TYPE.test(p.type) || hasField(p, "index")) && !cycleAssigns.some((a) => contains(a, acc))) {
              const obj = objectOf(p) ?? namedChildren(p)[0] ?? null;
              if (obj === acc || (obj && contains(obj, acc))) c7 = true;
            }
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

  /* ── C1 / C1b: las llamadas intra-unidad entre los miembros del ciclo ── */
  const cycle = new Set<string>([...fillMembers, ...clearMembers]);
  const callsFrom = new Map<string, Set<string>>();
  for (const [name, infos] of unitMembers) {
    const dst = new Set<string>();
    for (const info of infos) {
      const calls: AstNode[] = [];
      findAllDescendants(info.body, (n) => isCallLike(n), 14, calls);
      for (const c of calls) {
        const nm = calleeNameOf(c);
        if (nm && nm !== name && unitMembers.has(nm)) dst.add(nm);
      }
    }
    callsFrom.set(name, dst);
  }
  let c1 = false;
  for (const f of fillMembers) {
    for (const cl of clearMembers) {
      if (f === cl) continue;
      if (callsFrom.get(f)?.has(cl) || callsFrom.get(cl)?.has(f)) c1 = true;
    }
  }
  // componentes conexos (no dirigidos) del conjunto del ciclo bajo llamadas intra-unidad
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const m of cycle) parent.set(m, m);
  for (const a of cycle) for (const b of callsFrom.get(a) ?? []) if (cycle.has(b)) parent.set(find(a), find(b));
  const comps = new Set([...cycle].map(find)).size;
  let c1b = false;
  for (const [name, dst] of callsFrom) {
    if (cycle.has(name)) continue;
    let n = 0;
    for (const d of dst) if (cycle.has(d)) n++;
    if (n >= 2) { c1b = true; break; }
  }

  return {
    readers: readers.size,
    readerMembers: [...readers].sort(),
    fillMembers: [...fillMembers].sort(),
    clearMembers: [...clearMembers].sort(),
    writerMembers: cycle.size,
    unitMembers: unitMembers.size,
    d1a_readerCondition: d1a,
    d1b_readerNullTest: d1b,
    d1c_anyNullTest: d1c,
    d5_guardedFill: d5,
    b1_writeInLoop: b1,
    b1r_readInLoop: b1r,
    b2_fillIsCreation: b2,
    b3_fillFromOwnField: b3,
    b7_consumeAndClear: b7,
    b11_cycleInOneMember: b11,
    b10_fillFromParameter: b10,
    c1_cycleJoinedByCall: c1,
    c1c_cycleComponents: comps,
    c1b_orchestrated: c1b,
    c2_guardedClear: c2,
    c3_clearIsLastAct: c3,
    c3all_allClearsLastAct: clearsTotal > 0 && clearsLast === clearsTotal,
    c6_fillFromOwnCall: c6,
    c7_subscripted: c7,
    c8_arrayType: declaredType !== null && ARRAY_TYPE_TEXT.test(declaredType),
    declaredType,
  };
}

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

/* ── driver ───────────────────────────────────────────────────────── */
interface BankRow {
  key: string; verdict: string; repo: string; pop: string; title: string;
  cls: string; field: string; path: string; states: string[];
}

const bank = JSON.parse(readFileSync(bancoPath, "utf8")) as BankRow[];
const setsCache = new Map<string, Promise<DerivedNodeSets>>();
function setsFor(decl: (typeof LANGUAGE_DECLS)[number]): Promise<DerivedNodeSets> {
  let p = setsCache.get(decl.id);
  if (!p) {
    p = nodeSetsFor(decl.wasm, decl.probeSource, decl.extraCloneNodes, decl.functionExclusions);
    setsCache.set(decl.id, p);
  }
  return p;
}
const byExt = new Map<string, (typeof LANGUAGE_DECLS)[number]>();
for (const d of LANGUAGE_DECLS) for (const e of d.extensions) byExt.set(e, d);

const out: Record<string, unknown>[] = [];
let noDecl = 0, noFinding = 0;
const fileCache = new Map<string, { file: FileUnit; findings: readonly RawFinding[] }>();

for (const row of bank) {
  const rootDir = row.pop === "LIB" ? "corpus" : "corpus-app";
  const abs = path.join("/home/maxi1805/claude-kanban", rootDir, row.repo, row.path);
  const decl = byExt.get(path.extname(row.path));
  if (!decl) { noDecl++; out.push({ ...row, error: "sin gramática" }); continue; }
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
  const locSymbols = new Set((hit?.locations ?? []).map((l) => l.symbol).filter((x): x is string => Boolean(x)));
  const sig = collectSignals(entry.file, row.cls, row.field);
  // C5 — ¿la unidad declara ≥2 campos temporales cuyos sitios de ciclo caen en LOS MISMOS miembros?
  const sameUnit = entry.findings.filter((f) => f !== hit && f.title.startsWith("`" + row.cls + "."));
  const mySyms = [...locSymbols].sort().join("|");
  const c5 = sameUnit.some((f) => {
    const s = new Set(f.locations.map((l) => l.symbol).filter((x): x is string => Boolean(x)));
    return [...s].sort().join("|") === mySyms;
  });
  out.push({
    key: row.key, verdict: row.verdict, repo: row.repo, pop: row.pop, cls: row.cls, field: row.field,
    path: row.path, states: row.states,
    anclaReproducida: Boolean(hit),
    readersAncla: readerEvidence, clearsAncla: clears, fillsAncla: fills,
    sitiosAncla: (hit?.locations ?? []).length,
    escritoresDeLocations: locSymbols.size,
    escritoresPorPosicion: hit ? miembrosPorPosicion(entry.file, hit.locations) : null,
    c4_unSoloCiclo: clears === 1 && fills === 1,
    c5_viajaEnGrupo: c5,
    camposTemporalesDeLaUnidad: sameUnit.length + 1,
    ...sig,
  });
}

writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`filas ${out.length} · sin gramática ${noDecl} · ancla NO reproducida ${noFinding}`);
