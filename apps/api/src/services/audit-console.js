import { sql } from "drizzle-orm";
import { z } from "zod";

const querySchema = z
  .object({
    q: z.string().trim().max(160).default(""),
    category: z
      .enum(["all", "workspace", "access", "content", "developer", "billing"])
      .default("all"),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(10).max(100).default(25),
  })
  .strict();

const actionCopy = {
  WORKSPACE_SETTINGS_CHANGED: {
    title: "Workspace settings changed",
    summary: (actor) => `${actor} updated workspace settings.`,
  },
  WORKSPACE_INVITE_ACCEPTED: {
    title: "Workspace invitation accepted",
    summary: (actor) => `${actor} joined the workspace through an invitation.`,
  },
  WORKSPACE_INVITATION_CREATED: {
    title: "Workspace invitation created",
    summary: (actor) => `${actor} created a workspace invitation.`,
  },
  WORKSPACE_INVITATION_REVOKED: {
    title: "Workspace invitation revoked",
    summary: (actor) => `${actor} revoked a workspace invitation.`,
  },
  TEAM_MEMBER_ROLE_CHANGED: {
    title: "Team role changed",
    summary: (actor, target) => `${actor} changed access for ${target}.`,
  },
  TEAM_MEMBER_REMOVED: {
    title: "Team member removed",
    summary: (actor, target) => `${actor} removed ${target} from the workspace.`,
  },
  API_KEY_CREATED: {
    title: "API key created",
    summary: (actor, target) => `${actor} created ${target}.`,
  },
  API_KEY_REVOKED: {
    title: "API key revoked",
    summary: (actor, target) => `${actor} revoked ${target}.`,
  },
  SITE_CREATED: {
    title: "Site added",
    summary: (actor, target) => `${actor} added ${target}.`,
  },
  SITE_UPDATED: {
    title: "Site updated",
    summary: (actor, target) => `${actor} updated ${target}.`,
  },
  SITE_DELETED: {
    title: "Site removed",
    summary: (actor, target) => `${actor} removed ${target}.`,
  },
  SITE_DOMAIN_VERIFIED: {
    title: "Site domain verified",
    summary: (actor, target) => `${actor} verified ${target}.`,
  },
  ASSET_CREATED: {
    title: "Asset created",
    summary: (actor, target) => `${actor} created ${target}.`,
  },
  ASSET_UPDATED: {
    title: "Asset updated",
    summary: (actor, target) => `${actor} updated ${target}.`,
  },
  ASSET_DELETED: {
    title: "Asset removed",
    summary: (actor, target) => `${actor} removed ${target}.`,
  },
  ASSET_SYNCED: {
    title: "Asset synchronized",
    summary: (actor, target) => `${actor} synchronized ${target}.`,
  },
  USER_BLOCKED: {
    title: "Viewer blocked",
    summary: (actor, target) => `${actor} blocked ${target}.`,
  },
  USER_UNBLOCKED: {
    title: "Viewer unblocked",
    summary: (actor, target) => `${actor} unblocked ${target}.`,
  },
  DEVICE_BLOCKED: {
    title: "Device blocked",
    summary: (actor, target) => `${actor} blocked ${target}.`,
  },
  DEVICE_UNBLOCKED: {
    title: "Device unblocked",
    summary: (actor, target) => `${actor} unblocked ${target}.`,
  },
  VIEWER_DEVICES_RESET: {
    title: "Viewer devices reset",
    summary: (actor, target) => `${actor} reset trusted devices for ${target}.`,
  },
  SESSION_REVOKED: {
    title: "Playback session revoked",
    summary: (actor, target) => `${actor} revoked ${target}.`,
  },
  WEBHOOK_CREATED: {
    title: "Webhook endpoint created",
    summary: (actor, target) => `${actor} created ${target}.`,
  },
  WEBHOOK_DELETED: {
    title: "Webhook endpoint removed",
    summary: (actor, target) => `${actor} removed ${target}.`,
  },
  PAYMENT_SUBMITTED: {
    title: "Payment submitted",
    summary: (actor) => `${actor} submitted a payment for review.`,
  },
  PAYMENT_APPROVED: {
    title: "Payment approved",
    summary: (actor) => `${actor} approved a payment.`,
  },
  PAYMENT_REJECTED: {
    title: "Payment rejected",
    summary: (actor) => `${actor} rejected a payment.`,
  },
};

