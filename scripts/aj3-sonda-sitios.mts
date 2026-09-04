/**
 * OLA AJ, FRENTE AJ3 — SONDA DE SITIOS DE ARMADO POR LENGUAJE.
 *
 * La pregunta que el embudo deja abierta: cuando el camino nuevo muere en
 * `sin-sitio-de-armado-en-las-copias` (593 LIB + 756 APP), ¿es porque el
 * fragmento duplicado de verdad no construye nada, o porque `assemblySitesOf`
 * no sabe LEER la construcción de ese lenguaje? Sin esta medición la respuesta
 * sería una suposición.
 *
 * Revive N archivos reales por lenguaje con el MISMO arnés que los tests
 * (`parseRoot` + `nodeSetsFor`, sondas por lenguaje) y cuenta los sitios que
 * `assemblySitesOf` encuentra. NO corre el analizador.
 *
 * Uso: npx tsx scripts/aj3-sonda-sitios.mts
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { assemblySitesOf, ASSEMBLY_SITE_BUDGET } from "../src/server/services/detect/intra-file/repeated-configured-assembly.js";
import { nodeSetsFor, parseRoot } from "../src/server/services/detect/testing.js";

const SONDAS: Record<string, { wasm: string; probe: string; ext: string; dirs: string[] }> = {
  java: { wasm: "tree-sitter-java.wasm", ext: "java", dirs: ["corpus/guava", "corpus-app/jenkins"], probe: "class P { int f; P(int x){ this.f = x; } int m(int y){ return y; } }" },
  csharp: { wasm: "tree-sitter-c_sharp.wasm", ext: "cs", dirs: ["corpus/newtonsoft-json", "corpus-app/ShareX"], probe: "class P { int f; public P(int x){ f = x; } int M(int y){ return y; } }" },
  go: { wasm: "tree-sitter-go.wasm", ext: "go", dirs: ["corpus/hugo", "corpus-app/gitea"], probe: "package p\ntype P struct{ f int }\nfunc (p *P) M(y int) int { return y }\n" },
  python: { wasm: "tree-sitter-python.wasm", ext: "py", dirs: ["corpus/sqlalchemy", "corpus-app/netbox"], probe: "class P:\n    def __init__(self, x):\n        self.f = x\n    def m(self, y):\n        return y\n" },
  ruby: { wasm: "tree-sitter-ruby.wasm", ext: "rb", dirs: ["corpus/rubocop", "corpus-app/redmine"], probe: "class P\n  def initialize(x)\n    @f = x\n  end\n  def m(y)\n    y\n  end\nend\n" },
  typescript: { wasm: "tree-sitter-typescript.wasm", ext: "ts", dirs: ["corpus/nest", "corpus-app/Ghost"], probe: "class P { f: number; constructor(x: number){ this.f = x; } m(y: number): number { return y; } }" },
  javascript: { wasm: "tree-sitter-javascript.wasm", ext: "js", dirs: ["corpus/eslint", "corpus-app/Ghost"], probe: "class P { constructor(x){ this.f = x; } m(y){ return y; } }" },
};

const N = 40;
for (const [lang, s] of Object.entries(SONDAS)) {
  const sets = await nodeSetsFor(s.wasm, s.probe);
  for (const dir of s.dirs) {
    let files: string[] = [];
    try {
      files = execSync(`find ${dir} -name '*.${s.ext}' -type f | head -${N}`, { encoding: "utf8" }).trim().split("\n").filter(Boolean);
    } catch { /* repo sin ese lenguaje */ }
    if (files.length === 0) { console.log(`${lang.padEnd(11)} ${dir.padEnd(22)} sin archivos .${s.ext}`); continue; }
    let sitios = 0, conSitio = 0, conRanuras4 = 0;
    const tipos = new Map<string, number>();
    for (const f of files) {
      try {
        const root = await parseRoot(s.wasm, readFileSync(f, "utf8"));
        const ss = assemblySitesOf(root, sets, ASSEMBLY_SITE_BUDGET);
        sitios += ss.length;
        if (ss.length > 0) conSitio++;
        for (const x of ss) {
          tipos.set(x.typeName, (tipos.get(x.typeName) ?? 0) + 1);
          if (x.slots.length >= 4) conRanuras4++;
        }
      } catch { /* archivo que la gramática no parsea */ }
    }
    const top = [...tipos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}×${v}`).join(", ");
    console.log(`${lang.padEnd(11)} ${dir.padEnd(22)} archivos ${String(files.length).padStart(3)} · con sitio ${String(conSitio).padStart(3)} · sitios ${String(sitios).padStart(5)} · con >=4 ranuras ${String(conRanuras4).padStart(4)} · top: ${top}`);
  }
}
