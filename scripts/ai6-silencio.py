#!/usr/bin/env python3
"""OLA AI, FRENTE AI6 — (1) el techo de nivel 1 de cada ancla de mi grupo, con
la definición EXACTA del instrumento oficial (`judged = verdadero + falso`,
`dudoso` fuera; sólo filas `stillPresent=true`), y (2) el SILENCIO: cuántos
problemas REALES (veredicto `verdadero`, fila viva) no reciben hoy NINGUNA
hipótesis de NINGÚN patrón.

Poblaciones separadas y desglose por repo. Wilson 95 % junto a toda precisión.
"""
import csv, json, math, os, sys, collections

LIB = ["click","cobra","eslint","guava","hugo","jekyll","lodash","nest","newtonsoft-json","preact","rubocop","sqlalchemy","vueuse"]
APP = ["Ghost","ShareX","chatwoot","excalidraw","gitea","jenkins","netbox","redmine"]
ANCLAS = ["long-parameter-list","data-clump","optional-construction-combinations","conditional-chain",
          "repeated-switch","homonymous-divergent-construction","parallel-hierarchies","hardwired-subtype-combination",
          "duplication","distributed-duplication","invariant-scaffold-varying-call","self-referential-member",
          "recursive-collection-descent","exposed-container-traversal"]
P = "tests/golden/precision"
D13, DAPP = "scratchpad-int-ah/dumps13", "scratchpad-int-ah/dumpsapp"

def wilson(k, n, z=1.96):
    if n == 0: return (0.0, 0.0)
    p = k / n
    d = 1 + z*z/n
    c = (p + z*z/(2*n)) / d
    h = z*math.sqrt(p*(1-p)/n + z*z/(4*n*n)) / d
    return (100*max(0.0, c-h), 100*min(1.0, c+h))

def verdicts(repo):
    fn = f"{P}/{repo}.verdicts.csv"
    if not os.path.exists(fn): return []
    with open(fn, newline="") as f:
        return [r for r in csv.DictReader(f)]

def dump(repo, base):
    fn = f"{base}/{repo}.json"
    if not os.path.exists(fn): return None
    return json.load(open(fn))

for pop, repos, base in (("BIBLIOTECAS (13)", LIB, D13), ("APLICACIONES (8)", APP, DAPP)):
    print("="*104); print(pop); print("="*104)
    techo = collections.defaultdict(lambda: [0,0])           # ancla -> [V, judged]
    porRepo = collections.defaultdict(lambda: collections.defaultdict(lambda: [0,0]))
    sil = collections.defaultdict(lambda: [0,0,0,0])         # ancla -> [Vvivos, sinHip, soloYaAplicado, conRec]
    silRepo = collections.defaultdict(lambda: collections.defaultdict(int))
    faltan = []
    for r in repos:
        d = dump(r, base)
        if d is None: faltan.append(r); continue
        hip = {f["id"]: f.get("hypotheses", []) for f in d["findings"]}
        for row in verdicts(r):
            if row.get("stillPresent","").lower() != "true": continue
            k, v = row["kind"], (row.get("verdict") or "").strip()
            if k not in ANCLAS: continue
            if v in ("verdadero","falso"):
                techo[k][1] += 1; porRepo[k][r][1] += 1
                if v == "verdadero":
                    techo[k][0] += 1; porRepo[k][r][0] += 1
            if v != "verdadero": continue
            hs = hip.get(row["id"])
            if hs is None: continue                # id no vivo en el volcado
            sil[k][0] += 1
            estados = {h["state"] for h in hs}
            if not hs: sil[k][1] += 1; silRepo[k][r] += 1
            elif estados <= {"ya-aplicado","aplicado-eludido"}: sil[k][2] += 1
            else: sil[k][3] += 1
    print(f"  sin volcado: {faltan if faltan else 'ninguno'}")
    print("\n-- TECHO DE NIVEL 1 POR ANCLA (judged = verdadero+falso, filas vivas)")
    for a in ANCLAS:
        V, n = techo[a]
        if n == 0: print(f"   {a:38s}  SIN MEDIR (0 juzgados)"); continue
        lo, hi = wilson(V, n)
        det = " · ".join(f"{r} {porRepo[a][r][0]}/{porRepo[a][r][1]}" for r in sorted(porRepo[a]))
        print(f"   {a:38s}  {V:3d}/{n:3d} = {100*V/n:5.1f} %  [{lo:4.1f}, {hi:4.1f}]   {det}")
    print("\n-- SILENCIO: problemas REALES (verdadero, vivos) sin ninguna hipótesis")
    tot = [0,0,0,0]
    for a in ANCLAS:
        s = sil[a]
        if s[0] == 0: continue
        for i in range(4): tot[i] += s[i]
        det = " · ".join(f"{r} {silRepo[a][r]}" for r in sorted(silRepo[a]) if silRepo[a][r])
        print(f"   {a:38s}  V vivos {s[0]:3d} | sin hipótesis {s[1]:3d} | sólo ya-aplicado {s[2]:2d} | con rec {s[3]:3d}   [{det}]")
    print(f"   {'TOTAL':38s}  V vivos {tot[0]:3d} | sin hipótesis {tot[1]:3d} | sólo ya-aplicado {tot[2]:2d} | con rec {tot[3]:3d}")
