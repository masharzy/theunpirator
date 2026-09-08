import { Router } from "express";
import { and, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
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
  tenantMembers,
  endUsers,
  devices,
  usageRollups,
  apiKeys,
  webhookEndpoints,
  webhookDeliveries,
} from "@unpirator/db/schema";
import {
  paymentRequests,
  providerConnections,
  tenantSettings,
  tenantSupportNotes,
  adminImpersonationSessions,
  restrictedIntegrationAccess,
} from "@unpirator/db/commerce-schema";
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
    async (req, res, next) => {
      try {
        const conditions = [];
        if (req.query.search) {
          const search = `%${String(req.query.search).slice(0, 120)}%`;
          conditions.push(
            or(
              ilike(accounts.email, search),
              sql`${accounts.id}::text ilike ${search}`,
              sql`exists(select 1 from tenant_members tm join tenants t on t.id=tm.tenant_id where tm.account_id=${accounts.id} and t.name ilike ${search})`,
            ),
          );
        }
        if (req.query.role) conditions.push(eq(accounts.platformRole, String(req.query.role)));
        if (req.query.status) conditions.push(eq(accounts.status, String(req.query.status)));
        if (req.query.mfa === "enabled") conditions.push(isNotNull(accounts.mfaConfirmedAt));
        if (req.query.mfa === "disabled") conditions.push(isNull(accounts.mfaConfirmedAt));
        if (req.query.verified === "yes") conditions.push(isNotNull(accounts.emailVerifiedAt));
        if (req.query.verified === "no") conditions.push(isNull(accounts.emailVerifiedAt));
        if (req.query.google === "yes")
          conditions.push(
            sql`exists(select 1 from oauth_identities oi where oi.account_id=${accounts.id} and oi.provider='google')`,
          );
        if (req.query.google === "no")
          conditions.push(
            sql`not exists(select 1 from oauth_identities oi where oi.account_id=${accounts.id} and oi.provider='google')`,
          );
        if (req.query.createdFrom)
          conditions.push(sql`${accounts.createdAt} >= ${new Date(String(req.query.createdFrom))}`);
        if (req.query.createdTo)
          conditions.push(sql`${accounts.createdAt} <= ${new Date(String(req.query.createdTo))}`);
        res.json({
          items: await db
            .select({
              id: accounts.id,
              email: accounts.email,
              platformRole: accounts.platformRole,
              status: accounts.status,
              emailVerifiedAt: accounts.emailVerifiedAt,
              mfaConfirmedAt: accounts.mfaConfirmedAt,
              lastLoginAt: accounts.lastLoginAt,
              lastLoginIp: accounts.lastLoginIp,
              workspaceCount: sql`(select count(*)::int from tenant_members tm where tm.account_id = ${accounts.id})`,
              googleLinked: sql`exists(select 1 from oauth_identities oi where oi.account_id = ${accounts.id} and oi.provider='google')`,
              riskFlags: sql`array_remove(array[case when ${accounts.status}<>'active' then 'account_restricted' end,case when ${accounts.emailVerifiedAt} is null then 'email_unverified' end,case when ${accounts.platformRole} is not null and ${accounts.mfaConfirmedAt} is null then 'mfa_missing' end],null)`,
              createdAt: accounts.createdAt,
            })
            .from(accounts)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(accounts.createdAt))
            .limit(200),
        });
      } catch (e) {
        next(e);
      }
    },
  );
  router.get(
    "/accounts/:accountId",
    requirePlatformPermission("platform.accounts.read"),
    async (req, res, next) => {
      try {
        const [account] = await db
          .select({
            id: accounts.id,
            email: accounts.email,
            platformRole: accounts.platformRole,
            status: accounts.status,
            emailVerifiedAt: accounts.emailVerifiedAt,
            mfaConfirmedAt: accounts.mfaConfirmedAt,
            lastLoginAt: accounts.lastLoginAt,
            lastLoginIp: accounts.lastLoginIp,
            createdAt: accounts.createdAt,
            updatedAt: accounts.updatedAt,
          })
          .from(accounts)
          .where(eq(accounts.id, req.params.accountId))
          .limit(1);
        if (!account) throw notFound();
        const memberships = await db
          .select()
          .from(tenantMembers)
          .where(eq(tenantMembers.accountId, account.id));
        const sessions = await db
          .select({
            id: accountSessions.id,
            createdAt: accountSessions.createdAt,
            expiresAt: accountSessions.expiresAt,
            mfaVerifiedAt: accountSessions.mfaVerifiedAt,
            ip: accountSessions.ip,
            userAgent: accountSessions.userAgent,
          })
          .from(accountSessions)
          .where(eq(accountSessions.accountId, account.id))
          .orderBy(desc(accountSessions.createdAt))
          .limit(25);
        const [identities, audit] = await Promise.all([
          db
            .select({
              id: oauthIdentities.id,
              provider: oauthIdentities.provider,
              email: oauthIdentities.email,
              createdAt: oauthIdentities.createdAt,
            })
            .from(oauthIdentities)
            .where(eq(oauthIdentities.accountId, account.id)),
          db
            .select()
            .from(auditLogs)
            .where(eq(auditLogs.targetId, account.id))
            .orderBy(desc(auditLogs.createdAt))
            .limit(100),
        ]);
        res.json({ account, memberships, sessions, identities, audit });
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
  router.post(
    "/accounts/:accountId/actions",
    requirePlatformPermission("platform.admin_roles.manage"),
    async (req, res, next) => {
      try {
        const { action, reason } = parseOrThrow(
          z
            .object({
              action: z.enum([
                "revoke_sessions",
                "force_password_reset",
                "resend_verification",
                "remove_google",
              ]),
              reason: z.string().trim().min(8).max(500),
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
        let raw;
        if (action === "revoke_sessions")
          await db.delete(accountSessions).where(eq(accountSessions.accountId, target.id));
        if (["force_password_reset", "resend_verification"].includes(action)) {
          raw = randomToken(32);
          await db.insert(accountTokens).values({
            accountId: target.id,
            kind: action === "force_password_reset" ? "password_reset" : "email_verification",
            tokenHash: sha256(raw),
            expiresAt: new Date(Date.now() + 3600_000),
          });
          await sendEmail(config, {
            to: target.email,
            subject:
              action === "force_password_reset" ? "Reset your password" : "Verify your email",
            html: `<p>Administrator reason: ${reason}</p><p><a href="${config.DASHBOARD_URL}/${action === "force_password_reset" ? "reset-password" : "verify-email"}?token=${encodeURIComponent(raw)}">Continue securely</a></p>`,
          });
        }
        if (action === "remove_google")
          await db
            .delete(oauthIdentities)
            .where(
              and(eq(oauthIdentities.accountId, target.id), eq(oauthIdentities.provider, "google")),
            );
        await writeAudit(db, {
          actorAccountId: req.auth.accountId,
          action: `ACCOUNT_${action.toUpperCase()}`,
          targetType: "account",
          targetId: target.id,
          metadata: { reason },
          ip: req.ip,
        });
        res.json({ completed: true });
      } catch (e) {
        next(e);
      }
    },
  );
  router.get("/tenants", requirePlatformPermission("tenants.read"), async (req, res, next) => {
    try {
      const search = `%${String(req.query.search || "").slice(0, 120)}%`,
        status = String(req.query.status || ""),
        plan = String(req.query.plan || ""),
        subscriptionStatus = String(req.query.subscriptionStatus || ""),
        cursor = req.query.cursor ? new Date(String(req.query.cursor)) : null;
      const sortColumns = { created: "t.created_at", name: "t.name", usage: "usage" };
      const sort = sortColumns[String(req.query.sort)] || sortColumns.created;
      const direction = req.query.direction === "asc" ? "asc" : "desc";
      const items = await db.execute(sql`select t.id,t.name,t.status,t.created_at,t.updated_at,
        (select a.email from tenant_members tm join accounts a on a.id=tm.account_id where tm.tenant_id=t.id and tm.role='owner' limit 1) owner_email,
        (select s.plan_id from subscriptions s where s.tenant_id=t.id order by s.created_at desc limit 1) plan_id,
        (select s.status from subscriptions s where s.tenant_id=t.id order by s.created_at desc limit 1) subscription_status,
        (select count(*)::int from sites where tenant_id=t.id) sites,
        (select count(*)::int from assets where tenant_id=t.id) assets,
        (select count(*)::int from end_users where tenant_id=t.id) viewers,
        (select count(*)::int from playback_sessions where tenant_id=t.id and status='active') active_sessions,
        (select coalesce(sum(quantity),0)::bigint from usage_rollups where tenant_id=t.id) usage,
        (select count(*)::int from security_events where tenant_id=t.id and severity in ('high','critical')) security_alerts
        from tenants t where (${search}='%%' or t.name ilike ${search} or t.id::text ilike ${search}) and (${status}='' or t.status=${status})
        and (${plan}='' or (select s.plan_id from subscriptions s where s.tenant_id=t.id order by s.created_at desc limit 1)=${plan})
        and (${subscriptionStatus}='' or (select s.status from subscriptions s where s.tenant_id=t.id order by s.created_at desc limit 1)=${subscriptionStatus})
        and (${cursor}::timestamptz is null or t.created_at < ${cursor}) order by ${sql.raw(sort)} ${sql.raw(direction)} limit 51`);
      res.json({
        items: items.slice(0, 50),
        nextCursor: items.length > 50 ? items[49].created_at : null,
      });
    } catch (e) {
      next(e);
    }
  });
  router.get(
    "/tenants/:tenantId{/:section}",
    (req, res, next) => {
      const permissionBySection = {
        sessions: "security.read",
        usage: "usage.read",
        subscription: "subscriptions.read",
        payments: "payments.read",
        security: "security.read",
        audit: "audit.read",
        restricted: "providers.read",
      };
      return requirePlatformPermission(permissionBySection[req.params.section] || "tenants.read")(
        req,
        res,
        next,
      );
    },
    async (req, res, next) => {
      try {
        const tenantId = req.params.tenantId;
        const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
        if (!tenant) throw notFound();
        const sources = {
          overview: () =>
            Promise.all([
              db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId)),
              db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)),
            ]).then(([subscription, settings]) => ({ tenant, subscription, settings })),
          members: () =>
            db.select().from(tenantMembers).where(eq(tenantMembers.tenantId, tenantId)),
          sites: () => db.select().from(sites).where(eq(sites.tenantId, tenantId)),
          connections: () =>
            db
              .select({
                id: providerConnections.id,
                provider: providerConnections.provider,
                name: providerConnections.name,
                status: providerConnections.status,
                lastTestAt: providerConnections.lastTestAt,
                lastSuccessAt: providerConnections.lastSuccessAt,
                lastErrorCode: providerConnections.lastErrorCode,
                createdAt: providerConnections.createdAt,
              })
              .from(providerConnections)
              .where(eq(providerConnections.tenantId, tenantId)),
          assets: () => db.select().from(assets).where(eq(assets.tenantId, tenantId)),
          viewers: () => db.select().from(endUsers).where(eq(endUsers.tenantId, tenantId)),
          devices: () => db.select().from(devices).where(eq(devices.tenantId, tenantId)),
          sessions: () =>
            db
              .select()
              .from(playbackSessions)
              .where(eq(playbackSessions.tenantId, tenantId))
              .orderBy(desc(playbackSessions.startedAt))
              .limit(200),
          usage: () => db.select().from(usageRollups).where(eq(usageRollups.tenantId, tenantId)),
          subscription: () =>
            db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId)),
          payments: () =>
            db
              .select()
              .from(paymentRequests)
              .where(eq(paymentRequests.tenantId, tenantId))
              .orderBy(desc(paymentRequests.createdAt)),
          security: () =>
            db
              .select()
              .from(securityEvents)
              .where(eq(securityEvents.tenantId, tenantId))
              .orderBy(desc(securityEvents.createdAt))
              .limit(200),
          audit: () =>
            db
              .select()
              .from(auditLogs)
              .where(eq(auditLogs.tenantId, tenantId))
              .orderBy(desc(auditLogs.createdAt))
              .limit(200),
          notes: () =>
            db
              .select({
                id: tenantSupportNotes.id,
                body: tenantSupportNotes.body,
                author: accounts.email,
                editedAt: tenantSupportNotes.editedAt,
                createdAt: tenantSupportNotes.createdAt,
              })
              .from(tenantSupportNotes)
              .leftJoin(accounts, eq(accounts.id, tenantSupportNotes.authorAccountId))
              .where(eq(tenantSupportNotes.tenantId, tenantId))
              .orderBy(desc(tenantSupportNotes.createdAt)),
          features: () => db.select().from(featureFlags).where(eq(featureFlags.scopeId, tenantId)),
          restricted: () =>
            db
              .select()
              .from(featureFlags)
              .where(
                and(eq(featureFlags.scopeId, tenantId), eq(featureFlags.key, "youtube_custom")),
              ),
        };
        const section = req.params.section || "overview";
        const load = sources[section];
        if (!load) throw notFound();
        const result = await load();
        res.json(Array.isArray(result) ? { tenant, items: result } : result);
      } catch (e) {
        next(e);
      }
    },
  );
  router.get("/usage", requirePlatformPermission("usage.read"), async (_req, res, next) => {
    try {
      res.json({
        items: await db
          .select()
          .from(usageRollups)
          .orderBy(desc(usageRollups.updatedAt))
          .limit(500),
      });
    } catch (e) {
      next(e);
    }
  });
  router.get("/analytics", requirePlatformPermission("usage.read"), async (_req, res, next) => {
    try {
      const [workspaceCount, accountCount, sessionCount, eventCount] = await Promise.all([
        db.select({ value: sql`count(*)::int` }).from(tenants),
        db.select({ value: sql`count(*)::int` }).from(accounts),
        db.select({ value: sql`count(*)::int` }).from(playbackSessions),
        db.select({ value: sql`count(*)::int` }).from(securityEvents),
      ]);
      res.json({
        metrics: {
          workspaces: workspaceCount[0].value,
          accounts: accountCount[0].value,
          playbackSessions: sessionCount[0].value,
          securityEvents: eventCount[0].value,
        },
      });
    } catch (e) {
      next(e);
    }
  });
  router.get(
    "/command-center",
    requirePlatformPermission("tenants.read"),
    async (req, res, next) => {
      try {
        const range = String(req.query.range || "today");
        const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "billing" ? 31 : 1;
        const parsedFrom = req.query.from ? new Date(String(req.query.from)) : null;
        const parsedTo = req.query.to ? new Date(String(req.query.to)) : null;
        const from =
          range === "custom" && parsedFrom && !Number.isNaN(parsedFrom.getTime())
            ? parsedFrom
            : new Date(Date.now() - days * 86400000);
        const to =
          range === "custom" && parsedTo && !Number.isNaN(parsedTo.getTime())
            ? parsedTo
            : new Date();
        const [business, media, topWorkspaces, topAssets, topProviders, attention, providers] =
          await Promise.all([
            db.execute(sql`select
          (select count(*)::int from tenants where status='active') active_workspaces,
          (select count(*)::int from subscriptions where status='trialing') trial_workspaces,
          (select count(*)::int from subscriptions where status='active') active_subscriptions,
          (select count(*)::int from payment_requests where status in ('pending','reviewing')) pending_payments,
          (select count(*)::int from payment_requests where status in ('pending','reviewing') and created_at < now()-interval '12 hours') overdue_payments,
          (select count(*)::int from subscriptions where status='expired') expired_subscriptions,
          (select count(*)::int from subscriptions where status='canceled') canceled_customers,
          (select count(*)::int from subscriptions s join plans p on p.id=s.plan_id where s.status='active' and coalesce((p.entitlements->>'monthly_gateway_requests')::bigint,0)>0 and (select coalesce(sum(quantity),0) from usage_rollups u where u.tenant_id=s.tenant_id and u.period=to_char(now(),'YYYY-MM') and u.metric='gateway_requests') >= (p.entitlements->>'monthly_gateway_requests')::bigint*.8) high_usage_customers,
          (select coalesce(sum(amount_minor_snapshot),0)::bigint from payment_requests where status='approved' and reviewed_at >= date_trunc('month',now())) revenue_this_month,
          (select count(*)::int from accounts where created_at >= date_trunc('month',now())) new_customers`),
            db.execute(sql`select
          (select coalesce(sum(quantity),0)::bigint from usage_events where type='gateway_requests' and created_at between ${from} and ${to}) gateway_requests,
          (select coalesce(sum(coalesce((metadata->>'bytes')::bigint,0)),0)::bigint from usage_events where type='gateway_requests' and created_at between ${from} and ${to}) egress_bytes,
          (select round(coalesce(sum(quantity),0)/2.0,1) from usage_events where type='playback_heartbeat' and created_at between ${from} and ${to}) playback_minutes,
          count(*) filter(where status='active')::int active_sessions,
          count(distinct end_user_id) filter(where started_at between ${from} and ${to})::int unique_viewers,
          (select count(*)::int from security_events where created_at between ${from} and ${to}) security_events
          ,(select count(*)::int from security_events where type ilike '%GRANT%' and created_at between ${from} and ${to}) failed_playback_grants
          ,(select count(*)::int from security_events where type ilike '%ORIGIN%' and created_at between ${from} and ${to}) origin_errors
          from playback_sessions`),
            db.execute(
              sql`select t.id,t.name,max(u.created_at) updated_at,coalesce(sum(coalesce((u.metadata->>'bytes')::bigint,0)) filter(where u.type='gateway_requests'),0)::bigint egress_bytes,coalesce(sum(u.quantity) filter(where u.type='gateway_requests'),0)::bigint gateway_requests,round(coalesce(sum(u.quantity) filter(where u.type='playback_heartbeat'),0)/2.0,1) playback_minutes,count(distinct u.session_id)::int sessions,count(distinct p.end_user_id)::int viewers,count(distinct p.device_id)::int active_devices from tenants t left join usage_events u on u.tenant_id=t.id and u.created_at between ${from} and ${to} left join playback_sessions p on p.id=u.session_id group by t.id,t.name order by egress_bytes desc limit 8`,
            ),
            db.execute(
              sql`select a.id,a.tenant_id,a.title,coalesce(sum(coalesce((u.metadata->>'bytes')::bigint,0)) filter(where u.type='gateway_requests'),0)::bigint egress_bytes,count(distinct u.session_id)::int plays,count(distinct p.end_user_id)::int viewers,(select count(*)::int from security_events se where se.asset_id=a.id and se.created_at between ${from} and ${to}) errors from assets a left join usage_events u on u.asset_id=a.id and u.created_at between ${from} and ${to} left join playback_sessions p on p.id=u.session_id group by a.id,a.tenant_id,a.title order by egress_bytes desc limit 8`,
            ),
            db.execute(
              sql`select p.provider,(select coalesce(sum(u.quantity),0)::bigint from usage_events u join assets a on a.id=u.asset_id where a.provider=p.provider and u.type='gateway_requests' and u.created_at between ${from} and ${to}) requests,(select count(*)::int from security_events se join assets a on a.id=se.asset_id where a.provider=p.provider and se.created_at between ${from} and ${to}) failures from (select distinct provider from assets) p order by requests desc`,
            ),
            db.execute(
              sql`select id::text,'payment' type,'Payment approval waiting' title,tenant_id,created_at from payment_requests where status in ('pending','reviewing')
              union all select id::text,'security',type,tenant_id,created_at from security_events where severity in ('high','critical')
              union all select id::text,'subscription','Subscription expiring',tenant_id,updated_at from subscriptions where status='active' and period_end < now()+interval '7 days'
              union all select endpoint_id::text,'webhook','Webhook retries exhausted',null::uuid,created_at from webhook_deliveries where status='failed'
              union all select s.id::text,'quota',case when used.quantity >= (p.entitlements->>'monthly_gateway_requests')::bigint then 'Workspace quota exceeded' else 'Workspace above 80% quota' end,s.tenant_id,s.updated_at from subscriptions s join plans p on p.id=s.plan_id cross join lateral (select coalesce(sum(quantity),0)::bigint quantity from usage_rollups u where u.tenant_id=s.tenant_id and u.period=to_char(now(),'YYYY-MM') and u.metric='gateway_requests') used where s.status='active' and coalesce((p.entitlements->>'monthly_gateway_requests')::bigint,0)>0 and used.quantity >= (p.entitlements->>'monthly_gateway_requests')::bigint*.8
              order by created_at desc limit 20`,
            ),
            db.select().from(providerHealth),
          ]);
        const serviceHealth = [
          { service: "API", status: "healthy", latencyMs: 0, lastSuccess: new Date() },
          { service: "Database", status: "healthy", latencyMs: 0, lastSuccess: new Date() },
          {
            service: "Redis",
            status: config.REDIS_URL || config.UPSTASH_REDIS_REST_URL ? "healthy" : "degraded",
          },
          {
            service: "Cloudflare Gateway",
            status: config.GATEWAY_CONTROL_URL ? "healthy" : "down",
          },
          { service: "Durable Objects", status: config.GATEWAY_CONTROL_URL ? "healthy" : "down" },
          {
            service: "Usage job",
            status: "healthy",
            lastSuccess: topWorkspaces[0]?.updated_at || null,
          },
          {
            service: "Webhook worker",
            status: attention.some((x) => x.type === "webhook") ? "degraded" : "healthy",
          },
          { service: "Email", status: config.RESEND_API_KEY ? "healthy" : "degraded" },
          {
            service: "Payment queue",
            status: Number(business[0]?.overdue_payments || 0) ? "degraded" : "healthy",
          },
        ];
        const attentionItems = [
          ...attention,
          ...providers
            .filter((provider) => ["degraded", "down"].includes(provider.status))
            .map((provider) => ({
              id: provider.provider,
              type: "provider",
              title: `${provider.provider} provider ${provider.status}`,
              created_at: provider.updatedAt,
            })),
        ];
        res.json({
          range,
          from,
          to,
          business: business[0],
          media: media[0],
          topWorkspaces,
          topAssets,
          topProviders,
          attention: attentionItems,
          providers,
          serviceHealth,
        });
      } catch (e) {
        next(e);
      }
    },
  );
  router.get(
    "/system{/:section}",
    requirePlatformPermission("system.read"),
    async (req, res, next) => {
      try {
        const section = req.params.section || "overview";
        const sources = {
          overview: async () => {
            const [database, queues] = await Promise.all([
              db.execute(sql`select now() checked_at`),
              db.execute(sql`select
                count(*) filter (where status='pending')::int pending_webhooks,
                count(*) filter (where status='failed')::int failed_webhooks,
                min(next_attempt_at) filter (where status='pending') next_retry_at
                from webhook_deliveries`),
            ]);
            return [
              { service: "API", status: "healthy", checkedAt: database[0]?.checked_at },
              { service: "Database", status: "healthy", checkedAt: database[0]?.checked_at },
              { service: "Cache", status: config.REDIS_URL ? "configured" : "degraded" },
              {
                service: "Cloudflare gateway",
                status: config.GATEWAY_CONTROL_URL ? "configured" : "degraded",
              },
              { service: "Email", status: config.RESEND_API_KEY ? "configured" : "degraded" },
              {
                service: "Webhook queue",
                status: queues[0]?.failed_webhooks ? "degraded" : "healthy",
                ...queues[0],
              },
            ];
          },
          health: () => db.select().from(providerHealth),
          jobs: () =>
            db
              .select()
              .from(webhookDeliveries)
              .orderBy(desc(webhookDeliveries.createdAt))
              .limit(200),
          webhooks: () =>
            db
              .select({
                id: webhookEndpoints.id,
                tenantId: webhookEndpoints.tenantId,
                url: webhookEndpoints.url,
                events: webhookEndpoints.events,
                status: webhookEndpoints.status,
                createdAt: webhookEndpoints.createdAt,
              })
              .from(webhookEndpoints)
              .limit(200),
          keys: () =>
            db
              .select({
                id: apiKeys.id,
                tenantId: apiKeys.tenantId,
                name: apiKeys.name,
                keyPrefix: apiKeys.keyPrefix,
                scopes: apiKeys.scopes,
                lastUsedAt: apiKeys.lastUsedAt,
                expiresAt: apiKeys.expiresAt,
                revokedAt: apiKeys.revokedAt,
              })
              .from(apiKeys)
              .limit(200),
          settings: () => db.select().from(tenantSettings).limit(200),
        };
        const load = sources[section];
        if (!load) throw notFound();
        res.json({ items: await load() });
      } catch (e) {
        next(e);
      }
    },
  );
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
  router.get("/features", requirePlatformPermission("features.read"), async (_req, res, next) => {
    try {
      res.json({ items: await db.select().from(featureFlags) });
    } catch (e) {
      next(e);
    }
  });
  router.get(
    "/restricted-integrations",
    requirePlatformPermission("providers.read"),
    async (_req, res, next) => {
      try {
        res.json({
          items: await db
            .select({
              id: restrictedIntegrationAccess.id,
              tenantId: restrictedIntegrationAccess.tenantId,
              tenantName: tenants.name,
              provider: restrictedIntegrationAccess.provider,
              status: restrictedIntegrationAccess.status,
              eligibility: restrictedIntegrationAccess.eligibility,
              reason: restrictedIntegrationAccess.reason,
              reviewedAt: restrictedIntegrationAccess.reviewedAt,
              expiresAt: restrictedIntegrationAccess.expiresAt,
              updatedAt: restrictedIntegrationAccess.updatedAt,
            })
            .from(restrictedIntegrationAccess)
            .innerJoin(tenants, eq(restrictedIntegrationAccess.tenantId, tenants.id))
            .orderBy(desc(restrictedIntegrationAccess.updatedAt)),
        });
      } catch (e) {
        next(e);
      }
    },
  );
  router.patch(
    "/restricted-integrations/:id",
    requirePlatformPermission("restricted.manage"),
    async (req, res, next) => {
      try {
        const input = parseOrThrow(
          z
            .object({
              status: z.enum(["approved", "rejected", "disabled"]),
              reason: z.string().trim().min(8).max(500),
              eligibility: z.record(z.string(), z.boolean()).optional(),
            })
            .strict(),
          req.body,
        );
        const [access] = await db
          .update(restrictedIntegrationAccess)
          .set({
            ...input,
            reviewedBy: req.auth.accountId,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(restrictedIntegrationAccess.id, req.params.id))
          .returning();
        if (!access) throw notFound();
        await db
          .insert(featureFlags)
          .values({
            key: access.provider,
            scopeType: "tenant",
            scopeId: access.tenantId,
            enabled: input.status === "approved",
            updatedBy: req.auth.accountId,
          })
          .onConflictDoUpdate({
            target: [featureFlags.key, featureFlags.scopeType, featureFlags.scopeId],
            set: {
              enabled: input.status === "approved",
              updatedBy: req.auth.accountId,
              updatedAt: new Date(),
            },
          });
        await writeAudit(db, {
          tenantId: access.tenantId,
          actorAccountId: req.auth.accountId,
          action: `RESTRICTED_INTEGRATION_${input.status.toUpperCase()}`,
          targetType: "restricted_integration",
          targetId: access.id,
          metadata: { reason: input.reason },
          ip: req.ip,
        });
        res.json({ access });
      } catch (e) {
        next(e);
      }
    },
  );
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
              reason: z.string().min(8).max(500),
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

  router.post(
    "/tenants/:tenantId/subscription/extend",
    requirePlatformPermission("subscriptions.manage"),
    async (req, res, next) => {
      try {
        const { days, reason } = parseOrThrow(
          z
            .object({ days: z.number().int().min(1).max(365), reason: z.string().min(8).max(500) })
            .strict(),
          req.body,
        );
        const [current] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.tenantId, req.params.tenantId))
          .orderBy(desc(subscriptions.createdAt))
          .limit(1);
        if (!current) throw notFound();
        const base =
          current.periodEnd && current.periodEnd > new Date() ? current.periodEnd : new Date();
        const [subscription] = await db
          .update(subscriptions)
          .set({ periodEnd: new Date(base.getTime() + days * 86400000), updatedAt: new Date() })
          .where(eq(subscriptions.id, current.id))
          .returning();
        await writeAudit(db, {
          tenantId: req.params.tenantId,
          actorAccountId: req.auth.accountId,
          action: "SUBSCRIPTION_EXTENDED",
          targetType: "subscription",
          targetId: current.id,
          metadata: { days, reason },
          ip: req.ip,
        });
        res.json({ subscription });
      } catch (e) {
        next(e);
      }
    },
  );
  router.put(
    "/features/:key",
    requirePlatformPermission("features.manage"),
    async (req, res, next) => {
      try {
        const { enabled, reason } = parseOrThrow(
          z.object({ enabled: z.boolean(), reason: z.string().trim().min(8).max(500) }).strict(),
          req.body,
        );
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
          metadata: { reason },
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
        const { enabled, reason } = parseOrThrow(
          z.object({ enabled: z.boolean(), reason: z.string().min(8).max(500) }).strict(),
          req.body,
        );
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
          metadata: { restricted: key === "youtube_custom", reason },
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
    requirePlatformPermission("sessions.revoke"),
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
  router.post(
    "/tenants/:tenantId/notes",
    requirePlatformPermission("tenant.notes.manage"),
    async (req, res, next) => {
      try {
        const { body } = parseOrThrow(
          z.object({ body: z.string().trim().min(2).max(4000) }).strict(),
          req.body,
        );
        const [note] = await db
          .insert(tenantSupportNotes)
          .values({ tenantId: req.params.tenantId, authorAccountId: req.auth.accountId, body })
          .returning();
        await writeAudit(db, {
          tenantId: req.params.tenantId,
          actorAccountId: req.auth.accountId,
          action: "SUPPORT_NOTE_CREATED",
          targetType: "tenant_note",
          targetId: note.id,
          ip: req.ip,
        });
        res.status(201).json({ note });
      } catch (e) {
        next(e);
      }
    },
  );
  router.post(
    "/tenants/:tenantId/impersonate",
    requirePlatformPermission("tenants.impersonate"),
    async (req, res, next) => {
      try {
        const { reason } = parseOrThrow(
          z.object({ reason: z.string().trim().min(8).max(500) }).strict(),
          req.body,
        );
        const token = randomToken(32),
          expiresAt = new Date(Date.now() + 20 * 60_000);
        const [session] = await db
          .insert(adminImpersonationSessions)
          .values({
            adminAccountId: req.auth.accountId,
            tenantId: req.params.tenantId,
            tokenHash: sha256(token),
            reason,
            expiresAt,
          })
          .returning();
        await writeAudit(db, {
          tenantId: req.params.tenantId,
          actorAccountId: req.auth.accountId,
          action: "IMPERSONATION_STARTED",
          targetType: "impersonation",
          targetId: session.id,
          metadata: { reason, expiresAt },
          ip: req.ip,
        });
        res.cookie("unpirator_impersonation", token, {
          httpOnly: true,
          secure: config.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 1200000,
          path: "/",
        });
        res.json({ tenantId: req.params.tenantId, expiresAt });
      } catch (e) {
        next(e);
      }
    },
  );
  router.delete(
    "/impersonation",
    requirePlatformPermission("tenants.impersonate"),
    async (req, res, next) => {
      try {
        const token = req.cookies?.unpirator_impersonation;
        if (token)
          await db
            .update(adminImpersonationSessions)
            .set({ endedAt: new Date() })
            .where(eq(adminImpersonationSessions.tokenHash, sha256(token)));
        await writeAudit(db, {
          tenantId: req.auth.impersonation?.tenantId,
          actorAccountId: req.auth.accountId,
          action: "IMPERSONATION_ENDED",
          targetType: "impersonation",
          targetId: req.auth.impersonation?.id,
          ip: req.ip,
        });
        res.clearCookie("unpirator_impersonation", { path: "/" });
        res.json({ ended: true });
      } catch (e) {
        next(e);
      }
    },
  );
  return router;
}
