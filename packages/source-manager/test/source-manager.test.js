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
});
