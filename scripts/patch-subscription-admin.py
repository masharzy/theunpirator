from pathlib import Path

path = Path("apps/api/src/routes/admin-commerce.js")
text = path.read_text()

old = '''        const items = await db
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
'''

new = '''        const [items, noPlan] = await Promise.all([
          db
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
            .limit(500),
          db
            .select({
              tenantId: tenants.id,
              tenantName: tenants.name,
              tenantStatus: tenants.status,
              createdAt: tenants.createdAt,
            })
            .from(tenants)
            .where(sql`not exists (select 1 from subscriptions s where s.tenant_id = ${tenants.id})`)
            .orderBy(desc(tenants.createdAt))
            .limit(500),
        ]);
        res.json({ items, noPlan });
'''

if old not in text:
    raise SystemExit("subscription list block not found")
text = text.replace(old, new, 1)

marker = '  router.get(\n    "/notifications",\n'
route = '''  router.post(
    "/subscriptions/:subscriptionId/revoke",
    requirePlatformPermission("plans.manage"),
    async (req, res, next) => {
      try {
        const { reason } = z
          .object({ reason: z.string().trim().min(3).max(500) })
          .strict()
          .parse(req.body);
        const [current] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.id, req.params.subscriptionId))
          .limit(1);
        if (!current) throw notFound();
        if (!["active", "trialing"].includes(current.status)) {
          throw new AppError(
            "SUBSCRIPTION_NOT_ACTIVE",
            "Only active or trialing subscriptions can be revoked",
            409,
          );
        }
        const now = new Date();
        const [subscription] = await db
          .update(subscriptions)
          .set({ status: "canceled", periodEnd: now, updatedAt: now })
          .where(eq(subscriptions.id, current.id))
          .returning();
        await writeAudit(db, {
          tenantId: current.tenantId,
          actorAccountId: req.auth.accountId,
          action: "SUBSCRIPTION_REVOKED",
          targetType: "subscription",
          targetId: current.id,
          metadata: {
            planId: current.planId,
            previousStatus: current.status,
            reason,
          },
          ip: req.ip,
        });
        res.json({ subscription });
      } catch (error) {
        next(error);
      }
    },
  );

'''

if marker not in text:
    raise SystemExit("notifications marker not found")
text = text.replace(marker, route + marker, 1)
path.write_text(text)
