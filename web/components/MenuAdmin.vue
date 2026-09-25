<template>
  <section class="menu-admin">
    <div class="menu-admin-header">
      <button class="button" :disabled="formOpen" @click="startCreate()">+ Nuevo producto</button>
    </div>

    <p v-if="loading" class="muted">Cargando carta…</p>
    <p v-if="loadError" class="muted" style="color: var(--danger)">{{ loadError }}</p>

    <section class="categories-admin">
      <div class="categories-header">
        <h3>Categorías</h3>
        <button class="button secondary" :disabled="categoryFormOpen" @click="startCreateCategory">+ Nueva categoría</button>
      </div>

      <form v-if="categoryFormOpen" class="card category-form" @submit.prevent="submitCategory">
        <label class="field">
          <span class="muted">Nombre</span>
          <input v-model="categoryForm.name" type="text" required maxlength="80" />
        </label>
        <p v-if="categoryFormError" class="muted" style="color: var(--danger)">{{ categoryFormError }}</p>
        <div class="form-actions">
          <button class="button" type="submit" :disabled="savingCategory">
            {{ savingCategory ? "Guardando…" : "Guardar" }}
          </button>
          <button class="button secondary" type="button" :disabled="savingCategory" @click="categoryFormOpen = false">
            Cancelar
          </button>
        </div>
      </form>

      <div class="card category-row" v-for="(category, i) in categories" :key="category.id">
        <template v-if="editingCategoryId === category.id">
          <input v-model="categoryNameDraft" type="text" maxlength="80" style="flex: 1" />
          <button class="button secondary" type="button" @click="saveCategoryName(category)">Guardar</button>
          <button class="button secondary" type="button" @click="editingCategoryId = ''">Cancelar</button>
        </template>
        <template v-else>
          <span class="category-name">{{ category.name }}</span>
          <div class="category-actions">
            <button class="button secondary" type="button" :disabled="i === 0" @click="moveCategory(i, -1)">▲</button>
            <button class="button secondary" type="button" :disabled="i === categories.length - 1" @click="moveCategory(i, 1)">▼</button>
            <button class="button secondary" type="button" @click="startEditCategoryName(category)">Editar nombre</button>
          </div>
        </template>
      </div>
    </section>

    <!-- Personalizaciones: grupos reutilizables (p. ej. Leche) que se asignan a los productos -->
    <section class="groups-admin">
      <div class="categories-header">
        <h3>Personalizaciones</h3>
        <button class="button secondary" :disabled="groupFormOpen" @click="startCreateGroup">+ Nueva personalización</button>
      </div>
      <p class="muted">Opciones que se eligen al pedir, como el tipo de leche. Se asignan a cada producto al editarlo.</p>

      <form v-if="groupFormOpen" class="card group-form" @submit.prevent="submitGroup">
        <label class="field">
          <span class="muted">Nombre</span>
          <input v-model="groupForm.name" type="text" required maxlength="60" placeholder="Ej. Leche" />
        </label>
        <label class="field-inline">
          <input v-model="groupForm.required" type="checkbox" style="width: auto" />
          <span>Obligatoria: siempre se elige una (como el tipo de leche)</span>
        </label>
        <span class="muted">Sin marcar, es opcional: se puede pedir sin ninguna (como una adición).</span>
        <div class="field">
          <span class="muted">Opciones — se elige una como máximo</span>
          <div v-for="(option, i) in groupForm.options" :key="i" class="option-row">
            <input v-model="option.name" type="text" required maxlength="60" placeholder="Ej. Avena" aria-label="Nombre de la opción" />
            <input v-model.number="option.priceDeltaCents" type="number" min="0" step="100" required aria-label="Suplemento (COP)" />
            <label class="field-inline">
              <input v-model="option.available" type="checkbox" style="width: auto" />
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
          <button class="button secondary" type="button" :disabled="savingGroup" @click="groupFormOpen = false">Cancelar</button>
        </div>
      </form>

      <p v-if="!groups.length && !groupFormOpen" class="muted">Todavía no hay personalizaciones.</p>
      <div v-for="group in groups" :key="group.id" class="card category-row">
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
          <p v-if="groupDeleteError === group.id" class="muted" style="color: var(--danger)">No se pudo borrar</p>
        </div>
        <div v-if="pendingGroupDeleteId === group.id" class="category-actions">
          <span class="muted">¿Borrar? Se quitará de los productos</span>
          <button class="button secondary" type="button" @click="confirmRemoveGroup(group)">Sí</button>
          <button class="button secondary" type="button" @click="pendingGroupDeleteId = ''">No</button>
        </div>
        <div v-else class="category-actions">
          <button class="button secondary" type="button" :disabled="groupFormOpen" @click="startEditGroup(group)">Editar</button>
          <button class="button secondary" type="button" @click="pendingGroupDeleteId = group.id">Borrar</button>
        </div>
      </div>
    </section>

    <form v-if="formOpen" class="card item-form" @submit.prevent="submitForm">
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
        <input v-model="form.imageUrl" type="url" placeholder="https://… (o sube un archivo)" />
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
              style="width: auto"
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
        <input v-model="form.available" type="checkbox" style="width: auto" />
        <span class="muted">Disponible en la carta</span>
      </label>

      <p v-if="formError" class="muted" style="color: var(--danger)">{{ formError }}</p>

      <div class="form-actions">
        <button class="button" type="submit" :disabled="saving">
          {{ saving ? "Guardando…" : "Guardar" }}
        </button>
        <button class="button secondary" type="button" :disabled="saving" @click="cancelForm">
          Cancelar
        </button>
      </div>
    </form>

    <section v-for="category in categories" :key="category.id" class="category">
      <h3>{{ category.name }}</h3>
      <div class="card item-row" v-for="item in category.items" :key="item.id" :class="{ unavailable: !item.available }">
        <img v-if="item.imageUrl" :src="resolveImageUrl(item.imageUrl) ?? undefined" alt="" class="thumb" />
        <div class="item-info">
          <strong>{{ item.name }}</strong>
          <span v-if="!item.available" class="muted"> · oculto</span>
          <p v-if="item.description" class="muted">{{ item.description }}</p>
          <p class="muted">
            {{ formatPrice(item.priceCents)
            }}{{ item.modifiers.length ? ` · ${item.modifiers.map((m) => m.group.name).join(", ")}` : "" }}
          </p>
          <p v-if="deleteError === item.id" class="muted" style="color: var(--danger)">No se pudo borrar el producto</p>
        </div>
        <div v-if="pendingDeleteId === item.id" class="item-actions">
          <span class="muted">¿Borrar?</span>
          <button class="button secondary" type="button" :disabled="deleting" @click="confirmRemove(item)">Sí</button>
          <button class="button secondary" type="button" :disabled="deleting" @click="pendingDeleteId = ''">No</button>
        </div>
        <div v-else class="item-actions">
          <button class="button secondary" type="button" @click="startEdit(item, category.id)">Editar</button>
          <button class="button secondary" type="button" @click="pendingDeleteId = item.id">Borrar</button>
        </div>
      </div>
      <p v-if="!category.items.length" class="muted">Sin productos en esta categoría.</p>
    </section>
  </section>
