/**
 * Code hotspot analysis: the problems refactoring patterns exist to solve.
 *
 * Same pipeline shape as the schema view — extract to a contract, derive, then
 * render — but the extractor here is tree-sitter rather than an agent-written
 * script. That is a deliberate difference: schema formats vary per stack with
 * no universal parser, whereas for CODE tree-sitter already is one (deterministic,
 * local, no model in the loop — throughput scales with file size, not with
 * repo identity).
 *
 * F4: this file now DRIVES the detector registry (`detect/registry.ts`, 19
 * detectors) instead of calling five hand-picked `buildXFinding` functions
 * directly. `intra-function`/`intra-file` detectors need the LIVE AST
 * (`fn.node`/`file.root`), so they run INSIDE `analyzeFile`, on the tree
 * `walkFile` just built, before `tree.delete()` — see the "F4" section below
 * `analyzeFile`. `inter-file` detectors (today: only `duplication`) run
 * inside `crossAnalyze`, on the `RepoUnit` assembled from every file's
 * `FileFacts`. `toCodeFinding()` still adapts a `detect/` `Finding` into this
 * module's legacy `CodeFinding` — now applied to all 19 detectors' output,
 * not five. The five detectors that used to be called directly here
 * (`duplication`, `conditional-chain`, `complexity`, `long-function`,
 * `long-parameter-list`) are UNCHANGED code, just reached through the
 * registry now instead of a second, parallel call path — see CONTRATO-F4.md
 * §1.4 for why keeping both paths would have double-counted every legacy
 * finding.
 *
 * Cost control: the file walk stats everything (cheap) and produces a signature;
 * parsing (expensive) only re-runs when that signature moves. Vendored trees are
 * skipped, which on a typical repo drops the file count considerably (fewer
 * files actually need parsing than exist on disk).
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

import { CONSTRUCTOR_NAMES, deriveNodeSets, type DerivedNodeSets } from "./code-grammar.js";
import { conIdsEstables, desambiguarIdsRepetidos } from "./code-finding-ids.js";
import { deriveCapabilities, type Capability } from "./detect/capabilities.js";
import {
  bucketFindings,
  buildConfidenceOf,
  byGroupRankDescThenId,
  finalizeGroups,
  type FindingGroup,
} from "./detect/grouping.js";
import { kindCatalog } from "./detect/kinds.js";
import { computeReachIndex } from "./detect/reach.js";
import { byScoreDescThenId, scoreFindings } from "./detect/ranking.js";
import { allDetectors, hasIntraGraphDetectors, runDetectors } from "./detect/run.js";
import { buildGraphIndex } from "./detect/primitivas/u1-grafo-en-contexto.js";
import type { AstNode, CoverageStatus, DetectorCoverage, FileUnit, Finding, Measurement, RawFinding, RepoFunctionUnit } from "./detect/types.js";
import { buildFileUnit } from "./facts/units.js";
import { attachHypotheses, findingsNeedingGraphPass, rebuildHypothesesWithGraph, refreshHypotheses } from "./hypotheses/run.js";
import type { PatternHypothesis } from "./hypotheses/types.js";
import { buildGraphIncremental, type GraphBuildCache, type GraphFileFacts } from "./graph/build.js";
import { extractEdgeFacts } from "./graph/edges/warmup.js";
import type { EdgeFacts } from "./graph/edges/types.js";
import { extractCarrierFacts, type CarrierFact } from "./graph/edges/portador.js";
import { extractReceiverFacts, type ReceiverFact } from "./graph/edges/invocacion-indirecta.js";
import { attachFindingNodes } from "./graph/finding-nodes.js";
import { buildNeighborhoodIndex } from "./graph/neighborhood.js";
import { extractReferences, type ReferenceFacts } from "./graph/references.js";
import { extractSymbols, type SymbolFacts } from "./graph/symbols.js";
import type { CodeGraph, CodeGraphNode } from "./graph/types.js";
import {
  classifyFile, dominantProvenance, excludedByProvenance,
  excludedDotnetTestProjectDir,
  excludedGherkinFeaturesDir,
  isFeaturesDirName,
  isTestDirName,
  type ExcludedFile,
} from "./ingest-exclusion.js";
import type { CodeAnalysis, CodeFileSummary, CodeFinding, CodeFindingHypothesis } from "../../shared/types.js";

const require = createRequire(import.meta.url);

/* ────────────────────────────────────────────────────────────────────────
 * Language support
 *
 * A language used to declare six hand-written `Set`s of node-type names
 * (which nodes are functions, which branch, which chain...). That is exactly
 * the fragility this rewrite removes: see `code-grammar.ts`'s docstring for
 * why (a misspelled or missing node name gives silent zero results, not an
 * error — confirmed to have already happened, with a dead `for_of_statement`
 * entry nobody caught). What a language declares NOW is the minimum that
 * genuinely cannot come from the grammar itself: its wasm file, its file
 * extensions, and ONE representative source sample the grammar is asked to
 * parse once (at first use) so `deriveNodeSets` can read the six categories
 * back off real field shapes and real parse trees. Adding Java and C# below
 * costs exactly that — no per-language Set to transcribe.
 * ──────────────────────────────────────────────────────────────────────── */

/** F4 — exported so `facts/units.ts` can type `buildFileUnit`'s `spec` param without redeclaring it. */
export interface LanguageDecl {
  id: string;
  /** Grammar file under tree-sitter-wasms. */
  wasm: string;
  extensions: string[];
  /**
   * Representative source, parsed ONCE per process to derive this grammar's
   * six node-type categories (see `code-grammar.ts`). Not a list of node
   * names: real code the grammar's own parser reads back its shapes from.
   * Must exercise every construct this analyzer measures — a construct absent
   * from it is a construct this language will not detect, the same honesty
   * requirement a hand-written Set had, just paid once instead of per-category.
   */
  probeSource: string;
  /**
   * For `.vue` and friends: pull the embedded script out before parsing, since
   * the interesting code is not the template.
   */
  extractScript?: (source: string) => string | null;
  /**
   * Documented, minimal, per-language exception for a shape `deriveNodeSets`
   * cannot see at all — see `code-grammar.ts`'s docstring (today: only Go's
   * struct declarations, which have no `body` field in this grammar).
   */
  extraCloneNodes?: string[];
  /**
   * Documented, minimal, per-language exception in the OTHER direction — see
   * `deriveNodeSets`'s doc (today: only Ruby's block/do_block, which passes
   * the structural function test but measurably should not be scored as its
   * own complexity scope).
   */
  functionExclusions?: string[];
}

/** Resolved once per language: the declaration plus its derived Sets. */
export interface LanguageSpec extends LanguageDecl, DerivedNodeSets {}

const RUBY_PROBE = `
require "set"
require_relative "helper"

class Shape < Base
  include Comparable
  extend Forwardable
  attr_accessor :name, :age
  private

  def initialize(name, opts = {})
    @name = name
  end

  def self.build(x)
    new(x)
  end

  def area(x, y, z, w, v, u)
    if x > 0
      1
    elsif x < 0
      2
    else
      3
    end
  end

  def unless_form(x)
    unless x > 0
      1
    else
      2
    end
  end

  def describe(kind)
    case kind
    when :circle
      "circle"
    when :square
      "square"
    else
      "unknown"
    end
  end

  def loopy
    while true
      break
    end
    until false
      break
    end
    for i in 1..3
      puts i
    end
    begin
      risky
    rescue => e
      handle(e)
    end
  end

  def each_item
    items.each do |item|
      if item.valid?
        yield item
      end
    end
  end

  def bare_block
    items.each { puts "x" }
  end

  def ternary(x)
    x > 0 ? 1 : 2
  end

  def raiser
    raise ArgumentError, "bad"
  end

  def modifier_rescue
    risky rescue nil
  end

  def greet(name:, greeting: "hi")
    "#{greeting} #{name}"
  end

  def each_thing(&block)
    items.each(&block)
  end
end

module Helper
  def self.build
    new
  end
end

square = ->(x) { x * x }
`;

/**
 * Shared by typescript/tsx/javascript/vue: confirmed empirically (see
 * `code-grammar.ts` derivation notes) that plain ES syntax — no type
 * annotations — parses identically under all three grammars and yields
 * IDENTICAL derived Sets, so one probe source covers the whole family
 * instead of one per grammar.
 *
 * javascript.wasm keeps THIS untyped probe (it cannot parse TS type
 * annotations at all — confirmed by direct probe: `hasError: true` when fed
 * `TS_FAMILY_PROBE` below). typescript/tsx/vue use `TS_FAMILY_PROBE`
 * instead, which appends one typed function so that `deriveCapabilities`
 * can actually see a `type`/`return_type` field and derive "tipos-explicitos"
 * for them — before this addition, EVERY language in this family probed as
 * `tipos-explicitos: false`, including typescript itself, because this probe
 * has no type annotation anywhere in it (a real bug: any `needs:
 * ["tipos-explicitos"]` detector was silently `no-aplicable` for
 * typescript/tsx/vue in production, no matter how much real annotated code
 * they had — reported in Ola 2 adversarial review, `primitive-obsession`).
 */
const JS_FAMILY_PROBE = `
import { helper as importedHelper } from "./helper";
export class Something {}

class Shape extends Base {
  #secret = 1;

  constructor(name) {
    super();
    this.name = name;
  }

  area(x, y, z, w, v, u) {
    if (x > 0) {
      return 1;
    } else if (x < 0) {
      return 2;
    } else {
      return 3;
    }
  }

  describe(kind) {
    switch (kind) {
      case "circle":
        return "circle";
      case "square":
        return "square";
      default:
        return "unknown";
    }
  }

  loopy() {
    while (true) {
      break;
    }
    do {
      break;
    } while (true);
    for (let i = 0; i < 3; i++) {
      console.log(i);
    }
    for (const x of [1, 2]) {
      console.log(x);
    }
    for (const k in {}) {
      console.log(k);
    }
    try {
      risky();
    } catch (e) {
      handle(e);
    }
  }

  #helper() {
    return this.#secret;
  }

  get value() {
    return this.#secret;
  }

  set value(v) {
    this.#secret = v;
  }

  static create() {
    return new Shape("circle");
  }
}

const ternResult = x > 0 ? 1 : 2;
const helper = (x) => x + 1;
const items = [1, 2, 3].map(function (item) {
  if (item > 0) return item;
  return 0;
});
function standalone(a, b) {
  return a + b;
}
function* genFn() {
  yield 1;
}
async function asyncFn() {
  await Promise.resolve(1);
}
function withRest(...nums) {
  return nums;
}
const spreadArr = [...items, 4];
const { name, ...restProps } = { name: "a", b: 1 };
const chained = importedHelper?.value;
const templated = \`Hello \${name}\`;
throw new Error("bad");
`;

/**
 * `JS_FAMILY_PROBE` plus ONE typed function, for the three members of the
 * family whose grammar actually supports type annotations (typescript, tsx,
 * and vue via its `<script>` block, which also parses with
 * `tree-sitter-typescript.wasm`). Confirmed additive by direct probe: every
 * `DerivedNodeSets` bucket (`functionNodes`/`classNodes`/`branchNodes`/…) is
 * IDENTICAL between `JS_FAMILY_PROBE` and this one — the only capability
 * that changes is "tipos-explicitos" flipping to true. `javascript` stays on
 * the untyped `JS_FAMILY_PROBE`: its grammar cannot parse this addition
 * (`hasError: true`).
 */
const TS_FAMILY_PROBE = `${JS_FAMILY_PROBE}
function typed(a: number, b: string): number {
  return a;
}

interface Describable {
  name: string;
  describe(): string;
}

type Point = { x: number; y: number };

enum Color {
  Red,
  Green,
  Blue,
}

function identity<T>(x: T): T {
  return x;
}

class Circle extends Shape implements Describable {
  describe(): string {
    return "circle";
  }
}

namespace Utils {
  export function double(x: number): number {
    return x * 2;
  }
}

abstract class AbstractShape {
  abstract area(): number;
}

@Component
class Decorated {}

const asNumber = 1 as number;

function maybeParam(x?: number): number {
  return x ?? 0;
}

class Labeled {
  public readonly label: string;
  private secret: number = 0;
  constructor(public id: number) {
    this.label = "x";
  }
}
`;

const PYTHON_PROBE = `
import os
from typing import Optional, Protocol
from dataclasses import dataclass

class Shape(Base):
    def __init__(self, name, opts=None):
        self.name = name

    def area(self, x, y, z, w, v, u):
        if x > 0:
            return 1
        elif x < 0:
            return 2
        else:
            return 3

    def describe(self, kind):
        match kind:
            case "circle":
                return "circle"
            case "square" | "rect":
                return "square"
            case _:
                return "unknown"

    def loopy(self):
        while True:
            break
        for i in range(3):
            print(i)
        try:
            risky()
        except Exception as e:
            handle(e)
        finally:
            cleanup()
        with open("f") as fh:
            read(fh)

    def ternary(self, x):
        return 1 if x > 0 else 2

class Multi(Shape, Protocol):
    pass

@dataclass
class Point:
    x: int
    y: int

def annotated(x: int, y: str = "a") -> bool:
    return True

async def fetch():
    await something()

def generator():
    yield 1

def raiser():
    raise ValueError("bad")

def first[T](items: list[T]) -> T:
    return items[0]

helper = lambda x: x + 1
squares = [x * x for x in range(10)]
`;

const GO_PROBE = `
package main

import "fmt"

type Shaper interface {
	Area() int
}

type Shape struct {
	Name string
}

type Named struct {
	Shape
	Label string
}

const Pi = 3.14

var count int = 0

func Identity[T any](x T) T {
	return x
}

func mayFail() error {
	_, err := fmt.Println("x")
	if err != nil {
		return err
	}
	return nil
}

func (s *Shape) Area(x, y, z, w, v, u int) int {
	if x > 0 {
		return 1
	} else if x < 0 {
		return 2
	} else {
		return 3
	}
}

func (s *Shape) Describe(kind string) string {
	switch kind {
	case "circle":
		return "circle"
	case "square":
		return "square"
	default:
		return "unknown"
	}
}

func (s *Shape) TypeSwitch(v interface{}) int {
	switch v.(type) {
	case int:
		return 1
	default:
		return 0
	}
}

func (s *Shape) Loopy() {
	for {
		break
	}
	for i := 0; i < 3; i++ {
		println(i)
	}
	ch := make(chan int)
	select {
	case v := <-ch:
		println(v)
	default:
		println("none")
	}
}

func (s *Shape) Deferred() {
	defer fmt.Println("done")
	go fmt.Println("goroutine")
	for i, v := range []int{1, 2, 3} {
		fmt.Println(i, v)
	}
	adder := func(x int) func(int) int {
		return func(y int) int {
			return x + y
		}
	}
	_ = adder
	defer func() {
		if r := recover(); r != nil {
			fmt.Println(r)
		}
	}()
	panic("bad")
}

func NewShape(name string) *Shape {
	return &Shape{Name: name}
}
`;

const JAVA_PROBE = `
package com.example;

import java.util.List;

public interface Describable {
  String describe();
}

enum Color {
  RED,
  GREEN,
  BLUE,
}

record Point(int x, int y) {}

@interface Marker {}

abstract class AbstractShape {
  abstract int area();
}

class Box<T> {
  private T value;

  static class Nested {}
}

public class Shape extends Base implements Describable {
  private String name;

  public Shape(String name) {
    this.name = name;
  }

  public int area(int x, int y, int z, int w, int v, int u) {
    int ternary = x > 0 ? 1 : 2;
    if (x > 0) {
      return 1;
    } else if (x < 0) {
      return 2;
    } else {
      return 3;
    }
  }

  public String describe(String kind) {
    switch (kind) {
      case "circle":
        return "circle";
      case "square":
        return "square";
      default:
        return "unknown";
    }
  }

  public void loopy() {
    while (true) {
      break;
    }
    do {
      break;
    } while (true);
    for (int i = 0; i < 3; i++) {
      System.out.println(i);
    }
    for (int x : new int[]{1, 2}) {
      System.out.println(x);
    }
    try {
      risky();
    } catch (Exception e) {
      handle(e);
    } finally {
      cleanup();
    }
  }

  public void risky() throws Exception {
    Shape s = new Shape("circle");
    Runnable r = new Runnable() {
      public void run() {}
    };
    if (s instanceof Shape) {
      Object o = (Object) s;
    }
    Runnable lambda = () -> System.out.println("hi");
    throw new Exception("bad");
  }

  public void varargs(int... nums) {}
}
`;

/**
 * D3 (Ola 11b) — PRUEBA DE GENERICIDAD. Rust y Elixir se agregan con la MISMA
 * forma que los nueve anteriores: un `.wasm` que `tree-sitter-wasms` ya trae
 * (no hay dependencia nueva en `package.json`) más código real que la propia
 * gramática lee de vuelta. CERO `extraCloneNodes`, CERO `functionExclusions`,
 * cero entradas nuevas en ningún léxico — esa era la condición del encargo, y
 * lo que sale de aplicarla está medido en el informe del frente: Rust deriva
 * casi todo por mecanismo (A) (introspección de campos) y Elixir deriva
 * prácticamente NADA, porque su gramática no expone campo `body`/`parameters`/
 * `name`/`condition` en NINGÚN nodo (todo es `call` + `do_block`). Esa falta se
 * REPORTA como hueco del mecanismo genérico; no se tapa con una tabla de
 * nombres por lenguaje.
 */
const RUST_PROBE = `
use std::collections::HashMap;
use std::fmt;

pub mod utils {
    pub fn helper() -> i32 {
        1
    }
}

pub trait Shape {
    fn area(&self) -> f64;

    fn name(&self) -> String {
        String::from("shape")
    }
}

pub struct Circle {
    radius: f64,
    label: String,
}

pub enum Kind {
    Round,
    Square(u8),
}

impl Circle {
    pub fn new(radius: f64, label: String) -> Self {
        Circle { radius, label }
    }

    fn describe(&self, kind: &str) -> String {
        match kind {
            "circle" => String::from("circle"),
            "square" => String::from("square"),
            _ => String::from("unknown"),
        }
    }
}

impl Shape for Circle {
    fn area(&self) -> f64 {
        3.14 * self.radius * self.radius
    }
}

impl fmt::Display for Circle {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.label)
    }
}

pub fn identity<T>(x: T) -> T {
    x
}

pub fn loopy(items: &[i32]) -> i32 {
    let mut total = 0;
    for item in items {
        if *item > 0 {
            total += item;
        } else if *item == 0 {
            total += 1;
        } else {
            total -= item;
        }
    }
    while total > 100 {
        total -= 10;
    }
    loop {
        if total == 0 {
            break;
        }
        total -= 1;
    }
    let doubled: Vec<i32> = items.iter().map(|x| x * 2).collect();
    let flag = if total > 0 { 1 } else { 0 };
    total + doubled.len() as i32 + flag
}

pub fn risky(path: &str) -> Result<String, std::io::Error> {
    let data = std::fs::read_to_string(path)?;
    let mut map: HashMap<String, i32> = HashMap::new();
    map.insert(data.clone(), 1);
    match map.get(&data) {
        Some(v) => Ok(format!("{}", v)),
        None => Ok(data),
    }
}
`;

const ELIXIR_PROBE = `
defmodule Shape do
  @callback area(term) :: float

  defmacro __using__(_opts) do
    quote do
      @behaviour Shape
    end
  end
end

defmodule Circle do
  use Shape
  import Enum, only: [reduce: 3]
  alias Shape, as: Base
  @behaviour Shape

  defstruct radius: 0.0, label: "circle"

  def new(radius, label) do
    %Circle{radius: radius, label: label}
  end

  def area(%Circle{radius: r}) when r > 0 do
    3.14 * r * r
  end

  def area(_), do: 0.0

  def describe(kind) do
    case kind do
      "circle" -> "circle"
      "square" -> "square"
      _ -> "unknown"
    end
  end

  def classify(n) do
    cond do
      n > 10 -> :big
      n > 0 -> :small
      true -> :none
    end
  end

  def loopy(items) do
    total =
      Enum.reduce(items, 0, fn item, acc ->
        if item > 0 do
          acc + item
        else
          acc - item
        end
      end)

    doubled = for item <- items, item > 0, do: item * 2

    try do
      risky(total)
    rescue
      e in RuntimeError -> {:error, e}
    after
      length(doubled)
    end
  end

  defp risky(n) when is_integer(n) do
    if n > 100 do
      raise("too big")
    else
      n
    end
  end
end
`;

const CSHARP_PROBE = `
using System;
using System.Linq;
using System.Threading.Tasks;

namespace MyApp {
  public interface IDescribable {
    string Describe();
  }

  public enum Color {
    Red,
    Green,
    Blue,
  }

  public record Point(int X, int Y);

  public struct Vector {
    public int X;
    public int Y;
  }

  public class Box<T> {
    public T Value;
  }

  public abstract class Shape2 {
    public abstract int Area();
  }

  public class Circle2 : Shape2 {
    public override int Area() => 1;
  }

  public partial class Widget {
    public void A() {}
  }

  public partial class Widget {
    public void B() {}
  }

  public class Shape : Base, IDescribable {
    private string name;

    public string Describe() {
      return name;
    }

    public event EventHandler Changed;

    [Obsolete]
    public Shape(string name) {
      this.name = name;
    }

    public string Name { get; set; }

    public int Area(int x, int y, int z, int w, int v, int u) {
      int ternary = x > 0 ? 1 : 2;
      if (x > 0) {
        return 1;
      } else if (x < 0) {
        return 2;
      } else {
        return 3;
      }
    }

    public string Describe(string kind) {
      switch (kind) {
        case "circle":
          return "circle";
        case "square":
          return "square";
        default:
          return "unknown";
      }
    }

    public async Task<int> FetchAsync() {
      return await Task.FromResult(1);
    }

    public void Loopy() {
      while (true) {
        break;
      }
      do {
        break;
      } while (true);
      for (int i = 0; i < 3; i++) {
        System.Console.WriteLine(i);
      }
      foreach (var x in new[] { 1, 2 }) {
        System.Console.WriteLine(x);
      }
      var evens = (new[] { 1, 2, 3 }).Where(n => n % 2 == 0).ToList();
      Func<int, int> increment = (x) => {
        return x + 1;
      };
      string label = null;
      var len = label?.Length ?? 0;
      try {
        Risky();
      } catch (System.Exception e) {
        Handle(e);
      } finally {
        Cleanup();
      }
      using (var r = GetResource()) {
        Use(r);
      }
    }
  }
}
`;

/** A Vue SFC's logic lives in its `<script>` block; the template is not code. */
const extractVueScript = (source: string): string | null => {
  const match = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(source);
  return match ? match[1] : null;
};

/**
 * F5 — exported (read-only in effect; nothing mutates this array) so the
 * anti-sonda-incompleta mechanism (`capability-matrix.test.ts`) can derive
 * `DerivedNodeSets`/`Capability` straight from the REAL probes that
 * `resolveLanguage` uses in production, instead of re-typing or regex-
 * extracting them from source text — the same "measure the real thing, not a
 * copy of it" requirement CONTRATO-F5.md places on this whole task.
 */
