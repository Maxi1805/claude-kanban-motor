/**
 * `repo-name-index.test.ts` — Ola AW · AW6.
 *
 * Cada caso de este archivo es un caso REAL del corpus, reducido al mínimo y
 * nombrado con el repo y el archivo de donde salió, para que quien lo lea
 * pueda ir a mirarlo. No hay ningún caso inventado.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { normalizeName, repoNameIndex } from "./repo-name-index.js";
import type { RepoUnit } from "../types.js";

const raices: string[] = [];

function repoDe(archivos: Record<string, string>): RepoUnit {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aw6-"));
  raices.push(dir);
  for (const [rel, texto] of Object.entries(archivos)) {
    const destino = path.join(dir, rel);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, texto, "utf8");
  }
  return { repoName: "t", dir, files: [], functions: [], clones: [], graph: null };
}

afterAll(() => {
  for (const d of raices) fs.rmSync(d, { recursive: true, force: true });
});

describe("normalizeName — normaliza la CONSULTA, nunca el índice", () => {
  it("saca el sufijo de predicado de Ruby: `osx?` se busca como `osx` (jekyll, utils/platforms.rb)", () => {
    expect(normalizeName("osx?")).toBe("osx");
    expect(normalizeName("save!")).toBe("save");
  });

  it("se queda con el último segmento de un nombre calificado (chatwoot, Api::V1::Accounts::DataImportsController)", () => {
    expect(normalizeName("Api::V1::Accounts::DataImportsController")).toBe("DataImportsController");
    expect(normalizeName("Foo.Bar.Baz")).toBe("Baz");
  });

  it("saca los genéricos (newtonsoft-json, MethodCall<T, TResult>)", () => {
    expect(normalizeName("MethodCall<T, TResult>")).toBe("MethodCall");
  });
});

describe("usedOutside — la PUERTA 6", () => {
  it("un nombre que sólo aparece en el tramo de su propia declaración NO está usado afuera", () => {
    const repo = repoDe({ "a.ts": "export function soloAca() {\n  return 1;\n}\n" });
    const idx = repoNameIndex(repo);
    expect(idx.filesRead).toBeGreaterThan(0);
    expect(idx.usedOutside("soloAca", [{ file: "a.ts", startLine: 1, endLine: 3 }])).toBe(false);
  });

  it("EL CASO DEL ENCARGO — un método privado llamado desde OTRO método del MISMO archivo cae FUERA de su propio tramo y por lo tanto SÍ está usado", () => {
    const repo = repoDe({
      "c.js": "class C {\n  #privado() {\n    return 1;\n  }\n  publico() {\n    return this.#privado();\n  }\n}\n",
    });
    const idx = repoNameIndex(repo);
    expect(idx.usedOutside("privado", [{ file: "c.js", startLine: 2, endLine: 4 }])).toBe(true);
  });

  it("LEE LO QUE EL ANÁLISIS PODA — un símbolo usado sólo desde `test/` está usado (nest: 12 de 15 falsos eran esto)", () => {
    const repo = repoDe({
      "src/pipe.ts": "export class ParseEnumPipe {}\n",
      "test/pipe.spec.ts": "import { ParseEnumPipe } from '../src/pipe';\nnew ParseEnumPipe();\n",
    });
    const idx = repoNameIndex(repo);
    expect(idx.usedOutside("ParseEnumPipe", [{ file: "src/pipe.ts", startLine: 1, endLine: 1 }])).toBe(true);
  });

  it("LEE LOS ARCHIVOS SIN GRAMÁTICA — un nombre que sólo aparece en un YAML está usado (jekyll: cops cargados desde .rubocop.yml)", () => {
    const repo = repoDe({
      "cop.rb": "class NoPutsAllowed\nend\n",
      ".rubocop.yml": "Jekyll/NoPutsAllowed:\n  Enabled: true\n",
    });
    const idx = repoNameIndex(repo);
    expect(idx.usedOutside("NoPutsAllowed", [{ file: "cop.rb", startLine: 1, endLine: 2 }])).toBe(true);
  });

  it("SIN `dir` el índice queda INERTE y responde `true` a todo: el detector se comporta como antes de esta ola", () => {
    const sinDir: RepoUnit = { repoName: "t", files: [], functions: [], clones: [], graph: null };
    const idx = repoNameIndex(sinDir);
    expect(idx.filesRead).toBe(0);
    expect(idx.usedOutside("loQueSea", [])).toBe(true);
  });

  it("NO SALTEA `deps/` — el error que esta ola cometió y corrigió: hugo tiene un paquete Go llamado `deps/` y `SKIP_DIRS` lo poda", () => {
    const repo = repoDe({
      "resources/spec.go": "func NewSpec() {}\n",
      "deps/deps.go": "resources.NewSpec()\n",
    });
    const idx = repoNameIndex(repo);
    expect(idx.usedOutside("NewSpec", [{ file: "resources/spec.go", startLine: 1, endLine: 1 }])).toBe(true);
  });
});

describe("pathMentioned — la PUERTA A de `orphan-file`", () => {
  it("un archivo nombrado como CADENA en un mapa de carga perezosa está mencionado (eslint, lib/rules/index.js)", () => {
    const repo = repoDe({
      "lib/rules/no-sync.js": "module.exports = {};\n",
      "lib/rules/index.js": 'module.exports = { "no-sync": () => require("./no-sync") };\n',
    });
    const idx = repoNameIndex(repo);
    expect(idx.pathMentioned("no-sync", "lib/rules/no-sync.js")).toBe(true);
  });

  it("un archivo que nadie nombra NO está mencionado", () => {
    const repo = repoDe({ "types/weak-key.d.ts": "declare type WeakKey = object;\n" });
    const idx = repoNameIndex(repo);
    expect(idx.pathMentioned("weak-key.d", "types/weak-key.d.ts")).toBe(false);
  });
});

describe("nameIsNotTheHandle — la PUERTA 7, un caso real por regla", () => {
  const repo = repoDe({
    "tipos.d.ts": "export interface Ambiente {}\n",
    "kafka.interface.ts": "export declare class KafkaJSError extends Error {}\n",
    "hooks.interface.ts": "export interface OnGatewayConnection {\n  handleConnection(): void;\n}\n",
    "demo.jsx": "export default function ZustandComponent() {\n  return null;\n}\n",
    "registro.ts": "Module._resolveFilename = function resolveFilename(req) {\n  return req;\n};\n",
    "config.js": "module.exports = {\n  setupNodeEvents(on, config) {\n    return config;\n  },\n};\n",
    "comando.py": "@cli.command()\ndef paste_cmd():\n    pass\n",
    "atributo.cs": "/// <summary>doc</summary>\n[AttributeUsage(AttributeTargets.Field)]\ninternal sealed class NotNullAttribute : Attribute { }\n",
    "servlet.rb": "def search_index_file(req, res)\n  super || otra_cosa\nend\n",
    "swagger.go": "// User\n// swagger:response User\ntype swaggerResponseUser struct {\n\tBody api.User\n}\n",
    "lint.go": "//lint:ignore U1000 useful for debugging\nfunc printFs() {\n}\n",
    "eslintdis.js": "// eslint-disable-next-line no-unused-vars\nfunction findMatchingFormInput(base) {\n  return base;\n}\n",
    "vivo.ts": "export function deVerdadMuerta(x: number): number {\n  return x + 1;\n}\n",
    "clase.ts": "export class InvalidMiddlewareConfigurationException extends Error {\n  constructor() {\n    super('x');\n  }\n}\n",
  });
  const idx = repoNameIndex(repo);
  const casos: ReadonlyArray<readonly [string, string, number, number, string]> = [
    ["archivo de declaración de tipos", "tipos.d.ts", 1, 1, "preact/src/*.d.ts"],
    ["declaración de ambiente", "kafka.interface.ts", 1, 1, "nest/…/kafka.interface.ts:1206"],
    ["tipo puro", "hooks.interface.ts", 1, 3, "nest/…/on-gateway-connection.interface.ts"],
    ["exportación por defecto", "demo.jsx", 1, 3, "preact/demo/zustand.jsx"],
    ["expresión con nombre", "registro.ts", 1, 3, "nest/integration/_support/register-local-packages.ts:38"],
    ["propiedad de objeto literal", "config.js", 2, 4, "eslint/cypress.config.js:11"],
    ["declaración anotada", "comando.py", 2, 3, "click/examples/*/…"],
    ["declaración anotada", "atributo.cs", 3, 3, "newtonsoft-json/…/NullableAttributes.cs:31"],
    ["redefine un miembro heredado", "servlet.rb", 1, 3, "jekyll/…/serve/servlet.rb:142"],
    ["directiva de herramienta en comentario", "swagger.go", 3, 5, "gitea/routers/api/v1/swagger/user.go:13"],
    ["directiva de herramienta en comentario", "lint.go", 2, 3, "hugo/hugolib/filesystems/basefs.go:872"],
    ["directiva de herramienta en comentario", "eslintdis.js", 2, 4, "jenkins/…/hudson-behavior.js:2193"],
  ];
  for (const [razon, archivo, desde, hasta, origen] of casos) {
    it(`"${razon}" — ${origen}`, () => {
      expect(idx.nameIsNotTheHandle(archivo, desde, hasta)).toBe(razon);
    });
  }

  it("CONTROL NEGATIVO — una función exportada normal NO tiene ninguna razón: su nombre SÍ es su manija", () => {
    expect(idx.nameIsNotTheHandle("vivo.ts", 1, 3)).toBeNull();
  });

  it("CONTROL NEGATIVO — la regla de `super` NO se aplica a una CLASE: el constructor de toda subclase llama a super, y esto apagaba una VERDADERA del snapshot de recall (nest, InvalidMiddlewareConfigurationException)", () => {
    expect(idx.nameIsNotTheHandle("clase.ts", 1, 5)).toBeNull();
  });
});
