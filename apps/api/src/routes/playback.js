import { Router } from "express";
import { playbackSessionSchema, parseOrThrow } from "@unpirator/contracts";
import { eq, sql } from "drizzle-orm";
import { sha256 } from "@unpirator/crypto";
import { AppError } from "../errors.js";
import { playbackSessions } from "@unpirator/db/schema";
import { writeAudit } from "../services/audit.js";
import { csrfGuard } from "../middleware/auth.js";

export function playbackRouter({
  playbackService,
  apiKeyAuth,
  db,
  cache,
  dashboardAuth,
  requireTenantAdmin,
}) {
  const router = Router();
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
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  });
  router.get("/sessions", dashboardAuth, requireTenantAdmin, async (req, res, next) => {
    try {
      res.json({
        items: await db
          .select()
          .from(playbackSessions)
          .where(eq(playbackSessions.tenantId, req.tenantId)),
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
        const session = await playbackService.revoke({
          tenantId: req.tenantId,
          sessionId: req.params.sessionId,
        });
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
