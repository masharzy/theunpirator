import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.js",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
});
