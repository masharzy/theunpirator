import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { webhookCreateSchema, parseOrThrow } from "@unpirator/contracts";
import { encryptJson, randomToken } from "@unpirator/crypto";
import { webhookEndpoints } from "@unpirator/db/schema";
import { hashWebhookSecret } from "../services/webhooks.js";
import { writeAudit } from "../services/audit.js";
import { notFound } from "../errors.js";

export function webhooksRouter({ db, config, dashboardAuth, csrfGuard, requireTenantDeveloper }) {
  const router = Router();
  router.use(dashboardAuth, csrfGuard, requireTenantDeveloper);
  router.get("/", async (req, res, next) => {
    try {
      res.json({
        items: await db
          .select({
            id: webhookEndpoints.id,
            url: webhookEndpoints.url,
            events: webhookEndpoints.events,
            status: webhookEndpoints.status,
            createdAt: webhookEndpoints.createdAt,
          })
          .from(webhookEndpoints)
          .where(eq(webhookEndpoints.tenantId, req.tenantId)),
      });
    } catch (e) {
      next(e);
    }
  });
  router.post("/", async (req, res, next) => {
    try {
      const input = parseOrThrow(webhookCreateSchema, req.body);
      const secret = `whsec_${randomToken(32)}`;
      const [endpoint] = await db
        .insert(webhookEndpoints)
        .values({
          tenantId: req.tenantId,
          url: input.url,
          events: input.events,
          secretHash: hashWebhookSecret(secret),
          encryptedSecret: encryptJson({ secret }, config.APP_ENCRYPTION_KEY_BASE64),
        })
        .returning({
          id: webhookEndpoints.id,
          url: webhookEndpoints.url,
          events: webhookEndpoints.events,
          status: webhookEndpoints.status,
          createdAt: webhookEndpoints.createdAt,
        });
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "WEBHOOK_CREATED",
        targetType: "webhook",
        targetId: endpoint.id,
        ip: req.ip,
      });
      res.status(201).json({ endpoint, secret, warning: "Webhook secret is shown once." });
    } catch (e) {
      next(e);
    }
  });
  router.delete("/:id", async (req, res, next) => {
    try {
      const [row] = await db
        .delete(webhookEndpoints)
        .where(
          and(eq(webhookEndpoints.id, req.params.id), eq(webhookEndpoints.tenantId, req.tenantId)),
        )
        .returning({ id: webhookEndpoints.id });
      if (!row) throw notFound();
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "WEBHOOK_DELETED",
        targetType: "webhook",
        targetId: req.params.id,
        ip: req.ip,
      });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });
  return router;
}
