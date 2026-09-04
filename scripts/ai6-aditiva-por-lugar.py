#!/usr/bin/env python3
"""OLA AI, FRENTE AI6 — aditividad CRUZANDO DOS CORRIDAS DISTINTAS.

Cuando los dos volcados no comparten `repoName` los ids ROTAN, así que la
comparación por id miente. Este script compara por `(kind, where[0])`, que no
depende del id, y separa el resultado POR PATRÓN — para poder atribuir lo que
se movió a quien lo movió (en esta ola hay siete frentes tocando producción a
la vez).

Uso: python3 scripts/ai6-aditiva-por-lugar.py <antes.json> <despues.json>
"""
import json, sys, collections
a = json.load(open(sys.argv[1])); b = json.load(open(sys.argv[2]))
def idx(d):
    m = collections.defaultdict(collections.Counter)
    for f in d["findings"]:
        k = (f["kind"], f["where"][0] if f["where"] else "")
        for h in f["hypotheses"]: m[k][(h["pattern"], h["state"])] += 1
        m[k]  # asegurar la clave aunque no tenga hipótesis
    return m
A, B = idx(a), idx(b)
print(f"  hallazgos: {a['total']} → {b['total']}")
print(f"  ubicaciones (kind, archivo:línea): {len(A)} → {len(B)}   sólo-antes {len(set(A)-set(B))}  sólo-después {len(set(B)-set(A))}")
perd, agr = collections.Counter(), collections.Counter()
det = []
for k in set(A) & set(B):
    for kk, n in (A[k] - B[k]).items(): perd[kk] += n
    for kk, n in (B[k] - A[k]).items():
        agr[kk] += n
        if kk[0] in ("Builder", "Factory Method"): det.append((kk, k))
print(f"  hipótesis PERDIDAS: {sum(perd.values())}  {dict(perd)}")
print(f"  hipótesis AGREGADAS: {sum(agr.values())}  {dict(agr)}")
for kk, k in sorted(det): print(f"     + {kk}  {k[0]}  {k[1]}")
