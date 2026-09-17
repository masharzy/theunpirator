import { and, eq, inArray } from "drizzle-orm";
import { tenantMembers } from "@unpirator/db/schema";
import { notifications } from "@unpirator/db/commerce-schema";

export async function notifyTenant(
  db,
  { tenantId, type, title, body, actionUrl, dedupeKey, roles },
) {
  const targetRoles = roles || ["owner", "admin"];
  const recipients = await db
    .select({ accountId: tenantMembers.accountId })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.tenantId, tenantId), inArray(tenantMembers.role, targetRoles)));

  for (const { accountId } of recipients) {
    if (dedupeKey) {
      const [existing] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.accountId, accountId),
            eq(notifications.tenantId, tenantId),
            eq(notifications.dedupeKey, dedupeKey),
          ),
        )
        .limit(1);
      if (existing) continue;
    }

    await db.insert(notifications).values({
      accountId,
      tenantId,
      type,
      title,
      body,
      actionUrl,
      dedupeKey,
    });
  }
}
