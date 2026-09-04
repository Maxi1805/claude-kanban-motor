/**
 * R7 (Ola R, frente de SOLO MEDICIÓN) — sonda de campos de clase y cuánto de
 * su tipo/origen ya se puede leer de la sintaxis, SIN inferir por conjunto de
 * miembros (regla no negociable de la ola: ver ola-r/CONTEXTO.md §2).
 *
 * NO es una implementación de `declara-tipo` (eso es R1/R2). Es una MEDICIÓN
 * independiente, hecha desde cero, para responder con un número reproducible
 * qué tanto le serviría a las hipótesis de patrón (Chain of Responsibility,
 * Decorator, Composite, State) que un campo tuviera tipo conocido.
 *
 * MÉTODO — dos pasadas por repo, AMBAS puramente sintácticas:
 *
 *  PASADA 1 (por archivo, vía `resolveLiveFileUnit` — la misma mitad de
 *  `analyzeFile` que ya usan `n8-medir-feature-envy-intra.mts`/
 *  `measure-proxy-real-guards.mts`): para cada nodo class-like
 *  (`sets.classNodes`), enumera el conjunto de CAMPOS DISTINTOS por DOS
 *  vías, y para cada uno guarda:
 *    (a) el TEXTO CRUDO de la anotación de tipo, si la gramática la expone
 *        en el sitio de declaración (Java/C#: `field_declaration`/
 *        `property_declaration`; TS/JS: `public_field_definition`/
 *        `field_definition`; Go: `field_declaration` dentro de
 *        `struct_type.field_declaration_list`; Python: el campo `type` de
 *        un nodo `assignment`, PEP 526).
 *    (b) por cada SITIO DE ASIGNACIÓN encontrado (declaración directa en el
 *        cuerpo de la clase, o escritura `self.x=`/`this.x=`/`@x=` dentro de
 *        un método DIRECTO de esa clase — nunca dentro de una clase anidada),
 *        una clasificación estructural del LADO DERECHO: "clase-repo" si el
 *        callee de una construcción (`new X(...)`/`X(...)`/`X.new(...)`,
 *        según el idioma de cada gramática) coincide con el nombre de un
 *        `class-like` declarado en ALGÚN archivo de este mismo repo;
 *        "primitivo" si el lado derecho es un literal (lista/hash/string/
 *        número/booleano/nil) o la construcción de un builtin conocido del
 *        lenguaje; "no-se" en cualquier otro caso (llamada no resuelta,
 *        identificador suelto — un parámetro/variable pasado tal cual, la
 *        vía que la ola decidió NO seguir).
 *
 *  ENTRE PASADAS: se arma, por repo, el índice de nombres `class-like`
 *  declarados en CUALQUIER archivo (no sólo el mismo archivo — a diferencia
 *  de `graph/edges/instanciacion.ts`, que restringe Python al MISMO archivo
 *  porque ahí la ambigüedad con una llamada común importa; acá el texto ya
 *  viene filtrado por FORMA de construcción, así que ensanchar a "todo el
 *  repo" es una sobre-estimación DECLARADA — ver "SIMPLIFICACIONES" abajo).
 *
 *  PASADA 2 (pura, sin AST): con el índice ya completo, clasifica cada
 *  campo:
 *    - `tipoEscrito`: "sin-tipo-escrito" (sin anotación) | "clase-repo" |
 *      "primitivo" | "no-se" — el TEXTO de (a), pelado de genéricos/
 *      nullable/arrays y resuelto contra el índice + una lista de builtins
 *      por lenguaje.
 *    - `origenALaVista`: "sin-muestras" (declarado sin ningún sitio de
 *      asignación visto) | "clase-repo" | "primitivo" | "no-se" | "ambiguo"
 *      (≥2 sitios con clasificaciones CONCRETAS — clase-repo o primitivo —
 *      DISTINTAS: la regla MULTIVALUADA de la ola, nunca colapsa a un
 *      candidato).
 *    - `union`: el mejor de los dos ("clase-repo"/"primitivo" gana sobre
 *      "no-se"/"sin-*"; "ambiguo" sólo si NINGUNA vía dio una respuesta
 *      concreta única y alguna dio "ambiguo").
 *
 * SIMPLIFICACIONES DECLARADAS (no escondidas):
 *  - El índice de nombres `class-like` es REPO-WIDE, sin `imports`: una
 *    clase importada de OTRO paquete con el MISMO nombre simple que una
 *    clase local del repo puede leerse como "clase-repo" cuando en realidad
 *    es externa — sobre-cuenta el bucket "clase-repo" en ambas vías. Se
 *    reporta así, a propósito: es la MISMA dirección de error que tendría
 *    R1/R2 si resolviera por nombre calificado sin cruzar `imports`, así que
 *    el número sirve de COTA SUPERIOR realista, no de promesa de precisión.
 *  - No sigue el parámetro hasta sus sitios de llamada (medido en la
 *    conversación: +3 %, fuera de alcance de esta ola).
 *  - NUNCA infiere un tipo por qué miembros usa un campo — sólo mira lo que
 *    está ESCRITO (anotación) o CONSTRUIDO (llamada/literal) en el sitio de
 *    asignación. Cero coincidencia estructural, cero `deriveSatisfiesEdges`.
 *  - Java/C#/Go no necesitan `origenALaVista` (el tipo ya está escrito
 *    siempre que el campo se declare) — se calcula igual, mayormente
 *    "sin-muestras", y no se usa para el veredicto de esos tres lenguajes.
 *
 * Uso:
 *   npx tsx scripts/r7-campos-tipo.mts <dir> <slug> [salida.json]
 */
