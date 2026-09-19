import { describe, expect, it } from "vitest";
import { describeOperationEvent, parseOperationLogQuery } from "../src/services/operations-log.js";

describe("operations log", () => {
  it("normalizes canonical server-side filters and pagination", () => {
    expect(
      parseOperationLogQuery({
        search: "  playback  ",
        category: "usage",
        level: "info",
        page: "2",
        limit: "50",
      }),
    ).toMatchObject({
      search: "playback",
      category: "usage",
      level: "info",
      page: 2,
      limit: 50,
      sort: "newest",
      from: null,
      to: null,
    });
  });

  it("keeps q and pageSize as backward-compatible aliases", () => {
    expect(parseOperationLogQuery({ q: " gateway ", pageSize: "40" })).toMatchObject({
      search: "gateway",
      page: 1,
      limit: 40,
      category: "all",
      level: "all",
    });
  });

  it("rejects unsupported filters", () => {
    expect(() => parseOperationLogQuery({ category: "admin" })).toThrow("Invalid log filters");
    expect(() => parseOperationLogQuery({ limit: "500" })).toThrow("Invalid log filters");
  });

  it("turns usage telemetry into human-readable operations", () => {
    expect(
      describeOperationEvent({ category: "usage", event: "egress_bytes", quantity: 2048 }),
    ).toEqual({
      title: "Protected media delivered",
      summary: "2.0 KB delivered through the protected gateway.",
      level: "info",
    });
  });

  it("normalizes security severity without exposing identifiers", () => {
    const result = describeOperationEvent({
      category: "security",
      event: "CONCURRENT_PLAYBACK",
      severity: "high",
      riskScore: 75,
      metadata: {},
      sessionId: "hidden-session-id",
    });
    expect(result).toEqual({
      title: "Concurrent playback blocked",
      summary: "A security control recorded this event. Risk score 75.",
      level: "critical",
    });
    expect(JSON.stringify(result)).not.toContain("hidden-session-id");
  });
});
