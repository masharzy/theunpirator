import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  parseOrThrow,
  piracyFindingStatusSchema,
  piracyManualFindingSchema,
  piracyWatchlistCreateSchema,
  piracyWatchlistUpdateSchema,
  takedownCaseCreateSchema,
  takedownCaseUpdateSchema,
} from "@unpirator/contracts";
import {
  accounts,
  piracyFindings,
  piracyWatchlists,
  takedownCases,
  tenants,
} from "@unpirator/db/schema";
import { writeAudit } from "../services/audit.js";
import { AppError, notFound } from "../errors.js";
import { getEntitlements } from "../services/entitlements.js";
import { platformForUrl, runPiracyScan, urlHashOf } from "../services/piracy-scanner.js";
import { generateTakedownNotice } from "../services/takedown-notices.js";
import { createRateLimiter } from "../services/rate-limit.js";
import { createLogger } from "@unpirator/logger";

const logger = createLogger({ service: "piracy-routes" });

async function requirePiracyEntitlement(db, tenantId) {
  const entitlements = await getEntitlements(db, tenantId);
  if (entitlements.piracy_scan !== true)
    throw new AppError("PLAN_LIMIT", "Piracy monitoring is not enabled on this plan", 403);
}

export function piracyRouter({ db, cache, requireTenantViewer, requireTenantAdmin }) {
  const router = Router();
  const scanLimiter = createRateLimiter(cache, {
    prefix: "piracy-scan",
    limit: 6,
    windowSeconds: 60,
  });

  router.get("/watchlists", requireTenantViewer, async (req, res, next) => {
    try {
      const items = await db
        .select()
        .from(piracyWatchlists)
        .where(eq(piracyWatchlists.tenantId, req.tenantId))
        .orderBy(desc(piracyWatchlists.createdAt));
      res.set("cache-control", "private, no-cache").json({ items });
    } catch (e) {
      next(e);
    }
  });

  router.post("/watchlists", requireTenantAdmin, async (req, res, next) => {
    try {
      const input = parseOrThrow(piracyWatchlistCreateSchema, req.body);
      await requirePiracyEntitlement(db, req.tenantId);
      const [created] = await db
        .insert(piracyWatchlists)
        .values({
          tenantId: req.tenantId,
          name: input.name,
          keywords: input.keywords,
          telegramChannels: input.telegramChannels,
          enabled: input.enabled,
        })
        .returning();
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "PIRACY_WATCHLIST_CREATED",
        targetType: "piracy_watchlist",
        targetId: created.id,
        ip: req.ip,
      });
      res.status(201).json({ watchlist: created });
    } catch (e) {
      next(e);
    }
  });

  router.patch("/watchlists/:watchlistId", requireTenantAdmin, async (req, res, next) => {
    try {
      const input = parseOrThrow(piracyWatchlistUpdateSchema, req.body);
      const [updated] = await db
        .update(piracyWatchlists)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(
            eq(piracyWatchlists.id, req.params.watchlistId),
            eq(piracyWatchlists.tenantId, req.tenantId),
          ),
        )
        .returning();
      if (!updated) throw notFound();
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "PIRACY_WATCHLIST_UPDATED",
        targetType: "piracy_watchlist",
        targetId: updated.id,
        ip: req.ip,
      });
      res.json({ watchlist: updated });
    } catch (e) {
      next(e);
    }
  });

  router.delete("/watchlists/:watchlistId", requireTenantAdmin, async (req, res, next) => {
    try {
      const [deleted] = await db
        .delete(piracyWatchlists)
        .where(
          and(
            eq(piracyWatchlists.id, req.params.watchlistId),
            eq(piracyWatchlists.tenantId, req.tenantId),
          ),
        )
        .returning({ id: piracyWatchlists.id });
      if (!deleted) throw notFound();
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "PIRACY_WATCHLIST_DELETED",
        targetType: "piracy_watchlist",
        targetId: deleted.id,
        ip: req.ip,
      });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  router.get("/findings", requireTenantViewer, async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 200);
      const conditions = [eq(piracyFindings.tenantId, req.tenantId)];
      if (req.query.status) conditions.push(eq(piracyFindings.status, String(req.query.status)));
      if (req.query.source) conditions.push(eq(piracyFindings.source, String(req.query.source)));
      if (req.query.watchlistId)
        conditions.push(eq(piracyFindings.watchlistId, String(req.query.watchlistId)));
      const items = await db
        .select()
        .from(piracyFindings)
        .where(and(...conditions))
        .orderBy(desc(piracyFindings.lastSeenAt))
        .limit(limit);
      const caseRows = items.length
        ? await db
            .select()
            .from(takedownCases)
            .where(
              inArray(
                takedownCases.findingId,
                items.map((item) => item.id),
              ),
            )
        : [];
      const casesByFinding = new Map();
      for (const caseRow of caseRows) {
        if (!casesByFinding.has(caseRow.findingId)) casesByFinding.set(caseRow.findingId, []);
        casesByFinding.get(caseRow.findingId).push(caseRow);
      }
      res
        .set("cache-control", "private, no-cache")
        .json({
          items: items.map((item) => ({ ...item, cases: casesByFinding.get(item.id) || [] })),
        });
    } catch (e) {
      next(e);
    }
  });

  router.post("/findings/manual", requireTenantAdmin, async (req, res, next) => {
    try {
      const input = parseOrThrow(piracyManualFindingSchema, req.body);
      const urlHash = urlHashOf(input.url);
      if (!urlHash)
        throw new AppError("VALIDATION_ERROR", "Only http(s) URLs can be reported", 400);
      const [existing] = await db
        .select()
        .from(piracyFindings)
        .where(and(eq(piracyFindings.tenantId, req.tenantId), eq(piracyFindings.urlHash, urlHash)))
        .limit(1);
      const source = platformForUrl(input.url) === "telegram" ? "telegram" : "manual";
      if (existing) {
        const [reactivated] = await db
          .update(piracyFindings)
          .set({
            status: "active",
            title: input.title || existing.title,
            snippet: input.snippet || existing.snippet,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(piracyFindings.id, existing.id))
          .returning();
        return res.json({ finding: reactivated, duplicate: true });
      }
      const [created] = await db
        .insert(piracyFindings)
        .values({
          tenantId: req.tenantId,
          source,
          url: input.url,
          urlHash,
          title: input.title,
          snippet: input.snippet,
          matchedKeywords: [],
        })
        .returning();
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "PIRACY_FINDING_REPORTED",
        targetType: "piracy_finding",
        targetId: created.id,
        metadata: { url: input.url },
        ip: req.ip,
      });
      res.status(201).json({ finding: created, duplicate: false });
    } catch (e) {
      next(e);
    }
  });

  router.patch("/findings/:findingId/status", requireTenantAdmin, async (req, res, next) => {
    try {
      const input = parseOrThrow(piracyFindingStatusSchema, req.body);
      const [updated] = await db
        .update(piracyFindings)
        .set({ status: input.status, updatedAt: new Date() })
        .where(
          and(
            eq(piracyFindings.id, req.params.findingId),
            eq(piracyFindings.tenantId, req.tenantId),
          ),
        )
        .returning();
      if (!updated) throw notFound();
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "PIRACY_FINDING_STATUS_CHANGED",
        targetType: "piracy_finding",
        targetId: updated.id,
        metadata: { status: input.status },
        ip: req.ip,
      });
      res.json({ finding: updated });
    } catch (e) {
      next(e);
    }
  });

  router.get("/findings/:findingId/cases", requireTenantViewer, async (req, res, next) => {
    try {
      const [finding] = await db
        .select({ id: piracyFindings.id })
        .from(piracyFindings)
        .where(
          and(
            eq(piracyFindings.id, req.params.findingId),
            eq(piracyFindings.tenantId, req.tenantId),
          ),
        )
        .limit(1);
      if (!finding) throw notFound();
      const items = await db
        .select()
        .from(takedownCases)
        .where(eq(takedownCases.findingId, finding.id))
        .orderBy(desc(takedownCases.createdAt));
      res.set("cache-control", "private, no-cache").json({ items });
    } catch (e) {
      next(e);
    }
  });

  router.post("/findings/:findingId/cases", requireTenantAdmin, async (req, res, next) => {
    try {
      const input = parseOrThrow(takedownCaseCreateSchema, req.body);
      const [finding] = await db
        .select()
        .from(piracyFindings)
        .where(
          and(
            eq(piracyFindings.id, req.params.findingId),
            eq(piracyFindings.tenantId, req.tenantId),
          ),
        )
        .limit(1);
      if (!finding) throw notFound();
      const [created] = await db
        .insert(takedownCases)
        .values({
          tenantId: req.tenantId,
          findingId: finding.id,
          platform: input.platform,
          notes: input.notes,
          createdById: req.auth.accountId,
        })
        .onConflictDoUpdate({
          target: [takedownCases.findingId, takedownCases.platform],
          set: {
            notes: sql`coalesce(${input.notes ?? null}, ${takedownCases.notes})`,
            updatedAt: new Date(),
          },
        })
        .returning();
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "TAKEDOWN_CASE_OPENED",
        targetType: "takedown_case",
        targetId: created.id,
        metadata: { platform: input.platform },
        ip: req.ip,
      });
      res.status(201).json({ case: created });
    } catch (e) {
      next(e);
    }
  });

  router.get("/cases/:caseId/notice", requireTenantViewer, async (req, res, next) => {
    try {
      const [row] = await db
        .select({
          caseRow: takedownCases,
          finding: piracyFindings,
          tenant: tenants,
          account: accounts,
        })
        .from(takedownCases)
        .innerJoin(piracyFindings, eq(takedownCases.findingId, piracyFindings.id))
        .innerJoin(tenants, eq(takedownCases.tenantId, tenants.id))
        .leftJoin(accounts, eq(takedownCases.createdById, accounts.id))
        .where(
          and(eq(takedownCases.id, req.params.caseId), eq(takedownCases.tenantId, req.tenantId)),
        )
        .limit(1);
      if (!row) throw notFound();
      res.set("cache-control", "private, no-cache").json({ notice: generateTakedownNotice(row) });
    } catch (e) {
      next(e);
    }
  });

  router.patch("/cases/:caseId", requireTenantAdmin, async (req, res, next) => {
    try {
      const input = parseOrThrow(takedownCaseUpdateSchema, req.body);
      const [existing] = await db
        .select()
        .from(takedownCases)
        .where(
          and(eq(takedownCases.id, req.params.caseId), eq(takedownCases.tenantId, req.tenantId)),
        )
        .limit(1);
      if (!existing) throw notFound();
      const [updated] = await db
        .update(takedownCases)
        .set({
          ...input,
          noticeSentAt:
            input.status === "notice_sent"
              ? existing.noticeSentAt || new Date()
              : existing.noticeSentAt,
          resolvedAt:
            input.status === "removed" ||
            input.status === "rejected" ||
            input.status === "withdrawn"
              ? existing.resolvedAt || new Date()
              : existing.resolvedAt,
          updatedAt: new Date(),
        })
        .where(eq(takedownCases.id, existing.id))
        .returning();
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "TAKEDOWN_CASE_UPDATED",
        targetType: "takedown_case",
        targetId: updated.id,
        metadata: { status: input.status || existing.status },
        ip: req.ip,
      });
      res.json({ case: updated });
    } catch (e) {
      next(e);
    }
  });

  // On-demand scan of this tenant's watchlists (the cron job does it globally).
  router.post("/scan", requireTenantAdmin, scanLimiter, async (req, res, next) => {
    try {
      await requirePiracyEntitlement(db, req.tenantId);
      const summary = await runPiracyScan({ db, tenantId: req.tenantId, logger });
      res.json({ summary });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
