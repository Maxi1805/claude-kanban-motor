#!/usr/bin/env python3
"""OLA AO · AO1 — tabla por patron/ancla sobre los volcados. Sin tocar produccion."""
import json, os, sys, collections

PATS = ["Strategy", "State", "Chain of Responsibility", "Command"]
LIB = "guava hugo sqlalchemy eslint rubocop nest newtonsoft-json vueuse click cobra lodash preact jekyll".split()
APP = "Ghost gitea ShareX jenkins chatwoot excalidraw netbox redmine".split()

d = sys.argv[1]
out = {}
for pop, repos in (("LIB", LIB), ("APP", APP)):
    for r in repos:
        p = os.path.join(d, f"{r}.json")
        if not os.path.exists(p):
            p = os.path.join(d, f"{r}.volcado.json")
        if not os.path.exists(p):
            continue
        data = json.load(open(p))
        for f in data["findings"]:
            for h in f["hypotheses"]:
                if h["pattern"] not in PATS:
                    continue
                out.setdefault((pop, h["pattern"], f["kind"]), collections.Counter())[h["state"]] += 1
        out.setdefault((pop, "#KINDS", r), collections.Counter()).update({k: v["n"] for k, v in data["porKind"].items()})

print(f"{'pob':4} {'patron':26} {'ancla':34} {'ausente':>8} {'parcial':>8} {'ya-apl':>7} {'eludido':>8} {'TOTAL':>6}")
tot = collections.Counter()
for (pop, pat, anc), c in sorted(out.items()):
    if pat == "#KINDS":
        continue
    n = sum(c.values())
    rec = c['ausente'] + c['parcial']
    tot[(pop, pat)] += rec
    print(f"{pop:4} {pat:26} {anc:34} {c['ausente']:8} {c['parcial']:8} {c['ya-aplicado']:7} {c['aplicado-eludido']:8} {n:6}")
print()
print("RECOMENDACIONES (ausente+parcial) por patron y poblacion:")
for k, v in sorted(tot.items()):
    print(f"  {k[0]} {k[1]:26} {v}")
print()
print("HALLAZGOS DE NIVEL 1 por kind relevante:")
kinds = ["conditional-chain","repeated-switch","type-switch","temporary-field","complexity","long-function",
         "many-returns","boolean-complexity","exclusive-dispatch-ladder","distributed-duplication",
         "invariant-scaffold-varying-call","primitive-obsession"]
for pop in ("LIB","APP"):
    agg = collections.Counter()
    nrepos = 0
    for (p, pat, r), c in out.items():
        if p == pop and pat == "#KINDS":
            nrepos += 1
            agg.update(c)
    print(f"  {pop} ({nrepos} repos):", {k: agg[k] for k in kinds})
