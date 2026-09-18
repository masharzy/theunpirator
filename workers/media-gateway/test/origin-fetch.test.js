import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOriginWithRedirects } from "../src/origin-fetch.js";

afterEach(() => vi.unstubAllGlobals());

describe("validated origin redirects", () => {
  it("follows a redirect only when the target host is explicitly allowed", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example.com/video.mp4" },
        }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 206 }));

    vi.stubGlobal("fetch", fetcher);

    const result = await fetchOriginWithRedirects(
      "https://media.example.com/video.mp4",
      { headers: new Headers({ range: "bytes=0-3" }) },
      ["media.example.com", "cdn.example.com"],
    );

    expect(result.response.status).toBe(206);
    expect(result.resolvedUrl).toBe("https://cdn.example.com/video.mp4");
    expect(result.redirects).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].headers.get("range")).toBe("bytes=0-3");
  });

  it("blocks redirects to private or unapproved hosts", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/admin" },
        }),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      fetchOriginWithRedirects("https://media.example.com/video.mp4", {}, ["media.example.com"]),
    ).rejects.toMatchObject({
      code: "ORIGIN_REDIRECT_BLOCKED",
      status: 502,
      upstreamStatus: 302,
    });

    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("fails closed after the redirect limit", async () => {
    const fetcher = vi.fn(async (url) => {
      const current = new URL(url);
      const step = Number(current.searchParams.get("step") || 0);
      return new Response(null, {
        status: 302,
        headers: {
          location: `https://media.example.com/video.mp4?step=${step + 1}`,
        },
      });
    });
    vi.stubGlobal("fetch", fetcher);

    await expect(
      fetchOriginWithRedirects("https://media.example.com/video.mp4", {}, ["media.example.com"], {
        maxRedirects: 2,
      }),
    ).rejects.toMatchObject({
      code: "ORIGIN_REDIRECT_LIMIT",
      status: 502,
      upstreamStatus: 302,
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
