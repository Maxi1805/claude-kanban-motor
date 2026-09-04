/**
 * OLA AK, FRENTE AK6 — SONDA (no producción) sobre `optional-behavior-flags`.
 *
 * Para cada unidad del BANCO de veredictos de `Decorator · optional-behavior-flags`
 * abre el archivo REAL con el mismo cargador que usa producción
 * (`resolveLiveFileUnit`), corre `capabilityUnitsOf` (la función exportada que
 * `hypotheses/decorator.ts` ya re-verifica) y anota, por capacidad y por sitio,
 * hechos de GRAMÁTICA que hoy nadie mide:
 *   · dónde ocurre la inyección `campo = parámetro` (constructor o no)
 *   · si la guarda tiene rama alternativa (`else`)
 *   · cuántas sentencias tiene la consecuencia y si es sólo un `return`/`raise`
 *   · si el campo se LEE además fuera de toda guarda
 *
 * Uso: npx tsx scripts/ak6-sonda-decorator.mts <banco.json> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import { capabilityUnitsOf } from "../src/server/services/detect/intra-file/optional-behavior-flags.js";
import { CONSTRUCTOR_NAMES } from "../src/server/services/code-grammar.js";
import type { AstNode } from "../src/server/services/detect/types.js";

const [, , bancoPath, outPath] = process.argv;
if (!bancoPath || !outPath) {
  console.error("Uso: npx tsx scripts/ak6-sonda-decorator.mts <banco.json> <salida.json>");
  process.exit(1);
}

const SELF_WORDS = new Set(["this", "self"]);
const RUBY_IVAR_TYPE = "instance_variable";
const OBJECT_FIELDS = ["object", "operand"];
const COMMENT_NODE_TYPE = /comment/i;
const FIELD_DECL_NODE_TYPE = /(^|_)(field|property)_(declaration|definition)$/;
const RETURN_LIKE = /(^|_)(return|raise|throw|yield)(_|$)/;

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
  const paramsNode = (fnNode.childForFieldName("parameters") as AstNode | null) ?? namedChildren(fnNode).find((c) => /parameter/i.test(c.type)) ?? null;
  if (!paramsNode) return names;
  const idents: AstNode[] = [];
  findAllDescendants(paramsNode, (n) => /identifier$/.test(n.type), 4, idents);
  for (const id of idents) names.add(id.text);
  return names;
}
function isAssignmentLike(node: AstNode): boolean {
  return hasField(node, "left") && hasField(node, "right");
}

interface Inject {
  field: string;
  member: string;
  isConstructor: boolean;
  line: number;
}
interface Guard {
  field: string;
  member: string;
  line: number;
  hasAlternative: boolean;
  alternativeStatements: number;
  alternativeOnlyReturnLike: boolean;
  consequenceStatements: number;
  consequenceOnlyReturnLike: boolean;
  consequenceHasAssignToSelf: boolean;
  consequenceText: string;
}

interface Read {
  field: string;
  member: string;
  line: number;
  text: string;
}

const banco = JSON.parse(readFileSync(bancoPath, "utf8")) as Array<Record<string, string | number>>;
const out: unknown[] = [];

for (const row of banco) {
  const dir = `${process.cwd()}/${row.dir as string}`;
  const rel = row.file as string;
  const live = await resolveLiveFileUnit(dir, rel);
  if (!live) {
    out.push({ ...row, error: "SIN ARBOL" });
    continue;
  }
  const unitFile = live.unit;
  const units = capabilityUnitsOf(unitFile.root, unitFile.sets, unitFile.sets.constructorNodes);
  const target = units.find((u) => u.name === (row.unit as string)) ?? null;

  // Segunda pasada propia: hechos por INYECCIÓN y por GUARDA.
  const injects: Inject[] = [];
  const guards: Guard[] = [];
  const reads: Read[] = [];
  const readsD2: Read[] = [];
  const guardCondSpans: Array<{ a: number; b: number; ac: number; bc: number }> = [];
  const classInfo: Record<string, unknown> = {};

  let targetClassNode: AstNode | null = null;
  let targetFields: ReadonlySet<string> = new Set<string>();
  const visit = (node: AstNode, cls: { name: string; node: AstNode; fields: ReadonlySet<string> } | null): void => {
    let nextCls = cls;
    if (unitFile.sets.classNodes.has(node.type)) {
      const name = (node.childForFieldName("name") as AstNode | null)?.text ?? `(anónima)@${node.startPosition.row}`;
      nextCls = { name, node, fields: declaredFieldNames(node) };
      if (name === (row.unit as string)) {
        classInfo.classNodeType = node.type;
        classInfo.superclassText = (node.childForFieldName("superclass") as AstNode | null)?.text ?? null;
        classInfo.headText = node.text.slice(0, 160).split("\n")[0];
        targetClassNode = node;
        targetFields = nextCls.fields;
      }
    } else if (unitFile.sets.functionNodes.has(node.type)) {
      const goRecv = goReceiverOf(node);
      const selfNames = new Set(SELF_WORDS);
      let owner = nextCls;
      if (goRecv) {
        selfNames.add(goRecv.paramName);
        owner = { name: goRecv.typeName, node, fields: new Set<string>() };
      }
      const body = (node.childForFieldName("body") as AstNode | null) ?? (node.childForFieldName("consequence") as AstNode | null);
      const memberName = (node.childForFieldName("name") as AstNode | null)?.text ?? "(anónima)";
      if (body && owner && owner.name === (row.unit as string)) {
        const isConstructor = unitFile.sets.constructorNodes.has(node.type) || CONSTRUCTOR_NAMES.has(memberName);
        const params = parameterNamesOf(node);
        const visibleFields = new Set([...owner.fields].filter((f) => !params.has(f)));

        const assigns: AstNode[] = [];
        findAllDescendants(body, isAssignmentLike, 12, assigns);
        for (const a of assigns) {
          const leftRaw = a.childForFieldName("left") as AstNode | null;
          const rightRaw = a.childForFieldName("right") as AstNode | null;
          if (!leftRaw || !rightRaw) continue;
          const left = unwrapSingleChild(leftRaw);
          const right = unwrapSingleChild(rightRaw);
          const field = selfFieldNameOf(left, selfNames, owner.fields);
          if (!field) continue;
          if (right.type.endsWith("identifier") && params.has(right.text)) {
            injects.push({ field, member: memberName, isConstructor, line: a.startPosition.row + 1 });
          }
        }

        if (!isConstructor) {
          const ifLike = new Set<string>();
          for (const t of unitFile.sets.chainNodes) if (unitFile.sets.nestingNodes.has(t) && !unitFile.sets.switchContainerNodes.has(t)) ifLike.add(t);
          const gs: AstNode[] = [];
          findAllDescendants(body, (n) => ifLike.has(n.type), 12, gs);
          for (const guard of gs) {
            const cond = guard.childForFieldName("condition") as AstNode | null;
            if (!cond) continue;
            // átomos, como el detector
            const stripNegation = (n0: AstNode): AstNode => {
              let cur = unwrapSingleChild(n0);
              for (let i = 0; i < 4; i++) {
                const kids = namedChildren(cur);
                if (kids.length !== 1) break;
                const op = (cur.childForFieldName("operator") as AstNode | null)?.text ?? null;
                if ((op && /^(!|not|~)$/.test(op)) || /^(not_operator|unary_expression|unary_operator)$/.test(cur.type)) {
                  cur = unwrapSingleChild(kids[0]!);
                  continue;
                }
                break;
              }
              return cur;
            };
            const atomsOf = (n0: AstNode, depth = 6): AstNode[] => {
              const cur = stripNegation(n0);
              if (depth <= 0) return [cur];
              const op = (cur.childForFieldName("operator") as AstNode | null)?.text ?? null;
              if (op && /^(&&|\|\||and|or)$/.test(op)) {
                const l = cur.childForFieldName("left") as AstNode | null;
                const r = cur.childForFieldName("right") as AstNode | null;
                if (l && r) return [...atomsOf(l, depth - 1), ...atomsOf(r, depth - 1)];
              }
              return [cur];
            };
            const atoms = atomsOf(cond);
            const fields: string[] = [];
            let pure = atoms.length > 0;
            for (const atom of atoms) {
              const f = selfFieldNameOf(atom, selfNames, visibleFields);
              if (!f) {
                pure = false;
                break;
              }
              fields.push(f);
            }
            if (!pure) continue;
            const consequence = (guard.childForFieldName("consequence") as AstNode | null) ?? (guard.childForFieldName("body") as AstNode | null);
            const alt = guard.childForFieldName("alternative") as AstNode | null;
            const stmts = consequence ? namedChildren(consequence) : [];
            const onlyReturnLike = stmts.length > 0 && stmts.every((s) => RETURN_LIKE.test(s.type));
            const hasSelfAssign =
              consequence !== null &&
              findDescendant(consequence, (n) => {
                if (!isAssignmentLike(n)) return false;
                const l = n.childForFieldName("left") as AstNode | null;
                if (!l) return false;
                return selfFieldNameOf(unwrapSingleChild(l), selfNames, owner!.fields) !== null;
              }, 5) !== null;
            const altStmts = alt ? namedChildren(alt) : [];
            guardCondSpans.push({ a: cond.startPosition.row, b: cond.endPosition.row, ac: cond.startPosition.column, bc: cond.endPosition.column });
            for (const f of fields) {
              guards.push({
                field: f,
                member: memberName,
                line: guard.startPosition.row + 1,
                hasAlternative: alt !== null,
                alternativeStatements: altStmts.length,
                alternativeOnlyReturnLike: altStmts.length > 0 && altStmts.every((s) => RETURN_LIKE.test(s.type)),
                consequenceStatements: stmts.length,
                consequenceOnlyReturnLike: onlyReturnLike,
                consequenceHasAssignToSelf: hasSelfAssign,
                consequenceText: (consequence?.text ?? "").slice(0, 200).replace(/\s+/g, " "),
              });
            }
          }
        }
      }
    }
    for (const c of namedChildren(node)) visit(c, nextCls);
  };
  visit(unitFile.root, null);

  // TERCERA PASADA — lecturas del campo FUERA de toda condición de guarda contada.
  if (targetClassNode && target) {
    const capFields = new Set(target.capabilities.map((c) => c.field));
    const inGuardCond = (n: AstNode): boolean =>
      guardCondSpans.some(
        (s) =>
          (n.startPosition.row > s.a || (n.startPosition.row === s.a && n.startPosition.column >= s.ac)) &&
          (n.endPosition.row < s.b || (n.endPosition.row === s.b && n.endPosition.column <= s.bc)),
      );
    const assignLefts = new Set<AstNode>();
    const allAssigns: AstNode[] = [];
    findAllDescendants(targetClassNode, isAssignmentLike, 40, allAssigns);
    for (const a of allAssigns) {
      const l = a.childForFieldName("left") as AstNode | null;
      if (l) {
        assignLefts.add(l);
        assignLefts.add(unwrapSingleChild(l));
      }
    }
    const walk = (n: AstNode, member: string): void => {
      const memberName = unitFile.sets.functionNodes.has(n.type) ? ((n.childForFieldName("name") as AstNode | null)?.text ?? member) : member;
      const f = selfFieldNameOf(n, SELF_WORDS, targetFields);
      if (f && capFields.has(f) && !assignLefts.has(n) && !inGuardCond(n)) {
        reads.push({ field: f, member: memberName, line: n.startPosition.row + 1, text: n.text.slice(0, 60) });
      }
      for (const c of namedChildren(n)) walk(c, memberName);
    };
    walk(targetClassNode, "(clase)");

    // VARIANTE D2': "fuera de la condición de CUALQUIER guarda if-like",
    // excluyendo el constructor y la declaración del campo — que es la forma
    // que se puede implementar en `decorator.ts` sin re-derivar las guardas
    // contadas del detector.
    const ifLike2 = new Set<string>();
    for (const t of unitFile.sets.chainNodes) if (unitFile.sets.nestingNodes.has(t) && !unitFile.sets.switchContainerNodes.has(t)) ifLike2.add(t);
    const spanKey = (n: AstNode): string => `${n.startPosition.row}:${n.startPosition.column}:${n.endPosition.row}:${n.endPosition.column}:${n.type}`;
    const walk2 = (n: AstNode, member: string, inCond: boolean, visible: ReadonlySet<string>, isWriteTarget: boolean): void => {
      let memberName = member;
      let vis = visible;
      if (unitFile.sets.functionNodes.has(n.type)) {
        memberName = (n.childForFieldName("name") as AstNode | null)?.text ?? member;
        const params = parameterNamesOf(n);
        vis = new Set([...targetFields].filter((x) => !params.has(x)));
      }
      if (FIELD_DECL_NODE_TYPE.test(n.type)) return; // la declaración del campo no es una lectura
      const f = selfFieldNameOf(n, SELF_WORDS, vis);
      if (f && capFields.has(f) && !isWriteTarget && !inCond) {
        (readsD2 as Read[]).push({ field: f, member: memberName, line: n.startPosition.row + 1, text: n.text.slice(0, 60) });
      }
      const condKey = ifLike2.has(n.type) ? ((n.childForFieldName("condition") as AstNode | null) ? spanKey(n.childForFieldName("condition") as AstNode) : null) : null;
      const leftKey = /assign/i.test(n.type) && isAssignmentLike(n) ? ((n.childForFieldName("left") as AstNode | null) ? spanKey(n.childForFieldName("left") as AstNode) : null) : null;
      for (const c of namedChildren(n)) {
        const k = spanKey(c);
        walk2(c, memberName, inCond || (condKey !== null && k === condKey), vis, isWriteTarget || (leftKey !== null && k === leftKey));
      }
    };
    walk2(targetClassNode, "(clase)", false, targetFields, false);
  }

  out.push({
    ...row,
    language: unitFile.language,
    classInfo,
    detector: target
      ? {
          name: target.name,
          memberCount: target.memberCount,
          embellishedMembers: target.embellishedMembers,
          capabilities: target.capabilities.map((c) => ({ field: c.field, members: c.members, sites: c.sites })),
        }
      : null,
    injects,
    guards,
    reads,
    readsD2,
  });
  live.release();
  console.log(`${row.repo}/${row.unit}: caps=${target ? target.capabilities.length : "NULL"} injects=${injects.length} guards=${guards.length}`);
}

writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`escrito ${outPath}`);
