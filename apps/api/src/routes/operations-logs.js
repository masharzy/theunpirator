import { Router } from "express";
import {
  buildOperationLogQueries,
  describeOperationEvent,
  parseOperationLogQuery,
} from "../services/operations-log.js";
import { paginationMeta } from "../services/list-query.js";

// Keep this route in the API deploy graph so dashboard log requests resolve after release.
export function operationsLogsRouter({ db, requireTenantDeveloper }) {
  const router = Router();

  router.get("/", requireTenantDeveloper, async (req, res, next) => {
    try {
      const query = parseOperationLogQuery(req.query);
      const statements = buildOperationLogQueries(req.tenantId, query);
      const countRows = await db.execute(statements.count);
      const total = Number(countRows[0]?.total || 0);
      const pagination = paginationMeta({ page: query.page, limit: query.limit, total });
      const rowStatement =
        pagination.page === query.page
          ? statements.rows
          : buildOperationLogQueries(req.tenantId, { ...query, page: pagination.page }).rows;
      const rows = await db.execute(rowStatement);
      const items = rows.map((row) => {
        const description = describeOperationEvent(row);
        return {
          category: row.category,
          title: description.title,
          summary: description.summary,
          level: description.level,
          resource:
            row.assetTitle || (row.category === "security" ? "Workspace security" : "Workspace"),
          createdAt: row.createdAt,
          technical: {
            eventId: row.id,
            eventKey: row.event,
            assetId: row.assetId || null,
            sessionId: row.sessionId || null,
            quantity: Number(row.quantity || 0),
            riskScore: Number(row.riskScore || 0),
            metadata: row.metadata || {},
          },
        };
      });

      res.set("cache-control", "no-store").json({
        items,
        pagination,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
