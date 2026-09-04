#!/usr/bin/env python3
"""SONDA (a) DEL FRENTE Z4 (Ola Z) — EL TECHO DEL TIPO DEL RECEPTOR.

LA PREGUNTA, textual del encargo: cuando el código escribe `variable.metodo()`
con `variable` de tipo declarado B, el grafo emite `references` hacia B y NO
hacia `B#metodo`. ¿En cuántos sitios el tipo del receptor ESTÁ ESCRITO en la
fuente y se puede resolver a un nodo del repo?

CÓMO SE MIDE, sin re-parsear nada y sin inventar un mecanismo nuevo:

  * el SITIO es una `ReferenceFacts` con rol `receiver-member` — la forma
    `x.m()` / `x.m`, tal como la clasifica `graph/references.ts`;
  * el TIPO DEL RECEPTOR se pregunta con la MISMA operación que ya usa
    `detect/primitivas/r5-tipo-del-sitio.ts#declaredTypeAtSite`: buscar el
    nodo `carrier` del mismo archivo cuyo `symbolPath` TERMINA con
    `[...scope, nombre]` y leer `declaredTypeOf` sobre él. Dos carriers que
    empatan ⇒ `no-fact` (regla 1 de la Ola R: no se elige uno).

Los seis desenlaces son los de `declara-tipo.ts#DeclaredTypeAnswer`, sin
traducir: `class` (resuelve a un nodo del repo — EL TECHO), `ambiguous`
(multivaluado, viaja como ambiguo), `unresolved` (hay un nombre escrito y no
es del repo), `primitive`/`composite` (se escribió y no es una clase),
`no-fact` (no hay sitio de declaración con tipo).

Uso: python3 scripts/z4-sonda-a.py /tmp/z4/*.json
"""
import json
import sys
from collections import Counter, defaultdict


RECEPTOR_PROPIO = {"this", "self", "base", "super", "cls", "me", "Self"}


def cargar(p):
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


def indexar(d):
    nodos = {n["i"]: n for n in d["nodes"]}
    lang = {f["p"]: f["l"] for f in d["files"]}
    # carriers con forma escrita, por archivo
    carriers = defaultdict(list)
    for n in d["nodes"]:
        if n["k"] == "carrier" and n["dtf"] is not None:
            carriers[n["f"]].append(n)
    # aristas declares-type que SALEN de cada carrier
    dt = defaultdict(list)
    for e in d["edges"]:
        if e["k"] == "declares-type":
            dt[e["f"]].append(e)
    return nodos, lang, carriers, dt


def termina_con(path, sufijo):
    if len(sufijo) > len(path):
        return False
    return path[len(path) - len(sufijo):] == sufijo


def tipo_en_sitio(carriers, dt, archivo, scope, nombre):
    """`declaredTypeAtSite` reimplementado sobre el volcado, sin desviarse.

    Devuelve (outcome, nodeIds, via) con via ∈ {declared, inferred, None}.
    Se prueban sufijos cada vez más cortos del `scope` (el `scope` de una
    `ReferenceFacts` es el del SITIO DE USO y puede ser más profundo que el
    contenedor donde se declaró el binding: un `x` de parámetro usado dentro
    de un `if` anidado). El primer largo de sufijo con EXACTAMENTE un carrier
    gana; un largo con DOS es `no-fact` y se corta (regla 1).
    """
    lista = carriers.get(archivo)
    if not lista:
        return ("no-fact", (), None, -1)
    for k in range(len(scope), -1, -1):
        suf = list(scope[k:]) + [nombre]
        hits = [n for n in lista if termina_con(n["p"], suf)]
        if len(hits) > 1:
            return ("no-fact", (), None, len(scope) - k)
        if len(hits) == 1:
            n = hits[0]
            via = n["dtp"]
            if n["dtf"] == "primitive":
                return ("primitive", (), via, len(scope) - k)
            if n["dtf"] == "composite":
                return ("composite", (), via, len(scope) - k)
            aristas = dt.get(n["i"]) or []
            if not aristas:
                return ("unresolved", (), via, len(scope) - k)
            e = aristas[0]
            if e["p"] == "ambiguous":
                return ("ambiguous", tuple([e["t"]] + list(e["a"] or [])), via, len(scope) - k)
            return ("class", (e["t"],), via, len(scope) - k)
    return ("no-fact", (), None, -1)


