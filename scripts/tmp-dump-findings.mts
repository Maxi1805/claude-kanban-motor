import path from "node:path";
import { analyzeRepo } from "../src/server/services/code-analyzer.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  const analysis = await analyzeRepo({ dir: path.resolve(dir!), repoName: slug!, limits: { maxFindings: "unlimited" } });
  for (const f of analysis.findings) {
    const h = f.hypotheses?.find((x) => x.pattern === "Template Method");
    if (!h) continue;
    console.log(
      JSON.stringify(
        {
          title: f.title,
          locations: f.locations,
          state: h.state,
          checks: h.checks,
          places: h.places,
        },
        null,
        2,
      ),
    );
  }
}
main();
