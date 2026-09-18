import { Router } from "express";
import {
  buildOperationLogQueries,
  describeOperationEvent,
  parseOperationLogQuery,
} from "../services/operations-log.js";

export function operationsLogsRouter({ db, requireTenantDeveloper }) {
  const router = Router();

  router.get("/", requireTenantDeveloper, async (req, res, next) => {
    try {
      const query = parseOperationLogQuery(req.query);
      const statements = buildOperationLogQueries(req.tenantId, query);
      const [rows, countRows] = await Promise.all([
        db.execute(statements.rows),
        db.execute(statements.count),
      ]);
      const total = Number(countRows[0]?.total || 0);
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
      const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

      res.set("cache-control", "no-store").json({
        items,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
