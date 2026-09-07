import { and, eq, isNull, or, gt } from "drizzle-orm";
import { apiKeys, tenants } from "@unpirator/db/schema";
import { sha256, safeEqual } from "@unpirator/crypto";
import { unauthorized } from "../errors.js";

export function apiKeyAuth(db, requiredScope = null) {
  return async (req, _res, next) => {
    try {
      const bearer = req.get("authorization") || "";
      const raw = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
      const match = /^apk_([a-zA-Z0-9_-]{8,32})\.([a-zA-Z0-9_-]{20,})$/.exec(raw);
      if (!match) throw unauthorized("Invalid API key");
      const [, prefix, secret] = match;
      const [row] = await db
        .select({ key: apiKeys, tenantStatus: tenants.status })
        .from(apiKeys)
        .innerJoin(tenants, eq(apiKeys.tenantId, tenants.id))
        .where(
          and(
            eq(apiKeys.keyPrefix, prefix),
            isNull(apiKeys.revokedAt),
            or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date())),
          ),
        )
        .limit(1);
      if (!row || row.tenantStatus !== "active" || !safeEqual(row.key.secretHash, sha256(secret)))
        throw unauthorized("Invalid API key");
      if (requiredScope && !row.key.scopes.includes(requiredScope) && !row.key.scopes.includes("*"))
        throw unauthorized("API key scope missing");
      req.apiAuth = { keyId: row.key.id, tenantId: row.key.tenantId, scopes: row.key.scopes };
      db.update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, row.key.id))
        .catch(() => {});
      next();
    } catch (error) {
      next(error);
    }
  };
}
