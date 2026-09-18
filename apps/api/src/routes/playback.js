import { Router } from "express";
import { assetSyncSchema, playbackSessionSchema, parseOrThrow } from "@unpirator/contracts";
import { and, eq, sql } from "drizzle-orm";
import { encryptJson, sha256 } from "@unpirator/crypto";
import { AppError, notFound } from "../errors.js";
import { assets, endUsers, playbackSessions, sites, usageEvents } from "@unpirator/db/schema";
import { writeAudit } from "../services/audit.js";
import { decryptViewerEmail } from "../services/viewer-identity.js";
import {
  effectiveSessionStatus,
  reconcileExpiredSessions,
  settleSessionRevoke,
} from "../services/session-state.js";

export function dashboardTestSessionInput(req) {
  return parseOrThrow(playbackSessionSchema, {
    siteId: req.body.siteId || req.get("x-unpirator-site-id"),
    ...(req.body.assetId
      ? { assetId: req.body.assetId }
      : {
          source: {
            provider: "youtube_custom",
            url: req.body.src,
            ...(req.body.title ? { title: req.body.title } : {}),
          },
        }),
    email: req.auth.email,
    deviceId: req.body.deviceId,
    ...(req.ip ? { viewerIp: req.ip } : {}),
    ...(req.get("user-agent") ? { viewerUserAgent: req.get("user-agent") } : {}),
    client: req.body.client || {},
  });
}

