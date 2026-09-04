#!/usr/bin/env python3
"""OLA AI, FRENTE AI6 — el delta EXACTO de la tercera vía de
`construye-una-entidad`, sin necesidad de dos corridas del analizador.

CÓMO, Y POR QUÉ ES EXACTO. La compuerta VIEJA es una función PURA de los
`RoleLocation.symbol` del hallazgo: `symbolLooksLikeConstruction` =
`CONSTRUCTOR_NAMES` ∪ `FACTORY_VERB` con frontera estricta, aplicada con
`locations.find(...)` sobre TODOS los lugares. La otra vía vieja
(`repoFn.metrics`) está muerta en producción — `code-analyzer.ts` arma el
`RepoUnit` con `functions: []` — así que el resultado VIEJO se reproduce
exactamente acá, offline, tomando los símbolos del volcado (`findings[].symbols`,
uno por ubicación).

VALIDADO CONTRA LA COMPUERTA REAL: sobre la traza PRE-arreglo de guava (246
candidatos), esta reproducción coincide con `construye-una-entidad.holds` en
246 de 246 — CERO discrepancias.

Uso: python3 scripts/ai6-builder-delta.py [dir-traza] [dir-dumps]
"""
import json, os, re, sys, collections

LIB = ["click","cobra","eslint","guava","hugo","jekyll","lodash","nest","newtonsoft-json","preact","rubocop","sqlalchemy","vueuse"]
APP = ["Ghost","ShareX","chatwoot","excalidraw","gitea","jenkins","netbox","redmine"]
T = sys.argv[1] if len(sys.argv) > 1 else "scratchpad-ai6/traza"
V = sys.argv[2] if len(sys.argv) > 2 else "scratchpad-ai6/dumps"

CONSTRUCTOR_NAMES = {"initialize", "constructor", "__init__"}
FACTORY_VERB = re.compile(r"^(create|build|make|new|for|from|of|instantiate)", re.I)

def looks_like_factory(sym):
    m = FACTORY_VERB.match(sym)
    if not m:
        return False
    rest = sym[len(m.group(0)):]
    return rest == "" or rest.startswith("_") or rest[:1].isupper()

def viejo_uno(sym):
    return bool(sym) and (sym.lower() in CONSTRUCTOR_NAMES or looks_like_factory(sym))

for pop, repos in (("BIBLIOTECAS (13)", LIB), ("APLICACIONES (8)", APP)):
    print("=" * 100)
    print(pop)
    print("=" * 100)
    tot = collections.Counter(); abre = collections.Counter(); porRepo = collections.Counter()
    nuevas = []; faltan = []; incoherencias = 0
    for r in repos:
        ft, fv = f"{T}/{r}.json", f"{V}/{r}.json"
        if not (os.path.exists(ft) and os.path.exists(fv)):
            faltan.append(r); continue
        d = json.load(open(ft)); dump = json.load(open(fv))
        syms = {f["id"]: f["symbols"] for f in dump["findings"]}
        for e in d.get("Builder", []):
            if e["camino"] != "lpl/data-clump":
                continue
            tot[e["kind"]] += 1
            v = any(viejo_uno(s) for s in syms.get(e["findingId"], [e["symbol"]]))
            g2, g3 = e["checks"][1]["holds"], e["checks"][2]["holds"]
            if v and not g2:
                incoherencias += 1  # imposible: la vía nueva sólo puede SUMAR
            if g2 and not v:
                abre[e["kind"]] += 1; porRepo[r] += 1
                if g3:
                    nuevas.append((r, e))
    print(f"  sin traza: {faltan if faltan else 'ninguno'}")
    print(f"  candidatos: total {sum(tot.values())}  {dict(tot)}")
    print(f"  INCOHERENCIAS (la vía vieja sostenía y hoy no) — deben ser 0: {incoherencias}")
    print(f"  abre la VÍA NUEVA (pasa la compuerta 2 y por nombre NO pasaba): {sum(abre.values())}  {dict(abre)}  por repo {dict(porRepo)}")
    print(f"  ... y además pasa `ensambla-con-logica` ⇒ HIPÓTESIS NUEVA: {len(nuevas)}")
    for r, e in nuevas:
        print(f"      {r:16s} {e['kind']:20s} {e['file']}:{e['line']}  sym={e['symbol']}  estado={e['appliedState']}  publicada={e['publicado']}")
        print(f"          id={e['findingId']}")
