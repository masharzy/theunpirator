import { describe, it, expect, vi } from "vitest";
vi.mock("hls.js", () => ({ default: { isSupported: () => false } }));
import { ProtectedPlayer } from "../src/index.js";
describe("native playback refresh", () => {
  it("refreshes native playback without reloading its source", async () => {
    const player = new ProtectedPlayer({
      element: {},
      bootstrap: async () => ({}),
      onError: vi.fn(),
    });
    const play = vi.fn(async () => {});
    player.video = {
      src: "https://gateway.example/v/asset/media?token=old",
      currentTime: 42,
      paused: false,
      addEventListener: vi.fn(),
      play,
    };
    player.state = {
      playbackUrl: player.video.src,
      token: "old",
      refreshUrl: "https://gateway.example/v/asset/refresh",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ token: "new", tokenExpiresIn: 90 })),
    );
    await player.refreshToken();
    expect(player.video.src).toContain("token=old");
    expect(player.state.token).toBe("new");
    expect(player.video.currentTime).toBe(42);
    expect(play).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("pauses playback when token refresh is denied", async () => {
    const player = new ProtectedPlayer({ element: {}, bootstrap: async () => ({}) });
    player.video = { pause: vi.fn() };
    player.state = { token: "old", refreshUrl: "https://gateway.example/refresh" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 403 })),
    );
    await expect(player.refreshToken()).rejects.toThrow("Playback token refresh failed");
    expect(player.video.pause).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
