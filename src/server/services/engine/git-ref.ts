/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MATERIALIZAR UN REF DE GIT, SIN TOCAR EL ÁRBOL DEL USUARIO — OLA BC, BC2.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Lo mínimo de git que el motor necesita para poder comparar "antes" contra
 * "ahora": resolver un ref a UN commit, listar qué archivos cambiaron desde
 * ese commit, y dejar el árbol de ese commit en disco un rato para poder
 * analizarlo.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE ARCHIVO EXISTE EN VEZ DE USAR `git-service.ts`
 * ───────────────────────────────────────────────────────────────────────────
 *
 * `services/git-service.ts` ya maneja worktrees y son 812 líneas probadas —
 * pero es del TABLERO: importa `shared/interfaces.ts` (`GitService`,
 * `CreateTaskWorktreesOptions`, `WorktreeInfo`) y `shared/types.ts#TaskRepo`,
 * y su API entra por "los repos de una tarea". Importarlo desde el motor
 * rompería literalmente `engine/no-board-imports.test.ts` (la compuerta que
 * BC1 dejó puesta, que es una lista BLANCA: lo que no está permitido está
 * prohibido) y desharía en un import el corte que esa ola vino a hacer.
 *
 * Y no hay duplicación real que evitar: lo que `git-service.ts` sabe hacer es
 * "creá una rama nueva por repo de esta tarea, ensamblá el session root,
 * borralo cuando la tarea cierra". Nada de eso sirve acá. Lo que sí se
 * reusa es su FORMA, deliberadamente:
 *
 *   · todo git va por `execFile("git", […])` — nunca una shell, así que un
 *     nombre de rama con `;` o `$(…)` es un argumento y no un comando;
 *   · el error lleva `args`, `cwd`, `code`, `stdout`, `stderr` encima;
 *   · la remoción destructiva pasa por UN solo lugar, y ese lugar sólo
 *     borra worktrees que ESTE módulo creó (ver `withRefWorktree`);
 *   · `WorktreeBusyError` tiene su gemelo acá (`RefWorktreeBusyError`) porque
 *     el problema ya se dio: un árbol que no se puede sacar no puede tumbar
 *     la operación entera.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * LA GARANTÍA QUE ESTE MÓDULO DA, Y ES LA QUE IMPORTA
 * ───────────────────────────────────────────────────────────────────────────
 *
 * **EL DIRECTORIO DE TRABAJO DEL USUARIO NO SE MODIFICA.** Ni un checkout, ni
 * un stash, ni un `reset`, ni un cambio de rama, ni un archivo escrito adentro.
 * El único comando que escribe algo es `git worktree add --detach`, y escribe
 * en DOS lugares: el directorio temporal que se le pasa (fuera del árbol del
 * usuario) y los metadatos `\.git/worktrees/<nombre>/` del repo. Eso segundo
 * es inevitable —es cómo git registra un worktree— y es lo mismo que ya hace
 * el tablero cada vez que abre una tarea. `withRefWorktree` lo desregistra al
 * terminar, incluso si el análisis tira una excepción.
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 60_000;
const GIT_MAX_BUFFER_BYTES = 256 * 1024 * 1024;

/** Error de un `git` que salió distinto de cero, con su salida encima. */
export class GitRefError extends Error {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | string | null;

  constructor(args: readonly string[], cwd: string, code: number | string | null, stdout: string, stderr: string) {
    super(`git ${args.join(" ")} falló (código ${code ?? "?"})${stderr ? `: ${stderr.trim()}` : ""}`);
    this.name = "GitRefError";
    this.args = args;
    this.cwd = cwd;
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

/**
 * El gemelo de `git-service.ts#WorktreeBusyError` para el worktree EFÍMERO de
 * la comparación. No hereda de él ni lo importa (sería un import del tablero);
 * existe por el mismo motivo por el que existe aquél: un árbol que no se puede
 * sacar es un caso real y no una excepción teórica.
 *
 * Y la diferencia de política es a propósito: allá `WorktreeBusyError` ABORTA
 * el borrado (es el worktree de una tarea viva, con trabajo del usuario
 * adentro). Acá el árbol es efímero y su contenido es reproducible desde el
 * commit — así que la limpieza que falla se DEGRADA (se reporta, no se
 * propaga) y el resultado de la comparación sale igual. Ver `withRefWorktree`.
 */
export class RefWorktreeBusyError extends Error {
  readonly worktreePath: string;
  constructor(worktreePath: string, cause?: unknown) {
    super(`no se pudo sacar el worktree efímero: ${worktreePath}`);
    this.name = "RefWorktreeBusyError";
    this.worktreePath = worktreePath;
    this.cause = cause;
  }
}

async function git(args: readonly string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync("git", [...args], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER_BYTES,
    });
  } catch (err) {
    const e = err as { code?: number | string | null; stdout?: string; stderr?: string };
    throw new GitRefError(args, cwd, e.code ?? null, e.stdout ?? "", e.stderr ?? "");
  }
}

