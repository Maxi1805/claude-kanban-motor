/**
 * OLA BC, FRENTE BC2 — LA COMPUERTA DE LA COMPARACIÓN CONTRA GIT.
 *
 * Cada bloque de acá prueba UNA cosa que, si se rompe, rompe el producto — y
 * cada uno se probó EN ROJO contra el árbol sin el arreglo correspondiente
 * (mutando `compare.ts`/`git-ref.ts` a mano, un defecto por vez). La lista de
 * mutaciones y sus rojos está en `claude-kanban-docs/ola-bc/informes/BC2.md`.
 * Un test que no se pone rojo sin el cambio no prueba nada: tres olas seguidas
 * lo pagaron (AX, BA, BB).
 *
 * LO QUE CUBRE, en orden de importancia:
 *
 *  1. **(A) y (B) son vistas DISTINTAS y no se mezclan.** Un hallazgo viejo
 *     presentado como "lo generaste vos" es la mentira que hace que se deje de
 *     confiar en la herramienta. Hay un caso para cada dirección de la
 *     diferencia — hay hallazgos que están en (B) y no en (A), y otros que
 *     están en (A) y no en (B).
 *  2. **La resta es por CONJUNTO DE IDS, no por conteo.** El caso está armado
 *     con los MISMOS totales de los dos lados y contenido distinto: un
 *     comparador por conteo diría "no se movió nada". Es la cicatriz de la Ola
 *     AW, que declaró "cero propuestas movidas" habiendo perdido siete y ganado
 *     una.
 *  3. **CERO FALSOS NUEVOS ante un cambio que no agrega problemas.** Si mover
 *     código o poner un comentario reporta hallazgos "nuevos", la función es
 *     ruido. Es el número que define el producto.
 *  4. **El árbol del usuario no se toca.** Ni HEAD, ni el índice, ni un archivo,
 *     ni un worktree que quede registrado.
 *  5. **El diff ve lo que el usuario realmente tocó**: lo no commiteado y —el
 *     caso que más fácil se olvida— **los archivos nuevos sin agregar al
 *     índice**, que `git diff` no reporta.
 *  6. **OLA BD — el agrupamiento tampoco puede ESCONDER un problema nuevo.**
 *     La Ola BC cubrió una dirección (un hallazgo viejo no puede publicarse
 *     como introducido ni como resuelto). Ésta cubre la simétrica: un hallazgo
 *     agrupado que se apareó con su versión vieja y trae ADEMÁS la función que
 *     el usuario acaba de escribir no puede presentarse como "ya estaba" a
 *     secas. El caso está medido sobre `preact` y sobre 70 inyecciones en cinco
 *     repos (informe BD1 §2); los casos de abajo son el fixture mínimo.
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  compareAgainstRef,
  diffAnalyses,
  findingsInFiles,
  findingsInTouchedFiles,
} from "./compare.js";
import { changedFilesSince, resolveBaseCommit, withRefWorktree } from "./git-ref.js";
import { analyzeRepo } from "../code-analyzer.js";
import type { CodeAnalysis, CodeFinding } from "../../../shared/types.js";

const execFileAsync = promisify(execFile);
const git = (args: string[], cwd: string) => execFileAsync("git", args, { cwd });

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ck-bc2-"));
});

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function write(root: string, rel: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await fs.writeFile(path.join(root, rel), content, "utf8");
}

async function initRepo(name: string): Promise<string> {
  const root = path.join(tmpRoot, name);
  await fs.mkdir(root, { recursive: true });
  await git(["init", "-q", "-b", "main"], root);
  await git(["config", "user.email", "t@example.com"], root);
  await git(["config", "user.name", "t"], root);
  return root;
}

async function commitAll(root: string, msg: string): Promise<string> {
  await git(["add", "-A"], root);
  await git(["commit", "-q", "-m", msg], root);
  return (await git(["rev-parse", "HEAD"], root)).stdout.trim();
}

/* ═══════════════════════════════════════════════════════════════════════
 * FIXTURES DE CÓDIGO — una función deliberadamente larga y compleja, para
 * que los detectores emitan algo real sin depender de un repo del corpus.
 * ═══════════════════════════════════════════════════════════════════════ */

function funcionLarga(nombre: string, ramas: number): string {
  const campos = Array.from({ length: ramas }, (_, i) => `k${i + 1}: number;`).join(" ");
  const cuerpo = Array.from(
    { length: ramas },
    (_, i) => `    if (input.k${i + 1} > ${i + 1}) { total += input.k${i + 1} * ${i + 1}; } else { total -= ${i + 1}; }`,
  ).join("\n");
  return `export interface Input${nombre} { ${campos} }\n\nexport function ${nombre}(input: Input${nombre}): number {\n  let total = 0;\n${cuerpo}\n  return total;\n}\n`;
}

/* ═══════════════════════════════════════════════════════════════════════
 * 1 y 2 — LA SEMÁNTICA DE LA RESTA, SIN GIT NI DISCO
 * ═══════════════════════════════════════════════════════════════════════ */

function finding(id: string, kind: string, file: string, symbol?: string, metric = 1): CodeFinding {
  return {
    id,
    kind: kind as CodeFinding["kind"],
    title: `${kind} en ${file}`,
    detail: "",
    metric: { label: "x", value: metric },
    severity: 50,
    locations: [{ file, startLine: 1, endLine: 2, ...(symbol ? { symbol } : {}) }],
  };
}

