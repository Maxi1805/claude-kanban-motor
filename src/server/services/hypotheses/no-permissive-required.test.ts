/**
 * LA COMPUERTA — ola "un `required` que aprueba por no poder evaluar no es
 * un `required`" (ver el preámbulo del frente). El defecto de clase: un
 * `Check.run` cuya rama "no pude confirmar nada" devuelve `holds: true` en
 * vez de `holds: false` — convierte el `required` en decoración, porque el
 * motor (`engine.ts#build`) lo trata exactamente igual que una condición
 * confirmada de verdad (`requiredResults.some(r => !r.passed)`, la única
 * puerta entre "candidata" y `null`).
 *
 * CASO TESTIGO, medido antes de esta ola: `strategy.ts#distinctBehaviorCheck`
 * devolvía `holds: true` con la evidencia textual "se asume, SIN CONFIRMAR"
 * cuando no había árbol vivo o no se podían ubicar las ramas — y así pasó,
 * en producción, sobre
 * `corpus/newtonsoft-json/Src/Newtonsoft.Json/Converters/XmlNodeConverter.cs`.
 * El contraste correcto ya vivía en el mismo repo:
 * `hypotheses/builder.ts#ensamblaConLogica`, que devuelve `holds: false`
 * cuando no puede mirar el árbol, y lo dice en la evidencia.
 *
 * QUÉ HACE ESTA COMPUERTA. Barre TODO `hypotheses/*.ts` (nunca los propios
 * `.test.ts` — mismo criterio que `no-declared-confidence.test.ts`/
 * `no-derive-node-sets.test.ts`, deliberadamente amplio para cubrir también
 * los patrones futuros sin que cada uno tenga que agregar su propio grep) en
 * busca de un `holds: true` cuyo bloque de retorno (el `return { ... }`
 * completo, delimitado por profundidad de llaves — nunca una ventana de N
 * líneas a ciegas, que se derramaría al siguiente `check`/`case` del
 * archivo) contenga alguna de las frases que este proyecto ya usa,
 * consistentemente, para decir "no pude confirmar nada, así que aprobé de
 * todos modos": "se asume", "sin confirmar", "sin evidencia suficiente",
 * "no se pudo(éron)". Los comentarios (`//`, `/* *\/`) se pisan ANTES de
 * buscar — si no, el propio docstring de este archivo (o el de `strategy.ts`,
 * que documenta el arreglo citando la frase vieja como HISTORIA) dispara la
 * compuerta por hablar DE el defecto, no por cometerlo.
 *
 * QUÉ NO ES UNA VIOLACIÓN. Un `holds: true` sin dato es LEGÍTIMO cuando la
 * condición se cumple DE VERDAD sin ese dato — nunca por no haber podido
 * mirar. Los casos reales que sobreviven en el código de hoy y que este
 * archivo protege explícitamente en su describe "no falsos positivos" (para
 * que una futura vuelta de tuerca al regex no los rompa por accidente):
 *   - Estructural, por construcción gramatical (`sameDiscriminantSubjectCheck`
 *     de `strategy.ts`: un `switch/case` tiene un único discriminante por
 *     definición sintáctica — no es "no pude ver otra cosa", es "la
 *     gramática ya lo garantiza").
 *   - Vacuo, con la razón escrita (`prototype.ts#distinctPresets`: un
 *     candidato de una sola clase no tiene familia con la que comparar
 *     presets — la condición se declara cumplida y se dice por qué).
 *   - Delegado a OTRO required de la misma escalera
 *     (`decorator.ts#REQUIRED_ACCUMULATOR`: el ancla estructural no necesita
 *     este check porque `cadena-de-envoltura-presente` ya cubre esa forma).
 *   - Medido contra el corpus juzgado a mano, con el número escrito
 *     (`strategy.ts#notFactoryMethodCheck`: invertirlo apagaría TODO
 *     `repeated-switch` para Strategy sin recuperar ningún falso — la
 *     decisión de dejarlo en `true` es la EXCEPCIÓN documentada, no el
 *     default).
 *
 * PROBADA ROTA A PROPÓSITO (ver el informe de esta ola): revirtiendo a mano
 * la rama de árbol-no-disponible de `distinctBehaviorCheck` a
 * `{ holds: true, evidence: "... se asume, SIN CONFIRMAR ..." }`, este
 * archivo pasa de 0 a 1 violación, apuntando exactamente a esa línea — la
 * compuerta SÍ se pone roja cuando el defecto vuelve a existir.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname);

/** Frases que, en la evidencia de un `holds: true`, delatan "no pude evaluar
 *  esto, así que aprobé" — nunca "confirmé que esto es cierto". */
