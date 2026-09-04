"""OLA AW - AW5. Constructor parametrico de la poblacion de `data-clump`."""
import json
from collections import defaultdict
MIN_GROUP=3; MIN_REPEATS=3

def build(dump, mode="exact", max_repeats=None, anon_counts=True, min_group=MIN_GROUP, min_repeats=MIN_REPEATS):
    out=[]
    for row in dump["rows"]:
        cand=[]
        for fn in row["fns"]:
            names=fn.get("p")
            if not names: continue
            u=list(dict.fromkeys(names))
            if len(u)<min_group: continue
            cand.append((frozenset(u), u, fn))
        if len(cand)<min_repeats: continue
        cands=set()
        for s,_,_ in cand: cands.add(s)
        if mode in ("subset","union"):
            for i in range(len(cand)):
                for j in range(i+1,len(cand)):
                    inter=cand[i][0]&cand[j][0]
                    if len(inter)>=min_group: cands.add(inter)
        res=[]
        for g in cands:
            if mode=="exact":
                occ=[(s,u,fn) for (s,u,fn) in cand if s==g]
            else:
                occ=[(s,u,fn) for (s,u,fn) in cand if g<=s]
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
                        "fns":sorted([{"n":fn.get("n"),"s":fn["s"],"p":fn.get("p")} for _,_,fn in occ], key=lambda x:x["s"])})
        for f in res:
            gs=set(f["group"])
            if any(gs<set(o["group"]) and o["occ"]>=f["occ"] for o in res): continue
            out.append(f)
    return out
