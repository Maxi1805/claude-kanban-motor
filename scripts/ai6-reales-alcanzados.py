#!/usr/bin/env python3
"""OLA AI, FRENTE AI6 — cuántos PROBLEMAS REALES de nivel 1 (veredicto
`verdadero`, fila viva, y HOY sin ninguna hipótesis de ningún patrón según el
volcado de cierre de la Ola AH) alcanza cada compuerta que este frente abrió, y
cuántos de ésos siguen callados por el `required` siguiente.
"""
import csv, json, os, re, collections
LIB = ["click","cobra","eslint","guava","hugo","jekyll","lodash","nest","newtonsoft-json","preact","rubocop","sqlalchemy","vueuse"]
APP = ["Ghost","ShareX","chatwoot","excalidraw","gitea","jenkins","netbox","redmine"]
CONSTRUCTOR_NAMES = {"initialize","constructor","__init__"}
FACTORY_VERB = re.compile(r"^(create|build|make|new|for|from|of|instantiate)", re.I)
def lf(s):
    m = FACTORY_VERB.match(s or "")
    if not m: return False
    r = s[len(m.group(0)):]
    return r == "" or r.startswith("_") or r[:1].isupper()
def viejo(ss): return any(s and (s.lower() in CONSTRUCTOR_NAMES or lf(s)) for s in ss)

for pop, repos, ah in (("BIBLIOTECAS (13)", LIB, "scratchpad-int-ah/dumps13"), ("APLICACIONES (8)", APP, "scratchpad-int-ah/dumpsapp")):
    print("=" * 96); print(pop); print("=" * 96)
    tot = collections.Counter()
    for r in repos:
        ft, fv, vf = f"scratchpad-ai6/traza/{r}.json", f"scratchpad-ai6/dumps/{r}.json", f"tests/golden/precision/{r}.verdicts.csv"
        if not (os.path.exists(ft) and os.path.exists(fv) and os.path.exists(vf)): continue
        t = json.load(open(ft)); d = json.load(open(fv)); a = json.load(open(f"{ah}/{r}.json"))
        syms = {f["id"]: f["symbols"] for f in d["findings"]}
        # problemas REALES mudos, por (kind, file:line), según el volcado de APERTURA
        mudoReal = set()
        hipAntes = {f["id"]: f["hypotheses"] for f in a["findings"]}
        for row in csv.DictReader(open(vf, newline="")):
            if row.get("stillPresent","").lower() != "true": continue
            if (row.get("verdict") or "").strip() != "verdadero": continue
            if hipAntes.get(row["id"]) != []: continue
            mudoReal.add((row["kind"], f'{row["file"]}:{row["startLine"]}'))
        for e in t.get("Builder", []):
            if e["camino"] != "lpl/data-clump": continue
            if viejo(syms.get(e["findingId"], [e["symbol"]])): continue
            if not e["checks"][1]["holds"]: continue           # la compuerta Nº2 NO abre
            k = (e["kind"], f'{e["file"]}:{e["line"]}')
            if k not in mudoReal: continue
            tot[("Builder", "alcanza la Nº2")] += 1
            tot[("Builder", "y emite" if e["checks"][2]["holds"] else "sigue mudo por la Nº3")] += 1
        for e in t.get("Factory Method", []):
            if e["camino"] != "chain/switch-instantiates" or e["kind"] != "conditional-chain": continue
            if e["role"] == "selector de tipo a instanciar": continue
            if not (e["checks"] and all(c["holds"] for c in e["checks"])): continue
            k = (e["kind"], f'{e["file"]}:{e["line"]}')
            if k in mudoReal: tot[("Factory Method", "emite sobre un problema REAL mudo")] += 1
            else: tot[("Factory Method", "emite sobre un hallazgo sin veredicto `verdadero` mudo")] += 1
    for k in sorted(tot): print(f"   {k[0]:16s} {k[1]:44s} {tot[k]}")
