import { Schema, model, Types } from "mongoose";

export interface MenuCategoryDoc {
  _id: Types.ObjectId;
  name: string;
  order: number;
}

const menuCategorySchema = new Schema<MenuCategoryDoc>({
  name: { type: String, required: true, trim: true },
  order: { type: Number, required: true, default: 0 },
});

export const MenuCategory = model<MenuCategoryDoc>("MenuCategory", menuCategorySchema);

/**
 * Personalizaciones reutilizables ("Leche": entera, deslactosada, avena...). Un grupo se asigna a
 * varios productos, asi un cambio de precio o de disponibilidad se hace en un solo sitio.
 */
export interface ModifierOptionDoc {
  _id: Types.ObjectId; // estable: los pedidos y los productos lo referencian
  name: string;
  priceDeltaCents: number; // suplemento sobre el precio del producto (0 = sin recargo)
  available: boolean;
}

export interface ModifierGroupDoc {
  _id: Types.ObjectId;
  name: string;
  // Cuantas opciones se eligen: "Leche" es min 1 / max 1 (una y solo una).
  minSelect: number;
  maxSelect: number;
  options: ModifierOptionDoc[];
}

const modifierOptionSchema = new Schema<ModifierOptionDoc>({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  priceDeltaCents: { type: Number, required: true, min: 0, default: 0 },
  available: { type: Boolean, required: true, default: true },
});

const modifierGroupSchema = new Schema<ModifierGroupDoc>({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  minSelect: { type: Number, required: true, min: 0, default: 1 },
  maxSelect: { type: Number, required: true, min: 1, default: 1 },
  options: { type: [modifierOptionSchema], default: [] },
});

export const ModifierGroup = model<ModifierGroupDoc>("ModifierGroup", modifierGroupSchema);

/** Grupo asignado a un producto, con la opcion que lleva si no se pide otra (la de su receta). */
export interface MenuItemModifierDoc {
  groupId: Types.ObjectId;
  defaultOptionId?: Types.ObjectId | null;
}

export interface MenuItemDoc {
  _id: Types.ObjectId;
  categoryId: Types.ObjectId;
  name: string;
  description?: string;
  priceCents: number;
  allergens: string[];
  available: boolean;
  imageUrl?: string;
  modifiers: MenuItemModifierDoc[];
}

const menuItemModifierSchema = new Schema<MenuItemModifierDoc>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "ModifierGroup", required: true },
    defaultOptionId: { type: Schema.Types.ObjectId },
  },
  { _id: false }
);

const menuItemSchema = new Schema<MenuItemDoc>({
  categoryId: { type: Schema.Types.ObjectId, ref: "MenuCategory", required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  priceCents: { type: Number, required: true, min: 0 },
  allergens: { type: [String], default: [] },
  available: { type: Boolean, default: true },
  imageUrl: { type: String },
  modifiers: { type: [menuItemModifierSchema], default: [] },
});

export const MenuItem = model<MenuItemDoc>("MenuItem", menuItemSchema);
