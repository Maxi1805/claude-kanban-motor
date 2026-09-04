#!/usr/bin/env python3
"""SONDA (c) DEL FRENTE Z4 (Ola Z) — SUPERFICIE PÚBLICA PUBLICADA.

LA PREGUNTA, textual del encargo: `speculative-abstraction` necesita "¿esta
unidad es parte de la superficie PÚBLICA PUBLICADA?", distinto de
`looksLikePublicBoundary`, que ya existe y mide "¿otro archivo DE ESTE REPO la
referencia?". La versión genérica es ALCANZABILIDAD EN EL GRAFO DE IMPORTS, sin
configuración:

  * un archivo es PUNTO DE ENTRADA si EXPORTA y NINGÚN archivo del repo lo
    importa;
  * una unidad es SUPERFICIE PÚBLICA si es alcanzable desde uno de ésos por
    cadenas de re-export.

CÓMO SE OPERACIONALIZA, y qué se declara en vez de esconder: el grafo no marca
qué import es un RE-EXPORT, así que "cadena de re-export" se aproxima por
alcanzabilidad en las aristas `imports` archivo→archivo. Se miden las dos
lentes y ninguna sustituye a la otra:

  * `directa` — el archivo lo importa un punto de entrada (UN salto). Es la
    lectura conservadora;
  * `transitiva` — alcanzable desde un punto de entrada por cualquier cadena.
    Es la lectura ancha, y en un repo real satura (lo dice el número, no yo).

Uso: python3 scripts/z4-sonda-c.py /tmp/z4/*.json
"""
import csv
import glob
import json
import math
import os
import sys
from collections import Counter, defaultdict


def wilson(k, n):
    if n == 0:
        return (0.0, 0.0, 0.0)
    z = 1.96
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (100 * p, 100 * max(0.0, c - h), 100 * min(1.0, c + h))


def veredictos():
    out = {}
    for p in glob.glob("tests/golden/precision/*.verdicts.csv"):
        with open(p, newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                if r["kind"] != "speculative-abstraction":
                    continue
                v = (r["verdict"] or "").strip()
                if v:
                    out[r["id"]] = (v, r["slug"], r["file"], r["symbol"], r.get("note", ""))
    return out


def main(paths):
    vers = veredictos()
    filas = []
    cruce = Counter()
    detalle = []
    for p in paths:
        if "sonda" in os.path.basename(p):
            continue
        d = json.load(open(p, encoding="utf-8"))
        slug = d["slug"]
        archivos = [f["p"] for f in d["files"]]
        nodo_por_id = {n["i"]: n for n in d["nodes"]}
        # exporta: ≥1 símbolo con `exported: true`
        exporta = set()
        for n in d["nodes"]:
            if n["k"] == "symbol" and n["x"]:
                exporta.add(n["f"])
        # grafo de imports archivo→archivo
        sale = defaultdict(set)
        entra = defaultdict(set)
        for e in d["edges"]:
            if e["k"] != "imports":
                continue
            a, b = nodo_por_id.get(e["f"]), nodo_por_id.get(e["t"])
            if not a or not b:
                continue
            sale[a["f"]].add(b["f"])
            entra[b["f"]].add(a["f"])
        entradas = {f for f in archivos if f in exporta and not entra.get(f)}
        # directa
        directa = set(entradas)
        for f in entradas:
            directa |= sale.get(f, set())
        # transitiva
        trans = set()
        pila = list(entradas)
        trans |= entradas
        while pila:
            cur = pila.pop()
            for nx in sale.get(cur, ()):
                if nx not in trans:
                    trans.add(nx)
                    pila.append(nx)

        sa = [f for f in d["findings"] if f["k"] == "speculative-abstraction"]
        n_dir = sum(1 for f in sa if f["l"][0]["f"] in directa)
        n_tra = sum(1 for f in sa if f["l"][0]["f"] in trans)
        n_lpb = sum(1 for f in sa if "Confianza reducida:" in f["d"] and "referencian" in f["d"])
        filas.append(
            f"{slug:<18} archivos={len(archivos):>5} exportan={len(exporta):>5} ENTRADAS={len(entradas):>5} "
            f"sup.directa={len(directa):>5} ({100*len(directa)/len(archivos):.0f}%) sup.transitiva={len(trans):>5} "
            f"({100*len(trans)/len(archivos):.0f}%) | spec-abs={len(sa):>4} enDirecta={n_dir:>4} enTransitiva={n_tra:>4} looksLikePublic={n_lpb:>4}"
        )
        for f in sa:
            v = vers.get(f["id"])
            if not v:
                continue
            cruce[(v[0], f["l"][0]["f"] in directa, f["l"][0]["f"] in trans)] += 1
            detalle.append((slug, v[0], f["l"][0]["f"], f["l"][0]["y"], f["l"][0]["f"] in directa, f["l"][0]["f"] in trans, f["t"]))

    print("=== SONDA (c) — SUPERFICIE PÚBLICA POR ALCANZABILIDAD DESDE LOS PUNTOS DE ENTRADA ===")
    for f in filas:
        print(f)
    print()
    print("=== cruce con los VEREDICTOS ya cargados de `speculative-abstraction` ===")
    print("veredicto      enSupDirecta  enSupTransitiva   n")
    for (v, dr, tr), n in sorted(cruce.items()):
        print(f"{v:<14} {str(dr):>12} {str(tr):>16} {n:>4}")
    fal = sum(n for (v, dr, tr), n in cruce.items() if v == "falso")
    fal_dir = sum(n for (v, dr, tr), n in cruce.items() if v == "falso" and dr)
    fal_tra = sum(n for (v, dr, tr), n in cruce.items() if v == "falso" and tr)
    ver = sum(n for (v, dr, tr), n in cruce.items() if v == "verdadero")
    ver_dir = sum(n for (v, dr, tr), n in cruce.items() if v == "verdadero" and dr)
    ver_tra = sum(n for (v, dr, tr), n in cruce.items() if v == "verdadero" and tr)
    if fal:
        pt, lo, hi = wilson(fal_dir, fal)
        print(f"\nFALSOS vivos y juzgados: {fal}. Explicados por sup. DIRECTA: {fal_dir} ({pt:.1f}% [{lo:.1f}, {hi:.1f}]). Por sup. TRANSITIVA: {fal_tra} ({100*fal_tra/fal:.1f}%).")
    if ver:
        print(f"VERDADEROS vivos y juzgados: {ver}. En sup. DIRECTA: {ver_dir}. En sup. TRANSITIVA: {ver_tra}.  ← lo que la compuerta MATARÍA")
    print("\n=== detalle (repo, veredicto, archivo del contrato, símbolo, directa, transitiva) ===")
    for r in detalle:
        print("  " + " | ".join(str(x) for x in r))


if __name__ == "__main__":
    main(sys.argv[1:])
