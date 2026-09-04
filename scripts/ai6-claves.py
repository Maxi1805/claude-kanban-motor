#!/usr/bin/env python3
"""OLA AI, FRENTE AI6 — la CLAVE de veredicto de cada propuesta nueva.

El `id` que la traza registra es el de la pasada de `build()`, y NO siempre es
el que sale publicado (§4.0 del informe). La clave que el instrumento oficial
cruza contra el censo es la del VOLCADO. Este script resuelve una por la otra,
por (archivo, línea) sobre el volcado del MISMO análisis.
"""
import json, os, re, sys, collections
LIB = ["click","cobra","eslint","guava","hugo","jekyll","lodash","nest","newtonsoft-json","preact","rubocop","sqlalchemy","vueuse"]
APP = ["Ghost","ShareX","chatwoot","excalidraw","gitea","jenkins","netbox","redmine"]
T, V = "scratchpad-ai6/traza", "scratchpad-ai6/dumps"
ROLE_VIEJO = "selector de tipo a instanciar"
CONSTRUCTOR_NAMES = {"initialize","constructor","__init__"}
FACTORY_VERB = re.compile(r"^(create|build|make|new|for|from|of|instantiate)", re.I)
def lf(s):
    m = FACTORY_VERB.match(s or "")
    if not m: return False
    r = s[len(m.group(0)):]
    return r == "" or r.startswith("_") or r[:1].isupper()
def viejo(ss): return any(s and (s.lower() in CONSTRUCTOR_NAMES or lf(s)) for s in ss)

for pop, repos in (("13 bibliotecas", LIB), ("8 aplicaciones", APP)):
    for r in repos:
        ft, fv = f"{T}/{r}.json", f"{V}/{r}.json"
        if not (os.path.exists(ft) and os.path.exists(fv)): continue
        t = json.load(open(ft)); d = json.load(open(fv))
        porLoc = collections.defaultdict(list)
        for f in d["findings"]:
            for w in f["where"]: porLoc[(f["kind"], w)].append(f["id"])
        syms = {f["id"]: f["symbols"] for f in d["findings"]}
        def emit(patron, e):
            loc = f'{e["file"]}:{e["line"]}'
            ids = porLoc.get((e["kind"], loc), [])
            for i in sorted(set(ids)):
                print(f'{i}::{patron}\t{pop}\t{r}\t{e["kind"]}\t{loc}\t{e["symbol"]}\t{e["appliedState"]}')
            if not ids:
                print(f'(SIN CLAVE EN EL VOLCADO)::{patron}\t{pop}\t{r}\t{e["kind"]}\t{loc}\t{e["symbol"]}\t{e["appliedState"]}')
        for e in t.get("Builder", []):
            if e["camino"] != "lpl/data-clump": continue
            if not (e["checks"] and all(c["holds"] for c in e["checks"])): continue
            if viejo(syms.get(e["findingId"], [e["symbol"]])): continue
            emit("Builder", e)
        for e in t.get("Factory Method", []):
            if e["camino"] != "chain/switch-instantiates" or e["kind"] != "conditional-chain": continue
            if not (e["checks"] and all(c["holds"] for c in e["checks"])): continue
            if e["role"] == ROLE_VIEJO: continue
            emit("Factory Method", e)
