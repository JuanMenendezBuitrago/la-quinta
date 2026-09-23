import { MenuItem } from "../menu/model";
import { generateOrderCode, isDuplicateCodeError, Order, OrderDoc } from "./model";

const MAX_CODE_ATTEMPTS = 5;
const MAX_QUANTITY = 99;

/**
 * Lineas del pedido a partir de lo que pide el cliente o el personal: comprueba que cada producto
 * existe y esta disponible, y guarda su nombre y precio de ese momento (si la carta cambia
 * despues, el pedido no se altera).
 */
export async function buildOrderLines(items: { menuItemId: string; quantity: number }[]) {
  if (items.length === 0) throw new Error("El pedido no puede estar vacio");
  for (const line of items) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
      throw new Error(`La cantidad debe estar entre 1 y ${MAX_QUANTITY}`);
    }
  }

  const menuItems = await MenuItem.find({ _id: { $in: items.map((i) => i.menuItemId) } });
  const lines = items.map((line) => {
    const item = menuItems.find((m) => m._id.toString() === line.menuItemId);
    if (!item) throw new Error(`Producto no encontrado: ${line.menuItemId}`);
    if (!item.available) throw new Error(`"${item.name}" no esta disponible ahora`);
    return { menuItemId: item._id, name: item.name, priceCents: item.priceCents, quantity: line.quantity };
  });
  const totalCents = lines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0);
  return { lines, totalCents };
}

/**
 * Crea el pedido con un codigo corto unico. El indice unico de `code` es la garantia real:
 * si el codigo generado ya existe, se reintenta con otro.
 */
export async function createWithUniqueCode(data: Omit<Partial<OrderDoc>, "_id" | "code">) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await Order.create({ ...data, code: generateOrderCode() });
    } catch (err) {
      if (!isDuplicateCodeError(err) || attempt >= MAX_CODE_ATTEMPTS) throw err;
    }
  }
}
