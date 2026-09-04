#!/usr/bin/env python3
"""OLA AI, FRENTE AI6 — el delta EXACTO de la tercera vía de
`is-instantiates-variant` (`factory-method.ts#chainArbolEvidence`), sin
necesitar una segunda corrida del analizador.

CÓMO, Y POR QUÉ ES EXACTO. La compuerta VIEJA, para el ancla
`conditional-chain`, era una función de UN campo del propio `Finding`:
`variant === "instantiates"`. Ese campo viaja a la traza dentro de
`locations[0].role`, que el detector escribe de forma biyectiva con el
`variant` (`conditional-chain.ts`: `"selector de tipo a instanciar"` para
`instantiates`, `"cadena larga de condicionales"` para `ladder`). O sea: toda
entrada que HOY sobrevive al `required` y cuyo `role` NO es "selector de tipo
a instanciar" es, exactamente, una hipótesis que la vía nueva abrió.

VALIDACIÓN: sobre la foto PRE-arreglo (`scratchpad-ai6/antes-fm/`) ninguna de
esas entradas sobrevivía — 0 en los 7 repos.

Uso: python3 scripts/ai6-fm-delta.py [dir-traza]
"""
import json, os, sys, collections

LIB = ["click","cobra","eslint","guava","hugo","jekyll","lodash","nest","newtonsoft-json","preact","rubocop","sqlalchemy","vueuse"]
APP = ["Ghost","ShareX","chatwoot","excalidraw","gitea","jenkins","netbox","redmine"]
T = sys.argv[1] if len(sys.argv) > 1 else "scratchpad-ai6/traza"
ROLE_VIEJO = "selector de tipo a instanciar"

for pop, repos in (("BIBLIOTECAS (13)", LIB), ("APLICACIONES (8)", APP)):
    print("=" * 104); print(pop); print("=" * 104)
    faltan = []; viejo = 0; nuevo = []; porRepo = collections.Counter(); porLang = collections.Counter()
    entran = 0
    for r in repos:
        fn = f"{T}/{r}.json"
        if not os.path.exists(fn): faltan.append(r); continue
        d = json.load(open(fn))
        for e in d.get("Factory Method", []):
            if e["camino"] != "chain/switch-instantiates" or e["kind"] != "conditional-chain": continue
            entran += 1
            if not (e["checks"] and all(c["holds"] for c in e["checks"])): continue
            if e["role"] == ROLE_VIEJO: viejo += 1
            else:
                nuevo.append((r, e)); porRepo[r] += 1; porLang[e["language"]] += 1
    print(f"  sin traza: {faltan if faltan else 'ninguno'}")
    print(f"  candidatos `conditional-chain` que entran al required: {entran}")
    print(f"  sobreviven por la BANDERA vieja (variant=instantiates): {viejo}")
    print(f"  sobreviven por la VÍA NUEVA (árbol vivo): {len(nuevo)}   por repo {dict(porRepo.most_common())}   por lenguaje {dict(porLang.most_common())}")
    for r, e in nuevo:
        print(f"      {r:16s} {e['language']:11s} {e['file']}:{e['line']}  sym={e['symbol']}  estado={e['appliedState']}")
        print(f"          id-en-build={e['findingId']}")
