#!/usr/bin/env python3
"""OLA AO · AO1 — re-conteo del SUSTRATO sobre volcados PROPIOS del dia, con la
MISMA definicion de `scripts/an1-sonda-a.mts`: pares (archivo, simbolo) con un
hallazgo de NIVEL 2 y NINGUNA de las tres anclas de despacho de Strategy."""
import json, os, sys, collections

LIB = "guava hugo sqlalchemy eslint rubocop nest newtonsoft-json vueuse click cobra lodash preact jekyll".split()
APP = "Ghost gitea ShareX jenkins chatwoot excalidraw netbox redmine".split()
N2 = {"long-function", "complexity", "primitive-obsession"}
ANCLAS = {"conditional-chain", "repeated-switch", "type-switch"}
D = sys.argv[1]

tot = collections.Counter()
por_repo = {}
for pop, repos in (("LIB", LIB), ("APP", APP)):
    for r in repos:
        p = os.path.join(D, f"{r}.volcado.json")
        if not os.path.exists(p):
            p = os.path.join(D, f"{r}.json")
        if not os.path.exists(p):
            continue
        data = json.load(open(p))
        conAncla, n2 = set(), set()
        for f in data["findings"]:
            for i, w in enumerate(f["where"]):
                fil = w[:w.rfind(":")]
                sym = f["symbols"][i] if i < len(f["symbols"]) else ""
                k = (fil, sym)
                if f["kind"] in ANCLAS:
                    conAncla.add(k)
                if f["kind"] in N2 and sym:
                    n2.add(k)
        sitios = len(n2 - conAncla)
        por_repo[(pop, r)] = sitios
        tot[pop] += sitios
        tot[pop + "-repos"] += 1

for pop in ("LIB", "APP"):
    print(f"{pop}: {tot[pop]} sitios de nivel 2 SIN ancla de despacho, sobre {tot[pop+'-repos']} repos")
    for (p, r), n in sorted(por_repo.items()):
        if p == pop:
            print(f"    {r:18} {n}")
