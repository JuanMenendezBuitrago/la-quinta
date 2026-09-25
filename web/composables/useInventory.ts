import { gql } from "graphql-tag";
import type { Ref } from "vue";

export type SupplyUnit = "g" | "ml" | "ud";
export type StockReason = "compra" | "consumo" | "merma" | "conteo" | "ajuste";

export interface Supply {
  id: string;
  name: string;
  unit: SupplyUnit;
  category: string;
  minStock: number;
  stock: number;
  low: boolean;
  active: boolean;
}

export interface StockMovement {
  id: string;
  delta: number;
  reason: StockReason;
  orderCode: string | null;
  staffName: string | null;
  note: string | null;
  countedQty: number | null;
  createdAt: string;
}

export interface RecipeLine {
  supply: Supply;
  qty: number;
  onlyTakeaway: boolean;
}

export interface Recipe {
  menuItemId: string;
  lines: RecipeLine[];
}

/** Datos editables de un insumo (alta y edicion). minStock null mientras no sea un numero. */
export interface SupplyForm {
  name: string;
  unit: SupplyUnit;
  category: string;
  minStock: number | null;
}

export interface SupplyAlert {
  supplyId: string;
  name: string;
  stock: number;
  minStock: number;
  unit: SupplyUnit;
}

const SUPPLY_FIELDS = `id name unit category minStock stock low active`;

// Siempre con los inactivos (y se filtran en la web): asi todas las pantallas comparten la misma
// entrada de la cache de Apollo, y lo que devuelve cada mutacion (Supply con id) la actualiza sola.
export const SUPPLIES_QUERY = gql`
  query Supplies {
    supplies(includeInactive: true) { ${SUPPLY_FIELDS} }
  }
`;

export const SUPPLY_MOVEMENTS_QUERY = gql`
  query SupplyMovements($supplyId: ID!, $limit: Int, $offset: Int) {
    supplyMovements(supplyId: $supplyId, limit: $limit, offset: $offset) {
      id delta reason orderCode staffName note countedQty createdAt
    }
  }
`;

export const RECIPES_QUERY = gql`
  query Recipes {
    recipes {
      menuItemId
      lines { supply { ${SUPPLY_FIELDS} } qty onlyTakeaway }
    }
  }
`;

// Con los productos no disponibles: la receta de algo agotado hoy tambien hay que poder editarla.
export const RECIPE_MENU_QUERY = gql`
  query RecipeMenu {
    menu {
      id
      name
      items(includeUnavailable: true) { id name available }
    }
  }
`;

export const CREATE_SUPPLY = gql`
  mutation CreateSupply($input: SupplyInput!, $initialStock: Float) {
    createSupply(input: $input, initialStock: $initialStock) { ${SUPPLY_FIELDS} }
  }
`;
export const UPDATE_SUPPLY = gql`
  mutation UpdateSupply($id: ID!, $input: SupplyInput!) {
    updateSupply(id: $id, input: $input) { ${SUPPLY_FIELDS} }
  }
`;
export const SET_SUPPLY_ACTIVE = gql`
  mutation SetSupplyActive($id: ID!, $active: Boolean!) {
    setSupplyActive(id: $id, active: $active) { ${SUPPLY_FIELDS} }
  }
`;
export const DELETE_SUPPLY = gql`
  mutation DeleteSupply($id: ID!) { deleteSupply(id: $id) }
`;
export const RECORD_ENTRY = gql`
  mutation RecordStockEntry($supplyId: ID!, $qty: Float!, $note: String) {
    recordStockEntry(supplyId: $supplyId, qty: $qty, note: $note) { ${SUPPLY_FIELDS} }
  }
`;
export const RECORD_WASTE = gql`
  mutation RecordWaste($supplyId: ID!, $qty: Float!, $note: String!) {
    recordWaste(supplyId: $supplyId, qty: $qty, note: $note) { ${SUPPLY_FIELDS} }
  }
`;
export const ADJUST_STOCK = gql`
  mutation AdjustStock($supplyId: ID!, $delta: Float!, $note: String!) {
    adjustStock(supplyId: $supplyId, delta: $delta, note: $note) { ${SUPPLY_FIELDS} }
  }
`;
export const RECORD_COUNT = gql`
  mutation RecordStockCount($counts: [StockCountInput!]!, $note: String) {
    recordStockCount(counts: $counts, note: $note) { ${SUPPLY_FIELDS} }
  }
`;
export const SET_RECIPE = gql`
  mutation SetRecipe($menuItemId: ID!, $lines: [RecipeLineInput!]!) {
    setRecipe(menuItemId: $menuItemId, lines: $lines) { menuItemId }
  }
`;

