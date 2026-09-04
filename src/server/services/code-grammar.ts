/**
 * Derives, from a grammar itself, the node-type categories that
 * `code-analyzer.ts` used to declare by hand per language (`functionNodes`,
 * `branchNodes`, `chainNodes`, `cloneNodes`, `classNodes`, `nestingNodes`).
 *
 * WHY this existed as six hand-written `Set`s per language, and why that
 * failed silently: a node type name misspelled, or a construct nobody
 * thought to add (a language's own grammar can rename or omit one release to
 * the next), does not raise an error — the walk in `code-analyzer.ts` just
 * never matches it, and that whole finding kind silently stops firing for
 * that language. Confirmed empirically while building this: the ORIGINAL
 * hand list for TypeScript/JavaScript carried `"for_of_statement"` — a node
 * type that plain does not exist in `tree-sitter-typescript` (the grammar
 * folds `for...of` into the SAME node as `for...in`, `for_in_statement`) —
 * dead weight that cost nothing to keep wrong because nothing ever flagged
 * it. That is the exact failure mode this module removes: every category
 * below is derived from a REAL parse of representative source, not typed in.
 *
 * TWO derivation mechanisms, used where each is reliable (see the task's own
 * framing): tree-sitter's published `tags.scm` per-grammar queries were
 * evaluated first (§ tags.scm below) and set aside for THIS use once they
 * proved to be the wrong tool for it; what is used instead is (A) structural
 * introspection of a node's FIELDS (a function has a `body` and takes
 * `parameters`; an `if` has a `condition` and an `alternative`) and (B) a
 * small, shared, cross-language name-vocabulary regex for the few
 * constructs a field shape cannot distinguish (see § name-based fallbacks).
 *
 * WHY NOT `tags.scm`: every tree-sitter grammar publishes one, with the
 * exact taxonomy this module wants (`@definition.function`,
 * `@definition.class`, …) written by whoever knows the grammar best — a
 * strong first instinct. Tried against the six supported grammars and
 * rejected for this specific job: `tags.scm` is written for SYMBOL OUTLINE
 * (an editor's "go to definition" list), not for "which node types open a
 * new function-COMPLEXITY scope". It only captures NAMED, indexable
 * definitions — an anonymous callback (`arr.map(x => …)`, a bare
 * `function () {}` passed as an argument) is invisible to it, because there
 * is no symbol to index. Those anonymous scopes are exactly what this
 * project already treats as their own function for complexity purposes (an
 * `arrow_function` was already in the hand-written TypeScript set) — a
 * `tags.scm`-only derivation would SILENTLY DROP them, the very failure mode
 * this rewrite exists to fix. Field-shape introspection (A) does not have
 * that blind spot: `arrow_function` qualifies because it structurally HAS a
 * body and takes parameters, named or not.
 *
 * (A) STRUCTURAL INTROSPECTION — the primary mechanism, for every category
 * except the two below:
 *   - function-like  := has a `body` field AND a `parameters`/`parameter_list`
 *     field (regardless of a `name` field being present — a zero-argument
 *     definition may not even offer a `parameters` node, so requiring `name`
 *     instead of `parameters` was tried and rejected: it does not
 *     distinguish an anonymous callback FROM a function at all, which is
 *     the opposite of what is needed here).
 *   - class-like     := has a `body` field AND a `name` field, and is NOT
 *     already function-like (a same-type node can satisfy both tests across
 *     DIFFERENT instances in the probe — e.g. Ruby's `def self.build; …; end`
 *     with no parens has no `parameters` child at all, so THAT occurrence
 *     reads as class-like in isolation; whichever type is EVER seen
 *     function-like anywhere in the probe wins the tie, since a
 *     zero-parameter definition is still a definition).
 *   - if-like        := has BOTH a `condition` field and an `alternative`
 *     field — confirmed identical across all 6 grammars' `if`, right down to
 *     Ruby's `elsif`/TypeScript's chained `else if`.
 *   - loop-like / exception-scope-like := name matches a tiny, universal,
 *     shared keyword vocabulary (`while|until|for|do`, `rescue|except|catch|
 *     with|using`) AND structurally has a `body` field, so a same-named but
 *     unrelated construct cannot slip in on name alone.
 *   - switch/case container vs. arm: derived RELATIONALLY, not by field
 *     shape (a case's own `value` field, where the grammar even exposes one,
 *     turned out to be present on wrapper nodes too — not a reliable
 *     discriminator). A second walk flags any node whose name matches the
 *     switch vocabulary (`switch|case|when|match|select`); the OUTERMOST
 *     match in a nesting chain is the container, the next match found under
 *     it is the arm — with a small, explicit, shared exclude list for
 *     structural wrappers that share the vocabulary by name but hold no
 *     decision themselves (`switch_body`/`switch_block` merely GROUP arms;
 *     `switch_label`/`case_switch_label` merely TAG one) and for the
 *     fallback arm itself (`default`/Ruby's plain `else`), matching the
 *     ORIGINAL hand lists' deliberate choice not to count a fallback as a
 *     rung. Confirmed empirically across all 6 grammars' real parse trees
 *     (`switch_case` under TS's `switch_body` under `switch_statement`,
 *     `switch_block_statement_group` under Java's `switch_block` under
 *     `switch_expression`, Go's `expression_case` directly under
 *     `expression_switch_statement` with no wrapper at all) before trusting
 *     it — the three grammars do NOT agree on how many wrapper layers sit in
 *     between, which is exactly why this is relational (skip through
 *     whatever is there) rather than "the arm is always the grandchild".
 *   - the "generic reusable block" a language uses for cloning purposes
 *     beyond functions/classes (`statement_block` in the JS family, `block`
 *     in Python/Go, `body_statement` in Ruby) is discovered the same way:
 *     whichever type is the target of a `body`/`consequence` field from TWO
 *     OR MORE DISTINCT parent types (an if-body, a loop-body, AND a
 *     function-body all resolving to the same node type) is "generic
 *     enough to be worth fingerprinting on its own", vs. a construct-specific
 *     wrapper used by exactly one caller (Ruby's `then`, used only by
 *     `if`/`case`, which the ORIGINAL hand list also left out).
 *
 * (B) NAME-BASED FALLBACK — used ONLY where (A) is confirmed not to work,
 * each one documented at its point of use below:
 *   - ternary/conditional expressions: Python's `conditional_expression`
 *     exposes NO named fields at all for its three parts (confirmed by
 *     parsing one and querying every candidate field name — nothing
 *     resolves), even though the equivalent TypeScript node structurally
 *     mirrors `if`/`else` (`condition`+`alternative`+`consequence`) and
 *     would be caught by (A) alone. The type name itself
 *     (`ternary_expression` / `conditional_expression`) is the one thing
 *     stable across every grammar that has this construct, so it is
 *     name-matched directly — deliberately BEFORE the if-like test, so a
 *     grammar where it DOES mirror if/else (TypeScript) still gets the
 *     original design's choice of counting it as a flat branch only, not a
 *     chain/nesting contributor (a ternary is an expression, not a
 *     decision ladder to walk down).
 *
 * WHAT IS DELIBERATELY LEFT HAND-DECLARED, MINIMALLY, AND WHY (the limit
 * this module is honest about, per the task's own framing):
 *   - Go's struct declarations (`type_declaration`) have NO `body` field at
 *     all in this grammar (a struct's fields live under
 *     `type_spec.type.field_declaration_list`, never reachable through a
 *     field named `body`) — Go genuinely has no nominal "class with a body"
 *     shape the way Ruby/TS/Python/Java/C# do (confirmed: `classNodes`
 *     derives EMPTY for Go under mechanism (A), which is the structurally
 *     honest answer, not a bug). The one place this loses real capability
 *     is duplicate-struct-shape fingerprinting, so `type_declaration` is
 *     added back for THAT purpose only via `extraCloneNodes` below — one
 *     name, for one language, documented here rather than silently derived
 *     wrong.
 *   - Ruby's keyword boolean operators (`and`/`or`) and Ruby 3's pattern
 *     matching (`case/in`, node types `case_match`/`in_clause`) are NOT
 *     derived: neither has a field shape (A) can key on, and folding them
 *     into the switch vocabulary risks over-matching (`in` alone would also
 *     match `for_in_statement`). Both are genuinely rare in idiomatic Ruby
 *     (style guides discourage `and`/`or` for their precedence surprises;
 *     `case/in` is a Ruby 3+ addition) and — importantly — NEITHER was ever
 *     reliably supported by the original hand list either (`case_match` was
 *     never in `chainNodes`, so the ladder-length detector never worked on
 *     it regardless). Left undone rather than special-cased, and noted here
 *     as a known gap rather than an invisible one.
 *   - Distinguishing WHICH branch-like nodes count extra NESTING depth for
 *     cognitive complexity is not delegated to a regex at all here: it falls
 *     out directly from the SAME structural test as everything else
 *     (if-like / loop-like / exception-like / switch-CONTAINER, never a
 *     switch-arm — an arm does not add depth beyond its container). The one
 *     thing that would let this be checked against a source OTHER than "did
 *     the probe happen to exercise it" is `node-types.json` (which field
 *     combinations a grammar type structurally supports), and the
 *     `tree-sitter-wasms` package does not ship it, only the compiled
 *     `.wasm` — so this module's honesty check is the PROBE SOURCE covering
 *     every construct in play, not a grammar manifest.
 */

