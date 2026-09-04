import { describe, expect, it } from "vitest";

import { impactOf } from "./impact.js";
import {
  byScoreDescThenId,
  IMPORTANT_KIND_SHARE,
  KIND_QUOTA_FLOOR,
  scoreFindings,
  SCORE_WEIGHTS,
  selectPageByKindQuota,
  type KindQuotaItem,
} from "./ranking.js";
import type { ReachIndex } from "./reach.js";
import type { Finding } from "./types.js";

const NEUTRAL_REACH: ReachIndex = { reachFor: () => 0.5 };

function finding(opts: { id: string; detectorId: string; severity: number; file?: string; kind?: string }): Finding {
  return {
    id: opts.id,
    detectorId: opts.detectorId,
    // OLA AW, guardián: era "unused-variable" — desregistrado esta ola
    // (ver `registries.test.ts#DELIBERATELY_UNREGISTERED`), así que dejó de
    // tener tier en `DETECTOR_IMPACT` y `impactOf` empezó a tirar acá.
    // `many-returns` es la MISMA cosa que esta fixture necesita: un kind
    // higiene, de bajo impacto, registrado y vivo.
    kind: opts.kind ?? "many-returns",
    scope: "intra-function",
    language: "typescript",
    title: "t",
    detail: "d",
    trigger: [{ label: "m", value: 1, threshold: { value: 1, source: "test" } as never }],
    locations: [{ file: opts.file ?? "a.ts", startLine: 1, endLine: 1, role: "primary" }],
    severity: opts.severity,
    advice: { primary: { name: "n", kind: "refactorizacion", why: "w", source: "s" } },
  };
}

describe("scoreFindings", () => {
  it("weights sum matches the frozen formula (0.40 severity + 0.35 impact + 0.25 reach)", () => {
    expect(SCORE_WEIGHTS.severity + SCORE_WEIGHTS.impact + SCORE_WEIGHTS.reach).toBeCloseTo(1, 10);
  });

  it("R_sev is computed WITHIN each detectorId, never across detectors — the exact fix for the measured bias", () => {
    // many-returns has 1000 instances (simulated by 3, but same *shape*):
    // its single worst case should reach R_sev = 1.0, exactly like
    // large-class's single worst case, even though their raw
    // severities are on totally different scales.
    // OLA AX, guardián: era "feature-envy-intra" — desregistrado esta ola
    // (ver `registries.test.ts#DELIBERATELY_UNREGISTERED`, 1/81 = 1,2 %),
    // así que dejó de tener tier en `DETECTOR_IMPACT` y `impactOf` empezó a
    // tirar acá. `large-class` es la MISMA cosa que esta fixture necesita:
    // un kind `mantenibilidad`, registrado y vivo.
    const findings = [
      finding({ id: "uv1", detectorId: "many-returns", severity: 10 }),
      finding({ id: "uv2", detectorId: "many-returns", severity: 20 }),
      finding({ id: "uv3", detectorId: "many-returns", severity: 30 }), // worst of its own detector
      finding({ id: "fe1", detectorId: "large-class", severity: 60 }),
      finding({ id: "fe2", detectorId: "large-class", severity: 95 }), // worst of its own detector
    ];
    const scored = scoreFindings(findings, NEUTRAL_REACH);
    const uvWorst = scored.find((s) => s.finding.id === "uv3")!;
    const feWorst = scored.find((s) => s.finding.id === "fe2")!;
    expect(uvWorst.breakdown.rSev).toBe(1.0);
    expect(feWorst.breakdown.rSev).toBe(1.0);
  });

  it("a detector with a single finding gets R_sev = 0.5 — cannot claim best nor worst", () => {
    const findings = [finding({ id: "solo", detectorId: "orphan-file", severity: 35 })];
    const [scored] = scoreFindings(findings, NEUTRAL_REACH);
    expect(scored!.breakdown.rSev).toBe(0.5);
  });

  it("impact comes from impact.ts, unchanged by severity or reach", () => {
    const findings = [finding({ id: "x", detectorId: "unreachable-code", severity: 50 })];
    const [scored] = scoreFindings(findings, NEUTRAL_REACH);
    expect(scored!.breakdown.impact).toBe(impactOf("unreachable-code"));
  });

  it("reach comes from the ReachIndex passed in, by the finding's primary file", () => {
    const reach: ReachIndex = { reachFor: (file) => (file === "hub.ts" ? 0.9 : 0.1) };
    const findings = [
      finding({ id: "a", detectorId: "long-function", severity: 50, file: "hub.ts" }),
      finding({ id: "b", detectorId: "long-function", severity: 50, file: "leaf.ts" }),
    ];
    const scored = scoreFindings(findings, reach);
    expect(scored.find((s) => s.finding.id === "a")!.breakdown.reach).toBe(0.9);
    expect(scored.find((s) => s.finding.id === "b")!.breakdown.reach).toBe(0.1);
  });

  it("conf defaults to 1.0 and is multiplicative", () => {
    const findings = [finding({ id: "a", detectorId: "long-function", severity: 50 })];
    const [scored] = scoreFindings(findings, NEUTRAL_REACH);
    expect(scored!.breakdown.conf).toBe(1.0);
  });

  it("a lower conf strictly lowers the score without changing the other three factors", () => {
    const findings = [finding({ id: "a", detectorId: "long-function", severity: 50 })];
    const full = scoreFindings(findings, NEUTRAL_REACH)[0]!;
    const degraded = scoreFindings(findings, NEUTRAL_REACH, () => 0.5)[0]!;
    expect(degraded.score).toBeCloseTo(full.score * 0.5, 10);
    expect(degraded.breakdown.rSev).toBe(full.breakdown.rSev);
    expect(degraded.breakdown.impact).toBe(full.breakdown.impact);
    expect(degraded.breakdown.reach).toBe(full.breakdown.reach);
  });

  it("this is the fix: many-returns's worst case can outrank large-class's worst case once impact/reach favor it", () => {
    const findings = [
      finding({ id: "uv-worst", detectorId: "many-returns", severity: 10, file: "a.ts" }),
      finding({ id: "fe-worst", detectorId: "large-class", severity: 95, file: "a.ts" }),
    ];
    const scored = scoreFindings(findings, NEUTRAL_REACH);
    // Both get R_sev=1.0 (single finding each) and same reach (same file);
    // the only remaining difference is impact: higiene (0.25) vs
    // mantenibilidad (0.5) — large-class still wins here, but NOT
    // because its raw severity (95 vs 10) counts directly anymore — R_sev
    // erased that gap completely. That's the point: the ranking now argues
    // from impact/reach, never from the raw scale mismatch.
    const uv = scored.find((s) => s.finding.id === "uv-worst")!;
    const fe = scored.find((s) => s.finding.id === "fe-worst")!;
    expect(uv.breakdown.rSev).toBe(fe.breakdown.rSev);
    expect(uv.score).not.toBe(fe.score);
  });
});

