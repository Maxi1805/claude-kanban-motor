#!/usr/bin/env python3
"""OLA AU / AU2 — agrega los volcados de `scratchpad-au2/vol/` en las tablas del informe.

Uso: python3 scripts/au2-tabla.py [dir-vol]
"""
import json, sys, glob, os, collections, math

VOL = sys.argv[1] if len(sys.argv) > 1 else "/home/maxi1805/claude-kanban/scratchpad-au2/vol"
MIOS = {"Extract Duplicated Method", "Pull Up Duplicated Member"}

def dedup(traza):
    """`build()` corre mas de una vez por `Finding` (attachHypotheses +
    rebuildHypothesesWithGraph + refresh), asi que la traza trae la misma ancla
    varias veces. Se queda la evaluacion MAS COMPLETA: la que emitio, si hubo."""
    por_id = {}
    for t in traza:
        prev = por_id.get(t["findingId"])
        if prev is None or (t["emitted"] and not prev["emitted"]):
            por_id[t["findingId"]] = t
    return list(por_id.values())


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    m = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (100 * p, 100 * max(0.0, c - m), 100 * min(1.0, c + m))

repos = []
for f in sorted(glob.glob(os.path.join(VOL, "*.json"))):
    try:
        repos.append(json.load(open(f)))
    except Exception as e:
        print(f"!! {f}: {e}", file=sys.stderr)

print(f"== {len(repos)} repos leidos ==\n")

print("| repo | duplication | distributed-duplication | EDM | PUD | ms |")
print("|---|---:|---:|---:|---:|---:|")
tot = collections.Counter()
for d in repos:
    c = d["censo"]
    mias = collections.Counter(h["pattern"] for h in d["hipotesis"] if h["pattern"] in MIOS)
    print(f"| {d['repo']} | {c.get('duplication',0)} | {c.get('distributed-duplication',0)} | "
          f"{mias['Extract Duplicated Method']} | {mias['Pull Up Duplicated Member']} | {d['wallMs']} |")
    tot["dup"] += c.get("duplication", 0)
    tot["dist"] += c.get("distributed-duplication", 0)
    tot["edm"] += mias["Extract Duplicated Method"]
    tot["pud"] += mias["Pull Up Duplicated Member"]
print(f"| **TOTAL** | **{tot['dup']}** | **{tot['dist']}** | **{tot['edm']}** | **{tot['pud']}** | |")

print("\n== EMBUDO Extract Duplicated Method (donde muere cada candidato) ==")
c = collections.Counter()
for d in repos:
    for t in dedup(d["trazaEdm"]):
        c[t["diesAt"] or "(emitida)"] += 1
n = sum(c.values())
for k, v in c.most_common():
    print(f"  {k:42s} {v:6d}  {100*v/max(1,n):5.1f} %")
print(f"  {'TOTAL candidatos':42s} {n:6d}")

print("\n== EMBUDO Pull Up Duplicated Member ==")
c = collections.Counter()
for d in repos:
    for t in dedup(d["trazaPud"]):
        c[t["diesAt"] or "(emitida)"] += 1
n = sum(c.values())
for k, v in c.most_common():
    print(f"  {k:42s} {v:6d}  {100*v/max(1,n):5.1f} %")
print(f"  {'TOTAL candidatos':42s} {n:6d}")

print("\n== LENGUAJE de las emitidas ==")
for pat in sorted(MIOS):
    c = collections.Counter()
    for d in repos:
        traza = dedup(d["trazaEdm"]) if pat.startswith("Extract") else dedup(d["trazaPud"])
        for t in traza:
            if t["emitted"]:
                c[t["language"] or "(?)"] += 1
    print(f"  {pat}: {dict(c)}")

print("\n== 19 PATRONES: censo de estados por patron (linea base) ==")
est = collections.Counter()
for d in repos:
    for h in d["hipotesis"]:
        if h["pattern"] in MIOS:
            continue
        est[(h["pattern"], h["state"])] += 1
pats = sorted({p for p, _ in est})
print("| patron | ausente | parcial | ya-aplicado | aplicado-eludido |")
print("|---|---:|---:|---:|---:|")
for p in pats:
    print(f"| {p} | {est[(p,'ausente')]} | {est[(p,'parcial')]} | {est[(p,'ya-aplicado')]} | {est[(p,'aplicado-eludido')]} |")

