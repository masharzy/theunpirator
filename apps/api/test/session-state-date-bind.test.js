import { describe, expect, it, vi } from "vitest";
import { reconcileExpiredSessions } from "../src/services/session-state.js";

describe("reconcileExpiredSessions", () => {
  it("binds the cutoff as a string instead of a Date object", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const now = new Date("2026-09-18T18:21:02.461Z");

    await reconcileExpiredSessions({ execute }, "fb4478e3-40c4-46a8-9f83-ead01a188405", now);

    const query = execute.mock.calls[0][0];
    const dateChunk = query.queryChunks.find((chunk) => {
      const value = chunk?.value ?? chunk;
      return value === now.toISOString() || value instanceof Date;
    });
    const boundValue = dateChunk?.value ?? dateChunk;

    expect(boundValue).toBe(now.toISOString());
    expect(boundValue).not.toBeInstanceOf(Date);
  });
});
