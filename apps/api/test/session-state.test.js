import { describe, expect, it } from "vitest";
import {
  effectiveSessionStatus,
  SESSION_ACTIVE_HEARTBEAT_MS,
} from "../src/services/session-state.js";

const now = new Date("2026-09-18T14:00:00.000Z");

function session(overrides = {}) {
  return {
    status: "active",
    startedAt: new Date(now.getTime() - 30_000),
    lastHeartbeatAt: new Date(now.getTime() - 30_000),
    expiresAt: new Date(now.getTime() + 60 * 60_000),
    endedAt: null,
    ...overrides,
  };
}

describe("effectiveSessionStatus", () => {
  it("keeps a recently-heartbeating session active", () => {
    expect(effectiveSessionStatus(session(), now)).toBe("active");
  });

  it("marks a stale heartbeat idle even when the stored status is active", () => {
    expect(
      effectiveSessionStatus(
        session({ lastHeartbeatAt: new Date(now.getTime() - SESSION_ACTIVE_HEARTBEAT_MS - 1) }),
        now,
      ),
    ).toBe("idle");
  });

  it("marks an expired stored-active session ended", () => {
    expect(effectiveSessionStatus(session({ expiresAt: new Date(now.getTime() - 1) }), now)).toBe(
      "ended",
    );
  });

  it("preserves explicit revoked and ended states", () => {
    expect(effectiveSessionStatus(session({ status: "revoked" }), now)).toBe("revoked");
    expect(effectiveSessionStatus(session({ status: "ended" }), now)).toBe("ended");
  });
});
