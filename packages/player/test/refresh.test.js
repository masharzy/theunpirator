import { describe, it, expect, vi } from "vitest";
vi.mock("hls.js", () => ({ default: { isSupported: () => false } }));
import { ProtectedPlayer } from "../src/index.js";
describe("native playback refresh", () => {
  it("refreshes the token URL and preserves playback position", async () => {
    const player = new ProtectedPlayer({
      element: {},
      bootstrap: async () => ({}),
      onError: vi.fn(),
    });
    const play = vi.fn(async () => {});
    let onMetadata;
    player.video = {
      src: "https://gateway.example/v/asset/media?token=old",
      currentTime: 42,
      paused: false,
      addEventListener: vi.fn((name, fn) => {
        if (name === "loadedmetadata") onMetadata = fn;
      }),
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
    expect(player.video.src).toContain("token=new");
    expect(player.state.token).toBe("new");
    player.video.currentTime = 0;
    onMetadata();
    expect(player.video.currentTime).toBe(42);
    expect(play).toHaveBeenCalled();
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
