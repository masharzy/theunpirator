import { Router } from "express";
import { resolveTxt } from "node:dns/promises";
import { and, eq, inArray, sql } from "drizzle-orm";
import { siteCreateSchema, parseOrThrow } from "@unpirator/contracts";
import { randomToken } from "@unpirator/crypto";
import { siteDomains, sites } from "@unpirator/db/schema";
import { writeAudit } from "../services/audit.js";
import { AppError, notFound } from "../errors.js";
import { getEntitlements } from "../services/entitlements.js";
import { normalizeQuotaLimit } from "../services/quotas.js";
import { cachedTenantJson, invalidateTenantCache } from "../services/metadata-cache.js";
import {
  domainChallenges,
  verifyFileChallenge,
  verifyMetaChallenge,
} from "../services/domain-verification.js";

export function sitesRouter({ db, cache, requireTenantAdmin }) {
  const router = Router();
  router.use(requireTenantAdmin);
  router.get("/", async (req, res, next) => {
    try {
      const payload = await cachedTenantJson({
        cache,
        tenantId: req.tenantId,
        namespace: "sites",
        key: "list",
        ttlSeconds: 60,
        load: async () => {
          const siteRows = await db.select().from(sites).where(eq(sites.tenantId, req.tenantId));
          const domainRows = siteRows.length
            ? await db
                .select({
                  siteId: siteDomains.siteId,
                  domain: siteDomains.domain,
                  verifiedAt: siteDomains.verifiedAt,
                })
                .from(siteDomains)
                .where(
                  inArray(
                    siteDomains.siteId,
                    siteRows.map((site) => site.id),
                  ),
                )
            : [];
          const verificationBySite = new Map(
            domainRows.map((domain) => [`${domain.siteId}:${domain.domain}`, domain.verifiedAt]),
          );
          return {
            items: siteRows.map((site) => ({
              ...site,
              domainVerifiedAt: verificationBySite.get(`${site.id}:${site.domain}`) || null,
            })),
          };
        },
      });
      res.set("cache-control", "private, no-cache").json(payload);
    } catch (e) {
      next(e);
    }
  });
  router.post("/", async (req, res, next) => {
    try {
      const input = parseOrThrow(siteCreateSchema, req.body);
      const site = await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${req.tenantId}:sites`}, 21))`,
        );
        const entitlements = await getEntitlements(tx, req.tenantId);
        const limit = normalizeQuotaLimit(entitlements.max_sites);
        const existingSites = await tx
          .select({ id: sites.id })
          .from(sites)
          .where(eq(sites.tenantId, req.tenantId));
        if (limit !== null && existingSites.length >= limit)
          throw new AppError("PLAN_LIMIT", "Plan site limit reached", 403);
        const [created] = await tx
          .insert(sites)
          .values({ tenantId: req.tenantId, name: input.name, domain: input.domain })
          .returning();
        const domains = [...new Set([input.domain, ...input.allowedDomains])];
        await tx.insert(siteDomains).values(
          domains.map((domain) => ({
            siteId: created.id,
            domain,
            verificationToken: randomToken(24),
          })),
        );
        await writeAudit(tx, {
          tenantId: req.tenantId,
          actorAccountId: req.auth.accountId,
          action: "SITE_CREATED",
          targetType: "site",
          targetId: created.id,
          ip: req.ip,
        });
        return created;
      });
      await Promise.all([
        invalidateTenantCache(cache, req.tenantId, "sites"),
        invalidateTenantCache(cache, req.tenantId, "usage-summary"),
      ]);
      res.status(201).json({ site });
    } catch (e) {
      next(e);
    }
  });

  router.get("/:siteId/domains", async (req, res, next) => {
    try {
      const [site] = await db
        .select()
        .from(sites)
        .where(and(eq(sites.id, req.params.siteId), eq(sites.tenantId, req.tenantId)))
        .limit(1);
      if (!site) throw notFound();
      const items = await db.select().from(siteDomains).where(eq(siteDomains.siteId, site.id));
      res.json({
        items: items.map((d) => ({
          id: d.id,
          domain: d.domain,
          verifiedAt: d.verifiedAt,
          ...domainChallenges(d.domain, d.verificationToken),
        })),
      });
    } catch (e) {
      next(e);
    }
  });
  router.post("/:siteId/domains/:domainId/verify", async (req, res, next) => {
    try {
      const [row] = await db
        .select({
          domain: siteDomains.domain,
          token: siteDomains.verificationToken,
          siteId: siteDomains.siteId,
        })
        .from(siteDomains)
        .innerJoin(sites, eq(siteDomains.siteId, sites.id))
        .where(
          and(
            eq(siteDomains.id, req.params.domainId),
            eq(siteDomains.siteId, req.params.siteId),
            eq(sites.tenantId, req.tenantId),
          ),
        )
        .limit(1);
      if (!row) throw notFound();
      const method = req.body?.method || "dns";
      if (!["dns", "meta", "file"].includes(method)) {
        const error = new Error("Choose DNS, meta tag, or verification file");
        error.code = "VALIDATION_ERROR";
        error.status = 400;
        throw error;
      }
      let verified = false;
      if (method === "dns") {
        try {
          const records = await resolveTxt(`_unpirator.${row.domain}`);
          const expected = `unpirator-verification=${row.token}`;
          verified = records.some((parts) => parts.join("") === expected);
        } catch (error) {
          if (!["ENODATA", "ENOTFOUND"].includes(error?.code)) throw error;
        }
      } else if (method === "meta") {
        verified = await verifyMetaChallenge(row.domain, row.token);
      } else {
        verified = await verifyFileChallenge(row.domain, row.token);
      }
      if (!verified) {
        const labels = {
          dns: "DNS record",
          meta: "verification meta tag",
          file: "verification file",
        };
        const error = new Error(`${labels[method]} not found`);
        error.code = "DOMAIN_NOT_VERIFIED";
        error.status = 409;
        throw error;
      }
      const [domain] = await db
        .update(siteDomains)
        .set({ verifiedAt: new Date() })
        .where(eq(siteDomains.id, req.params.domainId))
        .returning();
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "DOMAIN_VERIFIED",
        targetType: "site_domain",
        targetId: domain.id,
        metadata: { domain: domain.domain, method },
        ip: req.ip,
      });
      await invalidateTenantCache(cache, req.tenantId, "sites");
      res.json({ domain: { id: domain.id, domain: domain.domain, verifiedAt: domain.verifiedAt } });
    } catch (e) {
      next(e);
    }
  });
  router.delete("/:siteId", async (req, res, next) => {
    try {
      const [deleted] = await db
        .delete(sites)
        .where(and(eq(sites.id, req.params.siteId), eq(sites.tenantId, req.tenantId)))
        .returning({ id: sites.id });
      if (!deleted) throw notFound();
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "SITE_DELETED",
        targetType: "site",
        targetId: req.params.siteId,
        ip: req.ip,
      });
      await Promise.all([
        invalidateTenantCache(cache, req.tenantId, "sites"),
        invalidateTenantCache(cache, req.tenantId, "usage-summary"),
      ]);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });
  return router;
}
