import { MenuItem, MenuItemDoc, ModifierGroup, ModifierGroupDoc } from "../menu/model";
import { generateOrderCode, isDuplicateCodeError, Order, OrderDoc, OrderLineOptionDoc } from "./model";

const MAX_CODE_ATTEMPTS = 5;
const MAX_QUANTITY = 99;

export interface OrderLineRequest {
  menuItemId: string;
  quantity: number;
  optionIds?: string[] | null;
}

/**
 * Personalizaciones de una linea: en cada grupo del producto, las opciones pedidas o, si no se
 * pidio ninguna, la de por defecto. Comprueba los limites del grupo, que las opciones esten
 * disponibles y que no se cuele ninguna que no sea de este producto.
 */
function resolveOptions(
  item: MenuItemDoc,
  groups: ModifierGroupDoc[],
  optionIds: string[]
): OrderLineOptionDoc[] {
  const pending = new Set(optionIds);
  if (pending.size !== optionIds.length) throw new Error(`Hay una opcion repetida en "${item.name}"`);

  const chosen: OrderLineOptionDoc[] = [];
  for (const modifier of item.modifiers ?? []) {
    const group = groups.find((g) => g._id.equals(modifier.groupId));
    if (!group) continue; // grupo borrado: el producto ya no lo ofrece
    let options = group.options.filter((o) => pending.has(o._id.toString()));
    options.forEach((o) => pending.delete(o._id.toString()));
    if (!options.length && modifier.defaultOptionId) {
      options = group.options.filter((o) => o._id.equals(modifier.defaultOptionId!));
    }
    for (const option of options) {
      if (!option.available) throw new Error(`"${option.name}" no esta disponible ahora: elige otra opcion de ${group.name.toLowerCase()} para "${item.name}"`);
    }
    if (options.length < group.minSelect) throw new Error(`Elige ${group.name.toLowerCase()} para "${item.name}"`);
    if (options.length > group.maxSelect) throw new Error(`Demasiadas opciones de ${group.name.toLowerCase()} en "${item.name}"`);
    for (const option of options) {
      chosen.push({
        groupId: group._id,
        groupName: group.name,
        optionId: option._id,
        name: option.name,
        priceDeltaCents: option.priceDeltaCents,
        isDefault: !!modifier.defaultOptionId && option._id.equals(modifier.defaultOptionId),
        defaultOptionId: modifier.defaultOptionId ?? null,
      });
    }
  }
  if (pending.size) throw new Error(`Opcion no valida para "${item.name}"`);
  return chosen;
}

/**
 * Lineas del pedido a partir de lo que pide el cliente o el personal: comprueba que cada producto
 * existe y esta disponible, y guarda su nombre, sus opciones y su precio de ese momento (si la
 * carta cambia despues, el pedido no se altera). El precio por unidad incluye los suplementos.
 */
export async function buildOrderLines(items: OrderLineRequest[]) {
  if (items.length === 0) throw new Error("El pedido no puede estar vacio");
  for (const line of items) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
      throw new Error(`La cantidad debe estar entre 1 y ${MAX_QUANTITY}`);
    }
  }

  const menuItems = await MenuItem.find({ _id: { $in: items.map((i) => i.menuItemId) } }).lean();
  const groupIds = menuItems.flatMap((m) => (m.modifiers ?? []).map((x) => x.groupId));
  const groups = groupIds.length ? await ModifierGroup.find({ _id: { $in: groupIds } }).lean() : [];

  const lines = items.map((line) => {
    const item = menuItems.find((m) => m._id.toString() === line.menuItemId);
    if (!item) throw new Error(`Producto no encontrado: ${line.menuItemId}`);
    if (!item.available) throw new Error(`"${item.name}" no esta disponible ahora`);
    const options = resolveOptions(item, groups, line.optionIds ?? []);
    const priceCents = item.priceCents + options.reduce((sum, o) => sum + o.priceDeltaCents, 0);
    return { menuItemId: item._id, name: item.name, priceCents, quantity: line.quantity, options };
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
