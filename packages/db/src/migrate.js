import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./index.js";
try {
  loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const { client } = createDatabase();
const folder = new URL("../migrations/", import.meta.url);
try {
  await client.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(7418920)`;
    await tx`CREATE TABLE IF NOT EXISTS _unpirator_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
    for (const name of (await readdir(folder)).filter((v) => v.endsWith(".sql")).sort()) {
      const content = await readFile(new URL(name, folder), "utf8");
      const checksum = createHash("sha256").update(content).digest("hex");
      const [existing] = await tx`SELECT checksum FROM _unpirator_migrations WHERE name = ${name}`;
      if (existing) {
        if (existing.checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await tx.unsafe(content);
      await tx`INSERT INTO _unpirator_migrations (name, checksum) VALUES (${name}, ${checksum})`;
      console.log(`Applied ${name}`);
    }
  });
  console.log("Migrations complete");
} finally {
  await client.end();
}
