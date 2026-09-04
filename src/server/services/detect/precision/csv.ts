/**
 * CSV mínimo, RFC4180 — sin dependencia externa (no hay ninguna en
 * `package.json`, ver el docstring de `verdicts-io.ts`). Comillas dobles
 * para escapar comas/comillas/saltos de línea, `""` para una comilla
 * literal dentro de un campo entrecomillado. Sólo lo que la planilla de
 * precisión necesita: codificar filas y decodificar un archivo completo a
 * registros alineados con un encabezado.
 */

export function encodeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function encodeCsvRow(fields: readonly string[]): string {
  return fields.map(encodeCsvField).join(",");
}

export function encodeCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [encodeCsvRow(header), ...rows.map(encodeCsvRow)].map((line) => line + "\r\n").join("");
}

/** Parsea el texto completo de un CSV a `{header, records}` — cada registro es `string[]` alineado posicionalmente con `header`. Archivo vacío ⇒ `{header: [], records: []}`. */
export function parseCsv(text: string): { header: string[]; records: string[][] } {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { header: [], records: [] };
  const [header, ...records] = rows;
  return { header, records };
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnything = false;
  let i = 0;
  const n = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      sawAnything = true;
      i++;
      continue;
    }
    if (c === ",") {
      pushField();
      sawAnything = true;
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    } // el \n que sigue cierra la fila — \r solo se descarta
    if (c === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += c;
    sawAnything = true;
    i++;
  }
  // Última fila si el archivo no termina en salto de línea (o si el
  // contenido entero es un único campo sin ningún terminador).
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }
  if (!sawAnything && rows.length <= 1) return [];
  return rows;
}