const INVENTORY_ALERTS = gql`
  subscription InventoryAlerts {
    inventoryAlerts { supplyId name stock minStock unit }
  }
`;

export const UNIT_LABELS: Record<SupplyUnit, string> = { g: "gramos", ml: "mililitros", ud: "unidades" };

export const REASON_LABELS: Record<StockReason, string> = {
  compra: "Entrada",
  consumo: "Consumo",
  merma: "Merma",
  conteo: "Conteo",
  ajuste: "Ajuste",
};

/** Unidades en que se puede teclear una cantidad: 5 kg es mas facil que 5000 g. */
export function inputUnits(unit: SupplyUnit) {
  if (unit === "g") return [{ label: "g", factor: 1 }, { label: "kg", factor: 1000 }];
  if (unit === "ml") return [{ label: "ml", factor: 1 }, { label: "L", factor: 1000 }];
  return [{ label: "ud", factor: 1 }];
}

/** 1500 g -> "1,5 kg"; 250 ml -> "250 ml"; 12 ud -> "12 ud". */
export function formatQty(qty: number, unit: SupplyUnit) {
  const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 2 });
  if (unit !== "ud" && Math.abs(qty) >= 1000) return `${fmt(qty / 1000)} ${unit === "g" ? "kg" : "L"}`;
  return `${fmt(qty)} ${unit}`;
}

export function formatDelta(qty: number, unit: SupplyUnit) {
  return `${qty > 0 ? "+" : qty < 0 ? "−" : "±"}${formatQty(Math.abs(qty), unit)}`;
}

/**
 * Insumos bajo minimo (para la insignia de la pestaña) y aviso en vivo cuando uno cruza el
 * minimo. Al llegar un aviso se vuelve a pedir la lista: los consumos automaticos de los pedidos
 * entregados no pasan por las mutaciones de esta web, asi que la cache no se entera sola.
 */
export function useInventoryAlerts(enabled: Ref<boolean>) {
  const { result, refetch } = useQuery<{ supplies: Supply[] }>(SUPPLIES_QUERY, null, () => ({
    enabled: enabled.value,
    fetchPolicy: "cache-and-network",
  }));
  const lowCount = computed(() => (result.value?.supplies ?? []).filter((s) => s.active && s.low).length);

  const lastAlert = ref<SupplyAlert | null>(null);
  const { onResult, onError } = useSubscription(INVENTORY_ALERTS, null, () => ({ enabled: enabled.value }));
  onError((err: any) => {
    // eslint-disable-next-line no-console
    console.error("[useInventoryAlerts] error en la suscripcion", err);
  });
  onResult((r: any) => {
    const alert = r.data?.inventoryAlerts;
    if (!alert) return;
    lastAlert.value = alert;
    refetch();
  });

  return { lowCount, lastAlert };
}

/** Opciones de la carta (Leche: Avena...) y el insumo que es cada una. */
export const OPTION_SUPPLIES_QUERY = gql`
  query OptionSupplies {
    modifierGroups {
      id
      name
      options(includeUnavailable: true) {
        id
        name
      }
    }
    optionSupplies {
      optionId
      qty
      supply {
        id
      }
    }
  }
`;

export const SET_OPTION_SUPPLY = gql`
  mutation SetOptionSupply($optionId: ID!, $supplyId: ID, $qty: Float) {
    setOptionSupply(optionId: $optionId, supplyId: $supplyId, qty: $qty) {
      optionId
    }
  }
`;
