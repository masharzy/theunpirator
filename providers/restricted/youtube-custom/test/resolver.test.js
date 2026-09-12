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
        .mockResolvedValueOnce(
          new Response('{"visitorData":"visitor-1","INNERTUBE_API_KEY":"test-key","STS":20697}'),
        )
        .mockResolvedValueOnce(
          Response.json({
            playabilityStatus: { status: "OK" },
            videoDetails: { title: "Authorized lesson" },
            streamingData: {
              adaptiveFormats: [
                {
                  url: sourceUrl,
                  mimeType: 'video/mp4; codecs="avc1.42001E"',
                  height: 720,
                  width: 1280,
                  bitrate: 1500000,
                  qualityLabel: "720p",
                  contentLength: "1000000",
                  approxDurationMs: "60000",
                  initRange: { start: "0", end: "739" },
                  indexRange: { start: "740", end: "999" },
                },
                {
                  url: sourceUrl.replace("videoplayback", "audioplayback"),
                  mimeType: 'audio/mp4; codecs="mp4a.40.2"',
                  bitrate: 128000,
                  contentLength: "100000",
                  approxDurationMs: "60000",
                  initRange: { start: "0", end: "719" },
                  indexRange: { start: "720", end: "899" },
                },
              ],
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
        )
        .mockResolvedValueOnce(new Response(new Uint8Array(), { status: 206 }))
        .mockResolvedValueOnce(new Response(new Uint8Array(), { status: 206 }))
        .mockResolvedValueOnce(new Response(new Uint8Array(), { status: 206 }))
        .mockResolvedValueOnce(new Response(new Uint8Array(), { status: 206 })),
    );

    const source = await youtubeCustomProvider.resolve({
      asset: { providerReference: "https://www.youtube.com/watch?v=abc123DEF45" },
      context: {
        providerProof: {
          type: "youtube_web",
          contentBinding: "abc123DEF45",
          token: "A".repeat(80),
        },
      },
    });
    expect(source.url).toBeNull();
    expect(source.allowedHosts).toEqual(["r1---sn-test.googlevideo.com"]);
    expect(source.delivery.mode).toBe("protected_segments");
    expect(source.delivery.streams.video[0].url).toMatch(/[?&]cpn=[A-Za-z0-9_-]{16}/);
    expect(source.delivery.streams.video[0]).toMatchObject({ height: 720, codec: "avc1.42001E" });
    expect(source.delivery.streams.audio[0]).toMatchObject({ codec: "mp4a.40.2" });
    expect(source.metadata).toMatchObject({ title: "Authorized lesson", height: 720 });
  });

  it("rejects a client that serves index bytes but denies later media", async () => {
    const probes = [];
    let inFlight = 0;
    let maxInFlight = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input, init) => {
        const url = new URL(input);
        if (url.pathname === "/watch")
          return new Response(
            '{"visitorData":"visitor-1","INNERTUBE_API_KEY":"test-key","STS":20697}',
          );
        if (url.pathname.endsWith("/player")) {
          const profile = JSON.parse(init.body).context.client.clientName;
          return Response.json({
            playabilityStatus: { status: "OK" },
            streamingData: {
              adaptiveFormats: ["video", "audio"].map((track) => ({
                url: `https://r1.googlevideo.com/videoplayback?profile=${profile}&track=${track}`,
                mimeType:
                  track === "video"
                    ? 'video/mp4; codecs="avc1.42001E"'
                    : 'audio/mp4; codecs="mp4a.40.2"',
                contentLength: "20000000",
                height: track === "video" ? 720 : undefined,
                initRange: { start: "0", end: "739" },
                indexRange: { start: "740", end: "999" },
              })),
            },
          });
        }
        const profile = url.searchParams.get("profile");
        const range = init.headers.range;
        probes.push({ profile, range });
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return new Response(null, {
          status: range === "bytes=740-999" || profile === "VISIONOS" ? 206 : 403,
        });
      }),
    );
    const source = await youtubeCustomProvider.resolve({
      asset: { providerReference: "https://youtube.com/watch?v=abc123DEF45" },
      context: {
        providerProof: {
          type: "youtube_web",
          contentBinding: "abc123DEF45",
          token: "A".repeat(80),
        },
      },
    });
    expect(source.delivery.streams.video[0].profile).toBe("VISIONOS");
    expect(maxInFlight).toBe(4);
    expect(probes).toContainEqual({ profile: "MWEB", range: "bytes=15000000-15001023" });
    expect(probes).toContainEqual({ profile: "IOS", range: "bytes=15000000-15001023" });
    expect(probes).toContainEqual({ profile: "VISIONOS", range: "bytes=15000000-15001023" });
  });
});
