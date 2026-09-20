import { Router } from "express";
import { and, desc, eq, gt, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { assets, playbackSessions, sites, subscriptions, usageEvents } from "@unpirator/db/schema";
import { billingPlans } from "@unpirator/db/commerce-schema";
import { buildUsageModel } from "../services/usage-model.js";
import { getActiveQuotaContext, readQuotaRollups } from "../services/quotas.js";
import { cachedTenantJson } from "../services/metadata-cache.js";
import { SESSION_ACTIVE_HEARTBEAT_MS } from "../services/session-state.js";

function calendarPeriod(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export function usageRouter({ db, cache, dashboardAuth, requireTenantViewer }) {
  const router = Router();
  router.use(dashboardAuth, requireTenantViewer);

  router.get("/summary", async (req, res, next) => {
    try {
      const payload = await cachedTenantJson({
        cache,
        tenantId: req.tenantId,
        namespace: "usage-summary",
        key: "current",
        ttlSeconds: 10,
        load: async () => {
          const now = new Date();
          const heartbeatCutoff = new Date(now.getTime() - SESSION_ACTIVE_HEARTBEAT_MS);
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
          const quotaContext = subscription
            ? await getActiveQuotaContext(db, req.tenantId, now)
            : null;
          const [rows, egressRows, siteRows, assetRows, activeRows, rollups] = await Promise.all([
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
              .select({
                quantity: sql`coalesce(sum(case when (${usageEvents.metadata}->>'bytes') ~ '^[0-9]+$' then (${usageEvents.metadata}->>'bytes')::bigint else 0 end), 0)::bigint`,
              })
              .from(usageEvents)
              .where(
                and(
                  eq(usageEvents.tenantId, req.tenantId),
                  eq(usageEvents.type, "gateway_requests"),
                  gte(usageEvents.createdAt, periodStart),
                  lt(usageEvents.createdAt, periodEnd),
                ),
              ),
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
                  gte(playbackSessions.lastHeartbeatAt, heartbeatCutoff),
                ),
              ),
            readQuotaRollups(db, req.tenantId, quotaContext),
          ]);

          const metrics = Object.fromEntries(
            rows.map((row) => [row.type, Number(row.quantity || 0)]),
          );
          const legacyEgress = Number(egressRows[0]?.quantity || 0);
          if (legacyEgress > 0) metrics.egress_bytes = legacyEgress;
          for (const metric of ["playback_sessions", "gateway_requests", "egress_bytes"]) {
            if (Object.prototype.hasOwnProperty.call(rollups, metric)) {
              metrics[metric] = rollups[metric];
            }
          }
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

          return {
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
          };
        },
      });

      res.set("cache-control", "no-store").json(payload);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
