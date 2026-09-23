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

export interface MenuItemDoc {
  _id: Types.ObjectId;
  categoryId: Types.ObjectId;
  name: string;
  description?: string;
  priceCents: number;
  allergens: string[];
  available: boolean;
  imageUrl?: string;
}

const menuItemSchema = new Schema<MenuItemDoc>({
  categoryId: { type: Schema.Types.ObjectId, ref: "MenuCategory", required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  priceCents: { type: Number, required: true, min: 0 },
  allergens: { type: [String], default: [] },
  available: { type: Boolean, default: true },
  imageUrl: { type: String },
});

export const MenuItem = model<MenuItemDoc>("MenuItem", menuItemSchema);
