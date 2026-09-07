import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { assetCreateSchema, parseOrThrow } from "@unpirator/contracts";
import { encryptJson } from "@unpirator/crypto";
import { assets, providerHealth, sites } from "@unpirator/db/schema";
import { assetConnectionRefs, providerConnections } from "@unpirator/db/commerce-schema";
import { restrictedFeatureEnabled } from "../services/entitlements.js";
import { AppError, forbidden, notFound } from "../errors.js";
import { writeAudit } from "../services/audit.js";

export function assetsRouter({ db, config, requireTenantDeveloper }) {
  const router = Router();
  router.use(requireTenantDeveloper);

  router.get("/", async (req, res, next) => {
    try {
      const rows = await db
        .select({
          id: assets.id,
          siteId: assets.siteId,
          title: assets.title,
          provider: assets.provider,
          providerReference: assets.providerReference,
          allowedHosts: assets.allowedHosts,
          securityPolicy: assets.securityPolicy,
          status: assets.status,
          createdAt: assets.createdAt,
          updatedAt: assets.updatedAt,
        })
        .from(assets)
        .where(eq(assets.tenantId, req.tenantId))
        .orderBy(desc(assets.createdAt));

      let refs = [];
      if (rows.length) {
        refs = await db
          .select()
          .from(assetConnectionRefs)
          .where(
            inArray(
              assetConnectionRefs.id,
              rows.map((row) => row.id),
            ),
          );
      }
      const refMap = new Map(refs.map((row) => [row.id, row.connectionId]));
      res.json({
        items: rows.map((row) => ({
          ...row,
          connectionId: refMap.get(row.id) || null,
        })),
      });
    } catch (error) {
      next(error);
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
    } catch (error) {
      next(error);
    }
  });

  router.get("/:assetId", async (req, res, next) => {
    try {
      const [asset] = await db
        .select({
          id: assets.id,
          siteId: assets.siteId,
          title: assets.title,
          provider: assets.provider,
          providerReference: assets.providerReference,
          allowedHosts: assets.allowedHosts,
          securityPolicy: assets.securityPolicy,
          status: assets.status,
          createdAt: assets.createdAt,
          updatedAt: assets.updatedAt,
        })
        .from(assets)
        .where(and(eq(assets.id, req.params.assetId), eq(assets.tenantId, req.tenantId)))
        .limit(1);
      if (!asset) throw notFound();

      const [ref] = await db
        .select({ connectionId: assetConnectionRefs.connectionId })
        .from(assetConnectionRefs)
        .where(eq(assetConnectionRefs.id, asset.id))
        .limit(1);

      let connection = null;
      if (ref?.connectionId) {
        [connection] = await db
          .select({
            id: providerConnections.id,
            name: providerConnections.name,
            provider: providerConnections.provider,
            status: providerConnections.status,
          })
          .from(providerConnections)
          .where(
            and(
              eq(providerConnections.id, ref.connectionId),
              eq(providerConnections.tenantId, req.tenantId),
            ),
          )
          .limit(1);
      }

      res.json({ asset: { ...asset, connectionId: ref?.connectionId || null }, connection });
    } catch (error) {
      next(error);
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

      let connection = null;
      if (input.connectionId) {
        [connection] = await db
          .select()
          .from(providerConnections)
          .where(
            and(
              eq(providerConnections.id, input.connectionId),
              eq(providerConnections.tenantId, req.tenantId),
            ),
          )
          .limit(1);
        if (!connection) throw notFound("Provider connection not found");
        if (connection.status === "disabled")
          throw new AppError("CONNECTION_DISABLED", "Provider connection is disabled", 409);
        if (connection.provider !== input.provider)
          throw new AppError(
            "CONNECTION_PROVIDER_MISMATCH",
            "Asset provider must match the saved connection provider",
            409,
          );
      }

      const encryptedProviderConfig = input.connectionId
        ? connection.encryptedConfig
        : Object.keys(input.providerConfig).length
          ? encryptJson(input.providerConfig, config.APP_ENCRYPTION_KEY_BASE64)
          : null;

      const asset = await db.transaction(async (tx) => {
        const [created] = await tx
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

        if (input.connectionId) {
          await tx
            .update(assetConnectionRefs)
            .set({ connectionId: input.connectionId })
            .where(eq(assetConnectionRefs.id, created.id));
        }

        await writeAudit(tx, {
          tenantId: req.tenantId,
          actorAccountId: req.auth.accountId,
          action: "ASSET_CREATED",
          targetType: "asset",
          targetId: created.id,
          metadata: {
            provider: created.provider,
            connectionId: input.connectionId || null,
          },
          ip: req.ip,
        });
        return created;
      });
      res.status(201).json({ asset });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:assetId", async (req, res, next) => {
    try {
      const input = z
        .object({
          title: z.string().trim().min(1).max(240).optional(),
          status: z.enum(["active", "disabled"]).optional(),
          securityPolicy: z.enum(["standard", "strict", "maximum"]).optional(),
          connectionId: z.string().min(3).max(128).nullable().optional(),
        })
        .strict()
        .parse(req.body);

      const [current] = await db
        .select()
        .from(assets)
        .where(and(eq(assets.id, req.params.assetId), eq(assets.tenantId, req.tenantId)))
        .limit(1);
      if (!current) throw notFound();

      let selectedConnection = null;
      if (input.connectionId) {
        const [connection] = await db
          .select()
          .from(providerConnections)
          .where(
            and(
              eq(providerConnections.id, input.connectionId),
              eq(providerConnections.tenantId, req.tenantId),
            ),
          )
          .limit(1);
        if (!connection) throw notFound("Provider connection not found");
        if (connection.provider !== current.provider)
          throw new AppError(
            "CONNECTION_PROVIDER_MISMATCH",
            "Saved connection provider does not match this asset",
            409,
          );
        selectedConnection = connection;
      }

      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(assets)
          .set({
            ...(input.title ? { title: input.title } : {}),
            ...(input.status ? { status: input.status } : {}),
            ...(input.securityPolicy ? { securityPolicy: input.securityPolicy } : {}),
            ...(Object.prototype.hasOwnProperty.call(input, "connectionId")
              ? { encryptedProviderConfig: selectedConnection?.encryptedConfig || null }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(assets.id, current.id))
          .returning({
            id: assets.id,
            title: assets.title,
            provider: assets.provider,
            securityPolicy: assets.securityPolicy,
            status: assets.status,
            updatedAt: assets.updatedAt,
          });

        if (Object.prototype.hasOwnProperty.call(input, "connectionId")) {
          await tx
            .update(assetConnectionRefs)
            .set({ connectionId: input.connectionId || null })
            .where(eq(assetConnectionRefs.id, current.id));
        }

        await writeAudit(tx, {
          tenantId: req.tenantId,
          actorAccountId: req.auth.accountId,
          action: "ASSET_UPDATED",
          targetType: "asset",
          targetId: current.id,
          metadata: { changed: Object.keys(input) },
          ip: req.ip,
        });
        return row;
      });

      res.json({ asset: updated });
    } catch (error) {
      next(error);
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
    } catch (error) {
      next(error);
    }
  });

  return router;
}
