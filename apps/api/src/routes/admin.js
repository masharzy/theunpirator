import { Router } from "express";
import { and, desc, eq, isNotNull } from "drizzle-orm";
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
  accounts,
  accountMfaMethods,
  accountSessions,
  accountTokens,
  oauthIdentities,
  mfaRecoveryCodes,
} from "@unpirator/db/schema";
import { z } from "zod";
import { emailSchema, parseOrThrow } from "@unpirator/contracts";
import { randomToken, sha256 } from "@unpirator/crypto";
import { writeAudit } from "../services/audit.js";
import { sendEmail } from "../services/email.js";
import { notFound } from "../errors.js";

const allowedStatuses = new Set(["active", "disabled", "suspended"]);
const providerStatuses = new Set(["healthy", "degraded", "down", "disabled"]);

export function adminRouter({
  db,
  config,
  dashboardAuth,
  csrfGuard,
  requirePlatformPermission,
  requireRecentMfa,
  gatewayControl,
}) {
  const router = Router();
  router.use(dashboardAuth, csrfGuard);
  router.use((req, res, next) =>
    ["GET", "HEAD", "OPTIONS"].includes(req.method) ? next() : requireRecentMfa(req, res, next),
  );
  router.get(
    "/accounts",
    requirePlatformPermission("platform.accounts.read"),
    async (_req, res, next) => {
      try {
        res.json({
          items: await db
            .select({
              id: accounts.id,
              email: accounts.email,
              platformRole: accounts.platformRole,
              status: accounts.status,
              emailVerifiedAt: accounts.emailVerifiedAt,
              mfaConfirmedAt: accounts.mfaConfirmedAt,
              createdAt: accounts.createdAt,
            })
            .from(accounts)
            .orderBy(desc(accounts.createdAt))
            .limit(200),
        });
      } catch (e) {
        next(e);
      }
    },
  );
  router.post(
    "/accounts",
    requirePlatformPermission("platform.accounts.manage"),
    async (req, res, next) => {
      try {
        const { email, reason } = parseOrThrow(
          z.object({ email: emailSchema, reason: z.string().min(8).max(500) }).strict(),
          req.body,
        );
        if (
          (
            await db
              .select({ id: accounts.id })
              .from(accounts)
              .where(eq(accounts.email, email))
              .limit(1)
          )[0]
        )
          throw Object.assign(new Error("Account already exists"), {
            status: 409,
            code: "ACCOUNT_EXISTS",
          });
        const raw = randomToken(32);
        const [account] = await db.transaction(async (tx) => {
          const [created] = await tx.insert(accounts).values({ email }).returning();
          await tx.insert(accountTokens).values({
            accountId: created.id,
            kind: "password_reset",
            tokenHash: sha256(raw),
            expiresAt: new Date(Date.now() + 24 * 3600_000),
          });
          await writeAudit(tx, {
            actorAccountId: req.auth.accountId,
            action: "PLATFORM_ACCOUNT_CREATED",
            targetType: "account",
            targetId: created.id,
            metadata: { reason },
            ip: req.ip,
          });
          return [created];
        });
        await sendEmail(config, {
          to: email,
          subject: "Set up your The Unpirator account",
          html: `<p>You were invited to The Unpirator.</p><p><a href="${config.DASHBOARD_URL}/reset-password?token=${encodeURIComponent(raw)}">Set your password</a></p>`,
        }).catch((error) => req.log?.error({ err: error }, "platform invitation email failed"));
        res.status(201).json({ account });
      } catch (e) {
        next(e);
      }
    },
  );
  router.patch(
    "/accounts/:accountId",
    requirePlatformPermission("platform.admin_roles.manage"),
    async (req, res, next) => {
      try {
        const input = parseOrThrow(
          z
            .object({
              platformRole: z
                .enum([
                  "super_admin",
                  "operations_admin",
                  "billing_admin",
                  "support_admin",
                  "security_admin",
                  "auditor",
                ])
                .nullable()
                .optional(),
              status: z.enum(["active", "disabled"]).optional(),
              reason: z.string().min(8).max(500),
            })
            .strict(),
          req.body,
        );
        const [target] = await db
          .select()
          .from(accounts)
          .where(eq(accounts.id, req.params.accountId))
          .limit(1);
        if (!target) throw notFound();
        const nextRole =
            input.platformRole === undefined ? target.platformRole : input.platformRole,
          nextStatus = input.status || target.status;
        if (nextRole && target.platformRole !== nextRole) {
          const [identity] = await db
            .select({ id: oauthIdentities.id })
            .from(oauthIdentities)
            .where(eq(oauthIdentities.accountId, target.id))
            .limit(1);
          if (!target.emailVerifiedAt || (!target.passwordHash && !identity))
            throw Object.assign(
              new Error("Account must verify email and configure a login method first"),
              { status: 409, code: "ACCOUNT_NOT_READY" },
            );
        }
        const activeAdmins = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.platformRole, "super_admin"), eq(accounts.status, "active")));
        const removesActiveAdmin =
          target.platformRole === "super_admin" &&
          target.status === "active" &&
          (nextRole !== "super_admin" || nextStatus !== "active");
        if (removesActiveAdmin && activeAdmins.length <= 2)
          throw Object.assign(new Error("At least two active super admins are required"), {
            status: 409,
            code: "LAST_ADMINS_PROTECTED",
          });
        const [updated] = await db
          .update(accounts)
          .set({ platformRole: nextRole, status: nextStatus, updatedAt: new Date() })
          .where(eq(accounts.id, target.id))
          .returning();
        await writeAudit(db, {
          actorAccountId: req.auth.accountId,
          action:
            target.platformRole !== nextRole
              ? "PLATFORM_ROLE_CHANGED"
              : "PLATFORM_ACCOUNT_STATUS_CHANGED",
          targetType: "account",
          targetId: target.id,
          metadata: {
            fromRole: target.platformRole,
            toRole: nextRole,
            fromStatus: target.status,
            toStatus: nextStatus,
            reason: input.reason,
          },
          ip: req.ip,
        });
        await sendEmail(config, {
          to: target.email,
          subject: "Your The Unpirator platform access changed",
          html: `<p>Your platform access was changed.</p><p>Role: ${nextRole || "customer"}<br>Status: ${nextStatus}</p><p>Reason: ${input.reason}</p>`,
        }).catch((error) => req.log?.error({ err: error }, "admin change email failed"));
        res.json({ account: updated });
      } catch (e) {
        next(e);
      }
    },
  );
  router.post(
    "/accounts/:accountId/mfa-reset",
    requirePlatformPermission("platform.admin_roles.manage"),
    async (req, res, next) => {
      try {
        const { reason } = parseOrThrow(
          z.object({ reason: z.string().min(8).max(500) }).strict(),
          req.body,
        );
        if (req.params.accountId === req.auth.accountId)
          throw Object.assign(new Error("Another super admin must reset your MFA"), {
            status: 409,
            code: "SELF_MFA_RESET_FORBIDDEN",
          });
        const [target] = await db
          .select()
          .from(accounts)
          .where(eq(accounts.id, req.params.accountId))
          .limit(1);
        if (!target) throw notFound();
        const readyAdmins = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(
            and(
              eq(accounts.platformRole, "super_admin"),
              eq(accounts.status, "active"),
              isNotNull(accounts.mfaConfirmedAt),
            ),
          );
        if (
          target.platformRole === "super_admin" &&
          target.status === "active" &&
          readyAdmins.length <= 2
        )
          throw Object.assign(
            new Error("A third active super admin is required before resetting this administrator"),
            { status: 409, code: "ADMIN_RECOVERY_GUARD" },
          );
        await db.transaction(async (tx) => {
          await tx
            .update(accounts)
            .set({ mfaSecretEncrypted: null, mfaConfirmedAt: null, updatedAt: new Date() })
            .where(eq(accounts.id, target.id));
          await tx.delete(accountMfaMethods).where(eq(accountMfaMethods.accountId, target.id));
          await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.accountId, target.id));
          await tx.delete(accountSessions).where(eq(accountSessions.accountId, target.id));
          await writeAudit(tx, {
            actorAccountId: req.auth.accountId,
            action: "ADMIN_MFA_RESET",
            targetType: "account",
            targetId: target.id,
            metadata: { reason },
            ip: req.ip,
          });
        });
        await sendEmail(config, {
          to: target.email,
          subject: "Your The Unpirator MFA was reset",
          html: `<p>Your authenticator was reset by another administrator.</p><p>Reason: ${reason}</p><p>Sign in and configure MFA again.</p>`,
        }).catch((error) => req.log?.error({ err: error }, "MFA reset notification failed"));
        res.json({ reset: true });
      } catch (e) {
        next(e);
      }
    },
  );
  router.get("/tenants", requirePlatformPermission("tenants.read"), async (_req, res, next) => {
    try {
      res.json({ items: await db.select().from(tenants).orderBy(desc(tenants.createdAt)) });
    } catch (e) {
      next(e);
    }
  });
  router.get("/providers", requirePlatformPermission("providers.read"), async (_req, res, next) => {
    try {
      res.json({ items: await db.select().from(providerHealth) });
    } catch (e) {
      next(e);
    }
  });
  router.get("/plans", requirePlatformPermission("subscriptions.read"), async (_req, res, next) => {
    try {
      res.json({ items: await db.select().from(plans) });
    } catch (e) {
      next(e);
    }
  });
  router.get(
    "/subscriptions",
    requirePlatformPermission("subscriptions.read"),
    async (_req, res, next) => {
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
    },
  );
  router.get("/audit", requirePlatformPermission("audit.read"), async (_req, res, next) => {
    try {
      res.json({
        items: await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200),
      });
    } catch (e) {
      next(e);
    }
  });
  router.get("/security", requirePlatformPermission("security.read"), async (_req, res, next) => {
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
  router.get("/features", requirePlatformPermission("providers.read"), async (_req, res, next) => {
    try {
      res.json({ items: await db.select().from(featureFlags) });
    } catch (e) {
      next(e);
    }
  });
  router.put(
    "/tenants/:tenantId/subscription",
    requirePlatformPermission("subscriptions.manage"),
    async (req, res, next) => {
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
    },
  );

  router.put(
    "/features/:key",
    requirePlatformPermission("restricted.manage"),
    async (req, res, next) => {
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
    },
  );

  router.put(
    "/tenants/:tenantId/features/:key",
    requirePlatformPermission("tenants.manage"),
    async (req, res, next) => {
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
    },
  );

  router.patch(
    "/tenants/:tenantId/status",
    requirePlatformPermission("tenants.manage"),
    async (req, res, next) => {
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
    },
  );

  router.patch(
    "/providers/:provider/status",
    requirePlatformPermission("providers.manage"),
    async (req, res, next) => {
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
    },
  );

  router.patch(
    "/assets/:assetId/status",
    requirePlatformPermission("tenants.manage"),
    async (req, res, next) => {
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
    },
  );

  router.patch(
    "/sites/:siteId/status",
    requirePlatformPermission("tenants.manage"),
    async (req, res, next) => {
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
    },
  );

  router.post(
    "/tenants/:tenantId/revoke-sessions",
    requirePlatformPermission("security.manage"),
    async (req, res, next) => {
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
    },
  );
  return router;
}
