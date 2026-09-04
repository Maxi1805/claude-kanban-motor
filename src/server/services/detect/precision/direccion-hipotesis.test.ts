import { describe, expect, it } from "vitest";

import {
  claveBare,
  claveDirigida,
  desarmarClave,
  direccionCruda,
  direccionesDeFila,
} from "./direccion-hipotesis.js";

/** Un `place` mínimo, para no repetir el literal en cada caso. */
const lugar = (file: string, startLine: number, extra: { symbol?: string; role?: string; endLine?: number } = {}) => ({
  file,
  startLine,
  endLine: extra.endLine ?? startLine + 5,
  ...(extra.symbol !== undefined ? { symbol: extra.symbol } : {}),
  ...(extra.role !== undefined ? { role: extra.role } : {}),
});

describe("la dirección de una propuesta dentro de su fila", () => {
  it("EL DEFECTO QUE ARREGLA — sin dirección, N propuestas del mismo patrón en la misma fila comparten UNA clave", () => {
    // El caso testigo, medido: `click · long-function:_c7REnnTm-LveJA_ · Extract Method` cuelga
    // 14 `Extract Method / ausente` sobre 14 funciones distintas de `src/click/core.py`.
    // Con la clave vieja, las 14 son la MISMA cadena: 13 no se pueden nombrar, ni juzgar, ni contar.
    const id = "long-function:_c7REnnTm-LveJA_";
    const hipotesis = [340, 1477, 1991, 2292, 2723, 2944, 3228, 3376].map((linea) => ({
      pattern: "Extract Method",
      state: "ausente",
      places: [lugar("src/click/core.py", linea, { role: "función larga" })],
    }));
    const viejas = new Set(hipotesis.map((h) => claveBare(id, h.pattern)));
    expect(viejas.size).toBe(1);

    const nuevas = new Set(direccionesDeFila(hipotesis).map((d, i) => claveDirigida(id, d, hipotesis[i]!.pattern)));
    expect(nuevas.size).toBe(hipotesis.length);
  });

  it("ADITIVA — la clave vieja se sigue pudiendo escribir y no cambia ni un byte", () => {
    // La regla 2 de la ola escrita como aserción: la forma vieja es LITERALMENTE la de siempre.
    expect(claveBare("complexity:wMQ3hMsGADFtsB5h", "Extract Method")).toBe(
      "complexity:wMQ3hMsGADFtsB5h::Extract Method",
    );
  });

  it("LA DIRECCIÓN ES EL LUGAR ANCLA — el PRIMER `place`, no el mínimo ni el último", () => {
    // Medido: `places[0]` es el lugar que lleva el rol que describe la oportunidad ("archivo
    // candidato a fachada", "función larga"), y es el que abre quien juzga. Los demás son
    // colaboradores. Un caso real de `god-component::Facade` en `eslint` empieza en `linter.js`
    // y sigue por archivos que ordenan ANTES alfabéticamente: usar el mínimo cambiaría la
    // dirección a un archivo que no es el sujeto de la propuesta.
    const h = {
      pattern: "Facade",
      state: "ausente",
      places: [
        lugar("lib/linter/linter.js", 1, { role: "archivo candidato a fachada" }),
        lugar("lib/cli.js", 1, { role: "cliente que puentea la fachada" }),
      ],
    };
    expect(direccionCruda(h)).toBe("lib/linter/linter.js:1");
  });

  it("SIN `places` — cae a la ubicación de la FILA en vez de quedar sin dirección", () => {
    // Sin respaldo, TODAS las hipótesis sin `places` de una fila colapsarían en una sola clave:
    // el mismo defecto que este módulo cierra, un piso más abajo.
    const h = { pattern: "Builder", state: "ausente" };
    expect(direccionCruda(h, { file: "src/click/testing.py", startLine: 360 })).toBe("src/click/testing.py:360");
    expect(direccionCruda(h)).toBe("?:0");
  });

  it("DESEMPATE `#k` — dos propuestas del mismo patrón EN EL MISMO lugar siguen siendo dos claves", () => {
    // `hypothesisIdentityKey` deduplica por `(patrón, estado, places)`: dos hipótesis del mismo
    // patrón y los mismos `places` sobreviven sólo si difieren en el ESTADO. Es raro y es real,
    // y sin el desempate volverían a compartir clave.
    const hipotesis = [
      { pattern: "State", state: "parcial", places: [lugar("command.go", 1319, { symbol: "ResetCommands" })] },
      { pattern: "State", state: "ausente", places: [lugar("command.go", 1319, { symbol: "ResetCommands" })] },
    ];
    const ds = direccionesDeFila(hipotesis);
    expect(new Set(ds).size).toBe(2);
    expect(ds.every((d) => d.startsWith("command.go:1319#"))).toBe(true);
  });

  it("EL DESEMPATE NO DEPENDE DEL ORDEN DE EMISIÓN — la misma fila al revés da las mismas direcciones", () => {
    // Si dependiera del índice de emisión, cualquier cambio en el orden en que un builder cuelga
    // sus hipótesis movería direcciones que nadie tocó — y cada dirección movida cuesta
    // veredictos humanos (Ola AI: 52 claves de nivel 2 por un solo corrimiento de ids).
    const a = { pattern: "State", state: "parcial", places: [lugar("command.go", 1319)] };
    const b = { pattern: "State", state: "ausente", places: [lugar("command.go", 1319)] };
    const directo = direccionesDeFila([a, b]);
    const alReves = direccionesDeFila([b, a]);
    expect(directo).toEqual([alReves[1], alReves[0]]);
  });

  it("NO DESEMPATA LO QUE NO EMPATA — dos patrones DISTINTOS en el mismo lugar no llevan `#k`", () => {
    // La clave lleva el patrón como sufijo, así que dos patrones distintos en el mismo lugar YA
    // se distinguen. Ponerles `#k` sería mover una dirección sin ninguna ambigüedad que resolver.
    const hipotesis = [
      { pattern: "State", state: "ausente", places: [lugar("hugolib/page.go", 331)] },
      { pattern: "Strategy", state: "ausente", places: [lugar("hugolib/page.go", 331)] },
    ];
    expect(direccionesDeFila(hipotesis)).toEqual(["hugolib/page.go:331", "hugolib/page.go:331"]);
  });

  it("INERTE donde no hay empate — la dirección es exactamente `<archivo>:<línea>`, sin sufijo", () => {
    const hipotesis = [
      { pattern: "Extract Method", state: "ausente", places: [lugar("src/click/core.py", 340)] },
      { pattern: "Extract Method", state: "ausente", places: [lugar("src/click/core.py", 1477)] },
    ];
    expect(direccionesDeFila(hipotesis)).toEqual(["src/click/core.py:340", "src/click/core.py:1477"]);
  });

  it("UNA RUTA CON `@` NO ROMPE EL DESARMADO — y existe en el corpus", () => {
    // `eslint/docs/src/assets/js/css-vars-ponyfill@2.js` es un archivo REAL del corpus y aparece
    // como `place` de hipótesis. El separador es el PRIMER `@` de la izquierda porque un
    // `stableFindingId` es `<kind>:<16 base64url>` y no lleva `@`: cualquier `@` posterior es
    // parte de la ruta.
    const clave = claveDirigida("long-function:AbCdEfGhIjKlMnOp", "docs/src/assets/js/css-vars-ponyfill@2.js:12", "Extract Method");
    expect(desarmarClave(clave)).toEqual({
      id: "long-function:AbCdEfGhIjKlMnOp",
      direccion: "docs/src/assets/js/css-vars-ponyfill@2.js:12",
      pattern: "Extract Method",
    });
  });

  it("DESARMA LAS DOS FORMAS — y la vieja declara `direccion: null`, que es lo que la hace resoluble como antes", () => {
    expect(desarmarClave("type-switch:BEw5ABijzg9UO1Ba::Strategy")).toEqual({
      id: "type-switch:BEw5ABijzg9UO1Ba",
      direccion: null,
      pattern: "Strategy",
    });
  });

  it("EL PATRÓN SALE DEL ÚLTIMO `::` — igual que en el instrumento oficial, y por eso su línea no cambia", () => {
    // `Proxy (inicialización perezosa)` es el nombre que costó 12 propuestas verdaderas en la
    // Ola AE. Un patrón con paréntesis y espacios tiene que sobrevivir al desarmado intacto.
    const d = desarmarClave("repeated-access-control:2Ybrprrixw9qcxFD@src/a.ts:9::Proxy (inicialización perezosa)");
    expect(d?.pattern).toBe("Proxy (inicialización perezosa)");
    expect(d?.direccion).toBe("src/a.ts:9");
  });

  it("UNA CLAVE SIN `::` NO SE DESARMA — el instrumento la descartaría igual, pero acá se dice que no", () => {
    expect(desarmarClave("long-function:AbCdEfGhIjKlMnOp")).toBeNull();
  });
});