</template>

<script setup lang="ts">
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
  modifiers: { defaultOptionId: string | null; group: { id: string; name: string } }[];
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
        modifiers {
          defaultOptionId
          group {
            id
            name
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

// --- Categorías: crear, renombrar y reordenar (sin borrar, para no dejar items huérfanos) ---
const categoryFormOpen = ref(false);
const savingCategory = ref(false);
const categoryFormError = ref("");
const categoryForm = reactive({ name: "" });

function startCreateCategory() {
  categoryForm.name = "";
  categoryFormError.value = "";
  categoryFormOpen.value = true;
}

async function submitCategory() {
  savingCategory.value = true;
  categoryFormError.value = "";
  try {
    const { mutate } = useMutation(CREATE_MENU_CATEGORY);
    await mutate({ name: categoryForm.name.trim(), order: categories.value.length });
    await refetch();
    categoryFormOpen.value = false;
  } catch (err: any) {
    categoryFormError.value = err?.message ?? "No se pudo crear la categoría";
  } finally {
    savingCategory.value = false;
  }
}

const editingCategoryId = ref("");
const categoryNameDraft = ref("");

function startEditCategoryName(category: MenuCategoryAdmin) {
  editingCategoryId.value = category.id;
  categoryNameDraft.value = category.name;
}

async function saveCategoryName(category: MenuCategoryAdmin) {
  const name = categoryNameDraft.value.trim();
  editingCategoryId.value = "";
  if (!name || name === category.name) return;
  const { mutate } = useMutation(UPDATE_MENU_CATEGORY);
  await mutate({ id: category.id, name });
  await refetch();
}

// Intercambia el `order` de dos categorías adyacentes (sin drag-and-drop).
async function moveCategory(index: number, delta: number) {
  const a = categories.value[index];
  const b = categories.value[index + delta];
  if (!a || !b) return;
  const { mutate } = useMutation(UPDATE_MENU_CATEGORY);
  await Promise.all([
    mutate({ id: a.id, order: b.order }),
    mutate({ id: b.id, order: a.order }),
  ]);
  await refetch();
}

// --- Personalizaciones de una opcion como maximo: obligatorias (Leche) u opcionales (Adicion) ---
const groupFormOpen = ref(false);
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

function startCreate(categoryId?: string) {
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

const uploading = ref(false);
const uploadError = ref("");

async function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  uploading.value = true;
  uploadError.value = "";
  try {
    const config = useRuntimeConfig();
    const uploadsBase = String(config.public.graphqlHttp).replace(/\/graphql\/?$/, "");
    const token = useCookie("lq_auth_token").value;

    const body = new FormData();
    body.append("file", file);

    const res = await fetch(`${uploadsBase}/uploads`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? "No se pudo subir la imagen");

    // Se guarda solo la ruta relativa: el host correcto para verla lo resuelve
    // cada dispositivo por su cuenta (ver useImageUrl.ts).
    form.imageUrl = data.url;
  } catch (err: any) {
    uploadError.value = err?.message ?? "No se pudo subir la imagen";
  } finally {
    uploading.value = false;
    input.value = "";
  }
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
.menu-admin { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border); }
.menu-admin-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

.categories-admin { margin-top: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
.categories-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.category-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; }
.category-name { font-weight: 600; }
.category-actions { display: flex; gap: 6px; flex-shrink: 0; }
.category-form { margin: 12px 0; display: flex; flex-direction: column; gap: 10px; max-width: 360px; }

.groups-admin { margin-top: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
.group-form { margin: 12px 0; display: flex; flex-direction: column; gap: 10px; max-width: 520px; }
.option-row { display: grid; grid-template-columns: minmax(0, 1fr) 96px auto auto; gap: 8px; align-items: center; }
.option-row input[type="text"], .option-row input[type="number"] { min-width: 0; }
.option-out { text-decoration: line-through; }
.modifier-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.modifier-row select { flex: 1; min-width: 180px; width: auto; }

.category { margin-top: 24px; }
.item-row { display: flex; align-items: center; gap: 14px; margin-top: 10px; }
.item-row.unavailable { opacity: 0.55; }
.item-info { flex: 1; }
.item-actions { display: flex; gap: 8px; flex-shrink: 0; }
.thumb { width: 48px; height: 48px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }

.item-form { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; max-width: 420px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.image-preview { width: 96px; height: 96px; object-fit: cover; border-radius: 8px; margin-top: 4px; }
.field-inline { display: flex; align-items: center; gap: 8px; }
.form-actions { display: flex; gap: 8px; margin-top: 4px; }

select, textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  font-size: 15px;
  font-family: inherit;
}
</style>
