import { Router } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { accounts, subscriptions, tenantMembers } from "@unpirator/db/schema";
import {
  billingPlans,
  notifications,
  paymentMethods,
  paymentRequests,
  trialOffers,
} from "@unpirator/db/commerce-schema";
import { getEntitlements } from "../services/entitlements.js";
import { AppError, notFound } from "../errors.js";
import { writeAudit } from "../services/audit.js";
import { cachedGlobalJson } from "../services/metadata-cache.js";

const paymentSchema = z
  .object({
    planId: z.string().min(1).max(80),
    paymentMethodId: z.string().uuid(),
    senderNumber: z.string().trim().min(8).max(32),
    transactionId: z.string().trim().min(4).max(120),
    proofReference: z.string().trim().max(500).optional().nullable(),
    customerNote: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

function normalizeTransactionId(value) {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function billingRouter({
  db,
  cache,
  dashboardAuth,
  csrfGuard,
  requireTenantViewer,
  requireTenantOwner,
  requireVerifiedEmail,
}) {
  const router = Router();
  router.use(dashboardAuth, requireTenantViewer);

  // Trials are admin-granted (trial_offers), never a plan property. A tenant
  // can claim one if: no live subscription, never claimed a trial before, no
  // payment awaiting review, and the offer's audience includes them.
  async function findClaimableTrial(tenantId) {
    const [latest] = await db
      .select({ status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    if (latest && ["active", "trialing"].includes(latest.status)) return null;

    const [trialUsed] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.status, "trialing")))
      .limit(1);
    if (trialUsed) return null;

    const [pending] = await db
      .select({ id: paymentRequests.id })
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.tenantId, tenantId),
          inArray(paymentRequests.status, ["pending", "reviewing", "needs_information"]),
        ),
      )
      .limit(1);
    if (pending) return null;

    const offers = await db
      .select()
      .from(trialOffers)
      .where(and(eq(trialOffers.status, "active"), isNull(trialOffers.email)))
      .orderBy(desc(trialOffers.createdAt));
    const targeted = await db
      .select()
      .from(trialOffers)
      .where(and(eq(trialOffers.status, "active"), eq(trialOffers.audience, "user")));
    const [owner] = await db
      .select({ email: accounts.email })
      .from(tenantMembers)
      .innerJoin(accounts, eq(tenantMembers.accountId, accounts.id))
      .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.role, "owner")))
      .limit(1);
    const ownerEmail = owner?.email?.toLowerCase() || null;

    const candidates = [...offers, ...targeted].filter((offer) => {
      if (offer.maxClaims != null && offer.claimCount >= offer.maxClaims) return false;
      if (offer.audience === "everyone") return true;
      if (offer.audience === "new_users") return !latest;
      if (offer.audience === "user")
        return Boolean(ownerEmail && offer.email?.toLowerCase() === ownerEmail);
      return false;
    });
    const chosen = candidates[0];
    if (!chosen) return null;
    const [plan] = await db
      .select({ name: billingPlans.name })
      .from(billingPlans)
      .where(eq(billingPlans.id, chosen.planId))
      .limit(1);
    return {
      id: chosen.id,
      planId: chosen.planId,
      planName: plan?.name || chosen.planId,
      durationDays: chosen.durationDays,
    };
  }

  router.get("/", async (req, res, next) => {
    try {
      const [subscription] = await db
        .select({
          id: subscriptions.id,
          planId: subscriptions.planId,
          status: subscriptions.status,
          periodStart: subscriptions.periodStart,
          periodEnd: subscriptions.periodEnd,
          planName: billingPlans.name,
          planDescription: billingPlans.description,
          priceMinor: billingPlans.priceMinor,
          currency: billingPlans.currency,
          durationDays: billingPlans.durationDays,
        })
        .from(subscriptions)
        .innerJoin(billingPlans, eq(subscriptions.planId, billingPlans.id))
        .where(eq(subscriptions.tenantId, req.tenantId))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

      const [pendingPayment] = await db
        .select({
          id: paymentRequests.id,
          status: paymentRequests.status,
          planId: paymentRequests.planId,
          planName: paymentRequests.planNameSnapshot,
          amountMinor: paymentRequests.amountMinorSnapshot,
          currency: paymentRequests.currencySnapshot,
          transactionId: paymentRequests.transactionId,
          submittedAt: paymentRequests.submittedAt,
          reviewNote: paymentRequests.reviewNote,
          rejectionReason: paymentRequests.rejectionReason,
        })
        .from(paymentRequests)
        .where(
          and(
            eq(paymentRequests.tenantId, req.tenantId),
            inArray(paymentRequests.status, ["pending", "reviewing", "needs_information"]),
          ),
        )
        .orderBy(desc(paymentRequests.createdAt))
        .limit(1);

      res.json({
        subscription: subscription || null,
        entitlements: await getEntitlements(db, req.tenantId),
        pendingPayment: pendingPayment || null,
        trialOffer: await findClaimableTrial(req.tenantId),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/plans", async (_req, res, next) => {
    try {
      const payload = await cachedGlobalJson({
        cache,
        namespace: "billing-plans",
        key: "public",
        ttlSeconds: 300,
        load: async () => {
          const items = await db
            .select({
              id: billingPlans.id,
              name: billingPlans.name,
              description: billingPlans.description,
              priceMinor: billingPlans.priceMinor,
              currency: billingPlans.currency,
              billingInterval: billingPlans.billingInterval,
              durationDays: billingPlans.durationDays,
              trialDays: billingPlans.trialDays,
              badge: billingPlans.badge,
              entitlements: billingPlans.entitlements,
            })
            .from(billingPlans)
            .where(
              and(
                eq(billingPlans.status, "active"),
                eq(billingPlans.isPublic, true),
                isNull(billingPlans.archivedAt),
              ),
            )
            .orderBy(billingPlans.sortOrder);
          return { items };
        },
      });
      res.set("cache-control", "private, no-cache").json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.get("/payment-methods", async (_req, res, next) => {
    try {
      const items = await db
        .select({
          id: paymentMethods.id,
          type: paymentMethods.type,
          displayName: paymentMethods.displayName,
          accountNumber: paymentMethods.accountNumber,
          accountName: paymentMethods.accountName,
          accountType: paymentMethods.accountType,
          instructions: paymentMethods.instructions,
          minAmountMinor: paymentMethods.minAmountMinor,
          maxAmountMinor: paymentMethods.maxAmountMinor,
        })
        .from(paymentMethods)
        .where(eq(paymentMethods.enabled, true))
        .orderBy(paymentMethods.sortOrder);
      res.json({ items });
    } catch (error) {
      next(error);
    }
  });

  router.get("/payments", async (req, res, next) => {
    try {
      const items = await db
        .select({
          id: paymentRequests.id,
          planId: paymentRequests.planId,
          planName: paymentRequests.planNameSnapshot,
          amountMinor: paymentRequests.amountMinorSnapshot,
          currency: paymentRequests.currencySnapshot,
          senderNumber: paymentRequests.senderNumber,
          transactionId: paymentRequests.transactionId,
          status: paymentRequests.status,
          submittedAt: paymentRequests.submittedAt,
          reviewedAt: paymentRequests.reviewedAt,
          reviewNote: paymentRequests.reviewNote,
          rejectionReason: paymentRequests.rejectionReason,
        })
        .from(paymentRequests)
        .where(eq(paymentRequests.tenantId, req.tenantId))
        .orderBy(desc(paymentRequests.createdAt))
        .limit(100);
      res.json({ items });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/payments",
    csrfGuard,
    requireVerifiedEmail,
    requireTenantOwner,
    async (req, res, next) => {
      try {
        const input = paymentSchema.parse(req.body);
        const [existingOpen] = await db
          .select({ id: paymentRequests.id })
          .from(paymentRequests)
          .where(
            and(
              eq(paymentRequests.tenantId, req.tenantId),
              inArray(paymentRequests.status, ["pending", "reviewing", "needs_information"]),
            ),
          )
          .limit(1);
        if (existingOpen) {
          throw new AppError(
            "PAYMENT_ALREADY_PENDING",
            "Resolve the existing payment request before submitting another one",
            409,
          );
        }

        const [plan] = await db
          .select()
          .from(billingPlans)
          .where(
            and(
              eq(billingPlans.id, input.planId),
              eq(billingPlans.status, "active"),
              eq(billingPlans.isPublic, true),
              isNull(billingPlans.archivedAt),
            ),
          )
          .limit(1);
        if (!plan) throw notFound("Plan not found");
        if (!Number.isInteger(plan.priceMinor) || plan.priceMinor <= 0) {
          throw new AppError(
            "PLAN_PRICE_NOT_CONFIGURED",
            "This plan is not available for self-service payment yet",
            409,
          );
        }

        const [method] = await db
          .select()
          .from(paymentMethods)
          .where(
            and(eq(paymentMethods.id, input.paymentMethodId), eq(paymentMethods.enabled, true)),
          )
          .limit(1);
        if (!method) throw notFound("Payment method not found");
        if (method.minAmountMinor != null && plan.priceMinor < method.minAmountMinor) {
          throw new AppError(
            "PAYMENT_AMOUNT_NOT_SUPPORTED",
            "Selected payment method does not support this amount",
            409,
          );
        }
        if (method.maxAmountMinor != null && plan.priceMinor > method.maxAmountMinor) {
          throw new AppError(
            "PAYMENT_AMOUNT_NOT_SUPPORTED",
            "Selected payment method does not support this amount",
            409,
          );
        }

        const transactionId = normalizeTransactionId(input.transactionId);
        const requestRow = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(paymentRequests)
            .values({
              tenantId: req.tenantId,
              accountId: req.auth.accountId,
              planId: plan.id,
              paymentMethodId: method.id,
              planNameSnapshot: plan.name,
              amountMinorSnapshot: plan.priceMinor,
              currencySnapshot: plan.currency,
              durationDaysSnapshot: plan.durationDays,
              senderNumber: input.senderNumber,
              transactionId,
              proofReference: input.proofReference || null,
              customerNote: input.customerNote || null,
              status: "pending",
              expiresAt: new Date(Date.now() + 72 * 3600_000),
            })
            .returning();

          await tx.insert(notifications).values({
            accountId: req.auth.accountId,
            tenantId: req.tenantId,
            type: "payment_submitted",
            title: "Payment submitted",
            body: `${plan.name} payment is waiting for admin approval.`,
            actionUrl: "/dashboard/payments",
          });

          const billingAdmins = await tx
            .select({ id: accounts.id })
            .from(accounts)
            .where(inArray(accounts.platformRole, ["super_admin", "billing_admin"]));
          if (billingAdmins.length) {
            await tx.insert(notifications).values(
              billingAdmins.map((account) => ({
                accountId: account.id,
                tenantId: req.tenantId,
                type: "payment_review_required",
                title: "Payment awaiting review",
                body: `${plan.name} payment ${transactionId} is ready for review.`,
                actionUrl: `/admin/payments?payment=${created.id}`,
              })),
            );
          }

          await writeAudit(tx, {
            tenantId: req.tenantId,
            actorAccountId: req.auth.accountId,
            action: "PAYMENT_SUBMITTED",
            targetType: "payment_request",
            targetId: created.id,
            metadata: {
              planId: plan.id,
              method: method.type,
              amountMinor: plan.priceMinor,
              currency: plan.currency,
            },
            ip: req.ip,
          });
          return created;
        });

        res.status(201).json({ payment: requestRow });
      } catch (error) {
        if (error?.code === "23505") {
          return next(
            new AppError(
              "DUPLICATE_TRANSACTION",
              "This transaction ID has already been submitted",
              409,
            ),
          );
        }
        next(error);
      }
    },
  );

  // Claim an admin-granted free trial for this workspace.
  router.post(
    "/trials/claim",
    csrfGuard,
    requireVerifiedEmail,
    requireTenantOwner,
    async (req, res, next) => {
      try {
        const input = z.object({ offerId: z.string().uuid() }).strict().parse(req.body);
        const claimable = await findClaimableTrial(req.tenantId);
        if (!claimable || claimable.id !== input.offerId)
          throw new AppError(
            "TRIAL_NOT_AVAILABLE",
            "This trial offer is not available for your workspace",
            409,
          );

        const now = new Date();
        const periodEnd = new Date(now.getTime() + claimable.durationDays * 86400_000);
        const subscription = await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${req.tenantId}:trials`}, 31))`,
          );
          const [live] = await tx
            .select({ id: subscriptions.id })
            .from(subscriptions)
            .where(
              and(
                eq(subscriptions.tenantId, req.tenantId),
                inArray(subscriptions.status, ["active", "trialing"]),
              ),
            )
            .limit(1);
          if (live)
            throw new AppError(
              "TRIAL_NOT_AVAILABLE",
              "This workspace already has a running subscription",
              409,
            );
          const [created] = await tx
            .insert(subscriptions)
            .values({
              tenantId: req.tenantId,
              planId: claimable.planId,
              status: "trialing",
              periodStart: now,
              periodEnd,
              provider: "trial",
              providerReference: claimable.id,
            })
            .returning();
          await tx
            .update(trialOffers)
            .set({ claimCount: sql`${trialOffers.claimCount} + 1`, updatedAt: now })
            .where(eq(trialOffers.id, claimable.id));
          return created;
        });

        await writeAudit(db, {
          tenantId: req.tenantId,
          actorAccountId: req.auth.accountId,
          action: "TRIAL_CLAIMED",
          targetType: "trial_offer",
          targetId: claimable.id,
          ip: req.ip,
        });
        res.status(201).json({ subscription });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/notifications", async (req, res, next) => {
    try {
      const items = await db
        .select()
        .from(notifications)
        .where(eq(notifications.accountId, req.auth.accountId))
        .orderBy(desc(notifications.createdAt))
        .limit(80);
      res.json({ items });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/notifications/:notificationId/read", csrfGuard, async (req, res, next) => {
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
  });

  return router;
}
