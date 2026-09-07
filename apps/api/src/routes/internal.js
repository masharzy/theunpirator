import { Router } from "express";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  assets,
  playbackSessions,
  securityEvents,
  usageEvents,
  siteDomains,
  providerHealth,
  devices,
  endUsers,
  tenants,
  sites,
} from "@unpirator/db/schema";
import { signPlaybackToken, decodeKeyRing } from "@unpirator/crypto";
import { resolveAssetSource } from "@unpirator/source-manager";
import { unauthorized, notFound } from "../errors.js";
import { restrictedFeatureEnabled, featureEnabled } from "../services/entitlements.js";
import { notifyPlatform } from "../services/admin-notifications.js";
import { riskFor } from "@unpirator/security";

export function internalRouter({
  db,
  config,
  signingRing = decodeKeyRing(config.SIGNING_KEYS_B64),
}) {
  const router = Router();
  router.use((req, _res, next) => {
    const raw = req.get("authorization") || "";
    if (raw !== `Bearer ${config.GATEWAY_INTERNAL_SECRET}`)
      return next(unauthorized("Invalid internal credential"));
    next();
  });
  router.post("/media/resolve/:assetId", async (req, res, next) => {
    try {
      const { tenantId, sessionId } = req.body || {};
      const [session] = await db
        .select()
        .from(playbackSessions)
        .where(
          and(
            eq(playbackSessions.id, sessionId),
            eq(playbackSessions.tenantId, tenantId),
            eq(playbackSessions.assetId, req.params.assetId),
            eq(playbackSessions.status, "active"),
          ),
        )
        .limit(1);
      if (!session || session.expiresAt < new Date())
        throw notFound("Active playback session not found");
      if (!(await featureEnabled(db, "secure_gateway", tenantId, true)))
        throw notFound("Playback unavailable");
      const [asset] = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.id, req.params.assetId),
            eq(assets.tenantId, tenantId),
            eq(assets.status, "active"),
          ),
        )
        .limit(1);
      if (!asset) throw notFound("Asset not found");
      if (
        asset.provider === "youtube_custom" &&
        !(
          config.YOUTUBE_CUSTOM_GLOBAL &&
          (await restrictedFeatureEnabled(db, "youtube_custom", tenantId))
        )
      )
        throw notFound("Provider unavailable");
      const [health] = await db
        .select()
        .from(providerHealth)
        .where(eq(providerHealth.provider, asset.provider))
        .limit(1);
      if (health?.status === "disabled" || health?.status === "down") {
        const error = new Error("Provider disabled");
        error.code = "PROVIDER_DISABLED";
        error.status = 503;
        throw error;
      }
      let source;
      try {
        source = await resolveAssetSource(asset, { sessionId, tenantId }, config);
        await db
          .insert(providerHealth)
          .values({
            provider: asset.provider,
            status: health?.status === "degraded" ? "degraded" : "healthy",
            lastSuccessAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: providerHealth.provider,
            set: { lastSuccessAt: new Date(), updatedAt: new Date() },
          });
      } catch (error) {
        await db
          .insert(providerHealth)
          .values({
            provider: asset.provider,
            status: "degraded",
            lastFailureAt: new Date(),
            metadata: { code: error.code || "SOURCE_FAILURE" },
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: providerHealth.provider,
            set: {
              lastFailureAt: new Date(),
              metadata: { code: error.code || "SOURCE_FAILURE" },
              updatedAt: new Date(),
            },
          });
        await notifyPlatform(db, {
          type: "provider_degraded",
          title: `${asset.provider} provider degraded`,
          body: error.code || "Origin source failure",
          tenantId,
          actionUrl: "/admin/providers",
          dedupeKey: `provider:${asset.provider}:${new Date().toISOString().slice(0, 13)}`,
        });
        throw error;
      }
      const domains = await db
        .select({ domain: siteDomains.domain })
        .from(siteDomains)
        .where(and(eq(siteDomains.siteId, asset.siteId), isNotNull(siteDomains.verifiedAt)));
      const allowedOrigins = [...new Set(domains.map((d) => d.domain).filter(Boolean))];
      res.json({
        allowedOrigins,
        source: {
          url: source.url,
          allowedHosts: asset.allowedHosts,
          headers: source.headers || {},
          expiresAt: source.expiresAt || null,
          contentType: source.contentType || null,
          supportsRange: source.supportsRange !== false,
          manifestType: source.manifestType || null,
          cacheTtlSeconds: Math.min(Number(source.cacheTtlSeconds || 60), 300),
        },
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/playback/refresh", async (req, res, next) => {
    try {
      const { tenantId, sessionId, assetId, siteId, userId, deviceId, policy } = req.body || {};
      const [session] = await db
        .select()
        .from(playbackSessions)
        .where(
          and(
            eq(playbackSessions.id, sessionId),
            eq(playbackSessions.tenantId, tenantId),
            eq(playbackSessions.assetId, assetId),
            eq(playbackSessions.siteId, siteId),
            eq(playbackSessions.endUserId, userId),
            eq(playbackSessions.deviceId, deviceId),
            eq(playbackSessions.status, "active"),
          ),
        )
        .limit(1);
      if (!session || session.expiresAt < new Date())
        throw notFound("Active playback session not found");
      const activeRows = await Promise.all([
        db
          .select()
          .from(devices)
          .where(and(eq(devices.id, deviceId), eq(devices.status, "active")))
          .limit(1),
        db
          .select()
          .from(endUsers)
          .where(and(eq(endUsers.id, userId), eq(endUsers.status, "active")))
          .limit(1),
        db
          .select()
          .from(assets)
          .where(and(eq(assets.id, assetId), eq(assets.status, "active")))
          .limit(1),
        db
          .select()
          .from(tenants)
          .where(and(eq(tenants.id, tenantId), eq(tenants.status, "active")))
          .limit(1),
        db
          .select()
          .from(sites)
          .where(and(eq(sites.id, siteId), eq(sites.status, "active")))
          .limit(1),
      ]);
      if (
        activeRows.some((rows) => !rows.length) ||
        !(await featureEnabled(db, "secure_gateway", tenantId, true))
      )
        throw notFound("Playback unavailable");
      const ttl = 90;
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: "the-unpirator",
        tid: tenantId,
        sid: siteId,
        uid: userId,
        aid: assetId,
        did: deviceId,
        psid: sessionId,
        policy: policy || "strict",
        iat: now,
        exp: now + ttl,
      };
      const token = signPlaybackToken(payload, {
        ring: signingRing,
        activeKid: config.ACTIVE_SIGNING_KID,
      });
      res.json({ token, tokenExpiresIn: ttl });
    } catch (e) {
      next(e);
    }
  });
  router.post("/gateway/telemetry", async (req, res, next) => {
    try {
      const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 100) : [];
      for (const event of events) {
        if (!event?.tenantId || !event?.type) continue;
        if (event.type === "playback_heartbeat" && event.sessionId)
          await db
            .update(playbackSessions)
            .set({ lastHeartbeatAt: new Date() })
            .where(
              and(
                eq(playbackSessions.id, event.sessionId),
                eq(playbackSessions.tenantId, event.tenantId),
              ),
            );
        if (event.kind === "security") {
          const [securityEvent] = await db
            .insert(securityEvents)
            .values({
              tenantId: event.tenantId,
              siteId: event.siteId || null,
              assetId: event.assetId || null,
              sessionId: event.sessionId || null,
              type: event.type,
              severity: event.severity || "info",
              riskScore: Number(event.riskScore ?? riskFor(event.type)),
              metadata: event.metadata || {},
            })
            .returning();
          if (["high", "critical"].includes(securityEvent.severity))
            await notifyPlatform(db, {
              type: "security_incident",
              title: `${securityEvent.severity} security event`,
              body: securityEvent.type,
              tenantId: event.tenantId,
              actionUrl: `/admin/workspaces/${event.tenantId}/security`,
              dedupeKey: `security:${securityEvent.id}`,
            });
        } else
          await db.insert(usageEvents).values({
            tenantId: event.tenantId,
            type: event.type,
            quantity: Number(event.quantity || 1),
            assetId: event.assetId || null,
            sessionId: event.sessionId || null,
            metadata: event.metadata || {},
          });
      }
      res.status(202).json({ accepted: events.length });
    } catch (e) {
      next(e);
    }
  });
  return router;
}
