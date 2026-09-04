/**
 * `optional-behavior-flags` — Ola AD, frente AD3.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LA FUERZA, NO LA ESTRUCTURA
 * ────────────────────────────────────────────────────────────────────────
 *
 * La situación que **Decorator** resuelve, escrita como la enuncia su fuente
 * (refactoring.guru, "Aplicabilidad": *"cuando necesites asignar
 * responsabilidades extra a objetos en tiempo de ejecución sin romper el
 * código que los usa"*; GoF, *Design Patterns*, Decorator/Applicability:
 * *"when extension by subclassing is impractical … a large number of
 * independent extensions produces an explosion of subclasses"*):
 *
 * > **hay que poder agregar comportamiento a un objeto sin tocar su clase y
 * > sin que quien lo usa se entere.**
 *
 * Este detector busca el código donde pasa exactamente lo CONTRARIO, que es
 * donde el patrón haría falta:
 *
 *   quien construye el objeto **elige** capacidades opcionales pasándolas
 *   como argumento, la unidad-tipo las **guarda** en campos propios, y sus
 *   operaciones las **consultan** una por una. Agregar una capacidad más
 *   obliga a tocar la clase; usarla obliga a que quien la usa se entere.
 *
 * *** POR QUÉ NO ES `homonymous-delegation`, y por qué este archivo existe ***
 * El ancla vieja de Decorator (`homonymous-delegation`) mira el REENVÍO YA
 * ESCRITO — es decir, la ESTRUCTURA que el patrón produce, no la fuerza que
 * el patrón resuelve. Medido por el frente AC4 de la ola anterior y
 * confirmado por el integrador leyendo el código: `REQUIRED_DELEGATION_PRESENT`
 * exige que el reenvío exista para que la hipótesis nazca, así que **el
 * estado `ausente` es inalcanzable por construcción para esa ancla — 0 de 111
 * hipótesis, en las dos poblaciones**. Un ancla que sólo puede confirmar
 * dónde el patrón YA ESTÁ es lo contrario del objetivo del proyecto. Este
 * detector NO la reemplaza ni la apaga: **agrega el camino que faltaba**, y
 * es el que puede decir `ausente`.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LAS CUATRO CONDICIONES, Y LA INTENCIÓN QUE VERIFICA CADA UNA
 * ────────────────────────────────────────────────────────────────────────
 *
 * (1) **LA CAPACIDAD LA ELIGE QUIEN CONSTRUYE.** El campo propio tiene, en
 *     algún miembro de la misma unidad-tipo, una asignación cuyo lado
 *     derecho es un PARÁMETRO de ese mismo miembro (`this.x = x`, `@x = x`,
 *     `self.x = x`, `c.x = x`).
 *     INTENCIÓN: *"el valor viene de AFUERA: es una elección de quien usa el
 *     objeto, no estado interno del objeto"*. Sin esto, `if (this.closed)`
 *     —estado de vida del objeto— contaría igual, y ése es el terreno de
 *     `temporary-field`/State, no de Decorator. Medido: sin esta condición la
 *     población pasa de 24 a 240 unidades en las dos poblaciones, y lo que
 *     entra son chequeos de "¿ya está seteado?" sobre colaboradores internos.
 *
 * (2) **LA CONSULTA ES UNA GUARDA DE PRESENCIA, NO UNA COMPARACIÓN.** La
 *     condición de la guarda, descompuesta en los ÁTOMOS de su árbol de
 *     `and`/`or` y quitada la negación, tiene que estar hecha ÚNICAMENTE de
 *     lecturas de campos propios: ni una llamada, ni una comparación, ni un
 *     literal.
 *     INTENCIÓN: *"una capacidad opcional está o no está"*. Una comparación
 *     contra un valor (`if (this.mode == "x")`) no es una capa opcional: es
 *     un DISCRIMINANTE con alternativas, y eso es State/Strategy
 *     (`enumerated-field-dispatch`, `conditional-chain`), no Decorator.
 *     Lo ambiguo —una condición con una llamada adentro, cuyo valor de verdad
 *     este análisis no puede leer— **viaja como ambiguo: no se cuenta**.
 *
 * (3) **LA CAPACIDAD EMBELLECE OPERACIONES, NO LA CONSTRUCCIÓN.** Las guardas
 *     se cuentan sólo en miembros que NO son el constructor, y la unidad
 *     tiene que tener ≥2 miembros DISTINTOS embellecidos entre todas sus
 *     capacidades.
 *     INTENCIÓN: *"la capacidad está tejida en el comportamiento"*. Un `if`
 *     sobre la bandera dentro del constructor es configuración, no
 *     embellecimiento: no hay nada que envolver. Y una bandera consultada en
 *     UNA sola operación es un condicional local — la respuesta barata ahí es
 *     *Extract Method*, no una jerarquía de envoltorios.
 *
 * (4) **HAY MÁS DE UNA CAPACIDAD.** ≥2 campos distintos que cumplen (1)–(3)
 *     en la misma unidad-tipo.
 *     INTENCIÓN: **ESCALA** — la condición que la Ola AC midió como la que
 *     falta (AC2: de sus 7 casos con la fuerza correcta, 6 eran demasiado
 *     chicos para que el patrón pagara). GoF pide Decorator cuando hay *varias
 *     extensiones independientes*, porque la alternativa —una subclase por
 *     combinación— explota: con DOS capacidades independientes ya hay CUATRO
 *     combinaciones. Con una sola, la respuesta más barata es una subclase o
 *     un método extraído, y el patrón no paga.
 *
 * *** LA RESOLUCIÓN NO LA DECIDE ESTE DETECTOR *** — condición (5) de la
 * receta de la Ola AC ("resolución verificada"): que la envoltura esté
 * AUSENTE, PARCIAL o YA APLICADA lo decide `hypotheses/decorator.ts#appliedState`,
 * reusando la MISMA función (`classDelegationLevel`/`goDelegationLevel`) que
 * el ancla vieja usa. El detector nombra la fuerza; la escalera de estado
 * nombra la resolución. Consecuencia medible y buscada: **por este camino
 * `ausente` SÍ es alcanzable** (medido antes de implementar: 18 de las 24
 * unidades que este detector encuentra no reenvían homónimamente a ningún
 * colaborador propio).
 *
 * ────────────────────────────────────────────────────────────────────────
 * GENERICIDAD
 * ────────────────────────────────────────────────────────────────────────
 *
 * Cero léxico de dominio: ninguna lista de nombres de campo, de clase ni de
 * método. Las listas de texto son **vocabulario de gramática**, aplicado
 * idénticamente a los 9 lenguajes: `SELF_WORDS` (`this`/`self`, la misma de
 * `temporary-field.ts`/`lazy-init-repetida.ts`), `LOGICAL_OP` (los deletreos
 * de `and`/`or`), `NEGATION_TEXT` y `CONSTRUCTOR_NAMES`, importada de
 * `code-grammar.ts` en vez de re-escrita. El conjunto de nodos "if-like" NO
 * se escribe: se DERIVA de los conjuntos que `code-grammar.ts` ya publica
 * (`chainNodes ∩ nestingNodes − switchContainerNodes`), así que ningún
 * lenguaje nuevo necesita una línea acá.
 *
 * DUPLICACIÓN DECLARADA: `namedChildren`, `findAllDescendants`,
 * `findDescendant`, `unwrapSingleChild`, `objectOf`, `memberNameOf`,
 * `selfFieldNameOf`, `goReceiverOf`, `declaredFieldNames`, `parameterNamesOf`
 * y `isAssignmentLike` son la misma copia adaptada que `temporary-field.ts`
 * ya declara frente a `lazy-init-repetida.ts` y `hypotheses/proxy.ts` —
 * `detect/*` no puede importar de `hypotheses/*` (capas invertidas) y no
 * existe un módulo de primitivas compartido entre detectores. Se copia y se
 * dice, igual que esos archivos.
 *
 * PATRÓN AL QUE ALIMENTA: **Decorator** (`hypotheses/decorator.ts`), que
 * importa `capabilityUnitsOf` de este módulo para RE-VERIFICAR la forma
 * contra el árbol vivo de su propia corrida (mismo criterio de "no confiar
 * ciegamente en el detector" que `REQUIRED_WRAPPING_STRUCTURE` y
 * `REQUIRED_DELEGATION_PRESENT` ya aplican). Es el mismo sentido de importación
 * que `hypotheses/composite.ts` ya usa contra
 * `detect/intra-file/self-referential-member.ts`.
 */
