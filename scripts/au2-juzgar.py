#!/usr/bin/env python3
"""OLA AU / AU2 — imprime cada propuesta CON EL CODIGO REAL de cada copia, para
juzgar abriendo el archivo (que es la unica forma de juicio que vale).

Uso: python3 scripts/au2-juzgar.py <patron|todos> [repo] [max]
"""
import json, sys, glob, os

RAIZ = "/home/maxi1805/claude-kanban"
VOL = os.path.join(RAIZ, "scratchpad-au2/vol")
DIRS = {}
for base in ("corpus", "corpus-app"):
    for d in glob.glob(os.path.join(RAIZ, base, "*")):
        DIRS[os.path.basename(d)] = d

quiere = sys.argv[1] if len(sys.argv) > 1 else "todos"
solo_repo = sys.argv[2] if len(sys.argv) > 2 else None
maximo = int(sys.argv[3]) if len(sys.argv) > 3 else 200

MIOS = {"Extract Duplicated Method", "Pull Up Duplicated Member"}
n = 0
for f in sorted(glob.glob(os.path.join(VOL, "*.json"))):
    d = json.load(open(f))
    if solo_repo and d["repo"] != solo_repo:
        continue
    raiz = DIRS.get(d["repo"], "")
    for h in d["hipotesis"]:
        if h["pattern"] not in MIOS:
            continue
        if quiere != "todos" and quiere.lower() not in h["pattern"].lower():
            continue
        n += 1
        if n > maximo:
            print("... (tope alcanzado)")
            sys.exit(0)
        print("=" * 100)
        print(f"[{n}] {d['repo']} :: {h['pattern']}  ({h.get('language')})")
        print(f"  titulo del ancla: {h.get('title')}")
        print(f"  COSTO: {h.get('cost','')[:400]}")
        for c in h.get("checks", []):
            print(f"    [{'x' if c['passed'] else ' '}] {c['label'][:90]}")
            print(f"        -> {c['why'][:300]}")
        for c in h.get("discriminadores", []):
            print(f"    (disc {'x' if c['passed'] else ' '}) {c['label'][:80]} -> {c['why'][:160]}")
        for p in h.get("places", []):
            ruta = os.path.join(raiz, p["file"])
            print(f"  --- {p['file']}:{p['startLine']}-{p['endLine']}  [{p.get('symbol','')}] {p['role'][:80]}")
            try:
                with open(ruta, encoding="utf-8", errors="replace") as fh:
                    lineas = fh.readlines()
                for i in range(p["startLine"] - 1, min(p["endLine"], len(lineas))):
                    print(f"    {i+1:5d}| {lineas[i].rstrip()[:160]}")
            except Exception as e:
                print(f"    (no se pudo leer: {e})")
        print()
print(f"\n== {n} propuestas ==")