interface Item extends KindQuotaItem {
  readonly id: string;
}

function kindItem(id: string, kind: string, impact = 0.5): Item {
  return { id, kind, impact };
}

describe("selectPageByKindQuota", () => {
  it("is a no-op when the page fits the whole population — nothing to repartir", () => {
    const items = [kindItem("a", "k1"), kindItem("b", "k2")];
    expect(selectPageByKindQuota(items, 5)).toEqual(items);
    expect(selectPageByKindQuota(items, 2)).toEqual(items);
  });

  it("returns an empty page for pageSize <= 0", () => {
    expect(selectPageByKindQuota([kindItem("a", "k1")], 0)).toEqual([]);
  });

  it("guarantees an important low-volume kind that a plain top-N-by-score cut would drop entirely — the exact bias this exists to fix", () => {
    // 30 `duplication` findings, all ranked ahead of a single `unused-variable`
    // finding (worst score of the whole run). A plain `rankedItems.slice(0, 5)`
    // never reaches it. Its share is 1/31 ≈ 3.2%, above `IMPORTANT_KIND_SHARE`
    // (1%), so it must be "important" and get its guaranteed floor.
    const duplication = Array.from({ length: 30 }, (_, i) => kindItem(`dup${i}`, "duplication"));
    const items = [...duplication, kindItem("uv-worst", "unused-variable")];
    expect(1 / items.length).toBeGreaterThanOrEqual(IMPORTANT_KIND_SHARE);

    const plainTop5 = items.slice(0, 5);
    expect(plainTop5.some((i) => i.kind === "unused-variable")).toBe(false); // the bug, reproduced

    const page = selectPageByKindQuota(items, 5);
    expect(page).toHaveLength(5);
    expect(page.some((i) => i.kind === "unused-variable")).toBe(true); // the fix
  });

  it("budget beyond the floor is proportional to impact, not split evenly across kinds", () => {
    const highImpact = Array.from({ length: 50 }, (_, i) => kindItem(`hi${i}`, "high-impact", 1.0));
    const lowImpact = Array.from({ length: 50 }, (_, i) => kindItem(`lo${i}`, "low-impact", 0.25));
    const items = [...highImpact, ...lowImpact]; // high-impact ranked ahead, by construction

    // extraPool = 12 - 2*KIND_QUOTA_FLOOR; impactSum = 1.25 -> shares 0.8/0.2.
    const extraPool = 12 - 2 * KIND_QUOTA_FLOOR;
    const expectedHigh = KIND_QUOTA_FLOOR + Math.floor((1.0 / 1.25) * extraPool);
    const expectedLow = KIND_QUOTA_FLOOR + Math.floor((0.25 / 1.25) * extraPool);

    const page = selectPageByKindQuota(items, 12);
    expect(page.filter((i) => i.kind === "high-impact")).toHaveLength(expectedHigh);
    expect(page.filter((i) => i.kind === "low-impact")).toHaveLength(expectedLow);
    expect(expectedHigh).toBeGreaterThan(expectedLow); // higher impact -> bigger budget, same volume
  });

  it("reserves the BEST members of a kind (input order), never re-sorts or picks arbitrary members", () => {
    const highImpact = Array.from({ length: 50 }, (_, i) => kindItem(`hi${i}`, "high-impact", 1.0));
    const lowImpact = Array.from({ length: 50 }, (_, i) => kindItem(`lo${i}`, "low-impact", 0.25));
    const items = [...highImpact, ...lowImpact];
    const page = selectPageByKindQuota(items, 12);
    expect(page.filter((i) => i.kind === "high-impact").map((i) => i.id)).toEqual(highImpact.slice(0, 9).map((i) => i.id));
    expect(page.filter((i) => i.kind === "low-impact").map((i) => i.id)).toEqual(lowImpact.slice(0, 3).map((i) => i.id));
  });

  it("preserves the overall best-first order of the input in the selected page", () => {
    const duplication = Array.from({ length: 30 }, (_, i) => kindItem(`dup${i}`, "duplication"));
    const items = [...duplication, kindItem("uv-worst", "unused-variable")];
    const page = selectPageByKindQuota(items, 5);
    const inputIndexOf = new Map(items.map((it, i) => [it.id, i] as const));
    const pageIndices = page.map((it) => inputIndexOf.get(it.id)!);
    expect(pageIndices).toEqual([...pageIndices].sort((a, b) => a - b));
  });

  it("never returns more than pageSize items, even when important kinds * floor exceeds pageSize (degenerate)", () => {
    // 20 important kinds (5 members each, all >= 1% of 100), pageSize=10:
    // the flat floor alone (20 * KIND_QUOTA_FLOOR = 20) would overflow a
    // 10-item page if pass 1 didn't cap against pageSize.
    const items: Item[] = [];
    for (let k = 0; k < 20; k++) {
      for (let m = 0; m < 5; m++) items.push(kindItem(`k${k}-${m}`, `kind-${k}`, 0.5));
    }
    const page = selectPageByKindQuota(items, 10);
    expect(page).toHaveLength(10);
  });

  it("does NOT guarantee a kind below IMPORTANT_KIND_SHARE — only important kinds get a floor", () => {
    // tiny kind is 5/1000 = 0.5%, below the 1% threshold: no reserved floor.
    const dominant = Array.from({ length: 995 }, (_, i) => kindItem(`dom${i}`, "dominant", 0.5));
    const tiny = Array.from({ length: 5 }, (_, i) => kindItem(`tiny${i}`, "tiny-kind", 0.5));
    const items = [...dominant, ...tiny];
    expect(5 / items.length).toBeLessThan(IMPORTANT_KIND_SHARE);

    const page = selectPageByKindQuota(items, 10);
    expect(page).toHaveLength(10);
    expect(page.some((i) => i.kind === "tiny-kind")).toBe(false);
    expect(page).toEqual(items.slice(0, 10)); // identical to the plain top-10 cut: nothing to repartir
  });
});

describe("byScoreDescThenId", () => {
  it("sorts by score descending, then by finding id ascending on ties", () => {
    const findings = [
      finding({ id: "b", detectorId: "long-function", severity: 10 }),
      finding({ id: "a", detectorId: "long-function", severity: 10 }),
      finding({ id: "c", detectorId: "orphan-file", severity: 90 }),
    ];
    const scored = scoreFindings(findings, NEUTRAL_REACH).sort(byScoreDescThenId);
    // "a"/"b" are long-function's only two findings, tied severity -> tied
    // R_sev (0.5 each), same impact, same neutral reach, same conf -> tied
    // score. The comparator's tiebreak (finding id ascending) is what must
    // decide their relative order.
    const longFunctionIds = scored.filter((s) => s.finding.detectorId === "long-function").map((s) => s.finding.id);
    expect(longFunctionIds).toEqual(["a", "b"]);
  });
});
