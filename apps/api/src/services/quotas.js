import { and, desc, eq, gt, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { plans, subscriptions, usageEvents, usageRollups } from "@unpirator/db/schema";

const METERED_LIMIT_KEYS = {
  playback_sessions: "monthly_playback_sessions",
  gateway_requests: "monthly_gateway_requests",
  egress_bytes: "monthly_egress_bytes",
};

export function normalizeQuotaLimit(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function fallbackPeriod(now = new Date()) {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

export function quotaPeriodKey(start, end) {
  return `${start.toISOString()}/${end.toISOString()}`;
}

export async function getActiveQuotaContext(db, tenantId, now = new Date()) {
  const [subscription] = await db
    .select({
      planId: subscriptions.planId,
      entitlements: plans.entitlements,
      periodStart: subscriptions.periodStart,
      periodEnd: subscriptions.periodEnd,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(
      and(
        eq(subscriptions.tenantId, tenantId),
        inArray(subscriptions.status, ["active", "trialing"]),
        eq(plans.status, "active"),
        or(isNull(subscriptions.periodEnd), gt(subscriptions.periodEnd, now)),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  if (!subscription) return null;
  const fallback = fallbackPeriod(now);
  const periodStart = subscription.periodStart || fallback.start;
  const periodEnd = subscription.periodEnd || fallback.end;
  return {
    ...subscription,
    entitlements: subscription.entitlements || {},
    periodStart,
    periodEnd,
    periodKey: quotaPeriodKey(periodStart, periodEnd),
  };
}

async function legacyUsage(db, tenantId, metric, context) {
  if (metric === "egress_bytes") {
    const [row] = await db
      .select({
        quantity: sql`coalesce(sum(case when (${usageEvents.metadata}->>'bytes') ~ '^[0-9]+$' then (${usageEvents.metadata}->>'bytes')::bigint else 0 end), 0)::bigint`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.tenantId, tenantId),
          eq(usageEvents.type, "gateway_requests"),
          gte(usageEvents.createdAt, context.periodStart),
          lt(usageEvents.createdAt, context.periodEnd),
        ),
      );
    return Number(row?.quantity || 0);
  }
  const [row] = await db
    .select({ quantity: sql`coalesce(sum(${usageEvents.quantity}), 0)::bigint` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.tenantId, tenantId),
        eq(usageEvents.type, metric),
        gte(usageEvents.createdAt, context.periodStart),
        lt(usageEvents.createdAt, context.periodEnd),
      ),
    );
  return Number(row?.quantity || 0);
}

async function ensureRollup(tx, tenantId, metric, context) {
  let [row] = await tx
    .select({ quantity: usageRollups.quantity })
    .from(usageRollups)
    .where(
      and(
        eq(usageRollups.tenantId, tenantId),
        eq(usageRollups.period, context.periodKey),
        eq(usageRollups.metric, metric),
      ),
    )
    .limit(1);
  if (row) return Number(row.quantity || 0);
  const quantity = await legacyUsage(tx, tenantId, metric, context);
  await tx.insert(usageRollups).values({
    tenantId,
    period: context.periodKey,
    metric,
    quantity,
    updatedAt: new Date(),
  });
  return quantity;
}

async function setRollup(tx, tenantId, metric, context, quantity) {
  await tx
    .update(usageRollups)
    .set({ quantity, updatedAt: new Date() })
    .where(
      and(
        eq(usageRollups.tenantId, tenantId),
        eq(usageRollups.period, context.periodKey),
        eq(usageRollups.metric, metric),
      ),
    );
}

function decision(metric, used, increment, limit) {
  const next = used + increment;
  return {
    metric,
    used,
    requested: increment,
    next,
    limit,
    allowed: limit === null || next <= limit,
  };
}

export async function reserveMeteredQuotaTx(
  tx,
  { tenantId, metric, quantity = 1, context = null },
) {
  const resolved = context || (await getActiveQuotaContext(tx, tenantId));
  if (!resolved) return { allowed: false, code: "SUBSCRIPTION_REQUIRED" };
  const increment = Math.max(0, Number(quantity || 0));
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${resolved.periodKey}:${metric}`}, 11))`,
  );
  const used = await ensureRollup(tx, tenantId, metric, resolved);
  const limit = normalizeQuotaLimit(resolved.entitlements[METERED_LIMIT_KEYS[metric]]);
  const result = decision(metric, used, increment, limit);
  if (!result.allowed) return { ...result, code: "PLAN_QUOTA_EXCEEDED" };
  await setRollup(tx, tenantId, metric, resolved, result.next);
  return result;
}

export async function assertMeteredCapacityTx(tx, { tenantId, metric, context = null }) {
  const resolved = context || (await getActiveQuotaContext(tx, tenantId));
  if (!resolved) return { allowed: false, code: "SUBSCRIPTION_REQUIRED" };
  const limit = normalizeQuotaLimit(resolved.entitlements[METERED_LIMIT_KEYS[metric]]);
  if (limit === null) return { allowed: true, metric, limit: null };
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${resolved.periodKey}:${metric}`}, 11))`,
  );
  const used = await ensureRollup(tx, tenantId, metric, resolved);
  return {
    metric,
    used,
    limit,
    allowed: used < limit,
    code: used < limit ? null : "PLAN_QUOTA_EXCEEDED",
  };
}

export async function reserveDeliveryQuotaTx(tx, { tenantId, bytes = 0 }) {
  const context = await getActiveQuotaContext(tx, tenantId);
  if (!context) return { allowed: false, code: "SUBSCRIPTION_REQUIRED" };
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${context.periodKey}:delivery`}, 12))`,
  );
  const requestUsed = await ensureRollup(tx, tenantId, "gateway_requests", context);
  const egressUsed = await ensureRollup(tx, tenantId, "egress_bytes", context);
  const requestDecision = decision(
    "gateway_requests",
    requestUsed,
    1,
    normalizeQuotaLimit(context.entitlements.monthly_gateway_requests),
  );
  const egressDecision = decision(
    "egress_bytes",
    egressUsed,
    Math.max(0, Number(bytes || 0)),
    normalizeQuotaLimit(context.entitlements.monthly_egress_bytes),
  );
  const blocked = [requestDecision, egressDecision].find((item) => !item.allowed);
  if (blocked) return { ...blocked, code: "PLAN_QUOTA_EXCEEDED" };
  await setRollup(tx, tenantId, "gateway_requests", context, requestDecision.next);
  await setRollup(tx, tenantId, "egress_bytes", context, egressDecision.next);
  return { allowed: true, request: requestDecision, egress: egressDecision };
}

export async function readQuotaRollups(db, tenantId, context) {
  if (!context) return {};
  const rows = await db
    .select({ metric: usageRollups.metric, quantity: usageRollups.quantity })
    .from(usageRollups)
    .where(and(eq(usageRollups.tenantId, tenantId), eq(usageRollups.period, context.periodKey)));
  return Object.fromEntries(rows.map((row) => [row.metric, Number(row.quantity || 0)]));
}
