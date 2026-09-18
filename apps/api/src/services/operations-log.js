import { sql } from "drizzle-orm";
import { z } from "zod";

const querySchema = z
  .object({
    q: z.string().trim().max(120).default(""),
    category: z.enum(["all", "usage", "security"]).default("all"),
    level: z.enum(["all", "info", "warning", "critical"]).default("all"),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(10).max(100).default(25),
  })
  .strict();

const securityTitles = {
  DEVICE_LIMIT: "Device limit blocked playback",
  DEVICE_BLOCKED: "Blocked device attempted playback",
  USER_BLOCKED: "Blocked viewer attempted playback",
  CONCURRENT_PLAYBACK: "Concurrent playback blocked",
  INTEGRITY_FAILURE: "Player integrity check failed",
  ORIGIN_MISMATCH: "Playback origin mismatch",
  TOKEN_REUSE: "Playback token reuse detected",
};

function plural(value, one, many = `${one}s`) {
  return Number(value) === 1 ? one : many;
}

function humanize(value) {
  return String(value || "Event")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function normalizeLevel(value) {
  const level = String(value || "info").toLowerCase();
  if (["critical", "error", "high", "fatal"].includes(level)) return "critical";
  if (["warning", "warn", "medium"].includes(level)) return "warning";
  return "info";
}

function formatBytes(value) {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2)
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 ** 3)
    return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function parseOperationLogQuery(input) {
  const result = querySchema.safeParse(input);
  if (result.success) return result.data;
  const error = new Error("Invalid log filters");
  error.code = "VALIDATION_ERROR";
  error.status = 400;
  error.details = result.error.flatten();
  throw error;
}

export function describeOperationEvent(row) {
  const quantity = Math.max(0, Number(row.quantity || 0));
  if (row.category === "security") {
    const level = normalizeLevel(row.severity);
    const title = securityTitles[row.event] || humanize(row.event);
    const risk = Math.max(0, Number(row.riskScore || 0));
    const reason =
      typeof row.metadata?.reason === "string" && row.metadata.reason.trim()
        ? ` ${row.metadata.reason.trim()}`
        : "";
    return {
      title,
      summary: `${reason || "A security control recorded this event."}${
        risk ? ` Risk score ${risk}.` : ""
      }`.trim(),
      level,
    };
  }

  switch (row.event) {
    case "playback_sessions":
      return {
        title: "Playback session started",
        summary: `${quantity} protected playback ${plural(quantity, "session")} authorized.`,
        level: "info",
      };
    case "gateway_requests":
      return {
        title: "Protected media requested",
        summary: `${quantity} gateway ${plural(quantity, "request")} served.`,
        level: "info",
      };
    case "egress_bytes":
      return {
        title: "Protected media delivered",
        summary: `${formatBytes(quantity)} delivered through the protected gateway.`,
        level: "info",
      };
    case "playback_minutes":
      return {
        title: "Playback time recorded",
        summary: `${quantity} playback ${plural(quantity, "minute")} recorded.`,
        level: "info",
      };
    default:
      return {
        title: humanize(row.event),
        summary: `${quantity} ${plural(quantity, "operation")} recorded.`,
        level: "info",
      };
  }
}

export function buildOperationLogQueries(tenantId, query) {
  const pattern = `%${query.q}%`;
  const usageEnabled =
    query.category !== "security" && ["all", "info"].includes(query.level);
  const securityEnabled = query.category !== "usage";
  const usageSearch = query.q
    ? sql`AND (ue.type ILIKE ${pattern} OR COALESCE(a.title, '') ILIKE ${pattern})`
    : sql``;
  const securitySearch = query.q
    ? sql`AND (se.type ILIKE ${pattern} OR COALESCE(a.title, '') ILIKE ${pattern})`
    : sql``;
  const securityLevel =
    query.level === "all"
      ? sql`TRUE`
      : sql`CASE
          WHEN LOWER(se.severity) IN ('critical', 'error', 'high', 'fatal') THEN 'critical'
          WHEN LOWER(se.severity) IN ('warning', 'warn', 'medium') THEN 'warning'
          ELSE 'info'
        END = ${query.level}`;

  const operations = sql`
    SELECT
      ue.id::text AS id,
      'usage'::text AS category,
      ue.type AS event,
      ue.quantity::bigint AS quantity,
      'info'::text AS severity,
      0::int AS "riskScore",
      ue.asset_id::text AS "assetId",
      ue.session_id::text AS "sessionId",
      a.title AS "assetTitle",
      ue.metadata AS metadata,
      ue.created_at AS "createdAt"
    FROM usage_events ue
    LEFT JOIN assets a ON a.id = ue.asset_id
    WHERE ue.tenant_id = ${tenantId}
      AND ${usageEnabled}
      ${usageSearch}

    UNION ALL

    SELECT
      se.id::text AS id,
      'security'::text AS category,
      se.type AS event,
      1::bigint AS quantity,
      se.severity AS severity,
      se.risk_score AS "riskScore",
      se.asset_id::text AS "assetId",
      se.session_id::text AS "sessionId",
      a.title AS "assetTitle",
      se.metadata AS metadata,
      se.created_at AS "createdAt"
    FROM security_events se
    LEFT JOIN assets a ON a.id = se.asset_id
    WHERE se.tenant_id = ${tenantId}
      AND ${securityEnabled}
      AND ${securityLevel}
      ${securitySearch}
  `;

  const offset = (query.page - 1) * query.pageSize;
  return {
    rows: sql`
      SELECT *
      FROM (${operations}) operations
      ORDER BY "createdAt" DESC, id DESC
      LIMIT ${query.pageSize}
      OFFSET ${offset}
    `,
    count: sql`
      SELECT COUNT(*)::int AS total
      FROM (${operations}) operations
    `,
  };
}
