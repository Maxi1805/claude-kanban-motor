/**
 * El lint de cifras del usuario — regla dura #4 / PLAN.md §0 y §7.
 *
 * "Los repos <repo privado del usuario>/Backend y /Frontend son SOLO LECTURA
 * y sirven solo como prueba de humo (que no explote, que no vaya lento).
 * Esta PROHIBIDO ajustar, calibrar o descartar una regla o un umbral
 * mirando esos repos, y esta prohibido escribir una cifra sacada de ellos
 * en el codigo o en un comentario."
 *
 * Mencionar que se corrió un smoke test contra esos repos está permitido
 * ("que no explote, que no vaya lento"); citar un NÚMERO medido contra ellos
 * no. Este test escanea los bloques de comentario de los archivos de la capa
 * de análisis (PLAN.md §7) y falla si un bloque combina una frase que sólo
 * tiene sentido refiriéndose a esos dos repos privados ("real backend
 * repo", "reference repo(s)", "Backend, N files", "Frontend, N", el archivo
 * `db/schema.rb` que no existe en este repo — es de un Rails app, y este
 * repo no tiene ninguno) con un dígito en el mismo bloque.
 *
 * F-RETIRO-VÍA-VIEJA: la lista bajó de 7 a 3 archivos — `pattern-structural.ts`
 * / `pattern-wrapping.ts` / `pattern-behavioral.ts` / `code-opportunities.ts`
 * se BORRARON enteros (vía vieja de detección por vocabulario/forma,
 * retirada). La cita que motivó este test ("536 archivos reales") vivía
 * justamente en `pattern-structural.ts:838`, y se fue con el archivo — el
 * `it` de abajo que la pinea explícitamente sigue existiendo igual, ahora
 * imposible de reintroducir salvo en los 3 archivos que quedan.
 *
 * Ya había UNA cita conocida y borrada ("536 archivos reales",
 * pattern-structural.ts:838, F1). Este test la pinea explícitamente Y,
 * corriendo el escaneo real sobre el código actual en su momento, encontró
 * que quedaban OTRAS sin borrar en `code-analyzer.ts` / `code-grammar.ts` /
 * `code-opportunities.ts` (no eran archivos de quien escribió este test).
 * Reportado por dos revisiones adversariales posteriores (ver
 * `revision-regresion.md`/`revision-contratos.md`) y arreglado en la ronda
 * de correcciones que siguió — las 7 citas se reescribieron para preservar
 * el razonamiento técnico sin números derivados de los repos privados. Ver
 * el bloque al final de este archivo, mantenido como historial de qué se
 * encontró.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname);

const ANALYSIS_FILES = [
  "code-analyzer.ts",
  "code-grammar.ts",
  "code-suggest.ts",
] as const;

/**
 * Frases que sólo tienen sentido citando algo MEDIDO contra los repos
 * privados del usuario — cada una con la cita real que la motivó. Ninguna
 * prohíbe por sí sola: sólo cuenta si el mismo bloque de comentario también
 * trae un dígito (ver `hasNearbyDigit`) — así "se corrió como smoke test
 * contra el backend real" sin ningún número sigue permitido.
 */
const FORBIDDEN_ANCHORS: { pattern: RegExp; why: string }[] = [
  { pattern: /\breal (backend|frontend|rails)\s+(repo|app)\b/i, why: "cita medición contra el repo/app real del usuario" },
  { pattern: /\breference repos?\b/i, why: "'reference repo(s)' + un número es una cifra medida, no un smoke test" },
  { pattern: /\bbackend,\s*\d/i, why: "'Backend, N files' — conteo del repo privado" },
  { pattern: /\bfrontend,?\s*\d/i, why: "'Frontend, N' — conteo del repo privado" },
  { pattern: /db\/schema\.rb/i, why: "archivo real de un Rails/Vue privado (Rails) — este repo no tiene ninguno" },
];

/** Bloques `/** ... *\/`, `/* ... *\/` y corridas de `//` consecutivas. */
function extractCommentBlocks(text: string): { block: string; startLine: number }[] {
  const blocks: { block: string; startLine: number }[] = [];

  const blockCommentRe = /\/\*[\s\S]*?\*\//g;
  let m: RegExpExecArray | null;
  while ((m = blockCommentRe.exec(text))) {
    const startLine = text.slice(0, m.index).split("\n").length;
    blocks.push({ block: m[0], startLine });
  }

  const lines = text.split("\n");
  let run: string[] = [];
  let runStart = -1;
  const flush = () => {
    if (run.length > 0) blocks.push({ block: run.join("\n"), startLine: runStart });
    run = [];
    runStart = -1;
  };
  lines.forEach((line, i) => {
    if (/^\s*\/\//.test(line)) {
      if (run.length === 0) runStart = i + 1;
      run.push(line);
    } else {
      flush();
    }
  });
  flush();

  return blocks;
}

