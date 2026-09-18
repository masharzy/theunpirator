import { Router } from "express";
import { and, eq, gt } from "drizzle-orm";
import { playbackSessions } from "@unpirator/db/schema";
import { unauthorized } from "../errors.js";
import { reserveDeliveryQuotaTx } from "../services/quotas.js";

export function quotaInternalRouter({ db, config }) {
  const router = Router();
  router.use((req, _res, next) => {
    const raw = req.get("authorization") || "";
    if (raw !== `Bearer ${config.GATEWAY_INTERNAL_SECRET}`)
      return next(unauthorized("Invalid internal credential"));
    next();
  });

  router.post("/delivery/reserve", async (req, res, next) => {
    try {
      const tenantId = String(req.body?.tenantId || "");
      const sessionId = String(req.body?.sessionId || "");
      const bytes = Math.max(0, Number(req.body?.bytes || 0));
      const [session] = await db
        .select({ id: playbackSessions.id })
        .from(playbackSessions)
        .where(
          and(
            eq(playbackSessions.id, sessionId),
            eq(playbackSessions.tenantId, tenantId),
            eq(playbackSessions.status, "active"),
            gt(playbackSessions.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!session) return res.status(403).json({ error: { code: "SESSION_REVOKED" } });

      const result = await db.transaction((tx) => reserveDeliveryQuotaTx(tx, { tenantId, bytes }));
      if (!result.allowed) {
        const status = result.code === "SUBSCRIPTION_REQUIRED" ? 403 : 429;
        return res.status(status).json({
          error: {
            code: result.code,
            metric: result.metric || null,
            used: result.used ?? null,
            limit: result.limit ?? null,
            message:
              result.code === "SUBSCRIPTION_REQUIRED"
                ? "Active subscription required"
                : "Plan usage limit reached",
          },
        });
      }
      return res.json({ reserved: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
