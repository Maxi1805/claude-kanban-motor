"""OLA AW - AW5. Replica offline de `data-clump` sobre el volcado de firmas,
para poder medir reglas de agrupamiento sin re-parsear.

`actual()` reproduce EXACTAMENTE las tres reglas de produccion (grupo = lista
completa de parametros; >=minRepeats ocurrencias; >=minRepeats nombres de
operacion distintos; no-despachador). `subset()` es la regla nueva."""
import json, sys, itertools
from collections import defaultdict

MIN_GROUP = 3
MIN_REPEATS = 3

def load(path):
    return json.load(open(path))

def sibling_callees(fn, group_params, op_names):
    own = fn.get("n")
    found = set()
    for c in fn.get("calls", []):
        cal = c.get("c")
        if not cal or cal == own or cal not in op_names:
            continue
        if any(a in group_params for a in c.get("a", [])):
            found.add(cal)
    return found

def is_dispatcher(occs, group_params, op_names):
    return any(len(sibling_callees(o, group_params, op_names)) >= 2 for o in occs)

def actual(dump, min_group=MIN_GROUP, min_repeats=MIN_REPEATS):
    """Poblacion de HOY: grupo == lista completa de parametros."""
    out = []
    for row in dump["rows"]:
        groups = defaultdict(list)
        for fn in row["fns"]:
            names = fn.get("p")
            if not names:
                continue
            uniq = list(dict.fromkeys(names))
            if len(uniq) < min_group:
                continue
            groups[" ".join(sorted(uniq))].append((uniq, fn))
        for key, occ in groups.items():
            if len(occ) < min_repeats:
                continue
            ops = set()
            for i, (_, fn) in enumerate(occ):
                ops.add(fn.get("n") or f"#{i}")
            if len(ops) < min_repeats:
                continue
            gnames = occ[0][0]
            if is_dispatcher([fn for _, fn in occ], set(gnames), ops):
                continue
            out.append({"file": row["file"], "lang": row["lang"], "group": gnames,
                        "occ": len(occ), "start": occ[0][1]["s"],
                        "fns": [{"n": fn.get("n"), "s": fn["s"], "p": fn.get("p")} for _, fn in occ]})
    return out

def subset(dump, min_group=MIN_GROUP, min_repeats=MIN_REPEATS, min_distinct_sigs=2, require_proper=True):
    """Regla NUEVA: el grupo es un SUBCONJUNTO comun de >=min_group nombres,
    compartido por >=min_repeats firmas cuyas listas completas NO son todas
    iguales (viaja ENTRE otros parametros distintos)."""
    out = []
    for row in dump["rows"]:
        cand = []
        for fn in row["fns"]:
            names = fn.get("p")
            if not names:
                continue
            uniq = frozenset(names)
            if len(uniq) < min_group:
                continue
            cand.append((uniq, fn))
        if len(cand) < min_repeats:
            continue
        # candidatos: intersecciones de pares con >= min_group elementos
        seen = set()
        cands = []
        for i in range(len(cand)):
            for j in range(i + 1, len(cand)):
                inter = cand[i][0] & cand[j][0]
                if len(inter) < min_group:
                    continue
                if inter in seen:
                    continue
                seen.add(inter)
                cands.append(inter)
        for g in cands:
            occ = [(s, fn) for (s, fn) in cand if g <= s]
            if len(occ) < min_repeats:
                continue
            sigs = {frozenset(s) for s, _ in occ}
            if len(sigs) < min_distinct_sigs:
                continue
            if require_proper and not any(len(s) > len(g) for s, _ in occ):
                continue
            ops = set()
            for i, (_, fn) in enumerate(occ):
                ops.add(fn.get("n") or f"#{i}")
            if len(ops) < min_repeats:
                continue
            if is_dispatcher([fn for _, fn in occ], set(g), ops):
                continue
            out.append({"file": row["file"], "lang": row["lang"], "group": sorted(g),
                        "occ": len(occ), "sigs": len(sigs), "start": occ[0][1]["s"],
                        "fns": [{"n": fn.get("n"), "s": fn["s"], "p": fn.get("p")} for _, fn in occ]})
        # quedarse con los MAXIMALES: descartar un grupo que sea subconjunto
        # estricto de otro del MISMO archivo con el mismo soporte
    # dedupe maximal por archivo
    best = []
    byfile = defaultdict(list)
    for f in out:
        byfile[f["file"]].append(f)
    for file, fs in byfile.items():
        for f in fs:
            gs = set(f["group"])
            dominated = any(gs < set(o["group"]) and o["occ"] >= f["occ"] for o in fs)
            if not dominated:
                best.append(f)
    return best

if __name__ == "__main__":
    d = load(sys.argv[1])
    a = actual(d)
    print("ACTUAL", len(a))
    for f in a:
        print("  ", f["file"], f["start"], "(" + ", ".join(f["group"]) + ")", f["occ"])
