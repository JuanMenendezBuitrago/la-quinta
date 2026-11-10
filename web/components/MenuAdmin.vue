<template>
  <!-- Pantallas anchas apaisadas: productos (agrupados por categoria) a la izquierda y personalizaciones
       a la derecha. En movil, una pestaña para cada parte. Las categorias se crean, renombran y
       reordenan (arrastrando su asa) en la propia lista de productos. -->
  <section class="menu-admin wide-layout" :data-tab="mobileTab">
    <!-- Movil y vertical: pestañas arriba, se ve una parte cada vez (en pantalla ancha, todo a la vez) -->
    <MobileTabs v-model="mobileTab" :tabs="mobileTabs" label="Partes de la carta" />
    <aside class="wide-aside">
    <!-- Personalizaciones: grupos reutilizables (p. ej. Leche) que se asignan a los productos -->
    <section class="groups-admin">
      <div class="categories-header">
        <h3>Personalizaciones</h3>
        <button class="button secondary" :disabled="groupFormOpen" @click="startCreateGroup">+ Nueva personalización</button>
      </div>
      <p class="muted">Opciones que se eligen al pedir, como el tipo de leche. Se asignan a cada producto al editarlo.</p>

      <!-- Crear o editar una personalizacion: en un modal, encima de la carta -->
      <dialog ref="groupDialog" class="group-dialog" aria-labelledby="group-dialog-title" @click.self="closeGroupForm" @close="groupFormOpen = false">
      <form v-if="groupFormOpen" class="group-form" @submit.prevent="submitGroup">
        <div class="dialog-head">
          <h2 id="group-dialog-title">{{ groupForm.id ? "Editar personalización" : "Nueva personalización" }}</h2>
          <button type="button" class="close" aria-label="Cerrar" @click="closeGroupForm">×</button>
        </div>
        <label class="field">
          <span class="muted">Nombre</span>
          <input v-model="groupForm.name" type="text" required maxlength="60" placeholder="Ej. Leche" />
        </label>
        <label class="field-inline">
          <input v-model="groupForm.required" type="checkbox" role="switch" />
          <span>Obligatoria: siempre se elige una (como el tipo de leche)</span>
        </label>
        <span class="muted">Sin marcar, es opcional: se puede pedir sin ninguna (como una adición).</span>
        <div class="field">
          <span class="muted">Opciones — se elige una como máximo</span>
          <div v-for="(option, i) in groupForm.options" :key="i" class="option-row">
            <input v-model="option.name" type="text" required maxlength="60" placeholder="Ej. Avena" aria-label="Nombre de la opción" />
            <input v-model.number="option.priceDeltaCents" type="number" min="0" step="100" required aria-label="Suplemento (COP)" />
            <label class="field-inline">
              <input v-model="option.available" type="checkbox" role="switch" />
              <span class="muted">Hay</span>
            </label>
            <button class="button secondary" type="button" :disabled="groupForm.options.length === 1" @click="groupForm.options.splice(i, 1)">
              Quitar
            </button>
          </div>
          <span class="muted">Segunda columna: suplemento en COP (0 = sin recargo). Desmarca "Hay" cuando se agote.</span>
          <button class="button secondary" type="button" @click="groupForm.options.push(emptyOption())">+ Añadir opción</button>
        </div>
        <p v-if="groupFormError" class="muted" style="color: var(--danger)">{{ groupFormError }}</p>
        <div class="form-actions">
          <button class="button" type="submit" :disabled="savingGroup">{{ savingGroup ? "Guardando…" : "Guardar" }}</button>
          <button class="button secondary cancel" type="button" :disabled="savingGroup" @click="closeGroupForm"><X :size="16" :stroke-width="1.8" aria-hidden="true" /> Cancelar</button>
        </div>
      </form>
      </dialog>


      <EmptyState v-if="!groups.length" compact :icon="SlidersHorizontal" title="Todavía no hay personalizaciones" />
      <!-- Botones debajo de la descripcion (no a la derecha): las opciones necesitan todo el ancho -->
      <div v-for="group in groups" :key="group.id" class="card category-row group-row">
        <div class="item-info">
          <span class="category-name">{{ group.name }}</span>
          <span class="muted"> · {{ group.minSelect ? "obligatoria" : "opcional" }}</span>
          <p class="muted">
            <template v-for="(o, i) in group.options" :key="o.id">
              <span v-if="i"> · </span>
              <span :class="{ 'option-out': !o.available }">{{ o.name }}{{ o.priceDeltaCents ? ` +${formatPrice(o.priceDeltaCents)}` : "" }}{{ o.available ? "" : " (agotada)" }}</span>
            </template>
          </p>
          <p class="muted">{{ productsUsing(group.id) }}</p>
          <p v-if="productsWithoutDefault(group).length" class="muted" style="color: var(--danger)">
            Sin opción normal: {{ productsWithoutDefault(group).join(", ") }}. Elígela al editar cada producto.
          </p>
          <p v-if="groupDeleteError === group.id" class="muted" style="color: var(--danger)">No se pudo borrar</p>
        </div>
        <div v-if="pendingGroupDeleteId === group.id" class="category-actions">
          <span class="muted">¿Borrar? Se quitará de los productos</span>
          <button class="button secondary delete" type="button" @click="confirmRemoveGroup(group)"><Trash2 :size="16" :stroke-width="1.8" aria-hidden="true" /> Sí</button>
          <button class="button secondary" type="button" @click="pendingGroupDeleteId = ''">No</button>
        </div>
        <div v-else class="category-actions">
          <button class="button secondary" type="button" :disabled="groupFormOpen" @click="startEditGroup(group)">Editar</button>
          <button class="button secondary delete" type="button" @click="pendingGroupDeleteId = group.id"><Trash2 :size="16" :stroke-width="1.8" aria-hidden="true" /> Borrar</button>
        </div>
      </div>
    </section>
    </aside>

    <div class="wide-main">
    <!-- En la cabecera de la seccion, a la derecha (solo en cliente: Teleport fuera de #teleports no se renderiza en SSR) -->
    <ClientOnly>
      <Teleport to="#staff-hero-actions">
        <button class="button secondary" type="button" @click="openCategoryDialog()">+ Nueva categoría</button>
        <button class="button" :disabled="formOpen" @click="startCreate()">+ Nuevo producto</button>
      </Teleport>
    </ClientOnly>

    <p v-if="loading" class="muted">Cargando carta…</p>
    <p v-if="loadError" class="muted" style="color: var(--danger)">{{ loadError }}</p>

    <!-- Nuevo producto: aqui arriba. Al editar uno, el formulario se abre justo debajo de el (en su hueco
         #item-form-slot-<id>, que existe siempre, aunque vacio, para que Teleport lo encuentre). -->
    <Teleport v-if="formOpen" defer :to="form.id ? `#item-form-slot-${form.id}` : 'body'" :disabled="!form.id">
    <form class="card item-form" @submit.prevent="submitForm">
      <h3>{{ form.id ? "Editar producto" : "Nuevo producto" }}</h3>

      <label class="field">
        <span class="muted">Categoría</span>
        <select v-model="form.categoryId" required>
          <option v-for="category in categories" :key="category.id" :value="category.id">
            {{ category.name }}
          </option>
        </select>
      </label>

      <label class="field">
        <span class="muted">Nombre</span>
        <input v-model="form.name" type="text" required maxlength="120" />
      </label>

      <label class="field">
        <span class="muted">Descripción</span>
        <textarea v-model="form.description" rows="2" maxlength="400"></textarea>
      </label>

      <label class="field">
        <span class="muted">Precio (COP)</span>
        <input v-model.number="form.priceCents" type="number" min="0" step="100" required />
      </label>

      <label class="field">
        <span class="muted">Imagen</span>
        <!-- text, no url: al subir un archivo queda una ruta relativa (/uploads/…), que type="url" rechaza -->
        <input v-model="form.imageUrl" type="text" inputmode="url" placeholder="https://… (o sube un archivo)" />
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" :disabled="uploading" @change="handleImageUpload" />
        <span v-if="uploading" class="muted">Subiendo imagen…</span>
        <span v-if="uploadError" class="muted" style="color: var(--danger)">{{ uploadError }}</span>
        <img v-if="form.imageUrl" :src="resolveImageUrl(form.imageUrl) ?? undefined" alt="" class="image-preview" />
      </label>

      <div v-if="groups.length" class="field">
        <span class="muted">Personalizaciones</span>
        <div v-for="group in groups" :key="group.id" class="modifier-row">
          <label class="field-inline">
            <input
              type="checkbox"
              role="switch"
              :checked="form.modifiers.some((m) => m.groupId === group.id)"
              @change="toggleModifier(group, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ group.name }}</span>
          </label>
          <select
            v-if="modifierOf(group.id)"
            v-model="modifierOf(group.id)!.defaultOptionId"
            :required="group.minSelect > 0"
            :aria-label="`${group.name} por defecto`"
          >
            <option value="" :disabled="group.minSelect > 0">
              {{ group.minSelect > 0 ? "¿Cuál lleva normalmente?" : "Normalmente: ninguna" }}
            </option>
            <option v-for="o in group.options" :key="o.id" :value="o.id">Normalmente: {{ o.name }}</option>
          </select>
        </div>
        <span class="muted">La opción "normal" es la de la receta: se sirve si no piden otra y no suma suplemento aparte del suyo. En las opcionales suele ser "ninguna".</span>
      </div>

      <label class="field-inline">
        <input v-model="form.available" type="checkbox" role="switch" />
        <span class="muted">Disponible en la carta</span>
      </label>

      <p v-if="formError" class="muted" style="color: var(--danger)">{{ formError }}</p>

      <div class="form-actions">
        <button class="button" type="submit" :disabled="saving">
          {{ saving ? "Guardando…" : "Guardar" }}
        </button>
        <button class="button secondary cancel" type="button" :disabled="saving" @click="cancelForm">
          <X :size="16" :stroke-width="1.8" aria-hidden="true" />
          Cancelar
        </button>
      </div>
    </form>
    </Teleport>

    <!-- Una categoria por grupo plegable, como en Recetas y Conteo; empiezan plegadas. El formulario
         de edicion vive dentro (v-show): plegar el grupo no pierde lo escrito. -->
    <p class="muted categories-hint">Arrastra <GripVertical :size="14" :stroke-width="2" aria-hidden="true" class="inline-icon" /> para cambiar el orden de las categorías.</p>
    <p v-if="reorderError" class="muted" style="color: var(--danger)">{{ reorderError }}</p>
    <!-- Crear o renombrar una categoria -->
    <dialog ref="categoryDialog" class="group-dialog category-dialog" aria-labelledby="category-dialog-title" @click.self="closeCategoryDialog">
      <form class="group-form" @submit.prevent="submitCategory">
        <div class="dialog-head">
          <h2 id="category-dialog-title">{{ categoryForm.id ? "Editar categoría" : "Nueva categoría" }}</h2>
          <button type="button" class="close" aria-label="Cerrar" @click="closeCategoryDialog">×</button>
        </div>
        <label class="field">
          <span class="muted">Nombre</span>
          <input v-model="categoryForm.name" type="text" required maxlength="80" placeholder="Ej. Bebidas Calientes" />
        </label>
        <p v-if="categoryFormError" class="muted" style="color: var(--danger)">{{ categoryFormError }}</p>
        <div class="form-actions">
          <button class="button" type="submit" :disabled="savingCategory">{{ savingCategory ? "Guardando…" : "Guardar" }}</button>
          <button class="button secondary cancel" type="button" :disabled="savingCategory" @click="closeCategoryDialog"><X :size="16" :stroke-width="1.8" aria-hidden="true" /> Cancelar</button>
        </div>
      </form>
    </dialog>


    <CollapsibleGroup
      v-for="category in orderedCategories"
      :key="category.id"
      class="category"
      :class="{ dragging: dragId === category.id }"
      :data-category-id="category.id"
      :title="category.name"
      :open="isOpen(category.id)"
      @update:open="toggleCategory(category.id)"
    >
      <template #handle>
        <!-- Asa: se arrastra con raton o dedo; con el teclado, flechas arriba y abajo -->
        <button
          type="button"
          class="drag-handle"
          :aria-label="`Mover ${category.name} (flechas arriba y abajo)`"
          title="Arrastra para cambiar el orden"
          @pointerdown="startDrag($event, category.id)"
          @keydown.up.prevent="moveByKey(category.id, -1)"
          @keydown.down.prevent="moveByKey(category.id, 1)"
        >
          <GripVertical :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
      </template>
      <template #meta>{{ category.items.length }}</template>
      <template #actions>
        <button type="button" class="icon-button" :aria-label="`Editar el nombre de ${category.name}`" title="Editar nombre" @click="openCategoryDialog(category)">
          <Pencil :size="16" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </template>
      <template v-for="item in category.items" :key="item.id">
      <div class="card item-row" :class="{ unavailable: !item.available, editing: formOpen && form.id === item.id }">
        <img v-if="item.imageUrl" :src="resolveImageUrl(item.imageUrl) ?? undefined" alt="" class="thumb" />
        <div class="item-info">
          <strong>{{ item.name }}</strong>
          <span v-if="!item.available" class="muted"> · oculto</span>
          <p v-if="item.description" class="muted">{{ item.description }}</p>
          <p class="muted">{{ formatPrice(item.priceCents) }}</p>
          <p v-if="item.modifiers.length" class="item-modifiers">
            <span v-for="m in item.modifiers" :key="m.group.id" class="modifier-chip" :title="modifierTitle(m)">
              {{ m.group.name }}<span class="muted">: {{ modifierDefaultLabel(m) }}</span>
            </span>
          </p>
          <p v-if="missingDefaults(item).length" class="muted" style="color: var(--danger)">
            Elige qué lleva normalmente de: {{ missingDefaults(item).join(", ") }}
          </p>
          <p v-if="deleteError === item.id" class="muted" style="color: var(--danger)">No se pudo borrar el producto</p>
        </div>
        <!-- Bolsas de cafe: nombre, precio y disponibilidad los fija su cafe al guardarlo -->
        <div v-if="item.coffee" class="item-actions">
          <NuxtLink class="button secondary" style="text-decoration: none" :to="{ query: { s: 'cafe' } }">Editar en Café en grano</NuxtLink>
        </div>
        <div v-else-if="pendingDeleteId === item.id" class="item-actions">
          <span class="muted">¿Borrar?</span>
          <button class="button secondary delete" type="button" :disabled="deleting" @click="confirmRemove(item)"><Trash2 :size="16" :stroke-width="1.8" aria-hidden="true" /> Sí</button>
          <button class="button secondary" type="button" :disabled="deleting" @click="pendingDeleteId = ''">No</button>
        </div>
        <div v-else class="item-actions">
          <button class="button secondary" type="button" @click="startEdit(item, category.id)">Editar</button>
          <button class="button secondary delete" type="button" @click="pendingDeleteId = item.id"><Trash2 :size="16" :stroke-width="1.8" aria-hidden="true" /> Borrar</button>
        </div>
      </div>
      <div :id="`item-form-slot-${item.id}`" />
      </template>
      <EmptyState v-if="!category.items.length" compact :icon="PackageOpen" title="Sin productos en esta categoría" />
    </CollapsibleGroup>
    </div>
  </section>
</template>

<script setup lang="ts">
import MobileTabs from "~/components/MobileTabs.vue";
import EmptyState from "~/components/EmptyState.vue";
import CollapsibleGroup from "~/components/CollapsibleGroup.vue";
import { GripVertical, PackageOpen, Pencil, SlidersHorizontal, Trash2, X } from "lucide-vue-next";
import { gql } from "graphql-tag";

interface ModifierOptionAdmin {
  id: string;
  name: string;
  priceDeltaCents: number;
  available: boolean;
}

interface ModifierGroupAdmin {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: ModifierOptionAdmin[];
}

interface MenuItemAdmin {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  available: boolean;
  modifiers: { defaultOptionId: string | null; group: { id: string; name: string; minSelect: number } }[];
  /** Bolsa de cafe en grano: se edita desde su cafe, no aqui. */
  coffee: { id: string } | null;
}

interface MenuCategoryAdmin {
  id: string;
  name: string;
  order: number;
  items: MenuItemAdmin[];
}

const ADMIN_MENU_QUERY = gql`
  query AdminMenu {
    menu {
      id
      name
      order
      items(includeUnavailable: true) {
        id
        name
        description
        priceCents
        imageUrl
        available
        coffee {
          id
        }
        modifiers {
          defaultOptionId
          group {
            id
            name
            minSelect
          }
        }
      }
    }
    modifierGroups {
      id
      name
      minSelect
      maxSelect
      options(includeUnavailable: true) {
        id
        name
        priceDeltaCents
        available
      }
    }
  }
`;

const CREATE_MODIFIER_GROUP = gql`
  mutation CreateModifierGroup($input: ModifierGroupInput!) {
    createModifierGroup(input: $input) {
      id
    }
  }
`;

const UPDATE_MODIFIER_GROUP = gql`
  mutation UpdateModifierGroup($id: ID!, $input: ModifierGroupInput!) {
    updateModifierGroup(id: $id, input: $input) {
      id
    }
  }
`;

const DELETE_MODIFIER_GROUP = gql`
  mutation DeleteModifierGroup($id: ID!) {
    deleteModifierGroup(id: $id)
  }
`;

const CREATE_MENU_CATEGORY = gql`
  mutation CreateMenuCategory($name: String!, $order: Int) {
    createMenuCategory(name: $name, order: $order) {
      id
    }
  }
`;

const UPDATE_MENU_CATEGORY = gql`
  mutation UpdateMenuCategory($id: ID!, $name: String, $order: Int) {
    updateMenuCategory(id: $id, name: $name, order: $order) {
      id
    }
  }
`;

const CREATE_MENU_ITEM = gql`
  mutation CreateMenuItem($input: MenuItemInput!) {
    createMenuItem(input: $input) {
      id
    }
  }
`;

const UPDATE_MENU_ITEM = gql`
  mutation UpdateMenuItem($id: ID!, $input: MenuItemInput!) {
    updateMenuItem(id: $id, input: $input) {
      id
    }
  }
`;

const DELETE_MENU_ITEM = gql`
  mutation DeleteMenuItem($id: ID!) {
    deleteMenuItem(id: $id)
  }
`;

const { result, loading, error, refetch } = useQuery<{ menu: MenuCategoryAdmin[]; modifierGroups: ModifierGroupAdmin[] }>(
  ADMIN_MENU_QUERY
);
const categories = computed(() => result.value?.menu ?? []);
const groups = computed(() => result.value?.modifierGroups ?? []);
const loadError = computed(() => (error.value ? "No se pudo cargar la carta." : ""));
const { resolveImageUrl } = useImageUrl();

// --- Categorías: crear y renombrar (en un modal) y reordenar arrastrando en la lista. Sin borrar,
// para no dejar productos huérfanos. ---
const categoryDialog = ref<HTMLDialogElement | null>(null);
const savingCategory = ref(false);
const categoryFormError = ref("");
const categoryForm = reactive({ id: "", name: "" });

function openCategoryDialog(category?: MenuCategoryAdmin) {
  Object.assign(categoryForm, { id: category?.id ?? "", name: category?.name ?? "" });
  categoryFormError.value = "";
  mobileTab.value = "productos";
  categoryDialog.value?.showModal();
}

function closeCategoryDialog() {
  if (!savingCategory.value) categoryDialog.value?.close();
}

async function submitCategory() {
  const name = categoryForm.name.trim();
  if (!name) return;
  savingCategory.value = true;
  categoryFormError.value = "";
  try {
    if (categoryForm.id) {
      const { mutate } = useMutation(UPDATE_MENU_CATEGORY);
      await mutate({ id: categoryForm.id, name });
    } else {
      const { mutate } = useMutation(CREATE_MENU_CATEGORY);
      // Al final de la lista
      await mutate({ name, order: Math.max(-1, ...categories.value.map((c) => c.order)) + 1 });
    }
    await refetch();
    categoryDialog.value?.close();
  } catch (err: any) {
    categoryFormError.value = err?.message ?? "No se pudo guardar la categoría";
  } finally {
    savingCategory.value = false;
  }
}

// Orden mientras se arrastra (ids); null: el de la carta.
const dragOrder = ref<string[] | null>(null);
const dragId = ref("");
const reorderError = ref("");
const orderedCategories = computed(() => {
  if (!dragOrder.value) return categories.value;
  const byId = new Map(categories.value.map((c) => [c.id, c]));
  return dragOrder.value.flatMap((id) => byId.get(id) ?? []);
});

// Con eventos de puntero (raton y pantalla tactil) en window: al reordenar, Vue mueve el elemento
// arrastrado en el DOM y perderia la captura del puntero.
function startDrag(event: PointerEvent, id: string) {
  if (event.button !== 0 || dragId.value) return;
  event.preventDefault();
  reorderError.value = "";
  dragId.value = id;
  dragOrder.value = categories.value.map((c) => c.id);
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
}

function onDragMove(event: PointerEvent) {
  if (!dragId.value) return;
  // Se coloca delante de la primera categoria cuya cabecera quede por debajo del puntero
  const others = [...document.querySelectorAll<HTMLElement>(".menu-admin [data-category-id]")].filter(
    (el) => el.dataset.categoryId !== dragId.value
  );
  let index = others.findIndex((el) => {
    const r = (el.querySelector(".group-title") ?? el).getBoundingClientRect();
    return event.clientY < r.top + r.height / 2;
  });
  if (index === -1) index = others.length;
  const ids = others.map((el) => el.dataset.categoryId!);
  ids.splice(index, 0, dragId.value);
  if (ids.join() !== dragOrder.value?.join()) dragOrder.value = ids;
  // Cerca de los bordes, la pagina se desplaza sola
  if (event.clientY < 90) window.scrollBy(0, -14);
  else if (event.clientY > window.innerHeight - 110) window.scrollBy(0, 14);
}

function endDrag() {
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);
  const ids = dragOrder.value;
  dragId.value = "";
  if (ids) saveOrder(ids);
}
onBeforeUnmount(endDrag);

function moveByKey(id: string, delta: number) {
  const ids = categories.value.map((c) => c.id);
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return;
  ids.splice(to, 0, ...ids.splice(from, 1));
  dragOrder.value = ids;
  saveOrder(ids).then(() => {
    // El foco sigue en el asa de la categoria movida
    nextTick(() => document.querySelector<HTMLElement>(`.menu-admin [data-category-id="${id}"] .drag-handle`)?.focus());
  });
}

// Guarda como `order` la posicion de cada categoria (solo las que cambian).
async function saveOrder(ids: string[]) {
  const changed = ids
    .map((id, order) => ({ id, order }))
    .filter(({ id, order }) => categories.value.find((c) => c.id === id)?.order !== order);
  try {
    if (changed.length) {
      const { mutate } = useMutation(UPDATE_MENU_CATEGORY);
      await Promise.all(changed.map((c) => mutate(c)));
      await refetch();
    }
  } catch {
    reorderError.value = "No se pudo guardar el orden de las categorías";
  } finally {
    dragOrder.value = null;
  }
}

// --- Personalizaciones de una opcion como maximo: obligatorias (Leche) u opcionales (Adicion) ---
const groupFormOpen = ref(false);
const groupDialog = ref<HTMLDialogElement | null>(null);
// El modal se abre al abrir el formulario (ya pintado) y se cierra con el; Esc o el fondo lo cierran tambien.
watch(groupFormOpen, (open) => {
  if (open && !groupDialog.value?.open) groupDialog.value?.showModal();
  if (!open && groupDialog.value?.open) groupDialog.value.close();
}, { flush: "post" });

function closeGroupForm() {
  if (!savingGroup.value) groupFormOpen.value = false;
}
const savingGroup = ref(false);
const groupFormError = ref("");

function emptyOption() {
  return { id: "" as string, name: "", priceDeltaCents: 0, available: true };
}

const groupForm = reactive({ id: "", name: "", required: true, options: [emptyOption()] });

function startCreateGroup() {
  Object.assign(groupForm, { id: "", name: "", required: true, options: [emptyOption(), emptyOption()] });
  groupFormError.value = "";
  groupFormOpen.value = true;
}

function startEditGroup(group: ModifierGroupAdmin) {
  Object.assign(groupForm, {
    id: group.id,
    name: group.name,
    required: group.minSelect > 0,
    options: group.options.map((o) => ({ ...o })),
  });
  groupFormError.value = "";
  groupFormOpen.value = true;
}

async function submitGroup() {
  savingGroup.value = true;
  groupFormError.value = "";
  try {
    const input = {
      name: groupForm.name.trim(),
      minSelect: groupForm.required ? 1 : 0,
      maxSelect: 1,
      options: groupForm.options.map((o) => ({
        id: o.id || null,
        name: o.name.trim(),
        priceDeltaCents: o.priceDeltaCents || 0,
        available: o.available,
      })),
    };
    if (groupForm.id) {
      const { mutate } = useMutation(UPDATE_MODIFIER_GROUP);
      await mutate({ id: groupForm.id, input });
    } else {
      const { mutate } = useMutation(CREATE_MODIFIER_GROUP);
      await mutate({ input });
    }
    await refetch();
    groupFormOpen.value = false;
  } catch (err: any) {
    groupFormError.value = err?.message ?? "No se pudo guardar la personalización";
  } finally {
    savingGroup.value = false;
  }
}

const pendingGroupDeleteId = ref("");
const groupDeleteError = ref("");

async function confirmRemoveGroup(group: ModifierGroupAdmin) {
  groupDeleteError.value = "";
  try {
    const { mutate } = useMutation(DELETE_MODIFIER_GROUP);
    await mutate({ id: group.id });
    await refetch();
  } catch {
    groupDeleteError.value = group.id;
  } finally {
    pendingGroupDeleteId.value = "";
  }
}

// Lo que lleva normalmente el producto en ese grupo (el nombre se busca en el grupo, que tiene las opciones).
function modifierDefaultLabel(m: MenuItemAdmin["modifiers"][number]) {
  const option = m.defaultOptionId ? groups.value.find((g) => g.id === m.group.id)?.options.find((o) => o.id === m.defaultOptionId) : null;
  if (option) return option.name;
  return m.group.minSelect > 0 ? "sin elegir" : "ninguna";
}

function modifierTitle(m: MenuItemAdmin["modifiers"][number]) {
  return `${m.group.name} (${m.group.minSelect > 0 ? "obligatoria" : "opcional"}) · normalmente: ${modifierDefaultLabel(m)}`;
}

// Grupos obligatorios sin opcion normal (se borro la que tenia): al pedirlo hay que elegirla cada vez.
function missingDefaults(item: MenuItemAdmin) {
  return item.modifiers.filter((m) => m.group.minSelect > 0 && !m.defaultOptionId).map((m) => m.group.name);
}

function productsWithoutDefault(group: ModifierGroupAdmin) {
  if (!group.minSelect) return [];
  return categories.value
    .flatMap((c) => c.items)
    .filter((i) => i.modifiers.some((m) => m.group.id === group.id && !m.defaultOptionId))
    .map((i) => i.name);
}

function productsUsing(groupId: string) {
  const names = categories.value.flatMap((c) => c.items).filter((i) => i.modifiers.some((m) => m.group.id === groupId)).map((i) => i.name);
  return names.length ? `En: ${names.join(", ")}` : "Sin productos asignados";
}

const formOpen = ref(false);
const saving = ref(false);
const formError = ref("");

function emptyForm() {
  return {
    id: "" as string,
    categoryId: "",
    name: "",
    description: "",
    priceCents: 0,
    imageUrl: "",
    available: true,
    modifiers: [] as { groupId: string; defaultOptionId: string }[],
  };
}

function modifierOf(groupId: string) {
  return form.modifiers.find((m) => m.groupId === groupId);
}

function toggleModifier(group: ModifierGroupAdmin, checked: boolean) {
  // Obligatoria: se propone la primera; opcional: sin ninguna por defecto.
  const defaultOptionId = group.minSelect > 0 ? group.options[0]?.id ?? "" : "";
  if (checked) form.modifiers.push({ groupId: group.id, defaultOptionId });
  else form.modifiers = form.modifiers.filter((m) => m.groupId !== group.id);
}

const form = reactive(emptyForm());

// --- Pestañas en movil ---
type MobileTab = "productos" | "personalizaciones";
const mobileTabs = computed(() => [
  { id: "productos", label: "Productos", count: categories.value.reduce((n, c) => n + c.items.length, 0) },
  { id: "personalizaciones", label: "Personalizaciones", count: groups.value.length },
]);
const mobileTab = ref<MobileTab>("productos");

const openCategories = ref(new Set<string>());
function isOpen(id: string) {
  return openCategories.value.has(id);
}
function toggleCategory(id: string) {
  const next = new Set(openCategories.value);
  if (!next.delete(id)) next.add(id);
  openCategories.value = next;
}

function startCreate(categoryId?: string) {
  // "+ Nuevo producto" esta en la cabecera: se puede pulsar desde otra pestaña
  mobileTab.value = "productos";
  Object.assign(form, emptyForm());
  form.categoryId = categoryId ?? categories.value[0]?.id ?? "";
  formError.value = "";
  formOpen.value = true;
}

function startEdit(item: MenuItemAdmin, categoryId: string) {
  Object.assign(form, {
    id: item.id,
    categoryId,
    name: item.name,
    description: item.description ?? "",
    priceCents: item.priceCents,
    imageUrl: item.imageUrl ?? "",
    available: item.available,
    modifiers: item.modifiers.map((m) => ({ groupId: m.group.id, defaultOptionId: m.defaultOptionId ?? "" })),
  });
  formError.value = "";
  formOpen.value = true;
}

function cancelForm() {
  formOpen.value = false;
  formError.value = "";
}

const { uploading, uploadError, uploadFromInput } = useImageUpload();

async function handleImageUpload(event: Event) {
  const url = await uploadFromInput(event);
  if (url) form.imageUrl = url;
}

async function submitForm() {
  saving.value = true;
  formError.value = "";
  try {
    const input = {
      categoryId: form.categoryId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      priceCents: form.priceCents,
      imageUrl: form.imageUrl.trim() || null,
      available: form.available,
      modifiers: form.modifiers.map((m) => ({ groupId: m.groupId, defaultOptionId: m.defaultOptionId || null })),
    };
    if (form.id) {
      const { mutate } = useMutation(UPDATE_MENU_ITEM);
      await mutate({ id: form.id, input });
    } else {
      const { mutate } = useMutation(CREATE_MENU_ITEM);
      await mutate({ input });
    }
    await refetch();
    formOpen.value = false;
    // Que se vea donde ha quedado (nuevo, o movido a otra categoria que estaba plegada)
    openCategories.value = new Set([...openCategories.value, input.categoryId]);
  } catch (err: any) {
    formError.value = err?.message ?? "No se pudo guardar el producto";
  } finally {
    saving.value = false;
  }
}

const pendingDeleteId = ref("");
const deleteError = ref("");
const deleting = ref(false);

async function confirmRemove(item: MenuItemAdmin) {
  deleting.value = true;
  deleteError.value = "";
  try {
    const { mutate } = useMutation(DELETE_MENU_ITEM);
    await mutate({ id: item.id });
    await refetch();
  } catch {
    deleteError.value = item.id;
  } finally {
    deleting.value = false;
    pendingDeleteId.value = "";
  }
}

function formatPrice(priceCents: number) {
  return priceCents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}
</script>

<style scoped>
@media (max-width: 999px), (orientation: portrait) {
  .menu-admin[data-tab="productos"] .wide-aside,
  .menu-admin[data-tab="personalizaciones"] .wide-main { display: none; }
  /* La parte visible empieza arriba, sin el margen ni la raya que la separaban de la siguiente */
  .menu-admin .groups-admin { margin-top: 0; border-bottom: none; }
}

.menu-admin { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border); }
.menu-admin .wide-main, .menu-admin .wide-aside { gap: 0; }
@media (min-width: 1000px) and (orientation: landscape) {
  .menu-admin .groups-admin { margin-top: 0; }
}