/** The minimal structural surface this module needs from a parsed node — the
 * same shape `code-analyzer.ts`'s own `TreeSitterNode` already provides, kept
 * separate here so this module has no dependency on tree-sitter's types. */
export interface ProbeNode {
  type: string;
  isNamed: boolean;
  childCount: number;
  child(i: number): ProbeNode | null;
  childForFieldName(name: string): ProbeNode | null;
}

export interface DerivedNodeSets {
  functionNodes: Set<string>;
  branchNodes: Set<string>;
  chainNodes: Set<string>;
  cloneNodes: Set<string>;
  classNodes: Set<string>;
  nestingNodes: Set<string>;
  /**
   * Function-like node types that are ALSO a grammar's own dedicated
   * "constructor" rule (mechanism B — see `CONSTRUCTOR_NODE_WORD` below).
   * Empty for a language whose constructor is an ordinary function-like node
   * under a conventional name (Ruby/Python/JS/TS/Vue/Go) — those are told
   * apart by `CONSTRUCTOR_NAMES` instead, at the call site.
   */
  constructorNodes: Set<string>;
  /** The `exceptionLike` category on its own, not merged into `branchNodes`/
   *  `nestingNodes` — added for `empty-catch` (F1), which needs to walk
   *  exception-handling nodes SPECIFICALLY, not "any branch". */
  exceptionNodes: Set<string>;
  /** The `switchContainers` category on its own, not merged into `chainNodes`
   *  (which deliberately fuses if-ladders and switches for "how many rungs")
   *  — added for `repeated-switch` (F1), which needs real switch/case/match
   *  containers specifically, never an if/elsif ladder. */
  switchContainerNodes: Set<string>;
}

