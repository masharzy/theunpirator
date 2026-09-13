import { describe, expect, it } from "vitest";
import { registerProvider, resolveAssetSource } from "../src/index.js";

registerProvider("test", {
  resolve: async ({ asset }) => ({ url: asset.providerReference, supportsRange: true }),
});
registerProvider("youtube_custom", {
  resolve: async () => ({
    url: "https://signed.googlevideo.com/video.mp4",
    allowedHosts: ["signed.googlevideo.com"],
  }),
});
registerProvider("trusted_redirect", {
  resolve: async () => ({
    url: "https://video.cdn.example/playlist.m3u8",
    allowedHosts: ["video.cdn.example"],
    trustedResolvedHosts: true,
  }),
});
describe("source allowlist", () => {
  it("allows registered origin hosts", async () => {
    const source = await resolveAssetSource(
      {
        provider: "test",
        providerReference: "https://cdn.example.com/video.mp4",
        allowedHosts: ["cdn.example.com"],
      },
      {},
      {},
    );
    expect(source.url).toContain("cdn.example.com");
  });
  it("blocks unregistered hosts", async () => {
    await expect(
      resolveAssetSource(
        {
          provider: "test",
          providerReference: "https://evil.invalid/video.mp4",
          allowedHosts: ["example.com"],
        },
        {},
        {},
      ),
    ).rejects.toMatchObject({ code: "SOURCE_HOST_BLOCKED" });
  });
  it("accepts an exact provider-resolved ephemeral host", async () => {
    const source = await resolveAssetSource(
      { provider: "youtube_custom", allowedHosts: [] },
      {},
      {},
    );
    expect(source.allowedHosts).toEqual(["signed.googlevideo.com"]);
  });
  it("allows a trusted provider host only from an allowlisted reference", async () => {
    const source = await resolveAssetSource(
      {
        provider: "trusted_redirect",
        providerReference: "https://embed.example/video/1",
        allowedHosts: ["embed.example"],
      },
      {},
      {},
    );
    expect(source.allowedHosts).toEqual(["video.cdn.example"]);
  });
  it("rejects a trusted provider host when the reference host was not allowlisted", async () => {
    await expect(
      resolveAssetSource(
        {
          provider: "trusted_redirect",
          providerReference: "https://embed.example/video/1",
          allowedHosts: ["other.example"],
        },
        {},
        {},
      ),
    ).rejects.toMatchObject({ code: "SOURCE_HOST_BLOCKED" });
  });
});
