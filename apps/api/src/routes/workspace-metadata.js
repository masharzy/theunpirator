import { Router } from "express";
import { eq } from "drizzle-orm";
import { tenants } from "@unpirator/db/schema";
import { tenantSettings } from "@unpirator/db/commerce-schema";
import { notFound } from "../errors.js";
import { cachedTenantJson } from "../services/metadata-cache.js";

export function workspaceMetadataRouter({ db, cache, requireTenantViewer }) {
  const router = Router();

  router.get("/", requireTenantViewer, async (req, res, next) => {
    try {
      const payload = await cachedTenantJson({
        cache,
        tenantId: req.tenantId,
        namespace: "workspace-settings",
        key: "settings",
        ttlSeconds: 60,
        load: async () => {
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

          return {
            tenant,
            settings: settings || {
              tenantId: req.tenantId,
              timezone: "Asia/Dhaka",
              notificationPreferences: {},
            },
          };
        },
      });

      res.set("cache-control", "private, no-cache").json(payload);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