const LOOP_WORD = /(^|_)(while|until|for|do)(_|$)/;
const EXCEPTION_WORD = /(^|_)(rescue|except|catch|with|using)(_|$)/;
const SWITCH_WORD = /(^|_)(switch|case|when|match|select)(_|$)/;
/** The catch-all arm (`default`, Ruby's plain `else`) never counts as a rung. */
const SWITCH_ARM_EXCLUDE = /(pattern|else|default)/;
/** Group/tag wrappers that share the switch vocabulary by name but decide nothing themselves. */
const SWITCH_WRAPPER_EXCLUDE = /(^|_)(body|block|label)$/;
/**
 * See the module docstring's "name-based fallback" section: the one construct
 * a field shape cannot reliably identify across all supported grammars.
 *
 * F1 hygiene fix: tree-sitter-ruby's ternary node is named `conditional`
 * BARE — no `_expression` suffix — confirmed by direct probe (`x > 0 ? 1 : 2`
 * parses as a lone `conditional` node with `condition`/`alternative`/
 * `consequence` fields, nothing else). The original regex required the
 * suffix, so that node fell through to `isIfLike` below (it DOES have
 * `condition` + `alternative`) and got counted as an if-rung: exactly the
 * chain-length and nesting-depth inflation this module's own docstring says
 * a ternary must never cause. The optional `(_expression)?` is the whole
 * fix — every other grammar's ternary already carries the suffix (Java's
 * `ternary_expression`, C#/Python's `conditional_expression`), so widening
 * the suffix to optional costs nothing there and fixes Ruby.
 */
