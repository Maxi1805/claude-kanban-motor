/**
 * Verificación C2 (Ola U) de los casos REALES del `PLAN-INTENCIONES.md`,
 * archivo por archivo — corre `analyzeFile` (el camino de producción, con la
 * sonda de lenguaje de producción) sobre un archivo puntual del corpus y
 * vuelca los `SymbolFacts` que interesan.
 *
 * Uso: npx tsx scripts/probes/u-c2-verificar-casos.mts
 */
import { analyzeFile } from "../../src/server/services/code-analyzer.js";

const CORPUS = "/home/maxi1805/claude-kanban/corpus";

async function symbolsOf(repo: string, rel: string) {
  const facts = await analyzeFile({ dir: `${CORPUS}/${repo}`, path: rel });
  if (!facts) throw new Error(`sin facts: ${repo}/${rel}`);
  return facts.symbols;
}

function show(title: string, rows: readonly { name: string; container: readonly string[]; family: string; nodeType: string; startLine: number; returnType?: string }[]) {
  console.log(`\n── ${title}`);
  if (rows.length === 0) {
    console.log("   (ninguno)");
    return;
  }
  for (const s of rows) {
    console.log(
      `   ${[...s.container, s.name].join(".").padEnd(48)} family=${s.family.padEnd(13)} nodeType=${s.nodeType.padEnd(22)} línea=${String(s.startLine).padEnd(5)}${s.returnType ? ` retorno=${s.returnType}` : ""}`,
    );
  }
}

/* HUECO #2 — el caso del plan, verbatim: `BsonObject`/`BsonArray`. */
{
  const syms = await symbolsOf("newtonsoft-json", "Src/Newtonsoft.Json/Bson/BsonToken.cs");
  show(
    "HUECO #2 · newtonsoft-json/Src/Newtonsoft.Json/Bson/BsonToken.cs — GetEnumerator",
    syms.filter((s) => s.name === "GetEnumerator"),
  );
}

/* HUECO #1 — Null Object canónico del plan (§5): guava CharStreams.NullWriter. */
{
  const syms = await symbolsOf("guava", "guava/src/com/google/common/io/CharStreams.java");
  show(
    "HUECO #1/#2 · guava/.../io/CharStreams.java — miembros de NullWriter",
    syms.filter((s) => s.container.includes("NullWriter")),
  );
}

/* HUECO #1 — Iterator (§11): un campo de colección asignado en el constructor. */
{
  const syms = await symbolsOf("click", "src/click/core.py");
  show(
    "HUECO #1 · click/src/click/core.py — campos de Context declarados en __init__ (primeros 12)",
    syms.filter((s) => s.family === "other" && s.container.join(".") === "Context").slice(0, 12),
  );
}

/* HUECO #1 — Ruby: el nombre SIN `@`. */
{
  const syms = await symbolsOf("rubocop", "lib/rubocop/cop/registry.rb");
  show(
    "HUECO #1 · rubocop/lib/rubocop/cop/registry.rb — campos de Registry",
    syms.filter((s) => s.family === "other" && s.container.join(".").endsWith("Registry")),
  );
}

/* HUECO #1 — TypeScript. */
{
  const syms = await symbolsOf("nest", "packages/core/interceptors/interceptors-consumer.ts");
  show(
    "HUECO #1 · nest/packages/core/interceptors/interceptors-consumer.ts",
    syms.filter((s) => s.family === "other"),
  );
}

/* HUECO #1 — Singleton (§1): guava TypeResolver.WildcardCapturer. */
{
  const syms = await symbolsOf("guava", "guava/src/com/google/common/reflect/TypeResolver.java");
  show(
    "HUECO #1 · guava/.../reflect/TypeResolver.java — miembros de WildcardCapturer",
    syms.filter((s) => s.container.includes("WildcardCapturer")),
  );
}
