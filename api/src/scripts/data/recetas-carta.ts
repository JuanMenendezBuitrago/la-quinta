/**
 * Insumos y recetas de la carta, pasados a mano desde la hoja de costeo
 * ("RECETA COSTOS Y PRECIOS - LA QUINTA CAFÉ", pestaña "costeo"). Cantidades por UNA unidad
 * de producto, en la unidad base del insumo (g, ml o ud).
 *
 * Criterios (decididos con el negocio):
 * - Vasos, tapas, mezcladores y servilletas: solo en pedidos para llevar y web (T).
 * - Leche: "deslactosada" donde la hoja lo dice; "leche" a secas = leche entera.
 * - Se omite lo que no es un insumo contable: licuadora, horneada, tiempo de extraccion,
 *   "proceso, frio y envasado", agua, y el kit "huevo, sal, leche, servilleta, desmol" de horneado.
 * - "vaso, azucar, mezclador" = 1 vaso de bebida caliente (T) + 1 sobre de azucar + 1 mezclador (T).
 * - Hielo en palas (ud); "hielo" sin cantidad = 1 pala.
 * - Las cantidades marcadas con "estimado" no vienen en la hoja: se dedujeron del coste de la
 *   linea o son una porcion habitual. Conviene revisarlas en el panel (Inventario -> Recetas).
 */
import type { SupplyUnit } from "../../modules/inventory/model";

export interface SupplySeed {
  name: string;
  unit: SupplyUnit;
  category: string;
}