import { writeFileSync } from "node:fs";

import { collectFiles, resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import type { AstNode } from "../src/server/services/detect/types.js";

type OriginKind = "clase-repo" | "primitivo" | "no-se";
type OriginVerdict = "clase-repo" | "primitivo" | "no-se" | "ambiguo" | "sin-muestras";
type TypeVerdict = "clase-repo" | "primitivo" | "no-se" | "sin-tipo-escrito";

interface FieldRecord {
  language: string;
  file: string;
  className: string;
  fieldName: string;
  writtenTypeText: string | null;
  originSamples: OriginKind[];
}

const [, , dir, slug, outFile] = process.argv;
if (!dir || !slug) {
  console.error("uso: r7-campos-tipo.mts <dir> <slug> [salida.json]");
  process.exit(1);
}

const DIRECT_FIELD_NODE_TYPES: Record<string, readonly string[]> = {
  java: ["field_declaration"],
  csharp: ["field_declaration", "property_declaration"],
  typescript: ["public_field_definition"],
  tsx: ["public_field_definition"],
  vue: ["public_field_definition"],
  javascript: ["field_definition", "public_field_definition"],
};

const PRIMITIVE_BY_LANGUAGE: Record<string, RegExp> = {
  java: /^(boolean|byte|char|short|int|long|float|double|void|Object|String|Boolean|Byte|Character|Short|Integer|Long|Float|Double|Number|List|ArrayList|LinkedList|Map|HashMap|LinkedHashMap|TreeMap|Set|HashSet|LinkedHashSet|TreeSet|Collection|Optional|Iterable|Iterator|Comparator|Function|Supplier|Consumer|Predicate|BiFunction|Stream|Array|StringBuilder|StringBuffer)$/,
  csharp: /^(bool|byte|sbyte|char|short|ushort|int|uint|long|ulong|float|double|decimal|void|var|dynamic|object|Object|string|String|Boolean|Int32|Int64|Double|List|Dictionary|IList|IEnumerable|IDictionary|ISet|HashSet|Queue|Stack|Nullable|Action|Func|Predicate|StringBuilder)$/,
  typescript: /^(string|number|boolean|any|unknown|void|null|undefined|never|object|bigint|symbol|Array|ReadonlyArray|Map|WeakMap|Set|WeakSet|Promise|Record|Partial|Readonly|Required|Pick|Omit|Function|RegExp|Date|Error)$/,
  tsx: /^(string|number|boolean|any|unknown|void|null|undefined|never|object|bigint|symbol|Array|ReadonlyArray|Map|WeakMap|Set|WeakSet|Promise|Record|Partial|Readonly|Required|Pick|Omit|Function|RegExp|Date|Error)$/,
  vue: /^(string|number|boolean|any|unknown|void|null|undefined|never|object|bigint|symbol|Array|ReadonlyArray|Map|WeakMap|Set|WeakSet|Promise|Record|Partial|Readonly|Required|Pick|Omit|Function|RegExp|Date|Error|Ref|ComputedRef)$/,
  javascript: /^(Array|Map|WeakMap|Set|WeakSet|Promise|Function|RegExp|Date|Error|Object|Number|String|Boolean|Symbol)$/,
  go: /^(string|bool|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|uintptr|float32|float64|byte|rune|error|any|complex64|complex128)$/,
  python: /^(int|float|str|bool|bytes|list|dict|set|frozenset|tuple|None|object|Any|Optional|Union|Callable|Iterable|Iterator|Sequence|Mapping|Type|ClassVar|Final)$/,
  ruby: /^(Hash|Array|String|Integer|Float|Numeric|Object|NilClass|TrueClass|FalseClass|Proc|Regexp|Range|Time|Symbol|Rational|Complex)$/,
};

const TYPING_WRAPPERS = new Set(["ClassVar", "Final", "Optional"]);

const PRIMITIVE_RHS_NODE_TYPES: Record<string, ReadonlySet<string>> = {
  python: new Set(["list", "dictionary", "set", "tuple", "string", "integer", "float", "true", "false", "none"]),
  ruby: new Set(["array", "hash", "string", "integer", "float", "true", "false", "nil", "symbol"]),
  javascript: new Set(["array", "object", "string", "number", "true", "false", "null"]),
  typescript: new Set(["array", "object", "string", "number", "true", "false", "null"]),
  tsx: new Set(["array", "object", "string", "number", "true", "false", "null"]),
  vue: new Set(["array", "object", "string", "number", "true", "false", "null"]),
};

function stripLeadingColon(text: string): string {
  return text.replace(/^:\s*/, "").trim();
}

/**
 * Go escribe sus compuestos con PREFIJO (`*T`, `[]T`, `map[K]V`, `chan T`),
 * al revés que la familia C-like (`T[]`, `T?`, `T<...>`), que `baseTypeName`
 * ya pela por SUFIJO. Sin este paso, `map[string]*Foo`/`[]byte`/`chan int`
 * no reducían a un identificador limpio y caían — MAL — en
 * "sin-tipo-escrito" (que debe significar "sin anotación", nunca "anotación
 * presente pero compuesta"). Devuelve el texto del ELEMENTO (para seguir
 * pelando, p.ej. `[]*Foo` -> `*Foo` -> `Foo`) o `"__primitivo__"` cuando la
 * FORMA MISMA ya alcanza para saber "no es una clase con nombre propio"
 * (func/interface{}/any), sin necesitar resolver más.
 */
function stripGoPrefix(text: string): string {
  let t = text.trim();
  for (let i = 0; i < 5; i++) {
    const before = t;
    t = t.replace(/^\*+/, "").trim();
    t = t.replace(/^\[[^\]]*\]/, "").trim(); // slice `[]T` o array `[N]T`/`[...]T`
    const mapMatch = /^map\[[^\]]*\](.*)$/s.exec(t);
    if (mapMatch) t = mapMatch[1]!.trim();
    t = t.replace(/^(chan\s*(<-)?|<-\s*chan)\s*/, "").trim();
    if (t === before) break;
  }
  if (/^(func\s*\(|interface\s*\{)/.test(t)) return "__primitivo__";
  return t;
}

function baseTypeName(raw: string, language: string): string | null {
  let text = stripLeadingColon(raw);
  if (!text) return null;
  if (language === "python") {
    const m = /^([A-Za-z_][\w.]*)\s*\[(.+)\]$/.exec(text);
    if (m && TYPING_WRAPPERS.has(m[1]!.split(".").pop()!)) {
      text = m[2]!.split(",")[0]!.trim();
    }
  }
  if (language === "go") {
    text = stripGoPrefix(text);
    if (text === "__primitivo__") return "__primitivo__";
  }
  text = text.replace(/\?\s*$/, "");
  text = text.replace(/\s*\[\]\s*$/g, "");
  text = text.replace(/^\*+/, "");
  text = text.replace(/(?:<[\s\S]*>|\[[\s\S]*\])\s*$/, "");
  text = text.trim();
  if (!text) return null;
  const parts = text.split(/::|\./).map((p) => p.trim());
  const last = parts[parts.length - 1];
  if (!last || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(last)) return null;
  return last;
}

/**
 * `rawText === null` ⇒ NUNCA hubo anotación de tipo en el sitio de
 * declaración: "sin-tipo-escrito" genuino. `rawText !== null` pero
 * `baseTypeName` no pudo reducirlo a un identificador limpio (una forma
 * compuesta que el pelado no resuelve del todo) ⇒ "no-se" — HUBO tipo
 * escrito, sólo que esta sonda no lo entendió; nunca se confunde con la
 * ausencia. `"__primitivo__"` (ver `stripGoPrefix`) ⇒ la FORMA misma ya
 * alcanza para "primitivo", sin nombre que resolver.
 */
function classifyTypeName(rawText: string | null, language: string, repoClassNames: ReadonlySet<string>): TypeVerdict {
  if (rawText === null) return "sin-tipo-escrito";
  const name = baseTypeName(rawText, language);
  if (name === "__primitivo__") return "primitivo";
  if (name === null) return "no-se";
  if (repoClassNames.has(name)) return "clase-repo";
  const prim = PRIMITIVE_BY_LANGUAGE[language];
  if (prim && prim.test(name)) return "primitivo";
  return "no-se";
}

function constructedTypeName(rhs: AstNode, language: string): string | null {
  if (language === "typescript" || language === "tsx" || language === "vue" || language === "javascript") {
    if (rhs.type === "new_expression") {
      const ctor = rhs.childForFieldName("constructor") as AstNode | null;
      return ctor ? baseTypeName(ctor.text, language) : null;
    }
    return null;
  }
  if (language === "python") {
    if (rhs.type === "call") {
      const fn = rhs.childForFieldName("function") as AstNode | null;
      if (fn && fn.type === "identifier") return baseTypeName(fn.text, language);
      if (fn && fn.type === "attribute") {
        const attr = fn.childForFieldName("attribute") as AstNode | null;
        return attr ? baseTypeName(attr.text, language) : null;
      }
    }
    return null;
  }
  if (language === "ruby") {
    if (rhs.type === "call") {
      const method = rhs.childForFieldName("method") as AstNode | null;
      const receiver = rhs.childForFieldName("receiver") as AstNode | null;
      if (method && method.text === "new" && receiver) {
        if (receiver.type === "constant") return baseTypeName(receiver.text, language);
        if (receiver.type === "scope_resolution") {
          const name = receiver.childForFieldName("name") as AstNode | null;
          if (name && name.type === "constant") return baseTypeName(name.text, language);
        }
      }
    }
    return null;
  }
  return null;
}

const BUILTIN_CONSTRUCTOR_NAME: Record<string, RegExp> = {
  python: /^(dict|list|set|frozenset|tuple|str|int|float|bool|bytes|object|OrderedDict|defaultdict|Counter|deque)$/,
  ruby: /^(Hash|Array|String|Integer|Float|Object|Struct|OpenStruct|Set|Proc|Regexp|Range|Time)$/,
  typescript: /^(Map|WeakMap|Set|WeakSet|Array|Promise|RegExp|Date|Error|Object)$/,
  tsx: /^(Map|WeakMap|Set|WeakSet|Array|Promise|RegExp|Date|Error|Object)$/,
  vue: /^(Map|WeakMap|Set|WeakSet|Array|Promise|RegExp|Date|Error|Object)$/,
  javascript: /^(Map|WeakMap|Set|WeakSet|Array|Promise|RegExp|Date|Error|Object)$/,
};

function classifyRhs(rhs: AstNode | null, language: string, repoClassNames: ReadonlySet<string>): OriginKind | null {
  if (!rhs) return null;
  const primitiveSet = PRIMITIVE_RHS_NODE_TYPES[language];
  if (primitiveSet?.has(rhs.type)) return "primitivo";
  if ((language === "javascript" || language === "typescript" || language === "tsx" || language === "vue") && rhs.type === "identifier" && rhs.text === "undefined") {
    return "primitivo";
  }
  const built = constructedTypeName(rhs, language);
  if (built !== null) {
    if (repoClassNames.has(built)) return "clase-repo";
    const builtin = BUILTIN_CONSTRUCTOR_NAME[language];
    if (builtin && builtin.test(built)) return "primitivo";
    return "no-se";
  }
  return "no-se";
}

function fieldKey(file: string, className: string, fieldName: string): string {
  return `${file} ${className} ${fieldName}`;
}

function selfWriteTarget(node: AstNode, language: string): { fieldName: string; rhs: AstNode | null } | null {
  if (language === "python" && node.type === "assignment") {
    const left = node.childForFieldName("left") as AstNode | null;
    if (left && left.type === "attribute") {
      const obj = (left.childForFieldName("object") as AstNode | null)?.text;
      const attr = left.childForFieldName("attribute") as AstNode | null;
      if ((obj === "self" || obj === "cls") && attr) {
        return { fieldName: attr.text, rhs: node.childForFieldName("right") as AstNode | null };
      }
    }
    return null;
  }
  if (language === "ruby" && node.type === "assignment") {
    const left = node.childForFieldName("left") as AstNode | null;
    if (left && left.type === "instance_variable") {
      return { fieldName: left.text.replace(/^@/, ""), rhs: node.childForFieldName("right") as AstNode | null };
    }
    return null;
  }
  if ((language === "javascript" || language === "typescript" || language === "tsx" || language === "vue") && node.type === "assignment_expression") {
    const left = node.childForFieldName("left") as AstNode | null;
    if (left && left.type === "member_expression") {
      const obj = (left.childForFieldName("object") as AstNode | null)?.text;
      const prop = left.childForFieldName("property") as AstNode | null;
      if (obj === "this" && prop) {
        return { fieldName: prop.text, rhs: node.childForFieldName("right") as AstNode | null };
      }
    }
    return null;
  }
  return null;
}

function walkFile(
  root: AstNode,
  language: string,
  filePath: string,
  sets: { classNodes: ReadonlySet<string>; functionNodes: ReadonlySet<string> },
  localClassNames: Set<string>,
  fields: Map<string, FieldRecord>,
): void {
  function getOrCreate(className: string, fieldName: string, writtenTypeText: string | null): FieldRecord {
    const key = fieldKey(filePath, className, fieldName);
    let rec = fields.get(key);
    if (!rec) {
      rec = { language, file: filePath, className, fieldName, writtenTypeText, originSamples: [] };
      fields.set(key, rec);
    } else if (rec.writtenTypeText === null && writtenTypeText !== null) {
      rec.writtenTypeText = writtenTypeText;
    }
    return rec;
  }

  function directFieldsOf(classNode: AstNode, className: string): void {
    if (language === "go" && classNode.type === "type_spec") {
      const typeNode = classNode.childForFieldName("type") as AstNode | null;
      if (typeNode && typeNode.type === "struct_type") {
        for (let i = 0; i < typeNode.childCount; i++) {
          const child = typeNode.child(i) as AstNode | null;
          if (!child || child.type !== "field_declaration_list") continue;
          for (let j = 0; j < child.childCount; j++) {
            const fd = child.child(j) as AstNode | null;
            if (!fd || fd.type !== "field_declaration") continue;
            const typeText = (fd.childForFieldName("type") as AstNode | null)?.text ?? null;
            for (let k = 0; k < fd.childCount; k++) {
              const nameNode = fd.child(k) as AstNode | null;
              if (!nameNode || nameNode.type !== "field_identifier") continue;
              getOrCreate(className, nameNode.text, typeText);
            }
          }
        }
      }
      return;
    }

    const body = classNode.childForFieldName("body") as AstNode | null;
    if (!body) return;
    const directTypes = DIRECT_FIELD_NODE_TYPES[language];

    for (let i = 0; i < body.childCount; i++) {
      const stmt = body.child(i) as AstNode | null;
      if (!stmt || !stmt.isNamed) continue;
      const candidate = language === "python" && stmt.type === "expression_statement" ? (stmt.child(0) as AstNode | null) : stmt;
      if (!candidate) continue;

      if (language === "python") {
        if (candidate.type !== "assignment") continue;
        const left = candidate.childForFieldName("left") as AstNode | null;
        if (!left || left.type !== "identifier") continue;
        const typeNode = candidate.childForFieldName("type") as AstNode | null;
        const rhs = candidate.childForFieldName("right") as AstNode | null;
        const rec = getOrCreate(className, left.text, typeNode?.text ?? null);
        const cls = classifyRhs(rhs, language, localClassNames);
        if (cls) rec.originSamples.push(cls);
        continue;
      }

      if (!directTypes || !directTypes.includes(candidate.type)) continue;

      if (language === "csharp" && candidate.type === "property_declaration") {
        const nameNode = candidate.childForFieldName("name") as AstNode | null;
        const typeNode = candidate.childForFieldName("type") as AstNode | null;
        if (nameNode) getOrCreate(className, nameNode.text, typeNode?.text ?? null);
        continue;
      }
      if (language === "csharp" && candidate.type === "field_declaration") {
        let vd: AstNode | null = null;
        for (let k = 0; k < candidate.childCount; k++) {
          const c = candidate.child(k) as AstNode | null;
          if (c && c.type === "variable_declaration") vd = c;
        }
        if (!vd) continue;
        const typeText = (vd.childForFieldName("type") as AstNode | null)?.text ?? null;
        for (let k = 0; k < vd.childCount; k++) {
          const declr = vd.child(k) as AstNode | null;
          if (!declr || declr.type !== "variable_declarator") continue;
          const nameChild = declr.child(0) as AstNode | null;
          if (nameChild) getOrCreate(className, nameChild.text, typeText);
        }
        continue;
      }
      if (language === "java" && candidate.type === "field_declaration") {
        const typeText = (candidate.childForFieldName("type") as AstNode | null)?.text ?? null;
        for (let k = 0; k < candidate.childCount; k++) {
          const declr = candidate.child(k) as AstNode | null;
          if (!declr || declr.type !== "variable_declarator") continue;
          const nameNode = declr.childForFieldName("name") as AstNode | null;
          if (nameNode) getOrCreate(className, nameNode.text, typeText);
        }
        continue;
      }
      // TS/JS: public_field_definition / field_definition.
      const nameNode = candidate.childForFieldName("name") as AstNode | null;
      if (!nameNode) continue;
      const typeNode = candidate.childForFieldName("type") as AstNode | null;
      const rhs = candidate.childForFieldName("value") as AstNode | null;
      const rec = getOrCreate(className, nameNode.text, typeNode?.text ?? null);
      const cls = classifyRhs(rhs, language, localClassNames);
      if (cls) rec.originSamples.push(cls);
    }
  }

  function selfWritesOf(methodNode: AstNode, className: string): void {
    const visit = (node: AstNode): void => {
      const hit = selfWriteTarget(node, language);
      if (hit) {
        const rec = getOrCreate(className, hit.fieldName, null);
        const cls = classifyRhs(hit.rhs, language, localClassNames);
        if (cls) rec.originSamples.push(cls);
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i) as AstNode | null;
        if (child) visit(child);
      }
    };
    visit(methodNode);
  }

  function visit(node: AstNode): void {
    if (node.isNamed && sets.classNodes.has(node.type)) {
      const nameNode = node.childForFieldName("name") as AstNode | null;
      const className = nameNode?.text ?? "?";
      if (nameNode) localClassNames.add(nameNode.text);
      directFieldsOf(node, className);
      const body = node.childForFieldName("body") as AstNode | null;
      if (body) {
        for (let i = 0; i < body.childCount; i++) {
          const child = body.child(i) as AstNode | null;
          if (child && child.isNamed && sets.functionNodes.has(child.type)) selfWritesOf(child, className);
        }
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) visit(child);
    }
  }
  visit(root);
}

