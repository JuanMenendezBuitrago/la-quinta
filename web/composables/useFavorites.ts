import { gql } from "graphql-tag";
import { useAuth } from "~/composables/useAuth";
import type { MenuEntry } from "~/composables/useMenu";

const MY_FAVORITES = gql`
  query MyFavoriteMenuItemIds {
    myFavoriteMenuItemIds
  }
`;

const SET_FAVORITES = gql`
  mutation SetFavoriteMenuItems($menuItemIds: [ID!]!, $favorite: Boolean!) {
    setFavoriteMenuItems(menuItemIds: $menuItemIds, favorite: $favorite)
  }
`;

/** Ids de producto de una entrada de la carta: un cafe con varios tamaños son varios productos. */
function entryMenuItemIds(entry: MenuEntry): string[] {
  return entry.sizes ? entry.sizes.map((s) => s.menuItemId) : [entry.id];
}

/**
 * Productos favoritos del cliente con sesion. Se cargan al iniciar sesion y se vacian al salir;
 * sin sesion, marcar un favorito lleva a "Mi cuenta" para entrar.
 */
export function useFavorites() {
  const { customer } = useAuth();
  const ids = useState<string[]>("lq-favorites", () => []);
  const { mutate: setFavorites } = useMutation(SET_FAVORITES);

  if (import.meta.client) {
    watch(
      () => customer.value?.id,
      async (customerId) => {
        if (!customerId) {
          ids.value = [];
          return;
        }
        try {
          const { defaultClient } = useNuxtApp().$apollo;
          const { data } = await defaultClient.query({ query: MY_FAVORITES, fetchPolicy: "network-only" });
          ids.value = data?.myFavoriteMenuItemIds ?? [];
        } catch {
          // sin favoritos si falla: la carta sigue funcionando igual
        }
      },
      { immediate: true }
    );
  }

  const idSet = computed(() => new Set(ids.value));

  /** Un cafe con varios tamaños es favorito si lo es cualquiera de ellos. */
  function isFavorite(entry: MenuEntry) {
    return entryMenuItemIds(entry).some((id) => idSet.value.has(id));
  }

  async function toggleFavorite(entry: MenuEntry) {
    if (!customer.value) {
      await navigateTo("/cuenta");
      return;
    }
    const favorite = !isFavorite(entry);
    const menuItemIds = entryMenuItemIds(entry);
    const previous = ids.value;
    // Optimista: el corazon cambia al momento; si la API falla, se deshace.
    ids.value = favorite ? [...new Set([...previous, ...menuItemIds])] : previous.filter((id) => !menuItemIds.includes(id));
    try {
      const result = await setFavorites({ menuItemIds, favorite });
      if (result?.data?.setFavoriteMenuItems) ids.value = result.data.setFavoriteMenuItems;
    } catch {
      ids.value = previous;
    }
  }

  return { favoriteIds: ids, isFavorite, toggleFavorite };
}
