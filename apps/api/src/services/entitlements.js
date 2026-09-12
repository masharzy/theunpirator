import { and, desc, eq, inArray, isNull, or, gt } from "drizzle-orm";
import { featureFlags, plans, subscriptions } from "@unpirator/db/schema";

const DEFAULTS = {
  secure_gateway: true,
  dynamic_watermark: true,
  device_control: true,
  max_sites: 1,
  max_devices_per_user: 2,
  max_concurrent_streams: 1,
  session_policy: "block_new",
  youtube_custom: false,
};

export async function getEntitlements(db, tenantId) {
  const [subscription] = await db
    .select({ entitlements: plans.entitlements })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(
      and(
        eq(subscriptions.tenantId, tenantId),
        inArray(subscriptions.status, ["active", "trialing"]),
        eq(plans.status, "active"),
        or(isNull(subscriptions.periodEnd), gt(subscriptions.periodEnd, new Date())),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  if (!subscription)
    return {
      ...DEFAULTS,
      secure_gateway: false,
      dynamic_watermark: false,
      device_control: true,
      max_sites: 0,
    };
  return { ...DEFAULTS, ...subscription.entitlements };
}

export async function featureEnabled(db, key, tenantId, fallback = false) {
  const flags = await db.select().from(featureFlags).where(eq(featureFlags.key, key));
  if (
    flags.some((flag) => flag.scopeType === "global" && flag.scopeId === "global" && !flag.enabled)
  )
    return false;
  const entitlements = await getEntitlements(db, tenantId);
  return evaluateFeature(flags, entitlements, key, tenantId, fallback);
}

function evaluateFeature(flags, entitlements, key, tenantId, fallback) {
  flags = flags.filter((flag) => flag.key === key);
  const globalFlag = flags.find((f) => f.scopeType === "global" && f.scopeId === "global");
  const tenantFlag = flags.find((f) => f.scopeType === "tenant" && f.scopeId === String(tenantId));
  if (globalFlag && !globalFlag.enabled) return false;
  if (entitlements[key] !== true) return false;
  if (tenantFlag) return tenantFlag.enabled;
  return globalFlag ? globalFlag.enabled : fallback;
}

export async function restrictedFeatureEnabled(db, key, tenantId) {
  const flags = await db.select().from(featureFlags).where(eq(featureFlags.key, key));
  return evaluateRestricted(flags, key, tenantId);
}

function evaluateRestricted(flags, key, tenantId) {
  flags = flags.filter((flag) => flag.key === key);
  const globalFlag = flags.find((f) => f.scopeType === "global" && f.scopeId === "global");
  const tenantFlag = flags.find((f) => f.scopeType === "tenant" && f.scopeId === String(tenantId));
  return globalFlag?.enabled === true && tenantFlag?.enabled === true;
}

// Request-local snapshot: no stale cross-request authorization cache.
export async function getPlaybackPolicy(db, tenantId) {
  const entitlements = await getEntitlements(db, tenantId);
  const flags = await db
    .select()
    .from(featureFlags)
    .where(
      and(
        inArray(featureFlags.key, ["secure_gateway", "dynamic_watermark", "youtube_custom"]),
        or(
          and(eq(featureFlags.scopeType, "global"), eq(featureFlags.scopeId, "global")),
          and(eq(featureFlags.scopeType, "tenant"), eq(featureFlags.scopeId, String(tenantId))),
        ),
      ),
    );
  return {
    entitlements,
    secure: evaluateFeature(flags, entitlements, "secure_gateway", tenantId, true),
    watermark: evaluateFeature(flags, entitlements, "dynamic_watermark", tenantId, true),
    youtube: evaluateRestricted(flags, "youtube_custom", tenantId),
  };
}