const FORBIDDEN_PHRASES: readonly RegExp[] = [/se asume/i, /sin confirmar/i, /sin evidencia suficiente/i, /no se pudo/i, /no se pudieron/i];

const MAX_BLOCK_LINES = 10; // tope duro: ningún `return { holds: true, evidence: "..." }` real de este directorio pasa de esto.

function isOwnTest(fileName: string): boolean {
  return fileName.endsWith(".test.ts");
}

/**
 * Pisa comentarios `/* ... *\/` y `// ...` por espacios (preserva saltos de
 * línea y longitud — así los números de línea reportados siguen siendo los
 * del archivo real). Ingenuo respecto de `//`/`/*` dentro de strings —
 * ninguna evidencia de este directorio los usa, y una compuerta heurística
 * no necesita un parser completo para sostener esto.
 */
function stripComments(text: string): string {
  let out = "";
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    if (inBlock) {
      if (text[i] === "*" && text[i + 1] === "/") {
        out += "  ";
        i++;
        inBlock = false;
      } else {
        out += text[i] === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (text[i] === "/" && text[i + 1] === "*") {
      out += "  ";
      i++;
      inBlock = true;
      continue;
    }
    if (text[i] === "/" && text[i + 1] === "/") {
      let j = i;
      while (j < text.length && text[j] !== "\n") j++;
      out += " ".repeat(j - i);
      i = j - 1;
      continue;
    }
    out += text[i];
  }
  return out;
}

/**
 * Desde la línea de `holds: true` (inclusive), junta líneas hasta que la
 * profundidad de llaves vuelve a 0 (el `return { ... }` que lo contiene se
 * cerró) — nunca una ventana fija de líneas, que se derramaría al siguiente
 * check/case del archivo y produciría falsos positivos (verificado: con una
 * ventana de 6 líneas a ciegas, `decorator.ts` disparaba dos falsos por el
 * check SIGUIENTE en el archivo).
 */
function blockFrom(lines: readonly string[], start: number): string {
  let depth = 0;
  let seenOpen = false;
  const out: string[] = [];
  for (let j = start; j < lines.length && j < start + MAX_BLOCK_LINES; j++) {
    const line = lines[j]!;
    out.push(line);
    for (const ch of line) {
      if (ch === "{") {
        depth++;
        seenOpen = true;
      } else if (ch === "}") {
        depth--;
      }
    }
    if (seenOpen && depth <= 0) break;
  }
  return out.join("\n");
}

interface Violation {
  file: string;
  line: number;
  text: string;
  matched: string;
}

/** El detector real, factorizado para que el describe de abajo pueda probarlo con fixtures en memoria, sin tocar disco. */
function findViolations(fileText: string): Array<{ line: number; text: string; matched: string }> {
  const text = stripComments(fileText);
  const lines = text.split("\n");
  const out: Array<{ line: number; text: string; matched: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/holds:\s*true\b/.test(lines[i]!)) continue;
    const block = blockFrom(lines, i);
    for (const re of FORBIDDEN_PHRASES) {
      if (re.test(block)) {
        out.push({ line: i + 1, text: lines[i]!.trim(), matched: String(re) });
        break;
      }
    }
  }
  return out;
}

