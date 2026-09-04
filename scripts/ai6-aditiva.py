#!/usr/bin/env python3
"""OLA AI, FRENTE AI6 — LA PRUEBA DE ADITIVIDAD, hallazgo por hallazgo.

Compara dos volcados del MISMO repo (esquema de `dump-hallazgos.mts`) y
contesta las tres preguntas que la regla 2 de esta ola exige:
  1. ¿cambió el NIVEL 1? (ids que aparecen o desaparecen, y el total)
  2. ¿se PERDIÓ alguna hipótesis? (multiconjunto `(patrón, estado)` por hallazgo)
  3. ¿cuáles se AGREGARON, y en qué celda?

Uso: python3 scripts/ai6-aditiva.py <antes.json> <despues.json>
"""
import json, sys, collections

a = json.load(open(sys.argv[1])); b = json.load(open(sys.argv[2]))
A = {f["id"]: f for f in a["findings"]}; B = {f["id"]: f for f in b["findings"]}
print(f"  hallazgos (total del volcado): {a['total']} → {b['total']}")
print(f"  ids ÚNICOS: {len(A)} → {len(B)}   (la diferencia con el total son ids repetidos, un hecho preexistente del árbol que otro frente de esta ola está tratando)")
sol, sob = set(A) - set(B), set(B) - set(A)
print(f"  ids que DESAPARECEN: {len(sol)}   ids que APARECEN: {len(sob)}")
for i in list(sol)[:10]: print(f"     - {i} {A[i]['where'][:1]}")
for i in list(sob)[:10]: print(f"     + {i} {B[i]['where'][:1]}")

perd = collections.Counter(); agr = collections.Counter()
det_perd = []; det_agr = []
for i in set(A) & set(B):
    ca = collections.Counter((h["pattern"], h["state"]) for h in A[i]["hypotheses"])
    cb = collections.Counter((h["pattern"], h["state"]) for h in B[i]["hypotheses"])
    for k, n in (ca - cb).items():
        perd[k] += n; det_perd.append((i, k, A[i]["where"][:1]))
    for k, n in (cb - ca).items():
        agr[k] += n; det_agr.append((i, k, B[i]["where"][:1], A[i]["kind"]))
print(f"  hipótesis PERDIDAS: {sum(perd.values())}  {dict(perd)}")
for d in det_perd[:20]: print(f"     - {d}")
print(f"  hipótesis AGREGADAS: {sum(agr.values())}  {dict(agr)}")
for d in det_agr[:40]: print(f"     + {d[0]}  {d[1]}  {d[2]}")
