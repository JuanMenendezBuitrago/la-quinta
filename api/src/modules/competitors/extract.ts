import dns from "dns/promises";
import fs from "fs/promises";
import net from "net";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { env } from "../../config/env";
import { MenuCategory, MenuItem } from "../menu/model";
import { UPLOAD_DIR } from "../uploads/router";
import { COMPETITOR_UPLOAD_PREFIX, CompetitorDoc, CompetitorItemDoc, CompetitorSourceDoc } from "./model";

/**
 * Lectura del menu de una cafeteria con Claude: junta sus fuentes (paginas web, PDF, fotos), le
 * pasa nuestra carta y le pide la lista de productos con su precio y, si lo hay, el producto
 * nuestro equivalente. La respuesta viene con un esquema fijo (structured outputs), asi que no
 * hay que interpretar texto libre.
 */

const MODEL = "claude-opus-5-5";
const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // limite de la API por imagen
const MAX_PAGE_CHARS = 120_000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

export function aiEnabled() {
  return !!env.anthropicApiKey;
}

let client: Anthropic | null = null;
function anthropic() {
  if (!env.anthropicApiKey) throw new Error("Falta configurar la clave de la API de Anthropic (ANTHROPIC_API_KEY)");
  client ??= new Anthropic({ apiKey: env.anthropicApiKey, timeout: 5 * 60_000 });
  return client;
}

// ---------- Descarga de paginas: solo direcciones publicas ----------

