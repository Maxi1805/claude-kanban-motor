#!/usr/bin/env python3
"""Integrador Ola P — el instrumento único de cierre.

Une las tres mediciones que el cierre de una ola necesita y que hasta ahora
estaban en tres scripts distintos (Ola O: `o-integrador-cruce.py` + cuentas a
mano):

  1. VOLUMEN por kind y por (kind, lenguaje), antes vs. después, sobre los
     `<slug>.census.json` de dos directorios (suma de `memberCount` pre-tope).
  2. PRECISIÓN por kind desde las planillas `*.verdicts.csv`, con el MISMO
     criterio de `precision-report.mts`/`gate-logic.ts` (filas `stillPresent`,
     `dudoso` excluido) y su intervalo de Wilson 95 %.
  3. RUIDO = volumen × (1 − precisión), el CONTRAFACTUAL (volumen de hoy ×
     precisión de ayer) y LOS TRES PROMEDIOS (ponderado por volumen, pooled
     por veredictos, simple por kind).

Uso:
  python3 scripts/p-integrador.py \
      --censo-antes DIR --censo-despues DIR \
      --planillas-antes DIR --planillas-despues DIR [--json salida.json]

Los dos directorios de planillas contienen `<slug>.verdicts.csv`. La
precisión "antes" se calcula sobre las planillas TAL COMO ESTABAN antes de
re-muestrear; la de "después", sobre las re-muestreadas. Ésa es la única
manera de separar "mejoró el código" de "medimos distinto".
"""
import argparse, csv, json, math, os, sys, collections

SLUGS = ["click", "cobra", "eslint", "guava", "hugo", "jekyll", "lodash", "nest",
         "newtonsoft-json", "preact", "rubocop", "sqlalchemy", "vueuse"]
# Las 14 planillas: los 13 repos del corpus + el propio analizador. La precisión
# se calcula sobre las 14 (es el criterio que usa `gate.test.ts`); el VOLUMEN,
# sólo sobre los 13 de SHA congelado (`ck-analyzer` no tiene censo golden).
PLANILLAS = SLUGS + ["ck-analyzer"]


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    r = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - r) / d, (c + r) / d)


def cargar_censo(dirpath):
    """-> {slug: census}"""
    out = {}
    for s in SLUGS:
        p = os.path.join(dirpath, f"{s}.census.json")
        if not os.path.exists(p):
            print(f"AVISO: falta {p}", file=sys.stderr)
            continue
        out[s] = json.load(open(p))
    return out


def indexar(census):
    langof = {}
    for k in census["keys"]:
        f, _, tag = k.partition("|")
        if tag.startswith("archivo:"):
            langof[f] = tag[len("archivo:"):]
    kind_total = collections.Counter()
    kind_lang = collections.Counter()
    for k, v in census["keys"].items():
        f, _, tag = k.partition("|")
        if tag.startswith("hallazgo:"):
            kind = tag[len("hallazgo:"):]
            kind_total[kind] += v
            kind_lang[(kind, langof.get(f, "?"))] += v
    return langof, kind_total, kind_lang


def agregar_censo(dirpath):
    cs = cargar_censo(dirpath)
    kt, kl = collections.Counter(), collections.Counter()
    lang_files = collections.Counter()
    metas, archivos = {}, {}
    for s, c in cs.items():
        lo, a, b = indexar(c)
        kt.update(a); kl.update(b)
        for f, l in lo.items():
            lang_files[l] += 1
        metas[s] = c["meta"]
        archivos[s] = {k: v for k, v in c["keys"].items() if "|archivo:" in k}
    return kt, kl, lang_files, metas, archivos, cs


def precision_por_kind(dirpath, slugs=PLANILLAS):
    """-> {kind: (verdaderos, falsos, dudosos)} sobre filas stillPresent."""
    acc = collections.defaultdict(lambda: [0, 0, 0])
    for s in slugs:
        p = os.path.join(dirpath, f"{s}.verdicts.csv")
        if not os.path.exists(p):
            continue
        with open(p, newline="") as fh:
            for row in csv.DictReader(fh):
                if row.get("stillPresent") != "true":
                    continue
                v = (row.get("verdict") or "").strip()
                k = row["kind"]
                if v == "verdadero":
                    acc[k][0] += 1
                elif v == "falso":
                    acc[k][1] += 1
                elif v == "dudoso":
                    acc[k][2] += 1
    return acc


