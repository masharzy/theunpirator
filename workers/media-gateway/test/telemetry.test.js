import { describe, expect, it } from "vitest";
import { filterTelemetryEvents } from "../src/telemetry.js";

describe("quota telemetry", () => {
  it("keeps billing quota failures out of security incidents", () => {
    const events = filterTelemetryEvents([
      { kind: "security", type: "PLAN_QUOTA_EXCEEDED" },
      { kind: "security", type: "QUOTA_UNAVAILABLE" },
      { kind: "security", type: "INVALID_TOKEN" },
    ]);
    expect(events).toEqual([{ kind: "security", type: "INVALID_TOKEN" }]);
  });

  it("drops legacy gateway request telemetry now handled by quota rollups", () => {
    const events = filterTelemetryEvents([
      { kind: "usage", type: "gateway_requests" },
      { kind: "usage", type: "playback_heartbeat" },
    ]);
    expect(events).toEqual([{ kind: "usage", type: "playback_heartbeat" }]);
  });
});
