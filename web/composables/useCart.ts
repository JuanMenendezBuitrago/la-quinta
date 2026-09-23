export interface CartLine {
  menuItemId: string;
  name: string;
  priceCents: number;
  quantity: number;
  imageUrl?: string | null;
}

// useState de Nuxt: estado reactivo compartido entre componentes,
// aislado por request en SSR (no se filtra entre clientes distintos).
// `key` separa carritos independientes: el publico ("cart-lines") y el ticket que monta el
// personal en "Tomar pedido", que no deben mezclarse aunque se usen en el mismo navegador.
export function useCart(key = "cart-lines") {
  const lines = useState<CartLine[]>(key, () => []);

  function add(item: { id: string; name: string; priceCents: number; imageUrl?: string | null }) {
    const existing = lines.value.find((l) => l.menuItemId === item.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      lines.value.push({
        menuItemId: item.id,
        name: item.name,
        priceCents: item.priceCents,
        quantity: 1,
        imageUrl: item.imageUrl ?? null,
      });
    }
  }

  function remove(menuItemId: string) {
    lines.value = lines.value.filter((l) => l.menuItemId !== menuItemId);
  }

  function setQuantity(menuItemId: string, quantity: number) {
    const line = lines.value.find((l) => l.menuItemId === menuItemId);
    if (!line) return;
    if (quantity <= 0) return remove(menuItemId);
    line.quantity = quantity;
  }

  function clear() {
    lines.value = [];
  }

  const cartCount = computed(() => lines.value.reduce((sum, l) => sum + l.quantity, 0));
  const totalCents = computed(() => lines.value.reduce((sum, l) => sum + l.priceCents * l.quantity, 0));

  return { lines, add, remove, setQuantity, clear, cartCount, totalCents };
}
