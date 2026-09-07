import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export function createDatabase(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is required");
  const client = postgres(url, { prepare: false, max: Number(process.env.DB_POOL_MAX || 10) });
  const db = drizzle(client, { schema });
  return { db, client };
}
export * from "./schema.js";