def prec(vf):
    v, f, _ = vf
    n = v + f
    return (None, 0) if n == 0 else (v / n, n)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--censo-antes", required=True)
    ap.add_argument("--censo-despues", required=True)
    ap.add_argument("--planillas-antes", required=True)
    ap.add_argument("--planillas-despues", required=True)
    ap.add_argument("--json")
    a = ap.parse_args()

    ka, kla, lfa, ma, arcA, _ = agregar_censo(a.censo_antes)
    kd, kld, lfd, md, arcD, _ = agregar_censo(a.censo_despues)
    pa = precision_por_kind(a.planillas_antes)
    pd = precision_por_kind(a.planillas_despues)

    print("=== 1. META por repo (scannedFiles / analysedFiles / totalLines) ===")
    for s in SLUGS:
        if s in ma and s in md:
            x, y = ma[s], md[s]
            igual = (x["scannedFiles"] == y["scannedFiles"]
                     and x["analysedFiles"] == y["analysedFiles"]
                     and x["totalLines"] == y["totalLines"])
            print(f"{s:18s} {x['scannedFiles']}/{x['analysedFiles']}/{x['totalLines']}"
                  f"  ->  {y['scannedFiles']}/{y['analysedFiles']}/{y['totalLines']}"
                  f"{'' if igual else '   <<< META CAMBIA'}")

    print("\n=== 2. CLAVES QUE NO SON HALLAZGO (archivo:<lenguaje>) ===")
    dif_total = 0
    for s in SLUGS:
        if s not in arcA or s not in arcD:
            continue
        d = sum(1 for k in set(arcA[s]) | set(arcD[s]) if arcA[s].get(k) != arcD[s].get(k))
        dif_total += d
        if d:
            print(f"{s:18s} {d} clave(s) de archivo con diferencia")
    print(f"TOTAL de claves archivo:<lenguaje> con diferencia: {dif_total}")
    print("\n  archivos por lenguaje:")
    for l in sorted(set(lfa) | set(lfd)):
        print(f"   {l:14s} {lfa[l]:6d} -> {lfd[l]:6d}{'' if lfa[l]==lfd[l] else '   <<< CAMBIA'}")

    # ---- la tabla de ruido ----
    kinds = sorted(set(ka) | set(kd), key=lambda k: -max(ka.get(k, 0), kd.get(k, 0)))
    filas = []
    for k in kinds:
        vA, vD = ka.get(k, 0), kd.get(k, 0)
        prA, nA = prec(pa.get(k, [0, 0, 0]))
        prD, nD = prec(pd.get(k, [0, 0, 0]))
        filas.append(dict(kind=k, volA=vA, volD=vD, nA=nA, precA=prA, nD=nD, precD=prD,
                          vA_=pa.get(k, [0, 0, 0])[0], fA_=pa.get(k, [0, 0, 0])[1],
                          vD_=pd.get(k, [0, 0, 0])[0], fD_=pd.get(k, [0, 0, 0])[1]))

    print("\n=== 3. RUIDO por kind — ruido = volumen × (1 − precisión) ===")
    print(f"{'kind':32s} {'volA':>6s} {'volD':>6s} {'Δvol':>7s} {'nA':>4s} {'precA':>6s} "
          f"{'nD':>4s} {'precD':>6s} {'Wilson95 D':>14s} {'ruidoA':>8s} {'ruidoD':>8s} {'ruidoCF':>8s}")
    rA = rD = rCF = 0.0
    for f in filas:
        if f["precA"] is None and f["precD"] is None:
            continue
        pA = f["precA"] if f["precA"] is not None else f["precD"]
        pD = f["precD"] if f["precD"] is not None else f["precA"]
        nA_ = f["volA"] * (1 - pA)
        nD_ = f["volD"] * (1 - pD)
        nCF = f["volD"] * (1 - pA)
        rA += nA_; rD += nD_; rCF += nCF
        lo, hi = wilson(f["vD_"], f["vD_"] + f["fD_"]) if (f["vD_"] + f["fD_"]) else (0, 1)
        w = f"[{lo*100:.0f},{hi*100:.0f}]" if (f["vD_"] + f["fD_"]) < 15 else ""
        print(f"{f['kind']:32s} {f['volA']:6d} {f['volD']:6d} {f['volD']-f['volA']:+7d} "
              f"{f['nA']:4d} {pA*100:5.0f}% {f['nD']:4d} {pD*100:5.0f}% {w:>14s} "
              f"{nA_:8.0f} {nD_:8.0f} {nCF:8.0f}")
    print(f"{'TOTAL':32s} {sum(ka.values()):6d} {sum(kd.values()):6d} "
          f"{sum(kd.values())-sum(ka.values()):+7d} {'':4s} {'':6s} {'':4s} {'':6s} {'':14s} "
          f"{rA:8.0f} {rD:8.0f} {rCF:8.0f}")

    print("\n=== 4. LOS TRES PROMEDIOS ===")
    # El conjunto COMÚN: kinds con base de los DOS lados. Sin esto, un kind que
    # pierde su base (o que se queda sin volumen) sale del promedio simple de un
    # solo lado y mueve el número sin que ningún detector haya mejorado.
    comun = {k for k in set(ka) | set(kd)
             if prec(pa.get(k, [0, 0, 0]))[0] is not None and prec(pd.get(k, [0, 0, 0]))[0] is not None}
    print(f"  (conjunto COMÚN — kinds con base de los dos lados: {len(comun)})")
    for etiqueta, kv, pmap in (("ANTES", ka, pa), ("DESPUÉS", kd, pd)):
        num2 = den2 = 0.0
        ps2 = []
        V2 = F2 = 0
        for k in comun:
            p, _ = prec(pmap.get(k, [0, 0, 0]))
            num2 += kv.get(k, 0) * p
            den2 += kv.get(k, 0)
            ps2.append(p)
            V2 += pmap.get(k, [0, 0, 0])[0]
            F2 += pmap.get(k, [0, 0, 0])[1]
        print(f"  {etiqueta:8s} COMÚN  ponderado {num2/den2*100:5.1f} %  ·  "
              f"pooled {V2}/{V2+F2} = {V2/(V2+F2)*100:5.1f} %  ·  simple {sum(ps2)/len(ps2)*100:5.1f} %")
    print()
    for etiqueta, kv, pmap in (("ANTES", ka, pa), ("DESPUÉS", kd, pd)):
        # (a) ponderado por volumen
        num = den = 0.0
        # (b) pooled por veredictos
        V = F = 0
        # (c) simple por kind
        ps = []
        for k in set(ka) | set(kd):
            p, n = prec(pmap.get(k, [0, 0, 0]))
            vol = kv.get(k, 0)
            if p is not None:
                num += vol * p; den += vol
                ps.append(p)
            V += pmap.get(k, [0, 0, 0])[0]
            F += pmap.get(k, [0, 0, 0])[1]
        pond = num / den if den else 0
        pooled = V / (V + F) if (V + F) else 0
        simple = sum(ps) / len(ps) if ps else 0
        print(f"{etiqueta:8s}  ponderado por volumen {pond*100:5.1f} %  ·  "
              f"pooled {V}/{V+F} = {pooled*100:5.1f} %  ·  "
              f"simple por kind {simple*100:5.1f} % (sobre {len(ps)} kinds con base)")

    print(f"\n  ruido ANTES {rA:.0f} · ruido DESPUÉS {rD:.0f} "
          f"({(rD-rA)*100.0/rA:+.1f} %) · contrafáctico {rCF:.0f} "
          f"({(rCF-rA)*100.0/rA:+.1f} %) · efecto de RE-MEDIR {rD-rCF:+.0f}")

    print("\n=== 5. CRUCE (kind, lenguaje) — todos los kinds que se movieron ===")
    moved = [k for k in set(ka) | set(kd) if ka.get(k, 0) != kd.get(k, 0)]
    langs = sorted({l for (_, l) in set(kla) | set(kld)})
    for k in sorted(moved, key=lambda k: -ka.get(k, 0)):
        print(f"\n-- {k}: {ka.get(k,0)} -> {kd.get(k,0)}")
        for l in langs:
            x, y = kla.get((k, l), 0), kld.get((k, l), 0)
            if x == 0 and y == 0:
                continue
            surv = "" if x == 0 else f"{y*100.0/x:.0f}%"
            mark = ""
            if x > 0 and y == 0:
                mark = "   <<< CAE A CERO"
            elif x >= 20 and y * 100.0 / x < 10:
                mark = "   <<< <10% supervivencia"
            elif x == 0 and y > 0:
                mark = "   (nuevo)"
            print(f"   {l:12s} {x:7d} -> {y:7d}  surv={surv:>6s}{mark}")

    if a.json:
        json.dump({
            "kind_antes": dict(ka), "kind_despues": dict(kd),
            "kindlang_antes": {f"{k}|{l}": v for (k, l), v in kla.items()},
            "kindlang_despues": {f"{k}|{l}": v for (k, l), v in kld.items()},
            "prec_antes": {k: v for k, v in pa.items()},
            "prec_despues": {k: v for k, v in pd.items()},
            "ruido": {"antes": rA, "despues": rD, "contrafactual": rCF},
        }, open(a.json, "w"), indent=1)
        print(f"\n-> {a.json}")


main()
