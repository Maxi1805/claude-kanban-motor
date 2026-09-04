#!/usr/bin/env python3
"""OLA AO · AO1 — tabla del embudo de la FUERZA de Chain of Responsibility."""
import json, glob, os, sys
LIB = set("guava hugo sqlalchemy eslint rubocop nest newtonsoft-json vueuse click cobra lodash preact jekyll".split())
D = sys.argv[1]
tot = {"LIB": [0]*6, "APP": [0]*6}
print(f"{'pob':4} {'repo':18} {'funciones':>9} {'>=4 ramas':>9} {'(2)sin-sol':>10} {'(3)pocas':>9} {'(4)un-disc':>10} {'sobrevive':>9}")
for p in sorted(glob.glob(os.path.join(D, "*.json"))):
    r = os.path.basename(p)[:-5]
    d = json.load(open(p))
    c = d["conteo"]
    pop = "LIB" if r in LIB else "APP"
    ge4 = sum(v for k, v in c.items() if k.startswith("ramas>=") and int(k.split(">=")[1]) >= 4)
    fila = [d["funciones"], ge4, c.get("sin-solicitud-comun", 0), c.get("pocas-ramas", 0),
            c.get("condiciones-de-un-solo-discriminante", 0), c.get("sin-grafo", 0) + c.get("(pasa-el-arbol)", 0)]
    for i, v in enumerate(fila):
        tot[pop][i] += v
    print(f"{pop:4} {r:18} {fila[0]:9} {fila[1]:9} {fila[2]:10} {fila[3]:9} {fila[4]:10} {fila[5]:9}")
print()
for pop in ("LIB", "APP"):
    t = tot[pop]
    if t[0]:
        print(f"{pop} TOTAL          {t[0]:9} {t[1]:9} {t[2]:10} {t[3]:9} {t[4]:10} {t[5]:9}")
