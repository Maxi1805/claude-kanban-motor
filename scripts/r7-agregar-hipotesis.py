#!/usr/bin/env python3
"""
R7 (Ola R, SOLO MEDICION) -- agrega los volcados de scripts/dump-hallazgos.mts
(uno por repo, en /tmp/r7/<slug>.json) para responder dos preguntas con un
numero reproducible:

  1. Cuantas hipotesis VIVAS (ausente|parcial) hay hoy para Chain of
     Responsibility, Decorator, Composite y State, por repo/lenguaje -- la
     poblacion sobre la que "declara-tipo" podria cambiar algo.
  2. Cuanto del corpus de hipotesis total es ya-aplicado/aplicado-eludido
     (el "40%" que el usuario dijo que no quiere), reproducido de cero sobre
     un volcado fresco -- no aceptado de un informe ajeno sin reproducir.

Uso: python3 scripts/r7-agregar-hipotesis.py /tmp/r7/*.json
"""
import json
import sys
from collections import defaultdict

FOUR = ["Chain of Responsibility", "Decorator", "Composite", "State"]
STATES = ["ausente", "parcial", "ya-aplicado", "aplicado-eludido"]

LANG_BY_EXT = {
    ".py": "python", ".rb": "ruby", ".java": "java", ".cs": "csharp",
    ".go": "go", ".ts": "typescript", ".tsx": "tsx", ".js": "javascript",
    ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
    ".vue": "vue",
}


def lang_of(path: str) -> str:
    for ext, lang in LANG_BY_EXT.items():
        if path.endswith(ext):
            return lang
    return "?"


def main() -> None:
    files = sys.argv[1:]
    if not files:
        print("uso: r7-agregar-hipotesis.py /tmp/r7/*.json", file=sys.stderr)
        sys.exit(1)

    overall = {s: 0 for s in STATES}
    overall_by_pattern = defaultdict(lambda: {s: 0 for s in STATES})
    four_by_repo_lang = defaultdict(lambda: {s: 0 for s in STATES})
    four_examples = defaultdict(list)
    total_findings = 0
    repos_seen = []

    for fp in files:
        with open(fp) as f:
            d = json.load(f)
        slug = fp.split("/")[-1].replace(".json", "")
        repos_seen.append(slug)
        total_findings += d.get("total", len(d.get("findings", [])))
        for finding in d.get("findings", []):
            where = finding.get("where", [])
            path0 = where[0].split(":")[0] if where else ""
            lang = lang_of(path0)
            for h in finding.get("hypotheses", []):
                pattern = h["pattern"]
                state = h["state"]
                overall[state] += 1
                overall_by_pattern[pattern][state] += 1
                if pattern in FOUR:
                    key = (slug, lang, pattern)
                    four_by_repo_lang[key][state] += 1
                    if state in ("ausente", "parcial") and len(four_examples[(pattern, state)]) < 4:
                        four_examples[(pattern, state)].append(f"{slug}:{path0}:{where[0].split(':')[-1] if where else '?'} ({finding.get('kind')})")

    total_h = sum(overall.values())
    print("=== REPOS INCLUIDOS ===")
    print(", ".join(sorted(repos_seen)), f"({len(repos_seen)} de 13)")
    print()
    print("=== TOTAL HALLAZGOS (los 13/N repos volcados) ===", total_findings)
    print()
    print("=== TOTAL HIPOTESIS, LOS 17 PATRONES (reproducido de cero) ===")
    print(json.dumps(overall, indent=1))
    print(f"total = {total_h}")
    if total_h:
        ya = overall["ya-aplicado"]
        elu = overall["aplicado-eludido"]
        print(f"ya-aplicado = {ya} ({100*ya/total_h:.1f}%)")
        print(f"aplicado-eludido = {elu} ({100*elu/total_h:.1f}%)")
        print(f"ya-aplicado + aplicado-eludido = {ya+elu} ({100*(ya+elu)/total_h:.1f}%)")
        print(f"ausente = {overall['ausente']} ({100*overall['ausente']/total_h:.1f}%)")
        print(f"parcial = {overall['parcial']} ({100*overall['parcial']/total_h:.1f}%)")
    print()

    print("=== POR PATRON (los 17) ===")
    for pattern in sorted(overall_by_pattern.keys()):
        row = overall_by_pattern[pattern]
        t = sum(row.values())
        print(f"{pattern:32s} total={t:5d}  ausente={row['ausente']:5d}  parcial={row['parcial']:4d}  ya-aplicado={row['ya-aplicado']:5d}  aplicado-eludido={row['aplicado-eludido']:4d}")
    print()

    print("=== LOS CUATRO PATRONES DE R7 -- por repo y lenguaje ===")
    agg_by_pattern_lang = defaultdict(lambda: {s: 0 for s in STATES})
    for (slug, lang, pattern), row in sorted(four_by_repo_lang.items()):
        t = sum(row.values())
        print(f"{pattern:28s} {slug:16s} {lang:12s} total={t:4d}  ausente={row['ausente']:4d}  parcial={row['parcial']:4d}  ya-aplicado={row['ya-aplicado']:4d}  aplicado-eludido={row['aplicado-eludido']:4d}")
        key = (pattern, lang)
        for s in STATES:
            agg_by_pattern_lang[key][s] += row[s]
    print()
    print("=== LOS CUATRO PATRONES -- agregado por (patron, lenguaje) ===")
    for (pattern, lang), row in sorted(agg_by_pattern_lang.items()):
        t = sum(row.values())
        vivas = row["ausente"] + row["parcial"]
        print(f"{pattern:28s} {lang:12s} total={t:4d}  VIVAS(ausente+parcial)={vivas:4d}  ya-aplicado={row['ya-aplicado']:4d}  aplicado-eludido={row['aplicado-eludido']:4d}")
    print()
    print("=== LOS CUATRO PATRONES -- agregado total (todos los repos/lenguajes) ===")
    for pattern in FOUR:
        row = {s: 0 for s in STATES}
        for (p, lang), r in agg_by_pattern_lang.items():
            if p != pattern:
                continue
            for s in STATES:
                row[s] += r[s]
        t = sum(row.values())
        vivas = row["ausente"] + row["parcial"]
        print(f"{pattern:28s} total={t:5d}  VIVAS={vivas:5d}  ausente={row['ausente']:5d}  parcial={row['parcial']:4d}  ya-aplicado={row['ya-aplicado']:5d}  aplicado-eludido={row['aplicado-eludido']:4d}")
    print()
    print("=== EJEMPLOS (hasta 4 por patron/estado VIVO) ===")
    for (pattern, state), exs in sorted(four_examples.items()):
        print(f"{pattern} / {state}:")
        for e in exs:
            print(f"  {e}")


if __name__ == "__main__":
    main()
