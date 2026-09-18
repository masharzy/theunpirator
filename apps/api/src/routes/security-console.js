import { Router } from "express";
import { and, count, desc, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import { assets, devices, endUsers, playbackSessions, securityEvents, sites } from "@unpirator/db/schema";
import {
  decryptViewerEmail,
  normalizeViewerEmail,
  viewerIdentityKeyCandidates,
} from "../services/viewer-identity.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);

function positiveInt(value, fallback, maxValue) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maxValue);
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

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

export function securityConsoleRouter({ db, config, requireTenantAdmin }) {
  const router = Router();

  router.get("/events", requireTenantAdmin, async (req, res, next) => {
    try {
      const requestedPage = positiveInt(req.query.page, 1, 1000000);
      const limit = positiveInt(req.query.limit, 25, 100);
      const search = String(req.query.search || "").trim();
      const severityInput = String(req.query.severity || "").trim().toLowerCase();
      const severity = SEVERITIES.has(severityInput) ? severityInput : "all";
      const type = String(req.query.type || "").trim();
      const from = parseDate(req.query.from);
      const to = parseDate(req.query.to);
      const viewerIds = search
        ? await viewerIdsForEmailSearch(db, req.tenantId, search, config)
        : [];

      const filters = [eq(securityEvents.tenantId, req.tenantId)];
      if (severity !== "all") filters.push(eq(securityEvents.severity, severity));
      if (type) filters.push(eq(securityEvents.type, type));
      if (from) filters.push(gte(securityEvents.createdAt, from));
      if (to) filters.push(lte(securityEvents.createdAt, to));

      if (search) {
        const normalizedTypeTerm = search.replace(/\s+/g, "_");
        const searchClauses = [
          ilike(securityEvents.type, `%${search}%`),
          ilike(securityEvents.type, `%${normalizedTypeTerm}%`),
          ilike(securityEvents.severity, `%${search}%`),
          ilike(assets.title, `%${search}%`),
          ilike(sites.name, `%${search}%`),
          ilike(sites.domain, `%${search}%`),
          ilike(playbackSessions.ip, `%${search}%`),
          ilike(playbackSessions.userAgent, `%${search}%`),
          ilike(devices.deviceName, `%${search}%`),
          ilike(devices.browser, `%${search}%`),
          ilike(devices.os, `%${search}%`),
          ilike(devices.externalDeviceId, `%${search}%`),
        ];

        if (viewerIds.length) {
          searchClauses.push(
            inArray(securityEvents.endUserId, viewerIds),
            inArray(playbackSessions.endUserId, viewerIds),
          );
        }

        if (UUID_RE.test(search)) {
          searchClauses.push(
            eq(securityEvents.id, search),
            eq(securityEvents.siteId, search),
            eq(securityEvents.assetId, search),
            eq(securityEvents.sessionId, search),
            eq(securityEvents.endUserId, search),
            eq(playbackSessions.deviceId, search),
          );
        }

        const numericRisk = Number(search);
        if (Number.isInteger(numericRisk) && numericRisk >= 0) {
          searchClauses.push(eq(securityEvents.riskScore, numericRisk));
        }

        filters.push(or(...searchClauses));
      }

      const where = and(...filters);
      const joinedBase = () =>
        db
          .select({
            id: securityEvents.id,
            siteId: securityEvents.siteId,
            endUserId: securityEvents.endUserId,
            assetId: securityEvents.assetId,
            sessionId: securityEvents.sessionId,
            type: securityEvents.type,
            severity: securityEvents.severity,
            riskScore: securityEvents.riskScore,
            metadata: securityEvents.metadata,
            createdAt: securityEvents.createdAt,
            sessionEndUserId: playbackSessions.endUserId,
            assetTitle: assets.title,
            siteName: sites.name,
            siteDomain: sites.domain,
            deviceName: devices.deviceName,
            browser: devices.browser,
            os: devices.os,
          })
          .from(securityEvents)
          .leftJoin(playbackSessions, eq(playbackSessions.id, securityEvents.sessionId))
          .leftJoin(assets, eq(assets.id, securityEvents.assetId))
          .leftJoin(sites, eq(sites.id, securityEvents.siteId))
          .leftJoin(devices, eq(devices.id, playbackSessions.deviceId));

      const [{ value: totalValue }] = await db
        .select({ value: count() })
        .from(securityEvents)
        .leftJoin(playbackSessions, eq(playbackSessions.id, securityEvents.sessionId))
        .leftJoin(assets, eq(assets.id, securityEvents.assetId))
        .leftJoin(sites, eq(sites.id, securityEvents.siteId))
        .leftJoin(devices, eq(devices.id, playbackSessions.deviceId))
        .where(where);

      const total = Number(totalValue || 0);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const page = Math.min(requestedPage, totalPages);
      const rows = await joinedBase()
        .where(where)
        .orderBy(desc(securityEvents.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);

      const viewerIdsForRows = [
        ...new Set(rows.map((row) => row.endUserId || row.sessionEndUserId).filter(Boolean)),
      ];
      const viewerRows = viewerIdsForRows.length
        ? await db
            .select({ id: endUsers.id, displayLabel: endUsers.displayLabel })
            .from(endUsers)
            .where(
              and(
                eq(endUsers.tenantId, req.tenantId),
                inArray(endUsers.id, viewerIdsForRows),
              ),
            )
        : [];
      const viewerEmails = new Map(
        viewerRows.map((viewer) => [
          viewer.id,
          decryptViewerEmail(viewer.displayLabel, req.tenantId, config),
        ]),
      );

      const [eventTotalRows, highSeverityRows, blockedDeviceRows, typeRows] = await Promise.all([
        db
          .select({ value: count() })
          .from(securityEvents)
          .where(eq(securityEvents.tenantId, req.tenantId)),
        db
          .select({ value: count() })
          .from(securityEvents)
          .where(
            and(
              eq(securityEvents.tenantId, req.tenantId),
              or(eq(securityEvents.severity, "critical"), eq(securityEvents.severity, "high")),
            ),
          ),
        db
          .select({ value: count() })
          .from(devices)
          .where(and(eq(devices.tenantId, req.tenantId), eq(devices.status, "blocked"))),
        db
          .select({ type: securityEvents.type })
          .from(securityEvents)
          .where(eq(securityEvents.tenantId, req.tenantId))
          .groupBy(securityEvents.type)
          .orderBy(securityEvents.type),
      ]);

      res.json({
        items: rows.map(({ sessionEndUserId, ...row }) => {
          const viewerId = row.endUserId || sessionEndUserId || null;
          return {
            ...row,
            viewerEmail: viewerId ? viewerEmails.get(viewerId) || null : null,
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
          events: Number(eventTotalRows[0]?.value || 0),
          highSeverity: Number(highSeverityRows[0]?.value || 0),
          blockedDevices: Number(blockedDeviceRows[0]?.value || 0),
        },
        facets: {
          severities: [...SEVERITIES],
          types: typeRows.map((row) => row.type),
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
