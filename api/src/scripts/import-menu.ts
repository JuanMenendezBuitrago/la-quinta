/**
 * Importa la carta real desde la hoja de costeo (precios en pesos colombianos).
 * Sustituye por completo las categorias y productos existentes.
 *
 * Uso: npm run import-menu   (con MONGO_URI apuntando a la base a actualizar)
 */
import { connectMongo } from "../config/db";
import { MenuCategory, MenuItem } from "../modules/menu/model";

interface RawItem {
  name: string;
  price: number;
}

interface RawCategory {
  name: string;
  items: RawItem[];
}

const MENU: RawCategory[] = [
  {
    name: "Bebidas Calientes",
    items: [
      { name: "Espresso Sencillo", price: 6000 },
      { name: "Espresso Doble", price: 7500 },
      { name: "Americano Sencillo", price: 6000 },
      { name: "Americano Doble", price: 7500 },
      { name: "Machiatto", price: 7000 },
      { name: "Capuchino", price: 10000 },
      { name: "Capuchino (Licor)", price: 14000 },
      { name: "Carajillo", price: 11000 },
      { name: "Latte", price: 10000 },
      { name: "Mocca", price: 11000 },
      { name: "Capuccino Irlandés", price: 15000 },
    ],
  },
  {
    name: "Bebidas Especiales",
    items: [
      { name: "Orange Coffee", price: 15000 },
      { name: "Cold Brew", price: 14000 },
      { name: "Espresso Tonic", price: 21000 },
      { name: "Iced Matcha Fresa", price: 21000 },
    ],
  },
  {
    name: "Bebidas Frías",
    items: [
      { name: "Frappé de Café", price: 14000 },
      { name: "Affogato", price: 13000 },
      { name: "Malteada de Café", price: 23000 },
      { name: "Opera con Licor", price: 25000 },
      { name: "Iced Latte", price: 10000 },
      { name: "Aero Espresso", price: 10000 },
      { name: "Milo", price: 12000 },
      { name: "Mocca Frío", price: 12000 },
      { name: "Malteadas", price: 21000 },
    ],
  },
  {
    name: "Té / Infusiones",
    items: [
      { name: "Matcha", price: 10000 },
      { name: "Té Chai", price: 10000 },
      { name: "Adición Leche", price: 3000 },
      { name: "Adición Bebida Almendra", price: 5000 },
      { name: "Infusión Hierbabuena & Jengibre", price: 10000 },
      { name: "Frutos Amarillos", price: 11000 },
      { name: "Frutos Rojos", price: 11000 },
    ],
  },
  {
    name: "Jugos Naturales",
    items: [
      { name: "Fresa", price: 10000 },
      { name: "Mora", price: 10000 },
      { name: "Mango", price: 10000 },
      { name: "Opción Leche 250ml", price: 3000 },
      { name: "Naranja", price: 13000 },
      { name: "Mandarina", price: 13000 },
      { name: "Limonada de Coco", price: 15000 },
      { name: "Limonada de Cereza", price: 12000 },
      { name: "Limonada de Hierbabuena", price: 12000 },
    ],
  },
  {
    name: "Métodos de Café",
    items: [
      { name: "Chemex", price: 10000 },
      { name: "V60", price: 10000 },
      { name: "Clever", price: 10000 },
      { name: "Prensa Francesa", price: 9000 },
    ],
  },
  {
    name: "Platos Especiales",
    items: [
      { name: "Waffle de Jamón Serrano", price: 25000 },
      { name: "Waffles (Frutas & Helado)", price: 22000 },
      { name: "Tostadas x3", price: 29000 },
      { name: "Croissant Relleno (Jamón Serrano)", price: 25000 },
      { name: "Croissant Relleno (Salami)", price: 24000 },
      { name: "Croissant Chocoberry", price: 24000 },
      { name: "Empaque para Llevar", price: 1000 },
    ],
  },
  {
    name: "Bebidas Sin Alcohol",
    items: [
      { name: "Soda Bretaña", price: 6500 },
      { name: "Soda Hatsu", price: 9000 },
      { name: "Té Hatsu", price: 13000 },
      { name: "Vaso Michelado", price: 2500 },
      { name: "Agua Sin Gas 300ml", price: 8000 },
      { name: "Agua Con Gas 300ml", price: 9000 },
      { name: "Coca Cola", price: 8000 },
    ],
  },
  {
    name: "Bebidas Con Alcohol",
    items: [
      { name: "Cerveza Artesanal", price: 18000 },
      { name: "Poker", price: 9000 },
      { name: "Clubco", price: 10000 },
      { name: "Stella", price: 12000 },
      { name: "Vaso Michelado", price: 2500 },
      { name: "Shot Ron 5 Años", price: 18000 },
      { name: "Shot Ron 8 Años", price: 23000 },
      { name: "Copa de Vino", price: 24000 },
    ],
  },
  {
    name: "Horneados & Dulces",
    items: [
      { name: "Pastel de Pollo", price: 11000 },
      { name: "Pastel 3 Quesos", price: 11000 },
      { name: "Palito de Queso", price: 10000 },
      { name: "Empanadas", price: 12000 },
      { name: "Croissant", price: 11000 },
      { name: "Croissant Galleta", price: 22000 },
      { name: "Rollos de Canela", price: 11000 },
      { name: "Galletas (3 Sabores)", price: 12000 },
      { name: "Brownies (2 Sabores)", price: 12000 },
      { name: "Porción de Helado 100g", price: 5000 },
      { name: "Alfajores", price: 9000 },
      { name: "Tortas", price: 14000 },
      { name: "Empaque para Llevar", price: 1000 },
    ],
  },
  {
    name: "Cócteles",
    items: [
      { name: "Gin & Tonic (Copa Balón)", price: 30000 },
      { name: "Margarita (Copa Marg)", price: 31000 },
      { name: "Mimosa", price: 27000 },
      { name: "Moscow Mule (Rockero)", price: 30000 },
    ],
  },
];

async function importMenu() {
  await connectMongo();

  await MenuItem.deleteMany({});
  await MenuCategory.deleteMany({});

  let itemCount = 0;
  for (let order = 0; order < MENU.length; order++) {
    const category = MENU[order];
    const categoryDoc = await MenuCategory.create({ name: category.name, order });
    for (const item of category.items) {
      await MenuItem.create({
        categoryId: categoryDoc._id,
        name: item.name,
        priceCents: item.price,
        allergens: [],
        available: true,
      });
      itemCount++;
    }
  }

  console.log(`[import-menu] ${MENU.length} categorías y ${itemCount} productos importados`);
  process.exit(0);
}

importMenu().catch((err) => {
  console.error("[import-menu] error:", err);
  process.exit(1);
});