const TERNARY_NAME = /^(ternary|conditional)(_expression)?$/;

/**
 * F1 hygiene fix: Java and C# each dedicate their OWN grammar rule to a
 * constructor — confirmed identical literal type name across both by direct
 * probe (`public Shape(String name) {…}` / `public Shape(string name) {…}`
 * both parse their declaration as `constructor_declaration`, nothing else).
 * Ruby (`initialize`), Python (`__init__`) and JS/TS/Vue (the `constructor`
 * keyword-literal method name) have NO such rule — their constructor is an
 * ordinary function-like node under a language-MANDATED spelling, so those
 * three are told apart by name instead (`CONSTRUCTOR_NAMES` below), never by
 * this. Go has no constructors at all (confirmed: no OOP construct any
 * grammar here calls a "constructor").
 */
const CONSTRUCTOR_NODE_WORD = /^constructor_declaration$/;

/**
 * F5 anti-sonda-incompleta fix: found while auditing the nine probes for
 * exactly the family of bug this module's docstring already names — a
 * construct the ORIGINAL probes never exercised, here Java's and C#'s
 * `record` declaration. Confirmed by direct probe (`record Point(int x, int
 * y) {}` / `record Point(int X, int Y);`, both parse as `record_declaration`)
 * that a record's own type name is IDENTICAL across both grammars, and that
 * it structurally has BOTH a `body` field AND a `parameters` field — the
 * record's positional component list resolves to the SAME field name a
 * constructor's argument list does. Left alone, the unconditional
 * `isFunctionLike` check above would classify EVERY record as a function
 * (inflating `long-function`/`long-parameter-list`/cognitive-complexity with
 * a data type's component list) and it could NEVER reach `classNodes`
 * afterwards (`isClassLike`'s own `!isFunctionLike` guard forbids it) — yet a
 * record IS a type declaration, not a function, exactly the same standing as
 * `constructor_declaration` gets its own name-based rule instead of being
 * judged by field shape alone. Checked FIRST, before `isFunctionLike`, so a
 * record is added to `classNodes` and is NEVER added to `functionNodes` at
 * all (unlike `constructor_declaration`, which stays function-like AND also
 * gets tagged — a record is not a callable, so there is no dual membership
 * to preserve here).
 */
const RECORD_NODE_WORD = /^record_declaration$/;