export const LANGUAGE_DECLS: LanguageDecl[] = [
  {
    id: "ruby",
    wasm: "tree-sitter-ruby.wasm",
    extensions: [".rb", ".rake"],
    probeSource: RUBY_PROBE,
    // `block`/`do_block` (`items.each do |x| … end`) structurally has a body
    // AND takes parameters, same shape as a JS arrow-function callback — but
    // measured on real-world Ruby, scoring it as its own function roughly
    // doubled `long-function` findings, almost entirely ordinary iteration
    // bodies, not a genuine new hotspot. Kept as a clone candidate (that part
    // of the original design WAS worth keeping) via `extraCloneNodes`,
    // excluded only as a function-complexity scope.
    extraCloneNodes: ["block", "do_block"],
    functionExclusions: ["block", "do_block"],
  },
  { id: "typescript", wasm: "tree-sitter-typescript.wasm", extensions: [".ts", ".mts", ".cts"], probeSource: TS_FAMILY_PROBE },
  { id: "tsx", wasm: "tree-sitter-tsx.wasm", extensions: [".tsx"], probeSource: TS_FAMILY_PROBE },
  { id: "javascript", wasm: "tree-sitter-javascript.wasm", extensions: [".js", ".mjs", ".cjs", ".jsx"], probeSource: JS_FAMILY_PROBE },
  {
    id: "vue",
    wasm: "tree-sitter-typescript.wasm",
    extensions: [".vue"],
    probeSource: TS_FAMILY_PROBE,
    extractScript: extractVueScript,
  },
  { id: "python", wasm: "tree-sitter-python.wasm", extensions: [".py"], probeSource: PYTHON_PROBE },
  {
    id: "go",
    wasm: "tree-sitter-go.wasm",
    extensions: [".go"],
    probeSource: GO_PROBE,
    // Go structs/interfaces have no `body` field in this grammar at all
    // (their members sit under `type_spec.type.field_declaration_list`, or
    // directly under `type_spec.type` for an interface) — see
    // `code-grammar.ts`'s `GO_TYPE_SPEC_WORD`/`GO_METHOD_SPEC_WORD` for the
    // mechanism-B fallback that makes `type_spec`/`method_spec` class-like/
    // function-like anyway (a real language difference in HOW the shape is
    // expressed, not an absence of the shape itself). `type_declaration`
    // stays here as an ADDITIONAL clone-fingerprinting entry on top of that:
    // `type_spec` (now in `classNodes`, hence already in `cloneNodes`) is the
    // inner declarator; `type_declaration` is its outer wrapper (holds the
    // `type` keyword), kept for parity with how the original hand list
    // fingerprinted a Go type declaration as a whole.
    extraCloneNodes: ["type_declaration"],
  },
  { id: "java", wasm: "tree-sitter-java.wasm", extensions: [".java"], probeSource: JAVA_PROBE },
  { id: "csharp", wasm: "tree-sitter-c_sharp.wasm", extensions: [".cs"], probeSource: CSHARP_PROBE },
  // D3 — ver el docstring de RUST_PROBE/ELIXIR_PROBE: SIN `extraCloneNodes` ni
  // `functionExclusions`. Que Elixir quede casi mudo con esta forma es el
  // resultado medido del frente, no un descuido a compensar con excepciones.
  { id: "rust", wasm: "tree-sitter-rust.wasm", extensions: [".rs"], probeSource: RUST_PROBE },
  { id: "elixir", wasm: "tree-sitter-elixir.wasm", extensions: [".ex", ".exs"], probeSource: ELIXIR_PROBE },
];

const BY_EXTENSION = new Map<string, LanguageDecl>();
for (const decl of LANGUAGE_DECLS) {
  for (const ext of decl.extensions) BY_EXTENSION.set(ext, decl);
}

/**
 * Directorios que nunca vale la pena analizar: vendorizados, generados o de
 * control de versiones. Se podan ENTEROS en el recorrido — no se visita lo de
 * adentro — y ahí está la mitad de su valor: clasificar `node_modules`
 * archivo por archivo cuesta exactamente lo que se quiere evitar. Los otros
 * tres criterios de D5 (nombre generado, marca de cabecera, forma
 * minificada) son POR ARCHIVO y viven en `ingest-exclusion.ts`.
 *
 * D5 — CRITERIO DE ADMISIÓN de un nombre a esta lista, estrecho a propósito
 * porque una lista laxa acá saca código legítimo del usuario del análisis:
 * **el nombre lo elige la HERRAMIENTA, no el proyecto.** `node_modules` se
 * llama así porque lo decide npm; ningún equipo lo bautizó. Eso hace que el
 * nombre sea una propiedad del formato de empaquetado —genérico— y no del
 * repositorio —específico—, que es la diferencia que el proyecto exige entre
 * una regla genérica y una lista de nombres de dominio.
 *
 * NO ENTRAN, y el motivo importa tanto como la lista:
 *   · `bin` — npm publica CLIs escritos a mano en `bin/`, Rails versiona
 *     `bin/rails`. Lo elige el proyecto tan seguido como la herramienta.
 *   · `packages` — es el directorio de FUENTES de todo monorepo
 *     pnpm/lerna/yarn-workspaces. Sería la exclusión más destructiva posible.
 *   · `lib` — fuente escrita a mano en Ruby, Elixir, JS y Java tanto como
 *     salida de compilación en otros. Ambiguo, no entra.
 *   · `docs`, `examples`, `samples` — no son dependencias; si tienen código,
 *     es del usuario.
 */
const SKIP_DIRS = new Set([
  ".git", "node_modules", "vendor", "tmp", "log", "dist", "build", "coverage",
  "public", ".next", ".nuxt", "__pycache__", ".venv", "venv", "target",
  ".bundle", "bower_components", ".cache", "storage",
  // D5 — agregados con el criterio de arriba:
  // convención de Chromium/Bazel/Android para "fuente de terceros copiada
  // adentro del repo"; las tres grafías conviven en el ecosistema.
  "third_party", "thirdparty", "third-party",
  // directorios de instalación de gestores de paquetes JS anteriores o
  // paralelos a npm; figuran en la plantilla `Node.gitignore` del propio
  // GitHub, que es la declaración de "esto lo escribe la herramienta".
  "jspm_packages", "web_modules",
  // destino de instalación de un instalador de Python (pip/setuptools): el
  // nombre lo fija el layout de la distribución, no el proyecto.
  "site-packages", "dist-packages",
  // vendorizado de Go anterior a los módulos (`godep`); `vendor`, el que usa
  // Go moderno y también Composer y Bundler, ya estaba arriba.
  "Godeps",
  // Mix (Elixir): `deps` es donde `mix deps.get` instala y `_build` donde
  // compila. Todavía no hay gramática Elixir cargada, así que hoy no pueden
  // excluir nada — entran igual porque el criterio es del formato.
  "deps", "_build",
  // salida intermedia de MSBuild (`bin`, su par, queda AFUERA por lo de
  // arriba) y salida por defecto del compilador de IntelliJ IDEA / toolchain
  // Java, misma clase que `dist`/`build`/`target` que ya estaban.
  "obj", "out",
]);

/**
 * D-TEST — el código de test se excluye por DEFECTO, no sólo se de-prioriza:
 * RSpec/Minitest repiten la misma forma `describe`/`it`/`context` cientos de
 * veces a propósito, así que la duplicación estructural marca el árbol de
 * test ENTERO antes de llegar a un hotspot real de la app, y sus hipótesis de
 * patrón cuelgan de ahí (medido: 52 % de las de newtonsoft-json antes de esta
 * ola). Eso ahoga el objetivo de la herramienta (señalar los pocos lugares
 * que valen un refactor) en ruido que nadie va a accionar — que un archivo de
 * test repita forma no es un problema de diseño de PRODUCCIÓN.
 *
 * D-TEST movió el criterio (nombre de directorio/archivo, y el criterio nuevo
 * de descriptor de proyecto .NET) a `ingest-exclusion.ts`, con el resto de las
 * exclusiones de ingesta y con el mismo criterio de admisión escrito, ya que
 * antes vivía acá SIN pasar por `onExcluded` — es decir, sin auditoría. Ver el
 * docstring de esa sección en `ingest-exclusion.ts` (`isTestDirName`,
 * `isFeaturesDirName`/`excludedGherkinFeaturesDir`, `excludedByTestFilePattern`,
 * `excludedDotnetTestProjectDir`).
 */

/* ────────────────────────────────────────────────────────────────────────
 * Thresholds
 *
 * Chosen so a healthy file reports nothing: the point is a short list of real
 * hotspots, not a wall of noise.
 * ──────────────────────────────────────────────────────────────────────── */

const MIN_CLONE_NODES = 28; // subtrees smaller than this are boilerplate
const MIN_CLONE_LINES = 6;
// P9/F4: the cognitive-complexity (15), parameter-count (6), chain-length (5)
// and long-function (45) thresholds used to live here as bare numbers. They
// now live NEXT TO the finding-construction logic that uses them, in
// `detect/intra-function/{complexity,long-parameter-list,conditional-chain,
// long-function}.ts`, each declared through `citado()`/`pisoDeclarado()`
// with its source (or the honest absence of one) instead of a bare literal
// — resolved by `detect/run.ts` now (once per detector run), not by this
// file: F4 retired the direct calls (and the duplicate resolution) that used
// to live here — see CONTRATO-F4.md §1.4.
/**
 * Popularity as refactoring.guru rates it (0-3 stars on its per-language pages,
 * read from the TypeScript ones). Carried through to the UI so the reader can
 * weigh how common a pattern is before restructuring around it.
 */
const POPULARITY: Record<string, number> = {
  Strategy: 3,
  "Factory Method": 3,
  Builder: 3,
  State: 2,
  "Template Method": 2,
  Prototype: 2,
  "Null Object": 1,
};

/** Creation-method naming, for telling a factory from the smell it fixes. */
const FACTORY_NAME = /^(create|build|make|new|for|from|of|instantiate)([_A-Z]|$)/;
const MAX_FILE_BYTES = 1024 * 1024; // skip generated monsters

/**
 * F5 — CONTRATO-F5.md Contrato 2 §2.5: `maxFindings` DEJÓ de ser un cap del
 * ANÁLISIS (el análisis agrupa y rankea TODO — ver `crossAnalyze`) y pasó a
 * ser el tamaño de página por defecto del TRANSPORTE, ahora sobre GRUPOS
 * (`CodeAnalysis.findings`, uno por causa raíz o por localidad archivo+kind)
 * en vez de sobre hallazgos crudos. El valor (200) no cambió a propósito:
 * mismo comportamiento visible para un caller que no pide `limits`, sólo que
 * ahora lo que se corta son problemas, no instancias — la UI ya no ve un
 * archivo con 261 filas de "long-function": ve las que le correspondan,
 * agrupadas. Overridable per call via `AnalyzeOptions.limits` (see below),
 * which only the census harness uses: everyday callers get exactly this
 * behaviour, unchanged.
 */
export const DEFAULT_ANALYZE_LIMITS: { maxFindings: number } = {
  maxFindings: 200,
};

/**
 * F5 — CONTRATO-F5.md §2.6: techo DURO de almacenamiento, aplicado DESPUÉS
 * del ranking completo de grupos (así se descarta la COLA del ranking, no
 * una muestra sesgada) y ANTES de la página que pide el caller — un caller
 * que pida `limits.maxFindings: "unlimited"` sigue topando acá. No es un
 * `AnalyzeLimits` (no lo elige el caller): es presupuesto de almacenamiento,
 * no de detección — `findingsTotal`/`totalByKind` se calculan ANTES de este
 * techo (ver `crossAnalyze`), así que el conteo honesto sobrevive aunque las
 * filas no. 5000 grupos es generoso frente a lo medido (f4-volumen: 21 667
 * hallazgos CRUDOS en el peor de los 8 repos del corpus, y agrupar reduce
 * ese volumen en un orden de magnitud — ver `f5-agrupacion.md`), así que en
 * la práctica de hoy nunca se alcanza; existe para que un repo patológico no
 * pueda hacer crecer sin límite lo que se persiste por análisis.
 */
export const MAX_STORED_FINDINGS = 5000;

// How long `walkFile` may run before it must hand the event loop back — see
// its doc comment. Checked every N frames rather than every one, since
// `performance.now()` itself has a cost that adds up over tens of thousands
// of nodes. These two together take a large single-file worst case (a
// generated schema file with hundreds of nested blocks, small in LINES but
// large in AST NODES) down from tens of milliseconds to single-digit-ms
// slices, bounding the worst full-run event-loop gap to a low tens-of-ms
// figure once the tree-sitter grammar is warmed up (i.e. every analysis
// after the process's first).
const MAX_WALK_SLICE_MS = 2;
const CLOCK_CHECK_INTERVAL = 200;

/* ────────────────────────────────────────────────────────────────────────
 * Advice
 *
 * What to do about a finding is NOT decided here: `code-suggest` owns that
 * mapping, sourced from the refactoring catalogue and SonarQube's remediation
 * guidance rather than from intuition. This module's job is to measure the
 * SIGNALS that mapping needs — is the duplication inside one function or spread
 * across unrelated classes, does a branch compare against null, does every arm
 * instantiate a different type — because the right answer genuinely depends on
 * them, and a single blanket suggestion is wrong most of the time.
 * ──────────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────────
 * Parser pool (tree-sitter, loaded once per process)
 * ──────────────────────────────────────────────────────────────────────── */

interface TreeSitterNode {
  type: string;
  isNamed: boolean;
  childCount: number;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  child(i: number): TreeSitterNode | null;
  childForFieldName(name: string): TreeSitterNode | null;
  /**
   * `web-tree-sitter` exposes this alongside the singular `childForFieldName`
   * on every real parsed node (confirmed by direct probe against all 9
   * grammars this module loads — Java/C#/Go/Ruby/Python/JS/TS/Vue) — it was
   * simply never declared on this hand-written interface before. Needed by
   * `collectChainArms` (below): a grammar's `alternative` field can carry
   * either ONE child per hop (Ruby's `if -> elsif -> elsif`, each nested one
   * level inside the previous) or ALL remaining hops on the SAME node in one
   * call (Python's `if_statement`, where `elif_clause`/`elif_clause`/
   * `else_clause` are flat siblings, not nested) — `childForFieldName`
   * (singular) only ever returns the FIRST such child, which is exactly the
   * mechanism that silently capped Python's ladder length at 2 regardless of
   * how many real `elif`s existed (see `collectChainArms`'s docstring).
   */
  childrenForFieldName(name: string): TreeSitterNode[];
  text: string;
}

