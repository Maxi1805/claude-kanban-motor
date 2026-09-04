#!/usr/bin/env python3
"""AW4 - muestra estratificada de candidatos modulo-envy + ficha para juzgar ABRIENDO EL ARCHIVO."""
import json, glob, os, sys, random, collections

VOL = "/home/maxi1805/claude-kanban/scratchpad-aw4/vol"
RAIZ = "/home/maxi1805/claude-kanban"
DIRS = {}
for base in ("corpus", "corpus-app"):
    for d in glob.glob(os.path.join(RAIZ, base, "*")):
        DIRS[os.path.basename(d)] = d

ATFD_MIN = int(sys.argv[1]) if len(sys.argv) > 1 else 3
LAA_MAX = float(sys.argv[2]) if len(sys.argv) > 2 else 1/3
GRAN = sys.argv[3] if len(sys.argv) > 3 else "F"
N = int(sys.argv[4]) if len(sys.argv) > 4 else 40
SEED = int(sys.argv[5]) if len(sys.argv) > 5 else 1805

cands = []
for p in sorted(glob.glob(os.path.join(VOL, "*.json"))):
    r = os.path.basename(p)[:-5]
    d = json.load(open(p))
    for c in ((d.get("moduloEnvy") or {}).get("candidatos") or []):
        c["repo"] = r
        cands.append(c)

def pasa(c):
    a = c["atfd"+GRAN]; own = c["own"+GRAN]; laa = c["laa"+GRAN]
    if a < ATFD_MIN or own == 0 or laa is None or laa >= LAA_MAX: return False
    if c["ctor"] or c["anon"] or c["anidada"]: return False
    if c["domBarril"] or c["propioBarril"]: return False
    if c["domClasesTop"] == 0 and c["domFuncTop"] == 0: return False
    return True

pob = [c for c in cands if pasa(c)]
print(f"# POBLACION: {len(pob)} (ATFD>={ATFD_MIN}, LAA<{LAA_MAX:.3f}, gran={GRAN})")
by = collections.Counter((c["repo"], c["lang"]) for c in pob)
print(f"# estratos: {dict(by)}\n")

rnd = random.Random(SEED)
estratos = collections.defaultdict(list)
for c in pob: estratos[(c["repo"], c["lang"])].append(c)
muestra = []
claves = sorted(estratos)
while len(muestra) < min(N, len(pob)):
    avance = False
    for k in claves:
        if not estratos[k]: continue
        i = rnd.randrange(len(estratos[k]))
        muestra.append(estratos[k].pop(i)); avance = True
        if len(muestra) >= min(N, len(pob)): break
    if not avance: break

def lineas(repo, f, a, b, ctx=0):
    d = DIRS.get(repo)
    if not d: return ["(repo no encontrado)"]
    p = os.path.join(d, f)
    if not os.path.exists(p): return [f"(no existe {p})"]
    try:
        L = open(p, encoding="utf-8", errors="replace").read().split("\n")
    except Exception as e:
        return [f"(error {e})"]
    a = max(1, (a or 1) - ctx); b = min(len(L), (b or a) + ctx)
    return [f"{i:5d}| {L[i-1]}" for i in range(a, b+1)]

for i, c in enumerate(muestra, 1):
    print(f"\n{'='*100}\n[{i}] {c['repo']} :: {c['file']}:{c['startLine']}-{c['endLine']}  {'.'.join(c['symbolPath'])}")
    print(f"    ATFD{GRAN}={c['atfd'+GRAN]} own={c['own'+GRAN]} LAA={c['laa'+GRAN]} dom={c['dom'+GRAN]} provs={c['proveedoresF']} escribeEnDom={c['escribeEnDom']} ambUsadas={c['ambUsadas']}")
    print(f"    miembros del dominante: {c['domMiembros' if GRAN=='F' else 'domMiembrosC']}")
    print(f"    propios: {c['propiosMuestra']}   destino: clasesTop={c['domClasesTop']} funcTop={c['domFuncTop']}")
    print(f"    id={c['id']}")
    print("    ---- CUERPO ----")
    for l in lineas(c["repo"], c["file"], c["startLine"], c["endLine"])[:70]: print("    "+l)