function analysis(findings: CodeFinding[]): CodeAnalysis {
  return {
    repoName: "fx",
    scannedFiles: 1,
    analysedFiles: 1,
    totalLines: 10,
    languages: ["typescript"],
    files: [],
    findings,
  };
}

describe("la resta es por conjunto de ids, nunca por conteo", () => {
  it("ve el cambio cuando los TOTALES son idénticos y el contenido no — la cicatriz de la Ola AW", () => {
    const base = analysis([finding("a", "long-function", "src/a.ts"), finding("b", "complexity", "src/b.ts")]);
    const head = analysis([finding("a", "long-function", "src/a.ts"), finding("c", "complexity", "src/c.ts")]);

    const d = diffAnalyses(base, head, []);

    // Un comparador por conteo diría "2 y 2, no se movió nada".
    expect(d.counts.base).toBe(d.counts.head);
    expect(d.introduced.map((f) => f.id)).toEqual(["c"]);
    expect(d.resolved.map((f) => f.id)).toEqual(["b"]);
    expect(d.carriedOver.map((c) => c.id)).toEqual(["a"]);
  });

  it("empareja el ANTES y el DESPUÉS de cada hallazgo que sobrevivió — el insumo de 'los empeorados'", () => {
    const base = analysis([finding("a", "long-function", "src/a.ts", "f", 40)]);
    const head = analysis([finding("a", "long-function", "src/a.ts", "f", 120)]);

    const d = diffAnalyses(base, head, ["src/a.ts"]);

    expect(d.introduced).toHaveLength(0); // NO es nuevo: es el mismo, peor.
    expect(d.carriedOver).toHaveLength(1);
    expect(d.carriedOver[0]!.before.metric.value).toBe(40);
    expect(d.carriedOver[0]!.after.metric.value).toBe(120);
  });

  it("NO adivina: donde la clave de contenido se repite, no aparea nada por contenido", () => {
    // Dos `duplication` del mismo archivo con `symbol` vacío: mismo kind, mismo
    // archivo, mismo símbolo, mismo título. Son hallazgos DISTINTOS y no hay
    // forma de saber cuál es cuál. Aparearlos "por si acaso" sería inventar un
    // emparejamiento — y el consumidor lo mostraría como certeza.
    const mismo = (id: string): CodeFinding => ({
      ...finding(id, "duplication", "src/a.ts"),
      title: "3 fragmentos de igual estructura",
    });
    const base = analysis([mismo("vieja-1"), mismo("vieja-2")]);
    const head = analysis([mismo("nueva-1"), mismo("nueva-2")]);

    const d = diffAnalyses(base, head, []);

    expect(d.counts.rekeyed).toBe(0);
    expect(d.carriedOver).toEqual([]);
  });

  it("preserva el ORDEN DEL RANKING que el analizador calculó, no el de un Map", () => {
    const head = analysis([
      finding("z", "complexity", "src/z.ts"),
      finding("y", "long-function", "src/y.ts"),
      finding("x", "duplication", "src/x.ts"),
    ]);
    const d = diffAnalyses(analysis([]), head, []);
    expect(d.introduced.map((f) => f.id)).toEqual(["z", "y", "x"]);
  });
});