interface TreeSitterParser {
  setLanguage(language: unknown): void;
  parse(source: string): { rootNode: TreeSitterNode; delete?: () => void };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface TreeSitterRuntime {
  Parser: { new (): TreeSitterParser; Language: { load(path: string): Promise<unknown> } };
  Language: { load(path: string): Promise<unknown> };
}

let runtime: Promise<TreeSitterRuntime> | null = null;

/** Absolute path of a grammar shipped by `tree-sitter-wasms`. */
function wasmPath(file: string): string {
  return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", file);
}

/**
 * Resolve `web-tree-sitter`'s `{ Parser, Language }` exactly ONCE per process
 * and cache them.
 *
 * Why this is the whole fix: `web-tree-sitter`'s CJS build is an Emscripten
 * glue file that, as a SIDE EFFECT of `Parser.init()` resolving, runs
 * `module["exports"] = Module` — overwriting `require.cache`'s entry for the
 * package with the raw wasm runtime object (HEAP arrays, `_malloc`, …), not
 * the `Parser` class. So a bare `require("web-tree-sitter")` called again
 * AFTER any earlier `Parser.init()` in the same process returns that garbage,
 * `Parser`/`Language` come back `undefined`, and every grammar after the
 * first silently fails to load. Requiring and initialising once here, then
 * reusing the resolved references for every subsequent language, sidesteps
 * the corrupted cache entirely instead of re-deriving it each time.
 */
function loadRuntime(): Promise<TreeSitterRuntime> {
  runtime ??= (async () => {
    const mod = require("web-tree-sitter") as any;
    const Parser = mod.Parser ?? mod.default ?? mod;
    await Parser.init();
    const Language = Parser.Language ?? mod.Language;
    return { Parser, Language };
  })();
  return runtime;
}

/** A parser plus its fully-derived Sets, resolved together since deriving needs a parser too. */
interface ResolvedLanguage {
  parser: TreeSitterParser;
  spec: LanguageSpec;
  /**
   * F4 — derivadas UNA vez, sobre el `probeTree` que ya se parsea acá, ANTES
   * de `delete()`. Antes de esto, `deriveCapabilities` (`detect/
   * capabilities.ts`, 180 líneas) no tenía NINGÚN llamador de producción —
   * verificado por grep, sólo su propio test — así que `needs` del registro
   * de detectores no podía filtrar nada: todo detector habría salido
   * `corrio` aunque el lenguaje no tuviera la construcción, exactamente el
   * "cero" en vez de "no aplicable" que CONTRATO-F4.md §1.5 prohíbe. Costo
   * adicional: cero, el probe ya se parsea y se descarta.
   */
  capabilities: ReadonlySet<Capability>;
}

// `null` is a valid CACHED value here (a language that failed to resolve),
// distinct from "never attempted" (key absent) — see `resolveLanguage` below:
// without this, a failure was never cached at all, so every file of that
// extension, on every analysis and every panel poll, paid the full grammar
// load + probe-parse cost again and failed again, forever, with nothing in
// logs to explain why that language never produces findings.
const resolved = new Map<string, ResolvedLanguage | null>();

/**
 * Resolve a language's parser AND its derived node-type Sets, together and
 * ONCE per process: deriving needs a parser (to parse `probeSource`) just as
 * much as analysing a real file does, so both are cached behind the same
 * lookup rather than paying the grammar-load cost twice.
 */
async function resolveLanguage(decl: LanguageDecl): Promise<ResolvedLanguage | null> {
  if (resolved.has(decl.id)) return resolved.get(decl.id)!;

  try {
    const { Parser, Language } = await loadRuntime();
    const language = await Language.load(wasmPath(decl.wasm));
    const parser: TreeSitterParser = new Parser();
    parser.setLanguage(language);

    const probeTree = parser.parse(decl.probeSource);
    const derived = deriveNodeSets(probeTree.rootNode, decl.extraCloneNodes, decl.functionExclusions);
    const capabilities = deriveCapabilities(probeTree.rootNode, derived);
    probeTree.delete?.();

    const result: ResolvedLanguage = { parser, spec: { ...decl, ...derived }, capabilities };
    resolved.set(decl.id, result);
    return result;
  } catch (err) {
    // A missing wasm, a corrupted one, an ABI mismatch with this
    // `web-tree-sitter` version, or a real bug in `deriveNodeSets` all land
    // here identically — logging is the only way any of them becomes
    // visible at all (this used to be a bare `catch { return null; }`: the
    // language went mute with zero trace in `console.error`, in
    // `scannedFiles`/`analysedFiles`, or anywhere in `CodeAnalysis`).
    // Cached as a failure (below) so this logs ONCE per process, not once
    // per file of that extension per analysis.
    console.error(`[code-analyzer] no se pudo cargar la gramática de "${decl.id}" (${decl.wasm}); ese lenguaje queda deshabilitado para todo el proceso:`, err);
    resolved.set(decl.id, null);
    return null;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ────────────────────────────────────────────────────────────────────────
 * Analysis
 * ──────────────────────────────────────────────────────────────────────── */

/** One function's measurements, gathered in a single AST walk. */
export interface FunctionInfo {
  name: string;
  file: string;
  startLine: number;
  endLine: number;
  branches: number;
  /** Longest if/elsif or case/when ladder found inside. */
  chain: number;
  /**
   * Cognitive complexity (SonarSource S3776): like the branch count, but each
   * level of NESTING costs more. Plain branch counting rates three sequential
   * ifs the same as three nested ones, when only the second is hard to read.
   */
  cognitive: number;
  /** Deepest nesting reached, to explain what drove the score. */
  maxNesting: number;
  parameters: number;
  /** A branch of its longest ladder compares against nil/null/undefined. */
  chainHasNullCheck: boolean;
  /** Every arm of that ladder constructs a different type. */
  chainInstantiates: boolean;
  /** Syntactic class enclosing the function, if any. */
  className: string | null;
  /** Named like a constructor: the telescoping-constructor signal for Builder. */
  isConstructor: boolean;
  /**
   * Named like a creation method (`create`, `build`, `for`…). A type switch
   * inside one of these IS the factory already, and should be left alone;
   * the same switch buried in business logic is the smell Factory Method
   * addresses. Same shape, opposite advice — so the enclosing name decides.
   */
  isFactoryLike: boolean;
}

export interface CloneCandidate {
  fingerprint: string;
  file: string;
  startLine: number;
  endLine: number;
  nodes: number;
  type: string;
  /** Enclosing function name, for "same function" duplication. */
  functionName: string | null;
  /** Enclosing class name, read syntactically (no type resolution). */
  className: string | null;
  /** Text of the superclass clause, verbatim; not a resolved base type. */
  superclassName: string | null;
  /** Normalized source, to tell an identical copy from a merely similar one. */
  normalized: string;
}

/**
 * Output-VOLUME caps only. They do not affect what gets detected, only how
 * much of it is returned — the sort that ranks findings runs in full either
 * way, so raising these never reorders or drops anything from the prefix a
 * lower cap would have kept.
 */
export interface AnalyzeLimits {
  /**
   * F5 — CONTRATO-F5.md §2.5: ahora es el tamaño de página sobre GRUPOS, no
   * sobre hallazgos crudos (ver `DEFAULT_ANALYZE_LIMITS`). Absent ⇒
   * `DEFAULT_ANALYZE_LIMITS.maxFindings`. `"unlimited"` ⇒ no cut (salvo el
   * techo de almacenamiento — `MAX_STORED_FINDINGS`, que no es elegible por
   * el caller).
   */
  maxFindings?: number | "unlimited";
  /**
   * F5 — CONTRATO-F5.md §2.5/§2.7 (invariante I2): desde qué grupo empieza
   * la página, sobre el MISMO ranking que `maxFindings` corta. Absent ⇒ 0
   * (el prefijo de siempre). Existe para que `CodeAnalysis.page.offset` sea
   * un dato real y no una constante muda — hoy sólo lo usa el barrido de
   * calibración/los tests de este contrato; ningún caller HTTP lo pasa
   * todavía (ver `AnalyzeOptions.limits`).
   */
  offset?: number;
}

export interface AnalyzeOptions {
  /** Repo root to analyse. */
  dir: string;
  /** Repo display name, echoed back in the result. */
  repoName: string;
  /**
   * ONLY the census harness (`scripts/census.mts`) sets this. Absent ⇒
   * behaviour IDENTICAL to before this option existed, byte for byte. Never
   * exposed over HTTP and never set by `code-inspector.ts`: its cache is keyed
   * by `worktreeSignature`, which does not include limits, so an uncapped run
   * would otherwise get served to the UI under the same cache key as a capped
   * one.
   */
  limits?: AnalyzeLimits;
  /**
   * F3 — per-file facts reuse. ONLY `code-inspector.ts` sets this (backed by
   * `CodeFactsRepository`, sqlite, content-hash keyed). Absent ⇒ behaviour
   * IDENTICAL to before this option existed: every file goes through
   * `analyzeFile` fresh, same as `census.ts` and every test still get.
   * `contentHashes` is supplied by the CALLER (from `gitContentSignature`,
   * already paid for by the outer whole-repo check) so this loop never
   * re-hashes a file's bytes just to ask its own cache a question the caller
   * already knows the answer to. `cache.get` returning a `FileFacts` skips
   * `analyzeFile` (read+parse+walk) for that file entirely — the whole point:
   * see this file's header for the 98.6%-per-file / 0.36%-cross split that
   * makes this the fix for "changing one file re-parses the whole repo".
   */
  incremental?: {
    readonly contentHashes: ReadonlyMap<string, string>;
    readonly cache: IncrementalFactsCache;
  };
  /**
   * F3 — recibe la lista COMPLETA de `FileFacts` (frescas + servidas desde
   * `incremental.cache`), en el mismo orden que `collectFiles`, justo antes
   * de pasarla a `crossAnalyze`. Existe para un caller que necesita algo MÁS
   * que el `CodeAnalysis` de salida sin pagar un segundo recorrido de
   * `collectFiles`/`analyzeFile` — HOY: `code-inspector.ts`, para armar el
   * grafo de código (`graph/build.ts`) a partir de `FileFacts.symbols`/
   * `.references` sin re-parsear nada. Ausente ⇒ cero costo, cero cambio de
   * comportamiento: `crossAnalyze` no sabe que este campo existe, así que
   * census y todo test existente (que lo omiten) quedan bit-idénticos.
   */
  onFacts?: (facts: readonly FileFacts[]) => void;
  /**
   * F4 — DEFECTO A1: el `GraphBuildCache` (`graph/build.ts`) de la corrida
   * ANTERIOR de este mismo repo, para que el grafo que `crossAnalyze`
   * construye (ver ahí) sea incremental en vez de frío. Ausente ⇒ build
   * frío (`previous: null, changedPaths: null` — equivalente a `buildGraph`
   * desde cero, sólo que troceado): el comportamiento de CUALQUIER caller
   * que no sepa de esto (census, todo test existente, `code-inspector.ts`
   * cuando el worktree no es un checkout git). El ÚNICO caller que hoy
   * arrastra su propio `GraphBuildCache` entre corridas del MISMO repo es
   * `code-inspector.ts` (por `repoKey`) — pasarlo acá es lo que evita pagar
   * un build completo de grafo DOS VECES por poll (uno acá, otro después en
   * `attachAndPersistGraph`, que hasta esta tarea reconstruía todo desde
   * cero porque nadie del lado de `code-analyzer.ts` construía el grafo).
   */
  graphCache?: {
    readonly previous: GraphBuildCache | null;
    readonly changedPaths: ReadonlySet<string> | null;
  };
  /**
   * N13 — caché de la PASADA 2 (la unificación AST+grafo de U1, ver el
   * bloque grande sobre `dosPasadasHabilitado` dentro de `crossAnalyze`).
   * Clavado por `(contentHash del archivo, huella del grafo COMPLETO —
   * `computeGraphFingerprint`)`, NUNCA por archivo solo: sus hallazgos
   * dependen del grafo del repo ENTERO, así que guardarlos por
   * `(path, contentHash)` de UN archivo — lo que hace `incremental` arriba
   * para la pasada 1 — serviría un hallazgo caduco en cuanto CUALQUIER OTRO
   * archivo moviera el grafo. Con la huella completa como segunda mitad de
   * la clave, un cambio en OTRO archivo que SÍ mueva el grafo invalida el
   * caché de ESTE archivo también (nunca sirve algo caduco); si NO lo
   * mueve (el caso común: un cambio que no toca símbolos/aristas de nadie),
   * el resto de los archivos siguen sirviéndose del caché sin reparsear.
   *
   * MEDIDO (N13, informe de esta ola, `code-inspector.ts`, el único caller
   * que lo setea): sin este caché, la pasada 2 reparsea y re-detecta TODOS
   * los archivos que aplican en CADA poll del panel en vivo, aunque haya
   * cambiado un solo archivo — la brecha que el propio `INTEGRADOR.md` de
   * la Ola N dejó anotada como "vigilar, no revertir" (`RAICES.md`
   * "0-QUATER"). Ausente ⇒ comportamiento IDÉNTICO a antes de esta opción:
   * la pasada 2 corre para todos los archivos que aplican, siempre —
   * `census.ts`, todo test existente, y `code-inspector.ts` cuando el
   * worktree no es un checkout git (sin `contentSig`, sin huella que
   * clavar).
   */
  intraGraphCache?: {
    readonly get: (filePath: string, contentHash: string, graphFingerprint: string) => IntraGraphCacheEntry | undefined;
    readonly put: (filePath: string, contentHash: string, graphFingerprint: string, entry: IntraGraphCacheEntry) => void;
  };
  /**
   * F4 — mismo patrón que `onFacts`: entrega el `CodeGraph` recién
   * construido por `crossAnalyze` (más el `GraphBuildCache` de ESTA corrida,
   * el `previous` de la PRÓXIMA) al caller que lo pidió, para que
   * `code-inspector.ts` deje de reconstruir el grafo una segunda vez
   * después de `analyzeRepo` — ver DEFECTO A1 del reporte de esta tarea.
   * Ausente ⇒ cero costo, cero cambio de comportamiento.
   */
  onGraph?: (result: { readonly graph: CodeGraph; readonly cache: GraphBuildCache; readonly buildMs: number }) => void;
  /**
   * INTEGRACIÓN Ola 6 — CONFLICTO #2 declarado: `MAX_STORED_FINDINGS` (§2.6,
   * más abajo) es un techo de ALMACENAMIENTO, no de detección, y se aplica
   * incondicionalmente — incluso bajo `limits.maxFindings: "unlimited"` —
   * porque `code-inspector.ts` pide siempre "unlimited" y necesita ese techo
   * como guardia real de memoria contra un repo patológico (ver el docstring
   * de `MAX_STORED_FINDINGS`). Pero `census.ts` TAMBIÉN pide "unlimited", con
   * el propósito opuesto: medir la detección real, sin corte (su propio
   * docstring: "el censo mide la detección, no el corte de salida"). Medido
   * contra el corpus (guava, revisión de esta ola): `groupsTotal` da 5143,
   * ya por encima de 5000 — la premisa de `MAX_STORED_FINDINGS` ("en la
   * práctica de hoy nunca se alcanza") dejó de ser cierta, y el censo de
   * guava mide una muestra truncada (5000 de 5143 grupos) en vez de la
   * detección completa, lo que produce redistribución de claves
   * `duplication` entre corridas sin ninguna pérdida real de detección.
   *
   * Mismo patrón que `onFacts`/`onGraph`: un side-channel, no un campo del
   * contrato — evita agrandar `CodeAnalysis` (que viaja por HTTP a la UI en
   * producción) sólo para el caso de uso de un harness de medición. Llamado
   * con la lista COMPLETA de grupos ya rankeados, ANTES del corte de
   * `MAX_STORED_FINDINGS` — `code-inspector.ts` no lo usa (sigue protegido
   * por el techo de memoria de siempre); sólo `census.ts` lo usa, para censar
   * la población real en vez de `analysis.findings` ya recortado. Ausente ⇒
   * cero costo, cero cambio de comportamiento para cualquier caller que no
   * lo sepa (todo test existente, `code-inspector.ts`).
   */
  onPreCapFindings?: (findings: readonly CodeFinding[]) => void;
}

function validateLimit(name: "maxFindings", value: number | "unlimited" | undefined): void {
  if (value === undefined || value === "unlimited") return;
  if (Number.isInteger(value) && value >= 0) return;
  throw new TypeError(`AnalyzeOptions.limits.${name} debe ser un entero >= 0 o 'unlimited'`);
}

/** F5 — CONTRATO-F5.md §2.5: mismo criterio que `validateLimit`, sin `"unlimited"` (`offset` siempre es un número). */
function validateOffset(value: number | undefined): void {
  if (value === undefined) return;
  if (Number.isInteger(value) && value >= 0) return;
  throw new TypeError("AnalyzeOptions.limits.offset debe ser un entero >= 0");
}

/* ────────────────────────────────────────────────────────────────────────
 * F3 — the per-file fact, and the `analyzeRepo` boundary
 *
 * `analyzeRepo` used to be one monolithic loop: parse EVERY file, THEN cross
 * duplication findings, in a single pass with no partial re-entry point.
 * Measured on a 1977-file corpus (`limits: unlimited`, back when this split
 * was made): 98.6% of the cost was PER FILE (read+parse+walk — at the time
 * including the now-retired legacy opportunity families, `collectFileOpportunities`
 * alone measured 74.9%), only 0.36% was the cross-file join — so changing ONE
 * file still re-paid the other 1976 files' cost in full, every time. F-RETIRO-
 * VÍA-VIEJA removed `collectFileOpportunities` itself (see `FACTS_SCHEMA_VERSION`'s
 * docstring); the split this section describes stands regardless — duplication
 * and the rule of three are still genuinely cross-file, per-file work is still
 * the bulk of the cost. Split here into two functions with a serializable
 * boundary between them:
 *
 *   - `analyzeFile`: read+parse+walk for ONE file. Returns a `FileFacts` —
 *     plain data (`JSON.parse(JSON.stringify(f))` is deep-equal to `f`: no
 *     tree-sitter nodes, no `Set`s, no functions) — so a caller can cache it
 *     by content hash and skip re-parsing an unchanged file.
 *   - `crossAnalyze`: everything that needs EVERY file's facts at once —
 *     duplication (a clone's fingerprint can match a file anywhere in the
 *     repo) and the rule of three (pattern occurrence counts are repo-wide).
 *     Cheap — measured 0.36% of the original cost — because none of this
 *     re-parses or re-reads anything, it only joins arrays `analyzeFile`
 *     already built.
 *
 * `analyzeRepo` keeps its EXACT old public signature and is now the thin
 * composition: `collectFiles` → `analyzeFile` (or a cache hit) per file →
 * `crossAnalyze`. Every array is still built in the exact order `collectFiles`
 * returns (`path.localeCompare`), which is what the census golden test
 * actually gates — so output is byte-identical to before this split.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Sube ⇒ toda fila cacheada del esquema viejo es basura (miss, nunca
 * migración — ver `AnalyzeOptions.incremental`). F3: 1 → 2 al agregar
 * `symbols`/`references`; 2 → 3 al dejar de emitir ahí declaraciones
 * fantasma (locales de función/clase anónima, `_` de Go) — una fila
 * vieja se trata como miss, no como un `FileFacts` contaminado servido. F4:
 * 3 → 4 al agregar `findings`/`coverage` (el registro de detectores corre
 * ahora DENTRO de `analyzeFile` — CONTRATO-F4.md §1.1/§1.2). P5-ARISTAS: 4 →
 * 5 al agregar `edges` (el lado PRODUCTOR de `EDGE_EXTRACTORS` corre ahora
 * DENTRO de `analyzeFile`, mismo lugar que `findings` arriba, y por la misma
 * razón: necesita el árbol vivo) — una fila vieja no lleva este campo en
 * absoluto, así que servirla tal cual dejaría `crossAnalyze` armando
 * `GraphFileFacts.edges` como `undefined` para ese archivo (silenciosamente
 * "sin aristas tipadas", no un error) en vez de recalcularlas.
 *
 * CONTRATO-F9.md: 5 → 6. La llamada a `attachHypotheses` DENTRO de
 * `analyzeFile` (ver su docstring) es la que calcula `finding.hypotheses`
 * para los findings `intra-function`/`intra-file` que SÍ se cachean en esta
 * fila — y `HypothesisContext` ganó dos campos nuevos (`neighborhood`,
 * `branches`) que un builder futuro (F1: `strategy.ts`/`state.ts`) va a
 * empezar a leer. HOY, en este commit, ningún builder los lee todavía (el
 * bucle de `run.ts` sigue produciendo la MISMA salida byte a byte que antes
 * — verificado: `EMPTY_NEIGHBORHOOD`/`() => null` no cambian ningún `if`
 * existente), así que el bump es preventivo, no correctivo: se hace ACÁ, en
 * el checkpoint que ensancha la forma, para que ningún frente futuro tenga
 * que acordarse de subirlo cuando empiece a consumir los campos nuevos.
 *
 * F-RETIRO-VÍA-VIEJA: 6 → 7. Se retiran `pattern-structural.ts`/
 * `pattern-wrapping.ts`/`pattern-behavioral.ts`/`code-opportunities.ts`
 * enteros (decisión del usuario: perder esa cobertura es aceptable, dejar de
 * depender de sus métricas es el objetivo). `FileFacts` pierde los campos
 * `behavioral`/`opportunities` — una fila vieja los trae poblados; sin este
 * bump, `crossAnalyze` los leería igual (JS no tira por una propiedad de más)
 * pero cargaría datos de una vía que ya no corre ni se vuelve a producir
 * nunca — exactamente el escenario que este contador existe para evitar.
 *
 * Bump 7 → 8: `FileFacts` gana `receivers` (`invokes-indirect`,
 * generalización del receptor — `graph/edges/invocacion-indirecta.ts`). Una
 * fila vieja cacheada no lo trae; sin este bump, `crossAnalyze` la leería
 * igual (campo ausente ⇒ `[]`, nunca un error — mismo principio aditivo de
 * siempre) pero perdería aristas `invokes-indirect` reales para ese archivo
 * hasta que cambiara de contenido por otro motivo. El bump fuerza un
 * re-análisis, no un crash.
 *
 * Bump 8 → 9: `ReferenceFacts` gana `inTypeSlot` (AA6, Ola AA — LA RANURA DE
 * TIPO de la gramática, ver `graph/references.ts`). Una fila vieja cacheada no
 * lo trae y la etapa que lo consume (`graph/resolve.ts`) lee la ausencia como
 * "no está en una ranura de tipo", el default permisivo de siempre: sin este
 * bump, un archivo cacheado seguiría emitiendo exactamente las aristas que esa
 * etapa existe para no emitir, hasta que cambiara de contenido por otro
 * motivo. El bump fuerza un re-análisis, no un crash.
 *
 * Bump 9 → 10 (OLA BA, FRENTE BA1): cada `PatternHypothesis` que viaja adentro
 * de `FileFacts.findings[].hypotheses` gana `layer` — patrón de diseño o
 * familia de refactorización (`hypotheses/types.ts#HypothesisLayer`), estampado
 * por `hypotheses/run.ts` desde el `HypothesisBuilder.layer` del builder que la
 * produjo. Una fila vieja cacheada trae hipótesis SIN capa; ese es exactamente
 * el caso en el que un campo declarado obligatorio en `shared/types.ts`
 * (`CodeFindingHypothesis.layer`) llegaría `undefined` al panel — la clase de
 * "ausencia leída como dato" que este contador existe para evitar. Con el bump,
 * ninguna hipótesis sin capa sobrevive a un re-análisis, así que el campo
 * obligatorio es CIERTO y no una promesa. El bump fuerza un re-análisis, no un
 * crash.
 */
export const FACTS_SCHEMA_VERSION = 10;

/**
 * The per-file fact: everything `crossAnalyze` needs from one file, and
 * nothing that cannot survive `JSON.parse(JSON.stringify(...))` — no
 * tree-sitter node, no `Set` (`DerivedNodeSets` is intentionally NOT a field
 * here; it is re-derived per process by `resolveLanguage`, which already
 * caches it). A contract test round-trips a real one through JSON to hold
 * this line.
 */
export interface FileFacts {
  readonly schemaVersion: number;
  /** Repo-relative path. Key, together with `contentHash`, for the cache. */
  readonly path: string;
  /** Content hash the caller keyed this by — opaque to this module. */
  readonly contentHash: string;
  readonly language: string;
  readonly lines: number;
  readonly functions: readonly FunctionInfo[];
  /** Clone candidates from JUST this file; duplication groups are cross-file, resolved in `crossAnalyze`. */
  readonly clones: readonly CloneCandidate[];
  /** F3 — el grafo de código: unidades DECLARADAS en este archivo (`graph/symbols.ts`, dueño distinto esta ola). */
  readonly symbols: readonly SymbolFacts[];
  /** F3 — el grafo de código: candidatos a referencia de este archivo (`graph/references.ts`, dueño distinto esta ola). */
  readonly references: readonly ReferenceFacts[];
  /**
   * F4 — hallazgos `intra-function`/`intra-file` de ESTE archivo, del
   * registro de detectores (`detect/run.ts`), SIN PODAR: `withRuleOfThree`
   * (que cuenta ocurrencias de patrón en TODO el repo) corre en
   * `crossAnalyze`, sobre la lista concatenada de todos los archivos — un
   * hallazgo guardado ya podado acá daría un resultado distinto según qué
   * archivos vinieran de caché (CONTRATO-F4.md §1.3).
   */
  readonly findings: readonly Finding[];
  /** F4 — una fila por (detectorId, scope) evaluado sobre este archivo. */
  readonly coverage: readonly DetectorCoverage[];
  /**
   * P5-ARISTAS — salida CRUDA (sin resolver) de los 5 `EDGE_EXTRACTORS`
   * cableados (`graph/edges/warmup.ts`, dueño de esta tarea) para ESTE
   * archivo: `herencia`/`imports`/`instanciacion`/`interfaz-declarada`/
   * `mixes-in`. `interfaz-estructural` (arista `satisfies`) queda afuera —
   * ver el docstring de `warmup.ts` para el porqué exacto (colisión medida
   * de doble bootstrap de `web-tree-sitter`). `crossAnalyze` sólo CONCATENA
   * esto en `GraphFileFacts.edges`, que `graph/build.ts` ya sabía traducir
   * desde la Ola 5 (`resolveTypedEdgesForFiles`/`resolveImportEdges`) — el
   * campo llegaba `undefined` SIEMPRE en producción hasta esta tarea.
   */
  readonly edges: readonly EdgeFacts[];
  /**
   * P3 — CONTRATO-F9.md §3.3 forma 2, `graph/edges/portador.ts`. Literales
   * function-like SIN nombre propio de ESTE archivo (`extractCarrierFacts`,
   * puro, sobre el mismo árbol vivo que `symbols`/`references`/`edges`
   * arriba). `graph/build.ts` ya sabía traducir este campo con
   * `materializeCarrierFacts` desde la Ola 9 (`GraphFileFacts.carrierFacts`,
   * opcional) — llegaba `undefined` SIEMPRE en producción porque
   * `crossAnalyze` armaba `GraphFileFacts` sin este campo; cableado acá.
   */
  readonly carrierFacts: readonly CarrierFact[];
  /**
   * `invokes-indirect`, generalización del receptor (Go) —
   * `graph/edges/invocacion-indirecta.ts`, ver "GENERALIZACIÓN DEL
   * RECEPTOR" en su docstring: un método cuyo nodo function-like declara su
   * propio receptor EXPLÍCITO (campo `receiver`, distinto de `parameters` —
   * hoy sólo Go). `extractReceiverFacts` es pura, sobre el MISMO árbol vivo
   * que `symbols`/`references`/`carrierFacts` arriba. `graph/build.ts` ya
   * sabe traducir este campo (`GraphFileFacts.receivers`, opcional) — sin
   * cablear acá llegaría `undefined` siempre en producción, mismo hueco que
   * `carrierFacts` tenía antes de la Ola 9.
   */
  readonly receivers: readonly ReceiverFact[];
}

/** The persistent per-file cache `AnalyzeOptions.incremental` plugs in — see its docstring. */
export interface IncrementalFactsCache {
  /** A cached `FileFacts` for this exact `(path, contentHash)`, or `undefined` on any miss. */
  get(path: string, contentHash: string): FileFacts | undefined;
  /** Called once per file `analyzeFile` just computed fresh, so the caller can persist it. */
  put(fact: FileFacts): void;
}

/** Lo que `AnalyzeOptions.intraGraphCache` guarda/devuelve por archivo — ver su docstring. */
export interface IntraGraphCacheEntry {
  readonly findings: readonly Finding[];
  readonly coverage: readonly DetectorCoverage[];
}

export interface AnalyzeFileInput {
  readonly dir: string;
  /** Repo-relative path. */
  readonly path: string;
  /** If the caller already knows it (e.g. from `gitContentSignature`); otherwise hashed from content. */
  readonly contentHash?: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * LA UNIFICACIÓN — Ola N, frente U1: AST vivo y grafo a la vez
 *
 * EL PROBLEMA, que es de ORDEN y no de un campo que falte. `analyzeFile`
 * corre los detectores `intra-function`/`intra-file` por archivo, sobre el
 * árbol que `walkFile` acaba de recorrer, y lo libera (`tree.delete()`) antes
 * de devolver. El grafo del repo (`crossAnalyze`, `buildGraphIncremental`) no
 * puede existir en ese momento: se arma de los `FileFacts` de TODOS los
 * archivos. Cuando existe, ya no queda un solo árbol vivo. Los dos NUNCA
 * coexistían para un detector `intra-*`.
 *
 * EL ARREGLO, en dos pasadas complementarias:
 *   1. `analyzeFile` corre los `intra-*` que NO piden grafo — igual que
 *      siempre, mismo lugar, mismo costo, y su resultado sigue entrando al
 *      caché incremental por archivo (`FileFacts.findings`).
 *   2. `crossAnalyze`, DESPUÉS de construir el grafo, reparsea bajo demanda
 *      (`resolveLiveFileUnit`, que ya existía desde R1) los archivos de los
 *      lenguajes que importan, un árbol vivo por vez, y corre ahí los
 *      `intra-*` que SÍ piden grafo, con `ctx.graph` no nulo.
 *
 * POR QUÉ REPARSEAR Y NO OTRA COSA — las tres alternativas que el frente tenía
 * que descartar por escrito:
 *   - MANTENER LOS ÁRBOLES VIVOS hasta `crossAnalyze`: descartada sin medir
 *     más. Es exactamente lo que el diseño actual evita, y ya hay una medición
 *     en el árbol (docstring de `resolveLiveFileUnit`) de que mantener vivos
 *     SÓLO los archivos que toca la evidencia `inter-file` (78-92 archivos)
 *     sube el pico de RSS +16 %/+33 %; mantener los MILES de un repo entero es
 *     otra escala, y una corrida en paralelo ya llevó la memoria a 14,5 GB de
 *     15,7 y systemd mató el servicio del usuario.
 *   - REORDENAR PARA QUE EL GRAFO SE PUEDA CONSTRUIR ANTES: imposible sin
 *     cambiar qué es el grafo. `buildGraphIncremental` resuelve referencias
 *     CONTRA los símbolos de los demás archivos; el primer archivo del repo no
 *     puede tener su grafo hasta que el último aportó sus símbolos. No es una
 *     cuestión de orden de llamadas sino de dependencia de datos.
 *   - ACOTAR EL CONJUNTO REPARSEADO a "los archivos donde ya hay candidatos":
 *     descartada por INCORRECTA, no por cara. La unificación existe para que
 *     un detector pueda SUMAR hallazgos que hoy no ve (ésa es la razón por la
 *     que se descartó la compuerta diferida, que sólo puede restar); un
 *     hallazgo nuevo puede nacer en un archivo donde hoy no hay ninguno, así
 *     que ese criterio produciría falsos negativos SILENCIOSOS — peor que el
 *     falso positivo que combatimos. El único acotamiento que se aplica es
 *     COMPLETO y demostrable: se saltean los lenguajes para los que TODO
 *     detector que optó falla el gate de `needs` (capacidad de lenguaje), que
 *     es el mismo gate que `runPerLanguage` ya aplicaría para no correrlos —
 *     saltearlos no puede perder un hallazgo porque en esos archivos ningún
 *     detector de la pasada 2 llegaría a correr.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * EL INTERRUPTOR DE VUELTA ATRÁS, palabras del usuario: *"en el peor de los
 * casos si empeora al unificarlas podemos seguir con el comportamiento
 * actual"*. `CK_ANALISIS_DOS_PASADAS=0` (también `off`/`false`/`no`) devuelve
 * el pipeline de UNA pasada, exacto: `analyzeFile` corre TODOS los `intra-*`
 * (no pasa `intraPass`, así que el runner no particiona) y `crossAnalyze` no
 * monta la pasada 2 — ni reparseo, ni índice de grafo, ni llamada extra.
 *
 * Mismo espíritu y mismo vocabulario de valores que el `CK_ANALYSIS_CACHE=0`
 * que ya existe (`analyze-cache.ts`). Se lee en CADA llamada, no al cargar el
 * módulo, para que un test pueda ponerlo y sacarlo sin recargar módulos.
 *
 * Un detector `intra-*` que declaró `needsGraph` NO se apaga con el
 * interruptor: corre en la pasada 1 con `ctx.graph === null`, que es
 * literalmente lo que le pasaba antes de esta ola. Ver
 * `detect/types.ts#IntraGraphOptIn` para por qué el opt-in intra es ruteo y no
 * compuerta.
 */
export function dosPasadasHabilitado(): boolean {
  const raw = process.env.CK_ANALISIS_DOS_PASADAS;
  if (raw === undefined) return true;
  return !["0", "off", "false", "no"].includes(raw.trim().toLowerCase());
}

/**
 * OLA V (frente V1) — el interruptor FINO de la pasada de grafo de las
 * HIPÓTESIS (`crossAnalyze`, `hypotheses/run.ts#rebuildHypothesesWithGraph`).
 *
 * POR QUÉ EXISTE SIENDO QUE YA HAY UNO. `CK_ANALISIS_DOS_PASADAS=0` sigue
 * apagando TODO lo que es "segunda pasada" — es la promesa de la Ola N ("el
 * pipeline de UNA pasada, exacto"), y apagar los detectores `intra-*` con
 * grafo mueve el NIVEL 1. Este segundo interruptor apaga SÓLO las hipótesis,
 * dejando los detectores intactos, y por lo tanto es el único modo de medir
 * el efecto de este mecanismo sobre el nivel 2 SIN mover el nivel 1 al mismo
 * tiempo. No es un lujo: siete frentes editan el mismo árbol en una ola, y un
 * A/B "antes del cambio / después del cambio" separado por media hora de
 * reloj mezcla el efecto propio con el de cualquier otro frente que haya
 * tocado un `<patron>.ts` en el medio (medido en esta misma ola: entre mis
 * dos volcados de `corpus/click` cambiaron `command.ts` e `iterator.ts`, y la
 * única diferencia del volcado era de ELLOS). Con este interruptor el A/B es
 * dentro del MISMO proceso y sobre el MISMO árbol — ver `scripts/v1-ab.mts`.
 *
 * Los dos interruptores se leen en AND: `CK_ANALISIS_DOS_PASADAS=0` apaga
 * también esto (la promesa de la Ola N se mantiene entera). Mismo vocabulario
 * de valores y misma disciplina de lectura por llamada, no al cargar el
 * módulo.
 */
export function hipotesisConGrafoHabilitado(): boolean {
  const raw = process.env.CK_HIPOTESIS_CON_GRAFO;
  if (raw === undefined) return true;
  return !["0", "off", "false", "no"].includes(raw.trim().toLowerCase());
}

/**
 * F4 — hace un `Finding` seguro para guardar en `FileFacts`. Dos problemas
 * reales, encontrados corriendo `facts/types.test.ts` al cablear esta tarea
 * (CONTRATO-F4.md §1.2 daba el round-trip por verificado y no lo estaba):
 *
 *  1. `Measurement.threshold` es un `Threshold` (`detect/thresholds.ts`)
 *     marcado con un `Symbol` NO exportado en runtime (para que sólo
 *     `resolveThreshold` pueda construirlo) — ese `Symbol` no sobrevive
 *     `JSON.stringify` (se descarta en silencio, sin tirar), así que
 *     guardar el objeto TAL CUAL rompía la igualdad profunda del round-trip.
 *  2. `detect/run.ts` resuelve el `Threshold` de un detector UNA vez por
 *     (detector, lenguaje) y REUSA el mismo objeto para cada función/archivo
 *     de esa corrida — así que el MISMO objeto aparecía repetido en varios
 *     `Finding`s de un archivo con más de una función que dispara el mismo
 *     detector, lo que el test "sin Sets/funciones" (que sólo compara
 *     identidad de objeto, sin trackear el camino) leía como una referencia
 *     cíclica.
 *
 * Copiar cada `Threshold` a un objeto plano NUEVO, por hallazgo, resuelve
 * ambos: sin el `Symbol`, y sin la identidad compartida.
 */
function toStorableFinding(finding: Finding): Finding {
  const trigger = finding.trigger.map((m) => ({
    label: m.label,
    value: m.value,
    // `detail` (`ThresholdProvenance`) va copiado TAMBIÉN — es su propio
    // objeto compartido por `resolveThreshold`, no sólo el `Threshold` que
    // lo envuelve; sin este segundo `{ ...spread }` el shared-reference
    // seguía viajando un nivel más adentro.
    threshold: { value: m.threshold.value, kind: m.threshold.kind, label: m.threshold.label, detail: { ...m.threshold.detail } },
  })) as [Measurement, ...Measurement[]];
  return { ...finding, trigger };
}

/**
 * Analyse ONE file: resolve its language, read, parse and walk the tree —
 * exactly what `analyzeRepo`'s loop did per file before this split, with the
 * same isolation contract (a pathological file costs only itself). Returns
 * `null` for exactly the cases the old loop's `continue`d: unresolved
 * extension/language, unreadable file, empty source, a parse or walk failure.
 */
export async function analyzeFile(input: AnalyzeFileInput): Promise<FileFacts | null> {
  const decl = BY_EXTENSION.get(path.extname(input.path).toLowerCase());
  if (!decl) return null;
  const language = await resolveLanguage(decl);
  if (!language) return null;
  const { parser, spec } = language;

  let source: string;
  try {
    source = await fs.readFile(path.join(input.dir, input.path), "utf8");
  } catch {
    return null;
  }
  if (spec.extractScript) {
    const script = spec.extractScript(source);
    if (script === null) return null;
    source = script;
  }
  if (source.length === 0) return null;

  let tree;
  try {
    tree = parser.parse(source);
  } catch {
    return null;
  }

  const functions: FunctionInfo[] = [];
  const clones: CloneCandidate[] = [];
  // F4 — el `AstNode` de cada función, en el MISMO recorrido y el MISMO
  // orden que `functions` (índice a índice): lo que `facts/units.ts#buildFileUnit`
  // necesita para armar `FunctionUnit.node`/`.name` sin un segundo walk.
  const functionNodes: AstNode[] = [];
  try {
    await walkFile(tree.rootNode, spec, input.path, functions, clones, functionNodes);
  } catch {
    tree.delete?.();
    return null;
  }

  // F3 — el grafo de código (`graph/build.ts`, otra tarea de esta ola)
  // necesita los símbolos DECLARADOS y los candidatos a referencia de CADA
  // archivo para armar sus nodos "symbol" y sus aristas "references".
  // Calculado acá, sobre el MISMO árbol que `walkFile` ya recorrió (antes de
  // `tree.delete()`), para no volver a parsear — y guardado en `FileFacts`
  // para que un archivo sin cambios sirva estos campos desde el caché de F2/
  // F3 en vez de re-extraerlos. `extractSymbols`/`extractReferences` son
  // puras y síncronas (mismo contrato que `deriveNodeSets`), así que esto no
  // añade ninguna nueva pausa asíncrona al walk — sólo tiempo de CPU, medido
  // en el reporte de esta tarea. Aislado con su propio try/catch, mismo
  // criterio que las oportunidades más abajo: un fallo acá no debe tirar
  // abajo lo que `walkFile` ya recolectó.
  let symbols: readonly SymbolFacts[] = [];
  let references: readonly ReferenceFacts[] = [];
  try {
    const astRoot = tree.rootNode as unknown as AstNode;
    symbols = extractSymbols(astRoot, spec);
    references = extractReferences(astRoot, spec);
  } catch {
    /* este archivo no aporta hechos de grafo; functions/clones arriba siguen en pie. */
  }

  const lines = source.split("\n").length;

  // F4 — enciende el registro de detectores (`detect/run.ts`, 19 detectores)
  // para ESTE archivo: los scopes `intra-function`/`intra-file` leen el
  // árbol VIVO (`fn.node`/`file.root`), así que corren ACÁ, antes de
  // `tree.delete()` — nunca en `crossAnalyze`, que sólo ve el `FileFacts` ya
  // serializado de cada archivo (CONTRATO-F4.md §1.1). `repo` va vacío a
  // propósito: con `scopes` restringido a los dos intra-*, ningún detector
  // de esta corrida lee `input.repo` (`runPerLanguage` no lo toca), así que
  // no hace falta — ni sería correcto — construir un `RepoUnit` real acá.
  // Aislado con su propio try/catch, misma disciplina que `walkFile`/las
  // oportunidades: un detector que explota pierde SUS hallazgos de este
  // archivo, nunca las funciones/clones/símbolos ya recolectados arriba.
  let findings: readonly Finding[] = [];
  let coverage: readonly DetectorCoverage[] = [];
  try {
    const fileUnit = buildFileUnit(tree.rootNode as unknown as AstNode, spec, input.path, lines, functions, functionNodes);
    const registryResult = await runDetectors({
      repo: { repoName: "", files: [], functions: [], clones: [], graph: null },
      languages: new Map([[spec.id, { capabilities: language.capabilities, sets: spec }]]),
      benchmarks: null,
      files: [fileUnit],
      scopes: ["intra-function", "intra-file"],
      // LA UNIFICACIÓN — PASADA 1. Con las dos pasadas habilitadas, acá
      // corren SÓLO los `intra-*` que no pidieron grafo: los que sí lo
      // pidieron los corre `crossAnalyze` después de construirlo (pasada 2),
      // y la partición es lo que garantiza que ninguno corra dos veces.
      // Con el interruptor de vuelta atrás puesto, este campo va `undefined`
      // y el runner no particiona: corren todos acá, como antes de la ola.
      intraPass: dosPasadasHabilitado() ? "solo-sin-grafo" : undefined,
    });
    // P2 — cuelga hipótesis de patrón (`hypotheses/run.ts`) ACÁ, sobre
    // `fileUnit` mientras su árbol SIGUE VIVO (antes de `tree.delete()`, más
    // abajo): el ÚNICO momento en que `ctx.file`/`ctx.fileAt(esta ruta)` de
    // `attachHypotheses` pueden ser no-null en producción — hasta esta tarea
    // eran SIEMPRE `null` (`hypotheses/run.ts` nunca recibía `files`, ver su
    // docstring). Corre sobre `registryResult.findings` (los objetos VIVOS,
    // antes de `toStorableFinding`) porque `attachHypotheses` muta
    // `finding.hypotheses` in-place — `toStorableFinding` copia con
    // `{...finding}`, así que la hipótesis ya adjuntada viaja con la copia
    // sin tocar esa función. `repo`/`languages` son los mismos vacíos que ya
    // usa `runDetectors` arriba: `repo.graph` es `null` acá (el grafo del
    // repo se arma recién en `crossAnalyze`) — ninguna de las hipótesis
    // ancladas en un `Finding` `intra-function`/`intra-file` de HOY lee
    // `repo.graph` (usan `ctx.file`, no el grafo); `crossAnalyze` sigue
    // siendo dueño de las ancladas en un `Finding` `inter-file`, que sí lo
    // necesitan. Aislado en su propio try/catch, misma disciplina que el
    // resto de este método: un builder de hipótesis que explota pierde SUS
    // hipótesis, nunca los `findings` ya detectados arriba.
    try {
      attachHypotheses({
        findings: registryResult.findings,
        repo: { repoName: "", files: [], functions: [], clones: [], graph: null },
        languages: new Map([[spec.id, { capabilities: language.capabilities, sets: spec }]]),
        files: [fileUnit],
      });
    } catch {
      /* ninguna hipótesis se cuelga para este archivo; los findings de arriba siguen en pie. */
    }
    findings = registryResult.findings.map(toStorableFinding);
    coverage = registryResult.coverage;
  } catch {
    /* este archivo no aporta hallazgos del registro; lo ya recolectado arriba sigue en pie. */
  }

  // P5-ARISTAS — enciende el lado PRODUCTOR de los 5 `EDGE_EXTRACTORS`
  // cableados (`graph/edges/warmup.ts`, dueño de esta tarea) para ESTE
  // archivo: igual que `findings` arriba, corren ACÁ, sobre el árbol VIVO
  // (`fileUnit.root`), antes de `tree.delete()` — nunca en `crossAnalyze`.
  // `parser` es el MISMO que ya resolvió `resolveLanguage` (sin segundo
  // bootstrap de `web-tree-sitter`: `warmUp*` sólo parsea la fuente
  // centinela de cada extractor, ~1-10 líneas, con este parser ya cargado).
  // Aislado en su propio try/catch, misma disciplina que `findings`/
  // `symbols` arriba: un extractor que explota pierde SUS aristas de este
  // archivo, nunca lo ya recolectado.
  let edges: readonly EdgeFacts[] = [];
  try {
    const fileUnitForEdges = buildFileUnit(tree.rootNode as unknown as AstNode, spec, input.path, lines, functions, functionNodes);
    edges = extractEdgeFacts(fileUnitForEdges, parser, spec.classNodes, language.capabilities);
  } catch {
    /* este archivo no aporta aristas tipadas; lo ya recolectado arriba sigue en pie. */
  }

  // P3 — CONTRATO-F9.md §3.3 forma 2: `extractCarrierFacts` es pura y
  // síncrona (mismo contrato que `extractSymbols`/`extractReferences` más
  // arriba), sobre el MISMO árbol vivo, antes de `tree.delete()`. `spec`
  // satisface `DerivedNodeSets` (misma firma que ya usan `symbols`/
  // `references`). Aislado en su propio try/catch, misma disciplina que
  // `edges` arriba: un fallo acá pierde SÓLO los portadores de este
  // archivo, nunca lo ya recolectado.
  let carrierFacts: readonly CarrierFact[] = [];
  try {
    carrierFacts = extractCarrierFacts(tree.rootNode as unknown as AstNode, spec);
  } catch {
    /* este archivo no aporta portadores; lo ya recolectado arriba sigue en pie. */
  }

  // `invokes-indirect`, generalización del receptor (Go) — mismo momento,
  // mismo árbol vivo, misma disciplina de aislamiento que `carrierFacts`
  // arriba: un fallo acá pierde SÓLO los receptores explícitos de este
  // archivo, nunca lo ya recolectado.
  let receivers: readonly ReceiverFact[] = [];
  try {
    receivers = extractReceiverFacts(tree.rootNode as unknown as AstNode, spec);
  } catch {
    /* este archivo no aporta receptores explícitos; lo ya recolectado arriba sigue en pie. */
  }

  tree.delete?.();

  return {
    schemaVersion: FACTS_SCHEMA_VERSION,
    path: input.path,
    contentHash: input.contentHash ?? hashOf(source),
    language: spec.id,
    lines,
    functions,
    clones,
    symbols,
    references,
    findings,
    coverage,
    edges,
    carrierFacts,
    receivers,
  };
}

/** Un `FileUnit` vivo, más el modo de liberar su árbol nativo — ver `resolveLiveFileUnit`. */
export interface LiveFileUnit {
  readonly unit: FileUnit;
  /** Libera el árbol de tree-sitter (`tree.delete()`) — mismo `?.()` opcional que el resto de este archivo ya usa; llamarlo es responsabilidad del caller UNA vez que terminó de usar `unit`. */
  release(): void;
}

/**
 * R1 (`RAICES.md`) — reparseo BAJO DEMANDA de un único archivo, fuera del
 * loop principal de `analyzeRepo`. Existe para que `crossAnalyze` pueda darle
 * a una hipótesis `ctx.fileAt(path)` con árbol VIVO para un archivo puntual
 * de su EVIDENCIA (un `Finding` `inter-file`), sin volver a mantener TODOS
 * los árboles del repo vivos a la vez — la raíz de R1 era precisamente que
 * `analyzeFile` libera el árbol de CADA archivo antes de que exista
 * `crossAnalyze`, así que ninguna hipótesis cuya evidencia cruza archivos
 * podía leer código. La variante elegida (de las dos que `RAICES.md` deja
 * abiertas) es ésta — reparsear bajo demanda — en vez de mantener TODO vivo
 * hasta `crossAnalyze`.
 *
 * COSTO REAL, MEDIDO POR EL INTEGRADOR DE LA OLA D (no estimado). La versión
 * original de esta nota decía "el costo es tiempo …, nunca memoria (nunca hay
 * más que unos pocos árboles vivos a la vez)". Lo segundo es FALSO y hay que
 * decirlo: `crossAnalyze` reparsea el conjunto ENTERO de `locations[].file`
 * de todos los `Finding` `inter-file` de la corrida ANTES de llamar a
 * `attachHypotheses`, y recién los libera en el `finally` — así que la cota
 * de árboles vivos simultáneos es el TAMAÑO DE ESE CONJUNTO, no "unos pocos".
 * Medido: 78 archivos vivos a la vez sobre el Rails de 466 (380 analizados) y
 * 92 sobre `src/` (178 analizados) — es decir O(archivos tocados por la
 * evidencia), que en el peor caso (un repo donde la duplicación cruzada toca
 * casi todo) tiende a O(archivos del repo), exactamente la forma que esta
 * variante decía evitar.
 *
 * En números absolutos, hoy, sigue siendo barato — pico de RSS del proceso
 * completo, mismo comando, mismo equipo, árbol pre-R1 contra árbol post-R1:
 * Rails 227 MB → 264 MB (+16 %), `src/` 251 MB → 334 MB (+33 %); en tiempo,
 * Rails 7,1 s → 8,0 s y `src/` 11,5 s → 12,9 s (+12 % / +12 %). Aceptable en
 * estas dos poblaciones, y por eso la variante se deja como está — pero la
 * cota es lineal en la evidencia, no constante. Si alguna vez se analiza un
 * repo mucho más grande y la memoria aprieta, el arreglo natural es
 * reparsear por LOTES (o por `Finding`, liberando entre uno y otro) en vez de
 * juntar todo el conjunto primero; no hace falta cambiar el diseño, sólo el
 * `for` de `crossAnalyze`.
 *
 * Mismo camino que la primera mitad de `analyzeFile` (resolver lenguaje,
 * leer, `extractScript`, parsear, `walkFile`, `buildFileUnit`) —
 * DUPLICADO A PROPÓSITO, no extraído a un helper compartido con
 * `analyzeFile`: esta función NO calcula `findings`/`coverage`/`edges`/
 * `carrierFacts`/`clones` (nada de lo que `FileFacts` necesita para el caché
 * incremental por contenido) — sólo la `FileUnit` viva que una hipótesis
 * necesita para mirar AST. Mezclar los dos caminos arriesgaría que un cambio
 * pensado para el camino de caché (`analyzeFile`, que sí persiste su
 * resultado) rompiera silenciosamente este camino efímero, o viceversa.
 * Devuelve `null` en los MISMOS casos que `analyzeFile`: extensión no
 * reconocida, lenguaje no resoluble, archivo no legible, fuente vacía, fallo
 * de parseo o de `walkFile` — nunca lanza.
 */
export async function resolveLiveFileUnit(dir: string, relPath: string): Promise<LiveFileUnit | null> {
  const decl = BY_EXTENSION.get(path.extname(relPath).toLowerCase());
  if (!decl) return null;
  const language = await resolveLanguage(decl);
  if (!language) return null;
  const { parser, spec } = language;

  let source: string;
  try {
    source = await fs.readFile(path.join(dir, relPath), "utf8");
  } catch {
    return null;
  }
  if (spec.extractScript) {
    const script = spec.extractScript(source);
    if (script === null) return null;
    source = script;
  }
  if (source.length === 0) return null;

  let tree;
  try {
    tree = parser.parse(source);
  } catch {
    return null;
  }

  const functions: FunctionInfo[] = [];
  const clones: CloneCandidate[] = [];
  const functionNodes: AstNode[] = [];
  try {
    await walkFile(tree.rootNode, spec, relPath, functions, clones, functionNodes);
  } catch {
    tree.delete?.();
    return null;
  }

  const lines = source.split("\n").length;
  const unit = buildFileUnit(tree.rootNode as unknown as AstNode, spec, relPath, lines, functions, functionNodes);
  return { unit, release: () => tree.delete?.() };
}

export interface CrossInput {
  readonly repoName: string;
  /** R1 — para que `crossAnalyze` pueda reparsear bajo demanda (`resolveLiveFileUnit`) los archivos que la evidencia `inter-file` de esta corrida toca. `analyzeRepo` lo reenvía desde `opts.dir`. */
  readonly dir: string;
  /** Every file `collectFiles` saw, analysable or not. */
  readonly scannedFiles: number;
  /** Ordered by `path.localeCompare` — the same order `collectFiles` returns. Output order depends on this. */
  readonly facts: readonly FileFacts[];
  readonly limits?: AnalyzeLimits;
  /** DEFECTO A1 — ver el docstring de `AnalyzeOptions.graphCache`; `analyzeRepo` sólo lo reenvía. */
  readonly graphCache?: AnalyzeOptions["graphCache"];
  /** N13 — ver el docstring de `AnalyzeOptions.intraGraphCache`; `analyzeRepo` sólo lo reenvía. */
  readonly intraGraphCache?: AnalyzeOptions["intraGraphCache"];
  /** DEFECTO A1 — ver el docstring de `AnalyzeOptions.onGraph`; `analyzeRepo` sólo lo reenvía. */
  readonly onGraph?: AnalyzeOptions["onGraph"];
  /** INTEGRACIÓN Ola 6 — ver el docstring de `AnalyzeOptions.onPreCapFindings`; `analyzeRepo` sólo lo reenvía. */
  readonly onPreCapFindings?: AnalyzeOptions["onPreCapFindings"];
}

/**
 * F4 — agrega las filas de cobertura POR ARCHIVO (`analyzeFile` corre un
 * detector `intra-*` una vez por cada archivo de su lenguaje) en UNA fila
 * por `(detectorId, language)`: suma `unitsConsidered`/`findings`, resuelve
 * el `status` por precedencia y une `missingCapabilities` — CONTRATO-F4.md
 * §1.7. Las filas `inter-file` (hoy: sólo `duplication`, sin `language`)
 * pasan derecho, una sola fila cada una.
 *
 * NO sintetiza filas "no-aplicable" para un lenguaje que el repo no tiene
 * NINGÚN archivo — eso es trabajo de la pantalla "Qué no estamos viendo"
 * (F4 §1.7/W3), no de esta agregación puramente aditiva.
 */
/**
 * N13 — huella barata y determinista del `CodeGraph` COMPLETO: todos los ids
 * de nodo + todas las aristas (`kind`/`from`/`to`), en el orden en que
 * `graph/build.ts` ya los deja (estable — `census.ts` ya depende de eso para
 * que el censo sea reproducible). Nunca `JSON.stringify` del grafo entero:
 * en un repo grande son decenas de miles de nodos/aristas, y eso pagaría por
 * campos que ningún consumidor de la pasada 2 lee (`startLine`/`endLine`/
 * `family`…) — sólo la IDENTIDAD del nodo y la FORMA de la arista deciden lo
 * que un detector `needsGraph` puede llegar a responder, así que sólo eso
 * entra al hash. Usada exclusivamente por `AnalyzeOptions.intraGraphCache`
 * (ver su docstring) — nadie más la llama.
 */
function computeGraphFingerprint(graph: CodeGraph): string {
  const hash = crypto.createHash("sha256");
  for (const n of graph.nodes) hash.update(n.id).update("");
  hash.update("");
  for (const e of graph.edges) hash.update(e.kind).update("").update(e.from).update("").update(e.to).update("");
  return hash.digest("hex");
}

function aggregateCoverage(rows: readonly DetectorCoverage[]): DetectorCoverage[] {
  const statusRank: Record<CoverageStatus, number> = {
    error: 0,
    "presupuesto-agotado": 1,
    "no-aplicable": 2,
    "sin-grafo": 3,
    "sin-aristas": 4,
    "sin-metricas": 5,
    corrio: 6,
  };
  const byKey = new Map<string, DetectorCoverage>();
  const order: string[] = [];

  for (const row of rows) {
    const key = `${row.detectorId}|${row.language ?? ""}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row, missingCapabilities: row.missingCapabilities ? [...row.missingCapabilities] : undefined });
      order.push(key);
      continue;
    }
    existing.unitsConsidered += row.unitsConsidered;
    existing.findings += row.findings;
    if (statusRank[row.status] < statusRank[existing.status]) existing.status = row.status;
    if (row.missingCapabilities?.length) {
      existing.missingCapabilities = [...new Set([...(existing.missingCapabilities ?? []), ...row.missingCapabilities])];
    }
    if (row.error && !existing.error) existing.error = row.error;
  }

  return order.map((key) => byKey.get(key)!);
}

/**
 * OLA AX, FRENTE AX6 — EL CABLE QUE ESTABA CORTADO: `RepoUnit.functions`.
 *
 * `crossAnalyze` ya ACUMULA los `FunctionInfo` de todos los archivos desde su
 * primera línea (`functions.push(...fact.functions)`) y sin embargo armaba el
 * `RepoUnit` con `functions: []` HARDCODEADO — el arreglo acumulaba para
 * nadie. Consecuencia MEDIDA (Ola Z §Z5, Ola AW §AW4): `middle-man`
 * descartaba el 100 % de sus candidatos (`if (!fn) continue`) y llevaba
 * **0 hallazgos en 21 repos y 0 juicios jamás**, y la compuerta del
 * constructor de `modulo-envy` era INERTE en producción.
 *
 * POR QUÉ NO SE PODÍA ARMAR ANTES, Y POR QUÉ AHORA SÍ. `RepoFunctionUnit`
 * pide `symbolPath`, y `buildFileUnit` (`facts/units.ts`) lo deriva del
 * NOMBRE CRUDO del nodo (`node.childForFieldName("name")`), dato que
 * `FileFacts` no lleva: a nivel repo los árboles ya se liberaron y
 * `FunctionInfo.name` trae el centinela `"(anónima)"`. La salida es el
 * GRAFO, que sí lleva `symbolPath` por nodo: se empareja cada `FunctionInfo`
 * con su nodo `function-like` por `(file, startLine)` — el mismo
 * emparejamiento que la Ola Z ya verificó fuera de producción con **100 % de
 * coincidencia en 13 repos**. Así el id que sale de `symbolNodeId(fn.file,
 * fn.symbolPath)` es EXACTAMENTE el `node.id` del grafo, que es lo que
 * `middle-man#buildFunctionIndex` y `modulo-envy#moduleEnvyCandidates`
 * indexan.
 *
 * SIN GRAFO (o para una función que el grafo no declaró) se cae al
 * `symbolPath` sintáctico `[className, name]` —el MISMO que arma
 * `buildFileUnit`— con el centinela traducido a `null`, que es lo que el
 * contrato de `FunctionUnit.name` promete. Esa función no va a emparejar con
 * ningún nodo del grafo (y por eso ningún detector la va a proponer), pero SÍ
 * cuenta en el denominador por contenedor de `middle-man`, que recorre
 * `repo.functions` entero. Preferir el denominador COMPLETO a uno recortado
 * es deliberado: recortarlo INFLARÍA el ratio "contenedor dedicado" y bajaría
 * severidades por un artefacto del cableado.
 */
const NOMBRE_ANONIMO = "(anónima)";

function buildRepoFunctionUnits(
  functions: readonly FunctionInfo[],
  languageByFile: ReadonlyMap<string, string>,
  setsByLanguage: ReadonlyMap<string, DerivedNodeSets>,
  graph: CodeGraph | null,
): RepoFunctionUnit[] {
  // Nodos `function-like` del grafo indexados por `(archivo, línea de inicio)`.
  // Gana el PRIMERO: dos nodos con el mismo inicio son hermanos homónimos
  // (`@2`, `@3`…), que `middle-man` descarta igual por su propio criterio.
  const nodeByStart = new Map<string, CodeGraphNode>();
  if (graph) {
    for (const node of graph.nodes) {
      if (node.kind !== "symbol" || node.family !== "function-like") continue;
      if (node.startLine === undefined) continue;
      const key = `${node.file} ${node.startLine}`;
      if (!nodeByStart.has(key)) nodeByStart.set(key, node);
    }
  }

  const units: RepoFunctionUnit[] = [];
  for (const fn of functions) {
    const language = languageByFile.get(fn.file);
    if (language === undefined) continue;
    const sets = setsByLanguage.get(language);
    // Lenguaje que no resolvió parser/Sets: sin `DerivedNodeSets` no hay
    // `RepoFunctionUnit` honesta que construir (mismo criterio que
    // `languagesForDetectors` aplica más abajo para los detectores).
    if (sets === undefined) continue;

    const node = nodeByStart.get(`${fn.file} ${fn.startLine}`);
    const nombreSintactico = fn.name === NOMBRE_ANONIMO ? null : fn.name;
    const name = node ? (node.symbolPath[node.symbolPath.length - 1] ?? nombreSintactico) : nombreSintactico;
    const symbolPath = node ? node.symbolPath : [fn.className, name].filter((part): part is string => Boolean(part));

    // `FunctionMetrics` es `FunctionInfo` menos `name`/`file`/`startLine`/
    // `endLine` — el MISMO destructuring que `facts/units.ts#buildFileUnit`,
    // así que un campo nuevo en `FunctionInfo` viaja hasta acá solo.
    const { name: _centinela, file: _file, startLine: _startLine, endLine: _endLine, ...metrics } = fn;

    units.push({ file: fn.file, language, name, startLine: fn.startLine, endLine: fn.endLine, symbolPath, sets, metrics });
  }
  return units;
}

/**
 * Everything that needs to see every file's facts at once: duplication (a
 * fingerprint can match a file anywhere in the repo), the rule of three
 * (pattern occurrence counts are repo-wide), and the `inter-file` detectors
 * of the registry (F4 — today just `duplication`, reached through the SAME
 * registry path as every `intra-*` detector, not a second call). Nothing
 * here re-parses or re-reads disk — it only joins arrays `analyzeFile`
 * already built, which is why it is cheap (measured 0.36% of `analyzeRepo`'s
 * total cost on a 1977-file corpus).
 */
export async function crossAnalyze(input: CrossInput): Promise<CodeAnalysis> {
  const functions: FunctionInfo[] = [];
  const clones: CloneCandidate[] = [];
  const languages = new Set<string>();
  const summaries: CodeFileSummary[] = [];
  // F4 — `intra-function`/`intra-file` ya corrieron, por archivo, dentro de
  // `analyzeFile` (necesitan el árbol vivo): acá sólo se CONCATENAN.
  const perFileFindings: Finding[] = [];
  const perFileCoverage: DetectorCoverage[] = [];
  let totalLines = 0;

  for (const fact of input.facts) {
    functions.push(...fact.functions);
    clones.push(...fact.clones);
    perFileFindings.push(...fact.findings);
    perFileCoverage.push(...fact.coverage);
    languages.add(fact.language);
    totalLines += fact.lines;
    summaries.push({ path: fact.path, lines: fact.lines, language: fact.language });
  }

  // F4 — DEFECTO A1: `dependency-cycle`/`orphan-file`/`unused-symbol`
  // (`needsGraph: true`) necesitan un `CodeGraph` de verdad en `repo.graph`
  // para dejar de correr como `sin-grafo`. `graph/build.ts#buildGraphIncremental`
  // toma exactamente los 4 campos de `FileFacts` que ya tenemos (`path`,
  // `language`, `symbols`, `references` — `GraphFileFacts`), así que se arma
  // ACÁ, de lo que este mismo loop ya recolectó, sin re-parsear nada.
  // `input.graphCache` (ausente por defecto) es lo que permite a un caller
  // con memoria propia entre corridas (`code-inspector.ts`, por `repoKey`)
  // pedir un build INCREMENTAL en vez de frío — sin él, `previous`/`changed`
  // van `null` y `buildGraphIncremental` recalcula todo (mismo resultado que
  // `buildGraph`, sólo que troceado, nunca un bloqueo largo de un tirón).
  // Aislado en su propio try/catch, misma disciplina que el resto de este
  // archivo: si el build de grafo falla, los 3 detectores que lo necesitan
  // quedan `sin-grafo` (el runner ya sabe tratar `repo.graph === null`), pero
  // el resto de `crossAnalyze` (duplication, todo lo demás) sigue en pie.
  let graph: CodeGraph | null = null;
  try {
    const graphFiles: GraphFileFacts[] = input.facts.map((f) => ({
      path: f.path,
      language: f.language,
      symbols: f.symbols,
      references: f.references,
      // P5-ARISTAS — la línea exacta que faltaba desde la Ola 5: `f.edges`
      // ahora SÍ existe (`analyzeFile`, `graph/edges/warmup.ts`), así que
      // `graph/build.ts`'s traducción de aristas tipadas (lista desde esa
      // ola, siempre inerte por `f.edges` ausente) deja de ser un no-op.
      edges: f.edges,
      // P3 — misma brecha, mismo arreglo: `f.carrierFacts` ahora SÍ existe
      // (`analyzeFile`, `graph/edges/portador.ts`), así que
      // `graph/build.ts:463-464`'s `materializeCarrierFacts` (opcional desde
      // la Ola 9, siempre inerte por `f.carrierFacts` ausente) deja de ser
      // un no-op.
      carrierFacts: f.carrierFacts,
      // `invokes-indirect`, generalización del receptor (Go) — misma brecha,
      // mismo arreglo: `f.receivers` ahora SÍ existe (`analyzeFile`,
      // `graph/edges/invocacion-indirecta.ts#extractReceiverFacts`), así que
      // `deriveInvokesIndirectEdges` deja de ver este campo `undefined` para
      // Go (mismo hueco que `carrierFacts` tenía antes de la Ola 9).
      receivers: f.receivers,
    }));
    const t0 = performance.now();
    const built = await buildGraphIncremental(
      graphFiles,
      input.graphCache?.previous ?? null,
      input.graphCache?.changedPaths ?? null,
    );
    graph = built.graph;
    input.onGraph?.({ graph: built.graph, cache: built.cache, buildMs: performance.now() - t0 });
  } catch {
    /* sin grafo esta corrida: los 3 detectores `needsGraph` quedan `sin-grafo`, nada más se ve afectado. */
  }

  // F4 — `inter-file` (hoy: `duplication` + los 3 `needsGraph`) sobre el
  // `RepoUnit` armado con lo que este mismo loop ya recolectó.
  const languagesForDetectors = new Map<string, { capabilities: ReadonlySet<Capability>; sets: DerivedNodeSets }>();
  for (const lang of languages) {
    const resolvedLang = resolved.get(lang);
    if (resolvedLang) languagesForDetectors.set(lang, { capabilities: resolvedLang.capabilities, sets: resolvedLang.spec });
  }
  // F6 — reusado más abajo por `attachHypotheses`: el MISMO `RepoUnit` que ya
  // se arma para los detectores `inter-file`, sin reconstruirlo. `dir`
  // (Ola AW, frente AW6): campo OPCIONAL y ADITIVO — habilita el índice de
  // texto crudo del repo (`repo-name-index.ts`) que usan `unused-symbol` y
  // `orphan-file`; sin él el índice queda INERTE y esos dos detectores se
  // comportan exactamente como antes.
  //
  // OLA AX, FRENTE AX6 — POR QUÉ ESTE OBJETO SIGUE LLEVANDO `functions: []` Y
  // EL DE LA PASADA `inter-file` (más abajo) NO. `functions: []` estaba
  // HARDCODEADO acá y ese cero mataba a `middle-man` (0 hallazgos en 21
  // repos, 0 juicios jamás) y dejaba inerte la compuerta del constructor de
  // `modulo-envy`. El cable está arreglado — `buildRepoFunctionUnits` (arriba)
  // arma las unidades reales — pero se enchufa SÓLO en la pasada `inter-file`,
  // y esto NO es timidez: `repo.functions` lo leen también TRES hipótesis de
  // patrón (`hypotheses/null-object.ts:2009`, `hypotheses/factory-method.ts:554`
  // y `:571`, `hypotheses/builder.ts:749`), y los 17 patrones de diseño están
  // CONGELADOS esta ola con la consigna explícita de que su número no se mueva
  // (la Ola AW perdió 6 propuestas de `Null Object` sin que nadie lo viera).
  // Darles el dato a la vez que a los detectores mezclaría en una sola medición
  // el delta de nivel 1 —que es lo que este frente tiene que publicar kind por
  // kind— con un movimiento de nivel 2 que nadie autorizó. Alimentarlas es un
  // cambio de UNA línea (`functions: repoFunctions` acá) que queda declarado y
  // medible para la ola que decida abrir los patrones; hasta entonces esas tres
  // hipótesis ven exactamente lo que veían antes, byte por byte.
  const repoUnit = { repoName: input.repoName, dir: input.dir, files: summaries, functions: [], clones, graph };
  const repoFunctions = buildRepoFunctionUnits(
    functions,
    new Map(summaries.map((s) => [s.path, s.language] as const)),
    new Map([...languagesForDetectors].map(([lang, info]) => [lang, info.sets] as const)),
    graph,
  );

  // LA UNIFICACIÓN — PASADA 2 (Ola N, frente U1). Ver el bloque grande arriba
  // de `dosPasadasHabilitado` para el problema, el arreglo y las tres
  // alternativas descartadas por escrito.
  //
  // COSTO CERO CUANDO NADIE OPTÓ, que es el requisito duro 1 del frente:
  // `hasIntraGraphDetectors()` es `false` mientras ningún detector `intra-*`
  // declare `needsGraph`, y entonces este bloque entero es un `if` que no
  // entra — ni un reparseo, ni un índice de grafo, ni una llamada al runner.
  // Al aterrizar este frente ése es el estado: el volumen de hallazgos de un
  // repo tiene que ser IDÉNTICO al de antes del cambio.
  //
  // SIN GRAFO IGUAL SE CORRE: si `buildGraphIncremental` falló arriba,
  // `graph` es `null` y la pasada 2 corre lo mismo, con `ctx.graph === null`.
  // Apagarla ahí escondería el detector entero por un fallo de
  // infraestructura, y esconder un detector está prohibido en esta ola; el
  // detector degrada solo (ver `detect/types.ts#IntraGraphOptIn`).
  //
  // EL ÍNDICE DEL GRAFO SE CONSTRUYE UNA VEZ, acá, y se le pasa al runner en
  // cada archivo: construirlo es O(nodos+aristas) y hacerlo por archivo sería
  // O(archivos × aristas).
  //
  // QUÉ NO ENTRA A `FileFacts.findings` (el caché incremental de la PASADA
  // 1), y por qué está bien: estos hallazgos dependen del grafo del repo
  // ENTERO, y `FileFacts` está clavado por `(path, contentHash)` de UN
  // archivo — un cambio en otro archivo puede mover el grafo y por lo tanto
  // este hallazgo, sin mover el hash de éste. Guardarlos ahí sería servir un
  // hallazgo caduco.
  //
  // N13 — lo que SÍ existe, `input.intraGraphCache` (`AnalyzeOptions`, ver su
  // docstring): un caché SEPARADO, clavado por `(contentHash del archivo,
  // huella del grafo COMPLETO)` — nunca por archivo solo, por la misma razón
  // de arriba, pero la huella del grafo completo como segunda mitad de la
  // clave lo hace SEGURO: si el grafo se movió (en cualquier archivo), la
  // huella cambia y el caché de CADA archivo se invalida con él; si no se
  // movió, ningún archivo necesita reparsearse. MEDIDO (informe de esta
  // ola): sin este caché, la pasada 2 reparsea y re-detecta TODOS los
  // archivos que aplican en CADA corrida — el costo real dentro del
  // consumidor de producción, `code-inspector.ts`, el único que lo setea.
  // Ausente (todo lo demás: `census.ts`, todo test) ⇒ cero costo, mismo
  // comportamiento de siempre.
  const findingsConGrafo: Finding[] = [];
  const coverageConGrafo: DetectorCoverage[] = [];
  if (dosPasadasHabilitado() && hasIntraGraphDetectors()) {
    const optaronPorGrafo = allDetectors().filter((d) => d.scope !== "inter-file" && d.needsGraph === true);
    // ACOTAMIENTO COMPLETO (el único que se permite): un lenguaje para el que
    // NINGÚN detector que optó satisface su `needs` no puede producir un
    // hallazgo en la pasada 2 — `runPerLanguage` lo cortaría con
    // `no-aplicable` antes de mirar una sola función. Saltear sus archivos no
    // pierde nada; el costo que ahorra es el reparseo, que es todo el costo.
    const lenguajesQueImportan = new Set<string>();
    for (const [lang, info] of languagesForDetectors) {
      if (optaronPorGrafo.some((d) => d.needs.every((c) => info.capabilities.has(c)))) lenguajesQueImportan.add(lang);
    }
    const graphIndex = graph ? buildGraphIndex(graph) : null;
    // N13 — sólo se paga si un caller pidió el caché: `computeGraphFingerprint`
    // recorre TODOS los nodos/aristas del grafo (barato comparado con
    // reparsear, pero no gratis), así que ausente `input.intraGraphCache` ⇒
    // ni siquiera se calcula.
    const graphFingerprint = input.intraGraphCache && graph ? computeGraphFingerprint(graph) : null;
    for (const fact of input.facts) {
      if (!lenguajesQueImportan.has(fact.language)) continue;
      const langInfo = languagesForDetectors.get(fact.language);
      if (!langInfo) continue;

      // N13 — hit: ni reparseo ni detección de nuevo. `fact.contentHash` +
      // `graphFingerprint` clavan el resultado a EXACTAMENTE el estado
      // (este archivo, el grafo completo) bajo el que se calculó.
      if (input.intraGraphCache && graphFingerprint) {
        const cached = input.intraGraphCache.get(fact.path, fact.contentHash, graphFingerprint);
        if (cached) {
          findingsConGrafo.push(...cached.findings);
          coverageConGrafo.push(...cached.coverage);
          continue;
        }
      }

      // UN árbol vivo por vez, liberado en el `finally` — a diferencia del
      // lote de `attachHypotheses` más abajo (que junta el conjunto entero
      // antes de usarlo, 78-92 árboles medidos), acá la cota de memoria es
      // constante, un archivo.
      const live = await resolveLiveFileUnit(input.dir, fact.path);
      if (!live) continue;
      try {
        const soloEsteLenguaje = new Map([[fact.language, langInfo]]);
        const conGrafo = await runDetectors({
          repo: repoUnit,
          languages: soloEsteLenguaje,
          benchmarks: null,
          files: [live.unit],
          scopes: ["intra-function", "intra-file"],
          intraPass: "solo-con-grafo",
          graphIndex,
        });
        // Mismo trato que reciben los hallazgos de la pasada 1 dentro de
        // `analyzeFile`: la hipótesis de patrón se cuelga ACÁ, con el árbol
        // todavía vivo, que es el único momento en que `ctx.file` puede ser
        // no-null. Acá es incluso mejor que en `analyzeFile`: `repo.graph`
        // es el grafo real, no `null`. Sin esto, un hallazgo de la pasada 2
        // llegaría al producto sin nivel 2 — es decir, el detector
        // unificado subiría hallazgos y no subiría recomendaciones.
        try {
          attachHypotheses({
            findings: conGrafo.findings,
            repo: repoUnit,
            languages: soloEsteLenguaje,
            files: [live.unit],
          });
        } catch {
          /* ninguna hipótesis para este archivo; los hallazgos siguen en pie. */
        }
        // N13 — guarda DESPUÉS de `attachHypotheses`: lo que se sirve en un
        // hit futuro debe incluir el nivel 2, igual que lo que se sirve acá
        // mismo la primera vez.
        input.intraGraphCache?.put(fact.path, fact.contentHash, graphFingerprint!, {
          findings: conGrafo.findings,
          coverage: conGrafo.coverage,
        });
        findingsConGrafo.push(...conGrafo.findings);
        coverageConGrafo.push(...conGrafo.coverage);
      } catch {
        /* este archivo no aporta hallazgos de la pasada 2; el resto sigue en pie. */
      } finally {
        live.release();
      }
      // Misma disciplina que el resto del pipeline: parsear es trabajo de CPU
      // síncrono y este proceso también sirve las PTY/WebSocket de cada tarea
      // abierta.
      await yieldToEventLoop();
    }
    perFileFindings.push(...findingsConGrafo);
    perFileCoverage.push(...coverageConGrafo);
  }

  // OLA AX, FRENTE AX6 — EL ENCHUFE. Ésta es la ÚNICA pasada que recibe
  // `repo.functions` de verdad (ver el bloque grande sobre `repoUnit`): los
  // dos detectores `inter-file` que lo leen son `middle-man.ts` (que sin esto
  // descarta el 100 % de sus candidatos) y `modulo-envy.ts` (cuya compuerta
  // del constructor sin esto no filtra nada). `detect/run.ts:450` también lo
  // lee, pero sólo para `unitsConsidered` de la telemetría de cobertura: esa
  // fila deja de reportar 0 unidades consideradas para los `inter-file`, y no
  // cambia ninguna detección.
  const interFile = await runDetectors({
    repo: { ...repoUnit, functions: repoFunctions },
    languages: languagesForDetectors,
    benchmarks: null,
    scopes: ["inter-file"],
  });

  // F5 — CONTRATO-F5.md §1: el orden final YA NO compara `severity` cruda
  // entre detectores distintos (DEFECTO medido: en guava `feature-envy-intra`
  // ocupaba 84/200 filas del panel mientras `unused-variable`, 1 514
  // instancias, y `demeter-chain`, 766, no aparecían ninguna vez — dos
  // escalas de severidad de detectores distintos no son comparables entre
  // sí, aunque los dos números vivan en el mismo rango 0-100).
  // `scoreFindings` arma `score` a partir de TRES factores que sí son
  // comparables (`R_sev`: rango DENTRO del mismo `detectorId`; `impact`:
  // constante por detector, `detect/impact.ts`; `reach`: por archivo, sobre
  // el `graph` ya construido arriba, `detect/reach.ts`) — se le pasa el
  // conjunto COMPLETO de `perFileFindings` + `interFile.findings` ANTES de
  // cualquier corte, porque `R_sev` sólo es honesto calculado sobre TODOS
  // los hallazgos de un detector en la corrida, nunca sobre una página ya
  // recortada. `byScoreDescThenId` reemplaza a `bySeverityDescThenId` como
  // criterio de orden FINAL (mismo desempate por `Finding.id` asc);
  // `bySeverityDescThenId` sigue en pie y en uso dentro de cada detector
  // (`capDetectorFindings`, `detect/run.ts`), donde comparar severidad cruda
  // SÍ es correcto porque ahí es siempre dentro del mismo detector.
  const reachIndex = computeReachIndex(graph);
  // OLA AI, FRENTE AI3 — la desambiguación de ids repetidos, ACÁ y no más
  // abajo: éste es el punto donde las dos mitades de la corrida (per-file e
  // inter-file) se juntan por primera vez y ANTES de que alguien consuma un
  // `Finding.id` — el grafo (`attachFindingNodes`, que deduplica nodos por
  // id), el índice de vecindario, las hipótesis, el bucketing y el scoring
  // vienen todos después. Ver el docstring de `desambiguarIdsRepetidos`: hoy
  // dos hallazgos distintos del mismo detector, en el mismo archivo y con el
  // mismo `symbol`, comparten id, y el `Map` de `codeById` (más abajo en esta
  // misma función) se queda con UNO, así que el otro DESAPARECE de la salida.
  // La pasada conserva el id del primero en orden de lectura, así que ningún
  // id existente deja de resolver: es estrictamente aditiva.
  const rawFindings = [...perFileFindings, ...interFile.findings];
  desambiguarIdsRepetidos(rawFindings);

  // CONTRATO-F9.md §1/§2 — el vecindario. `reachIndex` de arriba usa el
  // `graph` SIN nodos de hallazgo a propósito (no cambia una métrica de la
  // Ola 4 por un campo que ese consumidor no pidió); lo que sigue construye
  // una segunda variable, `graphForHypotheses`, para las hipótesis y el
  // índice del vecindario — las dos ÚNICAS cosas de esta corrida que
  // necesitan ver nodos `finding` en el grafo. `attachFindingNodes` aterrizó
  // su cuerpo real en la Ola O (`graph/finding-nodes.ts`): `graphForHypotheses`
  // ya NO es `=== graph`, trae nodos `finding` + aristas `affects` de verdad.
  // Ninguno de los dos se
  // persiste (`input.onGraph`, más arriba, ya mandó el `built.graph`
  // ORIGINAL antes de este punto — CONTRATO-F9.md §2.4: los nodos de
  // hallazgo no van a `code_graphs`, invalidarían la caché incremental con
  // cada cambio de umbral de un detector).
  const graphForHypotheses = graph ? attachFindingNodes(graph, rawFindings) : null;
  // `metrics` (3er parámetro) va `null`: `graph/metrics/registry.ts` no
  // tiene todavía un call site real en este archivo (ver su propia nota de
  // proceso) — cuando lo tenga, se pasa acá, no en otro lugar.
  const neighborhoodIndex = buildNeighborhoodIndex(graphForHypotheses, rawFindings, null);
  // `ctx.repo.graph`/el 2º parámetro de `build()` pasan a ver el grafo CON
  // nodos de hallazgo — mutación contenida: `repoUnit` no se vuelve a leer
  // después de este punto salvo por `attachHypotheses` de abajo (verificado
  // por grep antes de este cambio).
  repoUnit.graph = graphForHypotheses;

  // P2 — CONTRATO-F6.md Contrato 1 §1.6: cuelga hipótesis de patrón de los
  // `Finding`s `inter-file` (`interFile.findings`), ANTES de puntuar/agrupar
  // (el resto de esta función sólo lee `finding.hypotheses` de acá en
  // adelante, salvo `refreshHypotheses` un poco más abajo). Los
  // `perFileFindings` NO pasan por ESTA llamada (`attachHypotheses`) — ya
  // recibieron su intento REAL, con árbol vivo, dentro de `analyzeFile` (ver
  // el try/catch alrededor de `attachHypotheses` ahí): volver a correr
  // `builder.build` acá, con `ctx.file` forzosamente `null`, pisaría un
  // resultado MEJOR (con árbol) con uno peor, para cualquier hipótesis cuyo
  // `required` sea permisivo sin árbol (hoy: sólo `strategy.ts`, ver su
  // docstring) — `attachHypotheses` sólo sobrescribe cuando el builder
  // vuelve a emitir algo, así que repetir la llamada ahí SÍ pisaría. Ola 10
  // cierra ESE límite sin ese riesgo: ver `refreshHypotheses` más abajo,
  // que sí toca `perFileFindings`, pero nunca vía `builder.build`. `repo.
  // graph` acá SÍ es el grafo real recién armado arriba (a diferencia de la
  // llamada dentro de `analyzeFile`, donde es `null`) — lo que las
  // hipótesis ancladas en `inter-file` (`abstract-factory`/`composite`/
  // `iterator`/`singleton`/`template-method`) necesitan.
  //
  // R1 (`RAICES.md`) — ESTO YA NO ES CIERTO, y es exactamente lo que esta
  // tarea cierra: "`ctx.file`/`ctx.fileAt` siguen `null` acá: ningún `Finding`
  // `inter-file` tiene 'un' archivo, y `analyzeFile` ya liberó el árbol de
  // cada uno antes de que `crossAnalyze` corriera". `resolveLiveFileUnit`
  // (arriba) reparsea BAJO DEMANDA, sólo para esta llamada, cada archivo que
  // la EVIDENCIA de algún `Finding` `inter-file` de esta corrida toca — el
  // conjunto de `locations[].file` de `interFile.findings`, nunca "todo el
  // repo". `null-object`/`prototype` necesitaban DOS archivos vivos a la vez
  // (target+origin): ambos quedan resueltos acá porque los dos viven en
  // `locations` del MISMO `Finding` — un solo `files` compartido para todo
  // el lote alcanza, no hace falta un mecanismo por-hipótesis. Liberados
  // (`release()`) en el `finally`, apenas `attachHypotheses` termina.
  //
  // OJO CON LA COTA (corregido por el integrador de la Ola D; acá decía
  // "nunca manteniendo más que unos pocos árboles vivos a la vez … nunca
  // memoria"): este `for` junta el conjunto ENTERO antes de llamar a
  // `attachHypotheses`, así que los árboles vivos simultáneos son TANTOS COMO
  // archivos toque la evidencia inter-file — medido, 78 sobre el Rails y 92
  // sobre `src/`, no "unos pocos". El costo medido sigue siendo aceptable
  // (pico de RSS +16 % en Rails, +33 % en `src/`; ver el docstring de
  // `resolveLiveFileUnit` para los números completos), pero es lineal en la
  // evidencia. Si algún día aprieta, se reparsea por lotes acá — liberando
  // entre lote y lote — sin tocar nada más.
  const interFileEvidencePaths = new Set<string>();
  for (const finding of interFile.findings) {
    for (const loc of finding.locations) interFileEvidencePaths.add(loc.file);
  }
  const interFileLiveFiles: FileUnit[] = [];
  const releaseInterFileLiveFiles: Array<() => void> = [];
  for (const evidencePath of interFileEvidencePaths) {
    const live = await resolveLiveFileUnit(input.dir, evidencePath);
    if (live) {
      interFileLiveFiles.push(live.unit);
      releaseInterFileLiveFiles.push(live.release);
    }
    await yieldToEventLoop();
  }
  try {
    attachHypotheses({
      findings: interFile.findings,
      repo: repoUnit,
      languages: languagesForDetectors,
      neighborhoodIndex,
      files: interFileLiveFiles,
    });
  } finally {
    for (const release of releaseInterFileLiveFiles) release();
  }

  // OLA V (frente V1) — LA PASADA DE GRAFO DE LAS HIPÓTESIS. El contrato
  // entero está en `hypotheses/run.ts#rebuildHypothesesWithGraph` y en
  // `ola-v/CONTRATO-GRAFO-HIPOTESIS.md`; acá va sólo lo que es propio de
  // ESTE call site.
  //
  // EL PROBLEMA QUE CIERRA: toda hipótesis anclada en un `Finding`
  // `intra-function`/`intra-file` se construyó dentro de `analyzeFile`, donde
  // `repo.graph` es `null` — lo dice el comentario de esa llamada. Los
  // caminos de grafo de Strategy, Chain of Responsibility, Decorator,
  // Composite y State estaban escritos y probados, y NUNCA corrían en
  // producción. Acá se les vuelve a preguntar, con el grafo real y el árbol
  // revivido.
  //
  // MISMA MAQUINARIA QUE LA PASADA 2 DE LOS DETECTORES (Ola N), no una nueva:
  // `resolveLiveFileUnit` archivo por archivo, UN árbol vivo por vez (cota de
  // memoria constante — a diferencia del lote de `attachHypotheses` de
  // arriba, que junta el conjunto entero), liberado en el `finally`, y el
  // MISMO interruptor de vuelta atrás, `CK_ANALISIS_DOS_PASADAS=0`
  // (`dosPasadasHabilitado`): apagarlo devuelve el pipeline de UNA pasada
  // exacto, también para las hipótesis. Más un interruptor FINO propio,
  // `CK_HIPOTESIS_CON_GRAFO=0` (`hipotesisConGrafoHabilitado`), que apaga
  // SÓLO esto sin tocar los detectores — el único modo de aislar el efecto de
  // este mecanismo sobre el nivel 2 sin mover el nivel 1; ver su docstring.
  // Deliberadamente NO se gatilla con `hasIntraGraphDetectors()`, que es una
  // pregunta sobre DETECTORES.
  //
  // SIN GRAFO NO SE CORRE, al revés que la pasada 2 de detectores: acá el
  // grafo no es un extra que el consumidor puede ignorar, es LA razón de la
  // pasada. Con `graphForHypotheses === null` (el build falló) lo único que
  // quedaría por ganar es el vecindario, y eso ya lo hace `refreshHypotheses`
  // sin pagar un solo reparseo — comportamiento idéntico al de antes de este
  // cambio.
  //
  // EL ACOTAMIENTO, que es completo y no pierde nada: sólo se reviven los
  // archivos de `Finding`s cuyo `kind` es ancla de ALGÚN builder registrado
  // (`findingsNeedingGraphPass` lo deriva del registro, no de una lista a
  // mano). Un hallazgo sin ancla no puede producir hipótesis, así que
  // reparsear su archivo sería costo puro. MEDIDO sobre los 13 repos del
  // corpus: 1.522 archivos con hallazgo-ancla `intra-*` (4.353 hallazgos).
  const rebuiltByGraph = new Set<Finding>();
  if (dosPasadasHabilitado() && hipotesisConGrafoHabilitado() && graphForHypotheses) {
    for (const [filePath, findingsDelArchivo] of findingsNeedingGraphPass(perFileFindings)) {
      const live = await resolveLiveFileUnit(input.dir, filePath);
      if (!live) continue; // sin árbol vivo esta pasada no es mejor: se deja lo de la pasada 1.
      try {
        for (const f of rebuildHypothesesWithGraph({
          findings: findingsDelArchivo,
          repo: repoUnit,
          languages: languagesForDetectors,
          files: [live.unit],
          neighborhoodIndex,
        })) {
          rebuiltByGraph.add(f);
        }
        // La etapa `refresh` de cada builder corre INMEDIATAMENTE DESPUÉS de
        // su `build`, con el MISMO árbol vivo — nunca se la saltea. Es una
        // etapa real del contrato, no un premio consuelo por no tener grafo:
        // `template-method.ts` emite una PROMESA DIFERIDA desde `build()`
        // (`parcial`, sin checks) y la RESUELVE en `refresh()` contra el
        // grafo. Sin esta línea, re-construir un hallazgo de Template Method
        // devolvía el placeholder y nadie lo resolvía — medido en
        // `newtonsoft-json/…/JsonSerializerInternalReader.cs:62`, que perdía
        // sus 4 checks confirmados. Acá `refresh` recibe además `ctx.file`
        // vivo, que nunca había tenido.
        refreshHypotheses({
          findings: findingsDelArchivo,
          repo: repoUnit,
          languages: languagesForDetectors,
          files: [live.unit],
          neighborhoodIndex,
        });
      } catch {
        /* este archivo no re-evalúa sus hipótesis; las de la pasada 1 siguen en pie. */
      } finally {
        live.release();
      }
      // Misma disciplina que el resto del pipeline: parsear es trabajo de CPU
      // síncrono y este proceso también sirve las PTY/WebSocket de cada tarea
      // abierta.
      await yieldToEventLoop();
    }
  }

  // Ola 10 — registro de pendientes §B1, "el vecindario que no llegaba a
  // nadie" (P2/P3). `perFileFindings` SÍ pasan por acá, a diferencia de la
  // llamada de arriba: `refreshHypotheses` (`hypotheses/run.ts`) NUNCA vuelve
  // a llamar `builder.build` (evita exactamente el riesgo de "pisar un
  // resultado mejor con uno peor" que el comentario de arriba describe) —
  // sólo el `builder.refresh` opcional de cada hipótesis YA construida con
  // árbol vivo, que por contrato jamás toca `state`/`checks`, sólo
  // `discriminators`/`confidence`. `neighborhoodIndex` es el MISMO objeto de
  // arriba: `buildNeighborhoodIndex` no se vuelve a llamar (186 ms sobre
  // guava, pagados una sola vez por corrida, ver su propio docstring).
  //
  // OLA V — los `Finding` que la pasada de grafo ya re-evaluó NO pasan por
  // acá: sus discriminadores acaban de calcularse con árbol vivo + grafo +
  // vecindario real, y `refreshHypotheses` los recalcularía con `ctx.file ===
  // null`. Refrescar ahí sería el mismo "pisar lo mejor con lo peor" que este
  // módulo ya evita en la otra dirección.
  refreshHypotheses({
    findings: rebuiltByGraph.size === 0 ? perFileFindings : perFileFindings.filter((f) => !rebuiltByGraph.has(f)),
    repo: repoUnit,
    languages: languagesForDetectors,
    neighborhoodIndex,
  });

  // F5 — CONTRATO-F5.md Contrato 2 §2.2/§2.4: la pertenencia a un grupo
  // (Nivel 1 declarado por el detector, Nivel 2 = archivo+kind) NO depende
  // de `score` — así que se decide ANTES de puntuar, y es lo que le dice a
  // `scoreFindings` qué hallazgos viven en un grupo degenerado (`conf =
  // 0.5`) sin volver circular la fórmula. Ver el docstring de
  // `detect/grouping.ts` para las dos fases completas.
  const buckets = bucketFindings(rawFindings);
  const scoredFindings = scoreFindings(rawFindings, reachIndex, buildConfidenceOf(buckets)).sort(byScoreDescThenId);
  const scoreById = new Map(scoredFindings.map((s) => [s.finding.id, s.score]));

  const allFindings = scoredFindings.map(({ finding, score, breakdown }) => {
    // F6 — `toCodeFinding` tipa su segundo parámetro como `RawFinding` (sin
    // `hypotheses`) porque también sirve a callers que genuinamente no tienen
    // uno; acá `finding` SÍ es un `Finding` completo (`attachHypotheses` ya
    // corrió arriba), así que se agrega aparte en vez de ensanchar la firma
    // de esa función para un campo que sólo este call site puede llenar.
    const hypotheses = finding.hypotheses;
    return {
      ...toCodeFinding(finding.kind, finding),
      // `toPublicHypothesis` — NUNCA `{ hypotheses }` a secas: ver su docstring, evita
      // filtrar `refreshState`/`missingEdgeKinds` (internal-only) a la `CodeFinding`
      // pública, uno de los cuales puede ser CIRCULAR.
      ...(hypotheses && hypotheses.length > 0 ? { hypotheses: hypotheses.map(toPublicHypothesis) } : {}),
      score,
      scoreBreakdown: breakdown,
    };
  });
  // `withRuleOfThree` cuenta ocurrencias de patrón sobre la población CRUDA
  // (una fila por hallazgo), ANTES de agrupar: si corriera después de
  // agrupar, 3 ocurrencias reales del mismo patrón en el mismo archivo
  // podrían colapsar a 1 grupo (Nivel 2) y perder el patrón exactamente por
  // agruparlas — la cuenta de ocurrencias no puede depender de si dos
  // hallazgos terminan en la misma tarjeta. `withRuleOfThree` preserva orden
  // y longitud, así que `ruleAdjusted[i]` sigue correspondiendo a
  // `scoredFindings[i].finding`, lo que permite recuperar, por `Finding.id`,
  // el `CodeFinding` (ya con `advice` ajustado) de cada miembro de un grupo.
  const ruleAdjusted = withRuleOfThree(allFindings);
  // OLA AI, FRENTE AI3 — ESTE `Map` DEPENDE DE UN INVARIANTE, y hasta esta ola
  // el invariante NO se cumplía: `new Map(...)` ante clave repetida se queda
  // con la ÚLTIMA, así que dos hallazgos que compartían `Finding.id` hacían
  // que los DOS grupos resolvieran al MISMO `CodeFinding` acá abajo
  // (`toGroupedCodeFinding`) y el otro hallazgo desapareciera de la salida —
  // medido: 1.101 ids repetidos y 2.588 hallazgos implicados en 20 de los 21
  // repos del corpus. El invariante lo garantiza ahora
  // `desambiguarIdsRepetidos`, aplicado sobre `rawFindings` mucho más arriba
  // (y por eso se arregla ahí y no acá: `scoreFindings`, el grafo y las
  // hipótesis leen el id ANTES de este punto). Si alguna vez se quita esa
  // pasada, este `Map` vuelve a perder hallazgos en silencio.
  const codeById = new Map(scoredFindings.map((s, i) => [s.finding.id, ruleAdjusted[i]!]));

  // F5 — CONTRATO-F5.md Contrato 2 §2.5: los totales REALES, antes de
  // agrupar y antes de cortar — lo que hace posible que la UI diga
  // "mostrando 100 de 2 041 grupos (11 379 hallazgos)" sin mentir por
  // omisión. `totalByKind` no existía (verificado: `grep -rn "totalByKind"
  // src/` → cero antes de esta tarea); `CodeAnalysis.kinds` es el catálogo
  // kind→etiqueta, una cosa distinta (qué kinds PUEDEN emitirse, no cuántos
  // hay).
  const findingsTotal = rawFindings.length;
  const totalByKind: Record<string, number> = {};
  for (const f of rawFindings) totalByKind[f.kind] = (totalByKind[f.kind] ?? 0) + 1;

  const groups: FindingGroup[] = finalizeGroups(buckets, (f) => scoreById.get(f.id) ?? 0).sort(byGroupRankDescThenId);
  const groupsTotal = groups.length;
  // OLA AJ, FRENTE AJ1 — EL ID DE SALIDA SE ESTAMPA ACÁ, Y NO EN CADA
  // CONSUMIDOR. Hasta esta ola `toCodeFinding` dejaba `id: undefined` y cada
  // consumidor lo re-derivaba por su cuenta con `f.id ?? stableFindingId(f)`
  // (dos en producción —`code-inspector.ts#withStableIds` y
  // `detect/precision/sample.ts`— más ~30 instrumentos). Esa derivación mira UNA
  // fila, y por eso NO PUEDE ver que otra fila del mismo kind en el mismo
  // archivo va a producir el MISMO id: medido sobre los 21 repos del corpus,
  // 1.487 filas salen hoy sin dirección propia (331 en bibliotecas · 1.156 en
  // aplicaciones). `conIdsEstables` es la MISMA derivación con la lista entera a
  // la vista; la primera en orden de lectura conserva su id byte a byte, así que
  // ningún id desaparece y ningún consumidor que cruce por id pierde una fila.
  //
  // POR QUÉ ACÁ Y NO DESPUÉS DEL CAP: `findings` de abajo es una PÁGINA
  // (`offset`/`limit`). Desambiguar sobre la página le daría a la misma fila ids
  // distintos según el `offset` pedido. `rankedGroupFindings` es la lista
  // completa, y es la que `onPreCapFindings` también publica.
  const { findings: rankedGroupFindings } = conIdsEstables(groups.map((g) => toGroupedCodeFinding(g, codeById)));

  // INTEGRACIÓN Ola 6 — ver el docstring de `AnalyzeOptions.onPreCapFindings`:
  // la lista COMPLETA, antes del corte de `MAX_STORED_FINDINGS` de abajo.
  input.onPreCapFindings?.(rankedGroupFindings);

  // §2.6 — techo DURO de almacenamiento, aplicado DESPUÉS del ranking
  // completo (se descarta la COLA, no una muestra sesgada). `findingsTotal`/
  // `totalByKind` ya se calcularon arriba, así que el número honesto
  // sobrevive aunque las filas no.
  const stored = rankedGroupFindings.slice(0, MAX_STORED_FINDINGS);
  const truncated = rankedGroupFindings.length > stored.length;

  // §2.5/§2.7 (invariante I1) — el cap deja de ser un corte silencioso:
  // `page` dice exactamente qué tajada de `rank(todo)` es `findings`, para
  // TODO `offset`/`limit`, nunca sólo para el default de 200.
  const offset = input.limits?.offset ?? 0;
  const requestedLimit = input.limits?.maxFindings;
  const pageLimit = requestedLimit === "unlimited" ? undefined : (requestedLimit ?? DEFAULT_ANALYZE_LIMITS.maxFindings);
  const findings = pageLimit === undefined ? stored.slice(offset) : stored.slice(offset, offset + pageLimit);
  const hasMore = groupsTotal > offset + findings.length;

  return {
    repoName: input.repoName,
    scannedFiles: input.scannedFiles,
    analysedFiles: input.facts.length,
    totalLines,
    languages: [...languages].sort(),
    files: summaries,
    findings,
    findingsTotal,
    groupsTotal,
    totalByKind,
    page: { offset, limit: pageLimit ?? findings.length, hasMore },
    truncated,
    kinds: [...kindCatalog()],
    coverage: aggregateCoverage([...perFileCoverage, ...interFile.coverage]),
  };
}

/**
 * Analyse a repository. Returns the findings ranked by severity, plus what was
 * scanned so the UI can be honest about coverage.
 *
 * F3: thin composition now — `collectFiles` → `analyzeFile` (or a cache hit
 * off `opts.incremental`) per file → `crossAnalyze`. Every existing caller
 * (census, tests, and `code-inspector.ts` when the worktree is not a git
 * checkout) omits `incremental` and gets exactly the old behaviour: every
 * file goes through `analyzeFile` fresh, output byte-identical to before
 * this split.
 */
export async function analyzeRepo(opts: AnalyzeOptions): Promise<CodeAnalysis> {
  validateLimit("maxFindings", opts.limits?.maxFindings);
  validateOffset(opts.limits?.offset);

  const files = await collectFiles(opts.dir);
  const facts: FileFacts[] = [];

  for (const file of files) {
    const hash = opts.incremental?.contentHashes.get(file.path);
    const cached = hash !== undefined ? opts.incremental?.cache.get(file.path, hash) : undefined;
    const produced = cached ?? (await analyzeFile({ dir: opts.dir, path: file.path, contentHash: hash }));
    if (!cached && produced) opts.incremental?.cache.put(produced);
    if (!produced) continue;
    facts.push(produced);
    // `walkFile` (inside `analyzeFile`) is synchronous CPU work; on a real
    // repo it adds up to seconds across hundreds of files. This process also
    // serves every PTY and WebSocket for every OPEN task, so handing control
    // back between files (rather than only between whole repos) keeps that
    // work from stalling everything else for the length of the run.
    await yieldToEventLoop();
  }

  opts.onFacts?.(facts);
  return crossAnalyze({
    repoName: opts.repoName,
    // R1 — para que `crossAnalyze` pueda reparsear bajo demanda
    // (`resolveLiveFileUnit`) los archivos que la evidencia `inter-file`
    // toca; ver el docstring de `CrossInput.dir`.
    dir: opts.dir,
    scannedFiles: files.length,
    facts,
    limits: opts.limits,
    graphCache: opts.graphCache,
    intraGraphCache: opts.intraGraphCache,
    onGraph: opts.onGraph,
    onPreCapFindings: opts.onPreCapFindings,
  });
}

/** One in-progress node in the explicit walk stack used by {@link walkFile}. */
interface WalkFrame {
  node: TreeSitterNode;
  /** Index of the next child of `node` still to be visited. */
  childIndex: number;
  /** Shape hash accumulated so far: `node.type` plus each finished child's hash. */
  combined: string;
  /** Subtree size accumulated so far (this node plus finished children). */
  nodeCount: number;
  /** Set when `node` opened a new enclosing function, so it can be popped on exit. */
  fn: FunctionInfo | null;
  /**
   * F2 fix — set exactly when THIS node incremented `nesting` on entry (the
   * `branchNodes ∩ nestingNodes` case, e.g. `if`/loop/`catch`), so exit can
   * decrement iff it incremented — the same node instance, not merely "some
   * node of a type that's in `nestingNodes`". Without this, `switchContainers`
   * (in `nestingNodes` but never in `branchNodes`, so it never increments)
   * still matched the OLD exit-side check `nestingNodes.has(type)` and
   * decremented anyway, drifting `nesting` below its true depth for
   * everything that followed.
   */
  incrementedNesting: boolean;
}

/**
 * One walk per file gathers everything: per-function metrics and the clone
 * fingerprints. Iterative rather than recursive — an explicit stack on the
 * heap instead of the call stack — so a deeply nested file (generated code,
 * a long binary chain, deeply nested literals) cannot blow it: an ordinary
 * source file caps out at a few hundred levels of nesting, but nothing here
 * trusts that, since a `RangeError` here would otherwise take down the WHOLE
 * repo's analysis, not just this one file.
 *
 * This simulates the natural recursive post-order walk frame-by-frame: a
 * frame is pushed on entering a node (function-scope bookkeeping happens
 * then, same as the pre-order part of the old recursive call) and finalised
 * — hashed, checked against the clone thresholds, popped — once every child
 * has reported back, same as the old function's return.
 *
 * Being an explicit stack rather than call frames also means the walk can be
 * PAUSED between iterations with nothing lost: every bit of state
 * (`stack`, `enclosing`, `finished`) lives on the heap, not in suspended call
 * frames. `analyzeRepo`'s per-file yield already hands the event loop back
 * between files, but one big-enough file (a generated schema dump, a fat
 * model) can itself run tens of milliseconds synchronously — long enough on
 * its own to stall other tasks' terminals. So this checks the clock
 * periodically and yields mid-file too, capping the blocking chunk to about
 * `MAX_WALK_SLICE_MS` regardless of how
 * big a single file turns out to be.
 *
 * F2 fix — cognitive-complexity `nesting` used to be a single mutable
 * per-FILE counter with two asymmetries that made the score depend on the
 * TEXTUAL ORDER of otherwise-identical code (verified: moving a closure
 * before vs. after a nested block changed the number for code with the same
 * shape): (1) entering a function reset it to 0 and nothing ever restored
 * the enclosing scope's value on exit, so a closure/lambda "burned" its
 * parent's remaining depth budget for everything that came after it in
 * source order; (2) the entry-side increment fired only for
 * `branchNodes ∩ nestingNodes`, while the exit-side decrement fired for all
 * of `nestingNodes` — a strict superset (`switchContainers` is nesting but
 * never branch) — so a switch container decremented depth it had never
 * added, drifting the count down monotonically.
 *
 * The fix makes `nesting` a property OF THE WALK — chosen over an explicit
 * per-frame "saved depth" stack, the docstring's other named option,
 * because it is the simpler of the two ways to say the same thing: `nesting`
 * is now the TRUE syntactic depth of `nestingNodes` ancestors from the file
 * ROOT (loops/`if`/`catch`/`switch`), tracked with a single counter that
 * NEVER resets at a function boundary, nested or not. Bug (1) disappears by
 * construction — there is no reset left to forget to undo, so a closure can
 * no longer "eat" its enclosing scope's depth for whatever follows it in
 * source order. Bug (2) is fixed by decoupling the two independent
 * questions the old single `if` conflated: whether a node COSTS (gated on
 * `branchNodes` alone) and whether a node NESTS (gated on `nestingNodes`
 * alone, no longer subordinate to the first) — plus `WalkFrame.
 * incrementedNesting`, set iff THIS node instance bumped `nesting` on entry
 * and checked (not re-derived from `nestingNodes` again) on exit, so
 * increment and decrement are definitionally the same set of frames, never
 * merely two node-type sets that happen to overlap.
 *
 * One more consequence follows from `nesting` no longer resetting at a
 * function boundary: a branch's cognitive cost is charged to EVERY
 * currently-open function scope (`enclosing`), not just the innermost one.
 * Verified necessary against the real corpus, not a style choice — an
 * inline closure's own branch has to reach the ENCLOSING function's score
 * (at the closure's true ambient depth) for that enclosing function to
 * cross `complexity`'s threshold the way it did before this same walker
 * regressed it (`cobra`'s `doc/md_docs.go#GenMarkdownCustom`, `doc/
 * rest_docs.go#GenReSTCustom`); scoring the closure ONLY in isolation (its
 * own baseline reset to 0, its cost never seen by the function reading it)
 * silently drops back below threshold even with both asymmetries fixed,
 * which is the textbook "died reading it, not writing it" case this metric
 * exists to catch. The closure still gets its OWN independent `FunctionInfo`
 * (own `branches`/`maxNesting`/reporting) — only `cognitive` folds outward;
 * `branches`/`maxNesting` stay attributed to the innermost scope, since
 * those are not the metric this bug was about.
 */
async function walkFile(
  root: TreeSitterNode,
  spec: LanguageSpec,
  file: string,
  functions: FunctionInfo[],
  clones: CloneCandidate[],
  /**
   * F4 — parámetro de salida OPCIONAL: el `AstNode` de cada nodo función,
   * empujado en el MISMO recorrido, mismo índice que `functions` — cero
   * costo de walk adicional (CONTRATO-F4.md §1.5). Ausente para todo
   * llamador que no lo necesita (ninguno hoy fuera de `analyzeFile`).
   */
  functionNodes?: AstNode[],
): Promise<void> {
  // `fingerprint` is computed bottom-up, so children are visited before the
  // parent is hashed; a post-order traversal gives that for free.
  const enclosing: FunctionInfo[] = [];
  /** Syntactic class context: name + the verbatim text of its extends clause. */
  const classes: { name: string; superclass: string | null; depth: number }[] = [];
  /** Nesting depth for cognitive complexity, in nodes that actually nest. */
  let nesting = 0;

  const enter = (node: TreeSitterNode): WalkFrame => {
    const currentClass = classes[classes.length - 1] ?? null;

    if (spec.classNodes.has(node.type)) {
      classes.push({
        name: node.childForFieldName("name")?.text ?? "(anónima)",
        superclass: node.childForFieldName("superclass")?.text?.replace(/^<\s*/, "") ?? null,
        depth: 0,
      });
    }

    let fn: FunctionInfo | null = null;
    if (spec.functionNodes.has(node.type)) {
      fn = {
        name: node.childForFieldName("name")?.text ?? "(anónima)",
        file,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        branches: 0,
        chain: 0,
        cognitive: 0,
        maxNesting: 0,
        parameters: countParameters(node),
        chainHasNullCheck: false,
        chainInstantiates: false,
        className: currentClass?.name ?? null,
        // F1 hygiene fix — `CONSTRUCTOR_NAMES` centralizada Y reducida
        // (código-grammar.ts): ya no lleva `"new"`/`"New"` (Go no tiene
        // constructores; esa entrada nunca matcheaba nada real). Java/C#
        // dedican su propio nodo de gramática (`constructor_declaration`,
        // verificado por sonda) — se detectan por INTROSPECCIÓN
        // (`spec.constructorNodes`), no por nombre, así que ya no dependen
        // de esta lista en absoluto.
        isConstructor:
          spec.constructorNodes.has(node.type) ||
          CONSTRUCTOR_NAMES.has(node.childForFieldName("name")?.text ?? ""),
        isFactoryLike: FACTORY_NAME.test(node.childForFieldName("name")?.text ?? ""),
      };
      functions.push(fn);
      functionNodes?.push(node as unknown as AstNode);
      enclosing.push(fn);
      // F2 fix — no `nesting = 0` reset here anymore: see the walkFile
      // docstring. `nesting` is the file's true ambient depth now, and a
      // function boundary (named or an anonymous closure) is not itself a
      // reset point for it.
    }

    const current = enclosing[enclosing.length - 1];
    if (current && spec.branchNodes.has(node.type)) current.branches++;

    // Cognitive complexity (S3776): each branching construct costs 1, PLUS the
    // depth it sits at — that is the whole difference from the flat count, and
    // why three nested ifs score worse than three sequential ones. F2 fix:
    // charged to EVERY currently-open function scope, not just the innermost
    // (`current`) — see the walkFile docstring for why this is required, not
    // just a nicety, once an inline closure no longer resets `nesting` to 0.
    if (spec.branchNodes.has(node.type)) {
      for (const scope of enclosing) scope.cognitive += 1 + nesting;
    }

    // F2 fix — nesting-depth bookkeeping is its OWN condition, gated on
    // `nestingNodes` alone: it no longer piggybacks on `branchNodes` (that
    // coupling is what caused the asymmetry — `switchContainers` sits in
    // `nestingNodes` but never in `branchNodes`, so under the old single
    // `if` it could never increment, yet the exit side decremented for all
    // of `nestingNodes` regardless). A `switch` genuinely nests everything
    // in its cases one level deeper, same as an `if`/loop/`catch` — it just
    // doesn't ALSO cost its own +1 the way a branch does, because that cost
    // is already charged per-arm (`switchArms` is in `branchNodes`).
    // `incrementedNesting` is tracked per FRAME, not re-derived from
    // `nestingNodes` again at exit, so increment and decrement stay the
    // same set of node INSTANCES by construction, not just two node-type
    // sets that happen to overlap (see the walkFile docstring).
    let incrementedNesting = false;
    if (current && spec.nestingNodes.has(node.type)) {
      nesting++;
      incrementedNesting = true;
      current.maxNesting = Math.max(current.maxNesting, nesting);
    }

    if (current && spec.chainNodes.has(node.type)) {
      const rungs = ladderLength(node, spec);
      if (rungs > current.chain) {
        current.chain = rungs;
        // Which shape the ladder has decides the advice, so it is measured
        // alongside its length rather than guessed later.
        current.chainHasNullCheck = ladderChecksNull(node);
        current.chainInstantiates = ladderInstantiatesTypes(node, spec);
      }
    }

    // Hash by SHAPE only: the node type plus its children's hashes. Identifiers
    // and literals are deliberately excluded so a renamed copy still matches.
    return { node, childIndex: 0, combined: node.type, nodeCount: 1, fn, incrementedNesting };
  };

  const stack: WalkFrame[] = [enter(root)];
  // Result handed up from the frame that just finished, for its parent to
  // fold into `combined`/`nodeCount` on the next loop iteration.
  let finished: { hash: string; nodes: number } | null = null;

  // `performance.now()` is cheap but not free; only checked every
  // `CLOCK_CHECK_INTERVAL` frames instead of every single one, since a real
  // file is thousands of nodes and a mid-file stall only matters past
  // `MAX_WALK_SLICE_MS` anyway.
  let framesSinceClockCheck = 0;
  let sliceStartedAt = performance.now();

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;

    if (finished) {
      frame.combined += `(${finished.hash})`;
      frame.nodeCount += finished.nodes;
      finished = null;
    }

    if (frame.childIndex < frame.node.childCount) {
      const child = frame.node.child(frame.childIndex++);
      if (child) stack.push(enter(child));
      // A null child (same as the recursive version's `if (!child) continue`)
      // simply contributes nothing; the loop re-checks this same frame next.
      continue;
    }

    if (++framesSinceClockCheck >= CLOCK_CHECK_INTERVAL) {
      framesSinceClockCheck = 0;
      if (performance.now() - sliceStartedAt >= MAX_WALK_SLICE_MS) {
        await yieldToEventLoop();
        sliceStartedAt = performance.now();
      }
    }

    // Every child is done: finalise this frame exactly as the recursive
    // version did just before returning.
    const hash = hashOf(frame.combined);
    if (
      spec.cloneNodes.has(frame.node.type) &&
      frame.nodeCount >= MIN_CLONE_NODES &&
      frame.node.endPosition.row - frame.node.startPosition.row + 1 >= MIN_CLONE_LINES
    ) {
      clones.push({
        fingerprint: hash,
        file,
        startLine: frame.node.startPosition.row + 1,
        endLine: frame.node.endPosition.row + 1,
        nodes: frame.nodeCount,
        type: frame.node.type,
        functionName: frame.fn?.name ?? enclosing[enclosing.length - 1]?.name ?? null,
        className: classes[classes.length - 1]?.name ?? null,
        superclassName: classes[classes.length - 1]?.superclass ?? null,
        normalized: normalizeSource(
          boundedText(frame.node),
          `${file}:${frame.node.startPosition.row}`,
        ),
      });
    }
    if (spec.classNodes.has(frame.node.type)) classes.pop();
    // F2 fix — decrement iff THIS frame incremented (see docstring/WalkFrame):
    // no more re-checking `nestingNodes` against a superset it was never
    // drawn from at entry (that was the `switchContainers` drift).
    if (frame.incrementedNesting) {
      nesting = Math.max(0, nesting - 1);
    }
    if (frame.fn) {
      enclosing.pop();
    }

    stack.pop();
    finished = { hash, nodes: frame.nodeCount };
  }
}

/** Parameters declared by a function node, across the grammars' field names. */
function countParameters(node: TreeSitterNode): number {
  const params =
    node.childForFieldName("parameters") ?? node.childForFieldName("parameter_list");
  if (!params) return 0;
  let count = 0;
  for (let i = 0; i < params.childCount; i++) {
    const child = params.child(i);
    // Punctuation shows up as children too; only named parameter nodes count.
    if (child && /identifier|parameter|pattern/.test(child.type)) count++;
  }
  return count;
}

/**
 * Does any rung of this ladder compare against nil/null/undefined? That single
 * signal is what turns the advice into Introduce Special Case (→ Null Object),
 * so it is read literally from the condition text rather than inferred.
 */
function ladderChecksNull(node: TreeSitterNode): boolean {
  const text = boundedText(node);
  return text !== null && /\b(nil|null|undefined|None)\b/.test(text.slice(0, 4000));
}

/**
 * The rungs of a conditional chain, in source order — the SAME traversal
 * `ladderLength` used to duplicate ad hoc (and get wrong for two of the three
 * real shapes below), now shared with `ladderInstantiatesTypes` so both read
 * off one correct arm list instead of two independently-buggy ones.
 *
 * THREE REAL SHAPES, confirmed by direct probe against all 9 grammars this
 * module loads (a `.rationale` for a claim this load-bearing, not a guess):
 *
 *   1. SWITCH/CASE — arms are direct children of the container (`switch_case`/
 *      `case_clause` siblings under `switch_statement`/`case`). Counted
 *      directly, gated on `spec.switchContainerNodes` specifically (never on
 *      "any node with a chain-typed child" — see bug 3 below for why that
 *      broader test is wrong).
 *   2. NESTED `if`/`elsif` (Ruby, and Java/C#/Go's `else if`) — each rung's
 *      `alternative` field points DIRECTLY at the next rung, one level
 *      deeper each time (`if -> alternative: elsif`, `elsif -> alternative:
 *      elsif`, …), except JS/TS which additionally WRAPS each rung in a
 *      generic `else_clause` that itself carries no `alternative` field, so
 *      the next real rung has to be found INSIDE it (`findNestedChainNode`).
 *   3. FLAT `if`/`elif`/`else` (Python) — `elif_clause`/`elif_clause`/
 *      `else_clause` are ALL siblings directly under the SAME top
 *      `if_statement`, not nested one inside the previous. Confirmed by
 *      direct field probe: `if_statement.childForFieldName("alternative")`
 *      returns only the FIRST `elif_clause` (tree-sitter's singular accessor
 *      always returns the first match for a repeated field name), which is
 *      exactly why a hand-rolled "walk `.alternative` one hop at a time"
 *      loop stalls after a single hop here — the SECOND `elif_clause` is a
 *      SIBLING of the first, never reachable by descending into it. Measured
 *      effect before this fix: `chain` capped at EXACTLY 2 for any Python
 *      `if/elif.../else` regardless of how many `elif`s existed (verified
 *      with a live `if/elif/elif/else` probe: `chain` read 2, not 4) — the
 *      p95 this repo's own `chainLength` threshold cites for Python was
 *      itself measured through this broken counter.
 *
 *      `childrenForFieldName` (plural — see the `TreeSitterNode` interface
 *      above) resolves shapes 2 and 3 with the SAME code: called on a
 *      NESTED-style node it returns exactly one child (the next hop);
 *      called on Python's flat `if_statement` it returns the WHOLE
 *      remaining tail (`[elif_clause, elif_clause, else_clause]`) in one
 *      shot, so the loop below advances by however many it gets back
 *      instead of assuming exactly one.
 *
 * BUG THIS REPLACES (measured, not assumed): the old direct-children-only
 * check this module used for BOTH `ladderLength` and `ladderInstantiatesTypes`
 * treats "this node has a chain-typed DIRECT child" as "this node is a
 * switch container with directly-countable arms" — true for a real switch,
 * but ALSO accidentally true for the OUTERMOST node of shape 2 (Ruby's `if`
 * always has exactly one `elsif`/`else` as a direct child too), so it
 * short-circuited to `arms.length` (1) before ever walking the real chain.
 * Verified live: an `if/elsif/elsif/else` (4 rungs) measured `chain === 3`
 * (recovered only because the walker separately visits the nested `elsif`
 * nodes and keeps the max — the outer vantage point alone would have said 1)
 * — an off-by-one that was silent because it never went to zero. For
 * `ladderInstantiatesTypes` specifically the SAME direct-children check also
 * gated on `arms.length >= 2`, which the JS/TS-wrapped shape (shape 2's
 * `else_clause` variant) can NEVER satisfy (a wrapped ladder's outer `if`
 * has exactly one direct chain-typed child, the wrapper, and the wrapper
 * itself is excluded because unwrapping it is a full extra step this old
 * code never took) — measured live across all 6 typed/nested-capable
 * languages probed (TS/Java/C#/Go/Ruby/Python), a genuine 4-branch
 * type-switch construction ladder read `chainInstantiates === false` in
 * EVERY one of them, which is the exact cause this frente's brief named:
 * "6 real `conditional-chain` findings, all `ladder`, none `instantiates`".
 */
function collectChainArms(node: TreeSitterNode, spec: LanguageSpec): TreeSitterNode[] {
  if (spec.switchContainerNodes.has(node.type)) {
    const arms: TreeSitterNode[] = [];
    const collectDirectArmsFrom = (container: TreeSitterNode): void => {
      for (let i = 0; i < container.childCount; i++) {
        const child = container.child(i);
        if (child && spec.chainNodes.has(child.type) && child.type !== node.type) arms.push(child);
      }
    };
    collectDirectArmsFrom(node);
    // Go's `expression_switch_statement` and Ruby's `case` hold their arms as
    // DIRECT children of the container (caught above, `arms.length > 0`
    // already). JS/TS's `switch_body`, C#'s `switch_body`, Java's
    // `switch_block`, and Python's `match_statement`'s own `body` block all
    // interpose ONE wrapper node between the container and its arms —
    // confirmed by direct probe against all 5 — so a container that found NO
    // direct arms is checked one level deeper, into each of its own
    // non-chain-typed NAMED children (the wrapper — never the arms
    // themselves, already excluded from this fallback because
    // `chainNodes.has(child.type)` already matched them on the first pass).
    // Same one-level bound `findNestedChainNode` uses for the if/elsif
    // wrapper case below.
    if (arms.length === 0) {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child.isNamed && !spec.chainNodes.has(child.type)) collectDirectArmsFrom(child);
      }
    }
    return arms;
  }

  const arms: TreeSitterNode[] = [node];
  let cursor: TreeSitterNode | null = node;
  while (cursor) {
    const altChildren: TreeSitterNode[] = cursor.childrenForFieldName("alternative");
    if (altChildren.length === 0) break;
    arms.push(...altChildren);
    const last: TreeSitterNode = altChildren[altChildren.length - 1]!;
    cursor = spec.chainNodes.has(last.type) ? last : findNestedChainNode(last, spec);
  }
  return arms;
}

/**
 * Does every arm construct a different type? Then the code already IS a
 * factory, and the right advice is to leave it alone — the opposite of what a
 * naive "switch → Factory Method" rule would say. Each `arm` below is the
 * rung's own node (a whole `if_statement`/`elsif`/`else_clause` subtree, not
 * just its body) — reading `new X`/`X.new` off its FULL text still isolates
 * THIS rung's own construction correctly even though a nested-style arm's
 * text also contains every DEEPER rung after it: source order guarantees
 * this rung's own branch text always comes first, so the FIRST regex match
 * is always this rung's, never a later one's (confirmed against the 4-rung
 * probes used to find the bug above — each arm resolved to its own type,
 * never a neighbour's).
 */
function ladderInstantiatesTypes(node: TreeSitterNode, spec: LanguageSpec): boolean {
  const arms = collectChainArms(node, spec);
  if (arms.length < 2) return false;
  const constructed = new Set<string>();
  for (const arm of arms) {
    const text = boundedText(arm);
    if (text === null) return false;
    const match = /\bnew\s+([A-Z][A-Za-z0-9_]*)|\b([A-Z][A-Za-z0-9_:]*)\.new\b/.exec(text);
    if (!match) return false;
    constructed.add(match[1] ?? match[2]);
  }
  return constructed.size === arms.length;
}

/**
 * Reading `node.text` materialises that whole subtree's source, so doing it for
 * every nested candidate is quadratic — measured as a timeout on a
 * pathologically nested file. Anything past this span is left un-compared
 * rather than paid for.
 */
const MAX_TEXT_SPAN_LINES = 400;

/** A node's source, or null when it is too big to be worth materialising. */
function boundedText(node: TreeSitterNode): string | null {
  if (node.endPosition.row - node.startPosition.row > MAX_TEXT_SPAN_LINES) return null;
  return node.text;
}

/**
 * Collapse whitespace so "identical" means identical modulo formatting. A null
 * input (an over-large node) yields a value unique to that location, so such a
 * clone is treated as merely SIMILAR — the conservative reading, since the
 * advice for identical copies is the stronger claim.
 */
function normalizeSource(text: string | null, unique: string): string {
  if (text === null) return `~${unique}`;
  return text.replace(/\s+/g, " ").trim();
}

/**
 * How many rungs a conditional ladder has: `if/elsif/elsif/else` counts its
 * branches, a `case` counts its `when`s. Short ladders are normal control flow;
 * long ones are a type switch in disguise. See `collectChainArms`'s docstring
 * for the three real shapes this has to count correctly (switch, nested
 * if/elsif, and Python's flat if/elif/else) and the bug this replaced.
 */
function ladderLength(node: TreeSitterNode, spec: LanguageSpec): number {
  return collectChainArms(node, spec).length;
}

/** First direct child whose type is one of this language's chain nodes, if any. */
function findNestedChainNode(node: TreeSitterNode, spec: LanguageSpec): TreeSitterNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && spec.chainNodes.has(child.type)) return child;
  }
  return null;
}

