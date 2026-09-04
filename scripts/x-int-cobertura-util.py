#!/usr/bin/env python3
"""
LA COBERTURA ÚTIL — la métrica de cabecera desde la Ola X.

    > De los problemas REALES del nivel 1 (veredicto `verdadero`, vivos en el
    > volcado de hoy), ¿en cuántos hay una recomendación (`ausente`/`parcial`)
    > que un humano JUZGÓ `verdadero`?

POR QUÉ ES UN SCRIPT APARTE Y NO UN CAMBIO EN `w-cobertura-nivel2.mts`. Ese
instrumento es fijo por contrato ("una métrica de cabecera que se recalcula con
un script distinto cada ola no es comparable entre olas") y ya emite, con
`--json`, el detalle fila por fila que hace falta: qué verdaderos están vivos y
qué hipótesis cuelga de cada uno. Lo único que le falta es el VEREDICTO de nivel
2, que vive en otros archivos. Así que este script no re-mide la cobertura: la
LEE, y le pega encima los veredictos de nivel 2.

LAS TRES FUENTES DE VEREDICTO DE NIVEL 2, y por qué las tres:

 1. `tests/golden/precision/<slug>.hypotheses.csv` — las planillas históricas.
    Su `id` es `u-m0::<Patrón>::<slug>::<archivo>:<línea>`, de antes de que las
    hipótesis tuvieran id propio, así que el cruce es por
    (slug, patrón, archivo:línea) contra las ubicaciones del hallazgo.
 2. `claude-kanban-docs/ola-*/veredictos/*.json` — los veredictos que cada
    integrador juzga al cerrar. Clave: `<idDelHallazgo>::<Patrón>`, que es el
    cruce EXACTO (el mismo `stableFindingId` que usa la métrica).
 3. Los dos anteriores juntos: un mismo (hallazgo, patrón) juzgado en las dos
    fuentes se resuelve con el veredicto MÁS NUEVO (los JSON de integrador
    ganan), porque son juicios hechos sobre la población de hoy.

USO:
    npx tsx scripts/w-cobertura-nivel2.mts <dumps> --json /tmp/cobertura.json
    python3 scripts/x-int-cobertura-util.py /tmp/cobertura.json
"""
import csv
import json
import math
import os
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DOCS = RAIZ.parent / "claude-kanban-docs"
RECOMENDACION = {"ausente", "parcial"}


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    r = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - r) / d, (c + r) / d)


def intervalo(k, n):
    if n == 0:
        return "—"
    lo, hi = wilson(k, n)
    return f"{100*k/n:.1f} % [{100*lo:.1f} %, {100*hi:.1f} %]"


