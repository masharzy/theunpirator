import { describe, expect, it, vi } from "vitest";
import {
  effectiveSessionStatus,
  SESSION_ACTIVE_HEARTBEAT_MS,
  settleSessionRevoke,
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

describe("settleSessionRevoke", () => {
  it.each(["revoked", "ended"])("treats %s sessions as idempotent no-ops", async (state) => {
    const existing = session({ status: state });
    const revoke = vi.fn();
    const readDurable = vi.fn();

    await expect(
      settleSessionRevoke({ state, existing, revoke, readDurable }),
    ).resolves.toEqual({ session: existing, didRevoke: false, secondaryError: null });
    expect(revoke).not.toHaveBeenCalled();
    expect(readDurable).not.toHaveBeenCalled();
  });

  it("returns a normal durable revoke", async () => {
    const existing = session();
    const revoked = session({ status: "revoked", endedAt: now });

    await expect(
      settleSessionRevoke({
        state: "active",
        existing,
        revoke: vi.fn().mockResolvedValue(revoked),
        readDurable: vi.fn(),
      }),
    ).resolves.toEqual({ session: revoked, didRevoke: true, secondaryError: null });
  });

  it("accepts a durable DB revoke when a secondary sync fails", async () => {
    const existing = session();
    const revoked = session({ status: "revoked", endedAt: now });
    const secondaryError = new Error("gateway sync failed");

    await expect(
      settleSessionRevoke({
        state: "active",
        existing,
        revoke: vi.fn().mockRejectedValue(secondaryError),
        readDurable: vi.fn().mockResolvedValue(revoked),
      }),
    ).resolves.toEqual({ session: revoked, didRevoke: true, secondaryError });
  });

  it("rethrows when the revoke was not durably committed", async () => {
    const existing = session();
    const failure = new Error("database failure");

    await expect(
      settleSessionRevoke({
        state: "active",
        existing,
        revoke: vi.fn().mockRejectedValue(failure),
        readDurable: vi.fn().mockResolvedValue(existing),
      }),
    ).rejects.toBe(failure);
  });
});
