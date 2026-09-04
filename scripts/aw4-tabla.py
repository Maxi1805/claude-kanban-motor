#!/usr/bin/env python3
"""AW4 - tablas del censo: PASO 1 (supuesto de modulo) y barrido de umbrales del PASO 3."""
import json, glob, sys, os, collections, math

VOL = sys.argv[1] if len(sys.argv) > 1 else "/home/maxi1805/claude-kanban/scratchpad-aw4/vol"
repos = {}
for p in sorted(glob.glob(os.path.join(VOL, "*.json"))):
    try:
        repos[os.path.basename(p)[:-5]] = json.load(open(p))
    except Exception as e:
        print(f"!! {p}: {e}", file=sys.stderr)

print(f"REPOS VOLCADOS: {len(repos)} -> {', '.join(sorted(repos))}\n")

# ── PASO 1.a: el supuesto de "un archivo = una clase" ─────────────────────
print("=== PASO 1.a - QUE FRACCION DE ARCHIVOS DECLARA EXACTAMENTE UNA ENTIDAD CLASS-LIKE ===")
agg = collections.defaultdict(lambda: collections.Counter())
for r, d in repos.items():
    for lang, c in (d.get("porLenguaje") or {}).items():
        for k, v in c.items():
            agg[lang][k] += v
print(f"{'lenguaje':12s} {'archivos':>8s} {'0 clases':>9s} {'1 clase':>9s} {'2+':>7s} | {'%1':>6s} {'%0':>6s} {'%2+':>6s} | {'func sueltas':>12s} {'solo-func':>10s} {'barriles':>8s}")
tot = collections.Counter()
for lang in sorted(agg, key=lambda l: -agg[l]["archivos"]):
    c = agg[lang]; a = c["archivos"] or 1
    for k, v in c.items(): tot[k] += v
    print(f"{lang:12s} {c['archivos']:8d} {c['c0']:9d} {c['c1']:9d} {c['c2mas']:7d} | {100*c['c1']/a:5.1f}% {100*c['c0']/a:5.1f}% {100*c['c2mas']/a:5.1f}% | {c['conFuncSuelta']:12d} {c['soloFunciones']:10d} {c['barriles']:8d}")
a = tot["archivos"] or 1
print(f"{'TOTAL':12s} {tot['archivos']:8d} {tot['c0']:9d} {tot['c1']:9d} {tot['c2mas']:7d} | {100*tot['c1']/a:5.1f}% {100*tot['c0']/a:5.1f}% {100*tot['c2mas']/a:5.1f}% | {tot['conFuncSuelta']:12d} {tot['soloFunciones']:10d} {tot['barriles']:8d}")

# ── PASO 1.b: rescate de ambiguedad ───────────────────────────────────────
print("\n=== PASO 1.b - LA AMBIGUEDAD QUE LA ATRIBUCION POR MODULO RESCATA ===")
print(f"{'repo':18s} {'amb uso':>9s} {'mismo archivo':>14s} {'%':>7s} {'+misma carpeta':>15s} {'%acum':>7s}")
t = collections.Counter()
for r in sorted(repos):
    am = repos[r].get("ambiguedad") or {}
    n = am.get("totalUso", 0); ma = am.get("mismoArchivo", 0); mc = am.get("mismaCarpetaNoMismoArchivo", 0)
    t["n"] += n; t["ma"] += ma; t["mc"] += mc
    if n: print(f"{r:18s} {n:9d} {ma:14d} {100*ma/n:6.1f}% {mc:15d} {100*(ma+mc)/n:6.1f}%")
if t["n"]: print(f"{'TOTAL':18s} {t['n']:9d} {t['ma']:14d} {100*t['ma']/t['n']:6.1f}% {t['mc']:15d} {100*(t['ma']+t['mc'])/t['n']:6.1f}%")
print("\n-- por lenguaje --")
al = collections.defaultdict(collections.Counter)
for r, d in repos.items():
    for lang, c in ((d.get("ambiguedad") or {}).get("porLenguaje") or {}).items():
        for k, v in c.items(): al[lang][k] += v
for lang in sorted(al, key=lambda l: -al[l]["total"]):
    c = al[lang]; n = c["total"] or 1
    print(f"{lang:12s} amb={c['total']:6d}  mismo archivo={c['mismoArchivo']:6d} ({100*c['mismoArchivo']/n:5.1f}%)  +misma carpeta={c['mismaCarpeta']:5d} ({100*(c['mismoArchivo']+c['mismaCarpeta'])/n:5.1f}%)")

# ── PASO 1.c: cobertura de la via de modulo por lenguaje ─────────────────
print("\n=== PASO 1.c - COBERTURA DE LA VIA DE MODULO (function-like con arista de uso saliente) ===")
cl = collections.defaultdict(collections.Counter)
for r, d in repos.items():
    for lang, c in (d.get("cobertura") or {}).items():
        for k, v in c.items(): cl[lang][k] += v
