import { Router } from "express";
import { and, count, desc, eq, gt, gte, ilike, inArray, max, or } from "drizzle-orm";
import {
  assets,
  devices,
  endUsers,
  playbackSessions,
  securityEvents,
  sites,
} from "@unpirator/db/schema";
import { notFound } from "../errors.js";
import {
  normalizeViewerEmail,
  publicViewer,
  viewerIdentityKeyCandidates,
} from "../services/viewer-identity.js";
import {
  effectiveSessionStatus,
  reconcileExpiredSessions,
  SESSION_ACTIVE_HEARTBEAT_MS,
} from "../services/session-state.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

function positiveInt(value, fallback, maxValue) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maxValue);
}

async function matchingViewerIds(db, tenantId, search, config) {
  const term = String(search || "").trim();
  if (!term) return null;

  const matches = new Set();
  const deviceClauses = [
    ilike(devices.deviceName, `%${term}%`),
    ilike(devices.browser, `%${term}%`),
    ilike(devices.os, `%${term}%`),
    ilike(devices.externalDeviceId, `%${term}%`),
  ];
  if (UUID_RE.test(term)) deviceClauses.push(eq(devices.id, term));

  const deviceRows = await db
    .select({ endUserId: devices.endUserId })
    .from(devices)
    .where(and(eq(devices.tenantId, tenantId), or(...deviceClauses)))
    .limit(5000);
  for (const row of deviceRows) matches.add(row.endUserId);

  if (UUID_RE.test(term)) matches.add(term);

  if (term.includes("@")) {
    try {
      const candidates = viewerIdentityKeyCandidates(normalizeViewerEmail(term), config);
      const rows = await db
        .select({ id: endUsers.id })
        .from(endUsers)
        .where(
          and(eq(endUsers.tenantId, tenantId), inArray(endUsers.externalUserId, candidates)),
        );
      for (const row of rows) matches.add(row.id);
    } catch {
      // Invalid email-like input simply produces no identity match.
    }
  }

  return [...matches];
}

