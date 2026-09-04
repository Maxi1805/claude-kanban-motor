/**
 * F3 — `analyzeFile`, as its own importable module.
 *
 * Real implementation in `code-analyzer.ts` (the "F3" section, right above
 * `crossAnalyze`) — see `facts/types.ts`'s docstring for why this is a
 * re-export rather than the owning file: moving the walk/language machinery
 * here would take every lexicon-inventoried constant it uses out of
 * `no-unlisted-lexicon.test.ts`'s scanned-file list with it.
 */
export { analyzeFile } from "../code-analyzer.js";
export type { AnalyzeFileInput } from "../code-analyzer.js";
