import { and, eq, gt } from "drizzle-orm";
import { accountSessions, accounts, tenantMembers } from "@unpirator/db/schema";
import { adminImpersonationSessions } from "@unpirator/db/commerce-schema";
import { sha256, safeEqual } from "@unpirator/crypto";
import { forbidden, unauthorized } from "../errors.js";

export function dashboardAuth({ db, config }) {
  return async (req, _res, next) => {
    try {
      const raw = req.cookies?.[config.SESSION_COOKIE_NAME];
      if (!raw) throw unauthorized();
      const [row] = await db
        .select({
          sessionId: accountSessions.id,
          accountId: accounts.id,
          email: accounts.email,
          platformRole: accounts.platformRole,
          emailVerifiedAt: accounts.emailVerifiedAt,
          mfaConfirmedAt: accounts.mfaConfirmedAt,
          mfaVerifiedAt: accountSessions.mfaVerifiedAt,
          status: accounts.status,
          csrfToken: accountSessions.csrfToken,
        })
        .from(accountSessions)
        .innerJoin(accounts, eq(accountSessions.accountId, accounts.id))
        .where(
          and(
            eq(accountSessions.tokenHash, sha256(raw)),
            gt(accountSessions.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!row || row.status !== "active") throw unauthorized();
      const impersonationToken = req.cookies?.unpirator_impersonation;
      if (impersonationToken) {
        const [impersonation] = await db
          .select()
          .from(adminImpersonationSessions)
          .where(
            and(
              eq(adminImpersonationSessions.tokenHash, sha256(impersonationToken)),
              eq(adminImpersonationSessions.adminAccountId, row.accountId),
              gt(adminImpersonationSessions.expiresAt, new Date()),
            ),
          )
          .limit(1);
        if (impersonation && !impersonation.endedAt) row.impersonation = impersonation;
      }
      req.auth = row;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireVerifiedEmail(req, _res, next) {
  if (req.auth?.emailVerifiedAt || req.auth?.platformRole === "super_admin") return next();
  next(forbidden("Verify your email before changing production credentials"));
}

export function csrfGuard(req, _res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const header = req.get("x-csrf-token");
  const cookie = req.cookies?.ap_csrf;
  if (
    !header ||
    !cookie ||
    !req.auth?.csrfToken ||
    !safeEqual(header, cookie) ||
    !safeEqual(header, req.auth.csrfToken)
  )
    return next(forbidden("Invalid CSRF token"));
  next();
}

export function requireSuperAdmin(req, _res, next) {
  if (req.auth?.platformRole !== "super_admin") return next(forbidden("Super admin required"));
  if (!req.auth.mfaConfirmedAt) return next(forbidden("Authenticator setup required"));
  if (!req.auth.mfaVerifiedAt || Date.now() - req.auth.mfaVerifiedAt.getTime() > 12 * 3600_000)
    return next(forbidden("MFA verification required"));
  next();
}

const platformPermissions = {
  operations_admin: new Set([
    "tenants.read",
    "tenants.manage",
    "usage.read",
    "providers.read",
    "providers.manage",
    "features.read",
    "features.manage",
    "security.read",
    "security.manage",
    "system.read",
    "notifications.read",
    "notifications.manage",
  ]),
  billing_admin: new Set([
    "tenants.read",
    "subscriptions.read",
    "subscriptions.manage",
    "payments.read",
    "payments.approve",
    "plans.manage",
    "notifications.read",
    "notifications.manage",
  ]),
  support_admin: new Set([
    "tenants.read",
    "usage.read",
    "security.read",
    "sessions.revoke",
    "tenant.notes.manage",
    "tenants.impersonate",
    "notifications.read",
    "notifications.manage",
  ]),
  security_admin: new Set([
    "tenants.read",
    "providers.read",
    "features.read",
    "security.read",
    "security.manage",
    "audit.read",
    "usage.read",
    "restricted.manage",
    "features.read",
    "features.manage",
    "sessions.revoke",
    "notifications.read",
    "notifications.manage",
  ]),
  auditor: new Set([
    "platform.accounts.read",
    "tenants.read",
    "subscriptions.read",
    "payments.read",
    "providers.read",
    "features.read",
    "security.read",
    "audit.read",
    "usage.read",
    "notifications.read",
  ]),
};
export function requirePlatformPermission(permission) {
  return (req, res, next) => {
    if (req.auth?.platformRole === "super_admin") return requireSuperAdmin(req, res, next);
    if (!platformPermissions[req.auth?.platformRole]?.has(permission))
      return next(forbidden(`Platform permission required: ${permission}`));
    if (
      !req.auth.mfaConfirmedAt ||
      !req.auth.mfaVerifiedAt ||
      Date.now() - req.auth.mfaVerifiedAt.getTime() > 12 * 3600_000
    )
      return next(forbidden("MFA verification required"));
    next();
  };
}

export function requireRecentMfa(req, _res, next) {
  if (!req.auth?.mfaVerifiedAt || Date.now() - req.auth.mfaVerifiedAt.getTime() > 15 * 60_000)
    return next(forbidden("Recent MFA verification required"));
  next();
}

const roleRank = { viewer: 1, developer: 2, admin: 3, owner: 4 };
export function requireTenantRole(db, minimum = "viewer") {
  return async (req, _res, next) => {
    try {
      const tenantId = req.get("x-tenant-id") || req.params.tenantId;
      if (!tenantId) throw forbidden("Tenant context required");
      if (req.auth?.impersonation?.tenantId === tenantId) {
        req.tenantId = tenantId;
        req.tenantRole = "owner";
        return next();
      }
      if (req.auth?.platformRole === "super_admin") {
        req.tenantId = tenantId;
        return next();
      }
      const [member] = await db
        .select()
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, tenantId),
            eq(tenantMembers.accountId, req.auth.accountId),
          ),
        )
        .limit(1);
      if (!member || !roleRank[member.role] || roleRank[member.role] < roleRank[minimum])
        throw forbidden("Insufficient tenant role");
      req.tenantId = tenantId;
      req.tenantRole = member.role;
      next();
    } catch (error) {
      next(error);
    }
  };
}
