#!/usr/bin/env python3
"""OLA AO · AO1 — evaluacion OFFLINE de las variantes del ensanche, sobre la traza
del embudo. NO toca produccion: contesta "cuantas emitiria cada variante" ANTES de
escribir una linea de produccion, que es lo que la compuerta de aterrizaje exige.

Variantes:
  HOY-INTRA   la de produccion de hoy: >=2 escaleras de `if` en UNA funcion
  CRUZA-IF    >=2 escaleras de `if` en >=2 FUNCIONES del archivo, con >=C valores compartidos
  MIXTO       >=2 escaleras contando `switch`
"""
import json, os, sys, collections, re

# Un VALOR del alfabeto tiene que ser ATOMICO: si el texto que quedo a la derecha
# del primer operador de comparacion contiene OTRO operador o un conector logico,
# lo que se leyo no es un valor sino una condicion COMPUESTA. Es el defecto que
# AN1 dejo DECLARADO en su §11.4 ("el alfabeto se infla con condiciones
# compuestas") y no arreglado. Vocabulario de gramatica, ni una palabra de dominio.
NO_ATOMICO = re.compile(r"(===|!==|==|!=|>=|<=|>|<|&&|\|\||\band\b|\bor\b)")

def atomicos(vista):
    """Cuantos de los valores LISTADOS son atomicos, y cuantos de los compartidos."""
    vl = vista.get("valoresLista") or []
    return sum(1 for v in vl if not NO_ATOMICO.search(v))

LIB = "guava hugo sqlalchemy eslint rubocop nest newtonsoft-json vueuse click cobra lodash preact jekyll".split()
APP = "Ghost gitea ShareX jenkins chatwoot excalidraw netbox redmine".split()
D = sys.argv[1]
C = int(sys.argv[2]) if len(sys.argv) > 2 else 2
EXIGE_PARTICIPACION = os.environ.get("AO1_PARTICIPA", "1") == "1"

tot = collections.defaultdict(collections.Counter)
repos_por = collections.defaultdict(lambda: collections.defaultdict(set))
detalle = []
sustrato = collections.Counter()
embudo = collections.Counter()
viejos = []

for pop, repos in (("LIB", LIB), ("APP", APP)):
    for r in repos:
        p = os.path.join(D, f"{r}.traza.json")
        if not os.path.exists(p):
            continue
        t = json.load(open(p))
        viejo = any(c and "todo" not in c[0] for c in
                    [e["ampliado"]["candidatos"] for e in t["filas"] if e.get("ampliado")])
        if viejo:
            viejos.append(r)
            continue
        sustrato[(pop, "repos")] += 1
        vistos = set()
        archivosVistos = set()
        for e in t["filas"]:
            sustrato[(pop, "nivel2-filas")] += 1
            a = e.get("ampliado")
            if a and (r, e["file"]) not in archivosVistos:
                archivosVistos.add((r, e["file"]))
                sustrato[(pop, "peldanos-sin-operador")] += a["peldanosSinOperador"]
                sustrato[(pop, "archivos-con-nivel2")] += 1
            if e["emitted"]:
                tot[(pop, "PRODUCCION")]["emite"] += 1
                repos_por[(pop, "PRODUCCION")]["emite"].add(r)
            ch = {c["id"]: c["holds"] for c in e["checks"]}
            base = (ch.get("vecindario-legible", False)
                    and ch.get("sin-ancla-de-despacho-en-este-simbolo", False)
                    and ch.get("resolucion-no-presente", False))
            if not a or not a["candidatos"]:
                continue
            embudo[(pop, "1-con-candidato")] += 1
            if not base:
                embudo[(pop, "2-muere-en-los-3-required-base")] += 1
                continue
            embudo[(pop, "2-pasa-los-3-required-base")] += 1
            mios = {s for s in e["symbols"] if s}
            conAncla = set(a["simbolosConAnclaDespacho"])
            for cd in a["candidatos"]:
                for nombre, vista in (("MIXTO", cd["todo"]), ("SOLO-IF", cd["soloIf"])):
                    if not vista:
                        continue
                    if nombre == "MIXTO" and vista["switches"] == 0:
                        continue
                    funcs = set(vista["funciones"])
                    if EXIGE_PARTICIPACION and not (funcs & mios):
                        embudo[(pop, f"3-{nombre}-no-participa")] += 1
                        continue
                    if funcs & conAncla:
                        embudo[(pop, f"4-{nombre}-funcion-ya-cubierta")] += 1
                        continue
                    if not vista["ramasInvocan"]:
                        embudo[(pop, f"5-{nombre}-muere-ramas-invocan")] += 1
                        continue
                    embudo[(pop, f"6-{nombre}-pasa-todo")] += 1
                    at = atomicos(vista)
                    if nombre == "SOLO-IF":
                        var = "HOY-INTRA" if not vista["cruzaFuncion"] else ("CRUZA-IF" if vista["compartidos"] >= C else None)
                        if var == "CRUZA-IF" and at < 5:
                            var = "CRUZA-IF-NOAT"
                    else:
                        var = "MIXTO" if (not vista["cruzaFuncion"] or vista["compartidos"] >= C) else None
                        if var == "MIXTO" and at < 5:
                            var = "MIXTO-NOAT"
                    if var is None:
                        embudo[(pop, f"7-{nombre}-sin-alfabeto-compartido")] += 1
                        continue
                    key = (r, e["file"], cd["subject"], var)
                    if key in vistos:
                        continue
                    vistos.add(key)
                    tot[(pop, var)]["emite"] += 1
                    repos_por[(pop, var)]["emite"].add(r)
                    detalle.append({"pop": pop, "repo": r, "variante": var, "file": e["file"],
                                    "line": e["line"], "kind": e["kind"], "id": e["findingId"],
                                    "symbols": e["symbols"], "estado": e["appliedState"],
                                    "subject": cd["subject"], "vista": vista, "atomicos": at})

if viejos:
    print("TRAZAS EN FORMATO VIEJO (descartadas, hay que re-correrlas):", viejos)
print("SUSTRATO:", dict(sustrato))
print()
print("EMBUDO:")
for k, v in sorted(embudo.items()):
    print(f"  {k[0]} {k[1]:44} {v}")
print()
print(f"{'pob':4} {'variante':12} {'emitiria':>9} {'repos':>6}")
for (pop, k), c in sorted(tot.items()):
    print(f"{pop:4} {k:12} {c['emite']:9} {len(repos_por[(pop,k)]['emite']):6}  {sorted(repos_por[(pop,k)]['emite'])}")
json.dump(detalle, open(os.path.join(D, f"variantes-c{C}.json"), "w"), indent=1)
print(f"\ndetalle -> {D}/variantes-c{C}.json ({len(detalle)} filas)")
