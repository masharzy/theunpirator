import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { usageEvents } from "@unpirator/db/schema";
export function usageRouter({ db, dashboardAuth, requireTenantViewer }) {
  const router = Router();
  router.use(dashboardAuth, requireTenantViewer);
  router.get("/summary", async (req, res, next) => {
    try {
      const rows = await db
        .select({ type: usageEvents.type, quantity: sql`sum(${usageEvents.quantity})::int` })
        .from(usageEvents)
        .where(eq(usageEvents.tenantId, req.tenantId))
        .groupBy(usageEvents.type);
      res.json({ metrics: Object.fromEntries(rows.map((r) => [r.type, r.quantity])) });
    } catch (e) {
      next(e);
    }
  });
  return router;
}
