"""OLA AW - AW5. Constructor v2: agrega la regla de PARAMETRO AMBIENTE
(generaliza el arreglo 1 self/this sin ningun vocabulario)."""
from collections import defaultdict
MIN_GROUP=3; MIN_REPEATS=3

def ambient_names(row, frac=0.6, minf=3):
    """Nombre que ocupa la PRIMERA posicion en >=frac de las firmas del archivo
    (y en >=minf de ellas) no es un dato del grupo: es contexto ambiente.
    Generaliza `self`/`this` sin nombrar ninguna palabra."""
    firsts=[]
    for fn in row["fns"]:
        raw=fn.get("raw") or []
        if raw: firsts.append(raw[0])
    if len(firsts)<minf: return set()
    c=defaultdict(int)
    for f in firsts: c[f]+=1
    return {n for n,k in c.items() if k>=minf and k>=frac*len(firsts)}

def build(dump, mode="exact", max_repeats=None, anon_counts=True, ambient=False,
          amb_frac=0.6, min_group=MIN_GROUP, min_repeats=MIN_REPEATS):
    out=[]
    for row in dump["rows"]:
        amb = ambient_names(row, amb_frac) if ambient else set()
        cand=[]
        for fn in row["fns"]:
            names=fn.get("p")
            if not names: continue
            u=[n for n in dict.fromkeys(names) if n not in amb]
            if len(u)<min_group: continue
            cand.append((frozenset(u), u, fn))
        if len(cand)<min_repeats: continue
        cands=set(s for s,_,_ in cand)
        if mode in ("subset","union"):
            for i in range(len(cand)):
                for j in range(i+1,len(cand)):
                    inter=cand[i][0]&cand[j][0]
                    if len(inter)>=min_group: cands.add(inter)
        res=[]
        for g in cands:
            occ=[(s,u,fn) for (s,u,fn) in cand if (s==g if mode=="exact" else g<=s)]
            if len(occ)<min_repeats: continue
            if max_repeats is not None and len(occ)>max_repeats: continue
            sigs={s for s,_,_ in occ}
            if mode=="subset" and len(sigs)<2: continue
            ops=set()
            for i,(_,_,fn) in enumerate(occ):
                n=fn.get("n")
                if n: ops.add(n)
                elif anon_counts: ops.add(f"#{i}")
            if len(ops)<min_repeats: continue
            gs=set(g)
            def sib(fn):
                own=fn.get("n"); found=set()
                for c in fn.get("calls",[]):
                    cal=c.get("c")
                    if not cal or cal==own or cal not in ops: continue
                    if any(a in gs for a in c.get("a",[])): found.add(cal)
                return found
            if any(len(sib(fn))>=2 for _,_,fn in occ): continue
            res.append({"file":row["file"],"lang":row["lang"],"group":sorted(g),
                        "occ":len(occ),"sigs":len(sigs),"start":min(fn["s"] for _,_,fn in occ),
                        "amb":sorted(amb),
                        "fns":sorted([{"n":fn.get("n"),"s":fn["s"],"p":fn.get("p")} for _,_,fn in occ], key=lambda x:x["s"])})
        for f in res:
            gs=set(f["group"])
            if any(gs<set(o["group"]) and o["occ"]>=f["occ"] for o in res): continue
            out.append(f)
    return out
