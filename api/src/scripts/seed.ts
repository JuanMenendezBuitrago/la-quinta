/**
 * Datos minimos para poder probar el flujo completo en local:
 * un usuario de gestion y una categoria con dos productos.
 *
 * Uso: npm run seed   (con MONGO_URI apuntando a una base local o de dev)
 */
import { connectMongo } from "../config/db";
import { StaffUser } from "../modules/users/model";
import { MenuCategory, MenuItem } from "../modules/menu/model";
import { hashPassword } from "../modules/users/auth";

async function seed() {
  await connectMongo();

  const adminEmail = "gestion@laquinta.local";
  const existingAdmin = await StaffUser.findOne({ email: adminEmail });
  if (!existingAdmin) {
    await StaffUser.create({
      name: "Gestion La Quinta",
      email: adminEmail,
      passwordHash: await hashPassword("cambia-esta-clave"),
      role: "gestion",
    });
    console.log(`[seed] staff creado: ${adminEmail} / cambia-esta-clave`);
  }

  let cafes = await MenuCategory.findOne({ name: "Cafés" });
  if (!cafes) {
    cafes = await MenuCategory.create({ name: "Cafés", order: 0 });
  }

  const items = [
    { name: "Espresso", priceCents: 180, description: "Blend de la casa" },
    { name: "Flat White", priceCents: 320, description: "Con leche de avena a elegir" },
  ];

  for (const item of items) {
    const exists = await MenuItem.findOne({ categoryId: cafes._id, name: item.name });
    if (!exists) {
      await MenuItem.create({ ...item, categoryId: cafes._id, allergens: [], available: true });
    }
  }

  console.log("[seed] listo");
  process.exit(0);
}

seed().catch((err) => {
  console.error("[seed] error:", err);
  process.exit(1);
});
