#!/usr/bin/env python3
"""OLA AI, FRENTE AI6 — lista, con su fuente al lado, TODA propuesta que este
frente hace aparecer, para juzgarla una por una.

Dos fuentes, las dos exactas y offline:
  · Builder — `construye-una-entidad` sostiene HOY y la compuerta VIEJA
    (`symbolLooksLikeConstruction`, función pura de los símbolos) no podía
    sostener; y además pasa `ensambla-con-logica`.
  · Factory Method — el `required` sostiene HOY y el `role` del detector NO es
    "selector de tipo a instanciar" (o sea: `variant !== "instantiates"`, la
    única forma en que la compuerta vieja podía sostener).

Uso: python3 scripts/ai6-listar-nuevas.py [dir-traza] [dir-dumps]
"""
import json, os, re, sys, collections

LIB = ["click","cobra","eslint","guava","hugo","jekyll","lodash","nest","newtonsoft-json","preact","rubocop","sqlalchemy","vueuse"]
APP = ["Ghost","ShareX","chatwoot","excalidraw","gitea","jenkins","netbox","redmine"]
T = sys.argv[1] if len(sys.argv) > 1 else "scratchpad-ai6/traza"
V = sys.argv[2] if len(sys.argv) > 2 else "scratchpad-ai6/dumps"
BASE = {"lib": "corpus", "app": "corpus-app"}
ROLE_VIEJO = "selector de tipo a instanciar"

CONSTRUCTOR_NAMES = {"initialize", "constructor", "__init__"}
FACTORY_VERB = re.compile(r"^(create|build|make|new|for|from|of|instantiate)", re.I)

def looks_like_factory(sym):
    m = FACTORY_VERB.match(sym or "")
    if not m: return False
    rest = sym[len(m.group(0)):]
    return rest == "" or rest.startswith("_") or rest[:1].isupper()

def viejo(syms):
    return any(s and (s.lower() in CONSTRUCTOR_NAMES or looks_like_factory(s)) for s in syms)

def fuente(base, repo, rel, line, n=14):
    p = os.path.join(base, repo, rel)
    if not os.path.exists(p): return "   (archivo no encontrado)"
    try:
        ls = open(p, encoding="utf-8", errors="replace").read().splitlines()
    except Exception as e:
        return f"   (ilegible: {e})"
    a = max(0, line - 1); b = min(len(ls), line - 1 + n)
    return "\n".join(f"   {i+1:6d}| {ls[i]}" for i in range(a, b))

for pop, repos, base in (("BIBLIOTECAS (13)", LIB, BASE["lib"]), ("APLICACIONES (8)", APP, BASE["app"])):
    print("#" * 108); print("# " + pop); print("#" * 108)
    for r in repos:
        ft, fv = f"{T}/{r}.json", f"{V}/{r}.json"
        if not (os.path.exists(ft) and os.path.exists(fv)): continue
        d = json.load(open(ft)); dump = json.load(open(fv))
        syms = {f["id"]: f["symbols"] for f in dump["findings"]}
        # --- Builder
        for e in d.get("Builder", []):
            if e["camino"] != "lpl/data-clump": continue
            if not (e["checks"] and all(c["holds"] for c in e["checks"])): continue
            if viejo(syms.get(e["findingId"], [e["symbol"]])): continue
            print(f'\n=== NUEVA · Builder · {r} · {e["kind"]} · {e["file"]}:{e["line"]} · {e["symbol"]} · estado={e["appliedState"]}')
            print(f'    id={e["findingId"]}')
            print(fuente(base, r, e["file"], e["line"]))
        # --- Factory Method
        for e in d.get("Factory Method", []):
            if e["camino"] != "chain/switch-instantiates" or e["kind"] != "conditional-chain": continue
            if not (e["checks"] and all(c["holds"] for c in e["checks"])): continue
            if e["role"] == ROLE_VIEJO: continue
            print(f'\n=== NUEVA · Factory Method · {r} · {e["file"]}:{e["line"]} · {e["symbol"]} · estado={e["appliedState"]}')
            print(f'    id={e["findingId"]}   vía: {e["checks"][0]["why"][:150]}')
            print(fuente(base, r, e["file"], e["line"], 26))