/** `git rev-parse <ref>^{commit}` — el sha completo, o error si el ref no existe. */
export async function resolveCommit(dir: string, ref: string): Promise<string> {
  const { stdout } = await git(["rev-parse", "--verify", `${ref}^{commit}`], dir);
  return stdout.trim();
}

/**
 * El commit contra el que se va a comparar, resuelto UNA vez.
 *
 * `mergeBase: true` (el default) responde *"¿qué cambié YO?"*: se compara
 * contra el punto en que la rama actual se separó del ref, no contra la punta
 * del ref. La diferencia no es cosmética — si `origin/main` avanzó desde que
 * el usuario ramificó, comparar contra la PUNTA le atribuiría a él los cambios
 * de los demás (y al revés: los mostraría como si los hubiera deshecho).
 *
 * `mergeBase: false` responde *"¿en qué se diferencia mi árbol del de esa
 * rama?"*, que es otra pregunta legítima (p. ej. "¿qué tengo yo que no tiene
 * producción?") — por eso está expuesto y no cableado.
 *
 * Si no hay merge-base (ramas sin historia común, o un repo poco profundo
 * donde el ancestro no se clonó) se cae al commit del ref, con el motivo
 * declarado en `mergeBaseFallback`. Callar eso sería el peor de los mundos:
 * un resultado distinto sin decir que la pregunta cambió.
 */
export async function resolveBaseCommit(
  dir: string,
  ref: string,
  opts?: { readonly mergeBase?: boolean },
): Promise<{ commit: string; mergeBaseUsed: boolean; mergeBaseFallback?: string }> {
  const refCommit = await resolveCommit(dir, ref);
  if (opts?.mergeBase === false) return { commit: refCommit, mergeBaseUsed: false };
  try {
    const { stdout } = await git(["merge-base", "HEAD", refCommit], dir);
    const base = stdout.trim();
    if (base) return { commit: base, mergeBaseUsed: true };
    return { commit: refCommit, mergeBaseUsed: false, mergeBaseFallback: "git merge-base no devolvió nada" };
  } catch (err) {
    return {
      commit: refCommit,
      mergeBaseUsed: false,
      mergeBaseFallback: err instanceof GitRefError ? err.message : String(err),
    };
  }
}

/**
 * LOS ARCHIVOS QUE EL USUARIO TOCÓ, relativos a `dir` — la entrada de la vista
 * (B) de `compare.ts`.
 *
 * Se compara el commit base contra **el árbol de trabajo**, no contra `HEAD`:
 * el usuario quiere ver los problemas de lo que acaba de escribir, y lo que
 * acaba de escribir todavía puede estar sin commitear. Es además lo único
 * consistente con el análisis, que corre sobre el directorio tal como está en
 * disco.
 *
 * DOS FUENTES, Y LAS DOS HACEN FALTA:
 *
 *   · `git diff --name-only` → lo modificado respecto del base (staged y no
 *     staged), incluidos los borrados;
 *   · `git ls-files --others --exclude-standard` → **los archivos NUEVOS que
 *     todavía no se agregaron al índice**. `git diff` NO los reporta, y son
 *     justo el caso más común de "código nuevo": un archivo recién creado. Sin
 *     esta segunda llamada, la vista (B) no vería NADA del archivo que el
 *     usuario acaba de escribir.
 *
 * `--relative` NO ES UN DETALLE: sin él, `git diff` da las rutas relativas a la
 * RAÍZ DEL REPO aunque el cwd sea un subdirectorio, mientras que
 * `CodeLocation.file` las da relativas al directorio ANALIZADO (`collectFiles`
 * camina desde `dir`). Analizar un paquete dentro de un monorepo daría entonces
 * intersección vacía siempre, y sin ningún error visible. `--relative` además
 * DESCARTA lo que cae fuera de `dir`, que es lo correcto: un hallazgo de este
 * análisis no puede estar ahí. `git ls-files` ya se comporta así por sí solo.
 * (Este caso lo encontró el test, no la lectura: la primera versión de esta
 * función normalizaba el prefijo a mano y dejaba pasar los archivos de los
 * directorios hermanos.)
 *
 * Los borrados quedan en la lista a propósito: ningún hallazgo puede estar
 * ubicado en un archivo que ya no existe, así que no ensucian la vista (B), y
 * filtrarlos le escondería información a quien use esta función para otra cosa.
 */
