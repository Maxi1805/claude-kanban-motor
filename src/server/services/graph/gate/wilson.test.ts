import { describe, expect, it } from "vitest";

import { wilsonInterval } from "./wilson.js";

describe("wilsonInterval", () => {
  it("sin observaciones, devuelve el intervalo máximo [0,1]", () => {
    expect(wilsonInterval(0, 0)).toEqual({ lower: 0, upper: 1 });
  });

  it("90/90 (el caso `accepted` del spike): cota inferior por encima de 0,95", () => {
    const { lower, upper } = wilsonInterval(90, 90);
    expect(lower).toBeGreaterThan(0.95);
    expect(upper).toBe(1);
  });

  it("0/20 (el caso `scope` del spike): cota superior acotada, no explota a 1", () => {
    const { lower, upper } = wilsonInterval(0, 20);
    expect(lower).toBe(0);
    expect(upper).toBeLessThan(0.2);
  });

  it("es simétrico alrededor de 0,5 cuando la muestra es 50/50", () => {
    const { lower, upper } = wilsonInterval(50, 100);
    expect(lower).toBeCloseTo(1 - upper, 10);
  });

  it("crece la certeza (intervalo más angosto) con más observaciones a igual proporción", () => {
    const small = wilsonInterval(21, 40);
    const large = wilsonInterval(210, 400);
    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
  });
});