def cargar_veredictos():
    """(clave -> veredicto). Dos formas de clave: exacta por id y laxa por ubicación."""
    por_id = {}       # f"{findingId}::{patron}" -> veredicto
    por_lugar = {}    # f"{slug}::{patron}::{archivo}:{linea}" -> veredicto

    planillas = sorted((RAIZ / "tests/golden/precision").glob("*.hypotheses.csv"))
    for p in planillas:
        with p.open(newline="", encoding="utf8") as fh:
            for row in csv.DictReader(fh):
                v = (row.get("verdict") or "").strip()
                if not v:
                    continue
                slug = (row.get("slug") or "").strip()
                patron = (row.get("pattern") or "").strip()
                archivo = (row.get("file") or "").strip()
                linea = (row.get("startLine") or "").strip()
                if slug and patron and archivo:
                    por_lugar[f"{slug}::{patron}::{archivo}:{linea}"] = v

    for veredictos in sorted(DOCS.glob("ola-*/veredictos/*.json")):
        data = json.loads(veredictos.read_text(encoding="utf8"))
        for clave, val in data.items():
            # Sólo veredictos de NIVEL 2: la clave es `<idDelHallazgo>::<Patrón>`.
            # Los mismos directorios guardan también veredictos de nivel 1
            # (clave = el id del hallazgo a secas), que no son de esta métrica.
            if "::" not in clave:
                continue
            v = (val.get("verdict") or "").strip() if isinstance(val, dict) else str(val).strip()
            if not v:
                continue
            por_id[clave] = v
            # OLA AU, GUARDIÁN — la clave DIRIGIDA `<id>@<dir>::<Patrón>` que la Ola AJ
            # introdujo (AJ2) para nombrar UNA de las N propuestas del mismo patrón que
            # una fila agrupada puede colgar. `v-int-precision-nivel2.mts` la lee desde
            # entonces; este script no la leía y perdía esos juicios en silencio contra
            # el detalle de nivel 1 (que indexa por `id` a secas, sin dirección). El
            # `setdefault` es la mitad segura: sólo RELLENA cuando el hallazgo entero
            # todavía no tiene veredicto por la clave bare — nunca pisa uno que ya
            # estaba ahí (que sería mezclar el juicio de UNA propuesta dirigida con el
            # de otra del mismo id). Medido por AU1 antes de aterrizarlo (sonda propia,
            # `scratchpad-au1/sonda-cobertura-util.py`): +8 hallazgos (199→207 sobre 684)
            # y la deuda de juicio baja de 21 a 13. Ver `ola-au/informes/AU1.md` §8 y
            # `ola-au/informes/guardian.md`.
            if "@" in clave.split("::")[0]:
                izq, pat = clave[: clave.rfind("::")], clave[clave.rfind("::") + 2 :]
                por_id.setdefault(f'{izq.split("@")[0]}::{pat}', v)
    return por_id, por_lugar


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    detalle = json.loads(Path(sys.argv[1]).read_text(encoding="utf8"))
    por_id, por_lugar = cargar_veredictos()

    vivos = [f for f in detalle["detalle"] if f["vivo"]]
    con_rec = [f for f in vivos if any(h["state"] in RECOMENDACION for h in f["hipotesis"])]

    utiles, juzgados_no_verdaderos, sin_juzgar = [], [], []
    for f in con_rec:
        veredictos = []
        for h in f["hipotesis"]:
            if h["state"] not in RECOMENDACION:
                continue
            v = por_id.get(f"{f['id']}::{h['pattern']}")
            if v is None:
                v = por_lugar.get(f"{f['slug']}::{h['pattern']}::{f['file']}:{f['line']}")
            if v is not None:
                veredictos.append((h["pattern"], v))
        f = {**f, "veredictosNivel2": veredictos}
        if any(v == "verdadero" for _, v in veredictos):
            utiles.append(f)
        elif veredictos:
            juzgados_no_verdaderos.append(f)
        else:
            sin_juzgar.append(f)

    n = len(vivos)
    print("=== COBERTURA ÚTIL — problemas reales con una recomendación JUZGADA `verdadero` ===")
    print(f"verdaderos vivos del nivel 1 ................ {n}")
    print(f"con alguna RECOMENDACIÓN .................... {len(con_rec)}   {100*len(con_rec)/n:.1f} %   (la cobertura a secas)")
    print(f"**con recomendación JUZGADA `verdadero`** ... {len(utiles)}   {100*len(utiles)/n:.1f} %   <- LA MÉTRICA DE CABECERA")
    print(f"   Wilson 95 %: {intervalo(len(utiles), n)}")
    print(f"cubiertos con veredicto de nivel 2 NEGATIVO . {len(juzgados_no_verdaderos)}")
    print(f"cubiertos SIN NINGÚN veredicto de nivel 2 ... {len(sin_juzgar)}   <- deuda de juicio")

    print("\n=== POR KIND ===")
    kinds = sorted({f["kind"] for f in vivos})
    filas = []
    for k in kinds:
        v = [f for f in vivos if f["kind"] == k]
        rec = [f for f in v if any(h["state"] in RECOMENDACION for h in f["hipotesis"])]
        ut = [f for f in utiles if f["kind"] == k]
        filas.append((k, len(v), len(rec), len(ut)))
    filas.sort(key=lambda r: (-r[3], -r[2], -r[1]))
    print(f"{'kind':<30} {'vivos':>6} {'c/REC':>6} {'ÚTIL':>6}")
    for k, tot, rec, ut in filas:
        print(f"{k:<30} {tot:>6} {rec:>6} {ut:>6}")

    print("\n=== LAS ÚTILES, UNA POR UNA ===")
    for f in sorted(utiles, key=lambda x: (x["slug"], x["kind"])):
        pats = ", ".join(f"{p} ({v})" for p, v in f["veredictosNivel2"])
        print(f"{f['slug']:<16} {f['kind']:<26} {f['file']}:{f['line']}  -> {pats}")

    print("\n=== CUBIERTOS SIN VEREDICTO DE NIVEL 2 (deuda de juicio) ===")
    for f in sorted(sin_juzgar, key=lambda x: (x["slug"], x["kind"])):
        pats = ", ".join(sorted({h["pattern"] for h in f["hipotesis"] if h["state"] in RECOMENDACION}))
        print(f"{f['slug']:<16} {f['kind']:<26} {f['file']}:{f['line']}  -> {pats}")

    salida = os.environ.get("CK_UTIL_JSON")
    if salida:
        Path(salida).write_text(json.dumps({
            "vivos": n,
            "conRecomendacion": len(con_rec),
            "util": len(utiles),
            "wilson": wilson(len(utiles), n),
            "utiles": utiles,
            "sinJuzgar": sin_juzgar,
            "juzgadosNoVerdaderos": juzgados_no_verdaderos,
        }, indent=1, ensure_ascii=False), encoding="utf8")
        print(f"\n-> {salida}")


if __name__ == "__main__":
    main()
