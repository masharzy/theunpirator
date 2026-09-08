import { afterEach, describe, expect, it, vi } from "vitest";
import { extractYoutubeVideoId, youtubeCustomProvider } from "../src/index.js";

afterEach(() => vi.unstubAllGlobals());

describe("YouTube custom resolver", () => {
  it("accepts watch, short and embed URLs", () => {
    expect(extractYoutubeVideoId("https://youtu.be/abc123DEF45")).toBe("abc123DEF45");
    expect(extractYoutubeVideoId("https://youtube.com/shorts/abc123DEF45")).toBe("abc123DEF45");
    expect(extractYoutubeVideoId("https://example.com/watch?v=abc123DEF45")).toBeNull();
  });

  it("returns only an exact signed GoogleVideo source host", async () => {
    const sourceUrl =
      "https://r1---sn-test.googlevideo.com/videoplayback?expire=9999999999&signature=signed";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response('{"visitorData":"visitor-1"}'))
        .mockResolvedValueOnce(
          Response.json({
            playabilityStatus: { status: "OK" },
            videoDetails: { title: "Authorized lesson" },
            streamingData: {
              formats: [
                {
                  url: sourceUrl,
                  mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
                  height: 360,
                  bitrate: 500000,
                  qualityLabel: "360p",
                },
                {
                  url: "https://evil.example/video.mp4",
                  mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
                  height: 720,
                },
              ],
            },
          }),
        ),
    );

    const source = await youtubeCustomProvider.resolve({
      asset: { providerReference: "https://www.youtube.com/watch?v=abc123DEF45" },
    });
    expect(source.url).toBe(sourceUrl);
    expect(source.allowedHosts).toEqual(["r1---sn-test.googlevideo.com"]);
    expect(source.metadata).toMatchObject({ title: "Authorized lesson", height: 360 });
  });
});
