#!/usr/bin/env python3
"""Integrador Ola O: cruce del censo ANTES vs DESPUES por kind y por (kind, lenguaje).

Uso:
  python3 scripts/o-integrador-cruce.py <dir_antes> <dir_despues> [--json salida.json]

Cada dir tiene <slug>.census.json. Las claves son "<archivo>|archivo:<lenguaje>"
(=1) y "<archivo>|hallazgo:<kind>" (= suma de memberCount pre-tope).
"""
import json, os, sys, collections

SLUGS = ["click","cobra","eslint","guava","hugo","jekyll","lodash","nest",
         "newtonsoft-json","preact","rubocop","sqlalchemy","vueuse","fixtures-multi"]

def load(dirpath):
    out = {}
    for s in SLUGS:
        p = os.path.join(dirpath, f"{s}.census.json")
        if os.path.exists(p):
            out[s] = json.load(open(p))
    return out

def index(census):
    """-> (lang_of_file, per_kind_total, per_kind_lang, file_lang_keys, meta)"""
    langof = {}
    for k, v in census["keys"].items():
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

def aggregate(dirpath, exclude_fixtures=True):
    cs = load(dirpath)
    kind_total = collections.Counter()
    kind_lang = collections.Counter()
    lang_files = collections.Counter()
    metas = {}
    for s, c in cs.items():
        if exclude_fixtures and s == "fixtures-multi":
            continue
        lo, kt, kl = index(c)
        kind_total.update(kt); kind_lang.update(kl)
        for f, l in lo.items():
            lang_files[l] += 1
        metas[s] = c["meta"]
    return kind_total, kind_lang, lang_files, metas, cs

def main():
    a_dir, d_dir = sys.argv[1], sys.argv[2]
    ka, kla, lfa, ma, csa = aggregate(a_dir)
    kd, kld, lfd, md, csd = aggregate(d_dir)

    print("=== META por repo (scannedFiles / analysedFiles / totalLines) ===")
    for s in SLUGS:
        if s in ma and s in md:
            x, y = ma[s], md[s]
            flag = "" if (x["scannedFiles"] == y["scannedFiles"] and x["analysedFiles"] == y["analysedFiles"] and x["totalLines"] == y["totalLines"]) else "   <<< META CAMBIO"
            print(f"{s:18s} {x['scannedFiles']}/{x['analysedFiles']}/{x['totalLines']}  ->  {y['scannedFiles']}/{y['analysedFiles']}/{y['totalLines']}{flag}")

    print("\n=== LENGUAJES: archivos por lenguaje (clave archivo:<lang>) ===")
    for l in sorted(set(lfa) | set(lfd)):
        flag = "" if lfa[l] == lfd[l] else "   <<< CAMBIO"
        print(f"{l:14s} {lfa[l]:6d} -> {lfd[l]:6d}{flag}")

    print("\n=== VOLUMEN POR KIND (13 repos, sin fixtures) ===")
    print(f"{'kind':34s} {'antes':>8s} {'despues':>8s} {'delta':>8s} {'%':>7s}")
    for k in sorted(set(ka) | set(kd), key=lambda k: -ka.get(k, 0)):
        a, d = ka.get(k, 0), kd.get(k, 0)
        pct = "" if a == 0 else f"{(d-a)*100.0/a:+.0f}%"
        print(f"{k:34s} {a:8d} {d:8d} {d-a:+8d} {pct:>7s}")
    print(f"{'TOTAL':34s} {sum(ka.values()):8d} {sum(kd.values()):8d} {sum(kd.values())-sum(ka.values()):+8d}")

    print("\n=== CRUCE (kind, lenguaje) — kinds que se movieron ===")
    moved = [k for k in set(ka) | set(kd) if ka.get(k, 0) != kd.get(k, 0)]
    langs = sorted(set(l for (_, l) in set(kla) | set(kld)))
    for k in sorted(moved, key=lambda k: -ka.get(k, 0)):
        print(f"\n-- {k}: {ka.get(k,0)} -> {kd.get(k,0)}")
        for l in langs:
            a, d = kla.get((k, l), 0), kld.get((k, l), 0)
            if a == 0 and d == 0:
                continue
            surv = "" if a == 0 else f"{d*100.0/a:.0f}%"
            mark = ""
            if a > 0 and d == 0:
                mark = "   <<< CAE A CERO"
            elif a >= 20 and d * 100.0 / max(a, 1) < 10:
                mark = "   <<< <10% supervivencia"
            elif a == 0 and d > 0:
                mark = "   (nuevo)"
            print(f"   {l:12s} {a:7d} -> {d:7d}  surv={surv:>6s}{mark}")

    if "--json" in sys.argv:
        out = sys.argv[sys.argv.index("--json") + 1]
        json.dump({
            "kind_antes": dict(ka), "kind_despues": dict(kd),
            "kindlang_antes": {f"{k}|{l}": v for (k, l), v in kla.items()},
            "kindlang_despues": {f"{k}|{l}": v for (k, l), v in kld.items()},
        }, open(out, "w"), indent=1)
        print(f"\n-> {out}")

main()