.categories-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 12px; margin-bottom: 10px; }
.category-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; }
.category-name { font-weight: 600; }
.category-actions { display: flex; gap: 6px; flex-shrink: 0; }
.group-row { flex-direction: column; align-items: stretch; }
/* Editar y Borrar (o Si y No al confirmar) a medias; el aviso de borrar, a todo el ancho encima */
.group-row .category-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.group-row .category-actions > span { grid-column: 1 / -1; }

.groups-admin { margin-top: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
.group-dialog {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  padding: 0;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
}
.group-dialog::backdrop { background: rgba(0, 0, 0, 0.45); }
.group-form { display: flex; flex-direction: column; gap: 10px; padding: 18px 20px 20px; }
.dialog-head { display: flex; align-items: center; justify-content: space-between; }
.dialog-head h2 { margin: 0; }
.close { width: 40px; height: 40px; border: none; background: transparent; color: var(--text-muted); font-size: 26px; line-height: 1; cursor: pointer; }
/* Movil: el suplemento y "Hay"/"Quitar" bajan a una segunda fila */
@media (max-width: 480px) {
  .option-row { grid-template-columns: minmax(0, 1fr) auto auto; }
  .option-row > input[type="text"] { grid-column: 1 / -1; }
}
.option-row { display: grid; grid-template-columns: minmax(0, 1fr) 96px auto auto; gap: 8px; align-items: center; }
.option-row input[type="text"], .option-row input[type="number"] { min-width: 0; }
.option-out { text-decoration: line-through; }
.modifier-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.modifier-row select { flex: 1; min-width: 180px; width: auto; }

/* Aire entre una categoria desplegada y la cabecera de la siguiente */
.category { margin-bottom: 12px; }
.categories-hint { margin: 0 0 4px; }
.inline-icon { vertical-align: -2px; }
.category-dialog { width: min(420px, calc(100vw - 32px)); }
/* Asa para arrastrar la categoria: touch-action none para que el dedo arrastre en vez de hacer scroll */
.drag-handle, .icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.drag-handle { cursor: grab; touch-action: none; }
.drag-handle:hover, .icon-button:hover { color: var(--text); background: var(--accent-soft); }
.drag-handle:focus-visible, .icon-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.category.dragging :deep(.group-title) { background: var(--accent-soft); border-radius: 8px; }
.category.dragging .drag-handle { cursor: grabbing; color: var(--accent); }
:global(body:has(.menu-admin .category.dragging)) { cursor: grabbing; user-select: none; }
.item-row { display: flex; align-items: center; gap: 14px; margin-top: 10px; }
.item-row.unavailable { opacity: 0.55; }
.item-row.editing { border-color: var(--accent); opacity: 1; }
.item-info { flex: 1; min-width: 0; }
.item-modifiers { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 0; }
.modifier-chip { padding: 2px 8px; border: 1px solid var(--field-border); border-radius: 999px; font-size: 12.5px; }
.item-actions { display: flex; gap: 8px; flex-shrink: 0; }
/* Columna estrecha (movil): los botones de cada producto bajan a su propia fila, a mitades */
.menu-admin .wide-main { container-type: inline-size; }
@container (max-width: 520px) {
  .item-row { flex-wrap: wrap; }
  .item-actions { flex: 1 1 100%; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; align-items: center; }
  .item-actions > .muted { grid-column: 1 / -1; }
}
.thumb { width: 48px; height: 48px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }

.item-form { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.image-preview { width: 96px; height: 96px; object-fit: cover; border-radius: 8px; margin-top: 4px; }
.field-inline { display: flex; align-items: center; gap: 8px; }
.form-actions { display: flex; gap: 8px; margin-top: 4px; }

select, textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 15px;
  font-family: inherit;
}
</style>
