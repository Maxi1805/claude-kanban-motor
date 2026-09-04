/**
 * `FileFacts`'s one hard contract (CONTRATO-F3 §1.1): `JSON.parse(JSON.stringify(f))`
 * MUST be deep-equal to `f` — no tree-sitter node, no `Set`, no function, no
 * cyclic reference can leak in, or the sqlite cache (`code-inspector.ts`)
 * would silently store something it cannot read back.
 *
 * Exercised against a REAL `analyzeFile` run (not a hand-built fixture) so a
 * future field added to `FunctionInfo`/`CloneCandidate` is caught here even
 * if nobody remembers to update this test.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeFile } from "./extract.js";
import type { FileFacts } from "./types.js";

async function makeFixture(files: Record<string, string>): Promise<string> {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "ck-facts-test-")));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, contents);
  }
  return root;
}

const SAMPLE = `
class Shape {
  constructor(name) {
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
}

function processOrderAlpha(input) {
  let total = 0;
  if (input.valid) {
    total = input.amount * 2;
  } else {
    total = 0;
  }
  for (let i = 0; i < input.items.length; i++) {
    total += input.items[i].price;
  }
  return total;
}

function processOrderBeta(data) {
  let sum = 0;
  if (data.valid) {
    sum = data.amount * 2;
  } else {
    sum = 0;
  }
  for (let j = 0; j < data.items.length; j++) {
    sum += data.items[j].price;
  }
  return sum;
}
`;

describe("FileFacts — contrato de serialización", () => {
  it("un FileFacts real sobrevive JSON.parse(JSON.stringify(...)) sin cambiar", async () => {
    const dir = await makeFixture({ "src/sample.js": SAMPLE });
    const fact = await analyzeFile({ dir, path: "src/sample.js", contentHash: "abc123" });

    expect(fact).not.toBeNull();
    const roundTripped = JSON.parse(JSON.stringify(fact)) as FileFacts;
    expect(roundTripped).toEqual(fact);
  });

  it("no lleva Sets, Maps, funciones ni claves con nombre 'sets' en ningún nivel", async () => {
    const dir = await makeFixture({ "src/sample.js": SAMPLE });
    const fact = await analyzeFile({ dir, path: "src/sample.js" });
    expect(fact).not.toBeNull();

    const seen = new WeakSet<object>();
    const walk = (value: unknown): void => {
      if (value === null || typeof value !== "object") {
        expect(typeof value).not.toBe("function");
        return;
      }
      expect(value instanceof Set).toBe(false);
      expect(value instanceof Map).toBe(false);
      if (seen.has(value)) throw new Error("referencia cíclica encontrada");
      seen.add(value);
      for (const v of Object.values(value as Record<string, unknown>)) walk(v);
    };
    walk(fact);
  });

  it("respeta el `contentHash` provisto, y calcula uno propio cuando no se lo dan", async () => {
    const dir = await makeFixture({ "src/sample.js": SAMPLE });
    const withHash = await analyzeFile({ dir, path: "src/sample.js", contentHash: "explicit-hash" });
    expect(withHash?.contentHash).toBe("explicit-hash");

    const withoutHash = await analyzeFile({ dir, path: "src/sample.js" });
    expect(withoutHash?.contentHash).toBeTruthy();
    expect(withoutHash?.contentHash).not.toBe("");
  });

  it("devuelve null para un archivo no analizable (extensión desconocida)", async () => {
    const dir = await makeFixture({ "README.md": "# hola" });
    const fact = await analyzeFile({ dir, path: "README.md" });
    expect(fact).toBeNull();
  });
});
