#!/usr/bin/env python3
"""OLA AI, FRENTE AI6 — la tabla del embudo: por patrón, camino y `required`,
cuántos candidatos ENTRAN y cuántos MUEREN ahí, en las dos poblaciones y con
desglose por repo y por lenguaje. Lee las trazas de `scripts/ai6-embudo.mts`.

La pregunta que contesta es la del encargo: *¿hay un `required` que, para un
subconjunto identificable de su entrada, no se pueda satisfacer POR
CONSTRUCCIÓN?* — por eso imprime, para cada compuerta, el reparto por LENGUAJE
de los que mueren: un 100 % concentrado en un lenguaje es la firma del defecto.
"""
import json, os, sys, collections

LIB = ["click","cobra","eslint","guava","hugo","jekyll","lodash","nest","newtonsoft-json","preact","rubocop","sqlalchemy","vueuse"]
APP = ["Ghost","ShareX","chatwoot","excalidraw","gitea","jenkins","netbox","redmine"]
PAT = ["Builder","Factory Method","Abstract Factory","Command","Composite","Iterator"]
D = sys.argv[1] if len(sys.argv) > 1 else "scratchpad-ai6/traza"

def load(repos):
    out, faltan = [], []
    for r in repos:
        fn = f"{D}/{r}.json"
        if not os.path.exists(fn):
            faltan.append(r); continue
        d = json.load(open(fn))
        for p in PAT:
            for e in d.get(p, []):
                e = dict(e); e["repo"] = r; e["patron"] = p
                out.append(e)
    return out, faltan

def tabla(rows, pop, faltan):
    print("\n" + "=" * 108)
    print(f"{pop}   (sin traza todavía: {faltan if faltan else 'ninguno'})")
    print("=" * 108)
    for p in PAT:
        rp = [e for e in rows if e["patron"] == p]
        if not rp: continue
        for cam in sorted({e["camino"] for e in rp}):
            rc = [e for e in rp if e["camino"] == cam]
            n = len(rc)
            emit = sum(1 for e in rc if e["emitted"])
            pub = sum(1 for e in rc if e["publicado"])
            kinds = collections.Counter(e["kind"] for e in rc)
            print(f"\n-- {p} · {cam}: {n} candidatos {dict(kinds)} · emiten {emit} · publicados {pub}")
            presp = [e for e in rc if not e["checks"]]
            if presp:
                print(f"     [pre-spec] mueren antes del motor: {len(presp)} {dict(collections.Counter(e['diesAt'] for e in presp))}")
            orden = []
            for e in rc:
                for i, c in enumerate(e["checks"]):
                    while len(orden) <= i: orden.append(collections.Counter())
                    orden[i][c["id"]] += 1
            ids = [c.most_common(1)[0][0] for c in orden]
            for i, cid in enumerate(ids):
                entran = [e for e in rc if len(e["checks"]) > i and all(c["holds"] for c in e["checks"][:i])]
                mueren = [e for e in entran if not e["checks"][i]["holds"]]
                pct = 100 * len(mueren) / len(entran) if entran else 0
                marca = "  <<< MATA EL 100 %" if entran and len(mueren) == len(entran) else ""
                print(f"     [{i+1}] {cid:52s} entran {len(entran):5d}  mueren {len(mueren):5d} ({pct:5.1f}%){marca}")
                if mueren:
                    print(f"          lenguaje: {dict(collections.Counter(e['language'] for e in mueren).most_common(8))}")
                    print(f"          repo:     {dict(collections.Counter(e['repo'] for e in mueren).most_common(8))}")
                    # ¿algún lenguaje muere al 100 %? — la firma del defecto
                    porLang = collections.Counter(e["language"] for e in entran)
                    muereLang = collections.Counter(e["language"] for e in mueren)
                    cien = [l for l in porLang if porLang[l] >= 5 and muereLang[l] == porLang[l]]
                    if cien: print(f"          *** MUEREN AL 100 % (n>=5): {[(l, porLang[l]) for l in cien]}")
            sob = [e for e in rc if e["checks"] and all(c["holds"] for c in e["checks"])]
            print(f"     SOBREVIVEN los required: {len(sob)}  estados: {dict(collections.Counter(e['appliedState'] for e in sob))}")

rl, fl = load(LIB); ra, fa = load(APP)
tabla(rl, f"BIBLIOTECAS", fl)
tabla(ra, f"APLICACIONES", fa)
