import fs from "node:fs";
import { nodeSetsFor, fileUnitFrom, parseRoot, testContext } from "./src/server/services/detect/testing.js";
import { detector } from "./src/server/services/detect/intra-file/repeated-switch.js";

const PYTHON_PROBE = `
import os
from typing import Optional, Protocol
from dataclasses import dataclass

class Shape(Base):
    def __init__(self, name, opts=None):
        self.name = name

    def area(self, x, y, z, w, v, u):
        if x > 0:
            return 1
        elif x < 0:
            return 2
        else:
            return 3

    def describe(self, kind):
        match kind:
            case "circle":
                return "circle"
            case "square" | "rect":
                return "square"
            case _:
                return "unknown"

    def loopy(self):
        while True:
            break
        for i in range(3):
            print(i)
        try:
            risky()
        except Exception as e:
            handle(e)
        finally:
            cleanup()
        with open("f") as fh:
            read(fh)

    def ternary(self, x):
        return 1 if x > 0 else 2

class Multi(Shape, Protocol):
    pass

@dataclass
class Point:
    x: int
    y: int

def annotated(x: int, y: str = "a") -> bool:
    return True

async def fetch():
    await something()

def generator():
    yield 1

def raiser():
    raise ValueError("bad")

helper = lambda x: x + 1
squares = [x * x for x in range(10)]
`;

async function main() {
  const sets = await nodeSetsFor("tree-sitter-python.wasm", PYTHON_PROBE);
  console.log("switchContainerNodes:", [...sets.switchContainerNodes]);

  const source = fs.readFileSync(
    "/home/maxi1805/claude-kanban/corpus/sqlalchemy/lib/sqlalchemy/testing/suite/test_table_via_select.py",
    "utf8",
  );
  const root = await parseRoot("tree-sitter-python.wasm", source);
  const file = fileUnitFrom(root, sets, "python", { file: "test_table_via_select.py" });
  console.log("functions found:", file.functions.length);
  const ctx = testContext(detector, "python", []);
  const findings = detector.run(file, ctx as never);
  console.log("findings:", findings.length);
  for (const f of findings) {
    console.log("-", f.title, "locations:", f.locations.length);
  }
}

main();
