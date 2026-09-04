#!/usr/bin/env python3
"""Carga los veredictos que el INTEGRADOR de la Ola O juzgó a mano.

Cada uno con su nota, todas prefijadas `ola O, integrador:` para que se
recuperen con un grep. Nunca pisa un veredicto ya cargado.
"""
import csv, os, sys

P = "tests/golden/precision"
PRE = "ola O, integrador: "

V = {
 # ── coupling-without-abstraction (n=2 -> 6), cubriendo go/python/java/typescript
 "coupling-without-abstraction:0X8kSyuBeAyUuCIJ": ("falso", PRE + "resources/kinds/kinds.go es un PAQUETE DE CONSTANTES Y PREDICADOS LIBRES (KindPage/KindHome + GetKindMain/GetKindAny/IsBranch); no declara ningun tipo con protocolo. 'Extract Interface' entre un namespace de funciones y template.go no tiene sentido. Es la unidad 'archivo como modulo' que N5 introdujo para poder LEER Go: le dio superficie a Go (5 -> 258 de censo) pero la superficie de un paquete de funciones libres no es un protocolo intercambiable."),
 "coupling-without-abstraction:3ic4fC6tPrHzs8s6": ("falso", PRE + "event/base.py (Events/_Dispatch, las clases base del mecanismo) y event/registry.py (el registro de listeners) son DOS CAPAS DEL MISMO SUBSISTEMA, no dos implementaciones intercambiables: el docstring de cada una lo dice. Que 13 archivos usen las dos es la definicion de un subsistema con dos piezas, no acoplamiento sin abstraccion."),
 "coupling-without-abstraction:PbnuFrcQluuoD-fN": ("falso", PRE + "com.google.common.reflect.Invokable y Parameter son TODO y PARTE: Parameter es el value object que describe UN parametro de un Invokable, y lo devuelve Invokable.getParameters(). Una relacion de composicion no se refactoriza extrayendo una interfaz comun."),
}

