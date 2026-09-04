#!/usr/bin/env python3
"""B6 (Ola X) — resumen de un volcado de dump-hallazgos.mts, enfocado en
Factory Method / Null Object / Composite / State / Abstract Factory (mi
alcance). Cuenta hipotesis por patron y por kind-ancla (para distinguir
cuales vienen de la ancla nueva vs la vieja).
"""
import json
import sys
import collections

MINE = {"Factory Method", "Null Object", "Composite", "State", "Abstract Factory"}

for path in sys.argv[1:]:
    data = json.load(open(path))
    findings = data["findings"]
    by_pattern = collections.Counter()
    by_pattern_state = collections.Counter()
    by_pattern_anchor_kind = collections.Counter()
    by_pattern_anchor_state = collections.Counter()
    recs_by_pattern = collections.Counter()
    for f in findings:
        kind = f["kind"]
        for h in f["hypotheses"]:
            p = h["pattern"]
            if p not in MINE:
                continue
            by_pattern[p] += 1
            by_pattern_state[(p, h["state"])] += 1
            by_pattern_anchor_kind[(p, kind)] += 1
            by_pattern_anchor_state[(p, kind, h["state"])] += 1
            if h["state"] in ("ausente", "parcial"):
                recs_by_pattern[p] += 1
    print(f"=== {path} ===")
    for p in sorted(MINE):
        if by_pattern[p] == 0:
            continue
        print(f"  {p}: total={by_pattern[p]} recs={recs_by_pattern[p]}")
        for (pp, kind), n in sorted(by_pattern_anchor_kind.items()):
            if pp != p:
                continue
            states = {st: c for (pp2, k2, st), c in by_pattern_anchor_state.items() if pp2 == p and k2 == kind}
            print(f"      ancla={kind:28s} n={n:4d}  estados={states}")
