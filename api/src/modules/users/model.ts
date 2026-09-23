import { Schema, model, Types } from "mongoose";

export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  email?: string;
  phone?: string;
  customerCode: string; // codigo corto que el cliente enseña en el mostrador
  createdAt: Date;
}

const userSchema = new Schema<UserDoc>({
  name: { type: String, required: true, trim: true },
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  phone: { type: String, unique: true, sparse: true, trim: true },
  customerCode: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: () => new Date() },
});

export const User = model<UserDoc>("User", userSchema);

export type StaffRole = "barra" | "gestion";

export interface StaffUserDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: StaffRole;
  createdAt: Date;
}

const staffUserSchema = new Schema<StaffUserDoc>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["barra", "gestion"], required: true, default: "barra" },
  createdAt: { type: Date, default: () => new Date() },
});

export const StaffUser = model<StaffUserDoc>("StaffUser", staffUserSchema);