export function viewersRouter({ db, config, requireTenantAdmin }) {
  const router = Router();
  router.use(requireTenantAdmin);

  router.get("/", async (req, res, next) => {
    try {
      const now = new Date();
      await reconcileExpiredSessions(db, req.tenantId, now);

      const requestedPage = positiveInt(req.query.page, 1, 1000000);
      const limit = positiveInt(req.query.limit, 25, 100);
      const search = String(req.query.search || "").trim();
      const status = ["active", "blocked"].includes(String(req.query.status || ""))
        ? String(req.query.status)
        : "all";
      const matchedIds = await matchingViewerIds(db, req.tenantId, search, config);

      const filters = [eq(endUsers.tenantId, req.tenantId)];
      if (status !== "all") filters.push(eq(endUsers.status, status));
      if (matchedIds) {
        filters.push(
          matchedIds.length ? inArray(endUsers.id, matchedIds) : eq(endUsers.id, EMPTY_UUID),
        );
      }

      const where = and(...filters);
      const [totalRow] = await db.select({ value: count() }).from(endUsers).where(where);
      const total = Number(totalRow?.value || 0);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const page = Math.min(requestedPage, totalPages);

      const viewers = await db
        .select()
        .from(endUsers)
        .where(where)
        .orderBy(desc(endUsers.updatedAt))
        .limit(limit)
        .offset((page - 1) * limit);

      const viewerIds = viewers.map((viewer) => viewer.id);
      const heartbeatCutoff = new Date(now.getTime() - SESSION_ACTIVE_HEARTBEAT_MS);
      const [deviceRows, liveRows, totalViewers, blockedViewers, totalDevices, liveSessions] =
        await Promise.all([
          viewerIds.length
            ? db
                .select({
                  endUserId: devices.endUserId,
                  deviceCount: count(),
                  lastSeenAt: max(devices.lastSeenAt),
                })
                .from(devices)
                .where(inArray(devices.endUserId, viewerIds))
                .groupBy(devices.endUserId)
            : [],
          viewerIds.length
            ? db
                .select({ endUserId: playbackSessions.endUserId, liveSessions: count() })
                .from(playbackSessions)
                .where(
                  and(
                    eq(playbackSessions.tenantId, req.tenantId),
                    inArray(playbackSessions.endUserId, viewerIds),
                    eq(playbackSessions.status, "active"),
                    gt(playbackSessions.expiresAt, now),
                    gte(playbackSessions.lastHeartbeatAt, heartbeatCutoff),
                  ),
                )
                .groupBy(playbackSessions.endUserId)
            : [],
          db.select({ value: count() }).from(endUsers).where(eq(endUsers.tenantId, req.tenantId)),
          db
            .select({ value: count() })
            .from(endUsers)
            .where(and(eq(endUsers.tenantId, req.tenantId), eq(endUsers.status, "blocked"))),
          db.select({ value: count() }).from(devices).where(eq(devices.tenantId, req.tenantId)),
          db
            .select({ value: count() })
            .from(playbackSessions)
            .where(
              and(
                eq(playbackSessions.tenantId, req.tenantId),
                eq(playbackSessions.status, "active"),
                gt(playbackSessions.expiresAt, now),
                gte(playbackSessions.lastHeartbeatAt, heartbeatCutoff),
              ),
            ),
        ]);

      const deviceSummary = new Map(deviceRows.map((row) => [row.endUserId, row]));
      const liveSummary = new Map(liveRows.map((row) => [row.endUserId, row]));

      res.json({
        items: viewers.map((viewer) => {
          const device = deviceSummary.get(viewer.id);
          const live = liveSummary.get(viewer.id);
          return {
            ...publicViewer(viewer, req.tenantId, config),
            deviceCount: Number(device?.deviceCount || 0),
            activeSessionCount: Number(live?.liveSessions || 0),
            lastSeenAt: device?.lastSeenAt || viewer.updatedAt,
          };
        }),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        },
        summary: {
          viewers: Number(totalViewers[0]?.value || 0),
          activeViewers:
            Number(totalViewers[0]?.value || 0) - Number(blockedViewers[0]?.value || 0),
          blockedViewers: Number(blockedViewers[0]?.value || 0),
          devices: Number(totalDevices[0]?.value || 0),
          liveSessions: Number(liveSessions[0]?.value || 0),
        },
        search: {
          emailMode: "exact",
          deviceFields: "partial",
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const now = new Date();
      await reconcileExpiredSessions(db, req.tenantId, now);

      const [viewer] = await db
        .select()
        .from(endUsers)
        .where(and(eq(endUsers.id, req.params.id), eq(endUsers.tenantId, req.tenantId)))
        .limit(1);
      if (!viewer) throw notFound("Viewer not found");

      const [viewerDevices, sessions] = await Promise.all([
        db
          .select()
          .from(devices)
          .where(and(eq(devices.tenantId, req.tenantId), eq(devices.endUserId, viewer.id)))
          .orderBy(desc(devices.lastSeenAt)),
        db
          .select({
            id: playbackSessions.id,
            assetId: playbackSessions.assetId,
            siteId: playbackSessions.siteId,
            deviceId: playbackSessions.deviceId,
            status: playbackSessions.status,
            ip: playbackSessions.ip,
            userAgent: playbackSessions.userAgent,
            startedAt: playbackSessions.startedAt,
            lastHeartbeatAt: playbackSessions.lastHeartbeatAt,
            expiresAt: playbackSessions.expiresAt,
            endedAt: playbackSessions.endedAt,
            assetTitle: assets.title,
            siteName: sites.name,
            siteDomain: sites.domain,
          })
          .from(playbackSessions)
          .leftJoin(assets, eq(assets.id, playbackSessions.assetId))
          .leftJoin(sites, eq(sites.id, playbackSessions.siteId))
          .where(
            and(
              eq(playbackSessions.tenantId, req.tenantId),
              eq(playbackSessions.endUserId, viewer.id),
            ),
          )
          .orderBy(desc(playbackSessions.startedAt))
          .limit(30),
      ]);

      const sessionIds = sessions.map((session) => session.id);
      const incidentWhere = sessionIds.length
        ? or(
            eq(securityEvents.endUserId, viewer.id),
            inArray(securityEvents.sessionId, sessionIds),
          )
        : eq(securityEvents.endUserId, viewer.id);
      const incidents = await db
        .select({
          id: securityEvents.id,
          type: securityEvents.type,
          severity: securityEvents.severity,
          riskScore: securityEvents.riskScore,
          sessionId: securityEvents.sessionId,
          assetId: securityEvents.assetId,
          createdAt: securityEvents.createdAt,
        })
        .from(securityEvents)
        .where(and(eq(securityEvents.tenantId, req.tenantId), incidentWhere))
        .orderBy(desc(securityEvents.createdAt))
        .limit(12);

      const effectiveSessions = sessions.map((session) => ({
        ...session,
        status: effectiveSessionStatus(session, now),
      }));
      const activeSessionCount = effectiveSessions.filter(
        (session) => session.status === "active",
      ).length;
      const lastSeenAt = viewerDevices[0]?.lastSeenAt || viewer.updatedAt;

      res.json({
        viewer: publicViewer(viewer, req.tenantId, config),
        summary: {
          deviceCount: viewerDevices.length,
          activeSessionCount,
          lastSeenAt,
        },
        devices: viewerDevices,
        sessions: effectiveSessions,
        incidents,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
