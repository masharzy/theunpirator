import { Router } from "express";
import argon2 from "argon2";
import { and, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import {
  accountSessions,
  accountTokens,
  accountMfaMethods,
  accounts,
  mfaRecoveryCodes,
  oauthIdentities,
  tenantMembers,
  tenants,
  subscriptions,
  platformBootstrapState,
} from "@unpirator/db/schema";
import {
  emailSchema,
  loginSchema,
  passwordSchema,
  registerSchema,
  parseOrThrow,
} from "@unpirator/contracts";
import { decryptJson, encryptJson, randomToken, sha256 } from "@unpirator/crypto";
import { forbidden, unauthorized } from "../errors.js";
import { writeAudit } from "../services/audit.js";
import { sendEmail } from "../services/email.js";
import { createHash } from "node:crypto";
import { generateTotpSecret, verifyTotp } from "../services/totp.js";

const hour = 3600_000;
const privilegedRoles = new Set([
  "super_admin",
  "operations_admin",
  "billing_admin",
  "support_admin",
  "security_admin",
]);
const cookieBase = (config) => ({
  secure: config.NODE_ENV === "production",
  sameSite: "lax",
  domain: config.COOKIE_DOMAIN || undefined,
  path: "/",
});
async function issueSession(db, config, req, res, account, mfaVerified = false) {
  const raw = randomToken(32),
    csrf = randomToken(24),
    expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * hour);
  await db.insert(accountSessions).values({
    accountId: account.id,
    tokenHash: sha256(raw),
    csrfToken: csrf,
    mfaVerifiedAt: mfaVerified ? new Date() : null,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    expiresAt,
  });
  await db
    .update(accounts)
    .set({ lastLoginAt: new Date(), lastLoginIp: req.ip, updatedAt: new Date() })
    .where(eq(accounts.id, account.id));
  const base = cookieBase(config);
  res.cookie(config.SESSION_COOKIE_NAME, raw, { ...base, httpOnly: true, expires: expiresAt });
  res.cookie("ap_csrf", csrf, { ...base, httpOnly: false, expires: expiresAt });
}
async function makeToken(db, accountId, kind, ttl) {
  const raw = randomToken(32);
  await db
    .delete(accountTokens)
    .where(and(eq(accountTokens.accountId, accountId), eq(accountTokens.kind, kind)));
  await db
    .insert(accountTokens)
    .values({ accountId, kind, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttl) });
  return raw;
}
async function provision(tx, accountId, name) {
  const [tenant] = await tx.insert(tenants).values({ name }).returning();
  await tx.insert(tenantMembers).values({ tenantId: tenant.id, accountId, role: "owner" });
  await tx.insert(subscriptions).values({
    tenantId: tenant.id,
    planId: "starter",
    status: "trialing",
    periodStart: new Date(),
    periodEnd: new Date(Date.now() + 14 * 86400_000),
  });
  await tx.update(accounts).set({ lastTenantId: tenant.id }).where(eq(accounts.id, accountId));
  return tenant;
}
async function emailLink(config, db, account, kind) {
  const verify = kind === "verify_email";
  const token = await makeToken(db, account.id, kind, verify ? 24 * hour : hour);
  return sendEmail(config, {
    to: account.email,
    subject: verify ? "Verify your The Unpirator email" : "Reset your The Unpirator password",
    html: `<p><a href="${config.DASHBOARD_URL}/${verify ? "verify-email" : "reset-password"}?token=${encodeURIComponent(token)}">${verify ? "Verify email" : "Reset password"}</a></p>`,
  });
}

