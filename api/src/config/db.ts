import mongoose from "mongoose";
import { env } from "./env";

let connecting: Promise<typeof mongoose> | null = null;

export function connectMongo() {
  if (!connecting) {
    mongoose.set("strictQuery", true);
    connecting = mongoose.connect(env.mongoUri).then((conn) => {
      // eslint-disable-next-line no-console
      console.log(`[mongo] conectado a ${env.mongoUri}`);
      return conn;
    });
  }
  return connecting;
}