/**
 * ROOT-CAUSE FIX (Go: `extends`/`implements`/`mixes-in`/`satisfies` all read
 * empty `classNodes`) — mechanism (B), same standing as `RECORD_NODE_WORD`/
 * `CONSTRUCTOR_NODE_WORD` above: a grammar dedicates its OWN rule to a
 * construct that field shape (A) cannot single out on its own.
 *
 * Go's `type_spec` is the ONE node type the grammar uses for EVERY `type
 * X ...` declaration — struct, interface, alias, pointer, slice, map,
 * channel, function-type, all of them — confirmed by direct probe
 * (`web-tree-sitter` + `tree-sitter-go.wasm`, `type Shaper interface{...}`
 * and `type Shape struct{...}` both parse as `type_spec` exposing exactly
 * `name` (the declared type's own identifier) and `type` (the shape it
 * declares) fields, NEVER `body` — this module's own long-standing
 * docstring paragraph on Go already named this gap). `isClassLike`'s
 * `body`+`name` test can therefore never match `type_spec`, for any
 * instance, which is why `classNodes` derives EMPTY for Go today regardless
 * of how many structs/interfaces a repo declares.
 *
 * WIDENING `isClassLike` itself to "`name`+`type`, not function-like"
 * instead of adding a narrow name-based rule is REJECTED, confirmed by
 * direct probe: Go's `var_spec`, `const_spec`, `parameter_declaration` and
 * `field_declaration` ALL expose the identical `name`+`type` shape (a
 * package-level variable, a constant, a function parameter, and a struct
 * field are each, structurally, "a name paired with a type" too) — a bare
 * field-shape widening would misclassify every one of those as a class.
 * `type_spec`'s own dedicated node-type NAME is the one thing that
 * discriminates "this is a TYPE declaration" from "this is a var/const/
 * param/field that happens to carry the same two fields", exactly the
 * discrimination `RECORD_NODE_WORD`/`CONSTRUCTOR_NODE_WORD` already rely on
 * their own node names for.
 *
 * CONSEQUENCE, MEASURED AND ACCEPTED, NOT HIDDEN: this makes EVERY Go type
 * declaration class-like, not only the `struct`/`interface` ones — a plain
 * alias (`type UserID int`) or a pointer/slice/map/channel/function-type
 * alias gets `family: "class-like"` too, because `type_spec` carries no
 * further node-TYPE distinction between them (the aggregate-vs-scalar
 * difference lives one field down, in what `type` resolves to —
 * information a `Set<string>` of node-type names cannot carry per
 * instance). This is the SAME coarseness the project already accepts
 * elsewhere for the identical reason: Java/C#'s `method_declaration` covers
 * both an abstract interface signature AND a concrete method under one
 * shared node name (confirmed by probe, see `GO_METHOD_SPEC_WORD` below for
 * why Go needs its own separate fallback instead of inheriting that same
 * shortcut). Verified harmless downstream, not merely assumed: a scalar
 * alias's `type` field resolves to a leaf (`type_identifier`) or to an
 * "operator" node with no member declarations of its own directly inside
 * it (`pointer_type`/`slice_type`/`map_type`/`channel_type`), so it never
 * gathers any `contains` children through the mechanisms this module feeds
 * and can never become a `satisfies` target OR candidate
 * (`MIN_REQUIRED_SIGNATURE_SIZE` in `graph/edges/satisfies-derive.ts`
 * already excludes any type with an empty member signature) — confirmed
 * against the corpus census in this task's final report, not hypothetical.
 */
const GO_TYPE_SPEC_WORD = /^type_spec$/;

function isGoTypeSpecLike(node: ProbeNode): boolean {
  return GO_TYPE_SPEC_WORD.test(node.type) && hasField(node, "name") && hasField(node, "type");
}

