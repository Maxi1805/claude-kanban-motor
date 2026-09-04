#!/usr/bin/env python3
"""OLA AU / AU2 — el CONTRAFACTUAL de los 19 patrones: mismo repo, mismo arbol,
con y sin las dos hipotesis nuevas registradas.

Compara `(findingId, pattern, state)` de TODA hipotesis que NO sea mia. Si la
familia nueva no puede mover una verdadera de los 19, los dos conjuntos tienen
que ser IDENTICOS, no parecidos.

Uso: python3 scripts/au2-ab.py <con.json> <sin.json>
"""
import json, sys

MIOS = {"Extract Duplicated Method", "Pull Up Duplicated Member"}

def filas(path):
    d = json.load(open(path))
    return d, {(h["id"], h["pattern"], h["state"]) for h in d["hipotesis"] if h["pattern"] not in MIOS}

dcon, con = filas(sys.argv[1])
dsin, sin = filas(sys.argv[2])

print(f"repo: {dcon['repo']}  (con={len(con)} filas de los 19, sin={len(sin)})")
print(f"hallazgos: con={dcon['totalHallazgos']}  sin={dsin['totalHallazgos']}")
mias = sum(1 for h in dcon["hipotesis"] if h["pattern"] in MIOS)
print(f"propuestas mias en el brazo CON: {mias}")

solo_con = con - sin
solo_sin = sin - con
print(f"\nfilas de los 19 que aparecen SOLO con mis hipotesis: {len(solo_con)}")
for x in sorted(solo_con)[:20]:
    print("   +", x)
print(f"filas de los 19 que DESAPARECEN al agregarlas:      {len(solo_sin)}")
for x in sorted(solo_sin)[:20]:
    print("   -", x)

print("\nVEREDICTO:", "IDENTICOS — cero patrones movidos" if not solo_con and not solo_sin else "DIFERENCIA: revisar")

# Censo por kind, para descartar que el nivel 1 se haya movido.
if dcon["censo"] != dsin["censo"]:
    print("\n!! el censo por kind DIFIERE:")
    for k in sorted(set(dcon["censo"]) | set(dsin["censo"])):
        a, b = dcon["censo"].get(k, 0), dsin["censo"].get(k, 0)
        if a != b:
            print(f"   {k}: con={a} sin={b}")
else:
    print("censo por kind: IDENTICO (el nivel 1 no se movio, como tenia que ser: no toque ningun detector)")
