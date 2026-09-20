import { afterEach, describe, expect, it, vi } from "vitest";
import { syncSessionCacheBestEffort } from "../src/services/playback.js";

describe("playback session cache resilience", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not fail playback when the optional cache quota is exhausted", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache = { set: vi.fn().mockRejectedValue(new Error("max requests limit exceeded")) };

    await expect(syncSessionCacheBestEffort(cache, "session-1", "active")).resolves.toBe(false);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("reports a successful mirror write", async () => {
    const cache = { set: vi.fn().mockResolvedValue("OK") };
    await expect(syncSessionCacheBestEffort(cache, "session-1", "revoked")).resolves.toBe(true);
  });
});
