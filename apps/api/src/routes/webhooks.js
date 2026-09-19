import { Router } from "express";
import { and, count, desc, eq, sql } from "drizzle-orm";
import {
  parseOrThrow,
  webhookCreateSchema,
  webhookUpdateSchema,
} from "@unpirator/contracts";
import { encryptJson, randomToken } from "@unpirator/crypto";
import { webhookDeliveries, webhookEndpoints } from "@unpirator/db/schema";
import { AppError, notFound } from "../errors.js";
import { writeAudit } from "../services/audit.js";
import { deliverWebhook, hashWebhookSecret } from "../services/webhooks.js";

const DEFAULT_DELIVERY_LIMIT = 20;
const MAX_DELIVERY_LIMIT = 100;

function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const limit = Math.min(
    MAX_DELIVERY_LIMIT,
    Math.max(1, Number.parseInt(query.limit || String(DEFAULT_DELIVERY_LIMIT), 10) || DEFAULT_DELIVERY_LIMIT),
  );
  return { page, limit, offset: (page - 1) * limit };
}

function publicEndpoint(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    events: row.events,
    enabled: row.status === "active",
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function publicDelivery(row) {
  return {
    id: row.id,
    eventId: row.eventId,
    eventType: row.eventType,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
  };
}

export function webhooksRouter({ db, config, dashboardAuth, csrfGuard, requireTenantDeveloper }) {
  const router = Router();
  router.use(dashboardAuth, csrfGuard, requireTenantDeveloper);

  async function getEndpoint(tenantId, endpointId) {
    const [endpoint] = await db
      .select({
        id: webhookEndpoints.id,
        name: sql`webhook_endpoints.name`.as("name"),
        tenantId: webhookEndpoints.tenantId,
        url: webhookEndpoints.url,
        events: webhookEndpoints.events,
        status: webhookEndpoints.status,
        encryptedSecret: webhookEndpoints.encryptedSecret,
        createdAt: webhookEndpoints.createdAt,
        updatedAt: webhookEndpoints.updatedAt,
      })
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.tenantId, tenantId)))
      .limit(1);
    if (!endpoint) throw notFound("Webhook endpoint not found");
    return endpoint;
  }

  router.get("/", async (req, res, next) => {
    try {
      const endpoints = await db
        .select({
          id: webhookEndpoints.id,
          name: sql`webhook_endpoints.name`.as("name"),
          url: webhookEndpoints.url,
          events: webhookEndpoints.events,
          status: webhookEndpoints.status,
          createdAt: webhookEndpoints.createdAt,
          updatedAt: webhookEndpoints.updatedAt,
        })
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.tenantId, req.tenantId))
        .orderBy(desc(webhookEndpoints.createdAt));

      const items = await Promise.all(
        endpoints.map(async (endpoint) => {
          const [lastDelivery] = await db
            .select({
              id: webhookDeliveries.id,
              eventType: webhookDeliveries.eventType,
              status: webhookDeliveries.status,
              attempts: webhookDeliveries.attempts,
              createdAt: webhookDeliveries.createdAt,
              lastError: webhookDeliveries.lastError,
            })
            .from(webhookDeliveries)
            .where(eq(webhookDeliveries.endpointId, endpoint.id))
            .orderBy(desc(webhookDeliveries.createdAt))
            .limit(1);
          return {
            ...publicEndpoint(endpoint),
            lastDelivery: lastDelivery || null,
          };
        }),
      );

      res.set("cache-control", "no-store").json({ items });
    } catch (error) {
      next(error);
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
          updatedAt: webhookEndpoints.updatedAt,
        });

      await db.execute(
        sql`UPDATE webhook_endpoints SET name = ${input.name}, updated_at = NOW() WHERE id = ${endpoint.id} AND tenant_id = ${req.tenantId}`,
      );

      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "WEBHOOK_CREATED",
        targetType: "webhook",
        targetId: endpoint.id,
        metadata: { name: input.name, events: input.events },
        ip: req.ip,
      });

      res.status(201).json({
        endpoint: publicEndpoint({ ...endpoint, name: input.name }),
        secret,
        warning: "Webhook signing secret is shown once.",
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const input = parseOrThrow(webhookUpdateSchema, req.body);
      const endpoint = await getEndpoint(req.tenantId, req.params.id);
      const update = { updatedAt: new Date() };
      if (input.url !== undefined) update.url = input.url;
      if (input.events !== undefined) update.events = input.events;
      if (input.enabled !== undefined) update.status = input.enabled ? "active" : "disabled";

      if (Object.keys(update).length > 1) {
        await db
          .update(webhookEndpoints)
          .set(update)
          .where(
            and(eq(webhookEndpoints.id, endpoint.id), eq(webhookEndpoints.tenantId, req.tenantId)),
          );
      }
      if (input.name !== undefined) {
        await db.execute(
          sql`UPDATE webhook_endpoints SET name = ${input.name}, updated_at = NOW() WHERE id = ${endpoint.id} AND tenant_id = ${req.tenantId}`,
        );
      }

      const updated = await getEndpoint(req.tenantId, endpoint.id);
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "WEBHOOK_UPDATED",
        targetType: "webhook",
        targetId: endpoint.id,
        metadata: { fields: Object.keys(input) },
        ip: req.ip,
      });
      res.json({ endpoint: publicEndpoint(updated) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/test", async (req, res, next) => {
    try {
      const endpoint = await getEndpoint(req.tenantId, req.params.id);
      if (endpoint.status !== "active")
        throw new AppError("WEBHOOK_DISABLED", "Enable this webhook before testing it", 409);

      const [delivery] = await db
        .insert(webhookDeliveries)
        .values({
          endpointId: endpoint.id,
          eventId: `evt_test_${randomToken(12)}`,
          eventType: "webhook.test",
          payload: {
            message: "The Unpirator webhook test",
            requestedAt: new Date().toISOString(),
          },
          status: "pending",
        })
        .returning();

      const result = await deliverWebhook(db, delivery, config);
      const [stored] = await db
        .update(webhookDeliveries)
        .set({
          status: result.ok ? "delivered" : "failed",
          attempts: 1,
          lastError: result.ok ? null : result.error,
        })
        .where(eq(webhookDeliveries.id, delivery.id))
        .returning();

      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "WEBHOOK_TESTED",
        targetType: "webhook",
        targetId: endpoint.id,
        metadata: { deliveryId: delivery.id, result: stored.status },
        ip: req.ip,
      });

      res.status(result.ok ? 200 : 502).json({ delivery: publicDelivery(stored) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/rotate-secret", async (req, res, next) => {
    try {
      const endpoint = await getEndpoint(req.tenantId, req.params.id);
      const secret = `whsec_${randomToken(32)}`;
      await db
        .update(webhookEndpoints)
        .set({
          secretHash: hashWebhookSecret(secret),
          encryptedSecret: encryptJson({ secret }, config.APP_ENCRYPTION_KEY_BASE64),
          updatedAt: new Date(),
        })
        .where(
          and(eq(webhookEndpoints.id, endpoint.id), eq(webhookEndpoints.tenantId, req.tenantId)),
        );

      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "WEBHOOK_SECRET_ROTATED",
        targetType: "webhook",
        targetId: endpoint.id,
        ip: req.ip,
      });

      res.json({ secret, warning: "Webhook signing secret is shown once." });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/deliveries", async (req, res, next) => {
    try {
      const endpoint = await getEndpoint(req.tenantId, req.params.id);
      const { page, limit, offset } = parsePagination(req.query);
      const status = ["pending", "delivered", "failed"].includes(req.query.status)
        ? req.query.status
        : null;
      const where = status
        ? and(eq(webhookDeliveries.endpointId, endpoint.id), eq(webhookDeliveries.status, status))
        : eq(webhookDeliveries.endpointId, endpoint.id);

      const [[totalRow], rows] = await Promise.all([
        db.select({ value: count() }).from(webhookDeliveries).where(where),
        db
          .select({
            id: webhookDeliveries.id,
            eventId: webhookDeliveries.eventId,
            eventType: webhookDeliveries.eventType,
            status: webhookDeliveries.status,
            attempts: webhookDeliveries.attempts,
            nextAttemptAt: webhookDeliveries.nextAttemptAt,
            lastError: webhookDeliveries.lastError,
            createdAt: webhookDeliveries.createdAt,
          })
          .from(webhookDeliveries)
          .where(where)
          .orderBy(desc(webhookDeliveries.createdAt))
          .limit(limit)
          .offset(offset),
      ]);
      const total = Number(totalRow?.value || 0);
      const totalPages = Math.max(1, Math.ceil(total / limit));

      res.set("cache-control", "no-store").json({
        endpoint: publicEndpoint(endpoint),
        items: rows.map(publicDelivery),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/deliveries/:deliveryId/retry", async (req, res, next) => {
    try {
      const endpoint = await getEndpoint(req.tenantId, req.params.id);
      const [delivery] = await db
        .select({ id: webhookDeliveries.id, status: webhookDeliveries.status })
        .from(webhookDeliveries)
        .where(
          and(
            eq(webhookDeliveries.id, req.params.deliveryId),
            eq(webhookDeliveries.endpointId, endpoint.id),
          ),
        )
        .limit(1);
      if (!delivery) throw notFound("Webhook delivery not found");
      if (delivery.status === "delivered")
        throw new AppError("WEBHOOK_ALREADY_DELIVERED", "Delivered webhooks cannot be retried", 409);

      await db
        .update(webhookDeliveries)
        .set({
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(),
          lastError: null,
        })
        .where(eq(webhookDeliveries.id, delivery.id));

      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "WEBHOOK_RETRY_REQUESTED",
        targetType: "webhook",
        targetId: endpoint.id,
        metadata: { deliveryId: delivery.id },
        ip: req.ip,
      });
      res.status(204).end();
    } catch (error) {
      next(error);
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
      if (!row) throw notFound("Webhook endpoint not found");
      await writeAudit(db, {
        tenantId: req.tenantId,
        actorAccountId: req.auth.accountId,
        action: "WEBHOOK_DELETED",
        targetType: "webhook",
        targetId: req.params.id,
        ip: req.ip,
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