/**
 * ROOT-CAUSE FIX, second half — needed alongside `GO_TYPE_SPEC_WORD` for
 * `satisfies` specifically, not merely a nicety: fixing `classNodes` alone
 * makes a Go interface's `type_spec` class-like, but `memberSignatures`
 * (`graph/types.ts`) only ever reads `contains` children whose OWN `family`
 * is `"function-like"` — and an interface's members (`method_spec`, e.g.
 * `Area() int` inside `interface Shaper { Area() int }`) confirmed by the
 * SAME direct probe to expose `name` + `parameters`/`parameter_list` +
 * `result` fields but NEVER `body` (an interface signature has no
 * implementation, by construction of the language — there is nothing to
 * put in a `body` field). `isFunctionLike`'s `body`+`parameters` test can
 * therefore never match `method_spec`, for ANY instance, so without this,
 * no Go interface member could ever become a `family: "function-like"`
 * symbol and `satisfies-derive.ts` would still find zero comparable
 * signatures for every Go interface even after the `classNodes` fix above.
 *
 * WHY Go needs its own separate rule instead of the shortcut Java/C# get
 * for free: those two languages route an ABSTRACT interface method AND a
 * CONCRETE class method through the exact same node type
 * (`method_declaration`, confirmed by direct probe against
 * `tree-sitter-java`) — one probed concrete instance (which DOES have a
 * `body`) is enough for that single node-type name to enter `functionNodes`
 * for BOTH forms, since `deriveNodeSets` keys membership by node-type NAME,
 * not per instance. Go's grammar dedicates a SEPARATE node type
 * (`method_spec`) to the signature-only form specifically — confirmed by
 * probe, it never once carries a `body` field, in any real Go source — so
 * that free ride does not exist here and this module would otherwise stay
 * silently blind to it regardless of the `classNodes` fix.
 *
 * A name-based rule, not a widening of `isFunctionLike` itself, for the
 * same reason `GO_TYPE_SPEC_WORD` is name-based above: `isFunctionLike`
 * requiring `body` is exactly right for every OTHER function-like node in
 * every supported grammar (dropping that requirement globally would risk
 * admitting other body-less constructs this module has no reason to treat
 * as callables) — `method_spec` is Go's own dedicated grammar rule for
 * exactly one thing, so matching its own node-type name is the narrow,
 * minimal, documented exception, same standing as `CONSTRUCTOR_NODE_WORD`/
 * `RECORD_NODE_WORD`.
 */
const GO_METHOD_SPEC_WORD = /^method_spec$/;

function isGoMethodSpecLike(node: ProbeNode): boolean {
  return GO_METHOD_SPEC_WORD.test(node.type) && hasField(node, "name") && (hasField(node, "parameters") || hasField(node, "parameter_list"));
}

/**
 * Name-based fallback for "this function is a constructor" — used ONLY where
 * (A)/(B) above cannot apply because the grammar gives the constructor no
 * node type of its own (see `CONSTRUCTOR_NODE_WORD`'s doc for Java/C#, which
 * DO get one). All three entries are a language's own MANDATED spelling —
 * calling Ruby's initializer anything but `initialize` breaks `Class.new`,
 * Python's dunder is enforced by the interpreter, and JS/TS/Vue's
 * `constructor` is a grammar keyword-literal, not a style guess — so this is
 * the same standing as `TERNARY_NAME`, not a per-project convention list.
 *
 * Centralised here for `code-analyzer.ts`, `pattern-structural.ts` and
 * `pattern-behavioral.ts` to share: before this fix each of the three held
 * its own copy, and they had already diverged (`pattern-structural.ts`
 * carried an extra `"New"`, guessing at Go's `NewXxx` FACTORY convention —
 * which is not a constructor: Go has none, and that entry never matched
 * anything real since `factorySlots`' own name test is prefix-based while
 * this one is an exact match).
 */
export const CONSTRUCTOR_NAMES: ReadonlySet<string> = new Set(["initialize", "constructor", "__init__"]);

function hasField(node: ProbeNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

function isFunctionLike(node: ProbeNode): boolean {
  return hasField(node, "body") && (hasField(node, "parameters") || hasField(node, "parameter_list"));
}

function isClassLike(node: ProbeNode): boolean {
  return hasField(node, "body") && hasField(node, "name") && !isFunctionLike(node);
}

function isIfLike(node: ProbeNode): boolean {
  return hasField(node, "condition") && hasField(node, "alternative");
}

/**
 * Narrow fallback for `EXCEPTION_WORD`'s `hasField(node, "body")` guard,
 * found while writing this module's first direct test (F1 hygiene pass):
 * Python's `except_clause` resolves NO field at all for its handler block —
 * confirmed by direct probe against every candidate name (`body`,
 * `consequence`, `block`, `handler`) — unlike Ruby's `rescue`, JS/Java/C#'s
 * `catch_clause`, or Python's OWN `with_statement`, which all expose `body`.
 * Requiring `hasField(body)` unconditionally left Python's exception
 * handling entirely invisible to `branchNodes`/`nestingNodes`/
 * `exceptionNodes` (and to the "excepciones" capability) — not a documented
 * gap like the four genuinely-undetectable ones this module lists, just a
 * silent miss. This activates ONLY as a fallback (a node that already
 * resolves `body` never needs it) and only requires the node have SOME
 * named content, so it cannot admit a bare keyword-only token that happens
 * to share the vocabulary.
 */
function hasNamedChild(node: ProbeNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.isNamed) return true;
  }
  return false;
}

