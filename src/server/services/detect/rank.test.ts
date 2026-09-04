import { describe, expect, it } from "vitest";

import { normalizedRanks } from "./rank.js";

describe("normalizedRanks", () => {
  it("returns 0.5 for a single value — cannot claim best nor worst", () => {
    expect(normalizedRanks([42])).toEqual([0.5]);
  });

  it("returns [] for an empty group", () => {
    expect(normalizedRanks([])).toEqual([]);
  });

  it("maps the lowest value to 0 and the highest to 1", () => {
    expect(normalizedRanks([10, 30, 20])).toEqual([0, 1, 0.5]);
  });

  it("gives ties the shared average position (fractional rank)", () => {
    // Sorted ascending: 5, 5, 5, 10 -> positions 0,1,2 average to 1, /3 = 1/3; 10 -> 3/3 = 1.
    expect(normalizedRanks([5, 10, 5, 5])).toEqual([1 / 3, 1, 1 / 3, 1 / 3]);
  });

  it("is invariant to any monotonic transform of the input (the point of using rank, not value)", () => {
    const raw = [1, 400, 2, 3, 2];
    const logged = raw.map((v) => Math.log1p(v));
    expect(normalizedRanks(logged)).toEqual(normalizedRanks(raw));
  });

  it("a run of all-equal values collapses to 0.5 for every member", () => {
    expect(normalizedRanks([7, 7, 7])).toEqual([0.5, 0.5, 0.5]);
  });
});
