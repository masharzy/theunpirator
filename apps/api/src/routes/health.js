import { Router } from "express";
export function healthRouter({ dbClient, cache }) {
  const router = Router();
  router.get("/live", (_req, res) => res.json({ status: "ok" }));
  router.get("/ready", async (_req, res) => {
    const checks = { database: false, cache: false };
    try {
      await dbClient`select 1`;
      checks.database = true;
    } catch {}
    try {
      checks.cache = (await cache.ping()) === "PONG";
    } catch {}
    const ok = checks.database && checks.cache;
    res.status(ok ? 200 : 503).json({ status: ok ? "ready" : "degraded", checks });
  });
  return router;
}
