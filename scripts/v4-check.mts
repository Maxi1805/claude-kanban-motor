import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

const [, , dir, slug, kind] = process.argv;
const { analysis } = await analyzeRepoCached({ dir: dir!, repoName: slug!, limits: { maxFindings: "unlimited" } });
for (const f of analysis.findings) {
  if (kind === "TEXT") {
    if (!f.title.includes("_currentState")) continue;
  } else if (kind && f.kind !== kind) continue;
  console.log(`${f.kind} :: ${f.title} :: hyps=${(f.hypotheses ?? []).map((h) => `${h.pattern}:${h.state}`).join(",")}`);
  for (const l of f.locations) console.log(`   ${l.file}:${l.startLine} ${l.symbol ?? ""}`);
}
