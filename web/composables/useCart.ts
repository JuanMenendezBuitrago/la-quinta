/** Opcion elegida en una linea (p. ej. Leche: Avena). isDefault: la que lleva el producto sin pedirla. */
export interface CartLineOption {
  id: string;
  groupId: string;
  name: string;
  priceDeltaCents: number;
  isDefault: boolean;
}

export interface CartLine {
  /** Producto + opciones: dos Latte con distinta leche son lineas distintas. */
  key: string;
  menuItemId: string;
  name: string;
  /** Precio por unidad sin opciones; priceCents ya las incluye. */
  basePriceCents: number;
  priceCents: number;
  quantity: number;
  imageUrl?: string | null;
  options: CartLineOption[];
}

/** Sin opciones, la clave es el id del producto (la API aplica las de por defecto). */
export function cartLineKey(menuItemId: string, options: CartLineOption[]) {
  if (!options.length) return menuItemId;
  return `${menuItemId}:${options.map((o) => o.id).sort().join(",")}`;
}

// useState de Nuxt: estado reactivo compartido entre componentes,
// aislado por request en SSR (no se filtra entre clientes distintos).
// `key` separa carritos independientes: el publico ("cart-lines") y el ticket que monta el
// personal en "Tomar pedido", que no deben mezclarse aunque se usen en el mismo navegador.
export function useCart(key = "cart-lines") {
  const lines = useState<CartLine[]>(key, () => []);

  function add(
    item: { id: string; name: string; priceCents: number; imageUrl?: string | null },
    options: CartLineOption[] = []
  ) {
    const k = cartLineKey(item.id, options);
    const existing = lines.value.find((l) => l.key === k);
    if (existing) {
      existing.quantity += 1;
    } else {
      lines.value.push({
        key: k,
        menuItemId: item.id,
        name: item.name,
        basePriceCents: item.priceCents,
        priceCents: item.priceCents + options.reduce((sum, o) => sum + o.priceDeltaCents, 0),
        quantity: 1,
        imageUrl: item.imageUrl ?? null,
        options,
      });
    }
  }

  function remove(lineKeyToRemove: string) {
    lines.value = lines.value.filter((l) => l.key !== lineKeyToRemove);
  }

  function setQuantity(lineKeyToSet: string, quantity: number) {
    const line = lines.value.find((l) => l.key === lineKeyToSet);
    if (!line) return;
    if (quantity <= 0) return remove(lineKeyToSet);
    line.quantity = quantity;
  }

  /** Cambia las opciones de una linea; si ya habia otra igual, se juntan en una. */
  function setOptions(lineKeyToChange: string, options: CartLineOption[]) {
    const line = lines.value.find((l) => l.key === lineKeyToChange);
    if (!line) return;
    const k = cartLineKey(line.menuItemId, options);
    if (k === line.key) return;
    const twin = lines.value.find((l) => l.key === k);
    if (twin) {
      twin.quantity += line.quantity;
      remove(line.key);
      return;
    }
    line.key = k;
    line.options = options;
    line.priceCents = line.basePriceCents + options.reduce((sum, o) => sum + o.priceDeltaCents, 0);
  }

  function clear() {
    lines.value = [];
  }

  const cartCount = computed(() => lines.value.reduce((sum, l) => sum + l.quantity, 0));
  const totalCents = computed(() => lines.value.reduce((sum, l) => sum + l.priceCents * l.quantity, 0));

  return { lines, add, remove, setQuantity, setOptions, clear, cartCount, totalCents };
}

/** Lineas para las mutaciones createOrder / createStaffOrder. */
export function orderLinesInput(lines: CartLine[]) {
  return lines.map((l) => ({
    menuItemId: l.menuItemId,
    quantity: l.quantity,
    ...(l.options.length ? { optionIds: l.options.map((o) => o.id) } : {}),
  }));
}
