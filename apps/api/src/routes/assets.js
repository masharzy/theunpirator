import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { assetCreateSchema, parseOrThrow } from "@unpirator/contracts";
import { encryptJson } from "@unpirator/crypto";
import { assets, providerHealth, sites } from "@unpirator/db/schema";
import { restrictedFeatureEnabled } from "../services/entitlements.js";
import { forbidden, notFound } from "../errors.js";
import { writeAudit } from "../services/audit.js";

export function assetsRouter({ db, config, requireTenantDeveloper }) {
  const router = Router();
  router.use(requireTenantDeveloper);
  router.get("/", async (req, res, next) => {
    try {
      res.json({
        items: await db
          .select({
            id: assets.id,
            siteId: assets.siteId,
            title: assets.title,
            provider: assets.provider,
            securityPolicy: assets.securityPolicy,
            status: assets.status,
            createdAt: assets.createdAt,
          })
          .from(assets)
          .where(eq(assets.tenantId, req.tenantId)),
      });
    } catch (e) {
      next(e);
    }
  });
  router.get("/providers", async (req, res, next) => {
    try {
      const standard = ["direct", "hls", "s3", "r2", "bunny"];
      const customEnabled =
        config.YOUTUBE_CUSTOM_GLOBAL &&
        (await restrictedFeatureEnabled(db, "youtube_custom", req.tenantId));
      const [health] = await db
        .select()
        .from(providerHealth)
        .where(eq(providerHealth.provider, "youtube_custom"))
        .limit(1);
      res.json({
        items:
          customEnabled && health?.status !== "disabled"
            ? [...standard, "youtube_custom"]
            : standard,
      });
    } catch (e) {
      next(e);
    }
  });
  router.post("/", async (req, res, next) => {
    try {
      const input = parseOrThrow(assetCreateSchema, req.body);
      const [site] = await db
        .select()
        .from(sites)
        .where(and(eq(sites.id, input.siteId), eq(sites.tenantId, req.tenantId)))
        .limit(1);
      if (!site) throw notFound("Site not found");
      if (input.provider === "youtube_custom") {
        const allowed =
          config.YOUTUBE_CUSTOM_GLOBAL &&
          (await restrictedFeatureEnabled(db, "youtube_custom", req.tenantId));
        if (!allowed) throw forbidden("Restricted provider is not enabled for this tenant");
      }
      const encryptedProviderConfig = Object.keys(input.providerConfig).length
        ? encryptJson(input.providerConfig, config.APP_ENCRYPTION_KEY_BASE64)
        : null;
      const [asset] = await db
        .insert(assets)
        .values({
          tenantId: req.tenantId,
          siteId: input.siteId,
          title: input.title,
          provider: input.provider,
          providerReference: input.providerReference,
          allowedHosts: input.allowedHosts,
          encryptedProviderConfig,
          securityPolicy: input.securityPolicy,
        })
        .returning({
          id: assets.id,
          title: assets.title,
          provider: assets.provider,
          status: assets.status,
        });
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "ASSET_CREATED",
        targetType: "asset",
        targetId: asset.id,
        metadata: { provider: asset.provider },
        ip: req.ip,
      });
      res.status(201).json({ asset });
    } catch (e) {
      next(e);
    }
  });
  router.delete("/:assetId", async (req, res, next) => {
    try {
      const [deleted] = await db
        .delete(assets)
        .where(and(eq(assets.id, req.params.assetId), eq(assets.tenantId, req.tenantId)))
        .returning({ id: assets.id });
      if (!deleted) throw notFound();
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "ASSET_DELETED",
        targetType: "asset",
        targetId: req.params.assetId,
        ip: req.ip,
      });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });
  return router;
}
