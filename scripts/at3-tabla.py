#!/usr/bin/env python3
"""OLA AT - AT3. Tabla de emisiones y embudo, por repo y por familia."""
import json, glob, os, sys, collections

VOL = sys.argv[1] if len(sys.argv) > 1 else "/home/maxi1805/claude-kanban/scratchpad-at3/vol"
MIOS = ("Collapse Hierarchy", "Extract Interface")

anclas = collections.Counter()
anclas_repo = collections.defaultdict(collections.Counter)
emit = collections.defaultdict(collections.Counter)
estados = collections.defaultdict(collections.Counter)
lang = collections.defaultdict(collections.Counter)
otros = collections.Counter()          # hipotesis de los 19 patrones, por patron
embudo = collections.defaultdict(collections.Counter)
repos = []

for f in sorted(glob.glob(os.path.join(VOL, "*.json"))):
    d = json.load(open(f))
    r = d["repo"]; repos.append(r)
    for a in d.get("anclas", []):
        anclas[a["kind"]] += 1
        anclas_repo[r][a["kind"]] += 1
    for h in d.get("hipotesis", []):
        if h["pattern"] in MIOS:
            emit[h["pattern"]][r] += 1
            estados[h["pattern"]][h["state"]] += 1
            if h.get("lang"): lang[h["pattern"]][h["lang"]] += 1
        else:
            otros[h["pattern"]] += 1
    for e in d.get("embudoCH", []):
        embudo["Collapse Hierarchy"][e["diesAt"] or "EMITE"] += 1
    for e in d.get("embudoEI", []):
        embudo["Extract Interface"][e["diesAt"] or "EMITE"] += 1

print(f"REPOS MEDIDOS ({len(repos)}): {', '.join(repos)}\n")
print("POBLACION DE LAS ANCLAS:", dict(anclas), "\n")
for p in MIOS:
    tot = sum(emit[p].values())
    print(f"=== {p}: {tot} propuestas ===")
    print("  por repo:", dict(sorted(emit[p].items(), key=lambda kv: -kv[1])))
    print("  estados :", dict(estados[p]))
    print("  lenguaje:", dict(lang[p]))
    print("  embudo  :", dict(sorted(embudo[p].items(), key=lambda kv: -kv[1])))
    print()
print("HIPOTESIS DE LOS OTROS PATRONES (linea base, tiene que estar completa):")
for k, v in sorted(otros.items(), key=lambda kv: -kv[1]):
    print(f"  {k:32s} {v}")
print(f"  TOTAL no-mias: {sum(otros.values())}  ({len(otros)} patrones presentes)")

# ─── EL CONTRAFACTUAL DE CADA COMPUERTA ────────────────────────────────────
# "Una compuerta puede EMPEORAR el resultado" (Remove Dead Code, Ola AS: 0/27
# CON la compuerta contra 1/30 sin ella). Se publican las dos lecturas.
print("\nCONTRAFACTUAL — cuantas propuestas mas habria SIN cada compuerta (el resto pasa):")
for p, campo in (("Collapse Hierarchy", "embudoCH"), ("Extract Interface", "embudoEI")):
    solo = collections.Counter()
    for f in sorted(glob.glob(os.path.join(VOL, "*.json"))):
        d = json.load(open(f))
        for e in d.get(campo, []):
            fallan = [c["id"] for c in e["checks"] if not c["holds"]]
            if len(fallan) == 1:
                solo[fallan[0]] += 1
    print(f"  {p}: {dict(sorted(solo.items(), key=lambda kv: -kv[1]))}")
