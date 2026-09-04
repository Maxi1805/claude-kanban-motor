import fs from "node:fs";
import { nodeSetsFor, fileUnitFrom, parseRoot, testContext } from "./src/server/services/detect/testing.js";
import { detector } from "./src/server/services/detect/intra-file/self-referential-member.js";

const CSHARP_PROBE = `
class Folder {
  private Folder parent;
  void Render() {}
}
`;
const JAVA_PROBE = `
class Folder {
  private List<Folder> children;
  private Folder parent;
  void render() {}
}
`;

async function checkFile(wasm: string, probe: string, language: string, path: string, label: string) {
  const sets = await nodeSetsFor(wasm, probe);
  const source = fs.readFileSync(path, "utf8");
  const root = await parseRoot(wasm, source);
  const file = fileUnitFrom(root, sets, language, { file: path });
  const ctx = testContext(detector, language, ["unidad-tipo-clase", "tipos-explicitos"]);
  const findings = detector.run(file, ctx as never);
  console.log(`\n=== ${label} (${findings.length} hallazgo(s)) ===`);
  for (const f of findings) {
    console.log(" ", f.title);
    for (const l of f.locations) console.log("   -", l.role, `[línea ${l.startLine}]`);
  }
}

async function main() {
  await checkFile(
    "tree-sitter-c_sharp.wasm",
    CSHARP_PROBE,
    "csharp",
    "/home/maxi1805/claude-kanban/corpus/newtonsoft-json/Src/Newtonsoft.Json/Linq/IJEnumerable.cs",
    "IJEnumerable.cs (falso medido — esperado: 0)",
  );
  await checkFile(
    "tree-sitter-java.wasm",
    JAVA_PROBE,
    "java",
    "/home/maxi1805/claude-kanban/corpus/guava/android/guava/src/com/google/common/collect/RegularImmutableBiMap.java",
    "RegularImmutableBiMap.java (dudoso medido — esperado tras arreglo: 0)",
  );
  await checkFile(
    "tree-sitter-java.wasm",
    JAVA_PROBE,
    "java",
    "/home/maxi1805/claude-kanban/corpus/guava/android/guava/src/com/google/common/collect/ImmutableSetMultimap.java",
    "ImmutableSetMultimap.java (dudoso medido — esperado tras arreglo: 0)",
  );
  await checkFile(
    "tree-sitter-java.wasm",
    JAVA_PROBE,
    "java",
    "/home/maxi1805/claude-kanban/corpus/guava/guava-gwt/src-super/com/google/common/collect/super/com/google/common/collect/SingletonImmutableBiMap.java",
    "SingletonImmutableBiMap.java (dudoso medido — esperado tras arreglo: 0)",
  );
  await checkFile(
    "tree-sitter-java.wasm",
    JAVA_PROBE,
    "java",
    "/home/maxi1805/claude-kanban/corpus/guava/android/guava/src/com/google/common/collect/ImmutableListMultimap.java",
    "ImmutableListMultimap.java (dudoso medido — esperado tras arreglo: 0)",
  );
  // Casos que DEBEN seguir intactos (no regresión):
  await checkFile(
    "tree-sitter-java.wasm",
    JAVA_PROBE,
    "java",
    "/home/maxi1805/claude-kanban/corpus/guava/android/guava/src/com/google/common/collect/MinMaxPriorityQueue.java",
    "MinMaxPriorityQueue.java (Heap — dudoso; no-generic, no debe cambiar)",
  );
  await checkFile(
    "tree-sitter-java.wasm",
    JAVA_PROBE,
    "java",
    "/home/maxi1805/claude-kanban/corpus/guava/android/guava/src/com/google/common/collect/Sets.java",
    "Sets.java (UnmodifiableNavigableSet — dudoso; mismo parámetro <E>, no debe cambiar)",
  );
}

main();