/** Short, stable structural hash. */
function hashOf(text: string): string {
  return crypto.createHash("sha1").update(text).digest("base64url").slice(0, 16);
}

/**
 * Give the event loop a turn. `analyzeRepo` runs in the SAME process as every
 * open task's PTY and WebSocket, so without this a big repo's parse+walk work
 * (all synchronous) starves everything else for the length of the whole run
 * instead of just between files.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/* ── Findings ─────────────────────────────────────────────────────────── */

/**
 * P9/F4: adapts a `detect/` `Finding` (role-tagged locations, a `trigger`
 * tuple of `Measurement`s, plus the runner's identity/scope metadata) back
 * into this module's legacy `CodeFinding` (one `metric`, plain
 * `CodeLocation[]`). Applied to all 19 registered detectors now, not just
 * the five that used to be called directly here — every detector's `RawFinding`
 * shape is the same contract, so this adapter needed no change when the
 * other 14 were switched on. Every detector emits at least one `Measurement`
 * in `trigger` (the type requires a non-empty tuple), so taking the first is
 * lossless for the single-`metric` legacy shape. `role`/`anchor`/`id`/
 * `detectorId`/`scope`/`language` (contract-only metadata `CodeLocation`/
 * `CodeFinding` never had) are dropped here — same behaviour the five
 * original detectors already had. `symbol` is kept only when the raw
 * finding actually set it.
 */
