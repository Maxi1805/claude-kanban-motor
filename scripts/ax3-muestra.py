#!/usr/bin/env python3
"""AX3 - muestra aleatoria de una variante + volcado del CUERPO REAL de cada clase,
para juzgar ABRIENDO EL ARCHIVO (no por metadatos)."""
import sys, os, random, json
sys.argv_ = sys.argv
sys.argv = ['x', 'scratchpad-ax3/vol']
exec(open(os.path.join(os.path.dirname(__file__), 'ax3-tabla.py')).read().split('if __name__')[0])
sys.argv = sys.argv_

VAR = sys.argv[1] if len(sys.argv) > 1 else "LC-A"
N   = int(sys.argv[2]) if len(sys.argv) > 2 else 30
SEED= int(sys.argv[3]) if len(sys.argv) > 3 else 20260901

DIRS = {}
for base in ("corpus", "corpus-app"):
    for r in os.listdir(base):
        DIRS[r] = os.path.join(base, r)

def LC_Cp(c):
    return (sana(c) and c["nmet"]>=2 and c["ncamp"]<=1 and c["usArch"]>=1
            and c["destArchN"]==1 and len(c["met"])==c["nmet"]
            and all(m["loc"]<=4 and m["out"]>=1 and m["arch"]==1 for m in c["met"]))
PRED = {"LC-A": LC_A, "LC-B": LC_B, "LC-C": LC_C, "LC-D": LC_D, "LC-Cp": LC_Cp}[VAR]

filas = cargar()
pob = [c for c in filas if PRED(c)]
pob.sort(key=lambda c: c["id"] + "|" + c["repo"])
random.seed(SEED); random.shuffle(pob)
sel = pob[:N]
sel.sort(key=lambda c: (c["repo"], c["file"], c["sl"] or 0))
print(f"### VARIANTE {VAR} — poblacion {len(pob)}, muestra {len(sel)} (semilla {SEED})\n")
for c in sel:
    p = os.path.join(DIRS[c["repo"]], c["file"])
    a = max(1, (c["sl"] or 1) - 4); b = (c["el"] or c["sl"] or 1) + 2
    try:
        lines = open(p, errors="replace").read().splitlines()
    except Exception as e:
        lines = [f"<<no se pudo leer: {e}>>"]
    print(f"--- {c['repo']} :: {c['file']}:{c['sl']} :: {'.'.join(c['path'])}  "
          f"[loc={c['loc']} nmet={c['nmet']} nm={c['nm']} usArch={c['usArch']} padres={c['padres']} lang={c['lang']}]")
    for i in range(a-1, min(b, len(lines))):
        print(f"{i+1:5d}| {lines[i]}")
    print()
