import { Router } from "express";
import {
  buildAuditQueries,
  describeAuditEntry,
  parseAuditQuery,
} from "../services/audit-console.js";
import { paginationMeta } from "../services/list-query.js";

function redactMetadata(value) {
  if (Array.isArray(value)) return value.map(redactMetadata);
  if (!value || typeof value !== "object") return value;

  const result = {};
  for (const [key, nested] of Object.entries(value)) {
    if (/secret|token|password|credential|authorization/i.test(key)) {
      result[key] = "[redacted]";
    } else {
      result[key] = redactMetadata(nested);
    }
  }
  return result;
}

export function auditRouter({ db, requireTenantAdmin }) {
  const router = Router();

  router.get("/", requireTenantAdmin, async (req, res, next) => {
    try {
      const query = parseAuditQuery(req.query);
      const statements = buildAuditQueries(req.tenantId, query);
      const [rows, countRows, summaryRows] = await Promise.all([
        db.execute(statements.rows),
        db.execute(statements.count),
        db.execute(statements.summary),
      ]);
      const total = Number(countRows[0]?.total || 0);
      const pagination = paginationMeta({ page: query.page, limit: query.limit, total });
      const summary = summaryRows[0] || {};

      const items = rows.map((row) => {
        const description = describeAuditEntry(row);
        return {
          title: description.title,
          summary: description.summary,
          category: description.category,
          actor: row.actor || "System",
          target: description.target,
          sourceIp: row.ip || null,
          createdAt: row.createdAt,
          technical: {
            auditId: row.id,
            action: row.action,
            targetType: row.targetType || null,
            targetId: row.targetId || null,
            metadata: redactMetadata(row.metadata || {}),
          },
        };
      });

      res.set("cache-control", "no-store").json({
        items,
        pagination,
        summary: {
          total: Number(summary.total || 0),
          last24Hours: Number(summary.last24Hours || 0),
          actorCount: Number(summary.actorCount || 0),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
