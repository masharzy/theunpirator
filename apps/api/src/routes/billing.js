import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { plans, subscriptions } from "@unpirator/db/schema";
import { getEntitlements } from "../services/entitlements.js";

export function billingRouter({ db, dashboardAuth, requireTenantViewer }) {
  const router = Router();
  router.use(dashboardAuth, requireTenantViewer);
  router.get("/", async (req, res, next) => {
    try {
      const [subscription] = await db
        .select({
          id: subscriptions.id,
          planId: subscriptions.planId,
          status: subscriptions.status,
          periodStart: subscriptions.periodStart,
          periodEnd: subscriptions.periodEnd,
          planName: plans.name,
        })
        .from(subscriptions)
        .innerJoin(plans, eq(subscriptions.planId, plans.id))
        .where(eq(subscriptions.tenantId, req.tenantId))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      res.json({
        subscription: subscription || null,
        entitlements: await getEntitlements(db, req.tenantId),
      });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
