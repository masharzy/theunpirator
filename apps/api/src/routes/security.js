import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  assets,
  devices,
  endUsers,
  playbackSessions,
  securityEvents,
  sites,
} from "@unpirator/db/schema";
import { writeAudit } from "../services/audit.js";
import { notFound } from "../errors.js";

function cleanIncidentTitle(type) {
  return String(type || "Security event")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (value) => value.toUpperCase());
}

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

  router.get("/events/:id", async (req, res, next) => {
    try {
      const [event] = await db
        .select()
        .from(securityEvents)
        .where(and(eq(securityEvents.id, req.params.id), eq(securityEvents.tenantId, req.tenantId)))
        .limit(1);
      if (!event) throw notFound();

      const [site, asset, viewer, session] = await Promise.all([
        event.siteId
          ? db
              .select({ id: sites.id, name: sites.name, domain: sites.domain, status: sites.status })
              .from(sites)
              .where(and(eq(sites.id, event.siteId), eq(sites.tenantId, req.tenantId)))
              .limit(1)
              .then((rows) => rows[0] || null)
          : null,
        event.assetId
          ? db
              .select({
                id: assets.id,
                title: assets.title,
                provider: assets.provider,
                status: assets.status,
                externalContentId: assets.externalContentId,
              })
              .from(assets)
              .where(and(eq(assets.id, event.assetId), eq(assets.tenantId, req.tenantId)))
              .limit(1)
              .then((rows) => rows[0] || null)
          : null,
        event.endUserId
          ? db
              .select({
                id: endUsers.id,
                externalUserId: endUsers.externalUserId,
                displayLabel: endUsers.displayLabel,
                status: endUsers.status,
              })
              .from(endUsers)
              .where(and(eq(endUsers.id, event.endUserId), eq(endUsers.tenantId, req.tenantId)))
              .limit(1)
              .then((rows) => rows[0] || null)
          : null,
        event.sessionId
          ? db
              .select({
                id: playbackSessions.id,
                endUserId: playbackSessions.endUserId,
                deviceId: playbackSessions.deviceId,
                status: playbackSessions.status,
                ip: playbackSessions.ip,
                userAgent: playbackSessions.userAgent,
                startedAt: playbackSessions.startedAt,
                lastHeartbeatAt: playbackSessions.lastHeartbeatAt,
                expiresAt: playbackSessions.expiresAt,
                endedAt: playbackSessions.endedAt,
              })
              .from(playbackSessions)
              .where(
                and(
                  eq(playbackSessions.id, event.sessionId),
                  eq(playbackSessions.tenantId, req.tenantId),
                ),
              )
              .limit(1)
              .then((rows) => rows[0] || null)
          : null,
      ]);

      const viewerId = event.endUserId || session?.endUserId || null;
      const resolvedViewer = viewerId
        ? await db
            .select({
              id: endUsers.id,
              externalUserId: endUsers.externalUserId,
              displayLabel: endUsers.displayLabel,
              status: endUsers.status,
            })
            .from(endUsers)
            .where(and(eq(endUsers.id, viewerId), eq(endUsers.tenantId, req.tenantId)))
            .limit(1)
            .then((rows) => rows[0] || null)
        : viewer;

      const viewerEmail = [resolvedViewer?.externalUserId, resolvedViewer?.displayLabel].find(
        (value) => typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      ) || null;

      const metadata = event.metadata || {};
      const incidentReason = (() => {
        const code = metadata.code || event.type;
        const status = metadata.status ?? metadata.upstreamStatus ?? null;
        const message = metadata.message || null;
        const path = metadata.path || null;

        if (event.type === "SEGMENT_TICKET_DENIED") {
          return {
            title: "Segment ticket request was denied",
            explanation:
              message ||
              "The media gateway asked the playback session to issue a segment ticket, but the session state rejected the request. No protected segment ticket was issued.",
            evidence: {
              code,
              status,
              path,
              note: metadata.status
                ? "Gateway rejection details were recorded with this event."
                : "This older event did not record the gateway rejection status/message; the denial itself is confirmed.",
            },
          };
        }

        if (event.type === "SEGMENT_TICKET_INVALID") {
          return {
            title: "Segment ticket was invalid or already unusable",
            explanation:
              message ||
              "The gateway could not consume the supplied segment ticket for this protected media chunk. The ticket was invalid, expired, mismatched, or already consumed.",
            evidence: { code, status, path },
          };
        }

        if (event.type === "TOKEN_EXPIRED") {
          return {
            title: "Playback token expired",
            explanation:
              message ||
              "The short-lived playback token was outside its allowed lifetime when the gateway validated the request.",
            evidence: { code, status, path },
          };
        }

        if (event.type === "PLAYER_INTEGRITY_LOST") {
          return {
            title: "Player integrity validation failed",
            explanation:
              message ||
              "The protected player failed an integrity check or the integrity state rejected the request.",
            evidence: { code, status, path },
          };
        }

        if (event.type === "ORIGIN_FAILURE") {
          return {
            title: "Upstream media origin returned an unexpected response",
            explanation:
              message ||
              (metadata.upstreamStatus
                ? `The media gateway could not complete the upstream fetch because the origin returned HTTP ${metadata.upstreamStatus}.`
                : "The media gateway could not complete the upstream media fetch."),
            evidence: { code, status, path, upstreamStatus: metadata.upstreamStatus ?? null },
          };
        }

        return {
          title: cleanIncidentTitle(event.type),
          explanation:
            message ||
            `The gateway recorded ${String(event.type || "a security event").replaceAll("_", " ").toLowerCase()} while processing this playback request.`,
          evidence: { code, status, path },
        };
      })();

      const device = session?.deviceId
        ? await db
            .select({
              id: devices.id,
              externalDeviceId: devices.externalDeviceId,
              deviceName: devices.deviceName,
              browser: devices.browser,
              os: devices.os,
              status: devices.status,
              firstSeenAt: devices.firstSeenAt,
              lastSeenAt: devices.lastSeenAt,
            })
            .from(devices)
            .where(and(eq(devices.id, session.deviceId), eq(devices.tenantId, req.tenantId)))
            .limit(1)
            .then((rows) => rows[0] || null)
        : null;

      res.json({
        event,
        site,
        asset,
        viewer: resolvedViewer ? { ...resolvedViewer, email: viewerEmail } : null,
        session,
        device,
        reason: incidentReason,
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