function toCodeFinding(kind: CodeFinding["kind"], raw: RawFinding): CodeFinding {
  const [primary] = raw.trigger;
  return {
    kind,
    title: raw.title,
    detail: raw.detail,
    metric: { label: primary.label, value: primary.value },
    severity: raw.severity,
    locations: raw.locations.map((l) => ({
      file: l.file,
      startLine: l.startLine,
      endLine: l.endLine,
      ...(l.symbol !== undefined ? { symbol: l.symbol } : {}),
    })),
    advice: raw.advice,
  };
}

/**
 * F6/Ola 10 — `PatternHypothesis` (`hypotheses/types.ts`) trae dos campos que su PROPIO
 * docstring declara internal-only y dice que "nunca cruzan a `CodeFindingHypothesis`":
 * `refreshState` (payload OPACO de `HypothesisBuilder.refresh` — puede contener el
 * `Finding` que la hipótesis ancla, ver `hypotheses/template-method.ts#resolveDeferredViaGraph`,
 * lo que vuelve CIRCULAR — `finding.hypotheses[i].refreshState.finding === finding` — a
 * cualquier `JSON.stringify` del `CodeAnalysis` de salida si se deja pasar; medido: revienta
 * tanto la persistencia F2 de `code-inspector.ts` como el caché de corpus de
 * `analyze-cache.ts` en cuanto una hipótesis de Template Method se resuelve vía grafo) y
 * `missingEdgeKinds` (documentado como muerto de punta a punta hoy, pero por la misma
 * regla: tampoco debe cruzar). Hasta esta corrección, la construcción de `allFindings` más
 * abajo reasignaba `finding.hypotheses` TAL CUAL a la `CodeFinding` pública — violando esa
 * promesa en runtime pese a que `shared/types.ts#CodeFindingHypothesis` nunca declaró esos
 * campos. Este picking explícito (en vez de un spread menos los campos internos, que se
 * desincroniza en silencio si `PatternHypothesis` gana un campo internal-only más mañana)
 * es lo que hace CIERTA la promesa del docstring, en vez de sólo declararla.
 */
