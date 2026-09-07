import { Router } from "express";
import { resolveTxt } from "node:dns/promises";
import { and, eq } from "drizzle-orm";
import { siteCreateSchema, parseOrThrow } from "@unpirator/contracts";
import { randomToken } from "@unpirator/crypto";
import { siteDomains, sites } from "@unpirator/db/schema";
import { writeAudit } from "../services/audit.js";
import { notFound } from "../errors.js";
import { getEntitlements } from "../services/entitlements.js";

export function sitesRouter({ db, requireTenantAdmin }) {
  const router = Router();
  router.use(requireTenantAdmin);
  router.get("/", async (req, res, next) => {
    try {
      res.json({ items: await db.select().from(sites).where(eq(sites.tenantId, req.tenantId)) });
    } catch (e) {
      next(e);
    }
  });
  router.post("/", async (req, res, next) => {
    try {
      const input = parseOrThrow(siteCreateSchema, req.body);
      const entitlements = await getEntitlements(db, req.tenantId);
      const existingSites = await db
        .select({ id: sites.id })
        .from(sites)
        .where(eq(sites.tenantId, req.tenantId));
      if (existingSites.length >= Number(entitlements.max_sites ?? 1)) {
        const error = new Error("Plan site limit reached");
        error.code = "PLAN_LIMIT";
        error.status = 403;
        throw error;
      }
      const [site] = await db
        .insert(sites)
        .values({ tenantId: req.tenantId, name: input.name, domain: input.domain })
        .returning();
      const domains = [...new Set([input.domain, ...input.allowedDomains])];
      await db.insert(siteDomains).values(
        domains.map((domain) => ({
          siteId: site.id,
          domain,
          verificationToken: randomToken(24),
        })),
      );
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "SITE_CREATED",
        targetType: "site",
        targetId: site.id,
        ip: req.ip,
      });
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
          dns: {
            name: `_unpirator.${d.domain}`,
            type: "TXT",
            value: `unpirator-verification=${d.verificationToken}`,
          },
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
      let records = [];
      try {
        records = await resolveTxt(`_unpirator.${row.domain}`);
      } catch {}
      const expected = `unpirator-verification=${row.token}`;
      const verified = records.some((parts) => parts.join("") === expected);
      if (!verified) {
        const error = new Error("DNS verification record not found");
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
        metadata: { domain: domain.domain },
        ip: req.ip,
      });
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
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });
  return router;
}
