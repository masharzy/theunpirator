import { auditLogs } from "@unpirator/db/schema";
export async function writeAudit(
  db,
  {
    tenantId = null,
    actorAccountId = null,
    action,
    targetType = null,
    targetId = null,
    metadata = {},
    ip = null,
  },
) {
  await db
    .insert(auditLogs)
    .values({ tenantId, actorAccountId, action, targetType, targetId, metadata, ip });
}
