#!/usr/bin/env python3
"""OLA AI, FRENTE AI6 — el SUBCONJUNTO IDENTIFICABLE de la compuerta imposible
de `builder.ts#construye-una-entidad`: hallazgos de sus dos anclas viejas en
Java y C#, y de ésos cuántos la compuerta VIEJA (sólo nombre) no podía
aprobar NUNCA. Sobre los volcados de cierre de la Ola AH (los 21 repos).

`viejo_uno` reproduce `symbolLooksLikeConstruction` exactamente (la otra vía
vieja, `repoFn.metrics`, está muerta: `code-analyzer.ts` arma el `RepoUnit`
con `functions: []`).
"""
import json, os, re, sys, collections

LIB = ["click","cobra","eslint","guava","hugo","jekyll","lodash","nest","newtonsoft-json","preact","rubocop","sqlalchemy","vueuse"]
APP = ["Ghost","ShareX","chatwoot","excalidraw","gitea","jenkins","netbox","redmine"]
EXT = {".java":"java", ".cs":"csharp", ".py":"python", ".rb":"ruby", ".go":"go",
       ".ts":"typescript", ".tsx":"typescript", ".js":"javascript", ".jsx":"javascript",
       ".mjs":"javascript", ".cjs":"javascript", ".vue":"vue", ".md":"md"}
CONSTRUCTOR_NAMES = {"initialize","constructor","__init__"}
FACTORY_VERB = re.compile(r"^(create|build|make|new|for|from|of|instantiate)", re.I)

def lang(path):
    for e, l in EXT.items():
        if path.endswith(e): return l
    return "?"

def looks_like_factory(sym):
    m = FACTORY_VERB.match(sym or "")
    if not m: return False
    rest = sym[len(m.group(0)):]
    return rest == "" or rest.startswith("_") or rest[:1].isupper()

def viejo(syms):
    return any(s and (s.lower() in CONSTRUCTOR_NAMES or looks_like_factory(s)) for s in syms)

for pop, repos, base in (("BIBLIOTECAS (13)", LIB, "scratchpad-int-ah/dumps13"),
                         ("APLICACIONES (8)", APP, "scratchpad-int-ah/dumpsapp")):
    print("="*100); print(pop); print("="*100)
    for kind in ("long-parameter-list","data-clump"):
        tot = collections.Counter(); jcs = collections.Counter(); jcsMudo = collections.Counter()
        porRepo = collections.Counter()
        for r in repos:
            fn = f"{base}/{r}.json"
            if not os.path.exists(fn): continue
            d = json.load(open(fn))
            for f in d["findings"]:
                if f["kind"] != kind: continue
                l = lang(f["where"][0].rsplit(":",1)[0])
                tot[l] += 1
                if l in ("java","csharp"):
                    jcs[l] += 1
                    if not viejo(f.get("symbols") or []):
                        jcsMudo[l] += 1; porRepo[r] += 1
        print(f"\n  {kind}: total {sum(tot.values())}  por lenguaje {dict(tot.most_common())}")
        print(f"     Java+C#: {sum(jcs.values())}  {dict(jcs)}")
        print(f"     … y que la compuerta VIEJA no podía aprobar nunca (ni nombre de constructor ni verbo-fábrica): {sum(jcsMudo.values())}  {dict(jcsMudo)}")
        print(f"     por repo: {dict(porRepo.most_common())}")