export const SUPPLIES: SupplySeed[] = [
  // Café
  { name: "Café en grano", unit: "g", category: "Café" },
  { name: "Filtro Chemex", unit: "ud", category: "Café" },
  { name: "Filtro Hario V60", unit: "ud", category: "Café" },
  { name: "Filtro Clever #2", unit: "ud", category: "Café" },
  // Lácteos y fríos
  { name: "Leche deslactosada", unit: "ml", category: "Lácteos" },
  { name: "Leche entera", unit: "ml", category: "Lácteos" },
  { name: "Leche en polvo", unit: "g", category: "Lácteos" },
  { name: "Crema chantilly", unit: "g", category: "Lácteos" },
  { name: "Helado", unit: "g", category: "Lácteos" },
  { name: "Queso búfala", unit: "ud", category: "Lácteos" },
  { name: "Queso Filadelfia", unit: "g", category: "Lácteos" },
  { name: "Sour cream", unit: "g", category: "Lácteos" },
  { name: "Hielo (palas)", unit: "ud", category: "Lácteos" },
  // Chocolate, siropes y dulces
  { name: "Cocoa en polvo", unit: "g", category: "Siropes y dulces" },
  { name: "Chocolate Hershey's líquido", unit: "ml", category: "Siropes y dulces" },
  { name: "Crema de chocolate", unit: "g", category: "Siropes y dulces" },
  { name: "Nutella", unit: "g", category: "Siropes y dulces" },
  { name: "Mermelada de frutos rojos", unit: "g", category: "Siropes y dulces" },
  { name: "Mantequilla de maní", unit: "g", category: "Siropes y dulces" },
  { name: "Sirope de maple", unit: "ml", category: "Siropes y dulces" },
  { name: "Almíbar", unit: "ml", category: "Siropes y dulces" },
  { name: "Almíbar de fresa", unit: "ml", category: "Siropes y dulces" },
  { name: "Almíbar de cereza", unit: "ml", category: "Siropes y dulces" },
  { name: "Milo", unit: "g", category: "Siropes y dulces" },
  { name: "Panela", unit: "g", category: "Siropes y dulces" },
  { name: "Azúcar en sobre", unit: "ud", category: "Siropes y dulces" },
  { name: "Azúcar", unit: "g", category: "Siropes y dulces" },
  { name: "Azúcar pulverizada", unit: "g", category: "Siropes y dulces" },
  // Tés e infusiones
  { name: "Matcha", unit: "g", category: "Tés e infusiones" },
  { name: "Té chai", unit: "g", category: "Tés e infusiones" },
  { name: "Frutos amarillos (infusión)", unit: "g", category: "Tés e infusiones" },
  { name: "Frutos rojos (infusión)", unit: "g", category: "Tés e infusiones" },
  // Frutas y verduras
  { name: "Zumo de naranja", unit: "ml", category: "Frutas y verduras" },
  { name: "Zumo de mandarina", unit: "ml", category: "Frutas y verduras" },
  { name: "Zumo de limón", unit: "ml", category: "Frutas y verduras" },
  { name: "Limón", unit: "ud", category: "Frutas y verduras" },
  { name: "Limón deshidratado", unit: "ud", category: "Frutas y verduras" },
  { name: "Mandarina deshidratada", unit: "ud", category: "Frutas y verduras" },
  { name: "Toronja", unit: "ud", category: "Frutas y verduras" },
  { name: "Hierbabuena", unit: "g", category: "Frutas y verduras" },
  { name: "Romero", unit: "ud", category: "Frutas y verduras" },
  { name: "Jengibre", unit: "g", category: "Frutas y verduras" },
  { name: "Pulpa de fresa", unit: "g", category: "Frutas y verduras" },
  { name: "Pulpa de mora", unit: "g", category: "Frutas y verduras" },
  { name: "Pulpa de mango", unit: "g", category: "Frutas y verduras" },
  { name: "Pulpa de coco", unit: "ud", category: "Frutas y verduras" },
  { name: "Coco deshidratado", unit: "g", category: "Frutas y verduras" },
  { name: "Cerezas", unit: "ud", category: "Frutas y verduras" },
  { name: "Fresas", unit: "g", category: "Frutas y verduras" },
  { name: "Banano", unit: "ud", category: "Frutas y verduras" },
  { name: "Arándanos", unit: "g", category: "Frutas y verduras" },
  { name: "Tomate cherry", unit: "g", category: "Frutas y verduras" },
  { name: "Rúgula", unit: "g", category: "Frutas y verduras" },
  { name: "Micro brotes", unit: "g", category: "Frutas y verduras" },
  { name: "Guacamole", unit: "g", category: "Frutas y verduras" },
  { name: "Almendras laminadas", unit: "g", category: "Frutas y verduras" },
  { name: "Ajonjolí", unit: "g", category: "Frutas y verduras" },
  { name: "Flor comestible", unit: "ud", category: "Frutas y verduras" },
  // Panadería y charcutería (se compran hechos)
  { name: "Waffle", unit: "ud", category: "Panadería y charcutería" },
  { name: "Pan de molde (rebanadas)", unit: "ud", category: "Panadería y charcutería" },
  { name: "Croissant de mantequilla", unit: "ud", category: "Panadería y charcutería" },
  { name: "Croissant de mantequilla y pistacho", unit: "ud", category: "Panadería y charcutería" },
  { name: "Croissant de galleta", unit: "ud", category: "Panadería y charcutería" },
  { name: "Galleta", unit: "ud", category: "Panadería y charcutería" },
  { name: "Pastel de pollo", unit: "ud", category: "Panadería y charcutería" },
  { name: "Pastel 3 quesos", unit: "ud", category: "Panadería y charcutería" },
  { name: "Palito de queso", unit: "ud", category: "Panadería y charcutería" },
  { name: "Empanadas argentinas (porción)", unit: "ud", category: "Panadería y charcutería" },
  { name: "Rollo de canela", unit: "ud", category: "Panadería y charcutería" },
  { name: "Brownie", unit: "ud", category: "Panadería y charcutería" },
  { name: "Alfajor", unit: "ud", category: "Panadería y charcutería" },
  { name: "Torta de chocolate (porción)", unit: "ud", category: "Panadería y charcutería" },
  { name: "Jamón serrano", unit: "g", category: "Panadería y charcutería" },
  { name: "Salami", unit: "g", category: "Panadería y charcutería" },
  // Bebidas envasadas
  { name: "Agua tónica Ocean", unit: "ud", category: "Bebidas envasadas" },
  { name: "Ginger beer", unit: "ud", category: "Bebidas envasadas" },
  { name: "Soda Bretaña", unit: "ud", category: "Bebidas envasadas" },
  { name: "Soda Hatsu", unit: "ud", category: "Bebidas envasadas" },
  { name: "Té Hatsu", unit: "ud", category: "Bebidas envasadas" },
  { name: "Agua sin gas 300 ml", unit: "ud", category: "Bebidas envasadas" },
  { name: "Agua con gas 300 ml", unit: "ud", category: "Bebidas envasadas" },
  { name: "Coca Cola", unit: "ud", category: "Bebidas envasadas" },
  { name: "Cerveza artesanal", unit: "ud", category: "Bebidas envasadas" },
  { name: "Cerveza Poker", unit: "ud", category: "Bebidas envasadas" },
  { name: "Cerveza Clubco", unit: "ud", category: "Bebidas envasadas" },
  { name: "Cerveza Stella", unit: "ud", category: "Bebidas envasadas" },
  // Licores
  { name: "Ron Caldas tradicional", unit: "ml", category: "Licores" },
  { name: "Ron 5 años", unit: "ml", category: "Licores" },
  { name: "Ron 8 años", unit: "ml", category: "Licores" },
  { name: "Whisky Black & White", unit: "ml", category: "Licores" },
  { name: "Licor de café", unit: "ml", category: "Licores" },
  { name: "Ginebra", unit: "ml", category: "Licores" },
  { name: "Tequila reposado", unit: "ml", category: "Licores" },
  { name: "Triple sec", unit: "ml", category: "Licores" },
  { name: "Vodka", unit: "ml", category: "Licores" },
  { name: "Champán", unit: "ml", category: "Licores" },
  { name: "Vino", unit: "ml", category: "Licores" },
  // Desechables
  { name: "Vaso para bebida caliente", unit: "ud", category: "Desechables" },
  { name: "Vaso plástico con tapa domo", unit: "ud", category: "Desechables" },
  { name: "Mezclador", unit: "ud", category: "Desechables" },
  { name: "Servilleta", unit: "ud", category: "Desechables" },
  { name: "Empaque para llevar", unit: "ud", category: "Desechables" },
];