import { CONSTRUCTOR_NAMES, type DerivedNodeSets } from "../../code-grammar.js";
import { pisoDeclarado } from "../thresholds.js";
import type { AstNode, FileUnit, IntraFileDetector, RawFinding, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "capacidadesOpcionales" | "miembrosEmbellecidos";

export const OPTIONAL_BEHAVIOR_FLAGS_KIND = "optional-behavior-flags";

/** Condición (4): dos capacidades independientes ya son cuatro combinaciones. */
export const MIN_CAPABILITIES = 2;
/** Condición (3): la capacidad tiene que embellecer más de una operación. */
export const MIN_EMBELLISHED_MEMBERS = 2;

/** Mismo vocabulario que `temporary-field.ts#SELF_WORDS`. */
const SELF_WORDS = new Set(["this", "self"]);
/** Ruby: `@x` es un único token con sigilo, sin receptor explícito. */
const RUBY_IVAR_TYPE = "instance_variable";
const OBJECT_FIELDS = ["object", "operand"];
const COMMENT_NODE_TYPE = /comment/i;
const FIELD_DECL_NODE_TYPE = /(^|_)(field|property)_(declaration|definition)$/;
/** Los deletreos de la conjunción/disyunción en las 9 gramáticas. */
const LOGICAL_OP = /^(&&|\|\||and|or)$/;
/** Los deletreos de la negación unaria. */
const NEGATION_TEXT = /^(!|not|~)$/;
/** Envoltorios unarios que algunas gramáticas nombran en vez de dar `operator`. */
const UNARY_WRAPPER_TYPE = /^(not_operator|unary_expression|unary_operator)$/;

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

/**
 * ¿`node` nombra un campo del propio objeto? Tres vías, ninguna léxica —
 * idéntica a `temporary-field.ts#selfFieldNameOf`.
 */
function selfFieldNameOf(node: AstNode, selfNames: ReadonlySet<string>, declaredFields: ReadonlySet<string>): string | null {
  if (node.type === RUBY_IVAR_TYPE) return node.text;
  const obj = objectOf(node);
  if (obj && selfNames.has(obj.text)) return memberNameOf(node);
  if (node.type === "identifier" && declaredFields.has(node.text)) return node.text;
  return null;
}

/** Único vehículo de Go para "campo propio"/"unidad-tipo dueña". */
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

/**
 * Los tipos de nodo "if-like", DERIVADOS de los conjuntos que
 * `code-grammar.ts` ya publica y nunca escritos a mano:
 * `chainNodes` = ifLike ∪ switchContainers ∪ switchArms y
 * `nestingNodes` = ifLike ∪ loopLike ∪ exceptionLike ∪ switchContainers, así
 * que su intersección menos `switchContainerNodes` es exactamente ifLike.
 * Un lenguaje nuevo no necesita una línea acá.
 */
function ifLikeTypes(sets: DerivedNodeSets): Set<string> {
  const out = new Set<string>();
  for (const t of sets.chainNodes) if (sets.nestingNodes.has(t) && !sets.switchContainerNodes.has(t)) out.add(t);
  return out;
}

/** Quita la negación unaria y los envoltorios de un solo hijo. */
function stripNegation(node: AstNode): AstNode {
  let cur = unwrapSingleChild(node);
  for (let i = 0; i < 4; i++) {
    const kids = namedChildren(cur);
    if (kids.length !== 1) break;
    const op = (cur.childForFieldName("operator") as AstNode | null)?.text ?? null;
    if ((op && NEGATION_TEXT.test(op)) || UNARY_WRAPPER_TYPE.test(cur.type)) {
      cur = unwrapSingleChild(kids[0]!);
      continue;
    }
    break;
  }
  return cur;
}

/**
 * Condición (2), primera mitad: las HOJAS del árbol de `and`/`or` de la
 * condición. Cualquier otra cosa (una comparación, una llamada, un literal)
 * queda como un átomo que la segunda mitad rechaza.
 */
function conditionAtoms(node: AstNode, depth = 6): AstNode[] {
  const cur = stripNegation(node);
  if (depth <= 0) return [cur];
  const op = (cur.childForFieldName("operator") as AstNode | null)?.text ?? null;
  if (op && LOGICAL_OP.test(op)) {
    const l = cur.childForFieldName("left") as AstNode | null;
    const r = cur.childForFieldName("right") as AstNode | null;
    if (l && r) return [...conditionAtoms(l, depth - 1), ...conditionAtoms(r, depth - 1)];
  }
  return [cur];
}

/** Una consulta de la capacidad dentro de un miembro. */
export interface CapabilitySite {
  member: string;
  startLine: number;
  endLine: number;
}

/** Una capacidad opcional: el campo, y dónde la consultan. */
export interface OptionalCapability {
  field: string;
  /** Miembros DISTINTOS, sin el constructor, que consultan la capacidad. */
  members: readonly string[];
  sites: readonly CapabilitySite[];
}

/** Una unidad-tipo con capacidades opcionales atadas a su código. */
export interface CapabilityUnit {
  name: string;
  startLine: number;
  endLine: number;
  memberCount: number;
  capabilities: readonly OptionalCapability[];
  /** Miembros DISTINTOS embellecidos por alguna capacidad. */
  embellishedMembers: readonly string[];
}

interface UnitAcc {
  name: string;
  startLine: number;
  endLine: number;
  members: Set<string>;
  injected: Set<string>;
  sites: Map<string, CapabilitySite[]>;
}

/**
 * EL NÚCLEO, exportado para que `hypotheses/decorator.ts` re-verifique la
 * forma contra el árbol vivo de SU corrida en vez de creerle al detector.
 * Devuelve TODAS las unidades con al menos una capacidad que cumple (1)–(3);
 * los pisos (4) y el de miembros embellecidos los aplica cada llamador con su
 * propio umbral resuelto.
 */
export function capabilityUnitsOf(root: AstNode, sets: DerivedNodeSets, constructorNodeTypes: ReadonlySet<string>): readonly CapabilityUnit[] {
  const ifLike = ifLikeTypes(sets);
  const units = new Map<string, UnitAcc>();

  const accFor = (key: string, name: string, node: AstNode): UnitAcc => {
    const existing = units.get(key);
    if (existing) {
      existing.startLine = Math.min(existing.startLine, node.startPosition.row + 1);
      existing.endLine = Math.max(existing.endLine, node.endPosition.row + 1);
      return existing;
    }
    const created: UnitAcc = {
      name,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      members: new Set<string>(),
      injected: new Set<string>(),
      sites: new Map<string, CapabilitySite[]>(),
    };
    units.set(key, created);
    return created;
  };

  const visit = (node: AstNode, cls: { name: string; key: string; node: AstNode; fields: ReadonlySet<string> } | null): void => {
    let nextCls = cls;
    if (sets.classNodes.has(node.type)) {
      const name = (node.childForFieldName("name") as AstNode | null)?.text ?? `(anónima)@${node.startPosition.row}`;
      nextCls = { name, key: `${name}@${node.startPosition.row}`, node, fields: declaredFieldNames(node) };
    } else if (sets.functionNodes.has(node.type)) {
      const goRecv = goReceiverOf(node);
      const selfNames = new Set(SELF_WORDS);
      let owner = nextCls;
      if (goRecv) {
        selfNames.add(goRecv.paramName);
        owner = { name: goRecv.typeName, key: `receiver:${goRecv.typeName}`, node, fields: new Set<string>() };
      }
      const body = (node.childForFieldName("body") as AstNode | null) ?? (node.childForFieldName("consequence") as AstNode | null);
      const memberName = (node.childForFieldName("name") as AstNode | null)?.text ?? "(anónima)";
      if (body && owner) {
        const acc = accFor(owner.key, owner.name, owner.node);
        acc.members.add(memberName);
        const isConstructor = constructorNodeTypes.has(node.type) || CONSTRUCTOR_NAMES.has(memberName);
        const params = parameterNamesOf(node);
        // Sombreado: un parámetro con el mismo nombre que un campo lo tapa en
        // ESTE miembro (misma regla que `temporary-field.ts`).
        const visibleFields = new Set([...owner.fields].filter((f) => !params.has(f)));

        // (1) LA CAPACIDAD LA ELIGE QUIEN CONSTRUYE.
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
          if (right.type.endsWith("identifier") && params.has(right.text)) acc.injected.add(field);
        }

        // (2) + (3) LA CONSULTA ES UNA GUARDA DE PRESENCIA, FUERA DEL CONSTRUCTOR.
        if (!isConstructor) {
          const guards: AstNode[] = [];
          findAllDescendants(body, (n) => ifLike.has(n.type), 12, guards);
          for (const guard of guards) {
            const cond = guard.childForFieldName("condition") as AstNode | null;
            if (!cond) continue;
            const atoms = conditionAtoms(cond);
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
            for (const f of fields) {
              const list = acc.sites.get(f) ?? [];
              list.push({ member: memberName, startLine: guard.startPosition.row + 1, endLine: guard.endPosition.row + 1 });
              acc.sites.set(f, list);
            }
          }
        }
      }
    }
    for (const c of namedChildren(node)) visit(c, nextCls);
  };
  visit(root, null);

  const out: CapabilityUnit[] = [];
  for (const acc of units.values()) {
    const capabilities: OptionalCapability[] = [];
    for (const [field, sites] of acc.sites) {
      if (!acc.injected.has(field)) continue;
      const members = [...new Set(sites.map((s) => s.member))];
      capabilities.push({ field, members, sites });
    }
    if (capabilities.length === 0) continue;
    capabilities.sort((a, b) => (a.sites[0]?.startLine ?? 0) - (b.sites[0]?.startLine ?? 0) || a.field.localeCompare(b.field));
    const embellished = [...new Set(capabilities.flatMap((c) => c.members))];
    out.push({
      name: acc.name,
      startLine: acc.startLine,
      endLine: acc.endLine,
      memberCount: acc.members.size,
      capabilities,
      embellishedMembers: embellished,
    });
  }
  return out;
}

