import { inArray } from "drizzle-orm";
import { accounts } from "@unpirator/db/schema";
import { notifications } from "@unpirator/db/commerce-schema";

export async function notifyPlatform(
  db,
  { type, title, body, actionUrl, tenantId = null, dedupeKey, roles },
) {
  const targetRoles = roles || [
    "super_admin",
    "operations_admin",
    "support_admin",
    "security_admin",
  ];
  const recipients = await db
    .select({ accountId: accounts.id })
    .from(accounts)
    .where(inArray(accounts.platformRole, targetRoles));
  if (!recipients.length) return;
  await db
    .insert(notifications)
    .values(
      recipients.map(({ accountId }) => ({
        accountId,
        tenantId,
        type,
        title,
        body,
        actionUrl,
        dedupeKey,
      })),
    )
    .onConflictDoNothing();
}
