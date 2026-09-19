import { Router } from "express";
import { and, asc, count, desc, eq, gt, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { assets, devices, endUsers, playbackSessions, sites } from "@unpirator/db/schema";
import {
  decryptViewerEmail,
  normalizeViewerEmail,
  viewerIdentityKeyCandidates,
} from "../services/viewer-identity.js";
import {
  effectiveSessionStatus,
  reconcileExpiredSessions,
  SESSION_ACTIVE_HEARTBEAT_MS,
} from "../services/session-state.js";
import { hasListQuery, paginationMeta, parseListQuery } from "../services/list-query.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS_VALUES = new Set(["all", "active", "idle", "ended", "revoked"]);

async function viewerIdsForEmailSearch(db, tenantId, term, config) {
  if (!term.includes("@")) return [];
  try {
    const candidates = viewerIdentityKeyCandidates(normalizeViewerEmail(term), config);
    const rows = await db
      .select({ id: endUsers.id })
      .from(endUsers)
      .where(and(eq(endUsers.tenantId, tenantId), inArray(endUsers.externalUserId, candidates)));
    return rows.map((row) => row.id);
  } catch {
    return [];
  }
}

function sessionStatusCondition(status, now, heartbeatCutoff) {
  const activityAt = sql`COALESCE(${playbackSessions.lastHeartbeatAt}, ${playbackSessions.startedAt})`;
  if (status === "active") {
    return and(
      eq(playbackSessions.status, "active"),
      gt(playbackSessions.expiresAt, now),
      sql`${activityAt} >= ${heartbeatCutoff}`,
    );
  }
  if (status === "idle") {
    return and(
      eq(playbackSessions.status, "active"),
      gt(playbackSessions.expiresAt, now),
      sql`${activityAt} < ${heartbeatCutoff}`,
    );
  }
  if (status === "ended") return eq(playbackSessions.status, "ended");
  if (status === "revoked") return eq(playbackSessions.status, "revoked");
  return null;
}

export function sessionConsoleRouter({ db, config, dashboardAuth, requireTenantAdmin }) {
  const router = Router();

  router.get("/sessions", dashboardAuth, requireTenantAdmin, async (req, res, next) => {
    if (!hasListQuery(req.query)) return next();

    try {
      const now = new Date();
      const heartbeatCutoff = new Date(now.getTime() - SESSION_ACTIVE_HEARTBEAT_MS);
      await reconcileExpiredSessions(db, req.tenantId, now);

      const query = parseListQuery(req.query, { defaultLimit: 25, maxLimit: 100 });
      const requestedStatus = String(req.query.status || "all")
        .trim()
        .toLowerCase();
      const status = STATUS_VALUES.has(requestedStatus) ? requestedStatus : "all";
      const viewerIds = query.search
        ? await viewerIdsForEmailSearch(db, req.tenantId, query.search, config)
        : [];

      const filters = [eq(playbackSessions.tenantId, req.tenantId)];
      const statusFilter = sessionStatusCondition(status, now, heartbeatCutoff);
      if (statusFilter) filters.push(statusFilter);
      if (query.from) filters.push(gte(playbackSessions.startedAt, query.from));
      if (query.to) filters.push(lte(playbackSessions.startedAt, query.to));

      if (query.search) {
        const pattern = `%${query.search}%`;
        const clauses = [
          ilike(assets.title, pattern),
          ilike(sites.name, pattern),
          ilike(sites.domain, pattern),
          ilike(devices.deviceName, pattern),
          ilike(devices.browser, pattern),
          ilike(devices.os, pattern),
          ilike(devices.externalDeviceId, pattern),
          ilike(playbackSessions.ip, pattern),
          ilike(playbackSessions.userAgent, pattern),
          ilike(playbackSessions.status, pattern),
          sql`${playbackSessions.id}::text ILIKE ${pattern}`,
          sql`${playbackSessions.assetId}::text ILIKE ${pattern}`,
          sql`${playbackSessions.siteId}::text ILIKE ${pattern}`,
          sql`${playbackSessions.deviceId}::text ILIKE ${pattern}`,
        ];
        if (viewerIds.length) clauses.push(inArray(playbackSessions.endUserId, viewerIds));
        if (UUID_RE.test(query.search)) {
          clauses.push(
            eq(playbackSessions.id, query.search),
            eq(playbackSessions.assetId, query.search),
            eq(playbackSessions.siteId, query.search),
            eq(playbackSessions.deviceId, query.search),
            eq(playbackSessions.endUserId, query.search),
          );
        }
        filters.push(or(...clauses));
      }

      const where = and(...filters);
      const [{ value: totalValue }] = await db
        .select({ value: count() })
        .from(playbackSessions)
        .leftJoin(assets, eq(assets.id, playbackSessions.assetId))
        .leftJoin(sites, eq(sites.id, playbackSessions.siteId))
        .leftJoin(devices, eq(devices.id, playbackSessions.deviceId))
        .where(where);
      const total = Number(totalValue || 0);
      const pagination = paginationMeta({ page: query.page, limit: query.limit, total });

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
          assetTitle: assets.title,
          siteName: sites.name,
          siteDomain: sites.domain,
          deviceName: devices.deviceName,
          browser: devices.browser,
          os: devices.os,
          externalDeviceId: devices.externalDeviceId,
        })
        .from(playbackSessions)
        .leftJoin(endUsers, eq(endUsers.id, playbackSessions.endUserId))
        .leftJoin(assets, eq(assets.id, playbackSessions.assetId))
        .leftJoin(sites, eq(sites.id, playbackSessions.siteId))
        .leftJoin(devices, eq(devices.id, playbackSessions.deviceId))
        .where(where)
        .orderBy(
          query.sort === "oldest"
            ? asc(playbackSessions.startedAt)
            : desc(playbackSessions.startedAt),
        )
        .limit(query.limit)
        .offset((pagination.page - 1) * query.limit);

      const [allRows, activeRows, idleRows, endedRows, revokedRows] = await Promise.all([
        db
          .select({ value: count() })
          .from(playbackSessions)
          .where(eq(playbackSessions.tenantId, req.tenantId)),
        db
          .select({ value: count() })
          .from(playbackSessions)
          .where(
            and(
              eq(playbackSessions.tenantId, req.tenantId),
              sessionStatusCondition("active", now, heartbeatCutoff),
            ),
          ),
        db
          .select({ value: count() })
          .from(playbackSessions)
          .where(
            and(
              eq(playbackSessions.tenantId, req.tenantId),
              sessionStatusCondition("idle", now, heartbeatCutoff),
            ),
          ),
        db
          .select({ value: count() })
          .from(playbackSessions)
          .where(
            and(eq(playbackSessions.tenantId, req.tenantId), eq(playbackSessions.status, "ended")),
          ),
        db
          .select({ value: count() })
          .from(playbackSessions)
          .where(
            and(
              eq(playbackSessions.tenantId, req.tenantId),
              eq(playbackSessions.status, "revoked"),
            ),
          ),
      ]);

      res.set("cache-control", "no-store").json({
        items: rows.map(({ viewerEmailEncrypted, ...session }) => ({
          ...session,
          status: effectiveSessionStatus(session, now),
          viewerEmail: decryptViewerEmail(viewerEmailEncrypted, req.tenantId, config),
        })),
        pagination,
        summary: {
          all: Number(allRows[0]?.value || 0),
          active: Number(activeRows[0]?.value || 0),
          idle: Number(idleRows[0]?.value || 0),
          ended: Number(endedRows[0]?.value || 0),
          revoked: Number(revokedRows[0]?.value || 0),
        },
        search: {
          viewerEmail: "exact",
          otherContext: "partial",
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
