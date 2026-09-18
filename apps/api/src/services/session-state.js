import { sql } from "drizzle-orm";

export const SESSION_ACTIVE_HEARTBEAT_MS = 90_000;

export function effectiveSessionStatus(session, now = new Date()) {
  if (!session) return "ended";
  if (session.status !== "active") return session.status;

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const expiresAt = session.expiresAt ? new Date(session.expiresAt).getTime() : null;
  if (expiresAt != null && Number.isFinite(expiresAt) && expiresAt <= nowMs) return "ended";

  const heartbeat = session.lastHeartbeatAt
    ? new Date(session.lastHeartbeatAt).getTime()
    : session.startedAt
      ? new Date(session.startedAt).getTime()
      : null;
  if (
    heartbeat != null &&
    Number.isFinite(heartbeat) &&
    nowMs - heartbeat > SESSION_ACTIVE_HEARTBEAT_MS
  )
    return "idle";

  return "active";
}

export async function reconcileExpiredSessions(db, tenantId, now = new Date()) {
  await db.execute(sql`
    UPDATE playback_sessions
    SET status = 'ended', ended_at = COALESCE(ended_at, expires_at)
    WHERE tenant_id = ${tenantId}
      AND status = 'active'
      AND expires_at <= ${now}
  `);
}