export function computeOptionalBehaviorFlagFindings(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
  const minCapabilities = ctx.threshold("capacidadesOpcionales");
  const minMembers = ctx.threshold("miembrosEmbellecidos");
  const findings: RawFinding[] = [];

  for (const unit of capabilityUnitsOf(file.root, file.sets, file.sets.constructorNodes)) {
    if (unit.capabilities.length < minCapabilities.value) continue;
    if (unit.embellishedMembers.length < minMembers.value) continue;

    const head: RoleLocation = {
      file: file.path,
      startLine: unit.startLine,
      endLine: unit.endLine,
      symbol: unit.name,
      anchor: { file: file.path, symbolPath: [unit.name] },
      role: `unidad-tipo con ${unit.capabilities.length} capacidades opcionales atadas a su código`,
    };
    const rest: RoleLocation[] = unit.capabilities.map((c, i) => {
      const first = c.sites[0]!;
      return {
        file: file.path,
        startLine: first.startLine,
        endLine: first.endLine,
        symbol: first.member,
        anchor: { file: file.path, symbolPath: [unit.name, first.member], ordinal: i },
        role: `capacidad opcional \`${c.field}\` — consultada en ${c.members.length} miembro(s): ${c.members.join(", ")}`,
      };
    });

    findings.push({
      title: `"${unit.name}" lleva ${unit.capabilities.length} capacidades opcionales adentro`,
      detail:
        `Quien construye \`${unit.name}\` elige ${unit.capabilities.length} capacidades opcionales ` +
        `(${unit.capabilities.map((c) => `\`${c.field}\``).join(", ")}) pasándolas como argumento; la unidad las guarda en campos propios y ` +
        `${unit.embellishedMembers.length} de sus ${unit.memberCount} miembros las consultan como guarda para decidir si hacen el paso extra. ` +
        "Agregar una capacidad más obliga a tocar esta unidad, y quien la usa tiene que enterarse: no hay forma de sumar comportamiento desde afuera. " +
        `Con ${unit.capabilities.length} capacidades independientes hay ${2 ** unit.capabilities.length} combinaciones posibles del comportamiento, todas resueltas acá adentro con condicionales.`,
      trigger: [
        { label: "capacidades opcionales elegidas desde afuera", value: unit.capabilities.length, threshold: minCapabilities },
        { label: "miembros embellecidos por alguna capacidad", value: unit.embellishedMembers.length, threshold: minMembers },
      ],
      evidence: [
        { label: "miembros de la unidad", value: unit.memberCount },
        {
          label: "consultas de capacidad fuera del constructor",
          value: unit.capabilities.reduce((n, c) => n + c.sites.length, 0),
          note: unit.capabilities.map((c) => `${c.field}: ${c.members.join(", ")}`).join(" · "),
        },
      ],
      locations: [head, ...rest],
      severity: Math.min(100, 35 + unit.capabilities.length * 8 + unit.embellishedMembers.length * 3),
      advice: {
        primary: {
          name: "Replace Conditional with Polymorphism",
          kind: "refactorizacion",
          why: "Cada bandera opcional es un comportamiento que hoy sólo se puede elegir desde adentro de la unidad; sacarlo a un objeto propio deja la unidad con una sola responsabilidad.",
          source: "https://refactoring.guru/es/replace-conditional-with-polymorphism",
        },
        pattern: {
          name: "Decorator",
          kind: "patron_de_diseno",
          why: "Decorator existe para agregar responsabilidades a un objeto en tiempo de ejecución sin tocar su clase y sin que quien lo usa se entere: cada capacidad opcional pasa a ser un envoltorio que se compone o no se compone, en vez de una bandera que todas las operaciones consultan.",
          source: "https://refactoring.guru/es/design-patterns/decorator",
          caveat:
            "Sólo paga si las capacidades son de verdad INDEPENDIENTES y combinables. Si las combinaciones reales son dos o tres fijas, un objeto por combinación es más simple; y si las banderas son los pasos de una única fórmula, no son capas ortogonales.",
          cost: "Una clase envoltorio por capacidad, más la composición en el punto de creación: más indirección que un campo booleano, y se paga cuando el número de combinaciones reales crece.",
        },
      },
    });
  }
  return findings;
}

export const detector: IntraFileDetector<ThresholdKey, "optional-behavior-flags"> = {
  id: "optional-behavior-flags",
  kind: "optional-behavior-flags",
  scope: "intra-file",
  title: "Capacidades opcionales atadas a la unidad",
  // SIN `needs: ["unidad-tipo-clase"]`, misma razón exacta que
  // `temporary-field.ts`/`lazy-init-repetida.ts` documentan: la forma "dueño
  // de campos con miembros" se reconoce por DOS vías independientes — la
  // gramática (`classNodes`) y el receptor de método de Go — y Go no declara
  // esa capacidad pese a tener la forma. Declararla dejaría a Go en silencio
  // por una razón falsa.
  needs: [],
  thresholds: {
    capacidadesOpcionales: pisoDeclarado(MIN_CAPABILITIES, {
      rationale:
        "GoF, Design Patterns, Decorator/Applicability: el patrón se justifica cuando hay VARIAS extensiones independientes, porque la alternativa —una subclase por combinación— explota. Con DOS capacidades independientes ya hay cuatro combinaciones posibles; con UNA sola, la respuesta más barata es una subclase o un método extraído y el patrón no paga. Es la condición de ESCALA que la Ola AC midió como la que faltaba (AC2: 6 de sus 7 casos con la fuerza correcta eran demasiado chicos).",
    }),
    miembrosEmbellecidos: pisoDeclarado(MIN_EMBELLISHED_MEMBERS, {
      rationale:
        "Una bandera consultada en UNA sola operación es un condicional local, y su mitigación barata es Extract Method, no una jerarquía de envoltorios. Recién cuando el embellecimiento atraviesa DOS operaciones distintas de la misma unidad se vuelve cierto que la capacidad está tejida en el comportamiento y que no hay forma de agregarla desde afuera.",
    }),
  },
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    return computeOptionalBehaviorFlagFindings(file, ctx);
  },
};
