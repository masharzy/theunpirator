import { Router } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { billingPlans } from "@unpirator/db/commerce-schema";

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
      res.set("cache-control", "public, max-age=60, stale-while-revalidate=300");
      res.json({ items });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