interface LangAgg {
  fields: number;
  writtenType: Record<TypeVerdict, number>;
  originInSight: Record<OriginVerdict, number>;
  union: Record<"clase-repo" | "primitivo" | "no-se" | "ambiguo", number>;
}

function emptyAgg(): LangAgg {
  return {
    fields: 0,
    writtenType: { "clase-repo": 0, primitivo: 0, "no-se": 0, "sin-tipo-escrito": 0 },
    originInSight: { "clase-repo": 0, primitivo: 0, "no-se": 0, ambiguo: 0, "sin-muestras": 0 },
    union: { "clase-repo": 0, primitivo: 0, "no-se": 0, ambiguo: 0 },
  };
}

function originVerdictOf(samples: readonly OriginKind[]): OriginVerdict {
  if (samples.length === 0) return "sin-muestras";
  const concrete = new Set(samples.filter((s): s is "clase-repo" | "primitivo" => s === "clase-repo" || s === "primitivo"));
  if (concrete.size >= 2) return "ambiguo";
  if (concrete.size === 1) return [...concrete][0]!;
  return "no-se"; // todas las muestras fueron "no-se"
}

/**
 * El tipo ESCRITO, cuando existe, es una señal más fuerte y deliberada que
 * la clasificación del lado derecho de UNA asignación (`origenALaVista`) —
 * misma jerarquía que ya declara DECISION-TIPOS-Y-FLUJO.md ("Java, C#, TS y
 * Go quedan completos porque el tipo está escrito"). Por eso, cuando hay
 * anotación, GANA sobre el origen — nunca se marca "ambiguo" sólo porque
 * `x: Optional[Foo] = None` tiene tipo escrito "Foo" (vía el pelado de
 * `Optional[...]`) y valor por defecto `None` (primitivo): eso NO es la
 * regla MULTIVALUADA de la ola (dos RAMAS con orígenes distintos) — es un
 * valor inicial nulo con tipo declarado, un patrón normal, no una
 * ambigüedad real. "ambiguo" en la unión sólo sobrevive cuando NINGÚN tipo
 * escrito resolvió Y el origen en sí mismo vio ≥2 sitios de asignación con
 * clasificaciones concretas DISTINTAS — la forma genuina de la regla.
 */