/**
 * Derive a grammar's node-type categories from a single parse of
 * representative source. Pure and synchronous: the caller owns parsing
 * (loading a grammar, running a parser) so this module stays free of any
 * tree-sitter runtime dependency and is directly unit-testable off a fake
 * `ProbeNode` tree.
 *
 * @param extraCloneNodes documented, minimal, per-language exception for a
 *   shape (A) cannot see at all — see the module docstring's Go paragraph.
 * @param functionExclusions documented, minimal, per-language exception in
 *   the OTHER direction: a type that structurally passes the function-like
 *   test (`body` + `parameters`) but that the language does not treat as its
 *   own complexity scope. Confirmed necessary, not theoretical: Ruby's
 *   `do_block`/`block` (`items.each do |item| … end`) structurally has BOTH
 *   fields, exactly like a JS arrow-function callback the original design
 *   DOES want scored on its own — but unlike the JS case, scoring Ruby
 *   blocks this way is not a refinement, it is noise: measured on real-world
 *   Ruby, it roughly doubled `long-function` findings, almost entirely
 *   `.each do |x| … end` bodies that are not the function anyone would
 *   actually go read. The block still counts for DUPLICATION
 *   fingerprinting (added back via `extraCloneNodes`, matching the original
 *   hand list) — only its standing as its own function-complexity scope is
 *   excluded here.
 *
 * Together, both parameters are the ENTIRE per-language override surface
 * this module allows — precisely so adding a language never regresses to
 * "one more hand-written Set" of node names.
 */
