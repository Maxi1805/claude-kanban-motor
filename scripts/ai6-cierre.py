#!/usr/bin/env python3
"""OLA AI, FRENTE AI6 — el cierre: todo lo que va en la primera línea del
informe, calculado de una sola pasada sobre las trazas y los volcados finales.
"""
import csv, json, math, os, re, collections
LIB = ["click","cobra","eslint","guava","hugo","jekyll","lodash","nest","newtonsoft-json","preact","rubocop","sqlalchemy","vueuse"]
APP = ["Ghost","ShareX","chatwoot","excalidraw","gitea","jenkins","netbox","redmine"]
ROLE_VIEJO = "selector de tipo a instanciar"
CN = {"initialize","constructor","__init__"}
FV = re.compile(r"^(create|build|make|new|for|from|of|instantiate)", re.I)
def lf(s):
    m = FV.match(s or "")
    if not m: return False
    r = s[len(m.group(0)):]
    return r == "" or r.startswith("_") or r[:1].isupper()
def viejo(ss): return any(s and (s.lower() in CN or lf(s)) for s in ss)

for pop, repos in (("BIBLIOTECAS (13)", LIB), ("APLICACIONES (8)", APP)):
    print("=" * 100); print(pop); print("=" * 100)
    nuevas = collections.Counter(); porRepo = collections.Counter(); estados = collections.Counter()
    faltan = []
    for r in repos:
        ft, fv = f"scratchpad-ai6/traza/{r}.json", f"scratchpad-ai6/dumps/{r}.json"
        if not (os.path.exists(ft) and os.path.exists(fv)): faltan.append(r); continue
        t = json.load(open(ft)); d = json.load(open(fv))
        syms = {f["id"]: f["symbols"] for f in d["findings"]}
        for e in t.get("Builder", []):
            if e["camino"] != "lpl/data-clump": continue
            if not (e["checks"] and all(c["holds"] for c in e["checks"])): continue
            if viejo(syms.get(e["findingId"], [e["symbol"]])): continue
            nuevas[("Builder", e["kind"])] += 1; porRepo[("Builder", r)] += 1; estados[("Builder", e["appliedState"])] += 1
        for e in t.get("Factory Method", []):
            if e["camino"] != "chain/switch-instantiates" or e["kind"] != "conditional-chain": continue
            if not (e["checks"] and all(c["holds"] for c in e["checks"]))or e["role"] == ROLE_VIEJO: continue
            via = "grafo" if "GRAFO" in e["checks"][0]["why"] else "árbol"
            nuevas[("Factory Method", via)] += 1; porRepo[("Factory Method", r)] += 1; estados[("Factory Method", e["appliedState"])] += 1
    print(f"  sin traza: {faltan if faltan else 'ninguno'}")
    print(f"  PROPUESTAS NUEVAS: {sum(nuevas.values())}   {dict(nuevas)}")
    print(f"  por repo: {dict(porRepo)}")
    print(f"  por estado: {dict(estados)}")
