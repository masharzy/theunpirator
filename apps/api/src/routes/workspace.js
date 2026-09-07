import { Router } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  accounts,
  apiKeys,
  assets,
  devices,
  endUsers,
  playbackSessions,
  securityEvents,
  siteDomains,
  sites,
  tenantMembers,
  tenants,
} from "@unpirator/db/schema";
import {
  assetConnectionRefs,
  providerConnections,
  tenantInvitations,
  tenantSettings,
} from "@unpirator/db/commerce-schema";
import { encryptJson, randomToken, sha256 } from "@unpirator/crypto";
import { AppError, notFound } from "../errors.js";
import { writeAudit } from "../services/audit.js";
import { sendEmail } from "../services/email.js";

const roles = ["owner", "admin", "developer", "viewer"];
const providers = ["direct", "hls", "s3", "r2", "bunny"];
const connectionInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    provider: z.enum(providers),
    config: z.record(z.string(), z.any()).default({}),
  })
  .strict();
const settingsInput = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    timezone: z.string().trim().min(2).max(80).optional(),
    defaultSecurityPolicy: z.enum(["standard", "strict", "maximum"]).optional(),
    notificationPreferences: z.record(z.string(), z.boolean()).optional(),
  })
  .strict();

function validateConnection(provider, config) {
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new AppError("INVALID_CONNECTION_CONFIG", "Connection config must be an object", 400);
  if (["s3", "r2"].includes(provider) && (!config.accessKeyId || !config.secretAccessKey))
    throw new AppError(
      "INVALID_CONNECTION_CONFIG",
      "S3/R2 connections require accessKeyId and secretAccessKey",
      400,
    );
  if (provider === "r2" && !config.endpoint)
    throw new AppError(
      "INVALID_CONNECTION_CONFIG",
      "R2 connections require an S3-compatible endpoint",
      400,
    );
  if (
    config.headers &&
    (Array.isArray(config.headers) ||
      typeof config.headers !== "object" ||
      Object.values(config.headers).some((v) => typeof v !== "string"))
  )
    throw new AppError(
      "INVALID_CONNECTION_CONFIG",
      "Connection headers must be string key/value pairs",
      400,
    );
}