function toPublicHypothesis(h: PatternHypothesis): CodeFindingHypothesis {
  return {
    pattern: h.pattern,
    // OLA BA, FRENTE BA1 — la capa CRUZA. Sin `??` ni default: `run.ts` la
    // estampa desde el `HypothesisBuilder.layer` del builder que produjo la
    // hipótesis, así que un `PatternHypothesis` sin capa es inexpresable.
    layer: h.layer,
    state: h.state,
    confidence: h.confidence,
    ceiling: h.ceiling,
    provisional: h.provisional,
    checks: h.checks,
    discriminators: h.discriminators,
    places: h.places,
    toConfirm: h.toConfirm,
    cost: h.cost,
    source: h.source,
    missingCapabilities: h.missingCapabilities,
    anchorFindingId: h.anchorFindingId,
  };
}

/** Composite key for a `CodeLocation`, used only to deduplicate a group's merged location list. */
function locationDedupeKey(loc: CodeFinding["locations"][number]): string {
  return JSON.stringify([loc.file, loc.startLine, loc.endLine, loc.symbol ?? null]);
}

/**
 * F5 — CONTRATO-F5.md Contrato 2 §2.2/§2.3/§2.4: convierte un `FindingGroup`
 * (uno o más `Finding` colapsados por causa raíz o por localidad
 * archivo+kind — `detect/grouping.ts`) en el `CodeFinding` público que ve el
 * panel.
 *
 * `title`/`detail`/`metric`/`severity`/`score`/`scoreBreakdown`/`advice`
 * salen del REPRESENTANTE (el miembro de mejor score) SIN TOCARLOS —
 * `severity` en particular no se toca, ni siquiera acá (regla dura de esta
 * tarea): sigue siendo la del representante, nunca un agregado inventado.
 * Sólo `detail` se sobreescribe, y sólo cuando el grupo es degenerado (con
 * el texto que el contrato exige literalmente).
 *
 * `locations` es la UNIÓN de las locations de TODOS los miembros
 * (deduplicada), no sólo las del representante — desviación reportada sobre
 * la prosa del contrato ("los 3 mejores como ejemplares"): ver el docstring
 * de `detect/grouping.ts` para por qué (recortar a 3 arbitrarios podría
 * hacer desaparecer del censo — `census.ts#censusOf` — un archivo que sólo
 * tocaba un miembro no-exemplar, un delta NEGATIVO silencioso).
 *
 * OLA AC, FRENTE AC1 — `hypotheses` es TAMBIÉN la unión de las de todos los
 * miembros (deduplicada por patrón + estado + `places`), por la misma razón y
 * con el mismo criterio: ver `hypothesesOfAllMembers` más abajo.
 */
