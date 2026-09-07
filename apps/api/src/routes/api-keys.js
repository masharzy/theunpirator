import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { apiKeys } from "@unpirator/db/schema";
import { randomToken, sha256 } from "@unpirator/crypto";
import { writeAudit } from "../services/audit.js";
import { notFound } from "../errors.js";

export function apiKeysRouter({ db, requireTenantOwner }) {
  const router = Router();
  router.use(requireTenantOwner);
  router.get("/", async (req, res, next) => {
    try {
      res.json({
        items: await db
          .select({
            id: apiKeys.id,
            name: apiKeys.name,
            keyPrefix: apiKeys.keyPrefix,
            scopes: apiKeys.scopes,
            lastUsedAt: apiKeys.lastUsedAt,
            expiresAt: apiKeys.expiresAt,
            revokedAt: apiKeys.revokedAt,
            createdAt: apiKeys.createdAt,
          })
          .from(apiKeys)
          .where(eq(apiKeys.tenantId, req.tenantId)),
      });
    } catch (e) {
      next(e);
    }
  });
  router.post("/", async (req, res, next) => {
    try {
      const name = String(req.body?.name || "Default key").slice(0, 120);
      const scopes = Array.isArray(req.body?.scopes)
        ? req.body.scopes.filter((v) => typeof v === "string").slice(0, 30)
        : ["playback:create"];
      const prefix = randomToken(8).replaceAll("-", "a").replaceAll("_", "b");
      const secret = randomToken(32);
      const [key] = await db
        .insert(apiKeys)
        .values({
          tenantId: req.tenantId,
          name,
          keyPrefix: prefix,
          secretHash: sha256(secret),
          scopes,
        })
        .returning({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          scopes: apiKeys.scopes,
          createdAt: apiKeys.createdAt,
        });
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "API_KEY_CREATED",
        targetType: "api_key",
        targetId: key.id,
        ip: req.ip,
      });
      res
        .status(201)
        .json({ key, secret: `apk_${prefix}.${secret}`, warning: "This secret is shown once." });
    } catch (e) {
      next(e);
    }
  });
  router.post("/:keyId/revoke", async (req, res, next) => {
    try {
      const [key] = await db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiKeys.id, req.params.keyId), eq(apiKeys.tenantId, req.tenantId)))
        .returning({ id: apiKeys.id });
      if (!key) throw notFound();
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "API_KEY_REVOKED",
        targetType: "api_key",
        targetId: key.id,
        ip: req.ip,
      });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });
  return router;
}
