import { createApp } from "./create-app.js";
import "./startup/providers.js";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
try {
  loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const { app, config, logger, dbClient } = createApp();
const server = app.listen(config.API_PORT, () =>
  logger.info({ port: config.API_PORT }, "control API listening"),
);
async function shutdown(signal) {
  logger.info({ signal }, "shutting down");
  server.close(async () => {
    try {
      await dbClient.end();
    } finally {
      process.exit(0);
    }
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