/**
 * Cuántos miembros NO representantes se nombran en el `detail` del grupo antes
 * de resumir el resto. 5, con el mismo criterio con el que
 * `detect/inter-file/duplication.ts#MAX_COPIAS_DETALLADAS` eligió 6: el
 * `detail` viaja al panel y a la planilla de veredictos en UNA celda, así que
 * la lista tiene que ser legible; el conteo total nunca se pierde porque
 * `memberCount` viaja aparte y el resto se resume con "y N más".
 */
const MAX_MIEMBROS_DETALLADOS = 5;

/**
 * Presupuesto de caracteres para el TRAMO AGREGADO del `detail` (el del
 * representante nunca se toca ni se recorta). No es un umbral de detección:
 * es legibilidad de UNA celda, la misma razón por la que
 * `detect/inter-file/duplication.ts` nombra 6 copias y resume el resto.
 * MEDIDO sobre `preact`: sin tope, la tarjeta de `shotgun-surgery` de
 * `useState` (7 miembros, cada uno con su párrafo de hipótesis) pasa de 4.000
 * caracteres. Se corta por MIEMBRO ENTERO, nunca a mitad de un texto: un
 * `detail` truncado a la mitad puede perder justo la lista de copias, que
 * viene al final y es la evidencia que se agregó para poder juzgar.
 */
