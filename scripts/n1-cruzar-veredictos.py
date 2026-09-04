#!/usr/bin/env python3
"""Cruza los veredictos juzgados a mano contra lo que el detector emite HOY.

Responde la única pregunta que importa de precisión sin volver a muestrear:
de los hallazgos de `unused-symbol` que ya están juzgados y que seguían vivos
al cerrar la Ola N, ¿cuáles sobreviven al detector nuevo?

Uso: python3 scripts/n1-cruzar-veredictos.py /tmp/n1/despues-*.json
"""
import csv
import glob
import json
import os
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

after = {}
for path in sys.argv[1:]:
    d = json.load(open(path))
    after[d["slug"]] = {(r["file"], r["symbol"]) for r in d["filas"]}

tally = Counter()
sobreviven = []
for f in sorted(glob.glob(os.path.join(ROOT, "tests/golden/precision/*.verdicts.csv"))):
    for r in csv.DictReader(open(f)):
        if r["kind"] != "unused-symbol" or not r["verdict"] or r["slug"] not in after:
            continue
        if r["stillPresent"] != "true":
            continue
        vivo = (r["file"], r["symbol"]) in after[r["slug"]]
        tally[(r["verdict"], "SIGUE" if vivo else "eliminado")] += 1
        if vivo:
            sobreviven.append((r["slug"], r["verdict"], r["file"], r["symbol"], r["note"][:150]))

print("veredictos juzgados, vivos al cerrar la Ola N, en los repos medidos:")
for k in sorted(tally):
    print("  %-22s %d" % ("%s / %s" % k, tally[k]))
print("\nlos que SIGUEN:")
for s in sobreviven:
    print("  %s | %s | %s#%s\n      %s" % s)
