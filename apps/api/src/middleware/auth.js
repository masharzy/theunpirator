import { and, eq, gt } from "drizzle-orm";
import { accountSessions, accounts, tenantMembers } from "@unpirator/db/schema";
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
  next();
}

const roleRank = { viewer: 1, developer: 2, admin: 3, owner: 4 };
export function requireTenantRole(db, minimum = "viewer") {
  return async (req, _res, next) => {
    try {
      const tenantId = req.get("x-tenant-id") || req.params.tenantId;
      if (!tenantId) throw forbidden("Tenant context required");
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
