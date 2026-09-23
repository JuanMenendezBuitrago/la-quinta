/**
 * Genera con Gemini una imagen por producto de la carta que aun no tenga foto.
 * Guarda los PNG en api/generated-images/<id>.png para revisarlos antes de asignarlos
 * (ver apply-images.sh). No toca la base de datos.
 *
 * Uso (desde la raiz del proyecto):
 *   set -a; . ./.env.gemini; set +a
 *   node api/src/scripts/generate-images.mjs [--limit N] [--only "nombre1,nombre2"] [--force]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../generated-images");
const API = process.env.GRAPHQL_URL || "http://localhost:4000/graphql";
const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) throw new Error("Falta GEMINI_API_KEY");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const limit = opt("--limit") ? Number(opt("--limit")) : Infinity;
const only = opt("--only")?.split(",").map((s) => s.trim().toLowerCase());

// Productos que no tiene sentido fotografiar.
const SKIP = /^(empaque|adici[oó]n|opci[oó]n leche)/i;

const STYLE =
  "Professional food and beverage photography for a specialty coffee shop menu. " +
  "Square 1:1 composition, single hero product centered, shot from a slight 3/4 overhead angle, " +
  "soft natural window light, shallow depth of field, appetizing and fresh. " +
  "Warm cream background (#faf6ce) on a light wooden or ceramic surface, subtle teal (#9ad2d0) and caramel-brown accents in props. " +
  "Props only if they relate to the product itself (no coffee beans unless the product contains coffee). No text, no logos, no watermarks, no people, no hands.";

// Pistas de presentacion por categoria para que el resultado sea reconocible.
const CATEGORY_HINT = {
  "Bebidas Calientes": "served in a ceramic cup and saucer",
  "Bebidas Especiales": "served in a glass, garnished attractively",
  "Bebidas Frías": "served in a tall glass with ice or cream, condensation visible",
  "Té / Infusiones": "served in a glass or ceramic teapot setup, steam rising",
  "Jugos Naturales": "served in a glass with fresh fruit pieces beside it",
  "Métodos de Café": "the brewing device with freshly brewed coffee, on a coffee bar",
  "Platos Especiales": "plated on a ceramic plate, freshly prepared",
  "Bebidas Sin Alcohol": "the bottle or glass, cold, with condensation",
  "Bebidas Con Alcohol": "the bottle or glass, cold, with condensation",
  "Horneados & Dulces": "freshly baked, on a small plate or wooden board",
  "Cócteles": "served in the proper cocktail glass, with a garnish",
};

async function gql(query) {
  const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) });
  return (await res.json()).data;
}

async function generate(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error("La respuesta no trajo imagen: " + JSON.stringify(json).slice(0, 300));
  return Buffer.from(part.inlineData.data, "base64");
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const { menu } = await gql("{ menu { name items { id name description imageUrl } } }");

const todo = [];
for (const cat of menu) {
  for (const item of cat.items) {
    if (item.imageUrl || SKIP.test(item.name)) continue;
    if (only && !only.includes(item.name.toLowerCase())) continue;
    if (!flag("--force") && fs.existsSync(path.join(OUT_DIR, `${item.id}.png`))) continue;
    todo.push({ cat: cat.name, ...item });
  }
}

console.log(`Modelo ${MODEL}: ${Math.min(todo.length, limit)} de ${todo.length} pendientes`);
let done = 0;
for (const item of todo.slice(0, limit)) {
  const prompt = `${item.name}${item.description ? ` (${item.description})` : ""} — ${CATEGORY_HINT[item.cat] ?? ""}. ${STYLE}`;
  try {
    fs.writeFileSync(path.join(OUT_DIR, `${item.id}.png`), await generate(prompt));
    fs.writeFileSync(path.join(OUT_DIR, `${item.id}.txt`), item.name);
    console.log(`ok   ${item.name}`);
    done++;
  } catch (e) {
    console.log(`FAIL ${item.name}: ${e.message}`);
  }
}
console.log(`Generadas ${done}. Revisa api/generated-images/`);