export function workspaceRouter({
  db,
  config,
  dashboardAuth,
  csrfGuard,
  requireTenantViewer,
  requireTenantDeveloper,
  requireTenantAdmin,
  requireTenantOwner,
}) {
  const router = Router();
  router.use(dashboardAuth);

  router.post("/invitations/accept", csrfGuard, async (req, res, next) => {
    try {
      const token = String(req.body?.token || "");
      const [invite] = token
        ? await db
            .select()
            .from(tenantInvitations)
            .where(
              and(
                eq(tenantInvitations.tokenHash, sha256(token)),
                isNull(tenantInvitations.acceptedAt),
              ),
            )
            .limit(1)
        : [];
      if (!invite || invite.expiresAt < new Date())
        throw new AppError("INVITE_EXPIRED", "Invitation is invalid or expired", 410);
      if (invite.email.toLowerCase() !== req.auth.email.toLowerCase())
        throw new AppError("INVITE_EMAIL_MISMATCH", "Sign in with the invited email address", 403);
      await db.transaction(async (tx) => {
        await tx
          .insert(tenantMembers)
          .values({ tenantId: invite.tenantId, accountId: req.auth.accountId, role: invite.role })
          .onConflictDoUpdate({
            target: [tenantMembers.tenantId, tenantMembers.accountId],
            set: { role: invite.role },
          });
        await tx
          .update(tenantInvitations)
          .set({ acceptedAt: new Date(), acceptedBy: req.auth.accountId })
          .where(eq(tenantInvitations.id, invite.id));
        await tx
          .update(accounts)
          .set({ lastTenantId: invite.tenantId, updatedAt: new Date() })
          .where(eq(accounts.id, req.auth.accountId));
        await writeAudit(tx, {
          tenantId: invite.tenantId,
          actorAccountId: req.auth.accountId,
          action: "WORKSPACE_INVITE_ACCEPTED",
          targetType: "tenant",
          targetId: invite.tenantId,
          ip: req.ip,
        });
      });
      res.json({ accepted: true, tenantId: invite.tenantId });
    } catch (e) {
      next(e);
    }
  });

  router.get("/summary", requireTenantViewer, async (req, res, next) => {
    try {
      const count = async (table) =>
        Number(
          (
            await db
              .select({ count: sql`count(*)::int` })
              .from(table)
              .where(eq(table.tenantId, req.tenantId))
          )[0]?.count || 0,
        );
      const [
        siteCount,
        assetCount,
        viewerCount,
        deviceCount,
        activeRows,
        alertRows,
        verifiedRows,
        connectionRows,
        keyRows,
        recentAssets,
        recentSecurity,
      ] = await Promise.all([
        count(sites),
        count(assets),
        count(endUsers),
        count(devices),
        db
          .select({ count: sql`count(*)::int` })
          .from(playbackSessions)
          .where(
            and(eq(playbackSessions.tenantId, req.tenantId), eq(playbackSessions.status, "active")),
          ),
        db
          .select({ count: sql`count(*)::int` })
          .from(securityEvents)
          .where(
            and(eq(securityEvents.tenantId, req.tenantId), eq(securityEvents.severity, "warning")),
          ),
        db
          .select({ count: sql`count(distinct ${siteDomains.siteId})::int` })
          .from(siteDomains)
          .innerJoin(sites, eq(siteDomains.siteId, sites.id))
          .where(and(eq(sites.tenantId, req.tenantId), sql`${siteDomains.verifiedAt} is not null`)),
        db
          .select({ count: sql`count(*)::int` })
          .from(providerConnections)
          .where(
            and(
              eq(providerConnections.tenantId, req.tenantId),
              eq(providerConnections.status, "configured"),
            ),
          ),
        db
          .select({ count: sql`count(*)::int` })
          .from(apiKeys)
          .where(and(eq(apiKeys.tenantId, req.tenantId), isNull(apiKeys.revokedAt))),
        db
          .select({
            id: assets.id,
            title: assets.title,
            provider: assets.provider,
            status: assets.status,
            createdAt: assets.createdAt,
          })
          .from(assets)
          .where(eq(assets.tenantId, req.tenantId))
          .orderBy(desc(assets.createdAt))
          .limit(5),
        db
          .select({
            id: securityEvents.id,
            type: securityEvents.type,
            severity: securityEvents.severity,
            riskScore: securityEvents.riskScore,
            createdAt: securityEvents.createdAt,
          })
          .from(securityEvents)
          .where(eq(securityEvents.tenantId, req.tenantId))
          .orderBy(desc(securityEvents.createdAt))
          .limit(5),
      ]);
      res.json({
        counts: {
          sites: siteCount,
          assets: assetCount,
          viewers: viewerCount,
          devices: deviceCount,
          activeSessions: Number(activeRows[0]?.count || 0),
          securityAlerts: Number(alertRows[0]?.count || 0),
          verifiedSites: Number(verifiedRows[0]?.count || 0),
          connections: Number(connectionRows[0]?.count || 0),
          apiKeys: Number(keyRows[0]?.count || 0),
        },
        recentAssets,
        recentSecurity,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/settings", requireTenantViewer, async (req, res, next) => {
    try {
      const [tenant] = await db
        .select({ id: tenants.id, name: tenants.name, status: tenants.status })
        .from(tenants)
        .where(eq(tenants.id, req.tenantId))
        .limit(1);
      if (!tenant) throw notFound();
      const [settings] = await db
        .select()
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, req.tenantId))
        .limit(1);
      res.json({
        tenant,
        settings: settings || {
          tenantId: req.tenantId,
          timezone: "Asia/Dhaka",
          defaultSecurityPolicy: "strict",
          notificationPreferences: {},
        },
      });
    } catch (e) {
      next(e);
    }
  });

  router.patch("/settings", csrfGuard, requireTenantAdmin, async (req, res, next) => {
    try {
      const input = settingsInput.parse(req.body);
      await db.transaction(async (tx) => {
        if (input.name)
          await tx
            .update(tenants)
            .set({ name: input.name, updatedAt: new Date() })
            .where(eq(tenants.id, req.tenantId));
        await tx
          .insert(tenantSettings)
          .values({
            tenantId: req.tenantId,
            timezone: input.timezone || "Asia/Dhaka",
            defaultSecurityPolicy: input.defaultSecurityPolicy || "strict",
            notificationPreferences: input.notificationPreferences || {},
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: tenantSettings.tenantId,
            set: {
              ...(input.timezone && { timezone: input.timezone }),
              ...(input.defaultSecurityPolicy && {
                defaultSecurityPolicy: input.defaultSecurityPolicy,
              }),
              ...(input.notificationPreferences && {
                notificationPreferences: input.notificationPreferences,
              }),
              updatedAt: new Date(),
            },
          });
        await writeAudit(tx, {
          tenantId: req.tenantId,
          actorAccountId: req.auth.accountId,
          action: "WORKSPACE_SETTINGS_CHANGED",
          targetType: "tenant",
          targetId: req.tenantId,
          metadata: { changed: Object.keys(input) },
          ip: req.ip,
        });
      });
      res.json({ updated: true });
    } catch (e) {
      next(e);
    }
  });

  router.get("/team", requireTenantViewer, async (req, res, next) => {
    try {
      const [members, invitations] = await Promise.all([
        db
          .select({
            accountId: tenantMembers.accountId,
            email: accounts.email,
            role: tenantMembers.role,
            emailVerifiedAt: accounts.emailVerifiedAt,
            joinedAt: tenantMembers.createdAt,
          })
          .from(tenantMembers)
          .innerJoin(accounts, eq(tenantMembers.accountId, accounts.id))
          .where(eq(tenantMembers.tenantId, req.tenantId))
          .orderBy(tenantMembers.createdAt),
        db
          .select({
            id: tenantInvitations.id,
            email: tenantInvitations.email,
            role: tenantInvitations.role,
            expiresAt: tenantInvitations.expiresAt,
            acceptedAt: tenantInvitations.acceptedAt,
            createdAt: tenantInvitations.createdAt,
          })
          .from(tenantInvitations)
          .where(eq(tenantInvitations.tenantId, req.tenantId))
          .orderBy(desc(tenantInvitations.createdAt)),
      ]);
      res.json({ members, invitations });
    } catch (e) {
      next(e);
    }
  });

  router.post("/team/invitations", csrfGuard, requireTenantAdmin, async (req, res, next) => {
    try {
      const input = z
        .object({
          email: z
            .string()
            .email()
            .transform((v) => v.toLowerCase()),
          role: z.enum(roles).default("viewer"),
        })
        .strict()
        .parse(req.body);
      if (input.role === "owner")
        return requireTenantOwner(req, res, async (err) => (err ? next(err) : createInvite()));
      return createInvite();
      async function createInvite() {
        try {
          const existing = await db
            .select({ id: accounts.id })
            .from(accounts)
            .where(eq(accounts.email, input.email))
            .limit(1);
          if (existing[0]) {
            const member = await db
              .select({ id: tenantMembers.accountId })
              .from(tenantMembers)
              .where(
                and(
                  eq(tenantMembers.tenantId, req.tenantId),
                  eq(tenantMembers.accountId, existing[0].id),
                ),
              )
              .limit(1);
            if (member[0])
              throw new AppError(
                "ALREADY_MEMBER",
                "This account already belongs to the workspace",
                409,
              );
          }
          const raw = randomToken(32),
            expiresAt = new Date(Date.now() + 7 * 86400_000);
          const [invite] = await db
            .insert(tenantInvitations)
            .values({
              tenantId: req.tenantId,
              email: input.email,
              role: input.role,
              tokenHash: sha256(raw),
              invitedBy: req.auth.accountId,
              expiresAt,
            })
            .returning({
              id: tenantInvitations.id,
              email: tenantInvitations.email,
              role: tenantInvitations.role,
              expiresAt: tenantInvitations.expiresAt,
            });
          await sendEmail(config, {
            to: input.email,
            subject: "Join a The Unpirator workspace",
            html: `<p>You were invited as <strong>${input.role}</strong>.</p><p><a href="${config.DASHBOARD_URL}/dashboard/team?invite=${encodeURIComponent(raw)}">Accept invitation</a></p>`,
          }).catch((error) => req.log?.error({ err: error }, "workspace invitation email failed"));
          await writeAudit(db, {
            tenantId: req.tenantId,
            actorAccountId: req.auth.accountId,
            action: "WORKSPACE_INVITE_SENT",
            targetType: "invitation",
            targetId: invite.id,
            metadata: { email: input.email, role: input.role },
            ip: req.ip,
          });
          res.status(201).json({ invitation: invite });
        } catch (e) {
          next(e);
        }
      }
    } catch (e) {
      next(e);
    }
  });

  async function ownerGuard(req, target, nextRole) {
    if (target.role !== "owner" || nextRole === "owner") return;
    const owners = await db
      .select({ id: tenantMembers.accountId })
      .from(tenantMembers)
      .where(and(eq(tenantMembers.tenantId, req.tenantId), eq(tenantMembers.role, "owner")));
    if (owners.length <= 1)
      throw new AppError("LAST_OWNER_PROTECTED", "Promote another owner first", 409);
  }

  router.patch("/team/:accountId", csrfGuard, requireTenantOwner, async (req, res, next) => {
    try {
      const { role } = z
        .object({ role: z.enum(roles) })
        .strict()
        .parse(req.body);
      const [target] = await db
        .select()
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, req.tenantId),
            eq(tenantMembers.accountId, req.params.accountId),
          ),
        )
        .limit(1);
      if (!target) throw notFound();
      await ownerGuard(req, target, role);
      await db
        .update(tenantMembers)
        .set({ role })
        .where(
          and(
            eq(tenantMembers.tenantId, req.tenantId),
            eq(tenantMembers.accountId, req.params.accountId),
          ),
        );
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "WORKSPACE_MEMBER_ROLE_CHANGED",
        targetType: "account",
        targetId: req.params.accountId,
        metadata: { from: target.role, to: role },
        ip: req.ip,
      });
      res.json({ updated: true });
    } catch (e) {
      next(e);
    }
  });

  router.delete("/team/:accountId", csrfGuard, requireTenantOwner, async (req, res, next) => {
    try {
      const [target] = await db
        .select()
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, req.tenantId),
            eq(tenantMembers.accountId, req.params.accountId),
          ),
        )
        .limit(1);
      if (!target) throw notFound();
      await ownerGuard(req, target, null);
      await db
        .delete(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, req.tenantId),
            eq(tenantMembers.accountId, req.params.accountId),
          ),
        );
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "WORKSPACE_MEMBER_REMOVED",
        targetType: "account",
        targetId: req.params.accountId,
        ip: req.ip,
      });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  router.get("/connections", requireTenantDeveloper, async (req, res, next) => {
    try {
      const items = await db
        .select({
          id: providerConnections.id,
          provider: providerConnections.provider,
          name: providerConnections.name,
          status: providerConnections.status,
          lastTestAt: providerConnections.lastTestAt,
          lastSuccessAt: providerConnections.lastSuccessAt,
          lastErrorCode: providerConnections.lastErrorCode,
          createdAt: providerConnections.createdAt,
          updatedAt: providerConnections.updatedAt,
        })
        .from(providerConnections)
        .where(eq(providerConnections.tenantId, req.tenantId))
        .orderBy(desc(providerConnections.createdAt));
      res.json({ items });
    } catch (e) {
      next(e);
    }
  });

  router.post("/connections", csrfGuard, requireTenantDeveloper, async (req, res, next) => {
    try {
      const input = connectionInput.parse(req.body);
      validateConnection(input.provider, input.config);
      const [connection] = await db
        .insert(providerConnections)
        .values({
          tenantId: req.tenantId,
          provider: input.provider,
          name: input.name,
          encryptedConfig: encryptJson(input.config, config.APP_ENCRYPTION_KEY_BASE64),
          status: "configured",
          createdBy: req.auth.accountId,
        })
        .returning({
          id: providerConnections.id,
          provider: providerConnections.provider,
          name: providerConnections.name,
          status: providerConnections.status,
          createdAt: providerConnections.createdAt,
        });
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "PROVIDER_CONNECTION_CREATED",
        targetType: "provider_connection",
        targetId: connection.id,
        metadata: { provider: connection.provider },
        ip: req.ip,
      });
      res.status(201).json({ connection });
    } catch (e) {
      next(e);
    }
  });

  router.patch(
    "/connections/:connectionId",
    csrfGuard,
    requireTenantDeveloper,
    async (req, res, next) => {
      try {
        const input = z
          .object({
            name: z.string().trim().min(2).max(80).optional(),
            status: z.enum(["configured", "disabled"]).optional(),
            config: z.record(z.string(), z.any()).optional(),
          })
          .strict()
          .parse(req.body);
        const [current] = await db
          .select()
          .from(providerConnections)
          .where(
            and(
              eq(providerConnections.id, req.params.connectionId),
              eq(providerConnections.tenantId, req.tenantId),
            ),
          )
          .limit(1);
        if (!current) throw notFound();
        if (input.config) validateConnection(current.provider, input.config);
        const encrypted = input.config
          ? encryptJson(input.config, config.APP_ENCRYPTION_KEY_BASE64)
          : null;
        const [updated] = await db
          .update(providerConnections)
          .set({
            ...(input.name && { name: input.name }),
            ...(input.status && { status: input.status }),
            ...(encrypted && { encryptedConfig: encrypted }),
            updatedAt: new Date(),
          })
          .where(eq(providerConnections.id, current.id))
          .returning({
            id: providerConnections.id,
            provider: providerConnections.provider,
            name: providerConnections.name,
            status: providerConnections.status,
            updatedAt: providerConnections.updatedAt,
          });
        if (encrypted)
          await db.execute(
            sql`UPDATE assets SET encrypted_provider_config=${encrypted}, updated_at=now() WHERE tenant_id=${req.tenantId}::uuid AND connection_id=${current.id}::uuid`,
          );
        await writeAudit(db, {
          tenantId: req.tenantId,
          actorAccountId: req.auth.accountId,
          action: input.config
            ? "PROVIDER_CONNECTION_CREDENTIALS_ROTATED"
            : "PROVIDER_CONNECTION_UPDATED",
          targetType: "provider_connection",
          targetId: current.id,
          metadata: { changed: Object.keys(input) },
          ip: req.ip,
        });
        res.json({ connection: updated });
      } catch (e) {
        next(e);
      }
    },
  );

  router.post(
    "/connections/:connectionId/test",
    csrfGuard,
    requireTenantDeveloper,
    async (req, res, next) => {
      try {
        const [current] = await db
          .select()
          .from(providerConnections)
          .where(
            and(
              eq(providerConnections.id, req.params.connectionId),
              eq(providerConnections.tenantId, req.tenantId),
            ),
          )
          .limit(1);
        if (!current) throw notFound();
        const now = new Date(),
          ok = current.status !== "disabled";
        await db
          .update(providerConnections)
          .set({
            lastTestAt: now,
            lastSuccessAt: ok ? now : current.lastSuccessAt,
            lastErrorCode: ok ? null : "CONNECTION_DISABLED",
            updatedAt: now,
          })
          .where(eq(providerConnections.id, current.id));
        res.json({ ok, status: current.status, testedAt: now });
      } catch (e) {
        next(e);
      }
    },
  );

  router.delete(
    "/connections/:connectionId",
    csrfGuard,
    requireTenantDeveloper,
    async (req, res, next) => {
      try {
        const [inUse] = await db
          .select({ count: sql`count(*)::int` })
          .from(assetConnectionRefs)
          .where(eq(assetConnectionRefs.connectionId, req.params.connectionId));
        if (Number(inUse?.count || 0) > 0)
          throw new AppError(
            "CONNECTION_IN_USE",
            "Move linked assets before deleting this connection",
            409,
          );
        const [deleted] = await db
          .delete(providerConnections)
          .where(
            and(
              eq(providerConnections.id, req.params.connectionId),
              eq(providerConnections.tenantId, req.tenantId),
            ),
          )
          .returning({ id: providerConnections.id });
        if (!deleted) throw notFound();
        await writeAudit(db, {
          tenantId: req.tenantId,
          actorAccountId: req.auth.accountId,
          action: "PROVIDER_CONNECTION_DELETED",
          targetType: "provider_connection",
          targetId: deleted.id,
          ip: req.ip,
        });
        res.status(204).end();
      } catch (e) {
        next(e);
      }
    },
  );

  return router;
}