export function playbackRouter({
  playbackService,
  apiKeyAuth,
  db,
  cache,
  config,
  dashboardAuth,
  csrfGuard,
  requireTenantDeveloper,
  requireTenantAdmin,
}) {
  const router = Router();
  router.post("/assets/upsert", apiKeyAuth, async (req, res, next) => {
    try {
      const input = parseOrThrow(assetSyncSchema, req.body);
      const [site] = await db
        .select({ id: sites.id })
        .from(sites)
        .where(and(eq(sites.id, input.siteId), eq(sites.tenantId, req.apiAuth.tenantId)))
        .limit(1);
      if (!site) throw new AppError("SITE_NOT_FOUND", "Site not found", 404);

      const encryptedProviderConfig = Object.keys(input.providerConfig).length
        ? encryptJson(input.providerConfig, config.APP_ENCRYPTION_KEY_BASE64)
        : null;
      const [asset] = await db
        .insert(assets)
        .values({
          tenantId: req.apiAuth.tenantId,
          siteId: input.siteId,
          externalContentId: input.externalContentId,
          title: input.title,
          provider: input.provider,
          providerReference: input.sourceUrl,
          allowedHosts: input.allowedHosts,
          encryptedProviderConfig,
          status: "active",
        })
        .onConflictDoUpdate({
          target: [assets.tenantId, assets.siteId, assets.externalContentId],
          set: {
            title: input.title,
            provider: input.provider,
            providerReference: input.sourceUrl,
            allowedHosts: input.allowedHosts,
            encryptedProviderConfig,
            status: "active",
            updatedAt: new Date(),
          },
        })
        .returning({ id: assets.id, externalContentId: assets.externalContentId });
      res.status(200).set("cache-control", "no-store").json({
        playbackRef: asset.id,
        externalContentId: asset.externalContentId,
      });
    } catch (error) {
      next(error);
    }
  });
  router.post(
    "/test-session",
    dashboardAuth,
    csrfGuard,
    requireTenantDeveloper,
    async (req, res, next) => {
      try {
        const input = dashboardTestSessionInput(req);
        const session = await playbackService.create({
          tenantId: req.tenantId,
          input,
          ip: req.ip,
          userAgent: req.get("user-agent"),
          requestId: req.id,
        });
        res.set("cache-control", "no-store").status(201).json(session);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post("/sessions", apiKeyAuth, async (req, res, next) => {
    const started = performance.now();
    try {
      const input = parseOrThrow(playbackSessionSchema, req.body);
      const idem = req.get("idempotency-key");
      if (idem && idem.length > 180)
        throw new AppError("VALIDATION_ERROR", "Idempotency key too long", 400);
      const idemKey = idem ? `idem:playback:${req.apiAuth.tenantId}:${idem}` : null;
      const fingerprint = sha256(JSON.stringify(input));
      const create = () =>
        playbackService.create({
          tenantId: req.apiAuth.tenantId,
          input,
          ip: req.ip,
          userAgent: req.get("user-agent"),
          requestId: req.id,
        });
      const result = idemKey
        ? await db.transaction(async (tx) => {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${idemKey}, 1))`);
            const cached = await cache.get(idemKey);
            if (cached) {
              const value = typeof cached === "string" ? JSON.parse(cached) : cached;
              if (value.fingerprint !== fingerprint)
                throw new AppError(
                  "IDEMPOTENCY_CONFLICT",
                  "Idempotency key was used for a different request",
                  409,
                );
              return value.result;
            }
            const value = await create();
            await cache.set(idemKey, JSON.stringify({ fingerprint, result: value }), { ex: 60 });
            return value;
          })
        : await create();

      if (result.sessionId && (input.client?.sdkName || input.client?.sdkVersion)) {
        await db
          .update(usageEvents)
          .set({
            metadata: {
              client: {
                ...(input.client.sdkName ? { sdkName: input.client.sdkName } : {}),
                ...(input.client.sdkVersion ? { sdkVersion: input.client.sdkVersion } : {}),
              },
            },
          })
          .where(
            and(
              eq(usageEvents.tenantId, req.apiAuth.tenantId),
              eq(usageEvents.sessionId, result.sessionId),
              eq(usageEvents.type, "playback_sessions"),
            ),
          );
      }

      const durationMs = Math.round(performance.now() - started);
      res.set("server-timing", `playback_session;dur=${durationMs}`);
      console.info(
        JSON.stringify({
          component: "playback-timing",
          phase: "session-create",
          sessionId: result.sessionId,
          durationMs,
        }),
      );
      res.set("cache-control", "no-store").status(201).json(result);
    } catch (e) {
      next(e);
    }
  });
  router.get("/sessions", dashboardAuth, requireTenantAdmin, async (req, res, next) => {
    try {
      const now = new Date();
      await reconcileExpiredSessions(db, req.tenantId, now);
      const rows = await db
        .select({
          id: playbackSessions.id,
          siteId: playbackSessions.siteId,
          assetId: playbackSessions.assetId,
          endUserId: playbackSessions.endUserId,
          deviceId: playbackSessions.deviceId,
          status: playbackSessions.status,
          ip: playbackSessions.ip,
          userAgent: playbackSessions.userAgent,
          startedAt: playbackSessions.startedAt,
          lastHeartbeatAt: playbackSessions.lastHeartbeatAt,
          expiresAt: playbackSessions.expiresAt,
          endedAt: playbackSessions.endedAt,
          viewerEmailEncrypted: endUsers.displayLabel,
        })
        .from(playbackSessions)
        .leftJoin(endUsers, eq(endUsers.id, playbackSessions.endUserId))
        .where(eq(playbackSessions.tenantId, req.tenantId));
      res.json({
        items: rows.map(({ viewerEmailEncrypted, ...session }) => ({
          ...session,
          status: effectiveSessionStatus(session, now),
          viewerEmail: decryptViewerEmail(viewerEmailEncrypted, req.tenantId, config),
        })),
      });
    } catch (e) {
      next(e);
    }
  });
  router.post(
    "/sessions/:sessionId/revoke",
    dashboardAuth,
    csrfGuard,
    requireTenantAdmin,
    async (req, res, next) => {
      try {
        const now = new Date();
        await reconcileExpiredSessions(db, req.tenantId, now);
        const readSession = async () => {
          const [session] = await db
            .select()
            .from(playbackSessions)
            .where(
              and(
                eq(playbackSessions.id, req.params.sessionId),
                eq(playbackSessions.tenantId, req.tenantId),
              ),
            )
            .limit(1);
          return session;
        };
        const existing = await readSession();
        if (!existing) throw notFound("Playback session not found");

        const state = effectiveSessionStatus(existing, now);
        const { session, didRevoke, secondaryError } = await settleSessionRevoke({
          state,
          existing,
          revoke: () =>
            playbackService.revoke({
              tenantId: req.tenantId,
              sessionId: req.params.sessionId,
            }),
          readDurable: readSession,
        });

        if (secondaryError)
          console.warn(
            JSON.stringify({
              component: "playback-revoke",
              phase: "secondary-sync-failed",
              sessionId: req.params.sessionId,
              requestId: req.id,
              error: secondaryError.message || "unknown",
            }),
          );

        if (didRevoke)
          await writeAudit(db, {
            tenantId: req.tenantId,
            actorAccountId: req.auth.accountId,
            action: "SESSION_REVOKED",
            targetType: "playback_session",
            targetId: session.id,
            ip: req.ip,
          });
        res.status(204).end();
      } catch (e) {
        next(e);
      }
    },
  );
  return router;
}
