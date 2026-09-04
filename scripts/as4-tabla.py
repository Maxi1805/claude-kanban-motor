#!/usr/bin/env python3
"""OLA AS - AS4. Agrega los volcados: emisiones por familia y por repo, y el
control de que las verdaderas de los 19 patrones no se movieron."""
import json, glob, collections, math, sys, os

VOL = sys.argv[1] if len(sys.argv) > 1 else "/home/maxi1805/claude-kanban/scratchpad-as4/vol"
MIOS = ["Pull Up", "Hide Delegate", "Remove Middle Man", "Break Dependency Cycle"]
LOS19 = ["Abstract Factory","Builder","Chain of Responsibility","Command","Composite","Decorator",
         "Extract Method","Facade","Factory Method","Iterator","Null Object","Observer","Prototype",
         "Proxy (inicialización perezosa)","Singleton","State","Strategy","Template Method","Value Object"]

def wilson(k, n, z=1.96):
    if n == 0: return (0.0, 0.0, 0.0)
    p = k / n
    d = 1 + z*z/n
    c = (p + z*z/(2*n)) / d
    m = z*math.sqrt(p*(1-p)/n + z*z/(4*n*n)) / d
    return (p, max(0.0, c-m), min(1.0, c+m))

porRepo = collections.defaultdict(collections.Counter)
estados = collections.defaultdict(collections.Counter)
lenguajes = collections.defaultdict(collections.Counter)
p19 = collections.Counter()
anclas = collections.defaultdict(collections.Counter)
repos = []
detalle = []

for p in sorted(glob.glob(os.path.join(VOL, "*.json"))):
    d = json.load(open(p)); r = d["repo"]; repos.append(r)
    kindOf = {a["id"]: a for a in d["anclas"]}
    for a in d["anclas"]:
        anclas[a["kind"]][r] += 1
    for h in d["hipotesis"]:
        if h["pattern"] in LOS19:
            p19[h["pattern"]] += 1
        if h["pattern"] in MIOS:
            porRepo[h["pattern"]][r] += 1
            estados[h["pattern"]][h["state"]] += 1
            anc = kindOf.get(h["id"])
            if anc: lenguajes[h["pattern"]][anc.get("language") or "?"] += 1
            fila = dict(h); fila["repo"] = r
            if anc:
                fila["_ancla_kind"] = anc["kind"]
                fila["_ancla_file"] = anc["locations"][0]["file"] if anc["locations"] else None
                fila["_ancla_title"] = anc["title"]
            detalle.append(fila)

print(f"REPOS MEDIDOS ({len(repos)}): {' '.join(sorted(repos))}\n")
print("=== EMISIONES DE ESTE FRENTE ===")
for m in MIOS:
    tot = sum(porRepo[m].values())
    print(f"{m:26s} {tot:5d}   estados={dict(estados[m])}")
    if tot: print(f"{'':26s}       repos={dict(porRepo[m])}")
    if tot: print(f"{'':26s}       lenguajes={dict(lenguajes[m])}")
print(f"\nTOTAL FRENTE: {sum(sum(porRepo[m].values()) for m in MIOS)}\n")

print("=== POBLACION DE LAS 9 ANCLAS ===")
for k in sorted(anclas, key=lambda x: -sum(anclas[x].values())):
    print(f"{k:26s} {sum(anclas[k].values()):5d}  {dict(anclas[k])}")

print("\n=== LOS 19 PATRONES (control) ===")
for k in LOS19:
    if p19[k]: print(f"{k:34s} {p19[k]:5d}")
print(f"TOTAL 19: {sum(p19.values())}")

with open(os.path.join(VOL, "..", "detalle-as4.json"), "w") as f:
    json.dump(detalle, f, indent=1, ensure_ascii=False)
print(f"\ndetalle -> scratchpad-as4/detalle-as4.json  ({len(detalle)} propuestas)")
