import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { accounts, subscriptions, tenants } from "@unpirator/db/schema";
import {
  billingPlans,
  notifications,
  paymentMethods,
  paymentRequests,
} from "@unpirator/db/commerce-schema";
import { AppError, notFound } from "../errors.js";
import { writeAudit } from "../services/audit.js";

const planSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9_-]{2,40}$/)
      .optional(),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).optional().nullable(),
    priceMinor: z.number().int().min(0).nullable().optional(),
    currency: z.string().trim().min(3).max(8).default("BDT"),
    billingInterval: z.enum(["month", "quarter", "year", "custom"]).default("month"),
    durationDays: z.number().int().min(1).max(3660).default(30),
    trialDays: z.number().int().min(0).max(365).default(14),
    status: z.enum(["active", "disabled"]).default("active"),
    isPublic: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(9999).default(0),
    badge: z.string().trim().max(40).optional().nullable(),
    entitlements: z.record(z.string(), z.any()).default({}),
  })
  .strict();

const methodSchema = z
  .object({
    type: z.enum(["bkash", "nagad", "rocket"]),
    displayName: z.string().trim().min(2).max(80),
    accountNumber: z.string().trim().min(8).max(40),
    accountName: z.string().trim().max(120).optional().nullable(),
    accountType: z.string().trim().max(80).optional().nullable(),
    instructions: z.string().trim().max(1000).optional().nullable(),
    enabled: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(9999).default(0),
    minAmountMinor: z.number().int().min(0).optional().nullable(),
    maxAmountMinor: z.number().int().min(0).optional().nullable(),
  })
  .strict();

