import { Router } from "express";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import {
  accountSessions,
  accounts,
  tenantMembers,
  tenants,
  subscriptions,
} from "@unpirator/db/schema";
import { loginSchema, registerSchema, parseOrThrow } from "@unpirator/contracts";
import { randomToken, sha256 } from "@unpirator/crypto";
import { unauthorized } from "../errors.js";
import { writeAudit } from "../services/audit.js";

export function authRouter({ db, config, dashboardAuth, csrfGuard }) {
  const router = Router();
  router.post("/register", async (req, res, next) => {
    try {
      const input = parseOrThrow(registerSchema, req.body);
      const [existing] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.email, input.email))
        .limit(1);
      if (existing) {
        const error = new Error("Account already exists");
        error.code = "ACCOUNT_EXISTS";
        error.status = 409;
        throw error;
      }
      const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
      const created = await db.transaction(async (tx) => {
        const [account] = await tx
          .insert(accounts)
          .values({ email: input.email, passwordHash })
          .returning();
        const [tenant] = await tx.insert(tenants).values({ name: input.tenantName }).returning();
        await tx
          .insert(tenantMembers)
          .values({ tenantId: tenant.id, accountId: account.id, role: "owner" });
        await tx
          .insert(subscriptions)
          .values({
            tenantId: tenant.id,
            planId: "starter",
            status: "trialing",
            periodStart: new Date(),
            periodEnd: new Date(Date.now() + 14 * 86400_000),
          });
        return { account, tenant };
      });
      await writeAudit(db, {
        tenantId: created.tenant.id,
        actorAccountId: created.account.id,
        action: "TENANT_REGISTERED",
        targetType: "tenant",
        targetId: created.tenant.id,
        ip: req.ip,
      });
      res
        .status(201)
        .json({
          tenant: { id: created.tenant.id, name: created.tenant.name },
          account: { id: created.account.id, email: created.account.email },
        });
    } catch (error) {
      next(error);
    }
  });
  router.post("/login", async (req, res, next) => {
    try {
      const input = parseOrThrow(loginSchema, req.body);
      const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.email, input.email))
        .limit(1);
      if (
        !account ||
        account.status !== "active" ||
        !(await argon2.verify(account.passwordHash, input.password))
      )
        throw unauthorized("Invalid email or password");
      const raw = randomToken(32);
      const csrf = randomToken(24);
      const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 3600_000);
      await db
        .insert(accountSessions)
        .values({
          accountId: account.id,
          tokenHash: sha256(raw),
          csrfToken: csrf,
          ip: req.ip,
          userAgent: req.get("user-agent"),
          expiresAt,
        });
      const cookieBase = {
        secure: config.NODE_ENV === "production",
        sameSite: "lax",
        domain: config.COOKIE_DOMAIN || undefined,
        path: "/",
      };
      res.cookie(config.SESSION_COOKIE_NAME, raw, {
        ...cookieBase,
        httpOnly: true,
        expires: expiresAt,
      });
      res.cookie("ap_csrf", csrf, { ...cookieBase, httpOnly: false, expires: expiresAt });
      await writeAudit(db, {
        actorAccountId: account.id,
        action: "ACCOUNT_LOGIN",
        targetType: "account",
        targetId: account.id,
        ip: req.ip,
      });
      res.json({
        account: { id: account.id, email: account.email, platformRole: account.platformRole },
      });
    } catch (error) {
      next(error);
    }
  });
  router.post("/logout", dashboardAuth, csrfGuard, async (req, res, next) => {
    try {
      await db.delete(accountSessions).where(eq(accountSessions.id, req.auth.sessionId));
      res.clearCookie(config.SESSION_COOKIE_NAME, {
        domain: config.COOKIE_DOMAIN || undefined,
        path: "/",
      });
      res.clearCookie("ap_csrf", { domain: config.COOKIE_DOMAIN || undefined, path: "/" });
      await writeAudit(db, {
        actorAccountId: req.auth.accountId,
        action: "ACCOUNT_LOGOUT",
        targetType: "account",
        targetId: req.auth.accountId,
        ip: req.ip,
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  router.get("/me", dashboardAuth, async (req, res, next) => {
    try {
      const memberships = await db
        .select({
          tenantId: tenantMembers.tenantId,
          role: tenantMembers.role,
          tenantName: tenants.name,
        })
        .from(tenantMembers)
        .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
        .where(eq(tenantMembers.accountId, req.auth.accountId));
      res.json({
        account: {
          id: req.auth.accountId,
          email: req.auth.email,
          platformRole: req.auth.platformRole,
        },
        memberships,
      });
    } catch (error) {
      next(error);
    }
  });
  router.get("/csrf", dashboardAuth, (req, res) => res.json({ csrfToken: req.auth.csrfToken }));
  return router;
}