describe("(A) lo que introduje y (B) lo que hay en lo que toqué son vistas DISTINTAS", () => {
  /**
   * EL CASO DEL ENCARGO, exacto: se edita una función que YA era larga. El
   * `long-function` no es nuevo — (A) no lo muestra, y hace bien— pero está
   * parado justo donde el usuario acaba de escribir, así que (B) sí.
   */
  it("un hallazgo VIEJO en un archivo tocado: no está en (A), sí en (B), y (B) lo marca como no-introducido", () => {
    const viejo = finding("viejo", "long-function", "src/tocado.ts", "f");
    const nuevo = finding("nuevo", "complexity", "src/tocado.ts", "f");

    const d = diffAnalyses(analysis([viejo]), analysis([viejo, nuevo]), ["src/tocado.ts"]);

    expect(d.introduced.map((f) => f.id)).toEqual(["nuevo"]);
    expect(d.inTouchedFiles.map((t) => t.finding.id)).toEqual(["viejo", "nuevo"]);
    expect(d.inTouchedFiles.find((t) => t.finding.id === "viejo")!.alsoIntroduced).toBe(false);
    expect(d.inTouchedFiles.find((t) => t.finding.id === "nuevo")!.alsoIntroduced).toBe(true);
    expect(d.counts.preexistingInTouchedFiles).toBe(1);
    expect(d.counts.introducedInTouchedFiles).toBe(1);
  });

  /**
   * LA DIFERENCIA VA EN LOS DOS SENTIDOS, y esta dirección es la que se
   * olvida: un ciclo de dependencias que aparece porque el usuario agregó un
   * import queda ubicado en un archivo que él NO tocó. Existe por su cambio —
   * (A) lo ve— y (B) por construcción no puede verlo.
   */
  it("un hallazgo NUEVO en un archivo no tocado: está en (A) y no en (B)", () => {
    const ciclo = finding("ciclo", "dependency-cycle", "src/otro.ts");

    const d = diffAnalyses(analysis([]), analysis([ciclo]), ["src/tocado.ts"]);

    expect(d.introduced.map((f) => f.id)).toEqual(["ciclo"]);
    expect(d.inTouchedFiles).toHaveLength(0);
  });

  it("(B) toma un hallazgo con VARIAS ubicaciones si CUALQUIERA está en un archivo tocado, y dice cuál", () => {
    const dup: CodeFinding = {
      ...finding("dup", "duplication", "src/a.ts"),
      locations: [
        { file: "src/a.ts", startLine: 1, endLine: 5 },
        { file: "src/tocado.ts", startLine: 9, endLine: 14 },
      ],
    };
    const t = findingsInFiles(analysis([dup]), ["src/tocado.ts"]);
    expect(t).toHaveLength(1);
    expect(t[0]!.touchedFiles).toEqual(["src/tocado.ts"]);
  });

  it("`findingsInFiles` NUNCA afirma que algo sea nuevo: no midió el base", () => {
    const t = findingsInFiles(analysis([finding("x", "complexity", "src/tocado.ts")]), ["src/tocado.ts"]);
    expect(t[0]!.alsoIntroduced).toBe(false);
    // OLA BD: y tampoco inventa `newLocations: []`, que sería decir "medí y no
    // hay ninguna nueva". Sin base analizado, el valor honesto es `undefined`.
    expect(t[0]!.newLocations).toBeUndefined();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * 5 — QUÉ ARCHIVOS CUENTAN COMO "LO QUE TOQUÉ"
 * ═══════════════════════════════════════════════════════════════════════ */

describe("changedFilesSince — contra el ÁRBOL DE TRABAJO, no contra HEAD", () => {
  it("incluye lo modificado sin commitear Y el archivo nuevo que todavía no se agregó al índice", async () => {
    const root = await initRepo("diff-basico");
    await write(root, "src/a.ts", "export const a = 1;\n");
    await write(root, "src/b.ts", "export const b = 1;\n");
    const base = await commitAll(root, "base");

    await write(root, "src/a.ts", "export const a = 2;\n"); // modificado, sin commitear
    await write(root, "src/nuevo.ts", "export const n = 1;\n"); // NUEVO, sin `git add`

    const changed = await changedFilesSince(root, base);

    expect(changed).toContain("src/a.ts");
    // Si esto se cae, es que sólo se miró `git diff`: los archivos nuevos sin
    // agregar al índice son el caso MÁS COMÚN de "código nuevo" y `git diff`
    // no los reporta.
    expect(changed).toContain("src/nuevo.ts");
    expect(changed).not.toContain("src/b.ts");
  });

  it("devuelve las rutas relativas al DIRECTORIO ANALIZADO, no a la raíz del repo", async () => {
    const root = await initRepo("diff-subdir");
    await write(root, "paquete/src/a.ts", "export const a = 1;\n");
    await write(root, "otro/b.ts", "export const b = 1;\n");
    const base = await commitAll(root, "base");
    await write(root, "paquete/src/a.ts", "export const a = 2;\n");
    await write(root, "otro/b.ts", "export const b = 2;\n");

    const changed = await changedFilesSince(path.join(root, "paquete"), base);

    // `git diff` da "paquete/src/a.ts"; `CodeLocation.file` dice "src/a.ts"
    // (`collectFiles` camina desde el directorio analizado). Sin normalizar,
    // la intersección de la vista (B) sería vacía SIEMPRE y sin ningún error.
    expect(changed).toContain("src/a.ts");
    expect(changed).not.toContain("paquete/src/a.ts");
    expect(changed.some((p) => p.includes("otro/b.ts"))).toBe(false);
  });

  it("resuelve el base al MERGE-BASE por defecto, no a la punta del ref", async () => {
    const root = await initRepo("merge-base");
    await write(root, "a.ts", "export const a = 1;\n");
    const raiz = await commitAll(root, "raiz");

    await git(["checkout", "-q", "-b", "mia"], root);
    await write(root, "mio.ts", "export const m = 1;\n");
    await commitAll(root, "mi commit");

    // main avanza por su cuenta, con un archivo que NO es del usuario.
    await git(["checkout", "-q", "main"], root);
    await write(root, "de-otro.ts", "export const o = 1;\n");
    await commitAll(root, "commit de otro");
    await git(["checkout", "-q", "mia"], root);

    const conMergeBase = await resolveBaseCommit(root, "main");
    expect(conMergeBase.commit).toBe(raiz);
    expect(conMergeBase.mergeBaseUsed).toBe(true);

    const contraLaPunta = await resolveBaseCommit(root, "main", { mergeBase: false });
    expect(contraLaPunta.commit).not.toBe(raiz);

    // Y la consecuencia, que es de lo que se trata: contra la punta, el
    // archivo de OTRO aparece como cambio del usuario.
    expect(await changedFilesSince(root, conMergeBase.commit)).toEqual(["mio.ts"]);
    expect(await changedFilesSince(root, contraLaPunta.commit)).toContain("de-otro.ts");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * 4 — EL ÁRBOL DEL USUARIO NO SE TOCA
 * ═══════════════════════════════════════════════════════════════════════ */

describe("el worktree efímero", () => {
  it("materializa el árbol del commit y lo saca, sin dejar registro ni tocar el del usuario", async () => {
    const root = await initRepo("worktree");
    await write(root, "a.ts", "export const a = 1;\n");
    const primero = await commitAll(root, "primero");
    await write(root, "a.ts", "export const a = 2;\n");
    await commitAll(root, "segundo");

    const antesHead = (await git(["rev-parse", "HEAD"], root)).stdout.trim();
    const antesStatus = (await git(["status", "--porcelain=v1"], root)).stdout;
    const antesRama = (await git(["rev-parse", "--abbrev-ref", "HEAD"], root)).stdout.trim();

    let visto = "";
    let rutaEfimera = "";
    await withRefWorktree(root, primero, async (wt) => {
      rutaEfimera = wt;
      visto = await fs.readFile(path.join(wt, "a.ts"), "utf8");
    });

    expect(visto).toBe("export const a = 1;\n"); // el árbol VIEJO, no el actual
    expect(rutaEfimera.startsWith(root)).toBe(false); // fuera del árbol del usuario
    await expect(fs.access(rutaEfimera)).rejects.toThrow(); // y sacado

    expect((await git(["rev-parse", "HEAD"], root)).stdout.trim()).toBe(antesHead);
    expect((await git(["status", "--porcelain=v1"], root)).stdout).toBe(antesStatus);
    expect((await git(["rev-parse", "--abbrev-ref", "HEAD"], root)).stdout.trim()).toBe(antesRama);
    // Y no queda un worktree registrado: si quedara, el próximo `worktree add`
    // sobre esa ruta fallaría y el repo del usuario acumularía basura.
    const lista = (await git(["worktree", "list", "--porcelain"], root)).stdout;
    expect(lista).not.toContain(rutaEfimera);
  });

  /**
   * LA FORMA REAL EN QUE CORRE EL TABLERO. Cada tarea vive en un worktree
   * ENLAZADO (`git-service.ts#createTaskWorktrees`), así que el directorio que
   * se analiza no es el repo: es un worktree con su `.git` apuntando al common
   * dir. Materializar OTRO worktree desde ahí adentro es donde git se pone
   * quisquilloso, y es exactamente lo que el MCP y el panel van a hacer.
   */
  it("funciona DESDE ADENTRO de un worktree enlazado y no toca el worktree de la tarea", async () => {
    const origen = await initRepo("wt-origen");
    await write(origen, "src/a.ts", "export const a = 1;\n");
    await commitAll(origen, "base");
    const tarea = path.join(tmpRoot, "wt-tarea47");
    await git(["worktree", "add", "-q", "-b", "tarea-47", tarea], origen);
    await write(tarea, "src/a.ts", "export const a = 2;\nexport function nueva() { return 1; }\n");
    const statusAntes = (await git(["status", "--porcelain=v1"], tarea)).stdout;

    const cmp = await compareAgainstRef({ dir: tarea, baseRef: "main", repoName: "wt" });

    expect(cmp.mergeBaseUsed).toBe(true);
    expect(cmp.headDirty).toBe(true);
    expect(cmp.changedFiles).toEqual(["src/a.ts"]);

    // El worktree de la tarea sigue en SU rama, con SU cambio sin commitear.
    expect((await git(["rev-parse", "--abbrev-ref", "HEAD"], tarea)).stdout.trim()).toBe("tarea-47");
    expect((await git(["status", "--porcelain=v1"], tarea)).stdout).toBe(statusAntes);
    // Y el registro de worktrees quedó con los dos de siempre: origen y tarea.
    const lista = (await git(["worktree", "list", "--porcelain"], origen)).stdout;
    expect(lista.match(/^worktree /gm)).toHaveLength(2);
  });

  it("usa --detach: no crea ni mueve ninguna rama", async () => {
    const root = await initRepo("worktree-detach");
    await write(root, "a.ts", "export const a = 1;\n");
    const primero = await commitAll(root, "primero");
    const ramasAntes = (await git(["branch", "--list"], root)).stdout;
    await withRefWorktree(root, primero, async () => undefined);
    expect((await git(["branch", "--list"], root)).stdout).toBe(ramasAntes);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * 3 y 1 — CONTRA EL ANALIZADOR DE VERDAD
 * ═══════════════════════════════════════════════════════════════════════ */

describe("compareAgainstRef sobre un repo de verdad, con el analizador de verdad", () => {
  it(
    "CERO falsos nuevos ante un cambio que no agrega problemas (comentarios + código movido + renombre local)",
    async () => {
      const root = await initRepo("neutro");
      await write(root, "src/report.ts", funcionLarga("buildReport", 44));
      await write(
        root,
        "src/util.ts",
        "export function suma(a: number, b: number): number {\n  return a + b;\n}\nexport function resta(a: number, b: number): number {\n  return a - b;\n}\n",
      );
      await commitAll(root, "base");

      // Tres formas de "no cambiar nada de fondo", las tres en la misma tanda:
      // un comentario nuevo, dos funciones intercambiadas de lugar (les corre
      // TODAS las líneas), y un parámetro renombrado.
      await write(
        root,
        "src/util.ts",
        "// un comentario que no cambia nada\nexport function resta(izq: number, der: number): number {\n  return izq - der;\n}\n\nexport function suma(a: number, b: number): number {\n  return a + b;\n}\n",
      );
      await write(root, "src/report.ts", `// otro comentario\n${funcionLarga("buildReport", 44)}`);

      const cmp = await compareAgainstRef({ dir: root, baseRef: "HEAD", repoName: "neutro" });

      // EL NÚMERO QUE DEFINE EL PRODUCTO. Si esto no es 0, mover código
      // reporta problemas inventados y la función es ruido.
      expect(cmp.introduced.map((f) => `${f.kind} ${f.locations[0]?.file}#${f.locations[0]?.symbol}`)).toEqual([]);
      expect(cmp.resolved).toEqual([]);
      expect(cmp.counts.carriedOver).toBe(cmp.counts.head);
      expect(cmp.counts.head).toBeGreaterThan(0); // que no sea 0 por no haber analizado nada

      // Y la vista (B) SÍ tiene contenido: los archivos se tocaron, y lo que
      // vive en ellos sigue ahí. Es exactamente la diferencia entre las dos.
      expect(cmp.inTouchedFiles.length).toBeGreaterThan(0);
      expect(cmp.inTouchedFiles.every((t) => t.alsoIntroduced === false)).toBe(true);
    },
    180_000,
  );

  it(
    "el MISMO cambio da (A) y (B) distintas: la función larga que ya existía no está en (A) y sí en (B)",
    async () => {
      const root = await initRepo("dos-vistas");
      await write(root, "src/report.ts", funcionLarga("buildReport", 44));
      await write(root, "src/util.ts", "export function suma(a: number, b: number): number {\n  return a + b;\n}\n");
      await commitAll(root, "base");

      const antesHead = (await git(["rev-parse", "HEAD"], root)).stdout.trim();

      // El usuario hace dos cosas: agranda una función que YA era larga, y
      // escribe un archivo nuevo con su propio problema.
      await write(root, "src/report.ts", funcionLarga("buildReport", 70));
      await write(root, "src/flamante.ts", funcionLarga("procesar", 50));

      const cmp = await compareAgainstRef({ dir: root, baseRef: "HEAD", repoName: "dos-vistas" });

      const clave = (f: CodeFinding) => `${f.kind}@${f.locations[0]?.file}#${f.locations[0]?.symbol}`;
      const introducidos = cmp.introduced.map(clave);
      const enTocados = cmp.inTouchedFiles.map((t) => clave(t.finding));

      // (A) trae lo del archivo NUEVO…
      expect(introducidos).toContain("long-function@src/flamante.ts#procesar");
      // …y NO trae la función larga que ya era larga. No la introdujo.
      expect(introducidos).not.toContain("long-function@src/report.ts#buildReport");
      // (B) sí la trae: está parada justo donde acaba de escribir.
      expect(enTocados).toContain("long-function@src/report.ts#buildReport");
      const vieja = cmp.inTouchedFiles.find((t) => clave(t.finding) === "long-function@src/report.ts#buildReport")!;
      expect(vieja.alsoIntroduced).toBe(false);

      // El archivo nuevo está en las dos, y (B) lo dice.
      const flamante = cmp.inTouchedFiles.find((t) => clave(t.finding) === "long-function@src/flamante.ts#procesar")!;
      expect(flamante.alsoIntroduced).toBe(true);

      // Las listas NO son la misma: si alguien las fusionara, esto se cae.
      expect(cmp.counts.preexistingInTouchedFiles).toBeGreaterThan(0);

      // Y el árbol del usuario quedó como estaba.
      expect((await git(["rev-parse", "HEAD"], root)).stdout.trim()).toBe(antesHead);
      expect(cmp.headDirty).toBe(true);
      expect(cmp.changedFiles).toContain("src/flamante.ts");
      expect(cmp.changedFiles).toContain("src/report.ts");
    },
    180_000,
  );

  it(
    "`findingsInTouchedFiles` da la vista (B) sin materializar ningún worktree ni analizar dos veces",
    async () => {
      const root = await initRepo("solo-b");
      await write(root, "src/report.ts", funcionLarga("buildReport", 44));
      await write(root, "src/util.ts", "export function suma(a: number, b: number): number {\n  return a + b;\n}\n");
      await commitAll(root, "base");
      await write(root, "src/report.ts", funcionLarga("buildReport", 60));

      const analisis = await analyzeRepo({ dir: root, repoName: "solo-b" });
      const soloB = await findingsInTouchedFiles(root, "HEAD", analisis);

      expect(soloB.changedFiles).toEqual(["src/report.ts"]);
      expect(soloB.inTouchedFiles.length).toBeGreaterThan(0);
      expect(soloB.inTouchedFiles.every((t) => t.touchedFiles.includes("src/report.ts"))).toBe(true);
      // Nada de `src/util.ts`, que no se tocó — aunque tenga hallazgos.
      expect(soloB.inTouchedFiles.some((t) => t.finding.locations.some((l) => l.file === "src/util.ts"))).toBe(false);
    },
    180_000,
  );
});

/* ═══════════════════════════════════════════════════════════════════════
 * LO QUE LA COMPARACIÓN **NO PUEDE** AFIRMAR, Y LO DICE
 * ═══════════════════════════════════════════════════════════════════════ */

describe("atribución no confiable: hermanos que comparten (kind, archivo, símbolo)", () => {
  /** Tres funciones ANÓNIMAS largas en un archivo: los tres `long-function` comparten ancla. */
  function anonima(n: number, ramas: number): string {
    const cuerpo = Array.from(
      { length: ramas },
      (_, i) => `    if (o.k${i + 1} > ${i + 1}) { t += o.k${i + 1} * ${i + 1}; } else { t -= ${i + 1}; }`,
    ).join("\n");
    return `registrar(${n}, function (o) {\n  let t = 0;\n${cuerpo}\n  return t;\n});\n`;
  }

  it(
    "cuando un hallazgo NUEVO se inserta ARRIBA de sus hermanos, la comparación DECLARA que la atribución no es confiable",
    async () => {
      const root = await initRepo("anclas-compartidas");
      const cab = "export function registrar(n, f) { return f; }\n\n";
      await write(root, "src/hooks.js", `${cab}${anonima(1, 45)}\n${anonima(2, 50)}\n${anonima(3, 55)}\n`);
      await commitAll(root, "base");
      // La función nueva va PRIMERA: le corre el ordinal a las tres de abajo.
      await write(root, "src/hooks.js", `${cab}${anonima(0, 60)}\n${anonima(1, 45)}\n${anonima(2, 50)}\n${anonima(3, 55)}\n`);

      const cmp = await compareAgainstRef({ dir: root, baseRef: "HEAD", repoName: "anclas" });

      // El CONTEO está bien: la función nueva emite sus hallazgos y nada más.
      expect(cmp.counts.introduced).toBe(cmp.counts.head - cmp.counts.base);
      // Pero CUÁL de los hermanos es el nuevo, no. Y la comparación lo dice en
      // vez de callarlo: si esto se cae, el consumidor está presentando como
      // certeza algo que no lo es.
      expect(cmp.unreliableAttribution.groups.length).toBeGreaterThan(0);
      expect(cmp.counts.unreliablyAttributed).toBeGreaterThan(0);
      const g = cmp.unreliableAttribution.groups.find((x) => x.kind === "long-function")!;
      expect(g.symbol).toBe("(anónima)");
      expect(g.headCount).toBe(g.baseCount + 1);
      // Y la prueba de que el emparejamiento es el que está mal: hay pares de
      // `carriedOver` cuyo "antes" y "después" no son el mismo hallazgo.
      expect(cmp.carriedOver.some((c) => c.before.metric.value !== c.after.metric.value)).toBe(true);
    },
    180_000,
  );

  it(
    "un repo donde cada hallazgo tiene ancla propia NO marca nada: la señal no es ruido de fondo",
    async () => {
      const root = await initRepo("anclas-propias");
      await write(root, "src/report.ts", funcionLarga("buildReport", 44));
      await commitAll(root, "base");
      await write(root, "src/flamante.ts", funcionLarga("procesar", 50));

      const cmp = await compareAgainstRef({ dir: root, baseRef: "HEAD", repoName: "anclas-propias" });

      expect(cmp.introduced.length).toBeGreaterThan(0);
      expect(cmp.unreliableAttribution.groups).toEqual([]);
      expect(cmp.unreliableAttribution.ids).toEqual([]);
      expect(cmp.counts.unreliablyAttributed).toBe(0);
    },
    180_000,
  );
});

/* ═══════════════════════════════════════════════════════════════════════
 * EL AGRUPAMIENTO RE-ACUÑA IDS — Y ESO NO PUEDE VOLVERSE "LO GENERASTE VOS"
 * ═══════════════════════════════════════════════════════════════════════ */

describe("un hallazgo que ya estaba no reaparece como introducido cuando el agrupamiento le cambia el id", () => {
  function compleja(n: number, ramas: number): string {
    const c = Array.from(
      { length: ramas },
      (_, i) =>
        `  if (o.k${i + 1} > ${i + 1}) { t += o.k${i + 1} * ${i + 1}; } else if (o.k${i + 1} < -${i + 1}) { t -= ${i + 1}; } else { t += 1; }`,
    ).join("\n");
    return `export function fn${n}(o) {\n  let t = 0;\n${c}\n  return t;\n}\n\n`;
  }

  it(
    "cuatro `complexity` sueltos que el agrupamiento colapsa en uno: cero introducidos, cero resueltos, tres absorbidos",
    async () => {
      const root = await initRepo("agrupamiento");
      await write(
        root,
        "src/muchas.js",
        [1, 2, 3, 4].map((n) => compleja(n, 20 + n)).join(""),
      );
      await commitAll(root, "base");
      // Una función más — y el agrupamiento de F5 colapsa los cinco
      // `complexity` del archivo en UNO solo, cuyas `locations` son la unión.
      // `stableFindingId` hashea TODAS las ubicaciones, así que el id del grupo
      // es nuevo y los cuatro viejos desaparecen del conjunto de ids.
      await fs.appendFile(path.join(root, "src/muchas.js"), compleja(5, 25), "utf8");

      const cmp = await compareAgainstRef({ dir: root, baseRef: "HEAD", repoName: "agrupamiento" });

      // NINGUNA complejidad es "nueva": las cinco funciones complejas ya
      // estaban, salvo la quinta, y el grupo que las representa existía como
      // fila antes. Si esto se cae, la herramienta le está diciendo al usuario
      // que introdujo un problema que ya estaba.
      expect(cmp.introduced.filter((f) => f.kind === "complexity")).toEqual([]);
      // Y NINGUNA se arregló: siguen todas ahí, adentro del grupo. Declararlas
      // `resolved` sería la mentira simétrica.
      expect(cmp.resolved).toEqual([]);
      expect(cmp.absorbed).toHaveLength(3);
      expect(cmp.absorbed.every((a) => a.before.kind === "complexity" && a.into.kind === "complexity")).toBe(true);
      expect(cmp.absorbed.map((a) => a.before.locations[0]?.symbol).sort()).toEqual(["fn2", "fn3", "fn4"]);
      // Y el que sí se apareó, se apareó por contenido y no por id.
      expect(cmp.counts.rekeyed).toBeGreaterThanOrEqual(1);
    },
    180_000,
  );

  it(
    "el pase por UBICACIÓN aparea el hallazgo cuyo id cambió Y cuya MÉTRICA cambió a la vez",
    async () => {
      const root = await initRepo("metrica-y-id");
      await write(root, "src/muchas.js", [1, 2, 3, 4].map((n) => compleja(n, 20 + n)).join(""));
      await commitAll(root, "base");
      // Dos cosas EN EL MISMO cambio: una función más (el agrupamiento colapsa
      // todo y le acuña un id nuevo al grupo) y `fn1` —que es la que
      // representa al grupo— se vuelve MÁS compleja. Con el id cambiado y el
      // `title` cambiado (lleva la métrica adentro: "complejidad cognitiva
      // 63"), ni el pase por id ni el pase por contenido exacto pueden
      // aparearla. Sólo `(kind, archivo, símbolo)` puede.
      await write(
        root,
        "src/muchas.js",
        compleja(1, 40) + [2, 3, 4].map((n) => compleja(n, 20 + n)).join("") + compleja(5, 25),
      );

      const cmp = await compareAgainstRef({ dir: root, baseRef: "HEAD", repoName: "metrica-y-id" });

      // `fn1` NO es un hallazgo nuevo: es el mismo, peor. Reportarlo como
      // introducido sería decirle al usuario que creó un problema que agravó.
      expect(cmp.introduced.filter((f) => f.kind === "complexity")).toEqual([]);
      expect(cmp.resolved).toEqual([]);
      const par = cmp.carriedOver.find(
        (c) => c.after.kind === "complexity" && c.after.locations[0]?.symbol === "fn1",
      )!;
      expect(par).toBeDefined();
      // Y quedó emparejado con su versión vieja, que es justo el insumo que
      // pide la vista de "los empeorados" que esta ola NO construye.
      expect(par.before.metric.value).toBeLessThan(par.after.metric.value);
      expect(cmp.counts.rekeyed).toBeGreaterThanOrEqual(1);
    },
    180_000,
  );
});

/* ═══════════════════════════════════════════════════════════════════════
 * OLA BD — EL AGRUPAMIENTO TAMPOCO PUEDE **ESCONDER** UN PROBLEMA NUEVO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * LA DIRECCIÓN QUE FALTABA. Los dos describes de arriba prueban que un hallazgo
 * VIEJO no se publique como "lo generaste vos". Éste prueba la simétrica, que es
 * la que calla algo que el usuario SÍ hizo: la función nueva y compleja entra
 * como una ubicación más de un grupo que ya existía, el grupo se aparea con el
 * viejo, y sin esto la vista (A) no la trae y la (B) dice `alsoIntroduced:
 * false` — una afirmación que el dato no respalda.
 *
 * Medido antes de escribir el arreglo (informe BD1 §2): pasa en el 20,7 % de las
 * veces que un usuario escribe una función nueva en un archivo que ya tenía
 * hallazgos, sobre cinco repos y cinco gramáticas.
 */
describe("Ola BD — un hallazgo apareado que trae una ubicación NUEVA lo dice", () => {
  it("la ubicación que el base no tenía sale en `partiallyIntroduced`, en la fila de (B) y en `unreliableAttribution`", () => {
    // El grupo viejo: UN hallazgo con dos ubicaciones. El grupo de ahora: el
    // mismo, con una TERCERA que es la función recién escrita. Mismo `kind`,
    // mismo `title`, misma ubicación principal ⇒ se aparea por contenido y por
    // ubicación, o sea que NO cae en `introduced`. Ahí está el agujero.
    const grupo = (id: string, simbolos: string[]): CodeFinding => ({
      ...finding(id, "complexity", "src/muchas.js", simbolos[0]!),
      title: "5 funciones complejas",
      locations: simbolos.map((s, i) => ({ file: "src/muchas.js", startLine: i * 10 + 1, endLine: i * 10 + 9, symbol: s })),
    });
    const base = analysis([grupo("viejo", ["fn1", "fn2"])]);
    const head = analysis([grupo("nuevo-id", ["fn1", "fn2", "fn5"])]);

    const d = diffAnalyses(base, head, ["src/muchas.js"]);

    // Se aparea — y eso está BIEN: `fn1` y `fn2` no las introdujo el usuario.
    expect(d.introduced).toEqual([]);
    expect(d.carriedOver.map((c) => c.id)).toEqual(["nuevo-id"]);
    // …pero `fn5` sí, y ahora se dice.
    expect(d.partiallyIntroduced.map((p) => p.finding.id)).toEqual(["nuevo-id"]);
    expect(d.partiallyIntroduced[0]!.newLocations).toEqual(["src/muchas.js#fn5"]);
    expect(d.counts.partiallyIntroduced).toBe(1);
    // La fila de la vista (B) la lleva encima: quien lea `alsoIntroduced:
    // false` sin mirar esto va a afirmar "ya estaba" sobre código del usuario.
    const fila = d.inTouchedFiles.find((t) => t.finding.id === "nuevo-id")!;
    expect(fila.alsoIntroduced).toBe(false);
    expect(fila.newLocations).toEqual(["src/muchas.js#fn5"]);
    // Y la señal de honestidad cubre esta dirección, que era la barra mínima.
    expect(d.unreliableAttribution.ids).toContain("nuevo-id");
    expect(d.unreliableAttribution.partiallyIntroduced).toBe(1);
  });

  it("NO marca nada cuando el hallazgo apareado es el MISMO: la señal no es ruido de fondo", () => {
    // Mismo hallazgo, métrica peor (el caso "los empeorados"). Las ubicaciones
    // son las mismas ⇒ no hay nada nuevo que declarar. Si esto se cae, la señal
    // se dispara en cada comparación y deja de significar algo.
    const base = analysis([finding("a", "long-function", "src/a.ts", "f", 40)]);
    const head = analysis([finding("a", "long-function", "src/a.ts", "f", 120)]);

    const d = diffAnalyses(base, head, ["src/a.ts"]);

    expect(d.carriedOver).toHaveLength(1);
    expect(d.partiallyIntroduced).toEqual([]);
    expect(d.counts.partiallyIntroduced).toBe(0);
    expect(d.inTouchedFiles[0]!.newLocations).toEqual([]);
    expect(d.unreliableAttribution.partiallyIntroduced).toBe(0);
  });

  it("un hallazgo ENTERAMENTE nuevo va a `introduced` y NO a `partiallyIntroduced`: son listas disjuntas", () => {
    const d = diffAnalyses(analysis([]), analysis([finding("n", "complexity", "src/n.ts", "f")]), ["src/n.ts"]);
    expect(d.introduced.map((f) => f.id)).toEqual(["n"]);
    expect(d.partiallyIntroduced).toEqual([]);
    // La fila de (B) igual publica sus ubicaciones nuevas: es el mismo dato,
    // medido. Lo que no puede es contarse dos veces como fila.
    expect(d.inTouchedFiles[0]!.alsoIntroduced).toBe(true);
    expect(d.inTouchedFiles[0]!.newLocations).toEqual(["src/n.ts#f"]);
  });

  it("mira el `kind`, no sólo el símbolo: un kind NUEVO sobre un símbolo VIEJO también es nuevo", () => {
    // `fn2` ya existía y ya tenía un `long-function`. Que ahora ADEMÁS entre en
    // el grupo de `complexity` es un problema que antes no estaba ahí.
    const largo = finding("largo", "long-function", "src/a.js", "fn2");
    const grupo = (id: string, simbolos: string[]): CodeFinding => ({
      ...finding(id, "complexity", "src/a.js", simbolos[0]!),
      title: "funciones complejas",
      locations: simbolos.map((sym, i) => ({ file: "src/a.js", startLine: i * 10 + 1, endLine: i * 10 + 9, symbol: sym })),
    });
    const d = diffAnalyses(analysis([largo, grupo("g", ["fn1"])]), analysis([largo, grupo("g2", ["fn1", "fn2"])]), []);

    expect(d.introduced).toEqual([]);
    expect(d.partiallyIntroduced[0]!.newLocations).toEqual(["src/a.js#fn2"]);
  });

  it(
    "CONTRA EL ANALIZADOR DE VERDAD: la quinta función compleja recién escrita no queda muda",
    async () => {
      // Es el MISMO fixture del describe del agrupamiento de la Ola BC, mirado
      // desde el otro lado: ahí se probaba que las cuatro viejas no aparezcan
      // como introducidas; acá, que la QUINTA —que el usuario acaba de
      // escribir— no desaparezca del todo por haber caído dentro del grupo.
      function compleja(n: number, ramas: number): string {
        const c = Array.from(
          { length: ramas },
          (_, i) =>
            `  if (o.k${i + 1} > ${i + 1}) { t += o.k${i + 1} * ${i + 1}; } else if (o.k${i + 1} < -${i + 1}) { t -= ${i + 1}; } else { t += 1; }`,
        ).join("\n");
        return `export function fn${n}(o) {\n  let t = 0;\n${c}\n  return t;\n}\n\n`;
      }
      const root = await initRepo("bd1-escondido");
      await write(root, "src/muchas.js", [1, 2, 3, 4].map((n) => compleja(n, 20 + n)).join(""));
      await commitAll(root, "base");
      await fs.appendFile(path.join(root, "src/muchas.js"), compleja(5, 25), "utf8");

      const cmp = await compareAgainstRef({ dir: root, baseRef: "HEAD", repoName: "bd1-escondido" });

      // Lo de la Ola BC sigue valiendo: ninguna complejidad vieja se publica
      // como introducida. Eso NO se toca.
      expect(cmp.introduced.filter((f) => f.kind === "complexity")).toEqual([]);
      // Y lo de la Ola BD: `fn5` es del usuario y la comparación lo dice.
      const parcial = cmp.partiallyIntroduced.find((p) => p.finding.kind === "complexity");
      expect(parcial, "el `complexity` del grupo no declaró ninguna ubicación nueva").toBeDefined();
      expect(parcial!.newLocations).toContain("src/muchas.js#fn5");
      expect(cmp.counts.partiallyIntroduced).toBeGreaterThan(0);
      expect(cmp.unreliableAttribution.partiallyIntroduced).toBeGreaterThan(0);
      expect(cmp.unreliableAttribution.ids).toContain(parcial!.finding.id);
      // La fila de (B) que dice `alsoIntroduced: false` trae el desmentido al lado.
      const fila = cmp.inTouchedFiles.find((t) => t.finding.id === parcial!.finding.id)!;
      expect(fila.alsoIntroduced).toBe(false);
      expect(fila.newLocations).toContain("src/muchas.js#fn5");
    },
    180_000,
  );
});
