import { Router } from "express";
import { and, desc, eq, gt, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { assets, playbackSessions, sites, subscriptions, usageEvents } from "@unpirator/db/schema";
import { billingPlans } from "@unpirator/db/commerce-schema";
import { buildUsageModel } from "../services/usage-model.js";

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
          planId: subscriptions.planId,
          status: subscriptions.status,
          periodStart: subscriptions.periodStart,
          periodEnd: subscriptions.periodEnd,
          planName: billingPlans.name,
          entitlements: billingPlans.entitlements,
        })
        .from(subscriptions)
        .innerJoin(billingPlans, eq(subscriptions.planId, billingPlans.id))
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
      const [rows, siteRows, assetRows, activeRows] = await Promise.all([
        db
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
          .groupBy(usageEvents.type),
        db
          .select({ count: sql`count(*)::int` })
          .from(sites)
          .where(eq(sites.tenantId, req.tenantId)),
        db
          .select({ count: sql`count(*)::int` })
          .from(assets)
          .where(eq(assets.tenantId, req.tenantId)),
        db
          .select({ count: sql`count(*)::int` })
          .from(playbackSessions)
          .where(
            and(
              eq(playbackSessions.tenantId, req.tenantId),
              eq(playbackSessions.status, "active"),
              gt(playbackSessions.expiresAt, now),
            ),
          ),
      ]);

      const metrics = Object.fromEntries(
        rows.map((row) => [row.type, Number(row.quantity || 0)]),
      );
      const counts = {
        sites: Number(siteRows[0]?.count || 0),
        assets: Number(assetRows[0]?.count || 0),
        activeSessions: Number(activeRows[0]?.count || 0),
      };
      const model = buildUsageModel({
        metrics,
        entitlements: subscription?.entitlements || {},
        counts,
      });

      res.json({
        period: {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        },
        subscription: subscription
          ? {
              planId: subscription.planId,
              planName: subscription.planName,
              status: subscription.status,
              periodStart: subscription.periodStart,
              periodEnd: subscription.periodEnd,
            }
          : null,
        metrics,
        ...model,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
