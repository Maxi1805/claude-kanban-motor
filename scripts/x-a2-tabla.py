#!/usr/bin/env python3
"""OLA X — FRENTE A2. Agrega los volcados de `x-a2-embudo.mts` en LA TABLA POR PATRON.

Uso: python3 scripts/x-a2-tabla.py <embudo1.json> [<embudo2.json> ...]

No vuelve a correr nada: sólo suma los embudos ya medidos y los cruza contra
`tests/golden/precision/*.verdicts.csv` por `id` (`stableFindingId`), que es la
MISMA llave que usa `scripts/w-cobertura-nivel2.mts`.
"""
import csv
import json
import os
import sys
from collections import defaultdict

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERD = os.path.join(RAIZ, "tests/golden/precision")


def wilson(k, n):
    if n == 0:
        return (0.0, 0.0, 0.0)
    z = 1.96
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    s = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5)
    return (p, (c - s) / d, (c + s) / d)


def cargar_verdaderos():
    vs = {}
    for nombre in os.listdir(VERD):
        if not nombre.endswith(".verdicts.csv"):
            continue
        with open(os.path.join(VERD, nombre), newline="", encoding="utf-8") as fh:
            for fila in csv.DictReader(fh):
                if (fila.get("verdict") or "").strip() == "verdadero":
                    vs[fila["id"]] = fila.get("kind", "")
    return vs


def sumar(dest, src):
    for k, v in src.items():
        if isinstance(v, dict):
            sumar(dest.setdefault(k, {}), v)
        else:
            dest[k] = dest.get(k, 0) + v


