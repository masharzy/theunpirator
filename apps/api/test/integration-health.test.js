import { describe, expect, it } from "vitest";
import {
  findSuccessfulGatewayUsage,
  isCurrentClientVersion,
} from "../src/routes/integration-health.js";

describe("integration health evidence", () => {
  it("accepts only the current client release line", () => {
    expect(isCurrentClientVersion("0.2.1")).toBe(true);
    expect(isCurrentClientVersion("0.1.11")).toBe(false);
    expect(isCurrentClientVersion(undefined)).toBe(false);
  });

  it("requires a successful gateway response instead of session creation alone", () => {
    const events = [
      { type: "playback_sessions", metadata: {} },
      { type: "gateway_requests", metadata: { status: 502 } },
    ];
    expect(findSuccessfulGatewayUsage(events)).toBeUndefined();

    const success = { type: "gateway_requests", metadata: { status: 206 } };
    expect(findSuccessfulGatewayUsage([...events, success])).toBe(success);
  });
});