describe("no-permissive-required — el detector en sí (fixtures en memoria, sin tocar disco)", () => {
  it("marca un required que aprueba porque no pudo evaluar (el defecto exacto que esta compuerta existe para atrapar)", () => {
    const fixture = `
const check: Check<P, G> = {
  run: (p) => {
    if (!p.tree) {
      return { holds: true, evidence: "árbol no disponible: se asume, SIN CONFIRMAR, que la condición se cumple." };
    }
    return { holds: p.real, evidence: "confirmado" };
  },
};
`;
    const v = findViolations(fixture);
    expect(v.length).toBeGreaterThan(0);
  });

  it("marca 'sin evidencia suficiente... se mantiene como candidata' (la otra forma verbal del mismo defecto)", () => {
    const fixture = `
run: (p) => {
  if (p.callees.length < 2) {
    return { holds: true, evidence: "sin evidencia suficiente para juzgar, se mantiene como candidata." };
  }
},
`;
    expect(findViolations(fixture).length).toBeGreaterThan(0);
  });

  it("NO marca un `holds: true` estructural por construcción gramatical (switch/case: discriminante único por definición)", () => {
    const fixture = `
run: (p) => {
  if (isSwitch) {
    return { holds: true, evidence: "esta cadena es sintácticamente un switch/case: un único discriminante por construcción, no aplica." };
  }
},
`;
    expect(findViolations(fixture)).toEqual([]);
  });

  it("NO marca un `holds: true` vacuo con la razón escrita (candidato de una sola clase, sin familia con la que comparar)", () => {
    const fixture = `
run: (p) => {
  if (p.siblings.length <= 1) {
    return { holds: true, evidence: "Candidato de una sola clase: no hay familia con la que comparar presets, así que esta condición no aplica y se da por cumplida." };
  }
},
`;
    expect(findViolations(fixture)).toEqual([]);
  });

  it("NO marca un `holds: true` delegado a otro required de la misma escalera", () => {
    const fixture = `
run: (p) => {
  if (isStructuralAnchor(p)) {
    return { holds: true, evidence: "ancla ESTRUCTURAL: este check no aplica — ya lo cubre el otro required de la escalera." };
  }
},
`;
    expect(findViolations(fixture)).toEqual([]);
  });

  it("NO marca un `holds: true` medido contra el corpus, con el número escrito", () => {
    const fixture = `
run: (p) => {
  return { holds: true, evidence: "brecha declarada. Medido, no asumido: sobre los 174 veredictos a mano, 0/4 falsos por esta causa; invertir destruiría el único verdadero." };
},
`;
    expect(findViolations(fixture)).toEqual([]);
  });

  it("no confunde el bloque con el del SIGUIENTE check del archivo (regresión: una ventana fija de líneas sí lo hacía)", () => {
    const fixture = `
run: (p) => {
  return { holds: true, evidence: "confirmado de verdad, con dato real." };
},
};
const otroCheck = {
  run: (p) => {
    return { holds: false, evidence: "no se pudo ubicar nada acá — esto es OTRO check, no debe contaminar al de arriba." };
  },
};
`;
    expect(findViolations(fixture)).toEqual([]);
  });

  it("ignora la frase prohibida cuando vive en un comentario (prosa que documenta el arreglo, no código que lo comete)", () => {
    const fixture = `
/**
 * ANTES devolvía { holds: true, evidence: "se asume, SIN CONFIRMAR" } — ya no.
 */
run: (p) => {
  return { holds: false, evidence: "no se puede confirmar, no demostrado." };
},
`;
    expect(findViolations(fixture)).toEqual([]);
  });
});

describe("no-permissive-required — barrido real de hypotheses/*.ts", () => {
  it("ningún required/Check aprueba (`holds: true`) citando que no pudo evaluar nada", () => {
    const files = fs.readdirSync(ROOT).filter((f) => f.endsWith(".ts") && !isOwnTest(f));
    // Sensor de vacío: si esto alguna vez da 0, la compuerta dejó de barrer
    // nada y todo lo demás de este `it` es un verde mentiroso.
    expect(files.length).toBeGreaterThan(15);

    const violations: Violation[] = [];
    for (const file of files) {
      const raw = fs.readFileSync(path.join(ROOT, file), "utf8");
      for (const v of findViolations(raw)) violations.push({ file, ...v });
    }

    expect(
      violations.map((v) => `${v.file}:${v.line} — ${v.text}`),
      violations.length > 0
        ? "Un `required`/`Check` está aprobando (`holds: true`) porque no pudo evaluar nada, no porque confirmó algo — " +
          "esa es la clase de defecto que esta ola cerró (ver `strategy.ts#distinctBehaviorCheck`/`XmlNodeConverter.cs` " +
          "en el docstring de este archivo). Invertí a `holds: false`, o si la condición se cumple DE VERDAD sin ese " +
          "dato, escribí por qué en la evidencia (nunca 'se asume'/'sin confirmar'/'sin evidencia suficiente') y " +
          "agregá el caso a la lista de excepciones documentadas en la cabecera de este archivo."
        : undefined,
    ).toEqual([]);
  });
});
