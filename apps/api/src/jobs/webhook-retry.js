import { and, asc, eq, lte } from "drizzle-orm";
import { createDatabase } from "@unpirator/db";
import { webhookDeliveries } from "@unpirator/db/schema";
import { loadConfig } from "../config.js";
import { deliverWebhook } from "../services/webhooks.js";

const config = loadConfig();
const { db, client } = createDatabase(config.DATABASE_URL);
try {
  const pending = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, "pending"),
        lte(webhookDeliveries.nextAttemptAt, new Date()),
      ),
    )
    .orderBy(asc(webhookDeliveries.nextAttemptAt))
    .limit(100);
  for (const delivery of pending) {
    const result = await deliverWebhook(db, delivery, config);
    const attempts = delivery.attempts + 1;
    if (result.ok)
      await db
        .update(webhookDeliveries)
        .set({ status: "delivered", attempts, lastError: null })
        .where(eq(webhookDeliveries.id, delivery.id));
    else if (result.permanent || attempts >= 8)
      await db
        .update(webhookDeliveries)
        .set({ status: "failed", attempts, lastError: result.error })
        .where(eq(webhookDeliveries.id, delivery.id));
    else {
      const minutes = Math.min(60, 2 ** attempts);
      await db
        .update(webhookDeliveries)
        .set({
          attempts,
          lastError: result.error,
          nextAttemptAt: new Date(Date.now() + minutes * 60_000),
        })
        .where(eq(webhookDeliveries.id, delivery.id));
    }
  }
  console.log(`Processed ${pending.length} webhook deliveries`);
} finally {
  await client.end();
}