# (slug, kind, file, startLine) -> (verdict, note)   — para las filas cuyo id copie a mano
BY_LOC = {
 ("nest", "coupling-without-abstraction", "packages/core/injector/container.ts"): ("falso", PRE + "NestContainer y Module son TODO y PARTE dentro del inyector de dependencias: el container POSEE los modules (container.getModules()). Que 10 archivos toquen los dos es la forma normal de usar un contenedor, no dos implementaciones que pidan una interfaz comun."),
 ("rubocop", "dependency-cycle", "lib/rubocop/cop/layout/dot_position.rb"): ("falso", PRE + "VERIFICADO EN EL CODIGO: dot_position.rb:30 declara `def self.autocorrect_incompatible_with; [Style::RedundantSelf]` y redundant_self.rb:56 declara `[ColonMethodCall, Layout::DotPosition]`. Es METADATA DECLARATIVA BIDIRECCIONAL que el framework EXIGE (dos cops que se declaran mutuamente incompatibles); el consejo del hallazgo ('elegi una direccion y eliminala') romperia el contrato. Familia nombrada por N4 en su informe §5."),
 ("nest", "dependency-cycle", "packages/core/inspector/interfaces/serialized-graph-json.interface.ts"): ("verdadero", PRE + "VERIFICADO EN EL CODIGO: serialized-graph-json.interface.ts:1 importa SerializedGraphStatus de '../serialized-graph', y serialized-graph.ts:19 importa SerializedGraphJson de './interfaces/serialized-graph-json.interface'. Import circular REAL y declarado, que ademas cruza carpeta (inspector <-> inspector/interfaces). Riesgo bajo (los dos son de tipos, que TypeScript borra al compilar) pero la afirmacion del hallazgo es cierta y la accion es concreta: mover SerializedGraphStatus a interfaces/."),
 ("jekyll", "dependency-cycle", "lib/jekyll/commands/doctor.rb"): ("falso", PRE + "CICLO FABRICADO, media arista verificada: doctor.rb:23 si usa Jekyll::Site (`Jekyll::Site.new(...)`), pero site.rb NO nombra Doctor en ninguna linea (grep sobre el archivo entero: cero ocurrencias). La arista de vuelta la puso la resolucion por nombre, no el codigo. Sobrevive a los tres arreglos de N4."),
 ("guava", "empty-catch", "android/guava/src/com/google/common/cache/Striped64.java"): ("falso", PRE + "VERIFICADO EN EL CODIGO (Striped64.java:294-299): `catch (SecurityException tryReflectionInstead) { }` — el error NO desaparece en silencio: el NOMBRE DE LA VARIABLE es la documentacion del camino alternativo y las lineas siguientes lo ejecutan (AccessController.doPrivileged + reflexion). Ademas es codigo VENDORIZADO de JSR-166 (Doug Lea, dominio publico), justo la familia que el criterio 2 de N10 detecta y que quedo sin cablear."),
 ("eslint", "layer-skip", "tools/check-rule-examples.js"): ("verdadero", PRE + "VERIFICADO EN EL CODIGO: tools/check-rule-examples.js:348 hace `require('../lib/cli-engine/formatters/stylish')` — un script de herramientas alcanza 3 niveles adentro de lib/ para reusar un formateador interno, cuando el mismo archivo ya consume la superficie publica (`require('../lib/linter')`, `require('../lib/rules')`). Mover o renombrar cli-engine/formatters/ rompe esta herramienta. Es exactamente lo que el hallazgo afirma."),
 ("guava", "parallel-hierarchies", "android/guava/src/com/google/common/collect/AbstractMapBasedMultimap.java"): ("falso", PRE + "SIGUE EMPAREJANDOSE CONSIGO MISMO: el detail lista 'android/guava/src/com/google/common/collect/AbstractMapBasedMultimap.java, android/guava/src/com/google/common/collect/AbstractMapBasedMultimap.java' — el MISMO archivo dos veces, con ruta completa (o sea que la desambiguacion de basename de N11 esta puesta y el bug de fondo no era el basename). El dedupe por conjunto de symbolPath de N11 no alcanza cuando las dos 'jerarquias' son dos clases anidadas distintas DEL MISMO archivo."),
 ("guava", "parallel-hierarchies", "android/guava-testlib/src/com/google/common/collect/testing/Helpers.java"): ("falso", PRE + "11 jerarquias de 3 miembros cada una 'con la misma forma'. Con 3 miembros la forma (tamano + raices + ramificacion) es una coincidencia estadistica en un repo de 1.971 archivos, no evidencia de jerarquias paralelas. Es el riesgo que el propio docstring del modulo declara ('forma = firma de grados, no isomorfismo real')."),
 ("guava", "parallel-hierarchies", "android/guava-testlib/src/com/google/common/collect/testing/google/TestStringBiMapGenerator.java"): ("falso", PRE + "10 jerarquias de 4 miembros 'con la misma forma', ejemplos BiMapGenerators.java / FinalizablePhantomReference.java / Dispatcher.java: tres familias de dominios completamente ajenos (generadores de test, referencias debiles, despacho de eventos). Misma raiz que el anterior: la firma de grados no es isomorfismo."),
 ("guava", "parallel-hierarchies", "android/guava/src/com/google/common/util/concurrent/ClosingFuture.java"): ("falso", PRE + "ClosingFuture.java y AbstractFutureState.java: dos jerarquias de 5 miembros del MISMO paquete util.concurrent pero sin ninguna relacion de forma real (una es la maquina de estados de un future que cierra recursos, la otra el estado interno de AbstractFuture). Coincidencia de tamano."),
 ("click", "speculative-abstraction", "examples/aliases/aliases.py"): ("falso", PRE + "BUG DE DIRECCION, verificado en el codigo: aliases.py:37 declara `class AliasedGroup(click.Group)` — AliasedGroup EXTIENDE Group. El hallazgo dice lo contrario ('AliasedGroup tiene un unico implementador: Group'), o sea que invierte base y derivada. Ademas Group es una clase publica de click instanciada directamente en todo el ecosistema: no es una abstraccion especulativa."),
 ("click", "speculative-abstraction", "src/click/exceptions.py"): ("falso", PRE + "BadParameter (exceptions.py:114) es API PUBLICA DOCUMENTADA de click ('.. versionadded:: 2.0'), pensada para que el USUARIO la lance desde sus callbacks (`raise click.BadParameter(...)`). Que dentro del repo tenga una sola subclase (MissingParameter) no la vuelve especulativa: sus implementadores viven fuera del repo, por diseno."),
 ("guava", "speculative-abstraction", "guava/src/com/google/common/base/ExtraObjectsMethodsForWeb.java"): ("falso", PRE + "ExtraObjectsMethodsForWeb es un shim de la variante GWT/web cuyo unico proposito declarado es aportarle metodos extra a Objects en esa plataforma. Su unico 'implementador' es exactamente el tipo para el que existe: la relacion 1-a-1 es el diseno, no una abstraccion esperando un segundo implementador."),
 ("hugo", "unreachable-code", "internal/warpc/js/common.js"): ("verdadero", PRE + "VERIFICADO EN EL CODIGO (internal/warpc/js/common.js): `if (bytesRead < 0) { throw new Error('Error reading from stdin'); break; }` — el `break` esta despues de un `throw` incondicional en el mismo bloque, sin hoisting ni declaracion de tipo de por medio. Codigo muerto real, chico pero cierto, y el arreglo es borrar una linea."),
}


def main() -> int:
    total = 0
    for fname in sorted(os.listdir(P)):
        if not fname.endswith(".verdicts.csv"):
            continue
        path = os.path.join(P, fname)
        with open(path, newline="") as fh:
            rd = csv.DictReader(fh)
            cols = rd.fieldnames
            rows = list(rd)
        changed = 0
        for r in rows:
            if r["verdict"] or r.get("stillPresent") != "true":
                continue
            key = (r["slug"], r["kind"], r["file"])
            if r["id"] in V:
                verdict, note = V.pop(r["id"])
            elif key in BY_LOC:
                verdict, note = BY_LOC.pop(key)
            else:
                continue
            r["verdict"] = verdict
            r["note"] = note
            changed += 1
            total += 1
            print(f"  {r['kind']:30s} {r['slug']:16s} {r['file']}:{r['startLine']} -> {verdict}")
        if changed:
            with open(path, "w", newline="") as fh:
                w = csv.DictWriter(fh, fieldnames=cols)
                w.writeheader()
                w.writerows(rows)
            print(f"[{fname}] {changed} veredicto(s) cargado(s)")
    print(f"TOTAL {total}")
    if BY_LOC or V:
        print("SIN UBICAR:", list(BY_LOC.keys()), list(V.keys()))
    return 0


sys.exit(main())