def main(paths):
    global_por_lang = defaultdict(Counter)
    global_por_lang_decl = defaultdict(Counter)
    por_repo = {}
    hall_tabla = []
    for p in paths:
        d = cargar(p)
        slug = d["slug"]
        nodos, lang, carriers, dt = indexar(d)
        cnt = Counter()
        por_lang = defaultdict(Counter)
        decl_class = {
            n["p"][-1]
            for n in d["nodes"]
            if n["k"] == "symbol" and n["p"] and n["m"] in ("class-like", "namespace-like")
        }
        # índice de sitios por archivo para el cruce con hallazgos
        sitios_por_archivo = defaultdict(list)
        for r in d["refs"]:
            q = r["q"]
            # sólo receptor de UN identificador: `a.b.c()` no es "el tipo de
            # una variable", es una cadena, y se cuenta aparte.
            if not q:
                cnt["sin-calificador"] += 1
                continue
            if "." in q or "(" in q or "[" in q or "::" in q or " " in q:
                cnt["receptor-compuesto"] += 1
                por_lang[lang.get(r["f"], "?")]["receptor-compuesto"] += 1
                continue
            out, ids, via, prof = tipo_en_sitio(carriers, dt, r["f"], r["sc"], q)
            # DOS FAMILIAS QUE NO NECESITAN NINGÚN HECHO NUEVO, y contarlas
            # dentro de `no-fact` sería medir mal el techo:
            #   * receptor propio (`this`/`self`/…): el tipo del receptor ES la
            #     clase que encierra el sitio, y el grafo ya la tiene;
            #   * el calificador ES el nombre de una declaración del repo
            #     (acceso estático / de namespace): el "tipo" es esa misma
            #     declaración, tampoco hace falta resolver nada.
            if out == "no-fact":
                if q in RECEPTOR_PROPIO:
                    out = "receptor-propio"
                elif q in decl_class:
                    out = "calificador-es-declaracion"
            L = lang.get(r["f"], "?")
            cnt[out] += 1
            por_lang[L][out] += 1
            global_por_lang[L][out] += 1
            if via == "declared":
                global_por_lang_decl[L][out] += 1
            if out in ("class", "ambiguous"):
                sitios_por_archivo[r["f"]].append((r["ln"], q, r["n"], ids, out))
        por_repo[slug] = (cnt, por_lang)

        # ── cruce con los hallazgos de los dos kinds ──
        for f in d["findings"]:
            if f["k"] not in ("concrete-over-abstraction", "feature-envy-intra"):
                continue
            loc = f["l"][0]
            dentro = [
                s for s in sitios_por_archivo.get(loc["f"], [])
                if loc["s"] <= s[0] <= loc["e"]
            ]
            hall_tabla.append(
                {
                    "slug": slug,
                    "kind": f["k"],
                    "lang": lang.get(loc["f"], "?"),
                    "id": f["id"],
                    "file": loc["f"],
                    "sitios_resueltos": len(dentro),
                }
            )

    print("=== SONDA (a) — DESENLACE DEL TIPO DEL RECEPTOR, POR LENGUAJE (todos los sitios `x.m()`) ===")
    cols = ["class", "ambiguous", "receptor-propio", "calificador-es-declaracion", "unresolved", "primitive", "composite", "no-fact"]
    print("lengua      " + "".join(f"{c[:11]:>12}" for c in cols) + f"{'TOTAL':>10}{'%techo':>9}{'%techo+':>9}")
    tot = Counter()
    for L in sorted(global_por_lang):
        c = global_por_lang[L]
        n = sum(c[x] for x in cols)
        techo = c["class"] + c["ambiguous"]
        techo2 = techo + c["receptor-propio"] + c["calificador-es-declaracion"]
        tot.update(c)
        print(f"{L:<12}" + "".join(f"{c[x]:>12}" for x in cols) + f"{n:>10}" + f"{(100*techo/n if n else 0):>8.1f}%" + f"{(100*techo2/n if n else 0):>8.1f}%")
    n = sum(tot[x] for x in cols)
    techo = tot["class"] + tot["ambiguous"]
    techo2 = techo + tot["receptor-propio"] + tot["calificador-es-declaracion"]
    print(f"{'TOTAL':<12}" + "".join(f"{tot[x]:>12}" for x in cols) + f"{n:>10}" + f"{(100*techo/n if n else 0):>8.1f}%" + f"{(100*techo2/n if n else 0):>8.1f}%")

    print()
    print("=== sólo tipo ESCRITO (vía 1, `declaredTypeProvenance == declared`) ===")
    escritas = ["class", "ambiguous", "unresolved", "primitive", "composite"]
    print("lengua      " + "".join(f"{c[:11]:>12}" for c in escritas) + f"{'TOTAL':>10}{'%techo':>9}")
    for L in sorted(global_por_lang_decl):
        c = global_por_lang_decl[L]
        n = sum(c[x] for x in escritas)
        techo = c["class"] + c["ambiguous"]
        print(f"{L:<12}" + "".join(f"{c[x]:>12}" for x in escritas) + f"{n:>10}" + f"{(100*techo/n if n else 0):>8.1f}%")

    print()
    print("=== por repo ===")
    for slug, (cnt, _) in sorted(por_repo.items()):
        n = sum(cnt[x] for x in cols)
        techo = cnt["class"] + cnt["ambiguous"]
        print(f"{slug:<18} sitios={n:>7}  class={cnt['class']:>6}  amb={cnt['ambiguous']:>5}  unres={cnt['unresolved']:>6}  nofact={cnt['no-fact']:>7}  techo={100*techo/n if n else 0:.1f}%")

    print()
    print("=== hallazgos de los DOS kinds: ¿tienen un sitio `x.m()` con tipo resuelto dentro? ===")
    agg = defaultdict(lambda: [0, 0])
    for h in hall_tabla:
        a = agg[(h["kind"], h["lang"])]
        a[0] += 1
        if h["sitios_resueltos"] > 0:
            a[1] += 1
    for (k, L), (n, con) in sorted(agg.items()):
        print(f"{k:<28} {L:<12} hallazgos={n:>5}  con sitio resuelto={con:>5}  ({100*con/n if n else 0:.1f}%)")
    tn = sum(v[0] for v in agg.values())
    tc = sum(v[1] for v in agg.values())
    print(f"{'TOTAL':<28} {'':<12} hallazgos={tn:>5}  con sitio resuelto={tc:>5}  ({100*tc/tn if tn else 0:.1f}%)")

    with open("/tmp/z4/sonda-a-hallazgos.json", "w", encoding="utf-8") as fh:
        json.dump(hall_tabla, fh)


if __name__ == "__main__":
    main(sys.argv[1:])
