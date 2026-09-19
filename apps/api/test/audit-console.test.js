import { describe, expect, it } from "vitest";
import { describeAuditEntry, parseAuditQuery } from "../src/services/audit-console.js";

describe("audit console", () => {
  it("normalizes server-side search, category and pagination", () => {
    expect(
      parseAuditQuery({
        q: "  viewer  ",
        category: "access",
        page: "2",
        pageSize: "50",
      }),
    ).toEqual({
      q: "viewer",
      category: "access",
      page: 2,
      pageSize: 50,
    });
  });

  it("rejects unsupported filters", () => {
    expect(() => parseAuditQuery({ category: "security" })).toThrow("Invalid audit filters");
    expect(() => parseAuditQuery({ pageSize: "500" })).toThrow("Invalid audit filters");
  });

  it("turns viewer actions into readable activity without exposing target ids", () => {
    const result = describeAuditEntry({
      actor: "owner@example.com",
      action: "USER_BLOCKED",
      targetType: "end_user",
      targetId: "hidden-viewer-id",
      targetLabel: "Viewer",
    });

    expect(result).toEqual({
      title: "Viewer blocked",
      summary: "owner@example.com blocked Viewer.",
      category: "access",
      target: "Viewer",
    });
    expect(JSON.stringify(result)).not.toContain("hidden-viewer-id");
  });

  it("falls back to a readable label for unknown audit actions", () => {
    expect(
      describeAuditEntry({
        actor: "System",
        action: "WORKSPACE_RETENTION_CHANGED",
        targetType: "tenant",
        targetLabel: "Acme Academy",
      }),
    ).toEqual({
      title: "Workspace retention changed",
      summary: "System recorded workspace retention changed for Acme Academy.",
      category: "workspace",
      target: "Acme Academy",
    });
  });
});
