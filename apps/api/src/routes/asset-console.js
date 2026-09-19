import { Router } from "express";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { assets } from "@unpirator/db/schema";
import { assetConnectionRefs } from "@unpirator/db/commerce-schema";
import { hasListQuery, paginationMeta, parseListQuery } from "../services/list-query.js";
import { cachedTenantJson, stableQueryKey } from "../services/metadata-cache.js";

export function assetConsoleRouter({ db, cache, requireTenantDeveloper }) {
  const router = Router();

  router.get("/", requireTenantDeveloper, async (req, res, next) => {
    if (!hasListQuery(req.query)) return next();

    try {
      const payload = await cachedTenantJson({
        cache,
        tenantId: req.tenantId,
        namespace: "assets",
        key: `list:${stableQueryKey(req.query)}`,
        ttlSeconds: 30,
        load: async () => {
          const query = parseListQuery(req.query, { defaultLimit: 24, maxLimit: 96 });
          const filters = [eq(assets.tenantId, req.tenantId)];
          const status = String(req.query.status || "all")
            .trim()
            .toLowerCase();
          if (status !== "all") filters.push(eq(assets.status, status));
          if (query.from) filters.push(gte(assets.createdAt, query.from));
          if (query.to) filters.push(lte(assets.createdAt, query.to));

          if (query.search) {
            const pattern = `%${query.search}%`;
            filters.push(
              or(
                ilike(assets.title, pattern),
                ilike(assets.provider, pattern),
                ilike(assets.status, pattern),
                ilike(assets.providerReference, pattern),
                sql`${assets.id}::text ILIKE ${pattern}`,
                sql`COALESCE(${assets.externalContentId}, '') ILIKE ${pattern}`,
              ),
            );
          }

          const where = and(...filters);
          const [{ value: totalValue }] = await db
            .select({ value: count() })
            .from(assets)
            .where(where);
          const total = Number(totalValue || 0);
          const pagination = paginationMeta({ page: query.page, limit: query.limit, total });

          const rows = await db
            .select({
              id: assets.id,
              siteId: assets.siteId,
              externalContentId: assets.externalContentId,
              title: assets.title,
              provider: assets.provider,
              providerReference: assets.providerReference,
              allowedHosts: assets.allowedHosts,
              status: assets.status,
              createdAt: assets.createdAt,
              updatedAt: assets.updatedAt,
            })
            .from(assets)
            .where(where)
            .orderBy(query.sort === "oldest" ? asc(assets.createdAt) : desc(assets.createdAt))
            .limit(query.limit)
            .offset((pagination.page - 1) * query.limit);

          const refs = rows.length
            ? await db
                .select({ id: assetConnectionRefs.id, connectionId: assetConnectionRefs.connectionId })
                .from(assetConnectionRefs)
                .where(
                  inArray(
                    assetConnectionRefs.id,
                    rows.map((row) => row.id),
                  ),
                )
            : [];
          const refMap = new Map(refs.map((row) => [row.id, row.connectionId]));

          return {
            items: rows.map((row) => ({
              ...row,
              connectionId: refMap.get(row.id) || null,
            })),
            pagination,
          };
        },
      });

      res.set("cache-control", "no-store").json(payload);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