const PRESUPUESTO_DETALLE_AGREGADO = 1200;

/**
 * OLA Q, FRENTE F2 — EL `detail` DE UN GRUPO ES EL DE TODOS SUS MIEMBROS, NO
 * EL DEL REPRESENTANTE.
 *
 * EL DEFECTO, con caso medido (pedido de P10 al integrador de la Ola P, §9 de
 * `ola-p/informes/INTEGRADOR.md`): cuando un detector declara `groupKey`
 * (Nivel 1 de `detect/grouping.ts`), N hallazgos distintos colapsan en UNA
 * tarjeta y hasta hoy la tarjeta mostraba el `title` Y el `detail` de UNO SOLO
 * de ellos. `locations` sí era la unión desde siempre — o sea que la tarjeta
 * listaba ubicaciones que su propio texto no explicaba. El caso: la tarjeta
 * `duplication:8aejptA7TKn30gVT` de preact ("5 fragmentos…") absorbió el
 * hallazgo juzgado VERDADERO "2 fragmentos de igual estructura de 7 líneas"
 * (`debug/src/debug.js:287` y `:294`) y con el `detail` del representante ese
 * verdadero quedaba invisible para quien juzga.
 *
 * QUÉ SE COMPONE: el `detail` del representante SIN TOCAR (primero, para que
 * nada de lo que ya se leía se pierda) y, detrás, el `title: detail` de cada
 * miembro cuyo `detail` sea DISTINTO — deduplicado, porque el caso corriente
 * es que N miembros del mismo kind compartan el texto fijo del detector y
 * repetirlo N veces no agrega evidencia.
 *
 * POR QUÉ ES GRATIS, verificado antes de escribirlo: `detail` no entra ni en
 * `stableFindingId` ni en la clave de contenido con la que
 * `detect/precision/verdicts-io.ts#mergeRows` reconcilia un veredicto humano
 * ya emitido (`code-finding-ids.ts#contentKeyForFinding` = kind + archivo +
 * símbolo + título) — el mismo motivo por el que P10 puso la lista de copias
 * en `detail` y no en `title`. Cero riesgo de dejar huérfano un veredicto y
 * cero efecto sobre el recall.
 *
 * NO TOCA EL GRUPO DEGENERADO: ahí el contrato (§2.4) exige un texto literal
 * que REEMPLAZA al del representante, y ese caso se resuelve más abajo.
 */
function detalleDeTodosLosMiembros(
  group: FindingGroup,
  codeById: ReadonlyMap<string, CodeFinding>,
  representative: CodeFinding,
): string {
  const detalleDelRepresentante = representative.detail.trim();
  const vistos = new Set([`${representative.title}\u0000${detalleDelRepresentante}`]);
  const otros: string[] = [];
  for (const member of group.members) {
    const code = codeById.get(member.id);
    if (!code) continue;
    const detail = code.detail.trim();
    const clave = `${code.title}\u0000${detail}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    // El `detail` sólo se repite cuando APORTA algo. En muchos kinds el texto
    // es fijo y lo único que distingue a un miembro de otro es su `title` (el
    // símbolo, el archivo, la métrica): repetir N veces el mismo párrafo no es
    // evidencia, es ruido. En `duplication` —el caso que motivó esto— el
    // `detail` SÍ cambia (lleva la lista de copias) y entonces va entero.
    otros.push(detail && detail !== detalleDelRepresentante ? `${code.title}: ${detail}` : code.title);
  }
  if (otros.length === 0) return representative.detail;
  const nombrados: string[] = [];
  let gastado = 0;
  for (const texto of otros) {
    if (nombrados.length >= MAX_MIEMBROS_DETALLADOS) break;
    if (nombrados.length > 0 && gastado + texto.length > PRESUPUESTO_DETALLE_AGREGADO) break;
    nombrados.push(texto);
    gastado += texto.length;
  }
  const resto = otros.length - nombrados.length;
  return (
    `${representative.detail} Este grupo reúne ${String(group.members.length)} hallazgos; los demás dicen: ` +
    nombrados.join(" | ") +
    (resto > 0 ? ` | y ${String(resto)} más.` : ".")
  );
}

/**
 * IDENTIDAD DE UNA HIPÓTESIS a los efectos de la deduplicación del agrupado.
 *
 * LA INTENCIÓN QUE VERIFICA, escrita para que se pueda discutir: *"esta
 * hipótesis ya le está diciendo al lector lo mismo, sobre el mismo código,
 * que otra que la tarjeta ya lleva"*. Una hipótesis le dice tres cosas y
 * ninguna más: QUÉ patrón (`pattern`), EN QUÉ SITUACIÓN está (`state`) y EN
 * QUÉ CÓDIGO (`places`, cada uno con su `role`). Coincidir en las tres es ser
 * la misma frase repetida. Diferir en `places` es mandar a leer OTRO código:
 * eso es producto distinto por más que compartan patrón y estado.
 *
 * POR QUÉ NO ENTRA `anchorFindingId`, que sería la llave obvia: es distinto
 * POR CONSTRUCCIÓN para cada miembro (es el `Finding.id` del que la hipótesis
 * cuelga), así que meterlo en la llave equivale a no deduplicar nunca.
 *
 * POR QUÉ NO ALCANZA `pattern` + `state` SOLOS, y está MEDIDO, no razonado.
 * Sobre las DOS poblaciones completas (16 repos), de las 1.085 hipótesis de
 * miembros no representantes que el agrupado tiraba:
 *
 *   · `pattern` + `state`            declara duplicadas 1.000 (92,2 %)
 *   · `pattern` + `state` + `places` declara duplicadas   167 (15,4 %)
 *   · … + los `checks`               declara duplicadas   167 — NI UNA MÁS
 *
 * Las ~833 de diferencia entre las dos primeras filas NO son repeticiones:
 * son N funciones distintas del mismo archivo, cada una con su propia
 * oportunidad. La llave gruesa se equivocaría en las 833. La duplicación REAL
 * que queda (167) es la que produce el Nivel 1 de `detect/grouping.ts`, que
 * junta hallazgos que efectivamente hablan del mismo código (p.ej. dos clases
 * de clon de `duplication` sobre el mismo conjunto de archivos), y ahí
 * saltearlas es exactamente lo correcto.
 *
 * POR QUÉ NO SE AGREGAN LOS `checks` A LA LLAVE: se midió y NO cambia NI UN
 * caso — 167 contra 167. Todo par que coincide en patrón + estado + `places`
 * coincide también en sus checks. Una llave más fina que no separa nada es
 * complejidad sin poder de discriminación.
 *
 * GENÉRICA: no nombra un patrón, ni un kind, ni un lenguaje. Se ordenan los
 * `places` para que la llave no dependa del orden en que el builder los
 * emitió.
 */
function hypothesisIdentityKey(h: CodeFindingHypothesis): string {
  const places = h.places.map((p) => `${p.file}:${String(p.startLine)}-${String(p.endLine)}:${p.symbol ?? ""}:${p.role}`).sort();
  return JSON.stringify([h.pattern, h.state, places]);
}

/**
 * OLA AC, FRENTE AC1 — LAS `hypotheses` DE UN GRUPO SON LAS DE TODOS SUS
 * MIEMBROS, NO LAS DEL REPRESENTANTE.
 *
 * EL DEFECTO QUE CIERRA, medido antes de escribir una línea (AB1 §13, Ola AB,
 * sobre 5 repos; re-medido acá sobre las DOS poblaciones completas):
 * `toGroupedCodeFinding` devolvía `{...representative, locations}`. El spread
 * arrastra `hypotheses` DEL REPRESENTANTE y ninguna otra, así que de un grupo
 * de N miembros el volcado publicaba las hipótesis de UNO. No es un problema
 * de presentación: es producto que el nivel 2 YA CALCULÓ —corrió los
 * `required`, los discriminadores y el excluder de cada patrón sobre cada
 * miembro— y que la capa de agrupado tiraba a la basura sin dejar rastro.
 * Toda selectividad, toda precisión y toda cobertura que este proyecto publicó
 * alguna vez estaba calculada sobre esa salida incompleta.
 *
 * EL PARALELO EXACTO QUE YA ESTABA EN ESTE ARCHIVO, y que es el argumento de
 * por qué esto no es una decisión nueva sino la que faltaba: `locations` es la
 * UNIÓN de las de todos los miembros desde F5 (ver el docstring de
 * `toGroupedCodeFinding`), y el `detail` es el de todos los miembros desde la
 * Ola Q (`detalleDeTodosLosMiembros`). La tarjeta ya listaba ubicaciones y ya
 * contaba el texto de miembros cuyas HIPÓTESIS no viajaban con ellos.
 *
 * QUÉ SE COMPONE: las del representante PRIMERO y SIN TOCAR —para que nada de
 * lo que ya se leía cambie de lugar— y detrás las de cada miembro, en orden de
 * miembro, salteando las que ya dicen lo mismo sobre el mismo código
 * (`hypothesisIdentityKey`). El conjunto de vistas ACUMULA: un miembro no
 * repite lo que otro miembro ya aportó, no sólo lo que aportó el
 * representante.
 *
 * SIN TOPE, y es deliberado. `detail` sí tiene presupuesto porque viaja a UNA
 * celda de texto y su límite es de legibilidad; `hypotheses` es dato
 * estructurado que consumen el panel, el censo y todo instrumento de medición
 * del proyecto. Un tope acá volvería a producir exactamente la pérdida
 * silenciosa que esto cierra, y encima una pérdida sesgada (se perderían
 * siempre los últimos miembros). Si el panel necesita mostrar menos, recorta
 * al renderizar — pero el dato sale completo.
 *
 * `anchorFindingId` NO SE REESCRIBE al del grupo: sigue apuntando al
 * `Finding` del miembro que la produjo. Es la única traza que queda de cuál de
 * los N miembros de la tarjeta motiva cada hipótesis, y quien juzga la
 * necesita para abrir el archivo correcto. Reescribirlo al id del grupo sería
 * más prolijo y sería mentira.
 */
function hypothesesOfAllMembers(
  group: FindingGroup,
  codeById: ReadonlyMap<string, CodeFinding>,
  representative: CodeFinding,
): readonly CodeFindingHypothesis[] | undefined {
  const fromRepresentative = representative.hypotheses ?? [];
  const seen = new Set(fromRepresentative.map(hypothesisIdentityKey));
  const extra: CodeFindingHypothesis[] = [];
  for (const member of group.members) {
    if (member.id === group.representative.id) continue;
    const code = codeById.get(member.id);
    if (!code?.hypotheses) continue;
    for (const h of code.hypotheses) {
      const key = hypothesisIdentityKey(h);
      if (seen.has(key)) continue;
      seen.add(key);
      extra.push(h);
    }
  }
  if (extra.length === 0) return representative.hypotheses;
  return [...fromRepresentative, ...extra];
}

function toGroupedCodeFinding(group: FindingGroup, codeById: ReadonlyMap<string, CodeFinding>): CodeFinding {
  const representative = codeById.get(group.representative.id);
  if (!representative) {
    // Estructuralmente imposible (`codeById` se arma de la MISMA lista de la
    // que `finalizeGroups` sacó `group.representative`), pero ruidoso en vez
    // de silencioso si algún día deja de serlo.
    throw new Error(`F5 grouping: falta el CodeFinding del representante ${group.representative.id}`);
  }
  const memberCount = group.members.length;
  if (memberCount === 1) return { ...representative, memberCount };

  const seen = new Set<string>();
  const locations: CodeFinding["locations"] = [];
  for (const member of group.members) {
    const code = codeById.get(member.id);
    if (!code) continue;
    for (const loc of code.locations) {
      const key = locationDedupeKey(loc);
      if (seen.has(key)) continue;
      seen.add(key);
      locations.push(loc);
    }
  }

  // OLA AC, FRENTE AC1 — las `hypotheses` dejan de ser sólo las del
  // REPRESENTANTE. Se calcula ACÁ, para los dos caminos de abajo: el grupo
  // degenerado NO es una excepción, y decidirlo así NO es gratis — está
  // medido, no supuesto. Sobre los 13 repos los grupos degenerados aportan
  // 135 hipótesis de miembros no representantes, de las que 90 sobreviven a
  // la deduplicación y 89 son recomendaciones: la excepción tendría un precio
  // concreto y grande.
  //
  // Se elige NO hacerla porque `degenerate` significa "estas N instancias son
  // evidencia débil", y eso YA se cobra donde corresponde: `buildConfidenceOf`
  // le baja `conf` a 0,5 a cada miembro —lo que baja el `score` de la fila y
  // con él su lugar en el ranking— y el `detail` lo dice con todas las letras.
  // Tirar además las hipótesis sería cobrar la misma debilidad dos veces, la
  // segunda en silencio; y sería tirar las de los miembros conservando la del
  // representante, que es exactamente igual de débil. Si una ola futura
  // decide que un grupo degenerado publique UNA sola hipótesis, ésta es la
  // línea que hay que tocar y ése es el precio.
  const hypotheses = hypothesesOfAllMembers(group, codeById, representative);
  const conHipotesis = hypotheses ? { hypotheses } : {};

  // OLA Q, FRENTE F2 — el `detail` deja de ser sólo el del REPRESENTANTE.
  // Pedido de P10 con caso medido (ver `detalleDeTodosLosMiembros`).
  if (!group.degenerate) {
    return {
      ...representative,
      locations,
      memberCount,
      ...conHipotesis,
      detail: detalleDeTodosLosMiembros(group, codeById, representative),
    };
  }

  // §2.4 — texto exigido literalmente por el contrato; `degenerateGroup:
  // true` marca la fila para que un consumidor (el panel, o `conf` vía
  // `buildConfidenceOf`, que ya lo aplicó del lado del score) no tenga que
  // inferirlo de `detail`.
  const detail =
    String(memberCount) +
    " instancias con evidencia débil: es más probable que sea un idioma de este archivo que " +
    String(memberCount) +
    " problemas distintos.";
  return { ...representative, locations, memberCount, ...conHipotesis, degenerateGroup: true, detail };
}

/**
 * Strip the pattern hypothesis from findings whose shape appears only once in
 * the repo.
 *
 * Kerievsky's rule of three: one occurrence is not evidence of a design
 * pressure, it is just code. Patterns pay off when a variation REPEATS, and the
 * empirical literature on over-applied patterns is mostly about introducing
 * structure for a variation that never came. The mechanical refactoring still
 * stands — only the pattern is withheld.
 */
function withRuleOfThree(findings: CodeFinding[]): CodeFinding[] {
  // F4 — NUNCA muta `finding`/`finding.advice`/`finding.advice.pattern`: los
  // findings de acá en más pueden venir de un `FileFacts` cacheado EN
  // MEMORIA (el caché de F3/F4, `code-file-facts-repository.ts` los sirve
  // deserializados pero un caller en el mismo proceso podría retenerlos), así
  // que escribir `pattern.popularity` in situ contaminaría el hecho cacheado
  // para la próxima corrida — CONTRATO-F4.md §1.3, el bug que este cableado
  // activa. Se construye un `CodeFinding`/`advice`/`pattern` NUEVO cuando hay
  // algo que escribir, en vez de mutar el que llegó.
  const withPopularity = findings.map((finding) => {
    const pattern = finding.advice?.pattern;
    if (!pattern || POPULARITY[pattern.name] === undefined) return finding;
    return {
      ...finding,
      advice: { ...finding.advice!, pattern: { ...pattern, popularity: POPULARITY[pattern.name] } },
    };
  });

  const occurrences = new Map<string, number>();
  for (const finding of withPopularity) {
    if (!finding.advice?.pattern) continue;
    const key = `${finding.kind}:${finding.advice.pattern.name}`;
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
  }

  // Three, per Kerievsky's rule: a shape that appears twice can be coincidence,
  // three times is a pressure. Patterns restructure code, so the bar to even
  // mention one sits higher than the bar for a mechanical refactoring — those
  // are offered on every single finding regardless.
  const MIN_OCCURRENCES = 3;

  return withPopularity.map((finding) => {
    const pattern = finding.advice?.pattern;
    if (!pattern) return finding;
    const key = `${finding.kind}:${pattern.name}`;
    if ((occurrences.get(key) ?? 0) >= MIN_OCCURRENCES) return finding;
    const { pattern: _dropped, ...advice } = finding.advice!;
    return { ...finding, advice };
  });
}

/* ── File collection ──────────────────────────────────────────────────── */

export interface ScannedFile {
  /** Repo-relative path. */
  path: string;
  mtimeMs: number;
  size: number;
}

/** Qué más quiere saber quien llama a {@link collectFiles}, si algo. */
export interface CollectFilesOptions {
  /**
   * D5/D-TEST — se invoca por cada exclusión de la ingesta: una vez por
   * DIRECTORIO podado (`dependency-tree`, `test-tree` por nombre de directorio
   * o por proyecto .NET; lo de adentro no se visita, así que no hay nada más
   * fino que reportar) y una vez por ARCHIVO descartado por nombre generado,
   * marca de cabecera, forma minificada o nombre de archivo de test. Existe
   * para que la exclusión sea auditable —cuáles, no cuántos— sin volver a
   * recorrer el repo: `scripts/measure-ingest-exclusion.mts` lo usa para
   * probar el requisito de seguridad del frente (que no se vaya código del
   * usuario). D-TEST cerró el hueco de auditoría que tenía el árbol de test
   * antes de esta ola: existía (`TEST_DIR_NAMES`/`isTestPath`) pero nunca
   * pasaba por acá. Sin este callback el comportamiento es idéntico: nada más
   * lo consulta.
   */
  onExcluded?: (excluded: ExcludedFile) => void;
}

/**
 * Every analysable file under `dir`, skipping vendored trees. Also the basis of
 * the cache signature, so it stats as it walks.
 *
 * Exported since F3: `code-inspector.ts`'s incremental path needs the exact
 * same file list `analyzeRepo` is about to walk, to pre-fetch cached
 * `FileFacts` for all of them in one query instead of one per file.
 *
 * D5 — acá se aplica la exclusión de vendorizado/generado/minificado, y se
 * aplica ACÁ y no más abajo a propósito: éste es el único punto por el que un
 * archivo entra al análisis, así que lo excluido no produce `FileFacts`, no
 * aporta nodos ni aristas al grafo y no cuenta en el censo. Los criterios y
 * su justificación viven en `ingest-exclusion.ts`; el de directorio, en
 * `SKIP_DIRS` acá arriba (dependencias) y en `isTestDirName`/
 * `isFeaturesDirName`+`excludedGherkinFeaturesDir`/`excludedDotnetTestProjectDir`
 * de `ingest-exclusion.ts` (árbol de test, D-TEST) — éstas dos podan ACÁ, en
 * el walk, porque son decisiones de DIRECTORIO completo, no de archivo.
 */
export async function collectFiles(dir: string, opts?: CollectFilesOptions): Promise<ScannedFile[]> {
  const out: ScannedFile[] = [];
  /**
   * N10/P11 — la firma de procedencia de la cabecera de cada archivo de `out`,
   * en el MISMO orden (`out[i]` ↔ `provenance[i]`), `null` para el que no
   * declara ninguna. La saca `classifyFile` del texto que ya leyó para las
   * otras categorías: no cuesta ni una lectura de más. Es la entrada de la
   * segunda fase, abajo — ver la sección 6 de `ingest-exclusion.ts`.
   */
  const provenance: (string | null)[] = [];

  const walk = async (relative: string): Promise<void> => {
    const absoluteDir = path.join(dir, relative);
    let entries;
    try {
      entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }

    // D-TEST: ¿ESTE directorio entero es un proyecto .NET que el propio SDK
    // trata como test (referencia `Microsoft.NET.Test.Sdk` en su
    // `.csproj`/`.fsproj`/`.vbproj`)? Se decide UNA vez por directorio, no por
    // archivo — mismo motivo que `dependency-tree`: no tiene sentido
    // clasificar archivo por archivo un árbol que el SDK entero trata como
    // test. Nunca se aplica a la raíz del análisis (`relative === ""`): un
    // proyecto de test no puede SER el repo entero que se está analizando.
    if (relative !== "") {
      const fileNames = entries.filter((e) => e.isFile()).map((e) => e.name);
      const dotnetTestDir = await excludedDotnetTestProjectDir(absoluteDir, fileNames);
      if (dotnetTestDir) {
        opts?.onExcluded?.({ path: relative, ...dotnetTestDir });
        return;
      }
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".") continue;
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (SKIP_DIRS.has(entry.name)) {
        if (entry.isDirectory()) {
          opts?.onExcluded?.({
            path: rel,
            reason: "dependency-tree",
            detail: `directorio "${entry.name}" que escribe una herramienta de paquetes/build`,
          });
        }
        continue;
      }
      if (entry.isDirectory() && isTestDirName(entry.name)) {
        opts?.onExcluded?.({
          path: rel,
          reason: "test-tree",
          detail: `directorio "${entry.name}" — layout por defecto de una herramienta de test (ver ingest-exclusion.ts)`,
        });
        continue;
      }
      // `features` no entra a `isTestDirName`: el nombre solo no distingue un
      // árbol BDD real de un paquete de producción que eligió ese nombre (ver
      // la sección 4b de ingest-exclusion.ts). Se pide un `readdir` extra de
      // ESTE directorio candidato, y sólo se poda si tiene Gherkin adentro.
      if (entry.isDirectory() && isFeaturesDirName(entry.name)) {
        const gherkin = await excludedGherkinFeaturesDir(path.join(dir, rel));
        if (gherkin) {
          opts?.onExcluded?.({ path: rel, ...gherkin });
          continue;
        }
        // Sin Gherkin adentro: no es un árbol de test, cae al walk normal de abajo.
      }
      if (entry.isDirectory()) {
        await walk(rel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!BY_EXTENSION.has(path.extname(entry.name).toLowerCase())) continue;
      try {
        const stat = await fs.stat(path.join(dir, rel));
        if (stat.size > MAX_FILE_BYTES) continue;
        const classified = await classifyFile(path.join(dir, rel), rel);
        if (classified.exclusion) {
          opts?.onExcluded?.({ path: rel, ...classified.exclusion });
          continue;
        }
        out.push({ path: rel, mtimeMs: stat.mtimeMs, size: stat.size });
        provenance.push(classified.provenance);
      } catch {
        /* vanished mid-walk */
      }
    }
  };

  await walk("");

  /* N10/P11 — SEGUNDA FASE: procedencia ajena.
   *
   * Las otras cinco categorías se contestan mirando UN archivo y por eso se
   * aplican durante el recorrido. Ésta no: "ajeno" quiere decir "su cabecera
   * atribuye la autoría a alguien distinto de a quien se la atribuye la
   * abrumadora mayoría de los archivos de ESTE repo", y esa mayoría no existe
   * hasta que se vieron todos. Así que se decide acá, con las firmas que el
   * recorrido ya juntó (cero lecturas extra), y sobre exactamente la población
   * que iba a analizarse: los árboles de dependencias y de test ya quedaron
   * podados arriba, así que no votan qué es la convención del repo — que es lo
   * correcto, porque la compuerta de cobertura es una fracción y su
   * denominador define qué significa "la convención de este repo".
   *
   * Se filtra ANTES de ordenar: `provenance[i]` está alineado con `out[i]` por
   * el orden del recorrido, no por el orden final.
   *
   * Si el repo no tiene procedencia dominante —9 de los 13 repos del corpus—
   * no se toca ni un archivo y esto cuesta un recorrido del arreglo.
   */
  const dominant = dominantProvenance(provenance);
  if (dominant !== null) {
    const kept: ScannedFile[] = [];
    for (let i = 0; i < out.length; i++) {
      const file = out[i]!;
      const foreign = excludedByProvenance(provenance[i] ?? null, dominant);
      if (foreign) {
        opts?.onExcluded?.({ path: file.path, ...foreign });
        continue;
      }
      kept.push(file);
    }
    return kept.sort((a, b) => a.path.localeCompare(b.path));
  }

  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Cheap fingerprint of a working tree: path, size and mtime of every analysable
 * file. Walking is fast; parsing is not, so this decides whether to reuse a
 * cached analysis. Unlike a commit sha it also covers uncommitted work, which
 * is the normal state of a task in progress.
 */
export async function worktreeSignature(dir: string): Promise<string> {
  const files = await collectFiles(dir);
  const text = files.map((f) => `${f.path}:${f.size}:${Math.round(f.mtimeMs)}`).join("\n");
  return hashOf(text);
}
