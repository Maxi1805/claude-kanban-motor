#!/usr/bin/env python3
"""OLA AT - AT3. Lista las propuestas de una familia para juzgarlas ABRIENDO EL ARCHIVO.
Uso: at3-listar.py <familia> [n-por-repo]"""
import json, glob, os, sys, math, random

VOL = "/home/maxi1805/claude-kanban/scratchpad-at3/vol"
fam = sys.argv[1] if len(sys.argv) > 1 else "Collapse Hierarchy"
por_repo = int(sys.argv[2]) if len(sys.argv) > 2 else 99

filas = []
for f in sorted(glob.glob(os.path.join(VOL, "*.json"))):
    d = json.load(open(f)); r = d["repo"]
    mias = [h for h in d.get("hipotesis", []) if h["pattern"] == fam]
    random.Random(20260830).shuffle(mias)
    for h in mias[:por_repo]:
        filas.append((r, h))

print(f"{fam}: {len(filas)} propuestas listadas")
for i, (r, h) in enumerate(filas):
    pl = h.get("places") or []
    print(f"\n--- [{i}] {r} | {h['state']} | conf={h.get('confidence')} | lang={h.get('lang')}")
    for p in pl[:6]:
        print(f"    {p['role'][:110]}")
        print(f"      -> {p['file']}:{p['startLine']}-{p['endLine']}  {p['symbol']}")
    for c in (h.get("discriminadores") or []):
        print(f"    [{'X' if c['passed'] else ' '}] {c['label']}")
    print(f"    COSTO: {(h.get('cost') or '')[:300]}")
