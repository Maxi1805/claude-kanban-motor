#!/usr/bin/env python3
"""Z1 (Ola Z) — tabla de los volcados de scripts/z1-probe.mts. Medicion ad hoc, no produccion."""
import json, sys, os, glob, collections

d = sys.argv[1]
variant = sys.argv[2] if len(sys.argv) > 2 else "min1"

def dirname(p):
    return p.rsplit("/", 1)[0] if "/" in p else ""

tot = 0
rows = []
per_repo = {}
for f in sorted(glob.glob(os.path.join(d, "*.json"))):
    repo = os.path.basename(f)[:-5]
    j = json.load(open(f))
    fs = j["variants"][variant]
    per_repo[repo] = len(fs)
    tot += len(fs)
    for x in fs:
        rows.append((repo, x))

print(f"variante={variant}  TOTAL={tot}")
for r, n in sorted(per_repo.items()):
    print(f"  {r:18s} {n}")
print()
same = sum(1 for r, x in rows if dirname(x["a"]) == dirname(x["b"]) and dirname(x["a"]) != "")
print(f"pares mismo-directorio: {same} de {tot}")
hist = collections.Counter(x["sharedCount"] for r, x in rows)
print("histograma de operaciones compartidas:", dict(sorted(hist.items())))
print()
for r, x in rows:
    sd = "MISMO-DIR" if (dirname(x["a"]) == dirname(x["b"]) and dirname(x["a"]) != "") else ""
    print(f"{r:16s} n={x['clientCount']:2d} ops={x['sharedOps']} {sd}")
    print(f"    A={x['a']}")
    print(f"    B={x['b']}")
    print(f"    clientes={x['clients']}")
