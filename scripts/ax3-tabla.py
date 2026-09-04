#!/usr/bin/env python3
"""AX3 - censo de poblacion de `Lazy Class` + variantes candidatas.
Las variantes estan escritas ANTES de mirar los agregados (trampa 1 de la ola)."""
import json, sys, os, glob, re
from collections import defaultdict

VOL = sys.argv[1] if len(sys.argv) > 1 else "scratchpad-ax3/vol"
# `integration/`, `e2e/` y `acceptance/` son ARBOLES DE PRUEBA (nest los usa como apps
# e2e completas). Se suman a `demo|example`: excluir codigo de prueba es una decision de
# alcance tomada A PRIORI, no un recorte elegido despues de ver falsos.
RE_DEMO = re.compile(r"(^|/)(demo|demos|example|examples|sample|samples|benchmark|benchmarks|integration|e2e|acceptance)(/|$)", re.I)

def tipo(nt):
    if not nt: return "?"
    if "interface" in nt: return "interfaz"
    if "enum" in nt: return "enum"
    if nt in ("module", "internal_module", "namespace_declaration"): return "modulo"
    if nt == "type_spec": return "type_spec"
    return "clase"

BIBLIOTECAS = {"click","cobra","eslint","guava","hugo","jekyll","lodash","nest",
               "newtonsoft-json","preact","rubocop","sqlalchemy","vueuse"}
APLICACIONES = {"Ghost","ShareX","chatwoot","excalidraw","gitea","jenkins","netbox","redmine"}

def cargar(vol=VOL):
    filas = []
    for p in sorted(glob.glob(os.path.join(vol, "*.json"))):
        d = json.load(open(p))
        if d.get("sinGrafo"): continue
        for c in d["clases"]:
            c["repo"] = d["repo"]; c["tipo"] = tipo(c["nt"]); c["demo"] = bool(RE_DEMO.search(c["file"]))
            c["mundo"] = "biblioteca" if d["repo"] in BIBLIOTECAS else "aplicacion"
            filas.append(c)
    return filas

# ── VARIANTES (declaradas antes de ver los agregados) ─────────────────────
def sana(c):
    return (c["tipo"] in ("clase", "type_spec") and not c["test"] and not c["demo"]
            and c["subtipos"] == 0 and c["interfaces"] == 0)
def LC_A(c):  # hoja delgada de una jerarquia del repo -> Collapse Hierarchy
    return sana(c) and c["padres"] >= 1 and c["loc"] <= 15 and c["nmet"] <= 2 and c["nm"] >= 1
def LC_B(c):  # cuerpo minusculo y UN solo archivo usuario -> Inline Class
    return sana(c) and c["padres"] == 0 and c["loc"] <= 15 and c["nmet"] >= 1 and c["usArch"] == 1
def LC_C(c):  # pasarela: >=2 metodos, todos salen, y todo va a UN archivo ajeno
    return (sana(c) and c["nmet"] >= 2 and c["destArchN"] == 1 and c["usArch"] >= 1
            and c["loc"] <= 40 and all(m["out"] >= 1 for m in c["met"]) and len(c["met"]) == c["nmet"])
def LC_D(c):  # cascaron: no declara NADA y el cuerpo esta vacio de verdad
    return sana(c) and c["nm"] == 0 and c["loc"] <= 3
VARIANTES = [("LC-A hoja delgada", LC_A), ("LC-B minuscula + 1 usuario", LC_B),
             ("LC-C pasarela", LC_C), ("LC-D cascaron", LC_D)]

if __name__ == "__main__":
    filas = cargar()
    print(f"== NODOS class-like TOTALES: {len(filas)}  ({len(set(f['repo'] for f in filas))} repos con salida)")
    por = defaultdict(int)
    for c in filas: por[c["tipo"]] += 1
    print("   por tipo de declaracion:", dict(sorted(por.items(), key=lambda kv:-kv[1])))
    print()
    CL = [c for c in filas if c["tipo"] in ("clase", "type_spec")]
    print(f"== POBLACION REAL (clase/struct; sin interfaz, enum ni modulo): {len(CL)}")
    pr = defaultdict(int); pl = defaultdict(int)
    for c in CL: pr[c["repo"]] += 1; pl[c["lang"]] += 1
    print("   por repo:", dict(sorted(pr.items(), key=lambda kv:-kv[1])))
    print("   por lenguaje:", dict(sorted(pl.items(), key=lambda kv:-kv[1])))
    print(f"   en test/: {sum(1 for c in CL if c['test'])}   en demo|example/: {sum(1 for c in CL if c['demo'])}")
    def hist(vals, cortes):
        n = len(vals) or 1
        return {f"<={k}": f"{sum(1 for v in vals if v<=k)} ({100*sum(1 for v in vals if v<=k)//n}%)" for k in cortes}
    print("   metodos (nmet):", hist([c["nmet"] for c in CL], [0,1,2,3,5,10]))
    print("   lineas (loc):", hist([c["loc"] for c in CL], [3,5,10,15,25,50]))
    print("   usuarios-archivo externos:", hist([c["usArch"] for c in CL], [0,1,2,3,5]))
    print()
    PROD = [c for c in CL if not c["test"] and not c["demo"]]
    print(f"== PRODUCCION: {len(PROD)}   hereda-del-repo={sum(1 for c in PROD if c['padres']>0)}"
          f"  con-subtipos={sum(1 for c in PROD if c['subtipos']>0)}"
          f"  implementa={sum(1 for c in PROD if c['interfaces']>0)}")
    print()
    print("== VARIANTES CANDIDATAS (sobre la poblacion entera, ya filtrada por `sana`)")
    for nom, f in VARIANTES:
        sel = [c for c in filas if f(c)]
        l = defaultdict(int); r = defaultdict(int)
        for c in sel: l[c["lang"]] += 1; r[c["repo"]] += 1
        print(f"  {nom}: {len(sel)}")
        print(f"      langs={dict(sorted(l.items(), key=lambda kv:-kv[1]))}")
        print(f"      repos={dict(sorted(r.items(), key=lambda kv:-kv[1]))}")
        m = defaultdict(int)
        for c in sel: m[c["mundo"]] += 1
        print(f"      mundo={dict(m)}")