print("\n== ESTADOS de las mias (debe ser SOLO `ausente`) ==")
mest = collections.Counter()
for d in repos:
    for h in d["hipotesis"]:
        if h["pattern"] in MIOS:
            mest[(h["pattern"], h["state"])] += 1
for k, v in sorted(mest.items()):
    print(f"  {k}: {v}")

print("\n== EMITIDAS, una por linea (para juzgar abriendo el archivo) ==")
for d in repos:
    for h in d["hipotesis"]:
        if h["pattern"] not in MIOS:
            continue
        pl = h.get("places", [])
        loc = " | ".join(f"{p['file']}:{p['startLine']}-{p['endLine']}({p.get('symbol','')})" for p in pl[:4])
        print(f"[{d['repo']}] {h['pattern']} :: {loc}")

# ─────────────────────────────────────────────────────────────────────────────
# CONTRAFACTUALES POR COMPUERTA. La traza evalua TODOS los `required`, no sólo
# hasta el primero que falla, asi que se puede contar exactamente cuantos
# candidatos emitiria la familia si se apagara UNA compuerta y se dejaran las
# demas. Es el brazo "sin compuerta" que el encargo pide medir, sin correr nada
# de nuevo y sin tocar una linea del codigo.
# ─────────────────────────────────────────────────────────────────────────────
print("\n== CONTRAFACTUAL: cuantas emitiria si se apagara UNA compuerta (las demas intactas) ==")
for nombre, campo in (("Extract Duplicated Method", "trazaEdm"), ("Pull Up Duplicated Member", "trazaPud")):
    filas = [t for d in repos for t in dedup(d[campo])]
    if not filas:
        continue
    ids = sorted({c["id"] for t in filas for c in t["checks"]})
    print(f"  {nombre}  (candidatos: {len(filas)})")
    base = sum(1 for t in filas if all(c["holds"] for c in t["checks"]))
    print(f"    {'(con todas las compuertas)':46s} {base:6d}")
    for cid in ids:
        n2 = sum(1 for t in filas if all(c["holds"] for c in t["checks"] if c["id"] != cid))
        print(f"    apagando {cid:37s} {n2:6d}   (+{n2 - base})")

print("\n== POR QUE NO SON EQUIVALENTES (Extract Duplicated Method) ==")
c = collections.Counter()
for d in repos:
    for t in dedup(d["trazaEdm"]):
        r = t.get("razon", "")
        if not r:
            continue
        if "LLAMADA o de MIEMBRO" in r:
            k = "difieren en QUE se llama / QUE campo se toca (no es un parametro)"
        elif "ESTRUCTURAL" in r:
            k = "distinta cantidad de tokens: diferencia ESTRUCTURAL"
        elif "no es un identificador" in r:
            k = "difieren en un operador o simbolo (no sustituible)"
        elif "no es consistente" in r or "biyeccion" in r or "biyección" in r:
            k = "la sustitucion no es consistente / no es biyeccion"
        elif "parametros" in r or "parámetros" in r:
            k = "harian falta mas de 2 parametros"
        elif "reconstru" in r:
            k = "no se reconstruyo el grupo de clones"
        else:
            k = r[:60]
        c[k] += 1
n = sum(c.values())
for k, v in c.most_common():
    print(f"  {k:66s} {v:6d}  {100*v/max(1,n):5.1f} %")

print("\n== TIPO DE NODO del clon reportado (Extract Duplicated Method) ==")
c = collections.Counter()
for d in repos:
    for t in dedup(d["trazaEdm"]):
        if t.get("tipoNodo"):
            c[t["tipoNodo"]] += 1
for k, v in c.most_common(15):
    print(f"  {k:40s} {v:6d}")

print("\n== CUANTOS CANDIDATOS PASA CADA COMPUERTA POR SEPARADO ==")
for nombre, campo in (("Extract Duplicated Method", "trazaEdm"), ("Pull Up Duplicated Member", "trazaPud")):
    filas = [t for d in repos for t in dedup(d[campo])]
    if not filas:
        continue
    ids = [c["id"] for c in filas[0]["checks"]]
    print(f"  {nombre}  (candidatos: {len(filas)})")
    for cid in ids:
        k = sum(1 for t in filas if any(c["id"] == cid and c["holds"] for c in t["checks"]))
        print(f"    {cid:46s} {k:6d}  {100*k/len(filas):5.1f} %")