print(f"{'lenguaje':12s} {'function-like':>13s} {'con salida':>11s} {'%':>7s} {'con ajeno':>10s} {'%':>7s}")
for lang in sorted(cl, key=lambda l: -cl[l]["funcs"]):
    c = cl[lang]; f = c["funcs"] or 1
    print(f"{lang:12s} {c['funcs']:13d} {c['conSalida']:11d} {100*c['conSalida']/f:6.1f}% {c['conAjeno']:10d} {100*c['conAjeno']/f:6.1f}%")

# ── PASO 3: histogramas y barrido ────────────────────────────────────────
print("\n=== PASO 3.a - HISTOGRAMA DE ATFD DOMINANTE (archivo vs carpeta) ===")
ha, hc = collections.Counter(), collections.Counter()
for d in repos.values():
    me = d.get("moduloEnvy") or {}
    for k, v in (me.get("histArchivo") or {}).items(): ha[int(k)] += v
    for k, v in (me.get("histCarpeta") or {}).items(): hc[int(k)] += v
print(f"{'ATFD':>5s} {'por archivo':>12s} {'por carpeta':>12s}")
for k in sorted(set(ha) | set(hc)):
    print(f"{k:5d} {ha[k]:12d} {hc[k]:12d}")

cands = []
for r, d in repos.items():
    for c in ((d.get("moduloEnvy") or {}).get("candidatos") or []):
        c["repo"] = r; cands.append(c)
print(f"\ncandidatos volcados (ATFD>=2 en alguna granularidad): {len(cands)}")

def sweep(gran, atfd_min, laa_max, gates):
    out = []
    for c in cands:
        atfd = c["atfd" + gran]; own = c["own" + gran]; laa = c["laa" + gran]
        if atfd is None or atfd < atfd_min: continue
        if own == 0: continue           # punto N: no medir no es medir cero
        if laa is None or laa >= laa_max: continue
        if "ctor" in gates and c["ctor"]: continue
        if "anon" in gates and c["anon"]: continue
        if "anidada" in gates and c["anidada"]: continue
        if "barril" in gates and (c["domBarril"] or c["propioBarril"]): continue
        if "destino-con-cuerpo" in gates and c["domClasesTop"] == 0 and c["domFuncTop"] == 0: continue
        if "distinta-carpeta" in gates and c["mismaCarpeta"]: continue
        out.append(c)
    return out

print("\n=== PASO 3.b - BARRIDO DE UMBRALES (volumen) ===")
GATES = ["ctor", "anon", "anidada"]
for gran, nom in (("F", "archivo"), ("C", "carpeta")):
    print(f"\n-- granularidad {nom} --")
    print(f"{'ATFD>=':>7s} {'LAA<':>6s} {'n':>7s}  {'reparto por lenguaje'}")
    for atfd in (3, 4, 5, 6):
        for laa in (0.334, 0.25):
            s = sweep(gran, atfd, laa, GATES)
            by = collections.Counter(c["lang"] for c in s)
            print(f"{atfd:7d} {laa:6.2f} {len(s):7d}  {dict(by.most_common(8))}")

print("\n=== PASO 3.c - EFECTO DE CADA COMPUERTA (ATFD>=3, LAA<1/3) ===")
for gran, nom in (("F", "archivo"), ("C", "carpeta")):
    base = sweep(gran, 3, 0.334, [])
    print(f"\n-- {nom}: sin compuertas n={len(base)}")
    for g in ["ctor", "anon", "anidada", "barril", "destino-con-cuerpo", "distinta-carpeta"]:
        s = sweep(gran, 3, 0.334, [g])
        print(f"   +{g:20s} n={len(s):6d}  (quita {len(base)-len(s)})")
    s = sweep(gran, 3, 0.334, ["ctor", "anon", "anidada", "barril", "destino-con-cuerpo"])
    print(f"   TODAS menos distinta-carpeta   n={len(s)}")
    s = sweep(gran, 3, 0.334, ["ctor", "anon", "anidada", "barril", "destino-con-cuerpo", "distinta-carpeta"])
    print(f"   TODAS                          n={len(s)}")

print("\n=== PASO 3.d - CENSO DE MIS ANCLAS EN LA POBLACION VIVA ===")
ck = collections.Counter(); porrepo = collections.defaultdict(collections.Counter)
for r, d in repos.items():
    for k, v in (d.get("censo") or {}).items():
        ck[k] += v; porrepo[k][r] = v
for k in ["coupling-without-abstraction", "fanout-without-cohesion", "layer-skip", "unstable-dependency",
          "god-component", "middle-man", "demeter-chain", "inappropriate-intimacy", "feature-envy-inter",
          "feature-envy-intra", "import-depth-demeter"]:
    print(f"{k:34s} {ck[k]:6d}   {dict(sorted(porrepo[k].items()))}")
print(f"\nTOTAL hallazgos en los repos volcados: {sum(ck.values())}")
