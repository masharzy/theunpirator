import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
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
import { decryptViewerEmail, publicViewer } from "../services/viewer-identity.js";

function cleanIncidentTitle(type) {
  return String(type || "Security event")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (value) => value.toUpperCase());
}

function denialExplanation(reason, kind) {
  const prefix = kind === "consume" ? "The protected segment was not released" : "No segment ticket was issued";
  const reasons = {
    session_missing: `${prefix} because the gateway session state was missing.`,
    session_active: `${prefix} because the session state was inconsistent.`,
    session_revoked: `${prefix} because the playback session had been revoked.`,
    session_blocked: `${prefix} because the playback session had been blocked.`,
    session_inactive: `${prefix} because the playback session was not active.`,
    session_expired: `${prefix} because the playback session had expired.`,
    integrity_stale:
      `${prefix} because the protected player had not refreshed its integrity state within the required 15-second window.`,
    invalid_track: `${prefix} because the requested media track was invalid.`,
    invalid_variant: `${prefix} because the requested quality variant was invalid.`,
    invalid_sequence: `${prefix} because the requested segment sequence was invalid.`,
    sequence_out_of_window:
      `${prefix} because the segment was outside the server-authorized playback/seek window.`,
    rate_limited:
      `${prefix} because the session exceeded the protected-ticket issuance rate limit.`,
    replay_limit:
      `${prefix} because the same segment reached the bounded ticket re-mint limit.`,
    ticket_missing_or_used:
      `${prefix} because the one-time segment ticket was missing or had already been consumed.`,
    ticket_expired: `${prefix} because the one-time segment ticket had expired.`,
    ticket_track_mismatch: `${prefix} because the ticket did not match the requested media track.`,
    ticket_variant_mismatch:
      `${prefix} because the ticket did not match the requested quality variant.`,
    ticket_sequence_mismatch:
      `${prefix} because the ticket did not match the requested segment sequence.`,
    media_key_unavailable:
      `${prefix} because the protected session encryption key was unavailable.`,
    invalid_resource: `${prefix} because the protected resource identifier was invalid.`,
    resource_mismatch:
      `${prefix} because the one-time resource ticket did not match the requested resource.`,
  };
  return reasons[reason] || null;
}