export function deriveNodeSets(
  root: ProbeNode,
  extraCloneNodes: readonly string[] = [],
  functionExclusions: readonly string[] = [],
): DerivedNodeSets {
  const functionNodes = new Set<string>();
  const classNodes = new Set<string>();
  const ifLike = new Set<string>();
  const loopLike = new Set<string>();
  const exceptionLike = new Set<string>();
  const ternaryLike = new Set<string>();
  const switchContainers = new Set<string>();
  const switchArms = new Set<string>();
  /** target node type -> set of DISTINCT parent types resolving a body/consequence field to it. */
  const bodyTargetParents = new Map<string, Set<string>>();

  const constructorNodes = new Set<string>();

  const visit = (node: ProbeNode): void => {
    if (node.isNamed) {
      // Checked before isFunctionLike: see `RECORD_NODE_WORD`'s doc — a
      // record's field shape (body + parameters) is indistinguishable from a
      // constructor's, but a record is a TYPE, not a function, so it must
      // never enter `functionNodes` at all.
      if (RECORD_NODE_WORD.test(node.type)) classNodes.add(node.type);
      // `isGoMethodSpecLike` alongside `isFunctionLike`, not instead of it:
      // see `GO_METHOD_SPEC_WORD`'s doc — Go's interface-signature node
      // never has a `body`, so the ordinary field-shape test never admits
      // it on its own.
      else if (isFunctionLike(node) || isGoMethodSpecLike(node)) functionNodes.add(node.type);
      // Independent of the if/else-if ladder below (a constructor node is
      // ALSO function-like and already claimed the branch above): a
      // language's own dedicated constructor rule, when it has one — see
      // `CONSTRUCTOR_NODE_WORD`'s doc.
      if (CONSTRUCTOR_NODE_WORD.test(node.type)) constructorNodes.add(node.type);
      // Checked before isClassLike: confirmed by probing tree-sitter-java's
      // real grammar that `enhanced_for_statement` (`for (Type x : coll) {}`)
      // has a `body` field AND a `name` field (the iteration variable) but no
      // `parameters`/`parameter_list` — the EXACT shape `isClassLike` tests
      // for, so a for-each loop satisfied it and was derived as a class
      // (`className`/`enclosingClassNames` of anything nested inside became
      // the loop variable's name, and duplicate-shape fingerprinting treated
      // two similar for-each loops as "the same class" — see this module's
      // git history for the exact repro). A loop-shaped name always wins the
      // ambiguity: no supported grammar's actual class/type declaration node
      // matches the loop keyword vocabulary, so this reorder costs nothing.
      else if (LOOP_WORD.test(node.type) && hasField(node, "body")) loopLike.add(node.type);
      else if (EXCEPTION_WORD.test(node.type) && (hasField(node, "body") || hasNamedChild(node))) exceptionLike.add(node.type);
      // `isGoTypeSpecLike` alongside `isClassLike`, not instead of it: see
      // `GO_TYPE_SPEC_WORD`'s doc — Go's `type_spec` never has a `body`, so
      // the ordinary field-shape test never admits it on its own.
      else if (isClassLike(node) || isGoTypeSpecLike(node)) classNodes.add(node.type);
      // Checked before isIfLike: see the module docstring — a ternary must
      // not fall into the if-like bucket even where its fields mirror if/else.
      else if (TERNARY_NAME.test(node.type)) ternaryLike.add(node.type);
      else if (isIfLike(node)) ifLike.add(node.type);

      for (const field of ["body", "consequence"]) {
        const target = node.childForFieldName(field);
        if (target) {
          let parents = bodyTargetParents.get(target.type);
          if (!parents) {
            parents = new Set();
            bodyTargetParents.set(target.type, parents);
          }
          parents.add(node.type);
        }
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  };
  visit(root);

  // Second, independent walk: switch/case container vs. arm is RELATIONAL
  // (which match sits inside which), not a field-shape question — see the
  // module docstring for why this cannot be a single flat name test.
  const switchWalk = (node: ProbeNode, seekingArm: boolean): void => {
    const isWrapper = node.isNamed && SWITCH_WORD.test(node.type) && SWITCH_WRAPPER_EXCLUDE.test(node.type);
    const isMatch = node.isNamed && SWITCH_WORD.test(node.type) && !SWITCH_ARM_EXCLUDE.test(node.type) && !isWrapper;
    if (isMatch) {
      if (seekingArm) switchArms.add(node.type);
      else switchContainers.add(node.type);
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) switchWalk(child, !seekingArm);
      }
      return;
    }
    // A wrapper or a non-match passes the SAME state through unchanged, so a
    // group/label node in between a container and its real arms neither
    // resets nor falsely consumes the "now looking for the next arm" signal.
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) switchWalk(child, seekingArm);
    }
  };
  switchWalk(root, false);

  // A type seen function-like in ANY probed instance is a function type,
  // even if a DIFFERENT occurrence (typically a zero-argument definition,
  // which some grammars parse without emitting a `parameters` child at all)
  // also passed the class-like test in isolation — see the module docstring.
  for (const type of functionNodes) classNodes.delete(type);

  // Applied AFTER the tie-break above, and only here: this is about whether
  // a type counts as its own function-COMPLEXITY scope, not about whether it
  // structurally qualifies — see `functionExclusions`'s doc.
  for (const type of functionExclusions) functionNodes.delete(type);

  const genericBlockNodes = [...bodyTargetParents.entries()]
    .filter(([, parents]) => parents.size >= 2)
    .map(([type]) => type);

  return {
    functionNodes,
    classNodes,
    branchNodes: new Set([...ifLike, ...loopLike, ...exceptionLike, ...switchArms, ...ternaryLike]),
    chainNodes: new Set([...ifLike, ...switchContainers, ...switchArms]),
    nestingNodes: new Set([...ifLike, ...loopLike, ...exceptionLike, ...switchContainers]),
    cloneNodes: new Set([...functionNodes, ...classNodes, ...genericBlockNodes, ...extraCloneNodes]),
    constructorNodes,
    exceptionNodes: new Set(exceptionLike),
    switchContainerNodes: new Set(switchContainers),
  };
}
