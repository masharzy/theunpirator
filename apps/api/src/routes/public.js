import { Router } from "express";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { billingPlans, trialOffers } from "@unpirator/db/commerce-schema";

export function publicRouter({ db }) {
  const router = Router();

  router.get("/plans", async (_req, res, next) => {
    try {
      const items = await db
        .select({
          id: billingPlans.id,
          name: billingPlans.name,
          description: billingPlans.description,
          priceMinor: billingPlans.priceMinor,
          currency: billingPlans.currency,
          billingInterval: billingPlans.billingInterval,
          durationDays: billingPlans.durationDays,
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

      // Admin-granted trials surface as badges; claiming happens in-dashboard.
      const trialRows = await db
        .select({ planId: trialOffers.planId })
        .from(trialOffers)
        .where(
          and(
            eq(trialOffers.status, "active"),
            inArray(trialOffers.audience, ["everyone", "new_users"]),
            sql`(${trialOffers.maxClaims} IS NULL OR ${trialOffers.claimCount} < ${trialOffers.maxClaims})`,
          ),
        );
      const trialPlanIds = new Set(trialRows.map((row) => row.planId));
      res.set("cache-control", "public, max-age=60, stale-while-revalidate=300").json({
        items: items.map((item) => ({ ...item, trialAvailable: trialPlanIds.has(item.id) })),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
