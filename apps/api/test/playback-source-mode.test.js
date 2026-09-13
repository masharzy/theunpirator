import { describe, expect, it } from "vitest";
import { isHlsAsset } from "../src/services/playback.js";

describe("protected source mode", () => {
  it.each([
    [{ provider: "hls", providerReference: "https://cdn.example/live" }, true],
    [{ provider: "bunny", providerReference: "https://cdn.example/video.m3u8?token=x" }, true],
    [
      {
        provider: "bunny",
        providerReference:
          "https://iframe.mediadelivery.net/embed/570152/1f61fa07-4d51-4476-9475-e3844bf2e196",
      },
      true,
    ],
    [
      {
        provider: "bunny",
        providerReference:
          "https://iframe.mediadelivery.net/embed/570152/not-a-valid-video-identifier",
      },
      false,
    ],
    [{ provider: "s3", providerReference: "bucket/video.M3U8" }, true],
    [{ provider: "direct", providerReference: "https://cdn.example/video.m3u8" }, false],
    [{ provider: "direct", providerReference: "https://cdn.example/video.mp4" }, false],
  ])("classifies %o", (asset, expected) => {
    expect(isHlsAsset(asset)).toBe(expected);
  });
});