export async function changedFilesSince(dir: string, baseCommit: string): Promise<string[]> {
  const [diff, untracked] = await Promise.all([
    git(["diff", "--name-only", "--relative", "--no-renames", baseCommit, "--"], dir),
    git(["ls-files", "--others", "--exclude-standard"], dir),
  ]);

  const out = new Set<string>();
  for (const raw of [...diff.stdout.split("\n"), ...untracked.stdout.split("\n")]) {
    const line = raw.trim();
    if (line) out.add(line);
  }
  return [...out].sort();
}

/**
 * Deja el árbol de `commit` en disco, se lo pasa a `fn`, y lo saca — pase lo
 * que pase.
 *
 * `--detach` a propósito: no se crea ni se mueve NINGUNA rama. El worktree no
 * apunta a nada que el usuario pueda estar usando, así que no puede chocar con
 * el "una rama, un worktree" de git.
 *
 * El nombre del directorio lleva pid + 8 bytes aleatorios porque dos
 * comparaciones simultáneas sobre el mismo repo son un caso esperado (un panel
 * y un agente MCP a la vez), y `git worktree add` sobre una ruta existente
 * falla.
 *
 * LA LIMPIEZA NO PUEDE TUMBAR EL RESULTADO. Si `worktree remove` falla —un
 * antivirus, un `find` del usuario, un editor con un archivo abierto— se
 * intenta el borrado directo y después `worktree prune`; si TODO falla, se
 * llama a `onCleanupFailure` con un `RefWorktreeBusyError` y la función
 * devuelve igual lo que `fn` calculó. Un árbol huérfano cuesta disco hasta el
 * próximo `prune`; perder un análisis que ya se pagó cuesta 30 segundos del
 * usuario.
 */
export async function withRefWorktree<T>(
  dir: string,
  commit: string,
  fn: (worktreePath: string) => Promise<T>,
  opts?: {
    /** Dónde crear el árbol efímero. Default: `os.tmpdir()`. NUNCA adentro de `dir`. */
    readonly scratchDir?: string;
    /** Se llama si el árbol no se pudo sacar. Default: `console.error`. */
    readonly onCleanupFailure?: (err: RefWorktreeBusyError) => void;
  },
): Promise<T> {
  const scratch = opts?.scratchDir ?? path.join(os.tmpdir(), "ck-engine-compare");
  await fs.mkdir(scratch, { recursive: true });
  const worktreePath = path.join(
    scratch,
    `base-${commit.slice(0, 12)}-${process.pid}-${crypto.randomBytes(4).toString("hex")}`,
  );

  await git(["worktree", "add", "--detach", worktreePath, commit], dir);
  try {
    return await fn(worktreePath);
  } finally {
    // CUELLO DE BOTELLA DESTRUCTIVO ÚNICO: la ruta que se borra es la que este
    // mismo bloque acaba de crear, nunca una que venga de afuera. Es la
    // propiedad que hace que un bug de cálculo de rutas no pueda borrar el
    // árbol del usuario.
    try {
      await git(["worktree", "remove", "--force", worktreePath], dir);
    } catch (removeErr) {
      try {
        await fs.rm(worktreePath, { recursive: true, force: true });
        await git(["worktree", "prune"], dir);
      } catch {
        const busy = new RefWorktreeBusyError(worktreePath, removeErr);
        if (opts?.onCleanupFailure) opts.onCleanupFailure(busy);
        else console.error(`[engine/compare] ${busy.message}`);
      }
    }
  }
}

/** `true` si `dir` está dentro de un checkout de git. Nunca tira. */
export async function isGitCheckout(dir: string): Promise<boolean> {
  try {
    const { stdout } = await git(["rev-parse", "--is-inside-work-tree"], dir);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

/** Descripción legible del árbol actual: sha corto de HEAD + si hay cambios sin commitear. */
export async function describeWorkingTree(dir: string): Promise<{ headCommit: string; dirty: boolean }> {
  const headCommit = await resolveCommit(dir, "HEAD");
  const { stdout } = await git(["status", "--porcelain=v1", "--untracked-files=all"], dir);
  return { headCommit, dirty: stdout.trim().length > 0 };
}