function hasDigit(s: string): boolean {
  return /\d/.test(s);
}

/**
 * Un JSDoc envuelve prosa en varias líneas, cada una con su propio `*` o
 * `//` de continuación (" *   backend repo," en la línea siguiente a
 * "measured on the real") — eso rompe cualquier regex de frase que no
 * tolere un salto de línea en el medio. Se normaliza ANTES de matchear: se
 * saca el delimitador de comentario y el marcador líder de cada línea, y se
 * colapsa todo el whitespace (incluidos saltos de línea) a un solo espacio.
 */
function normalizeComment(block: string): string {
  return block
    .split("\n")
    .map((line) => line.replace(/^\s*(\/\*\*?|\*\/?|\/\/)\s?/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Violation {
  file: string;
  line: number;
  why: string;
  snippet: string;
}

function scanFile(fileName: string): Violation[] {
  const text = fs.readFileSync(path.join(ROOT, fileName), "utf8");
  const violations: Violation[] = [];
  for (const { block, startLine } of extractCommentBlocks(text)) {
    const normalized = normalizeComment(block);
    for (const anchor of FORBIDDEN_ANCHORS) {
      if (anchor.pattern.test(normalized) && hasDigit(normalized)) {
        violations.push({
          file: fileName,
          line: startLine,
          why: anchor.why,
          snippet: normalized.slice(0, 160),
        });
      }
    }
  }
  return violations;
}

describe("no-user-repo-citations", () => {
  it("la cita ya borrada de F1 ('536 archivos reales') no vuelve a aparecer", () => {
    for (const file of ANALYSIS_FILES) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      expect(text, `${file} volvió a citar "536 archivos reales"`).not.toMatch(/536\s+archivos\s+reales/i);
    }
  });

  it("ningún bloque de comentario de la capa de análisis cita una cifra medida contra los repos del usuario", () => {
    const violations = ANALYSIS_FILES.flatMap(scanFile);
    // De-dupe: un mismo bloque puede matchear más de un anchor (p.ej.
    // "reference repo" y un dígito, en el mismo bloque que también dice
    // "Backend, 473") — reportar una vez por (archivo, línea).
    const seen = new Map<string, Violation>();
    for (const v of violations) seen.set(`${v.file}:${v.line}`, v);
    const report = [...seen.values()]
      .map((v) => `${v.file}:${v.line} — ${v.why}\n    "${v.snippet}..."`)
      .join("\n");
    expect([...seen.values()], report).toHaveLength(0);
  });
});

/**
 * HISTORIAL — estado medido cuando este test se escribió (ya arreglado, ver
 * el comentario de arriba): el segundo `it` de arriba fallaba en ese momento
 * con 7 bloques en 3 archivos, ninguno de ellos "536 archivos" (esa ya la
 * sacó F1) sino OTROS que F1 no tenía en su lista:
 *
 *   code-analyzer.ts:8      "~1.4 MB/s measured on a real Rails app"
 *   code-analyzer.ts:22-23  "el difference between 12513 files and 624"
 *   code-analyzer.ts:477-478  "measured against the real backend repo ...
 *                              (32 -> 66)"
 *   code-analyzer.ts:602-605  "(Backend, 473 files; Frontend, 536) ... ~70ms
 *                              to ~25-30ms" (el mismo 473/536 que motivó
 *                              esta tarea, en una SEGUNDA ubicación que F1
 *                              no tocó — ver su propio reporte, "no toqué
 *                              ... code-analyzer.ts:605 ... preexistente,
 *                              fuera de mi lista explícita")
 *   code-analyzer.ts:996    "measured ~45ms on this repo's own
 *                            `db/schema.rb`" (db/schema.rb no existe en
 *                            claude-kanban — es un archivo real de Backend)
 *   code-grammar.ts:302-308  "measured on the real backend repo, it took
 *                             `long-function` findings from 32 to 66"
 *   code-opportunities.ts:213-219  "11-15ms ... 110ms+ ... measured on the
 *                                   two reference repos"
 */
