import { sql } from "drizzle-orm";
import { createDatabase } from "@unpirator/db";
import { usageEvents, usageRollups } from "@unpirator/db/schema";
const { db, client } = createDatabase();
const period = new Date().toISOString().slice(0, 7);
try {
  const rows = await db
    .select({
      tenantId: usageEvents.tenantId,
      metric: usageEvents.type,
      quantity: sql`sum(${usageEvents.quantity})::int`,
    })
    .from(usageEvents)
    .where(sql`to_char(${usageEvents.createdAt}, 'YYYY-MM') = ${period}`)
    .groupBy(usageEvents.tenantId, usageEvents.type);
  for (const row of rows)
    await db
      .insert(usageRollups)
      .values({ tenantId: row.tenantId, period, metric: row.metric, quantity: row.quantity })
      .onConflictDoUpdate({
        target: [usageRollups.tenantId, usageRollups.period, usageRollups.metric],
        set: { quantity: row.quantity, updatedAt: new Date() },
      });
  console.log(`Rolled up ${rows.length} usage metrics for ${period}`);
} finally {
  await client.end();
}
