import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { devices, endUsers, securityEvents, playbackSessions } from "@unpirator/db/schema";
import { writeAudit } from "../services/audit.js";
import { notFound } from "../errors.js";
export function securityRouter({ db, dashboardAuth, requireTenantAdmin, playbackService }) {
  const router = Router();
  router.use(dashboardAuth, requireTenantAdmin);
  router.get("/events", async (req, res, next) => {
    try {
      res.json({
        items: await db
          .select()
          .from(securityEvents)
          .where(eq(securityEvents.tenantId, req.tenantId))
          .orderBy(desc(securityEvents.createdAt))
          .limit(200),
      });
    } catch (e) {
      next(e);
    }
  });
  router.get("/devices", async (req, res, next) => {
    try {
      res.json({
        items: await db.select().from(devices).where(eq(devices.tenantId, req.tenantId)).limit(500),
      });
    } catch (e) {
      next(e);
    }
  });
  router.get("/users", async (req, res, next) => {
    try {
      res.json({
        items: await db
          .select()
          .from(endUsers)
          .where(eq(endUsers.tenantId, req.tenantId))
          .limit(500),
      });
    } catch (e) {
      next(e);
    }
  });
  for (const [route, table, idColumn, sessionColumn, action, target] of [
    [
      "/devices/:id/block",
      devices,
      devices.id,
      playbackSessions.deviceId,
      "DEVICE_BLOCKED",
      "device",
    ],
    [
      "/users/:id/block",
      endUsers,
      endUsers.id,
      playbackSessions.endUserId,
      "USER_BLOCKED",
      "end_user",
    ],
  ])
    router.post(route, async (req, res, next) => {
      try {
        const [row] = await db
          .update(table)
          .set({ status: "blocked" })
          .where(and(eq(idColumn, req.params.id), eq(table.tenantId, req.tenantId)))
          .returning({ id: idColumn });
        if (!row) throw notFound();
        const sessions = await db
          .select({ id: playbackSessions.id })
          .from(playbackSessions)
          .where(
            and(
              eq(playbackSessions.tenantId, req.tenantId),
              eq(sessionColumn, row.id),
              eq(playbackSessions.status, "active"),
            ),
          );
        for (const session of sessions)
          await playbackService.revoke({ tenantId: req.tenantId, sessionId: session.id });
        await writeAudit(db, {
          tenantId: req.tenantId,
          actorAccountId: req.auth.accountId,
          action,
          targetType: target,
          targetId: row.id,
          ip: req.ip,
        });
        res.status(204).end();
      } catch (e) {
        next(e);
      }
    });
  return router;
}