function explainSecurityEvent(event) {
  const metadata = event.metadata || {};
  const code = metadata.code || event.type;
  const status = metadata.status ?? metadata.upstreamStatus ?? null;
  const message = metadata.message || null;
  const reason = metadata.reason || null;
  const path = metadata.path || null;

  if (event.type === "SEGMENT_TICKET_DENIED") {
    return {
      title: "Segment ticket request was denied",
      explanation:
        denialExplanation(reason, "issue") ||
        (message && message !== "Playback request denied" ? message : null) ||
        "The media gateway asked the playback session to issue a segment ticket, but the session state rejected the request. No protected segment ticket was issued.",
      evidence: {
        code,
        status,
        reason,
        path,
        sessionStatusAtEvent: metadata.sessionStatusAtEvent || null,
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
        denialExplanation(reason, "consume") ||
        (message && message !== "Playback request denied" ? message : null) ||
        "The gateway could not consume the supplied segment ticket for this protected media chunk. The ticket was invalid, expired, mismatched, or already consumed.",
      evidence: {
        code,
        status,
        reason,
        path,
        sessionStatusAtEvent: metadata.sessionStatusAtEvent || null,
      },
    };
  }
  if (event.type === "RESOURCE_TICKET_DENIED") {
    return {
      title: "Protected resource ticket request was denied",
      explanation:
        denialExplanation(reason, "issue") ||
        (message && message !== "Playback request denied" ? message : null) ||
        "The protected HLS resource ticket request was rejected by the playback session state.",
      evidence: {
        code,
        status,
        reason,
        path,
        sessionStatusAtEvent: metadata.sessionStatusAtEvent || null,
      },
    };
  }
  if (event.type === "RESOURCE_TICKET_INVALID") {
    return {
      title: "Protected resource ticket was invalid or already unusable",
      explanation:
        denialExplanation(reason, "consume") ||
        (message && message !== "Playback request denied" ? message : null) ||
        "The gateway could not consume the one-time ticket for this protected HLS resource.",
      evidence: {
        code,
        status,
        reason,
        path,
        sessionStatusAtEvent: metadata.sessionStatusAtEvent || null,
      },
    };
  }
  if (event.type === "TOKEN_EXPIRED") {
    return {
      title: "Playback token expired",
      explanation:
        message ||
        "The short-lived playback token was outside its allowed lifetime when the gateway validated the request.",
      evidence: { code, status, path, sessionStatusAtEvent: metadata.sessionStatusAtEvent || null },
    };
  }
  if (event.type === "PLAYER_INTEGRITY_LOST") {
    return {
      title: "Player integrity validation failed",
      explanation:
        message ||
        "The protected player failed an integrity check or the integrity state rejected the request.",
      evidence: { code, status, path, sessionStatusAtEvent: metadata.sessionStatusAtEvent || null },
    };
  }
  if (event.type === "ORIGIN_REDIRECT_BLOCKED") {
    return {
      title: "Media origin redirect was blocked",
      explanation:
        "The upstream media server tried to redirect playback to a host that is not approved by this asset's origin policy, or to an address blocked by the gateway SSRF policy. The gateway did not follow the redirect.",
      evidence: {
        code,
        status,
        path,
        upstreamStatus: metadata.upstreamStatus ?? null,
        sessionStatusAtEvent: metadata.sessionStatusAtEvent || null,
      },
    };
  }
  if (event.type === "ORIGIN_REDIRECT_INVALID") {
    return {
      title: "Media origin returned an invalid redirect",
      explanation:
        "The upstream media server returned a redirect that did not contain a usable location. The gateway stopped instead of following an ambiguous destination.",
      evidence: {
        code,
        status,
        path,
        upstreamStatus: metadata.upstreamStatus ?? null,
        sessionStatusAtEvent: metadata.sessionStatusAtEvent || null,
      },
    };
  }
  if (event.type === "ORIGIN_REDIRECT_LIMIT") {
    return {
      title: "Media origin exceeded the redirect limit",
      explanation:
        "The media request crossed the gateway's bounded redirect limit. Playback was stopped to avoid redirect loops and unbounded origin traversal.",
      evidence: {
        code,
        status,
        path,
        upstreamStatus: metadata.upstreamStatus ?? null,
        sessionStatusAtEvent: metadata.sessionStatusAtEvent || null,
      },
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
      evidence: {
        code,
        status,
        path,
        upstreamStatus: metadata.upstreamStatus ?? null,
        sessionStatusAtEvent: metadata.sessionStatusAtEvent || null,
      },
    };
  }
  return {
    title: cleanIncidentTitle(event.type),
    explanation:
      message ||
      `The gateway recorded ${String(event.type || "a security event")
        .replaceAll("_", " ")
        .toLowerCase()} while processing this playback request.`,
    evidence: { code, status, path, sessionStatusAtEvent: metadata.sessionStatusAtEvent || null },
  };
}

async function enrichEventsWithViewerEmail(db, tenantId, events, config) {
  if (!events.length) return [];
  const sessionIds = [...new Set(events.filter((event) => !event.endUserId && event.sessionId).map((event) => event.sessionId))];
  const sessionRows = sessionIds.length
    ? await db
        .select({ id: playbackSessions.id, endUserId: playbackSessions.endUserId })
        .from(playbackSessions)
        .where(and(eq(playbackSessions.tenantId, tenantId), inArray(playbackSessions.id, sessionIds)))
    : [];
  const sessionViewer = new Map(sessionRows.map((row) => [row.id, row.endUserId]));
  const viewerIds = [
    ...new Set(
      events
        .map((event) => event.endUserId || sessionViewer.get(event.sessionId))
        .filter(Boolean),
    ),
  ];
  const viewers = viewerIds.length
    ? await db
        .select({ id: endUsers.id, displayLabel: endUsers.displayLabel })
        .from(endUsers)
        .where(and(eq(endUsers.tenantId, tenantId), inArray(endUsers.id, viewerIds)))
    : [];
  const emails = new Map(
    viewers.map((viewer) => [
      viewer.id,
      decryptViewerEmail(viewer.displayLabel, tenantId, config),
    ]),
  );
  return events.map((event) => {
    const viewerId = event.endUserId || sessionViewer.get(event.sessionId) || null;
    return { ...event, viewerEmail: viewerId ? emails.get(viewerId) || null : null };
  });
}

export function securityRouter({ db, config, requireTenantAdmin, playbackService }) {
  const router = Router();
  router.use(requireTenantAdmin);

  router.get("/events", async (req, res, next) => {
    try {
      const events = await db
        .select()
        .from(securityEvents)
        .where(eq(securityEvents.tenantId, req.tenantId))
        .orderBy(desc(securityEvents.createdAt))
        .limit(300);
      res.json({ items: await enrichEventsWithViewerEmail(db, req.tenantId, events, config) });
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

      const [site, asset, session] = await Promise.all([
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
      const viewer = viewerId
        ? await db
            .select()
            .from(endUsers)
            .where(and(eq(endUsers.id, viewerId), eq(endUsers.tenantId, req.tenantId)))
            .limit(1)
            .then((rows) => rows[0] || null)
        : null;

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
        event: {
          ...event,
          viewerEmail: viewer ? decryptViewerEmail(viewer.displayLabel, req.tenantId, config) : null,
        },
        site,
        asset,
        viewer: publicViewer(viewer, req.tenantId, config),
        session,
        device,
        reason: explainSecurityEvent(event),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/devices", async (req, res, next) => {
    try {
      const rows = await db
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
          viewerEmailEncrypted: endUsers.displayLabel,
        })
        .from(devices)
        .innerJoin(endUsers, eq(devices.endUserId, endUsers.id))
        .where(eq(devices.tenantId, req.tenantId))
        .orderBy(desc(devices.lastSeenAt))
        .limit(1000);
      res.json({
        items: rows.map(({ viewerEmailEncrypted, ...device }) => ({
          ...device,
          viewerEmail: decryptViewerEmail(viewerEmailEncrypted, req.tenantId, config),
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/users", async (req, res, next) => {
    try {
      const viewers = await db
        .select()
        .from(endUsers)
        .where(eq(endUsers.tenantId, req.tenantId))
        .orderBy(desc(endUsers.updatedAt))
        .limit(1000);
      res.json({ items: viewers.map((viewer) => publicViewer(viewer, req.tenantId, config)) });
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
      res.json({
        viewer: publicViewer(viewer, req.tenantId, config),
        devices: viewerDevices,
        sessions,
      });
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