def main(paths):
    verdaderos = cargar_verdaderos()
    embudo = {}
    ancla = {}
    kinds_totales = defaultdict(int)
    hallazgos = {}
    repos = []
    for p in paths:
        d = json.load(open(p, encoding="utf-8"))
        repos.append((d["repo"], d["wallMs"], d["totalHallazgos"], d["llamadasCrudas"]))
        # nota: `d["totalPorKind"]` es la población PUBLICADA (después de los
        # topes y del agrupado). La población que de verdad entra al embudo es
        # la de `porHallazgo` — los `Finding` que existían cuando corrió
        # `attachHypotheses`, antes de esos topes.
        for pat, b in d["embudo"].items():
            sumar(embudo.setdefault(pat, {}), b)
        for pat, a in d["anclaPorPatron"].items():
            e = ancla.setdefault(pat, {"kinds": a["kinds"], "hallazgosDelAncla": 0})
            e["hallazgosDelAncla"] += a["hallazgosDelAncla"]
        for k, n in d["totalPorKind"].items():
            kinds_totales[k] += n
        hallazgos.update(d["porHallazgo"])

    # Población REAL del ancla: los hallazgos que existían al correr las
    # hipótesis, no los que sobreviven a los topes y llegan al volcado.
    #
    # NO se cuenta sobre `porHallazgo` (que está indexado por `stableFindingId`
    # y por lo tanto COLAPSA hallazgos distintos que comparten id — medido:
    # 13 % en hugo, 18 % en sqlalchemy). Se cuenta sobre `embudo[*].porKind`,
    # que es el conteo exacto de candidatos que entraron: todo hallazgo de un
    # kind anclado recibe `build()` de todos los patrones que lo declaran, así
    # que el máximo entre patrones es el total de hallazgos de ese kind.
    precap = defaultdict(int)
    for b in embudo.values():
        for k, n in b.get("porKind", {}).items():
            precap[k] = max(precap[k], n)
    for pat, a in ancla.items():
        a["precap"] = sum(precap[k] for k in a["kinds"])

    print("REPOS MEDIDOS")
    for r, ms, n, llam in repos:
        print(f"  {r:<34} {ms/1000:8.1f} s · {n:6d} hallazgos · {llam:7d} llamadas a build()")
    print()

    print("=" * 118)
    print(f"{'patrón':<26}{'ancla':>8}{'entran':>8}{'pre-mot':>8}{'cap':>5}{'req':>7}{'pasan':>7}{'aus':>6}{'parc':>6}{'ya-ap':>7}{'elud':>6}{'recs':>6}{'selec':>7}")
    print("=" * 118)
    filas = sorted(embudo.items(), key=lambda kv: -kv[1].get("entran", 0))
    for pat, b in filas:
        est = b.get("estados", {})
        aus, parc = est.get("ausente", 0), est.get("parcial", 0)
        ya, el = est.get("ya-aplicado", 0), est.get("aplicado-eludido", 0)
        recs = aus + parc
        muertes = b.get("muerePorCompuerta", {})
        cap = sum(n for g, n in muertes.items() if g.startswith("0-"))
        req = sum(n for g, n in muertes.items() if g.startswith("1-"))
        pobl = ancla.get(pat, {}).get("precap", 0)
        sel = f"{100*recs/pobl:.0f}%" if pobl else "—"
        print(f"{pat:<26}{pobl:>8}{b.get('entran',0):>8}{b.get('preMotor',0):>8}{cap:>5}{req:>7}{b.get('pasan',0):>7}{aus:>6}{parc:>6}{ya:>7}{el:>6}{recs:>6}{sel:>7}")
    print("=" * 118)
    print("ancla = hallazgos de los kinds que el patrón declara · entran = (hallazgo, patrón) evaluados")
    print("pre-mot = el builder devolvió null SIN llegar a engine.build · cap/req = muertos en el motor")
    print("selec = recomendaciones / hallazgos del ancla (>50 % ⇒ el patrón reformula el smell)")
    print()

    print("DÓNDE MUERE CADA UNO — compuerta por compuerta (top 8 por patrón)")
    for pat, b in filas:
        entran = b.get("entran", 0)
        if entran == 0:
            continue
        print(f"\n  {pat}  ({entran} candidatos; anclas {','.join(ancla.get(pat,{}).get('kinds',[]))})")
        if b.get("preMotor"):
            det = sorted(b.get("preMotorPorKind", {}).items(), key=lambda kv: -kv[1])
            print(f"    {'(pre-motor: el builder ni llama al motor)':<58} {b['preMotor']:>6}  [{', '.join(f'{k} {n}' for k,n in det[:4])}]")
        for g, n in sorted(b.get("muerePorCompuerta", {}).items(), key=lambda kv: -kv[1])[:8]:
            print(f"    {g:<58} {n:>6}")
        if b.get("pasan"):
            print(f"    {'>>> PASAN TODAS LAS required':<58} {b['pasan']:>6}  {json.dumps(b.get('estados',{}), ensure_ascii=False)}")

    print("\n\nHIPÓTESIS POR ESTADO Y POR LENGUAJE (sólo las que pasan)")
    for pat, b in filas:
        pl = b.get("estadosPorLenguaje", {})
        if not pl:
            continue
        print(f"  {pat}")
        for lang, est in sorted(pl.items(), key=lambda kv: -sum(kv[1].values())):
            print(f"    {lang:<14} {json.dumps(est, ensure_ascii=False)}")

    # ── EL EMBUDO POR (patrón, ANCLA) ────────────────────────────────────────
    # Un patrón con varias anclas tiene un `required` que se comporta distinto
    # en cada una (Decorator saltea `acumulador-tres-capas` cuando el ancla es
    # estructural o de delegación). El total por patrón esconde eso.
    print("\n\nEL EMBUDO POR (patrón, ancla) — sólo patrones con más de un ancla poblada")
    pa = defaultdict(lambda: defaultdict(int))
    pan = defaultdict(int)
    for h in hallazgos.values():
        for pat, res in h["patrones"].items():
            pa[(pat, h["kind"])][res] += 1
            pan[(pat, h["kind"])] += 1
    vistos = defaultdict(set)
    for (pat, kind) in pa:
        vistos[pat].add(kind)
    for pat in sorted(vistos, key=lambda p: -sum(pan[(p, k)] for k in vistos[p])):
        if len(vistos[pat]) < 2:
            continue
        print(f"\n  {pat}")
        for kind in sorted(vistos[pat], key=lambda k: -pan[(pat, k)]):
            det = sorted(pa[(pat, kind)].items(), key=lambda kv: -kv[1])
            recs = sum(n for r, n in det if r in ("pasa:ausente", "pasa:parcial"))
            print(f"    {kind:<28} n={pan[(pat,kind)]:<5} recs={recs:<4} " + " · ".join(f"{r} {n}" for r, n in det[:4]))

    # ── EL CRUCE POR (kind, lenguaje) ────────────────────────────────────────
    # La regla de la ola: mirar las CELDAS, no los totales. Acá la celda es
    # (ancla, lenguaje) y lo que se mide es cuántos de sus candidatos salen
    # RECOMENDACIÓN (`ausente`/`parcial`) y dónde mueren los demás.
    print("\n\nEL CRUCE (kind, lenguaje) — candidatos, recomendaciones y la compuerta que más mata")
    celda = defaultdict(lambda: {"n": 0, "rec": 0, "ya": 0, "pre": 0, "gates": defaultdict(int)})
    for h in hallazgos.values():
        for pat, res in h["patrones"].items():
            c = celda[(h["kind"], h["lang"] or "?")]
            c["n"] += 1
            if res.startswith("pasa:"):
                if res.split(":")[1] in ("ausente", "parcial"):
                    c["rec"] += 1
                else:
                    c["ya"] += 1
            elif res == "pre-motor":
                c["pre"] += 1
                c["gates"]["(pre-motor)"] += 1
            else:
                c["gates"][res.split(":", 1)[1]] += 1
    print(f"  {'kind':<28}{'lang':<10}{'cand':>6}{'rec':>6}{'ya/el':>7}{'pre':>5}  compuerta que más mata")
    for (kind, lang), c in sorted(celda.items(), key=lambda kv: -kv[1]["n"]):
        top = max(c["gates"].items(), key=lambda kv: kv[1]) if c["gates"] else ("—", 0)
        print(f"  {kind:<28}{lang:<10}{c['n']:>6}{c['rec']:>6}{c['ya']:>7}{c['pre']:>5}  {top[0]} ({top[1]})")

    # ── LOS VERDADEROS DEL NIVEL 1: ¿en qué compuerta mueren? ────────────────
    print("\n\nLOS PROBLEMAS REALES (verdict=verdadero) QUE ENTRAN A ALGÚN EMBUDO")
    vivos = {i: v for i, v in hallazgos.items() if i in verdaderos}
    print(f"  verdaderos del nivel 1 presentes en estos repos y anclados: {len(vivos)}")
    por_destino = defaultdict(int)
    con_rec = 0
    for i, h in vivos.items():
        tiene = False
        for pat, res in h["patrones"].items():
            por_destino[f"{pat} → {res}"] += 1
            if res.startswith("pasa:") and res.split(":")[1] in ("ausente", "parcial"):
                tiene = True
        if tiene:
            con_rec += 1
    p, lo, hi = wilson(con_rec, len(vivos)) if vivos else (0, 0, 0)
    print(f"  con al menos una RECOMENDACIÓN (ausente/parcial): {con_rec}/{len(vivos)} = {100*p:.1f} % [Wilson {100*lo:.0f} %, {100*hi:.0f} %]")
    print("  desglose (patrón → destino), top 25:")
    for k, n in sorted(por_destino.items(), key=lambda kv: -kv[1])[:25]:
        print(f"    {k:<74} {n:>4}")

    # ── LA PREGUNTA DE LA OLA: los verdaderos SIN NINGUNA propuesta ──────────
    print("\n  LOS VERDADEROS SIN NINGUNA PROPUESTA — por kind, y dónde mueren")
    porkind, sinprop, gate = defaultdict(int), defaultdict(int), defaultdict(int)
    for i, h in vivos.items():
        porkind[h["kind"]] += 1
        rec = any(r.startswith("pasa:") and r.split(":")[1] in ("ausente", "parcial") for r in h["patrones"].values())
        if not rec:
            sinprop[h["kind"]] += 1
            for pat, r in h["patrones"].items():
                gate[(h["kind"], r)] += 1
    print(f"    {'kind':<26}{'verdaderos':>11}{'sin propuesta':>15}")
    for k, n in sorted(porkind.items(), key=lambda kv: -kv[1]):
        print(f"    {k:<26}{n:>11}{sinprop[k]:>15}")
    print(f"    {'TOTAL':<26}{sum(porkind.values()):>11}{sum(sinprop.values()):>15}")
    print("\n    destinos de los verdaderos SIN propuesta (kind, destino), top 24:")
    for (k, r), n in sorted(gate.items(), key=lambda kv: -kv[1])[:24]:
        print(f"      {k:<26}{r:<62}{n:>4}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(64)
    main(sys.argv[1:])