/** [insumo, cantidad, soloParaLlevar?] */
export type Line = [supply: string, qty: number, onlyTakeaway?: boolean];
const T = true;

// Kits que se repiten en muchas recetas.
const HOT_CUP_KIT: Line[] = [
  ["Vaso para bebida caliente", 1, T],
  ["Azúcar en sobre", 1],
  ["Mezclador", 1, T],
];
const COLD_CUP: Line = ["Vaso plástico con tapa domo", 1, T];
const ICE: Line = ["Hielo (palas)", 1];
const NAPKIN: Line = ["Servilleta", 1, T];

/** Nombre del producto tal como esta en la carta -> lineas. */
export const RECIPES: Record<string, Line[]> = {
  // --- Bebidas calientes ---
  "Espresso Sencillo": [["Café en grano", 9], ...HOT_CUP_KIT],
  "Espresso Doble": [["Café en grano", 18], ...HOT_CUP_KIT],
  "Americano Sencillo": [["Café en grano", 9], ...HOT_CUP_KIT],
  "Americano Doble": [["Café en grano", 18], ...HOT_CUP_KIT],
  // "Espuma de leche": sin cantidad en la hoja; estimado por el coste de la linea.
  Machiatto: [["Café en grano", 9], ["Leche entera", 50], ...HOT_CUP_KIT],
  Capuchino: [["Café en grano", 18], ["Leche deslactosada", 200], ...HOT_CUP_KIT],
  "Capuchino (Licor)": [["Café en grano", 18], ["Leche entera", 170], ["Ron Caldas tradicional", 30], ...HOT_CUP_KIT],
  Carajillo: [["Café en grano", 9], ["Ron Caldas tradicional", 30], ...HOT_CUP_KIT],
  Latte: [["Café en grano", 18], ["Leche deslactosada", 200], ...HOT_CUP_KIT],
  Mocca: [
    ["Café en grano", 9],
    ["Leche deslactosada", 200],
    ["Cocoa en polvo", 5],
    ["Chocolate Hershey's líquido", 6],
    ...HOT_CUP_KIT,
  ],
  "Capuccino Irlandés": [
    ["Café en grano", 18],
    ["Whisky Black & White", 30],
    ["Leche deslactosada", 170],
    ["Crema chantilly", 5],
    ...HOT_CUP_KIT,
  ],

  // --- Bebidas especiales ---
  "Orange Coffee": [ICE, ["Zumo de naranja", 250], ["Café en grano", 18], COLD_CUP, ["Mandarina deshidratada", 1]],
  "Cold Brew": [["Café en grano", 18], ICE, COLD_CUP],
  "Espresso Tonic": [["Agua tónica Ocean", 1], ["Café en grano", 18], COLD_CUP, ICE],
  "Iced Matcha Fresa": [["Almíbar de fresa", 70], ["Matcha", 3], ["Leche entera", 180], COLD_CUP, ICE],

  // --- Bebidas frías ---
  // Los 3 granos de cafe de decoracion se omiten (menos de 1 g).
  "Frappé de Café": [
    ["Café en grano", 18],
    ["Leche en polvo", 30],
    ["Chocolate Hershey's líquido", 10],
    ["Leche entera", 20],
    ICE,
    COLD_CUP,
  ],
  // "Almendra" sin cantidad: 10 g estimado.
  Affogato: [["Café en grano", 18], ["Helado", 100], ["Almendras laminadas", 10], COLD_CUP],
  // Sirope Hershey's sin cantidad: 8 ml estimado por el coste.
  "Malteada de Café": [
    ["Café en grano", 18],
    ["Helado", 300],
    ["Leche deslactosada", 70],
    ["Chocolate Hershey's líquido", 8],
    COLD_CUP,
  ],
  // Chantilly (6 g), almendras (5 g) y sirope (10 ml) sin cantidad: estimados por el coste.
  "Opera con Licor": [
    ["Helado", 300],
    ["Licor de café", 30],
    ["Café en grano", 18],
    ["Crema chantilly", 6],
    ["Almendras laminadas", 5],
    ["Chocolate Hershey's líquido", 10],
    COLD_CUP,
  ],
  "Iced Latte": [ICE, ["Leche entera", 220], COLD_CUP, ["Café en grano", 18]],
  // Panela sin cantidad: 15 g estimado.
  "Aero Espresso": [["Café en grano", 18], COLD_CUP, ["Panela", 15], ICE],
  // Media cucharada de azucar: 6 g estimado.
  Milo: [["Milo", 70], ["Leche entera", 120], ICE, ["Azúcar", 6], COLD_CUP],
  "Mocca Frío": [
    ["Chocolate Hershey's líquido", 15],
    ["Cocoa en polvo", 20],
    ["Café en grano", 18],
    ["Leche entera", 70],
    ICE,
    COLD_CUP,
  ],
  // Sirope Hershey's sin cantidad: 10 ml estimado.
  Malteadas: [["Helado", 300], ["Leche entera", 220], COLD_CUP, ["Chocolate Hershey's líquido", 10]],

  // --- Té / infusiones ---
  Matcha: [["Matcha", 5], ...HOT_CUP_KIT],
  "Té Chai": [["Té chai", 5], ...HOT_CUP_KIT],
  // 4 hojas de hierbabuena: 2 g estimado.
  "Infusión Hierbabuena & Jengibre": [
    ["Hierbabuena", 2],
    ["Zumo de limón", 15],
    ["Jengibre", 5],
    ...HOT_CUP_KIT,
    ["Limón deshidratado", 1],
  ],
  "Frutos Amarillos": [["Frutos amarillos (infusión)", 15], ...HOT_CUP_KIT, NAPKIN],
  "Frutos Rojos": [["Frutos rojos (infusión)", 15], ...HOT_CUP_KIT, NAPKIN],
  // "Leche" a secas = leche entera.
  "Opción Leche 250ml": [["Leche entera", 250]],

  // --- Jugos naturales ---
  Fresa: [["Pulpa de fresa", 150], COLD_CUP],
  Mora: [["Pulpa de mora", 150], COLD_CUP],
  Mango: [["Pulpa de mango", 150], COLD_CUP],
  Naranja: [["Zumo de naranja", 300], COLD_CUP],
  Mandarina: [["Zumo de mandarina", 300], COLD_CUP],
  "Limonada de Coco": [
    ["Pulpa de coco", 1],
    ["Coco deshidratado", 15],
    ["Zumo de limón", 60],
    COLD_CUP,
    ["Limón deshidratado", 1],
  ],
  "Limonada de Cereza": [
    ICE,
    ["Cerezas", 7], // 6 en la bebida + 1 de garnish
    ["Almíbar de cereza", 15],
    ["Zumo de limón", 45],
    COLD_CUP,
    ["Limón deshidratado", 1],
  ],
  // 6 hojas (3 g) + corona de hierbabuena (3 g estimado).
  "Limonada de Hierbabuena": [
    ["Limón", 0.5],
    ["Zumo de limón", 45],
    ["Hierbabuena", 6],
    ICE,
    COLD_CUP,
    ["Limón deshidratado", 1],
  ],

  // --- Métodos de café ---
  Chemex: [["Café en grano", 11], ["Filtro Chemex", 1]],
  V60: [["Café en grano", 11], ["Filtro Hario V60", 1]],
  Clever: [["Café en grano", 11], ["Filtro Clever #2", 1]],
  "Prensa Francesa": [["Café en grano", 11]],

  // --- Platos especiales ---
  "Waffle de Jamón Serrano": [
    ["Waffle", 1],
    ["Jamón serrano", 34],
    ["Rúgula", 15],
    ["Tomate cherry", 60],
    ["Guacamole", 50],
    ["Micro brotes", 2],
    NAPKIN,
  ],
  "Waffles (Frutas & Helado)": [
    ["Waffle", 1],
    ["Banano", 1],
    ["Arándanos", 10],
    ["Sirope de maple", 10],
    ["Helado", 100],
    ["Almendras laminadas", 5],
    ["Nutella", 10],
    NAPKIN,
  ],
  "Tostadas x3": [
    ["Pan de molde (rebanadas)", 3],
    ["Guacamole", 50],
    ["Queso búfala", 1],
    ["Queso Filadelfia", 40],
    ["Mermelada de frutos rojos", 30],
    ["Mantequilla de maní", 15],
    ["Banano", 1],
    ["Ajonjolí", 5],
    NAPKIN,
  ],
  "Croissant Relleno (Jamón Serrano)": [
    ["Croissant de mantequilla", 1],
    ["Jamón serrano", 34],
    ["Rúgula", 10],
    ["Guacamole", 50],
    ["Sour cream", 20],
    ["Tomate cherry", 60],
  ],
  "Croissant Relleno (Salami)": [
    ["Croissant de mantequilla", 1],
    ["Salami", 26],
    ["Rúgula", 10],
    ["Guacamole", 50],
    ["Sour cream", 20],
    ["Tomate cherry", 60],
  ],
  "Croissant Chocoberry": [
    ["Croissant de mantequilla", 1],
    ["Crema de chocolate", 50],
    ["Fresas", 90],
    ["Chocolate Hershey's líquido", 10],
    ["Crema chantilly", 10],
  ],
  // El propio producto es el empaque: se descuenta siempre.
  "Empaque para Llevar": [["Empaque para llevar", 1]],

  // --- Bebidas envasadas ---
  "Soda Bretaña": [["Soda Bretaña", 1]],
  "Soda Hatsu": [["Soda Hatsu", 1]],
  "Té Hatsu": [["Té Hatsu", 1]],
  "Agua Sin Gas 300ml": [["Agua sin gas 300 ml", 1]],
  "Agua Con Gas 300ml": [["Agua con gas 300 ml", 1]],
  "Coca Cola": [["Coca Cola", 1]],
  "Cerveza Artesanal": [["Cerveza artesanal", 1]],
  Poker: [["Cerveza Poker", 1]],
  Clubco: [["Cerveza Clubco", 1]],
  Stella: [["Cerveza Stella", 1]],
  // Shot y copa: la hoja no da la medida. Estimado: shot 30 ml, copa 150 ml.
  "Shot Ron 5 Años": [["Ron 5 años", 30]],
  "Shot Ron 8 Años": [["Ron 8 años", 30]],
  "Copa de Vino": [["Vino", 150]],

  // --- Horneados & dulces ---
  "Pastel de Pollo": [["Pastel de pollo", 1]],
  "Pastel 3 Quesos": [["Pastel 3 quesos", 1]],
  "Palito de Queso": [["Palito de queso", 1]],
  Empanadas: [["Empanadas argentinas (porción)", 1]],
  Croissant: [["Croissant de mantequilla y pistacho", 1]],
  "Croissant Galleta": [
    ["Croissant de galleta", 1],
    ["Galleta", 1],
    ["Chocolate Hershey's líquido", 10],
    ["Crema de chocolate", 50],
  ],
  // Azucar pulverizada sin cantidad: 5 g estimado (tambien en galletas, brownies, alfajores y tortas).
  "Rollos de Canela": [["Rollo de canela", 1], ["Azúcar pulverizada", 5], NAPKIN],
  // Chantilly y flor figuran con coste 0 en la hoja: no se usan, se omiten.
  "Galletas (3 Sabores)": [["Galleta", 1], ["Chocolate Hershey's líquido", 5], ["Azúcar pulverizada", 5]],
  "Brownies (2 Sabores)": [["Brownie", 1], ["Chocolate Hershey's líquido", 5], NAPKIN, ["Azúcar pulverizada", 5]],
  "Porción de Helado 100g": [["Helado", 100]],
  Alfajores: [["Alfajor", 1], ["Crema chantilly", 5], ["Azúcar pulverizada", 5], NAPKIN],
  Tortas: [
    ["Torta de chocolate (porción)", 1],
    ["Chocolate Hershey's líquido", 5],
    ["Crema chantilly", 5],
    ["Flor comestible", 1],
    ["Azúcar pulverizada", 5],
    NAPKIN,
  ],

  // --- Cócteles ---
  // Rodaja de toronja: 0,2 toronjas estimado.
  "Gin & Tonic (Copa Balón)": [
    ["Ginebra", 60],
    ["Agua tónica Ocean", 1],
    ["Toronja", 0.2],
    ["Hielo (palas)", 2],
    ["Romero", 1],
  ],
  // Escarchado de sal: se omite. Rodaja de limon: 0,1 limones estimado.
  "Margarita (Copa Marg)": [
    ["Tequila reposado", 60],
    ["Almíbar", 30],
    ["Zumo de limón", 30],
    ["Triple sec", 30],
    ["Hielo (palas)", 2],
    ["Limón", 0.1],
  ],
  Mimosa: [["Zumo de naranja", 100], ["Champán", 100], ["Cerezas", 2]],
  // 2 g de hierbabuena + garnish (1 g estimado).
  "Moscow Mule (Rockero)": [
    ["Vodka", 60],
    ["Zumo de limón", 30],
    ["Hierbabuena", 3],
    ["Ginger beer", 0.5],
    ["Hielo (palas)", 0.5],
  ],
};

/**
 * Productos de la carta que se quedan sin receta a proposito, y por que.
 * El script los lista para que se vea que no es un olvido.
 */
export const WITHOUT_RECIPE: Record<string, string> = {
  "Adición Leche": "la hoja no dice qué leche ni cuánta",
  "Adición Bebida Almendra": "la hoja no dice cuánta bebida de almendra",
  "Vaso Michelado": "la hoja no desglosa sus ingredientes",
};
