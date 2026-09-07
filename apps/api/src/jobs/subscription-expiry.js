import { and, eq, inArray, lte } from "drizzle-orm";
import { createDatabase } from "@unpirator/db";
import { subscriptions, tenantMembers } from "@unpirator/db/schema";
import { notifications } from "@unpirator/db/commerce-schema";
import { loadConfig } from "../config.js";
import { notifyPlatform } from "../services/admin-notifications.js";

export async function expireSubscriptions({ db, now = new Date() }) {
  const expired = await db
    .select()
    .from(subscriptions)
    .where(
      and(inArray(subscriptions.status, ["active", "trialing"]), lte(subscriptions.periodEnd, now)),
    );

  for (const subscription of expired) {
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(subscriptions)
        .set({ status: "expired", updatedAt: now })
        .where(
          and(
            eq(subscriptions.id, subscription.id),
            inArray(subscriptions.status, ["active", "trialing"]),
          ),
        )
        .returning({ id: subscriptions.id });
      if (!updated) return;
      const owners = await tx
        .select({ accountId: tenantMembers.accountId })
        .from(tenantMembers)
        .where(
          and(eq(tenantMembers.tenantId, subscription.tenantId), eq(tenantMembers.role, "owner")),
        );
      if (owners.length) {
        await tx.insert(notifications).values(
          owners.map(({ accountId }) => ({
            accountId,
            tenantId: subscription.tenantId,
            type: "subscription_expired",
            title: "Plan expired",
            body: "Your paid/trial period ended. Choose a plan to resume new protected playback grants.",
            actionUrl: "/dashboard/plans",
          })),
        );
      }
      await notifyPlatform(tx, {
        type: "subscription_expired",
        title: "Workspace subscription expired",
        body: `Subscription ${subscription.id} expired`,
        tenantId: subscription.tenantId,
        actionUrl: `/admin/workspaces/${subscription.tenantId}/subscription`,
        dedupeKey: `subscription:${subscription.id}:expired`,
        roles: ["super_admin", "billing_admin", "operations_admin"],
      });
    });
  }
  return { expired: expired.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const database = createDatabase(config.DATABASE_URL);
  try {
    const result = await expireSubscriptions({ db: database.db });
    console.log(JSON.stringify(result));
  } finally {
    await database.client.end();
  }
}
