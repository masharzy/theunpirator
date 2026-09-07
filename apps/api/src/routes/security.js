import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { devices, endUsers, securityEvents, playbackSessions } from "@unpirator/db/schema";
import { writeAudit } from "../services/audit.js";
import { notFound } from "../errors.js";

export function securityRouter({ db, requireTenantAdmin, playbackService }) {
  const router = Router();
  router.use(requireTenantAdmin);

  router.get("/events", async (req, res, next) => {
    try {
      res.json({
        items: await db
          .select()
          .from(securityEvents)
          .where(eq(securityEvents.tenantId, req.tenantId))
          .orderBy(desc(securityEvents.createdAt))
          .limit(300),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/devices", async (req, res, next) => {
    try {
      res.json({
        items: await db
          .select({
            id: devices.id,
            endUserId: devices.endUserId,
            externalDeviceId: devices.externalDeviceId,
            deviceName: devices.deviceName,
            browser: devices.browser,
            os: devices.os,
            status: devices.status,
            firstSeenAt: devices.firstSeenAt,
            lastSeenAt: devices.lastSeenAt,
            viewerLabel: endUsers.displayLabel,
            externalUserId: endUsers.externalUserId,
          })
          .from(devices)
          .innerJoin(endUsers, eq(devices.endUserId, endUsers.id))
          .where(eq(devices.tenantId, req.tenantId))
          .orderBy(desc(devices.lastSeenAt))
          .limit(1000),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/users", async (req, res, next) => {
    try {
      res.json({
        items: await db
          .select()
          .from(endUsers)
          .where(eq(endUsers.tenantId, req.tenantId))
          .orderBy(desc(endUsers.updatedAt))
          .limit(1000),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/users/:id", async (req, res, next) => {
    try {
      const [viewer] = await db
        .select()
        .from(endUsers)
        .where(and(eq(endUsers.id, req.params.id), eq(endUsers.tenantId, req.tenantId)))
        .limit(1);
      if (!viewer) throw notFound();
      const [viewerDevices, sessions] = await Promise.all([
        db
          .select()
          .from(devices)
          .where(and(eq(devices.tenantId, req.tenantId), eq(devices.endUserId, viewer.id)))
          .orderBy(desc(devices.lastSeenAt)),
        db
          .select()
          .from(playbackSessions)
          .where(
            and(
              eq(playbackSessions.tenantId, req.tenantId),
              eq(playbackSessions.endUserId, viewer.id),
            ),
          )
          .orderBy(desc(playbackSessions.startedAt))
          .limit(100),
      ]);
      res.json({ viewer, devices: viewerDevices, sessions });
    } catch (error) {
      next(error);
    }
  });

  async function revokeMatchingSessions(req, sessionColumn, id) {
    const sessions = await db
      .select({ id: playbackSessions.id })
      .from(playbackSessions)
      .where(
        and(
          eq(playbackSessions.tenantId, req.tenantId),
          eq(sessionColumn, id),
          eq(playbackSessions.status, "active"),
        ),
      );
    for (const session of sessions)
      await playbackService.revoke({ tenantId: req.tenantId, sessionId: session.id });
    return sessions.length;
  }

  router.post("/devices/:id/block", async (req, res, next) => {
    try {
      const [row] = await db
        .update(devices)
        .set({ status: "blocked" })
        .where(and(eq(devices.id, req.params.id), eq(devices.tenantId, req.tenantId)))
        .returning({ id: devices.id });
      if (!row) throw notFound();
      const revoked = await revokeMatchingSessions(req, playbackSessions.deviceId, row.id);
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "DEVICE_BLOCKED",
        targetType: "device",
        targetId: row.id,
        metadata: { revokedSessions: revoked },
        ip: req.ip,
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/devices/:id/unblock", async (req, res, next) => {
    try {
      const [row] = await db
        .update(devices)
        .set({ status: "active", lastSeenAt: new Date() })
        .where(and(eq(devices.id, req.params.id), eq(devices.tenantId, req.tenantId)))
        .returning({ id: devices.id });
      if (!row) throw notFound();
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "DEVICE_UNBLOCKED",
        targetType: "device",
        targetId: row.id,
        ip: req.ip,
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/users/:id/block", async (req, res, next) => {
    try {
      const [row] = await db
        .update(endUsers)
        .set({ status: "blocked", updatedAt: new Date() })
        .where(and(eq(endUsers.id, req.params.id), eq(endUsers.tenantId, req.tenantId)))
        .returning({ id: endUsers.id });
      if (!row) throw notFound();
      const revoked = await revokeMatchingSessions(req, playbackSessions.endUserId, row.id);
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "USER_BLOCKED",
        targetType: "end_user",
        targetId: row.id,
        metadata: { revokedSessions: revoked },
        ip: req.ip,
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/users/:id/unblock", async (req, res, next) => {
    try {
      const [row] = await db
        .update(endUsers)
        .set({ status: "active", updatedAt: new Date() })
        .where(and(eq(endUsers.id, req.params.id), eq(endUsers.tenantId, req.tenantId)))
        .returning({ id: endUsers.id });
      if (!row) throw notFound();
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "USER_UNBLOCKED",
        targetType: "end_user",
        targetId: row.id,
        ip: req.ip,
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/users/:id/devices/reset", async (req, res, next) => {
    try {
      const [viewer] = await db
        .select({ id: endUsers.id })
        .from(endUsers)
        .where(and(eq(endUsers.id, req.params.id), eq(endUsers.tenantId, req.tenantId)))
        .limit(1);
      if (!viewer) throw notFound();
      const viewerDevices = await db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.tenantId, req.tenantId), eq(devices.endUserId, viewer.id)));
      let revoked = 0;
      for (const device of viewerDevices)
        revoked += await revokeMatchingSessions(req, playbackSessions.deviceId, device.id);
      for (const device of viewerDevices) {
        await db
          .update(devices)
          .set({
            status: "retired",
            externalDeviceId: `${device.id}:retired:${Date.now()}`,
          })
          .where(eq(devices.id, device.id));
      }
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "VIEWER_DEVICES_RESET",
        targetType: "end_user",
        targetId: viewer.id,
        metadata: { devices: viewerDevices.length, revokedSessions: revoked },
        ip: req.ip,
      });
      res.json({ reset: viewerDevices.length, revokedSessions: revoked });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
