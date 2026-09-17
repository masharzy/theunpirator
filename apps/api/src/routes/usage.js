import { Router } from "express";
import { and, desc, eq, gt, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { subscriptions, usageEvents } from "@unpirator/db/schema";

function calendarPeriod(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export function usageRouter({ db, dashboardAuth, requireTenantViewer }) {
  const router = Router();
  router.use(dashboardAuth, requireTenantViewer);

  router.get("/summary", async (req, res, next) => {
    try {
      const now = new Date();
      const [subscription] = await db
        .select({
          periodStart: subscriptions.periodStart,
          periodEnd: subscriptions.periodEnd,
        })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.tenantId, req.tenantId),
            inArray(subscriptions.status, ["active", "trialing"]),
            or(isNull(subscriptions.periodEnd), gt(subscriptions.periodEnd, now)),
          ),
        )
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

      const fallback = calendarPeriod(now);
      const periodStart = subscription?.periodStart || fallback.start;
      const periodEnd = subscription?.periodEnd || fallback.end;
      const rows = await db
        .select({
          type: usageEvents.type,
          quantity: sql`coalesce(sum(${usageEvents.quantity}), 0)::bigint`,
        })
        .from(usageEvents)
        .where(
          and(
            eq(usageEvents.tenantId, req.tenantId),
            gte(usageEvents.createdAt, periodStart),
            lt(usageEvents.createdAt, periodEnd),
          ),
        )
        .groupBy(usageEvents.type);

      res.json({
        period: {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        },
        metrics: Object.fromEntries(rows.map((row) => [row.type, Number(row.quantity || 0)])),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