function humanize(value) {
  return String(value || "Activity")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function categoryFor(action, targetType) {
  const haystack = `${action || ""} ${targetType || ""}`.toLowerCase();
  if (/payment|billing|subscription|plan/.test(haystack)) return "billing";
  if (/api[_ ]?key|webhook|connection|integration/.test(haystack)) return "developer";
  if (/asset|site|domain|media|content/.test(haystack)) return "content";
  if (/user|viewer|device|session|security|access/.test(haystack)) return "access";
  return "workspace";
}

function fallbackTarget(row) {
  if (row.targetLabel) return row.targetLabel;
  const type = String(row.targetType || "").toLowerCase();
  if (type === "end_user") return "viewer";
  if (["session", "playback_session"].includes(type)) return "playback session";
  if (type === "api_key") return "API key";
  if (type === "tenant") return "workspace";
  return type ? humanize(type).toLowerCase() : "workspace";
}

export function parseAuditQuery(input) {
  const result = querySchema.safeParse(input);
  if (result.success) return result.data;
  const error = new Error("Invalid audit filters");
  error.code = "VALIDATION_ERROR";
  error.status = 400;
  error.details = result.error.flatten();
  throw error;
}

export function describeAuditEntry(row) {
  const actor = row.actor || "System";
  const target = fallbackTarget(row);
  const copy = actionCopy[row.action];
  const title = copy?.title || humanize(row.action);
  const summary = copy?.summary
    ? copy.summary(actor, target)
    : `${actor} recorded ${title.toLowerCase()}${target ? ` for ${target}` : ""}.`;

  return {
    title,
    summary,
    category: categoryFor(row.action, row.targetType),
    target,
  };
}

function categoryFilter(category) {
  switch (category) {
    case "billing":
      return sql`AND (
        al.action ILIKE '%PAYMENT%'
        OR al.action ILIKE '%BILLING%'
        OR al.action ILIKE '%SUBSCRIPTION%'
        OR al.action ILIKE '%PLAN%'
        OR COALESCE(al.target_type, '') IN ('payment', 'billing', 'subscription', 'plan')
      )`;
    case "developer":
      return sql`AND (
        al.action ILIKE '%API_KEY%'
        OR al.action ILIKE '%WEBHOOK%'
        OR al.action ILIKE '%CONNECTION%'
        OR al.action ILIKE '%INTEGRATION%'
        OR COALESCE(al.target_type, '') IN ('api_key', 'webhook', 'connection', 'integration')
      )`;
    case "content":
      return sql`AND (
        al.action ILIKE '%ASSET%'
        OR al.action ILIKE '%SITE%'
        OR al.action ILIKE '%DOMAIN%'
        OR COALESCE(al.target_type, '') IN ('asset', 'site', 'domain', 'media', 'content')
      )`;
    case "access":
      return sql`AND (
        al.action ILIKE '%USER%'
        OR al.action ILIKE '%VIEWER%'
        OR al.action ILIKE '%DEVICE%'
        OR al.action ILIKE '%SESSION%'
        OR al.action ILIKE '%SECURITY%'
        OR COALESCE(al.target_type, '') IN ('end_user', 'viewer', 'device', 'session', 'playback_session')
      )`;
    case "workspace":
      return sql`AND NOT (
        al.action ILIKE '%PAYMENT%'
        OR al.action ILIKE '%BILLING%'
        OR al.action ILIKE '%SUBSCRIPTION%'
        OR al.action ILIKE '%PLAN%'
        OR al.action ILIKE '%API_KEY%'
        OR al.action ILIKE '%WEBHOOK%'
        OR al.action ILIKE '%CONNECTION%'
        OR al.action ILIKE '%INTEGRATION%'
        OR al.action ILIKE '%ASSET%'
        OR al.action ILIKE '%SITE%'
        OR al.action ILIKE '%DOMAIN%'
        OR al.action ILIKE '%USER%'
        OR al.action ILIKE '%VIEWER%'
        OR al.action ILIKE '%DEVICE%'
        OR al.action ILIKE '%SESSION%'
        OR al.action ILIKE '%SECURITY%'
      )`;
    default:
      return sql``;
  }
}

export function buildAuditQueries(tenantId, query) {
  const pattern = `%${query.q}%`;
  const search = query.q
    ? sql`AND (
        al.action ILIKE ${pattern}
        OR COALESCE(ac.email, '') ILIKE ${pattern}
        OR COALESCE(al.target_type, '') ILIKE ${pattern}
        OR COALESCE(al.target_id, '') ILIKE ${pattern}
        OR COALESCE(al.ip, '') ILIKE ${pattern}
        OR COALESCE(al.metadata::text, '') ILIKE ${pattern}
        OR COALESCE(s.name, '') ILIKE ${pattern}
        OR COALESCE(s.domain, '') ILIKE ${pattern}
        OR COALESCE(a.title, '') ILIKE ${pattern}
        OR COALESCE(d.device_name, '') ILIKE ${pattern}
        OR COALESCE(d.browser, '') ILIKE ${pattern}
        OR COALESCE(d.os, '') ILIKE ${pattern}
        OR COALESCE(k.name, '') ILIKE ${pattern}
        OR COALESCE(t.name, '') ILIKE ${pattern}
      )`
    : sql``;
  const category = categoryFilter(query.category);
  const joins = sql`
    FROM audit_logs al
    LEFT JOIN accounts ac ON ac.id = al.actor_account_id
    LEFT JOIN sites s
      ON al.target_type = 'site'
      AND al.target_id = s.id::text
      AND s.tenant_id = al.tenant_id
    LEFT JOIN assets a
      ON al.target_type = 'asset'
      AND al.target_id = a.id::text
      AND a.tenant_id = al.tenant_id
    LEFT JOIN devices d
      ON al.target_type = 'device'
      AND al.target_id = d.id::text
      AND d.tenant_id = al.tenant_id
    LEFT JOIN api_keys k
      ON al.target_type = 'api_key'
      AND al.target_id = k.id::text
      AND k.tenant_id = al.tenant_id
    LEFT JOIN tenants t
      ON al.target_type = 'tenant'
      AND al.target_id = t.id::text
      AND t.id = al.tenant_id
    LEFT JOIN playback_sessions ps
      ON al.target_type IN ('session', 'playback_session')
      AND al.target_id = ps.id::text
      AND ps.tenant_id = al.tenant_id
    LEFT JOIN assets pa ON pa.id = ps.asset_id
    WHERE al.tenant_id = ${tenantId}
      ${category}
      ${search}
  `;
  const offset = (query.page - 1) * query.pageSize;

  return {
    rows: sql`
      SELECT
        al.id::text AS id,
        al.action,
        COALESCE(ac.email, 'System') AS actor,
        al.target_type AS "targetType",
        al.target_id AS "targetId",
        CASE
          WHEN al.target_type = 'site' THEN COALESCE(s.name, s.domain)
          WHEN al.target_type = 'asset' THEN a.title
          WHEN al.target_type = 'device' THEN COALESCE(d.device_name, NULLIF(CONCAT_WS(' · ', d.browser, d.os), ''))
          WHEN al.target_type = 'api_key' THEN k.name
          WHEN al.target_type = 'tenant' THEN t.name
          WHEN al.target_type IN ('session', 'playback_session') THEN
            CASE WHEN pa.title IS NOT NULL THEN pa.title || ' playback session' ELSE 'Playback session' END
          WHEN al.target_type IN ('end_user', 'viewer') THEN 'Viewer'
          ELSE NULL
        END AS "targetLabel",
        al.metadata,
        al.ip,
        al.created_at AS "createdAt"
      ${joins}
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT ${query.pageSize}
      OFFSET ${offset}
    `,
    count: sql`
      SELECT COUNT(*)::int AS total
      ${joins}
    `,
    summary: sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS "last24Hours",
        COUNT(DISTINCT actor_account_id)::int AS "actorCount"
      FROM audit_logs
      WHERE tenant_id = ${tenantId}
    `,
  };
}
