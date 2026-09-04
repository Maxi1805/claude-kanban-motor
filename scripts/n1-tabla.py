#!/usr/bin/env python3
"""Tabla de volumen por LENGUAJE, antes y después — frente N1, Ola O.

Lee los JSON de `scripts/n1-unused-symbol-probe.mts` (que trae las dos
columnas medidas contra el MISMO grafo) e imprime la tabla en markdown.

Uso: python3 scripts/n1-tabla.py /tmp/n1/despues-*.json
"""
import json
import sys
from collections import defaultdict

repos = []
antes_lang = defaultdict(int)
despues_lang = defaultdict(int)
antes_emit_lang = defaultdict(int)
despues_emit_lang = defaultdict(int)

for path in sys.argv[1:]:
    d = json.load(open(path))
    repos.append(d)
    for k, v in d["antesPorLenguaje"].items():
        antes_lang[k] += v
    for k, v in d["despuesPorLenguaje"].items():
        despues_lang[k] += v
    for k, v in d["despuesEmitidoPorLenguaje"].items():
        despues_emit_lang[k] += v

print("## Por repo (candidatos CRUDOS, antes del presupuesto de 200)\n")
print("| repo | lenguajes | antes crudo | después crudo | antes emitido | después emitido |")
print("|---|---|---:|---:|---:|---:|")
ta = td = tae = tde = 0
for d in sorted(repos, key=lambda r: -r["antesCrudo"]):
    print(
        "| %s | %s | %d | %d | %d | %d |"
        % (
            d["slug"],
            ", ".join(d["languages"]),
            d["antesCrudo"],
            d["despuesCrudo"],
            d["antesEmitido"],
            d["despuesEmitido"],
        )
    )
    ta += d["antesCrudo"]
    td += d["despuesCrudo"]
    tae += d["antesEmitido"]
    tde += d["despuesEmitido"]
print("| **TOTAL** | | **%d** | **%d** | **%d** | **%d** |" % (ta, td, tae, tde))

print("\n## Por LENGUAJE\n")
print("| lenguaje | antes crudo | después crudo | Δ | después emitido |")
print("|---|---:|---:|---:|---:|")
for lang in sorted(set(antes_lang) | set(despues_lang)):
    a, b = antes_lang[lang], despues_lang[lang]
    delta = "—" if a == 0 else "%+.0f %%" % (100.0 * (b - a) / a)
    print("| %s | %d | %d | %s | %d |" % (lang, a, b, delta, despues_emit_lang[lang]))
print(
    "| **TOTAL** | **%d** | **%d** | **%+.0f %%** | **%d** |"
    % (sum(antes_lang.values()), sum(despues_lang.values()),
       100.0 * (sum(despues_lang.values()) - sum(antes_lang.values())) / max(1, sum(antes_lang.values())),
       sum(despues_emit_lang.values()))
)