function unionOf(written: TypeVerdict, origin: OriginVerdict): "clase-repo" | "primitivo" | "no-se" | "ambiguo" {
  if (written === "clase-repo" || written === "primitivo") return written;
  if (origin === "clase-repo" || origin === "primitivo") return origin;
  if (origin === "ambiguo") return "ambiguo";
  return "no-se";
}

async function main(): Promise<void> {
  const t0 = performance.now();
  const scanned = await collectFiles(dir);
  const fields = new Map<string, FieldRecord>();
  const classNames = new Set<string>();
  let analysed = 0;
  const filesByLanguage = new Map<string, number>();

  for (const f of scanned) {
    const live = await resolveLiveFileUnit(dir, f.path);
    if (!live) continue;
    analysed++;
    filesByLanguage.set(live.unit.language, (filesByLanguage.get(live.unit.language) ?? 0) + 1);
    try {
      walkFile(live.unit.root, live.unit.language, live.unit.path, live.unit.sets, classNames, fields);
    } finally {
      live.release();
    }
  }

  const byLanguage = new Map<string, LangAgg>();
  const examples: Record<string, string[]> = { "clase-repo": [], primitivo: [], "no-se": [], ambiguo: [] };

  for (const rec of fields.values()) {
    const agg = byLanguage.get(rec.language) ?? emptyAgg();
    byLanguage.set(rec.language, agg);
    agg.fields++;

    const written = classifyTypeName(rec.writtenTypeText, rec.language, classNames);
    agg.writtenType[written]++;

    const origin = originVerdictOf(rec.originSamples);
    agg.originInSight[origin]++;

    const union = unionOf(written, origin);
    agg.union[union]++;
    if (examples[union] && examples[union]!.length < 6) {
      examples[union]!.push(`${rec.language} ${rec.file} ${rec.className}#${rec.fieldName}`);
    }
  }

  const result = {
    slug,
    dir,
    analysedFiles: analysed,
    filesByLanguage: Object.fromEntries(filesByLanguage),
    totalClassNamesRepoWide: classNames.size,
    totalFields: fields.size,
    byLanguage: Object.fromEntries(byLanguage),
    examples,
    wallMs: Math.round(performance.now() - t0),
  };

  writeFileSync(outFile ?? `/tmp/r7-campos-${slug}.json`, JSON.stringify(result, null, 2));
  console.error(
    `${slug}: ${analysed} archivos, ${fields.size} campos, ${classNames.size} clases repo-wide — ${result.wallMs}ms — ` +
      [...byLanguage.entries()].map(([l, a]) => `${l}:${a.fields}`).join(" "),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
