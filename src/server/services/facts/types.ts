/**
 * F3 — the per-file fact, as its own importable module.
 *
 * The REAL definition of `FileFacts`/`FACTS_SCHEMA_VERSION` lives in
 * `code-analyzer.ts`, right next to `analyzeFile` (which produces it) and
 * `FunctionInfo`/`CloneCandidate` (its two heaviest fields) — see that
 * file's "F3" section header for why. This module exists so a caller never
 * has to know that: `import { FileFacts } from ".../facts/types.js"` is the
 * stable name other modules (the persistent cache, the graph work of a later
 * ola) should depend on, exactly as CONTRATO-F3 §1 names it, even though the
 * implementation is not physically split into a separate file today.
 *
 * Kept a re-export rather than the owning module for a concrete reason, not
 * laziness: `no-unlisted-lexicon.test.ts` scans a FIXED list of 7 files for
 * SCREAMING_CASE list/threshold constants, anchored by line number
 * (`lexicon-inventory.json`). Moving the walk/language machinery that builds
 * a `FileFacts` into a new file would silently drop every constant it uses
 * (`MIN_CLONE_NODES`, `FACTORY_NAME`, `MAX_WALK_SLICE_MS`, ...) out of that
 * scanner's reach — invisible governance loss, not a refactor. Keeping the
 * real definitions in `code-analyzer.ts` (already scanned) and re-exporting
 * here keeps every constant inventoried while still giving every other
 * module the `facts/types.js` import path the F3 contract specifies.
 */
export type {
  FileFacts,
  FunctionInfo,
  CloneCandidate,
  IncrementalFactsCache,
} from "../code-analyzer.js";
export { FACTS_SCHEMA_VERSION } from "../code-analyzer.js";
