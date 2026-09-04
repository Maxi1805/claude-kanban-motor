#!/usr/bin/env python3
"""AX3 - arma ola-ax/veredictos/AX3.json desde el TSV de juicios + el censo."""
import json, math, sys, os
from collections import Counter
sys.argv_=sys.argv; sys.argv=['x','scratchpad-ax3/vol']
exec(open('scripts/ax3-tabla.py').read().split('if __name__')[0])
sys.argv=sys.argv_

filas = cargar()
idx = {}
for c in filas:
    idx[(c["repo"], c["file"], c["sl"])] = c

raz = json.load(open('scratchpad-ax3/razones.json'))
juicios = []
for ln in open('scratchpad-ax3/juicios.tsv'):
    ln = ln.rstrip('\n')
    if not ln: continue
    var, repo, arch, linea, clase, fam = ln.split('\t')
    c = idx.get((repo, arch, int(linea)))
    juicios.append({"variante": var, "repo": repo,
        "mundo": "biblioteca" if repo in BIBLIOTECAS else "aplicacion",
        "archivo": arch, "linea": int(linea), "clase": clase,
        "lang": (c or {}).get("lang"), "loc": (c or {}).get("loc"),
        "nmet": (c or {}).get("nmet"), "usArchExterno": (c or {}).get("usArch"),
        "verdict": "falso", "familia_del_falso": fam, "por-que": raz[fam],
        "fuente": "AX3 abriendo el archivo", "fuente_corta": "AX3"})

def wilson(k, n, z=1.96):
    if n == 0: return [0.0, 100.0]
    p=k/n; d=1+z*z/n; c=(p+z*z/(2*n))/d
    h=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
    return [round(100*max(0,c-h),1), round(100*min(1,c+h),1)]

def LC_Cp(c):
    return (sana(c) and c["nmet"]>=2 and c["ncamp"]<=1 and c["usArch"]>=1
            and c["destArchN"]==1 and len(c["met"])==c["nmet"]
            and all(m["loc"]<=4 and m["out"]>=1 and m["arch"]==1 for m in c["met"]))

pobl = {}
for nom, pred in [("LC-A", LC_A), ("LC-B", LC_B), ("LC-C", LC_C), ("LC-D", LC_D)]:
    sel = [c for c in filas if pred(c)]
    pobl[nom] = {"poblacion": len(sel),
                 "por_repo": dict(sorted(Counter(c["repo"] for c in sel).items(), key=lambda kv:-kv[1])),
                 "por_lenguaje": dict(sorted(Counter(c["lang"] for c in sel).items(), key=lambda kv:-kv[1])),
                 "por_mundo": dict(Counter(c["mundo"] for c in sel))}

porVar = Counter(j["variante"] for j in juicios)
n = len(juicios)
CL = [c for c in filas if c["tipo"] in ("clase","type_spec")]
salida = {
 "frente": "AX3", "ola": "AX", "fila": "Lazy Class",
 "estado": "CERRADA CON SU NUMERO. Hay poblacion; no hay precondicion. No se construyo detector ni hipotesis.",
 "familia_construida": "NINGUNA",
 "alcance": "abrir por primera vez la unica de las 22 filas canonicas que nunca se abrio: contar la poblacion, buscar una precondicion que sea HECHO + VISIBLE EN LO QUE EL ANALIZADOR CARGA + suficiente para ser PROBLEMA, y construir solo si la hay",
 "convencion": "verdadero / falso / problema-si-patron-no — la misma del banco",
 "unidad": "un SUJETO es una clase: (repo, archivo, linea de declaracion)",
 "que_rompi": "NADA, y esta MEDIDO: `diff -rq scratchpad-ax3/src0 src` devuelve DOS lineas y las dos son archivos NUEVOS de otro frente (`detect/inter-file/homonymous-divergent-signature.ts` y su test). Ningun archivo de `hypotheses/`, ningun `registry.ts`, ningun detector y ningun test difiere de la copia congelada. Mis cuatro scripts importan de `../scratchpad-ax3/src0`, nunca de `src/`.",
 "lineas_de_registry": "NINGUNA — no registro detector ni hipotesis. Es el entregable, no una omision.",
 "verdaderas_de_los_17_patrones_tocadas": 0,
 "como_medi_los_patrones": "`diff -rq scratchpad-ax3/src0 src`: cero archivos de `hypotheses/` difieren, asi que ninguna propuesta de patron puede haberse movido por este frente.",
 "aterriza": "NO, y tampoco va a la banda intermedia 35-50 %: el TECHO del intervalo de Wilson al 95 % del agregado esta por debajo de las dos compuertas con el intervalo entero.",
 "censo": {
   "nodos_class_like": len(filas),
   "poblacion_real_clases_y_structs": len(CL),
   "por_tipo_de_declaracion": dict(sorted(Counter(c["tipo"] for c in filas).items(), key=lambda kv:-kv[1])),
   "clases_por_repo": dict(sorted(Counter(c["repo"] for c in CL).items(), key=lambda kv:-kv[1])),
   "clases_por_lenguaje": dict(sorted(Counter(c["lang"] for c in CL).items(), key=lambda kv:-kv[1])),
   "clases_por_mundo": dict(Counter(c["mundo"] for c in CL)),
   "sin_usuarios_externos_pct": round(100*sum(1 for c in CL if c["usArch"]==0)/max(1,len(CL)),1),
   "repos_medidos": sorted(set(c["repo"] for c in filas)),
 },
 "poblacion_de_las_variantes": pobl,
 "resumen_por_variante": {v: {"juzgados": k, "verdaderos": 0, "precision_pct": 0.0,
                              "wilson95_pct": wilson(0, k)} for v, k in sorted(porVar.items())},
 "agregado": {"juzgados": n, "verdaderos": 0, "precision_pct": 0.0, "wilson95_pct": wilson(0, n)},
 "familias_del_falso": dict(Counter(j["familia_del_falso"] for j in juicios).most_common()),
 "repos_representados": dict(Counter(j["repo"] for j in juicios).most_common()),
 "lenguajes_representados": dict(Counter(j["lang"] for j in juicios).most_common()),
 "juicios": juicios,
}
json.dump(salida, open('/home/maxi1805/claude-kanban-docs/ola-ax/veredictos/AX3.json','w'), ensure_ascii=False, indent=1)
print("juzgados", n, salida["agregado"]["wilson95_pct"])
print("langs", salida["lenguajes_representados"])
print("mundo", salida["censo"]["clases_por_mundo"])
