#!/usr/bin/env python3
"""AW4 - muestra estratificada de los HALLAZGOS REALES de `modulo-envy` (y `middle-man`)
que emite la copia instrumentada src1, con la ficha para juzgar ABRIENDO EL ARCHIVO."""
import json, glob, os, sys, random, collections

VOL = "/home/maxi1805/claude-kanban/scratchpad-aw4/vol2"
RAIZ = "/home/maxi1805/claude-kanban"
DIRS = {}
for base in ("corpus", "corpus-app"):
    for d in glob.glob(os.path.join(RAIZ, base, "*")):
        DIRS[os.path.basename(d)] = d

KIND = sys.argv[1] if len(sys.argv) > 1 else "modulo-envy"
N = int(sys.argv[2]) if len(sys.argv) > 2 else 40
SEED = int(sys.argv[3]) if len(sys.argv) > 3 else 1805
DESDE = int(sys.argv[4]) if len(sys.argv) > 4 else 1

regs = []
for p in sorted(glob.glob(os.path.join(VOL, "*.json"))):
    r = os.path.basename(p)[:-5]
    d = json.load(open(p))
    for x in d.get("registros") or []:
        if x["kind"] != KIND:
            continue
        x["repo"] = r
        # `CodeFinding` (shared/types.ts) NO lleva `scope` ni `language`: el
        # lenguaje se deriva de la extension del primer `location`.
        f0 = (x.get("locations") or [{}])[0].get("file", "")
        ext = f0[f0.rfind("."):] if "." in f0 else ""
        x["language"] = {".py":"python",".go":"go",".rb":"ruby",".ts":"typescript",".tsx":"typescript",
                         ".js":"javascript",".mjs":"javascript",".cjs":"javascript",".jsx":"javascript",
                         ".cs":"csharp",".java":"java",".vue":"vue"}.get(ext, ext or "?")
        regs.append(x)

print(f"# {KIND}: {len(regs)} hallazgos en {len(glob.glob(os.path.join(VOL,'*.json')))} repos volcados")
porrepo = collections.Counter(x["repo"] for x in regs)
porlang = collections.Counter(x.get("language") or "?" for x in regs)
print(f"# por repo: {dict(sorted(porrepo.items()))}")
print(f"# por lenguaje: {dict(porlang)}\n")

rnd = random.Random(SEED)
estratos = collections.defaultdict(list)
for x in regs:
    estratos[x["repo"]].append(x)
for k in estratos:
    estratos[k].sort(key=lambda x: x["id"])
muestra = []
claves = sorted(estratos)
while len(muestra) < min(N, len(regs)):
    avance = False
    for k in claves:
        if not estratos[k]:
            continue
        muestra.append(estratos[k].pop(rnd.randrange(len(estratos[k]))))
        avance = True
        if len(muestra) >= min(N, len(regs)):
            break
    if not avance:
        break


def lineas(repo, f, a, b, ctx=0, tope=80):
    d = DIRS.get(repo)
    if not d:
        return ["(repo no encontrado)"]
    p = os.path.join(d, f)
    if not os.path.exists(p):
        return [f"(no existe {p})"]
    L = open(p, encoding="utf-8", errors="replace").read().split("\n")
    a = max(1, (a or 1) - ctx)
    b = min(len(L), (b or a) + ctx)
    return [f"{i:5d}| {L[i-1]}" for i in range(a, min(b, a + tope) + 1)]


for i, x in enumerate(muestra, 1):
    if i < DESDE:
        continue
    print(f"\n{'='*104}\n[{i}] {x['repo']} ({x.get('language')})  id={x['id']}")
    print(f"    {x['title']}")
    print(f"    trigger: {[(m['label'], m['value'], m['umbral']) for m in x.get('trigger') or []]}")
    print(f"    evidence: {[(e['label'], e['value']) for e in x.get('evidence') or []]}")
    print(f"    hipotesis colgadas: {x.get('hypotheses')}")
    for j, l in enumerate(x["locations"][:6]):
        print(f"    loc[{j}] {l['file']}:{l['startLine']}-{l['endLine']}  {l.get('symbol','')}  [{l.get('role','')}]")
    print(f"    detail: {x['detail'][:900]}")
    for j, l in enumerate(x["locations"][:4]):
        if l["endLine"] - l["startLine"] > 120:
            continue
        print(f"    ---- loc[{j}] {l['file']}:{l['startLine']} ----")
        for ln in lineas(x["repo"], l["file"], l["startLine"], l["endLine"]):
            print("    " + ln)