export function authRouter({ db, config, dashboardAuth, csrfGuard }) {
  const router = Router();
  router.get("/capabilities", (_req, res) =>
    res.json({
      google: Boolean(
        config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REDIRECT_URI,
      ),
    }),
  );
  router.post("/register", async (req, res, next) => {
    try {
      const input = parseOrThrow(registerSchema, req.body);
      if (
        (
          await db
            .select({ id: accounts.id })
            .from(accounts)
            .where(eq(accounts.email, input.email))
            .limit(1)
        )[0]
      )
        throw Object.assign(new Error("Account already exists"), {
          code: "ACCOUNT_EXISTS",
          status: 409,
        });
      const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
      const created = await db.transaction(async (tx) => {
        const [account] = await tx
          .insert(accounts)
          .values({ email: input.email, passwordHash })
          .returning();
        return { account, tenant: await provision(tx, account.id, input.tenantName) };
      });
      await issueSession(db, config, req, res, created.account);
      await emailLink(config, db, created.account, "verify_email").catch((error) =>
        req.log?.error({ err: error }, "verification email failed"),
      );
      await writeAudit(db, {
        tenantId: created.tenant.id,
        actorAccountId: created.account.id,
        action: "TENANT_REGISTERED",
        targetType: "tenant",
        targetId: created.tenant.id,
        ip: req.ip,
      });
      res.status(201).json({
        tenant: created.tenant,
        account: { id: created.account.id, email: created.account.email, emailVerified: false },
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
        !account?.passwordHash ||
        account.status !== "active" ||
        !(await argon2.verify(account.passwordHash, input.password))
      )
        throw unauthorized("Invalid email or password");
      if (privilegedRoles.has(account.platformRole) && account.mfaConfirmedAt) {
        const challenge = await makeToken(db, account.id, "mfa_login", 10 * 60_000);
        return res.json({ mfaRequired: true, challenge });
      }
      await issueSession(db, config, req, res, account);
      await writeAudit(db, {
        actorAccountId: account.id,
        action: "ACCOUNT_LOGIN",
        targetType: "account",
        targetId: account.id,
        ip: req.ip,
      });
      res.json({
        account: {
          id: account.id,
          email: account.email,
          platformRole: account.platformRole,
          emailVerified: Boolean(account.emailVerifiedAt),
          mfaSetupRequired: privilegedRoles.has(account.platformRole) && !account.mfaConfirmedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  });
  router.post("/mfa/challenge", async (req, res, next) => {
    try {
      const [challenge] = await db
        .select()
        .from(accountTokens)
        .where(
          and(
            eq(accountTokens.tokenHash, sha256(String(req.body?.challenge || ""))),
            eq(accountTokens.kind, "mfa_login"),
            isNull(accountTokens.usedAt),
            gt(accountTokens.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!challenge?.accountId) throw unauthorized("MFA challenge is invalid or expired");
      const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, challenge.accountId))
        .limit(1);
      if (!account?.mfaConfirmedAt || !account.mfaSecretEncrypted || account.status !== "active")
        throw unauthorized("MFA is unavailable");
      const { secret } = decryptJson(account.mfaSecretEncrypted, config.APP_ENCRYPTION_KEY_BASE64);
      const now = new Date();
      const [method] = await db
        .select()
        .from(accountMfaMethods)
        .where(
          and(
            eq(accountMfaMethods.accountId, account.id),
            eq(accountMfaMethods.type, "totp"),
            eq(accountMfaMethods.enabled, true),
          ),
        )
        .limit(1);
      const replayed =
        method?.lastUsedAt &&
        Math.floor(method.lastUsedAt.getTime() / 30000) === Math.floor(now.getTime() / 30000);
      let accepted = !replayed && verifyTotp(secret, req.body?.code),
        recovery;
      if (!accepted)
        [recovery] = await db
          .select()
          .from(mfaRecoveryCodes)
          .where(
            and(
              eq(mfaRecoveryCodes.accountId, account.id),
              eq(
                mfaRecoveryCodes.codeHash,
                sha256(
                  String(req.body?.code || "")
                    .trim()
                    .toUpperCase(),
                ),
              ),
              isNull(mfaRecoveryCodes.usedAt),
            ),
          )
          .limit(1);
      if (!accepted && !recovery) throw unauthorized("Invalid authenticator or recovery code");
      await db.transaction(async (tx) => {
        await tx
          .update(accountTokens)
          .set({ usedAt: now })
          .where(eq(accountTokens.id, challenge.id));
        if (recovery)
          await tx
            .update(mfaRecoveryCodes)
            .set({ usedAt: now })
            .where(eq(mfaRecoveryCodes.id, recovery.id));
        else
          await tx
            .update(accountMfaMethods)
            .set({ lastUsedAt: now })
            .where(eq(accountMfaMethods.id, method.id));
      });
      await issueSession(db, config, req, res, account, true);
      await writeAudit(db, {
        actorAccountId: account.id,
        action: "ADMIN_MFA_LOGIN",
        targetType: "account",
        targetId: account.id,
        ip: req.ip,
      });
      res.json({
        account: {
          id: account.id,
          email: account.email,
          platformRole: account.platformRole,
          emailVerified: Boolean(account.emailVerifiedAt),
        },
      });
    } catch (error) {
      next(error);
    }
  });
  router.post("/forgot-password", async (req, res, next) => {
    try {
      const email = parseOrThrow(emailSchema, req.body?.email);
      const [account] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
      if (account)
        await emailLink(config, db, account, "password_reset").catch((error) =>
          req.log?.error({ err: error }, "reset email failed"),
        );
      res.json({ message: "If that account exists, a reset link has been sent." });
    } catch (error) {
      next(error);
    }
  });
  router.post("/reset-password", async (req, res, next) => {
    try {
      const token = String(req.body?.token || ""),
        password = parseOrThrow(passwordSchema, req.body?.password);
      if (token.length < 20)
        throw Object.assign(new Error("Invalid reset request"), {
          status: 400,
          code: "INVALID_RESET",
        });
      const [row] = await db
        .select()
        .from(accountTokens)
        .where(
          and(
            eq(accountTokens.tokenHash, sha256(token)),
            eq(accountTokens.kind, "password_reset"),
            isNull(accountTokens.usedAt),
            gt(accountTokens.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!row?.accountId)
        throw Object.assign(new Error("Reset link is invalid or expired"), {
          status: 400,
          code: "RESET_EXPIRED",
        });
      await db.transaction(async (tx) => {
        await tx
          .update(accounts)
          .set({
            passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
            emailVerifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(accounts.id, row.accountId));
        await tx
          .update(accountTokens)
          .set({ usedAt: new Date() })
          .where(eq(accountTokens.id, row.id));
        await tx.delete(accountSessions).where(eq(accountSessions.accountId, row.accountId));
      });
      const [account] = await db
        .select({ email: accounts.email })
        .from(accounts)
        .where(eq(accounts.id, row.accountId))
        .limit(1);
      if (account)
        await sendEmail(config, {
          to: account.email,
          subject: "Your The Unpirator password was changed",
          html: `<p>Your password was changed and all existing sessions were signed out.</p><p>If this was not you, contact support immediately.</p>`,
        }).catch((error) => req.log?.error({ err: error }, "password security email failed"));
      res.json({ message: "Password updated. Sign in again on all devices." });
    } catch (error) {
      next(error);
    }
  });
  router.post("/verify-email", async (req, res, next) => {
    try {
      const [row] = await db
        .select()
        .from(accountTokens)
        .where(
          and(
            eq(accountTokens.tokenHash, sha256(String(req.body?.token || ""))),
            eq(accountTokens.kind, "verify_email"),
          ),
        )
        .limit(1);
      if (row?.usedAt && row.accountId) {
        const [account] = await db
          .select({ verified: accounts.emailVerifiedAt })
          .from(accounts)
          .where(eq(accounts.id, row.accountId))
          .limit(1);
        if (account?.verified) return res.json({ message: "Email is already verified." });
      }
      if (!row?.accountId || row.usedAt || row.expiresAt <= new Date())
        throw Object.assign(new Error("Verification link is invalid or expired"), {
          status: 400,
          code: "VERIFICATION_EXPIRED",
        });
      await db.transaction(async (tx) => {
        await tx
          .update(accounts)
          .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
          .where(eq(accounts.id, row.accountId));
        await tx
          .update(accountTokens)
          .set({ usedAt: new Date() })
          .where(eq(accountTokens.id, row.id));
      });
      res.json({ message: "Email verified." });
    } catch (error) {
      next(error);
    }
  });
  router.post("/verification/resend", dashboardAuth, csrfGuard, async (req, res, next) => {
    try {
      const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, req.auth.accountId))
        .limit(1);
      if (account.emailVerifiedAt) return res.json({ message: "Email is already verified." });
      await emailLink(config, db, account, "verify_email");
      res.json({ message: "Verification email sent." });
    } catch (error) {
      next(error);
    }
  });
  router.get("/google", async (_req, res, next) => {
    try {
      if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REDIRECT_URI)
        throw Object.assign(new Error("Google sign-in is not configured"), {
          status: 503,
          code: "GOOGLE_DISABLED",
        });
      const state = randomToken(24),
        nonce = randomToken(24),
        verifier = randomToken(48);
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      await db.insert(accountTokens).values({
        kind: "google_state",
        tokenHash: sha256(state),
        metadata: { nonce, verifier },
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });
      res.redirect(
        `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID, redirect_uri: config.GOOGLE_REDIRECT_URI, response_type: "code", scope: "openid email profile", state, nonce, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" })}`,
      );
    } catch (error) {
      next(error);
    }
  });
  router.get("/google/link", dashboardAuth, async (req, res, next) => {
    try {
      if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REDIRECT_URI)
        throw Object.assign(new Error("Google sign-in is not configured"), {
          status: 503,
          code: "GOOGLE_DISABLED",
        });
      const state = randomToken(24),
        nonce = randomToken(24),
        verifier = randomToken(48),
        challenge = createHash("sha256").update(verifier).digest("base64url");
      await db.insert(accountTokens).values({
        accountId: req.auth.accountId,
        kind: "google_state",
        tokenHash: sha256(state),
        metadata: { nonce, verifier, linking: true },
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });
      res.redirect(
        `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID, redirect_uri: config.GOOGLE_REDIRECT_URI, response_type: "code", scope: "openid email profile", state, nonce, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" })}`,
      );
    } catch (error) {
      next(error);
    }
  });
  router.delete("/google/link", dashboardAuth, csrfGuard, async (req, res, next) => {
    try {
      const [account] = await db
        .select({ passwordHash: accounts.passwordHash })
        .from(accounts)
        .where(eq(accounts.id, req.auth.accountId))
        .limit(1);
      if (!account?.passwordHash)
        throw Object.assign(new Error("Set a password before unlinking Google"), {
          status: 409,
          code: "LOGIN_METHOD_REQUIRED",
        });
      await db
        .delete(oauthIdentities)
        .where(
          and(
            eq(oauthIdentities.accountId, req.auth.accountId),
            eq(oauthIdentities.provider, "google"),
          ),
        );
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  router.get("/google/callback", async (req, res, next) => {
    try {
      const [state] = await db
        .select()
        .from(accountTokens)
        .where(
          and(
            eq(accountTokens.tokenHash, sha256(String(req.query.state || ""))),
            eq(accountTokens.kind, "google_state"),
            isNull(accountTokens.usedAt),
            gt(accountTokens.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!state) throw forbidden("Invalid OAuth state");
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: String(req.query.code || ""),
          client_id: config.GOOGLE_CLIENT_ID,
          client_secret: config.GOOGLE_CLIENT_SECRET,
          redirect_uri: config.GOOGLE_REDIRECT_URI,
          grant_type: "authorization_code",
          code_verifier: state.metadata.verifier,
        }),
      });
      if (!tokenRes.ok) throw unauthorized("Google sign-in failed");
      const tokens = await tokenRes.json();
      const profileRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token || "")}`,
      );
      const profile = await profileRes.json();
      if (
        !profileRes.ok ||
        profile.aud !== config.GOOGLE_CLIENT_ID ||
        profile.nonce !== state.metadata.nonce ||
        !profile.sub ||
        profile.email_verified !== "true"
      )
        throw unauthorized("Google identity could not be verified");
      let [identity] = await db
          .select()
          .from(oauthIdentities)
          .where(
            and(
              eq(oauthIdentities.provider, "google"),
              eq(oauthIdentities.providerSubject, profile.sub),
            ),
          )
          .limit(1),
        account,
        isNew = false;
      if (identity)
        [account] = await db
          .select()
          .from(accounts)
          .where(eq(accounts.id, identity.accountId))
          .limit(1);
      else {
        const email = parseOrThrow(emailSchema, profile.email);
        if (state.accountId) {
          [account] = await db
            .select()
            .from(accounts)
            .where(eq(accounts.id, state.accountId))
            .limit(1);
          if (!account || account.email !== email)
            throw forbidden("Google email must match the signed-in account");
          await db.insert(oauthIdentities).values({
            accountId: account.id,
            provider: "google",
            providerSubject: profile.sub,
            email,
          });
          await db
            .update(accounts)
            .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
            .where(eq(accounts.id, account.id));
        } else {
          if ((await db.select().from(accounts).where(eq(accounts.email, email)).limit(1))[0])
            return res.redirect(`${config.DASHBOARD_URL}/login?error=link-required`);
          account = await db.transaction(async (tx) => {
            const [a] = await tx
              .insert(accounts)
              .values({ email, emailVerifiedAt: new Date() })
              .returning();
            await tx
              .insert(oauthIdentities)
              .values({ accountId: a.id, provider: "google", providerSubject: profile.sub, email });
            await provision(
              tx,
              a.id,
              profile.name ? `${profile.name}'s workspace` : "My workspace",
            );
            return a;
          });
        }
      }
      if (!account || account.status !== "active") throw unauthorized("Account is unavailable");
      if (!identity && !state.accountId) isNew = true;
      await db
        .update(accountTokens)
        .set({ usedAt: new Date() })
        .where(eq(accountTokens.id, state.id));
      if (privilegedRoles.has(account.platformRole) && account.mfaConfirmedAt) {
        const challenge = await makeToken(db, account.id, "mfa_login", 10 * 60_000);
        return res.redirect(
          `${config.DASHBOARD_URL}/login?mfa_challenge=${encodeURIComponent(challenge)}`,
        );
      }
      await issueSession(db, config, req, res, account);
      res.redirect(
        `${config.DASHBOARD_URL}${privilegedRoles.has(account.platformRole) ? "/dashboard/account?setup=mfa" : `/dashboard${isNew ? "/onboarding" : ""}`}`,
      );
    } catch (error) {
      next(error);
    }
  });
  router.post("/logout", dashboardAuth, csrfGuard, async (req, res, next) => {
    try {
      await db.delete(accountSessions).where(eq(accountSessions.id, req.auth.sessionId));
      const base = cookieBase(config);
      res.clearCookie(config.SESSION_COOKIE_NAME, base);
      res.clearCookie("ap_csrf", base);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  router.get("/me", dashboardAuth, async (req, res, next) => {
    try {
      const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, req.auth.accountId))
        .limit(1);
      const memberships = await db
        .select({
          tenantId: tenantMembers.tenantId,
          role: tenantMembers.role,
          tenantName: tenants.name,
        })
        .from(tenantMembers)
        .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
        .where(eq(tenantMembers.accountId, req.auth.accountId));
      const [google] = await db
        .select({ id: oauthIdentities.id })
        .from(oauthIdentities)
        .where(
          and(eq(oauthIdentities.accountId, account.id), eq(oauthIdentities.provider, "google")),
        )
        .limit(1);
      res.json({
        account: {
          id: account.id,
          email: account.email,
          platformRole: account.platformRole,
          emailVerified: Boolean(account.emailVerifiedAt),
          googleLinked: Boolean(google),
          canUnlinkGoogle: Boolean(google && account.passwordHash),
          mfaConfirmed: Boolean(account.mfaConfirmedAt),
          mfaVerified: Boolean(req.auth.mfaVerifiedAt),
        },
        memberships,
        activeTenantId: memberships.some((m) => m.tenantId === account.lastTenantId)
          ? account.lastTenantId
          : memberships[0]?.tenantId || null,
      });
    } catch (error) {
      next(error);
    }
  });
  router.post("/mfa/setup", dashboardAuth, csrfGuard, async (req, res, next) => {
    try {
      if (!privilegedRoles.has(req.auth.platformRole)) throw forbidden("Platform admin required");
      if (req.auth.mfaConfirmedAt)
        throw Object.assign(new Error("MFA reset requires another super admin"), {
          status: 409,
          code: "MFA_ADMIN_RESET_REQUIRED",
        });
      const secret = generateTotpSecret();
      await db
        .update(accounts)
        .set({
          mfaSecretEncrypted: encryptJson({ secret }, config.APP_ENCRYPTION_KEY_BASE64),
          mfaConfirmedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, req.auth.accountId));
      const issuer = "The Unpirator";
      res.json({
        secret,
        otpauthUri: `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(req.auth.email)}?${new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" })}`,
      });
    } catch (error) {
      next(error);
    }
  });
  router.post("/mfa/confirm", dashboardAuth, csrfGuard, async (req, res, next) => {
    try {
      const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, req.auth.accountId))
        .limit(1);
      if (!account?.mfaSecretEncrypted)
        throw Object.assign(new Error("Start MFA setup first"), {
          status: 409,
          code: "MFA_SETUP_REQUIRED",
        });
      const { secret } = decryptJson(account.mfaSecretEncrypted, config.APP_ENCRYPTION_KEY_BASE64);
      if (!verifyTotp(secret, req.body?.code)) throw unauthorized("Invalid authenticator code");
      const now = new Date();
      const recoveryCodes = Array.from({ length: 10 }, () => randomToken(9).toUpperCase());
      const receipt = randomToken(32);
      await db.transaction(async (tx) => {
        await tx
          .update(accounts)
          .set({
            mfaConfirmedAt: now,
            emailVerifiedAt: account.emailVerifiedAt || now,
            updatedAt: now,
          })
          .where(eq(accounts.id, account.id));
        await tx
          .insert(accountMfaMethods)
          .values({
            accountId: account.id,
            type: "totp",
            encryptedSecret: account.mfaSecretEncrypted,
            verifiedAt: now,
            enabled: true,
            lastUsedAt: now,
          })
          .onConflictDoUpdate({
            target: [accountMfaMethods.accountId, accountMfaMethods.type],
            set: {
              encryptedSecret: account.mfaSecretEncrypted,
              verifiedAt: now,
              enabled: true,
              lastUsedAt: now,
            },
          });
        await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.accountId, account.id));
        await tx
          .insert(mfaRecoveryCodes)
          .values(recoveryCodes.map((code) => ({ accountId: account.id, codeHash: sha256(code) })));
        await tx.insert(accountTokens).values({
          accountId: account.id,
          kind: "mfa_recovery_ack",
          tokenHash: sha256(receipt),
          expiresAt: new Date(Date.now() + 15 * 60_000),
        });
      });
      await writeAudit(db, {
        actorAccountId: account.id,
        action: "ADMIN_MFA_ENABLED",
        targetType: "account",
        targetId: account.id,
        ip: req.ip,
      });
      await sendEmail(config, {
        to: account.email,
        subject: "MFA enabled on your The Unpirator account",
        html: "<p>An authenticator was enabled for your platform account.</p>",
      }).catch((error) => req.log?.error({ err: error }, "MFA notification failed"));
      res.json({ confirmed: true, recoveryCodes, receipt });
    } catch (error) {
      next(error);
    }
  });
  router.post("/mfa/recovery/ack", dashboardAuth, csrfGuard, async (req, res, next) => {
    try {
      const [receipt] = await db
        .select()
        .from(accountTokens)
        .where(
          and(
            eq(accountTokens.accountId, req.auth.accountId),
            eq(accountTokens.kind, "mfa_recovery_ack"),
            eq(accountTokens.tokenHash, sha256(String(req.body?.receipt || ""))),
            isNull(accountTokens.usedAt),
            gt(accountTokens.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!receipt || req.body?.acknowledged !== true)
        throw forbidden("Acknowledge that recovery codes were saved");
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx.update(accountTokens).set({ usedAt: now }).where(eq(accountTokens.id, receipt.id));
        await tx
          .update(accountSessions)
          .set({ mfaVerifiedAt: now })
          .where(eq(accountSessions.id, req.auth.sessionId));
      });
      const permanentAdmins = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.platformRole, "super_admin"),
            eq(accounts.status, "active"),
            isNotNull(accounts.mfaConfirmedAt),
          ),
        );
      if (permanentAdmins.length >= 2)
        await db
          .insert(platformBootstrapState)
          .values({
            id: "platform",
            completedAt: now,
            completedBy: req.auth.accountId,
            bootstrapVersion: 1,
          })
          .onConflictDoUpdate({
            target: platformBootstrapState.id,
            set: { completedAt: now, completedBy: req.auth.accountId, bootstrapVersion: 1 },
          });
      res.json({ acknowledged: true });
    } catch (error) {
      next(error);
    }
  });
  router.post("/mfa/reauth", dashboardAuth, csrfGuard, async (req, res, next) => {
    try {
      const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, req.auth.accountId))
        .limit(1);
      if (!account?.mfaConfirmedAt || !account.mfaSecretEncrypted)
        throw forbidden("MFA setup required");
      const { secret } = decryptJson(account.mfaSecretEncrypted, config.APP_ENCRYPTION_KEY_BASE64);
      if (!verifyTotp(secret, req.body?.code)) throw unauthorized("Invalid authenticator code");
      const now = new Date();
      await db
        .update(accountSessions)
        .set({ mfaVerifiedAt: now })
        .where(eq(accountSessions.id, req.auth.sessionId));
      await writeAudit(db, {
        actorAccountId: account.id,
        action: "ADMIN_MFA_REAUTHENTICATED",
        targetType: "account",
        targetId: account.id,
        ip: req.ip,
      });
      res.json({ verifiedAt: now });
    } catch (error) {
      next(error);
    }
  });
  router.put("/workspace", dashboardAuth, csrfGuard, async (req, res, next) => {
    try {
      const tenantId = String(req.body?.tenantId || "");
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
      if (!member && req.auth.platformRole !== "super_admin")
        throw forbidden("Workspace membership required");
      await db
        .update(accounts)
        .set({ lastTenantId: tenantId, updatedAt: new Date() })
        .where(eq(accounts.id, req.auth.accountId));
      res.json({ activeTenantId: tenantId });
    } catch (error) {
      next(error);
    }
  });
  router.get("/sessions", dashboardAuth, async (req, res, next) => {
    try {
      res.json({
        items: await db
          .select({
            id: accountSessions.id,
            ip: accountSessions.ip,
            userAgent: accountSessions.userAgent,
            createdAt: accountSessions.createdAt,
            expiresAt: accountSessions.expiresAt,
          })
          .from(accountSessions)
          .where(eq(accountSessions.accountId, req.auth.accountId))
          .orderBy(desc(accountSessions.createdAt)),
      });
    } catch (error) {
      next(error);
    }
  });
  router.delete("/sessions/:id", dashboardAuth, csrfGuard, async (req, res, next) => {
    try {
      await db
        .delete(accountSessions)
        .where(
          and(
            eq(accountSessions.id, req.params.id),
            eq(accountSessions.accountId, req.auth.accountId),
          ),
        );
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  router.get("/csrf", dashboardAuth, (req, res) => res.json({ csrfToken: req.auth.csrfToken }));
  return router;
}