/** Direcciones que no son de internet (red local, el propio servidor...): no se descargan. */
function isPrivateAddress(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  return lower === "::" || lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

async function assertPublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`La dirección no es válida: ${raw}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Solo se pueden leer direcciones http o https");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error(`No se puede leer ${url.hostname}: no es una dirección pública`);
  return url;
}

/** Descarga una direccion siguiendo como mucho unas pocas redirecciones, cada una comprobada. */
async function download(raw: string) {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LaQuintaPrecios/1.0)", Accept: "text/html,application/pdf,image/*;q=0.9,*/*;q=0.5" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    if (!res.ok) throw new Error(`${url.hostname} respondió ${res.status}`);
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_PDF_BYTES) throw new Error(`${url.hostname}: el archivo es demasiado grande`);
    return { type, bytes, finalUrl: url.toString() };
  }
  throw new Error("Demasiadas redirecciones");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Texto legible de una pagina HTML: sin scripts ni estilos, con saltos donde habia bloques. */
function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/li|\/tr|\/h[1-6]|\/div|\/section|\/article|\/td|\/th)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function blockFor(type: string, bytes: Buffer, label: string): BetaContentBlockParam[] {
  if (type === "application/pdf") {
    return [
      { type: "text", text: `Menú en PDF (${label}):` },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } },
    ];
  }
  if ((IMAGE_TYPES as readonly string[]).includes(type)) {
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`${label}: la imagen pesa más de 5 MB`);
    return [
      { type: "text", text: `Foto o imagen del menú (${label}):` },
      { type: "image", source: { type: "base64", media_type: type as ImageType, data: bytes.toString("base64") } },
    ];
  }
  if (type.startsWith("text/") || type === "application/xhtml+xml" || type === "") {
    const text = htmlToText(bytes.toString("utf8")).slice(0, MAX_PAGE_CHARS);
    if (text.length < 40) throw new Error(`${label}: la página no tiene texto que leer (quizá el menú es una imagen: sube una foto)`);
    return [{ type: "text", text: `Texto de la página ${label}:\n<pagina>\n${text}\n</pagina>` }];
  }
  throw new Error(`${label}: tipo de archivo no soportado (${type})`);
}

async function sourceBlocks(source: CompetitorSourceDoc) {
  if (source.kind === "url" && source.url) {
    const { type, bytes, finalUrl } = await download(source.url);
    return blockFor(type, bytes, finalUrl);
  }
  if (source.kind === "file" && source.filePath?.startsWith(COMPETITOR_UPLOAD_PREFIX)) {
    const name = path.basename(source.filePath);
    const bytes = await fs.readFile(path.join(UPLOAD_DIR, "competitors", name));
    return blockFor(source.mimeType ?? "", bytes, source.fileName || name);
  }
  throw new Error("Fuente del menú no válida");
}

// ---------- Claude ----------

const ExtractionSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      size: z.string().nullable(),
      category: z.string().nullable(),
      priceCents: z.number().int(),
      matchMenuItemId: z.string().nullable(),
    })
  ),
  notes: z.string().nullable(),
});
export type ExtractedItem = z.infer<typeof ExtractionSchema>["items"][number];

const SYSTEM = `Lees cartas de cafeterías de Colombia (precios en pesos colombianos) para que La Quinta, una cafetería de especialidad de Medellín, compare sus precios con los de la competencia.

Devuelve cada producto que tenga un precio visible:
- name: el nombre tal como aparece en la carta (sin el tamaño).
- size: el tamaño o presentación si la carta lo indica ("8 oz", "12 oz", "grande", "250 g"...); null si no lo hay. Si un producto tiene varios tamaños con precios distintos, devuelve una entrada por tamaño.
- category: la sección de la carta en la que está ("Bebidas calientes", "Postres"...), o null.
- priceCents: el precio en pesos, como número entero sin separadores ("$8.500", "8,500" y "8.5 mil" son 8500). Hay cartas que abrevian los miles ("8.5" o "12" en una lista donde todo cuesta miles): conviértelos a pesos. Ningún producto de cafetería cuesta menos de 500 pesos.
- matchMenuItemId: el id del producto de la carta de La Quinta que sea el mismo producto (misma bebida o comida, y de tamaño comparable si ambos lo indican), o null si no hay ninguno equivalente o tienes dudas. No emparejes productos distintos aunque se parezcan (un latte no es un capuchino; un café filtrado no es un americano de máquina). Varios productos de la competencia pueden emparejarse con el mismo nuestro (por ejemplo, sus distintos tamaños).

No inventes productos ni precios: si algo no se lee bien, déjalo fuera y explícalo en notes.
notes: una o dos frases en español con lo que convenga saber de la lectura (partes ilegibles, precios dudosos, menú incompleto), o null si no hay nada que avisar.`;

async function ourMenuText() {
  const [items, categories] = await Promise.all([
    MenuItem.find().select("name priceCents categoryId available").lean(),
    MenuCategory.find().select("name").lean(),
  ]);
  const categoryName = new Map(categories.map((c) => [c._id.toString(), c.name]));
  const lines = items
    .map((i) => `${i._id.toString()} | ${categoryName.get(i.categoryId.toString()) ?? "-"} | ${i.name} | ${i.priceCents}`)
    .sort();
  return { text: lines.join("\n"), ids: new Set(items.map((i) => i._id.toString())) };
}

/**
 * Lee todas las fuentes de una cafeteria y devuelve los productos encontrados. Lanza un error con
 * un mensaje legible si alguna fuente no se puede leer o si Claude no devuelve un resultado.
 */
export async function extractMenu(competitor: Pick<CompetitorDoc, "name" | "sources">) {
  if (!competitor.sources.length) throw new Error("Añade primero un enlace o un archivo con su menú");
  const blocks: BetaContentBlockParam[] = [];
  for (const source of competitor.sources) blocks.push(...(await sourceBlocks(source)));
  const menu = await ourMenuText();

  blocks.push({
    type: "text",
    text: `Esta es la carta de La Quinta (id | categoría | producto | precio en pesos):\n<carta_la_quinta>\n${menu.text}\n</carta_la_quinta>\n\nExtrae los productos y precios del menú de la cafetería «${competitor.name}» que tienes arriba y emparéjalos con los de La Quinta.`,
  });

  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // Si el modelo declina la peticion (falso positivo de sus filtros), la API la repite sola con
    // otro modelo adecuado en la misma llamada.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(ExtractionSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: blocks }],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude no ha querido leer este menú. Prueba con otra fuente.");
  if (response.stop_reason === "max_tokens") throw new Error("El menú es demasiado largo para leerlo de una vez: divídelo en varias fuentes más pequeñas");
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("No se pudo interpretar la respuesta de Claude");

  const items = parsed.items
    .filter((i) => i.name.trim() && i.priceCents >= 100)
    .map((i) => ({
      name: i.name.trim().slice(0, 160),
      size: i.size?.trim().slice(0, 40) || undefined,
      category: i.category?.trim().slice(0, 80) || undefined,
      priceCents: Math.round(i.priceCents),
      // Solo ids que existen en nuestra carta
      menuItemId: i.matchMenuItemId && menu.ids.has(i.matchMenuItemId) ? i.matchMenuItemId : null,
    }));
  return { items, notes: parsed.notes?.trim() || null };
}

const key = (i: { name: string; size?: string | null }) =>
  `${i.name}|${i.size ?? ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Productos tras una lectura nueva: los añadidos a mano se quedan; los demas se sustituyen por los
 * leidos, conservando el emparejamiento confirmado y anotando el precio anterior si cambio.
 */
export function mergeItems(previous: CompetitorItemDoc[], extracted: Awaited<ReturnType<typeof extractMenu>>["items"], now = new Date()) {
  const before = new Map(previous.filter((i) => !i.manual).map((i) => [key(i), i]));
  const merged = extracted.map((item) => {
    const old = before.get(key(item));
    const confirmed = !!old?.matchConfirmed;
    const changed = old && old.priceCents !== item.priceCents;
    return {
      name: item.name,
      size: item.size,
      category: item.category,
      priceCents: item.priceCents,
      menuItemId: confirmed ? old!.menuItemId ?? null : item.menuItemId,
      matchConfirmed: confirmed,
      manual: false,
      previousPriceCents: changed ? old!.priceCents : old?.previousPriceCents,
      priceChangedAt: changed ? now : old?.priceChangedAt,
    };
  });
  return [...previous.filter((i) => i.manual), ...merged];
}
