#!/usr/bin/env python3
"""
OLA X · INTEGRADOR — el nivel 2 leído de los volcados: población por patrón,
por estado, por lenguaje, por ancla, y la SELECTIVIDAD.

    selectividad = recomendaciones del patrón / hallazgos de sus anclas

Por encima del 50 % el patrón está REFORMULANDO el smell en vez de encontrar
dónde falta un patrón (regla de la Ola W, §3.5 de su informe de integración).

Lee los mismos volcados de `dump-hallazgos.mts` que `w-cobertura-nivel2.mts`,
así que las dos tablas hablan del mismo árbol y del mismo instante. No corre el
analizador ni escribe nada del árbol.

USO:  python3 scripts/x-int-nivel2.py <dir-de-volcados>
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

REC = {"ausente", "parcial"}
EXT = {
    ".py": "python", ".rb": "ruby", ".go": "go", ".java": "java", ".cs": "csharp",
    ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".mts": "typescript", ".cts": "typescript", ".tsx": "tsx",
    ".vue": "vue",
}


def lang_of(path):
    i = path.rfind(".")
    return EXT.get(path[i:].lower(), "?") if i >= 0 else "?"


def main():
    dumps = Path(sys.argv[1])
    # (patrón, estado) -> n ; (patrón, lenguaje, estado) -> n ; (patrón, ancla) -> n
    est = defaultdict(int)
    pat_lang = defaultdict(int)
    pat_anchor = defaultdict(int)
    pat_anchor_rec = defaultdict(int)
    kind_n = defaultdict(int)
    kind_lang_n = defaultdict(int)
    total_hallazgos = 0

    for f in sorted(dumps.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf8"))
        for fi in d["findings"]:
            total_hallazgos += 1
            where = fi["where"][0] if fi["where"] else "?:0"
            arch = where[: where.rfind(":")] if ":" in where else where
            lang = lang_of(arch)
            kind_n[fi["kind"]] += 1
            kind_lang_n[(fi["kind"], lang)] += 1
            for h in fi["hypotheses"]:
                est[(h["pattern"], h["state"])] += 1
                pat_lang[(h["pattern"], lang, h["state"])] += 1
                pat_anchor[(h["pattern"], fi["kind"])] += 1
                if h["state"] in REC:
                    pat_anchor_rec[(h["pattern"], fi["kind"])] += 1

    patrones = sorted({p for p, _ in est})
    estados = ["ausente", "parcial", "ya-aplicado", "aplicado-eludido"]

    print(f"hallazgos de nivel 1 en los volcados: {total_hallazgos}")
    print("\n| patrón | total | RECS | ausente | parcial | ya-aplicado | aplicado-eludido | anclas (hallazgos) | **selectividad** |")
    print("|---|---:|---:|---:|---:|---:|---:|---|---:|")
    T = R = 0
    for p in patrones:
        tot = sum(est[(p, s)] for s in estados)
        rec = est[(p, "ausente")] + est[(p, "parcial")]
        T += tot
        R += rec
        anclas = sorted({k for (pp, k) in pat_anchor if pp == p})
        pobl = sum(kind_n[k] for k in anclas)
        sel = f"{100*rec/pobl:.0f} %" if pobl else "—"
        print(f"| {p} | {tot} | **{rec}** | {est[(p,'ausente')]} | {est[(p,'parcial')]} | "
              f"{est[(p,'ya-aplicado')]} | {est[(p,'aplicado-eludido')]} | "
              f"{', '.join(f'{k} {kind_n[k]}' for k in anclas)} | {sel} |")
    print(f"| **TOTAL** | **{T}** | **{R}** | | | | | | |")

    print("\n=== SELECTIVIDAD POR (patrón, ANCLA) — recs / hallazgos del ancla ===")
    print(f"{'patrón':<26} {'ancla':<28} {'hallazgos':>9} {'hip.':>6} {'recs':>6} {'sel.':>7}")
    for (p, k), n in sorted(pat_anchor.items(), key=lambda kv: (kv[0][0], -kv[1])):
        rec = pat_anchor_rec[(p, k)]
        pobl = kind_n[k]
        sel = f"{100*rec/pobl:.0f} %" if pobl else "—"
        print(f"{p:<26} {k:<28} {pobl:>9} {n:>6} {rec:>6} {sel:>7}")

    print("\n=== POR PATRÓN Y LENGUAJE (total / recs) ===")
    for p in patrones:
        langs = sorted({l for (pp, l, _) in pat_lang if pp == p})
        piezas = []
        for l in langs:
            tot = sum(pat_lang[(p, l, s)] for s in estados)
            rec = pat_lang[(p, l, "ausente")] + pat_lang[(p, l, "parcial")]
            piezas.append(f"{l} {tot}/{rec}")
        print(f"{p:<26} {', '.join(piezas)}")

    print("\n=== NIVEL 1: hallazgos por (kind, lenguaje) ===")
    for k in sorted(kind_n, key=lambda x: -kind_n[x]):
        langs = sorted([(l, n) for (kk, l), n in kind_lang_n.items() if kk == k], key=lambda t: -t[1])
        print(f"{k:<30} {kind_n[k]:>6}   " + ", ".join(f"{l} {n}" for l, n in langs))


if __name__ == "__main__":
    main()
