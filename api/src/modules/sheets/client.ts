import { JWT } from "google-auth-library";
import { env } from "../../config/env";
import type { SheetsCell, SheetsExportKind } from "./model";
import { sheetHeader } from "./columns";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

// Una pestaña por estado final: asi la suma de "Total" en la de entregados es lo vendido de verdad.
const SHEET_TABS: Record<SheetsExportKind, () => string> = {
  ENTREGADO: () => env.googleSheets.sheetName,
  CANCELADO: () => env.googleSheets.cancelledSheetName,
};

export function sheetTab(kind: SheetsExportKind) {
  return SHEET_TABS[kind]();
}

export function isSheetsConfigured() {
  const { spreadsheetId, serviceAccountEmail, serviceAccountKey } = env.googleSheets;
  return !!(spreadsheetId && serviceAccountEmail && serviceAccountKey);
}

let client: JWT | null = null;
function getClient() {
  if (!client) {
    client = new JWT({
      email: env.googleSheets.serviceAccountEmail!,
      key: env.googleSheets.serviceAccountKey!,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }
  return client;
}

function spreadsheetUrl(path = "") {
  return `${SHEETS_API}/${encodeURIComponent(env.googleSheets.spreadsheetId!)}${path}`;
}

/** Rango en notacion A1 dentro de una pestaña (las comillas simples del nombre se duplican). */
function range(tab: string, a1: string) {
  return encodeURIComponent(`'${tab.replace(/'/g, "''")}'!${a1}`);
}

// Cada pestaña y su cabecera se comprueban una vez por proceso; si falla, se reintenta la siguiente vez.
const sheetReady = new Map<SheetsExportKind, Promise<void>>();

/** Crea la pestaña y la cabecera si faltan. Sirve tambien para validar la configuracion al arrancar. */
export function ensureSheet(kind: SheetsExportKind) {
  let ready = sheetReady.get(kind);
  if (!ready) {
    const header = sheetHeader(kind);
    const tab = sheetTab(kind);
    ready = (async () => {
      const api = getClient();
      const { data } = await api.request<{ sheets: { properties: { title: string; sheetId: number } }[] }>({
        url: spreadsheetUrl("?fields=sheets.properties(title,sheetId)"),
      });
      let sheetId = data.sheets.find((s) => s.properties.title === tab)?.properties.sheetId;
      if (sheetId === undefined) {
        const created = await api.request<{ replies: { addSheet: { properties: { sheetId: number } } }[] }>({
          url: spreadsheetUrl(":batchUpdate"),
          method: "POST",
          data: { requests: [{ addSheet: { properties: { title: tab } } }] },
        });
        sheetId = created.data.replies[0].addSheet.properties.sheetId;
      }

      const current = await api.request<{ values?: SheetsCell[][] }>({ url: spreadsheetUrl(`/values/${range(tab, "A1:1")}`) });
      const currentHeader = current.data.values?.[0] ?? [];
      if (!currentHeader.length) {
        await api.request({
          url: spreadsheetUrl(`/values/${range(tab, "A1")}?valueInputOption=RAW`),
          method: "PUT",
          data: { values: [header] },
        });
      } else {
        await reorderColumns(tab, sheetId, currentHeader.map(String), header);
      }
    })().catch((err) => {
      sheetReady.delete(kind);
      throw err;
    });
    sheetReady.set(kind, ready);
  }
  return ready;
}

/**
 * Si la cabecera de la hoja tiene las mismas columnas que `header` pero en otro orden, mueve
 * columnas enteras hasta que coincidan: las filas ya escritas y el formato se conservan.
 * Si las columnas no son las mismas (renombradas a mano, etc.) no se toca nada y se avisa.
 */
async function reorderColumns(tab: string, sheetId: number, currentHeader: string[], header: string[]) {
  if (currentHeader.join("\t") === header.join("\t")) return;
  const unknown = currentHeader.filter((title) => !header.includes(title));
  if (unknown.length || new Set(currentHeader).size !== currentHeader.length) {
    console.warn(`[sheets] la cabecera de "${tab}" no coincide con la esperada; no se reordena`, { currentHeader, header });
    return;
  }

  // Columnas nuevas (p. ej. "Origen"): se añaden al final de la cabecera y luego se colocan en su
  // sitio con el resto. Las filas ya escritas quedan con esa celda vacia.
  const missing = header.filter((title) => !currentHeader.includes(title));
  if (missing.length) {
    await getClient().request({
      url: spreadsheetUrl(`/values/${range(tab, `${columnLetter(currentHeader.length)}1`)}?valueInputOption=RAW`),
      method: "PUT",
      data: { values: [missing] },
    });
    console.log(`[sheets] columnas añadidas a "${tab}": ${missing.join(", ")}`);
  }
  const current = [...currentHeader, ...missing];
  if (current.join("\t") === header.join("\t")) return;

  // De izquierda a derecha: la columna que toca en la posicion i siempre esta a su derecha (j > i),
  // asi que destinationIndex = i vale tambien en coordenadas previas al movimiento.
  const cols = [...current];
  const requests = [];
  for (let i = 0; i < header.length; i++) {
    const j = cols.indexOf(header[i]);
    if (j === i) continue;
    requests.push({
      moveDimension: { source: { sheetId, dimension: "COLUMNS", startIndex: j, endIndex: j + 1 }, destinationIndex: i },
    });
    cols.splice(i, 0, ...cols.splice(j, 1));
  }

  await getClient().request({ url: spreadsheetUrl(":batchUpdate"), method: "POST", data: { requests } });
  console.log(`[sheets] columnas de "${tab}" reordenadas: ${header.join(", ")}`);
}

function columnLetter(index: number) {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/**
 * Sustituye el valor de la columna `targetTitle` en las filas cuya columna `matchTitle` vale
 * `matchValue` (p. ej. el nombre de un cliente, buscando por su codigo). Devuelve cuantas cambio.
 * Las columnas se buscan por su titulo en la cabecera, no por posicion.
 */
export async function replaceInRows(
  kind: SheetsExportKind,
  matchTitle: string,
  matchValue: string,
  targetTitle: string,
  replacement: string
) {
  await ensureSheet(kind);
  const tab = sheetTab(kind);
  const { data } = await getClient().request<{ values?: SheetsCell[][] }>({
    url: spreadsheetUrl(`/values/${range(tab, "A:ZZ")}`),
  });
  const [header = [], ...rows] = data.values ?? [];
  const matchCol = header.indexOf(matchTitle);
  const targetCol = header.indexOf(targetTitle);
  if (matchCol < 0 || targetCol < 0) throw new Error(`"${tab}" no tiene las columnas "${matchTitle}" y "${targetTitle}"`);

  const updates = rows.flatMap((row, i) =>
    String(row[matchCol] ?? "") === matchValue && row[targetCol] !== replacement
      ? [{ range: `'${tab.replace(/'/g, "''")}'!${columnLetter(targetCol)}${i + 2}`, values: [[replacement]] }]
      : []
  );
  if (updates.length) {
    await getClient().request({
      url: spreadsheetUrl("/values:batchUpdate"),
      method: "POST",
      data: { valueInputOption: "RAW", data: updates },
    });
  }
  return updates.length;
}

/**
 * Rellena las celdas vacias de la columna `targetTitle` con el valor que corresponda al
 * "ID pedido" de cada fila (p. ej. una columna nueva en filas escritas antes de existir).
 * Las filas cuyo pedido no esta en `valueByOrderId` se dejan como estan. Devuelve cuantas cambio.
 */
export async function fillEmptyCells(kind: SheetsExportKind, targetTitle: string, valueByOrderId: Map<string, string>) {
  await ensureSheet(kind);
  const tab = sheetTab(kind);
  const { data } = await getClient().request<{ values?: SheetsCell[][] }>({
    url: spreadsheetUrl(`/values/${range(tab, "A:ZZ")}`),
  });
  const [header = [], ...rows] = data.values ?? [];
  const idCol = header.indexOf("ID pedido");
  const targetCol = header.indexOf(targetTitle);
  if (idCol < 0 || targetCol < 0) throw new Error(`"${tab}" no tiene las columnas "ID pedido" y "${targetTitle}"`);

  const updates = rows.flatMap((row, i) => {
    const value = valueByOrderId.get(String(row[idCol] ?? ""));
    return value && !String(row[targetCol] ?? "")
      ? [{ range: `'${tab.replace(/'/g, "''")}'!${columnLetter(targetCol)}${i + 2}`, values: [[value]] }]
      : [];
  });
  if (updates.length) {
    await getClient().request({
      url: spreadsheetUrl("/values:batchUpdate"),
      method: "POST",
      data: { valueInputOption: "USER_ENTERED", data: updates },
    });
  }
  return updates.length;
}

/** Añade las filas al final de la pestaña correspondiente, en el mismo orden en que llegan. */
export async function appendRows(kind: SheetsExportKind, rows: SheetsCell[][]) {
  await ensureSheet(kind);
  await getClient().request({
    url: spreadsheetUrl(`/values/${range(sheetTab(kind), "A:A")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`),
    method: "POST",
    data: { values: rows },
  });
}