const reviewSchema = z
  .object({
    action: z.enum(["reviewing", "needs_information", "approve", "reject"]),
    note: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

export function adminCommerceRouter({
  db,
  dashboardAuth,
  csrfGuard,
  requirePlatformPermission,
  requireRecentMfa,
}) {
  const router = Router();
  router.use(dashboardAuth, csrfGuard);
  router.use((req, res, next) =>
    ["GET", "HEAD", "OPTIONS"].includes(req.method) ? next() : requireRecentMfa(req, res, next),
  );

  router.get("/plans", requirePlatformPermission("subscriptions.read"), async (_req, res, next) => {
    try {
      res.json({
        items: await db.select().from(billingPlans).orderBy(billingPlans.sortOrder),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/plans", requirePlatformPermission("plans.manage"), async (req, res, next) => {
    try {
      const input = planSchema.parse(req.body);
      if (!input.id) throw new AppError("PLAN_ID_REQUIRED", "Plan ID is required", 400);
      const [plan] = await db
        .insert(billingPlans)
        .values({ ...input, archivedAt: null })
        .returning();
      await writeAudit(db, {
        actorAccountId: req.auth.accountId,
        action: "PLAN_CREATED",
        targetType: "plan",
        targetId: plan.id,
        metadata: { name: plan.name, priceMinor: plan.priceMinor },
        ip: req.ip,
      });
      res.status(201).json({ plan });
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    "/plans/:planId",
    requirePlatformPermission("plans.manage"),
    async (req, res, next) => {
      try {
        const input = planSchema.omit({ id: true }).partial().parse(req.body);
        const [plan] = await db
          .update(billingPlans)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(billingPlans.id, req.params.planId))
          .returning();
        if (!plan) throw notFound();
        await writeAudit(db, {
          actorAccountId: req.auth.accountId,
          action: "PLAN_UPDATED",
          targetType: "plan",
          targetId: plan.id,
          metadata: { changed: Object.keys(input) },
          ip: req.ip,
        });
        res.json({ plan });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    "/plans/:planId",
    requirePlatformPermission("plans.manage"),
    async (req, res, next) => {
      try {
        const [plan] = await db
          .update(billingPlans)
          .set({
            status: "disabled",
            isPublic: false,
            archivedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(billingPlans.id, req.params.planId))
          .returning();
        if (!plan) throw notFound();
        await writeAudit(db, {
          actorAccountId: req.auth.accountId,
          action: "PLAN_ARCHIVED",
          targetType: "plan",
          targetId: plan.id,
          ip: req.ip,
        });
        res.json({ plan });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/payment-methods",
    requirePlatformPermission("payments.read"),
    async (_req, res, next) => {
      try {
        res.json({
          items: await db.select().from(paymentMethods).orderBy(paymentMethods.sortOrder),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/payment-methods",
    requirePlatformPermission("plans.manage"),
    async (req, res, next) => {
      try {
        const input = methodSchema.parse(req.body);
        if (
          input.minAmountMinor != null &&
          input.maxAmountMinor != null &&
          input.minAmountMinor > input.maxAmountMinor
        )
          throw new AppError(
            "INVALID_AMOUNT_RANGE",
            "Minimum amount cannot exceed maximum amount",
            400,
          );
        const [method] = await db
          .insert(paymentMethods)
          .values({
            ...input,
            createdBy: req.auth.accountId,
            updatedBy: req.auth.accountId,
          })
          .onConflictDoUpdate({
            target: paymentMethods.type,
            set: {
              ...input,
              updatedBy: req.auth.accountId,
              updatedAt: new Date(),
            },
          })
          .returning();
        await writeAudit(db, {
          actorAccountId: req.auth.accountId,
          action: "PAYMENT_METHOD_CONFIGURED",
          targetType: "payment_method",
          targetId: method.id,
          metadata: { type: method.type, enabled: method.enabled },
          ip: req.ip,
        });
        res.status(201).json({ method });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/payment-methods/:methodId",
    requirePlatformPermission("plans.manage"),
    async (req, res, next) => {
      try {
        const input = methodSchema.partial().parse(req.body);
        const [method] = await db
          .update(paymentMethods)
          .set({ ...input, updatedBy: req.auth.accountId, updatedAt: new Date() })
          .where(eq(paymentMethods.id, req.params.methodId))
          .returning();
        if (!method) throw notFound();
        await writeAudit(db, {
          actorAccountId: req.auth.accountId,
          action: "PAYMENT_METHOD_UPDATED",
          targetType: "payment_method",
          targetId: method.id,
          metadata: { changed: Object.keys(input) },
          ip: req.ip,
        });
        res.json({ method });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/payments", requirePlatformPermission("payments.read"), async (req, res, next) => {
    try {
      const status = req.query.status ? String(req.query.status) : null;
      const where = status ? eq(paymentRequests.status, status) : sql`true`;
      const items = await db
        .select({
          id: paymentRequests.id,
          tenantId: paymentRequests.tenantId,
          tenantName: tenants.name,
          accountId: paymentRequests.accountId,
          email: accounts.email,
          planId: paymentRequests.planId,
          planName: paymentRequests.planNameSnapshot,
          amountMinor: paymentRequests.amountMinorSnapshot,
          currency: paymentRequests.currencySnapshot,
          senderNumber: paymentRequests.senderNumber,
          transactionId: paymentRequests.transactionId,
          status: paymentRequests.status,
          submittedAt: paymentRequests.submittedAt,
          reviewedAt: paymentRequests.reviewedAt,
          reviewedBy: paymentRequests.reviewedBy,
          reviewNote: paymentRequests.reviewNote,
          rejectionReason: paymentRequests.rejectionReason,
        })
        .from(paymentRequests)
        .innerJoin(tenants, eq(paymentRequests.tenantId, tenants.id))
        .innerJoin(accounts, eq(paymentRequests.accountId, accounts.id))
        .where(where)
        .orderBy(desc(paymentRequests.createdAt))
        .limit(300);
      res.json({ items });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/payments/:paymentId",
    requirePlatformPermission("payments.read"),
    async (req, res, next) => {
      try {
        const [payment] = await db
          .select()
          .from(paymentRequests)
          .where(eq(paymentRequests.id, req.params.paymentId))
          .limit(1);
        if (!payment) throw notFound();
        const [method] = await db
          .select()
          .from(paymentMethods)
          .where(eq(paymentMethods.id, payment.paymentMethodId))
          .limit(1);
        res.json({ payment, method });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/payments/:paymentId/review",
    requirePlatformPermission("payments.approve"),
    async (req, res, next) => {
      try {
        const input = reviewSchema.parse(req.body);
        const result = await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT id FROM payment_requests WHERE id = ${req.params.paymentId}::uuid FOR UPDATE`,
          );
          const [payment] = await tx
            .select()
            .from(paymentRequests)
            .where(eq(paymentRequests.id, req.params.paymentId))
            .limit(1);
          if (!payment) throw notFound();

          if (payment.status === "approved") {
            const [subscription] = await tx
              .select()
              .from(subscriptions)
              .where(
                and(
                  eq(subscriptions.tenantId, payment.tenantId),
                  eq(subscriptions.providerReference, payment.id),
                ),
              )
              .limit(1);
            return { payment, subscription: subscription || null, idempotent: true };
          }

          if (!["pending", "reviewing", "needs_information"].includes(payment.status)) {
            throw new AppError(
              "PAYMENT_ALREADY_FINAL",
              "This payment request has already been finalized",
              409,
            );
          }

          const now = new Date();
          if (input.action === "reviewing") {
            const [updated] = await tx
              .update(paymentRequests)
              .set({
                status: "reviewing",
                reviewedBy: req.auth.accountId,
                reviewedAt: now,
                reviewNote: input.note || null,
                updatedAt: now,
              })
              .where(eq(paymentRequests.id, payment.id))
              .returning();
            return { payment: updated, subscription: null };
          }

          if (input.action === "needs_information") {
            const [updated] = await tx
              .update(paymentRequests)
              .set({
                status: "needs_information",
                reviewedBy: req.auth.accountId,
                reviewedAt: now,
                reviewNote: input.note || "More information is required.",
                updatedAt: now,
              })
              .where(eq(paymentRequests.id, payment.id))
              .returning();
            await tx.insert(notifications).values({
              accountId: payment.accountId,
              tenantId: payment.tenantId,
              type: "payment_needs_information",
              title: "Payment needs information",
              body: input.note || "Admin requested more information for your payment.",
              actionUrl: "/dashboard/payments",
            });
            return { payment: updated, subscription: null };
          }

          if (input.action === "reject") {
            const reason = input.note || "Payment could not be verified.";
            const [updated] = await tx
              .update(paymentRequests)
              .set({
                status: "rejected",
                reviewedBy: req.auth.accountId,
                reviewedAt: now,
                rejectionReason: reason,
                reviewNote: input.note || null,
                updatedAt: now,
              })
              .where(eq(paymentRequests.id, payment.id))
              .returning();
            await tx.insert(notifications).values({
              accountId: payment.accountId,
              tenantId: payment.tenantId,
              type: "payment_rejected",
              title: "Payment rejected",
              body: reason,
              actionUrl: "/dashboard/payments",
            });
            await writeAudit(tx, {
              tenantId: payment.tenantId,
              actorAccountId: req.auth.accountId,
              action: "PAYMENT_REJECTED",
              targetType: "payment_request",
              targetId: payment.id,
              metadata: { reason },
              ip: req.ip,
            });
            return { payment: updated, subscription: null };
          }

          const [plan] = await tx
            .select()
            .from(billingPlans)
            .where(eq(billingPlans.id, payment.planId))
            .limit(1);
          if (!plan) throw new AppError("PLAN_REMOVED", "The requested plan no longer exists", 409);

          const periodStart = now;
          const periodEnd = new Date(now.getTime() + payment.durationDaysSnapshot * 86400_000);

          await tx
            .update(subscriptions)
            .set({ status: "canceled", updatedAt: now })
            .where(
              and(
                eq(subscriptions.tenantId, payment.tenantId),
                inArray(subscriptions.status, ["active", "trialing"]),
              ),
            );

          const [subscription] = await tx
            .insert(subscriptions)
            .values({
              tenantId: payment.tenantId,
              planId: payment.planId,
              status: "active",
              periodStart,
              periodEnd,
              provider: "manual",
              providerReference: payment.id,
            })
            .returning();

          const [updated] = await tx
            .update(paymentRequests)
            .set({
              status: "approved",
              reviewedBy: req.auth.accountId,
              reviewedAt: now,
              reviewNote: input.note || null,
              updatedAt: now,
            })
            .where(eq(paymentRequests.id, payment.id))
            .returning();

          await tx.insert(notifications).values({
            accountId: payment.accountId,
            tenantId: payment.tenantId,
            type: "payment_approved",
            title: `${payment.planNameSnapshot} is active`,
            body: `Your plan is active until ${periodEnd.toISOString().slice(0, 10)}.`,
            actionUrl: "/dashboard/plans",
          });

          await writeAudit(tx, {
            tenantId: payment.tenantId,
            actorAccountId: req.auth.accountId,
            action: "PAYMENT_APPROVED",
            targetType: "payment_request",
            targetId: payment.id,
            metadata: {
              subscriptionId: subscription.id,
              planId: payment.planId,
              periodStart,
              periodEnd,
            },
            ip: req.ip,
          });

          return { payment: updated, subscription };
        });

        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/subscriptions",
    requirePlatformPermission("subscriptions.read"),
    async (_req, res, next) => {
      try {
        const items = await db
          .select({
            id: subscriptions.id,
            tenantId: subscriptions.tenantId,
            tenantName: tenants.name,
            planId: subscriptions.planId,
            planName: billingPlans.name,
            status: subscriptions.status,
            periodStart: subscriptions.periodStart,
            periodEnd: subscriptions.periodEnd,
            provider: subscriptions.provider,
            providerReference: subscriptions.providerReference,
            createdAt: subscriptions.createdAt,
          })
          .from(subscriptions)
          .innerJoin(tenants, eq(subscriptions.tenantId, tenants.id))
          .innerJoin(billingPlans, eq(subscriptions.planId, billingPlans.id))
          .orderBy(desc(subscriptions.createdAt))
          .limit(500);
        res.json({ items });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/notifications",
    requirePlatformPermission("tenants.read"),
    async (req, res, next) => {
      try {
        const items = await db
          .select()
          .from(notifications)
          .where(eq(notifications.accountId, req.auth.accountId))
          .orderBy(desc(notifications.createdAt))
          .limit(120);
        res.json({ items });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/notifications/:notificationId/read",
    requirePlatformPermission("tenants.read"),
    async (req, res, next) => {
      try {
        const [item] = await db
          .update(notifications)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(notifications.id, req.params.notificationId),
              eq(notifications.accountId, req.auth.accountId),
            ),
          )
          .returning();
        if (!item) throw notFound();
        res.json({ notification: item });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
