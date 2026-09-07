import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  assets,
  featureFlags,
  playbackSessions,
  providerHealth,
  sites,
  tenants,
  plans,
  subscriptions,
  auditLogs,
  securityEvents,
} from "@unpirator/db/schema";
import { z } from "zod";
import { parseOrThrow } from "@unpirator/contracts";
import { writeAudit } from "../services/audit.js";
import { notFound } from "../errors.js";

const allowedStatuses = new Set(["active", "disabled", "suspended"]);
const providerStatuses = new Set(["healthy", "degraded", "down", "disabled"]);

export function adminRouter({ db, dashboardAuth, csrfGuard, requireSuperAdmin, gatewayControl }) {
  const router = Router();
  router.use(dashboardAuth, csrfGuard, requireSuperAdmin);
  router.get("/tenants", async (_req, res, next) => {
    try {
      res.json({ items: await db.select().from(tenants).orderBy(desc(tenants.createdAt)) });
    } catch (e) {
      next(e);
    }
  });
  router.get("/providers", async (_req, res, next) => {
    try {
      res.json({ items: await db.select().from(providerHealth) });
    } catch (e) {
      next(e);
    }
  });
  router.get("/plans", async (_req, res, next) => {
    try {
      res.json({ items: await db.select().from(plans) });
    } catch (e) {
      next(e);
    }
  });
  router.get("/subscriptions", async (_req, res, next) => {
    try {
      res.json({
        items: await db
          .select()
          .from(subscriptions)
          .orderBy(desc(subscriptions.createdAt))
          .limit(200),
      });
    } catch (e) {
      next(e);
    }
  });
  router.get("/audit", async (_req, res, next) => {
    try {
      res.json({
        items: await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200),
      });
    } catch (e) {
      next(e);
    }
  });
  router.get("/security", async (_req, res, next) => {
    try {
      res.json({
        items: await db
          .select()
          .from(securityEvents)
          .orderBy(desc(securityEvents.createdAt))
          .limit(200),
      });
    } catch (e) {
      next(e);
    }
  });
  router.get("/features", async (_req, res, next) => {
    try {
      res.json({ items: await db.select().from(featureFlags) });
    } catch (e) {
      next(e);
    }
  });
  router.put("/tenants/:tenantId/subscription", async (req, res, next) => {
    try {
      const input = parseOrThrow(
        z
          .object({
            planId: z.enum(["starter", "pro", "business"]),
            status: z.enum(["active", "trialing", "canceled"]).default("active"),
          })
          .strict(),
        req.body,
      );
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, req.params.tenantId))
        .limit(1);
      if (!tenant) throw notFound();
      const subscription = await db.transaction(async (tx) => {
        await tx
          .update(subscriptions)
          .set({ status: "canceled", updatedAt: new Date() })
          .where(eq(subscriptions.tenantId, tenant.id));
        const [row] = await tx
          .insert(subscriptions)
          .values({ tenantId: tenant.id, ...input, periodStart: new Date() })
          .returning();
        await writeAudit(tx, {
          tenantId: tenant.id,
          actorAccountId: req.auth.accountId,
          action: "SUBSCRIPTION_CHANGED",
          targetType: "subscription",
          targetId: row.id,
          metadata: input,
          ip: req.ip,
        });
        return row;
      });
      res.json({ subscription });
    } catch (e) {
      next(e);
    }
  });

  router.put("/features/:key", async (req, res, next) => {
    try {
      const { enabled } = parseOrThrow(z.object({ enabled: z.boolean() }).strict(), req.body);
      const key = req.params.key;
      const [flag] = await db
        .insert(featureFlags)
        .values({
          key,
          scopeType: "global",
          scopeId: "global",
          enabled,
          updatedBy: req.auth.accountId,
        })
        .onConflictDoUpdate({
          target: [featureFlags.key, featureFlags.scopeType, featureFlags.scopeId],
          set: { enabled, updatedBy: req.auth.accountId, updatedAt: new Date() },
        })
        .returning();
      await writeAudit(db, {
        actorAccountId: req.auth.accountId,
        action: enabled ? "GLOBAL_FEATURE_ENABLED" : "GLOBAL_FEATURE_DISABLED",
        targetType: "feature_flag",
        targetId: key,
        ip: req.ip,
      });
      res.json({ flag });
    } catch (e) {
      next(e);
    }
  });

  router.put("/tenants/:tenantId/features/:key", async (req, res, next) => {
    try {
      const key = req.params.key;
      const { enabled } = parseOrThrow(z.object({ enabled: z.boolean() }).strict(), req.body);
      const scopeId = req.params.tenantId;
      const [flag] = await db
        .insert(featureFlags)
        .values({ key, scopeType: "tenant", scopeId, enabled, updatedBy: req.auth.accountId })
        .onConflictDoUpdate({
          target: [featureFlags.key, featureFlags.scopeType, featureFlags.scopeId],
          set: { enabled, updatedBy: req.auth.accountId, updatedAt: new Date() },
        })
        .returning();
      await writeAudit(db, {
        tenantId: scopeId,
        actorAccountId: req.auth.accountId,
        action: enabled ? "FEATURE_ENABLED" : "FEATURE_DISABLED",
        targetType: "feature_flag",
        targetId: key,
        metadata: { restricted: key === "youtube_custom" },
        ip: req.ip,
      });
      res.json({ flag });
    } catch (e) {
      next(e);
    }
  });

  router.patch("/tenants/:tenantId/status", async (req, res, next) => {
    try {
      const status = String(req.body?.status || "");
      if (!allowedStatuses.has(status)) {
        const e = new Error("Invalid status");
        e.status = 400;
        e.code = "VALIDATION_ERROR";
        throw e;
      }
      const [row] = await db
        .update(tenants)
        .set({ status, updatedAt: new Date() })
        .where(eq(tenants.id, req.params.tenantId))
        .returning();
      if (!row) throw notFound();
      await writeAudit(db, {
        tenantId: row.id,
        actorAccountId: req.auth.accountId,
        action: "TENANT_STATUS_CHANGED",
        targetType: "tenant",
        targetId: row.id,
        metadata: { status },
        ip: req.ip,
      });
      res.json({ tenant: row });
    } catch (e) {
      next(e);
    }
  });

  router.patch("/providers/:provider/status", async (req, res, next) => {
    try {
      const status = String(req.body?.status || "");
      if (!providerStatuses.has(status)) {
        const e = new Error("Invalid provider status");
        e.status = 400;
        e.code = "VALIDATION_ERROR";
        throw e;
      }
      const [row] = await db
        .insert(providerHealth)
        .values({ provider: req.params.provider, status, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: providerHealth.provider,
          set: { status, updatedAt: new Date() },
        })
        .returning();
      await writeAudit(db, {
        actorAccountId: req.auth.accountId,
        action: "PROVIDER_STATUS_CHANGED",
        targetType: "provider",
        targetId: req.params.provider,
        metadata: { status },
        ip: req.ip,
      });
      res.json({ provider: row });
    } catch (e) {
      next(e);
    }
  });

  router.patch("/assets/:assetId/status", async (req, res, next) => {
    try {
      const status = String(req.body?.status || "");
      if (!allowedStatuses.has(status)) {
        const e = new Error("Invalid status");
        e.status = 400;
        e.code = "VALIDATION_ERROR";
        throw e;
      }
      const [row] = await db
        .update(assets)
        .set({ status, updatedAt: new Date() })
        .where(eq(assets.id, req.params.assetId))
        .returning();
      if (!row) throw notFound();
      await writeAudit(db, {
        tenantId: row.tenantId,
        actorAccountId: req.auth.accountId,
        action: "ASSET_STATUS_CHANGED",
        targetType: "asset",
        targetId: row.id,
        metadata: { status },
        ip: req.ip,
      });
      res.json({ asset: row });
    } catch (e) {
      next(e);
    }
  });

  router.patch("/sites/:siteId/status", async (req, res, next) => {
    try {
      const status = String(req.body?.status || "");
      if (!allowedStatuses.has(status)) {
        const e = new Error("Invalid status");
        e.status = 400;
        e.code = "VALIDATION_ERROR";
        throw e;
      }
      const [row] = await db
        .update(sites)
        .set({ status, updatedAt: new Date() })
        .where(eq(sites.id, req.params.siteId))
        .returning();
      if (!row) throw notFound();
      await writeAudit(db, {
        tenantId: row.tenantId,
        actorAccountId: req.auth.accountId,
        action: "SITE_STATUS_CHANGED",
        targetType: "site",
        targetId: row.id,
        metadata: { status },
        ip: req.ip,
      });
      res.json({ site: row });
    } catch (e) {
      next(e);
    }
  });

  router.post("/tenants/:tenantId/revoke-sessions", async (req, res, next) => {
    try {
      const active = await db
        .select({ id: playbackSessions.id })
        .from(playbackSessions)
        .where(
          and(
            eq(playbackSessions.tenantId, req.params.tenantId),
            eq(playbackSessions.status, "active"),
          ),
        );
      await db
        .update(playbackSessions)
        .set({ status: "revoked", endedAt: new Date() })
        .where(
          and(
            eq(playbackSessions.tenantId, req.params.tenantId),
            eq(playbackSessions.status, "active"),
          ),
        );
      await Promise.all(active.map((s) => gatewayControl.syncSession(s.id, "revoked", 8 * 3600)));
      await writeAudit(db, {
        tenantId: req.params.tenantId,
        actorAccountId: req.auth.accountId,
        action: "TENANT_SESSIONS_REVOKED",
        targetType: "tenant",
        targetId: req.params.tenantId,
        metadata: { count: active.length },
        ip: req.ip,
      });
      res.json({ revoked: active.length });
    } catch (e) {
      next(e);
    }
  });
  return router;
}
