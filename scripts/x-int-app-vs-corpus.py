#!/usr/bin/env python3
"""
OLA X · INTEGRADOR — la reproducción de la pregunta A1:

    > ¿En código de APLICACIÓN el nivel 2 propone MÁS patrones por línea que en
    > las librerías del corpus? Si sí, el 23,6 % de `ya-aplicado` se explica solo
    > y hay que replantear sobre qué población se mide el proyecto.

Compara, POR MIL LÍNEAS ANALIZADAS (que es la única forma justa de comparar una
población de 1.437 líneas con una de 470.451):

  · hallazgos de nivel 1 / kLOC        — cuánto olor tiene cada población
  · recomendaciones / kLOC             — cuánto remedio propone el nivel 2
  · lo mismo SÓLO con patrones de GoF  — sin Extract Method, que no es de GoF y
                                          que ancla en líneas en blanco
  · lo mismo estandarizado por lenguaje sobre los lenguajes COMUNES a las dos
    poblaciones (la mezcla de lenguajes es distinta y eso solo movería el número)

ENTRADAS:
  · volcados de aplicación: `scripts/x-a1-volcado.mts` (traen `meta.totalLines`
    y `porLenguajeLineas`, que `dump-hallazgos.mts` no guarda)
  · volcados del corpus: EL MISMO instrumento (`x-a1-volcado.mts`) sobre los 13
    repos, para que las dos columnas se midan con el mismo código y el mismo
    árbol. Sobre el corpus son todos HIT de caché: el censo ya pagó el análisis
    con la MISMA clave (`limits: maxFindings unlimited`).

USO:  python3 scripts/x-int-app-vs-corpus.py <dir-app> <dir-corpus>
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

REC = {"ausente", "parcial"}
# Piso de volumen (kLOC) para que un lenguaje sirva de base de estandarización.
PISO_KLOC = 10
NO_GOF = {"Extract Method"}
EXT = {
    ".py": "python", ".rb": "ruby", ".go": "go", ".java": "java", ".cs": "csharp",
    ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".mts": "typescript", ".cts": "typescript", ".tsx": "tsx",
    ".vue": "vue",
}


def lang_of(path):
    i = path.rfind(".")
    return EXT.get(path[i:].lower(), "?") if i >= 0 else "?"


def leer_app(d):
    tot = {"lineas": 0, "hallazgos": 0, "hip": 0, "recs": 0, "recs_gof": 0}
    porlang = defaultdict(lambda: {"lineas": 0, "recs": 0, "recs_gof": 0})
    porrepo = {}
    for f in sorted(Path(d).glob("*.json")):
        j = json.loads(f.read_text(encoding="utf8"))
        r = {"lineas": j["meta"]["totalLines"], "hallazgos": len(j["findings"]), "hip": 0, "recs": 0, "recs_gof": 0}
        for l, n in j["meta"]["porLenguajeLineas"].items():
            porlang[l]["lineas"] += n
        for fi in j["findings"]:
            for h in fi["hypotheses"]:
                r["hip"] += 1
                if h["state"] in REC:
                    r["recs"] += 1
                    porlang[fi["language"]]["recs"] += 1
                    if h["pattern"] not in NO_GOF:
                        r["recs_gof"] += 1
                        porlang[fi["language"]]["recs_gof"] += 1
        porrepo[j["slug"]] = r
        for k in tot:
            tot[k] += r[k]
    return tot, porlang, porrepo





def fila(nombre, a, b):
    ra = a / b if b else 0
    return f"{nombre:<38} {ra:>10.3f}"


def main():
    dapp, dcor = sys.argv[1], sys.argv[2]
    app, appl, apprepo = leer_app(dapp)
    cor, corl, correpo = leer_app(dcor)

    print("=== APLICACIÓN vs CORPUS — por mil líneas analizadas ===")
    print(f"{'':<38} {'APLICACIÓN':>14} {'CORPUS':>14} {'razón':>8}")
    def linea(nombre, ka, kb, escala=1000):
        va = app[ka] / app["lineas"] * escala
        vb = cor[kb] / cor["lineas"] * escala
        r = va / vb if vb else float("nan")
        print(f"{nombre:<38} {va:>14.3f} {vb:>14.3f} {r:>8.2f}")
    print(f"{'líneas analizadas':<38} {app['lineas']:>14} {cor['lineas']:>14}")
    print(f"{'hallazgos de nivel 1':<38} {app['hallazgos']:>14} {cor['hallazgos']:>14}")
    print(f"{'hipótesis':<38} {app['hip']:>14} {cor['hip']:>14}")
    print(f"{'recomendaciones':<38} {app['recs']:>14} {cor['recs']:>14}")
    print(f"{'recomendaciones de GoF':<38} {app['recs_gof']:>14} {cor['recs_gof']:>14}")
    linea("hallazgos / kLOC", "hallazgos", "hallazgos")
    linea("hipótesis / kLOC", "hip", "hip")
    linea("recomendaciones / kLOC", "recs", "recs")
    linea("recomendaciones GoF / kLOC", "recs_gof", "recs_gof")
    ra = app["recs"] / app["hallazgos"] if app["hallazgos"] else 0
    rb = cor["recs"] / cor["hallazgos"] if cor["hallazgos"] else 0
    print(f"{'recomendaciones / hallazgos':<38} {100*ra:>13.1f}% {100*rb:>13.1f}% {ra/rb if rb else 0:>8.2f}")

    print("\n=== POR REPO DE APLICACIÓN ===")
    print(f"{'repo':<16} {'líneas':>8} {'hallaz.':>8} {'hip':>5} {'recs':>5} {'GoF':>5} {'recs/kLOC':>10} {'GoF/kLOC':>9}")
    for slug, r in sorted(apprepo.items()):
        print(f"{slug:<16} {r['lineas']:>8} {r['hallazgos']:>8} {r['hip']:>5} {r['recs']:>5} {r['recs_gof']:>5} "
              f"{1000*r['recs']/r['lineas']:>10.3f} {1000*r['recs_gof']/r['lineas']:>9.3f}")

    print("\n=== POR LENGUAJE — recomendaciones por kLOC en las dos poblaciones ===")
    langs = sorted(set(appl) | set(corl))
    print(f"{'lenguaje':<12} {'app kLOC':>9} {'app r/kLOC':>11} {'app GoF/kLOC':>13} "
          f"{'cor kLOC':>9} {'cor r/kLOC':>11} {'cor GoF/kLOC':>13} {'razón GoF':>10}")
    comunes = []
    for l in langs:
        a = appl.get(l, {"lineas": 0, "recs": 0, "recs_gof": 0})
        c = corl.get(l, {"lineas": 0, "recs": 0, "recs_gof": 0})
        ak = 1000 * a["recs"] / a["lineas"] if a["lineas"] else 0
        ag = 1000 * a["recs_gof"] / a["lineas"] if a["lineas"] else 0
        ck = 1000 * c["recs"] / c["lineas"] if c["lineas"] else 0
        cg = 1000 * c["recs_gof"] / c["lineas"] if c["lineas"] else 0
        raz = f"{ag/cg:.2f}" if cg else "—"
        print(f"{l:<12} {a['lineas']/1000:>9.1f} {ak:>11.3f} {ag:>13.3f} "
              f"{c['lineas']/1000:>9.1f} {ck:>11.3f} {cg:>13.3f} {raz:>10}")
        # Un lenguaje sólo sirve de base de comparación si las DOS poblaciones
        # tienen volumen real en él. `vue` es el caso que obliga a poner el
        # piso: 56,3 kLOC de aplicación contra 3,7 kLOC de corpus (los demos
        # `.vue` de vueuse, que compila a `.ts`) — con 0 recomendaciones del
        # lado del corpus, "esperadas = 0" y el cociente se vuelve infinito por
        # falta de base, no por una diferencia real.
        if a["lineas"] >= PISO_KLOC * 1000 and c["lineas"] >= PISO_KLOC * 1000:
            comunes.append((l, a, c, cg, ag))

    # ESTANDARIZACIÓN DIRECTA: cuántas recomendaciones de GoF esperaría la
    # aplicación si, en cada lenguaje, tuviera la MISMA tasa por kLOC que el
    # corpus. Controla la mezcla de lenguajes, que es distinta en las dos
    # poblaciones y por sí sola movería el cociente crudo.
    esperadas = sum(cg * a["lineas"] / 1000 for _, a, _, cg, _ in comunes)
    observadas = sum(a["recs_gof"] for _, a, _, _, _ in comunes)
    lineas_com = sum(a["lineas"] for _, a, _, _, _ in comunes)
    print(f"\nESTANDARIZADO POR LENGUAJE (sólo los {len(comunes)} lenguajes con >= {PISO_KLOC} kLOC de LOS DOS lados: {", ".join(l for l,_,_,_,_ in comunes)}; {lineas_com/1000:.1f} kLOC de aplicación):")
    print(f"  recomendaciones de GoF OBSERVADAS en aplicación ... {observadas}")
    print(f"  ... ESPERADAS con la tasa del corpus ............. {esperadas:.1f}")
    print(f"  razón observado/esperado ......................... {observadas/esperadas:.2f}" if esperadas else "")


if __name__ == "__main__":
    main()
