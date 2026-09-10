import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("hls.js", () => ({ default: { isSupported: () => false } }));
import { ProtectedPlayer, ProtectedSegmentRuntime } from "../src/index.js";
afterEach(() => vi.unstubAllGlobals());
describe("protected playback recovery", () => {
  it("shares one refresh when the timer and requests resume together", async () => {
    const player = new ProtectedPlayer({ element: {}, bootstrap: vi.fn() });
    player.state = { token: "old", tokenExpiresIn: 90, refreshUrl: "https://gateway/refresh" };
    player.tokenRefreshedAt = Date.now() - 30 * 60000;
    player.protected = { setToken: vi.fn() };
    const fetcher = vi.fn(async () => Response.json({ token: "new", tokenExpiresIn: 90 }));
    vi.stubGlobal("fetch", fetcher);
    await Promise.all([
      player.ensureFreshToken(),
      player.ensureFreshToken(),
      player.refreshToken(),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(player.protected.setToken).toHaveBeenCalledWith("new");
  });
  it("retries expired integrity once without destroying playback", async () => {
    const runtime = new ProtectedSegmentRuntime({ video: {}, refreshToken: vi.fn(async () => {}) });
    let attempts = 0;
    runtime.worker = {
      postMessage: (data) =>
        queueMicrotask(() =>
          runtime.onWorkerMessage(
            ++attempts === 1
              ? {
                  type: "error",
                  id: data.id,
                  code: "TOKEN_EXPIRED",
                  status: 401,
                  message: "expired",
                }
              : { type: "integrity", id: data.id },
          ),
        ),
    };
    await runtime.callWorker({ type: "integrity" });
    expect(runtime.refreshToken).toHaveBeenCalledTimes(1);
    expect(runtime.destroyed).toBe(false);
  });
  it("never refreshes or retries revoked authorization", async () => {
    const refreshToken = vi.fn();
    const runtime = new ProtectedSegmentRuntime({ video: {}, refreshToken });
    runtime.worker = {
      postMessage: (data) =>
        queueMicrotask(() =>
          runtime.onWorkerMessage({
            type: "error",
            id: data.id,
            code: "SESSION_REVOKED",
            status: 403,
            message: "revoked",
          }),
        ),
    };
    await expect(runtime.callWorker({ type: "segment" })).rejects.toMatchObject({
      code: "SESSION_REVOKED",
    });
    expect(refreshToken).not.toHaveBeenCalled();
  });
});
