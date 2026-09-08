import { sql } from "drizzle-orm";
import { createDatabase } from "@unpirator/db";
import { usageEvents, usageRollups } from "@unpirator/db/schema";
import { notifyPlatform } from "../services/admin-notifications.js";
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
  const quotaAlerts = await db.execute(
    sql`select s.tenant_id,p.entitlements->>'monthly_gateway_requests' quota,u.quantity used from subscriptions s join plans p on p.id=s.plan_id join usage_rollups u on u.tenant_id=s.tenant_id and u.period=${period} and u.metric='gateway_requests' where s.status='active' and coalesce((p.entitlements->>'monthly_gateway_requests')::bigint,0)>0 and u.quantity >= (p.entitlements->>'monthly_gateway_requests')::bigint*.7`,
  );
  for (const alert of quotaAlerts) {
    const percent = Math.floor((Number(alert.used) / Number(alert.quota)) * 100);
    const threshold = percent >= 100 ? 100 : percent >= 85 ? 85 : 70;
    await notifyPlatform(db, {
      type: "quota_threshold",
      title: `Workspace reached ${threshold}% quota`,
      body: `${alert.used} of ${alert.quota} gateway requests used`,
      tenantId: alert.tenant_id,
      actionUrl: `/admin/workspaces/${alert.tenant_id}/usage`,
      dedupeKey: `quota:${alert.tenant_id}:${period}:${threshold}`,
      roles: ["super_admin", "operations_admin", "billing_admin", "support_admin"],
    });
  }
  console.log(`Rolled up ${rows.length} usage metrics for ${period}`);
} finally {
  await client.end();
}
