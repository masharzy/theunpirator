import { describe, expect, it } from "vitest";
import { describeAuditEntry, parseAuditQuery } from "../src/services/audit-console.js";

describe("audit console", () => {
  it("normalizes canonical server-side search, category and pagination", () => {
    const result = parseAuditQuery({
      search: "  viewer  ",
      category: "access",
      page: "2",
      limit: "50",
    });

    expect(result).toMatchObject({
      search: "viewer",
      category: "access",
      page: 2,
      limit: 50,
      sort: "newest",
      from: null,
      to: null,
    });
  });

  it("keeps q and pageSize as backward-compatible aliases", () => {
    expect(parseAuditQuery({ q: "  site  ", pageSize: "40" })).toMatchObject({
      search: "site",
      page: 1,
      limit: 40,
      category: "all",
    });
  });

  it("rejects unsupported filters", () => {
    expect(() => parseAuditQuery({ category: "security" })).toThrow("Invalid audit filters");
    expect(() => parseAuditQuery({ limit: "500" })).toThrow("Invalid audit filters");
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
