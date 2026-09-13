import { describe, expect, it, vi } from "vitest";
import { bunnyProvider, resolveBunnyEmbed } from "../src/index.js";

const embedUrl =
  "https://iframe.mediadelivery.net/embed/570152/1f61fa07-4d51-4476-9475-e3844bf2e196";
const playlistUrl =
  "https://vz-f04b6416-650.b-cdn.net/1f61fa07-4d51-4476-9475-e3844bf2e196/playlist.m3u8";

describe("Bunny Stream embed resolution", () => {
  it("extracts the matching Bunny CDN playlist", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(`<video><source src="${playlistUrl}"></video>`, {
          headers: { "content-type": "text/html" },
        }),
    );
    const resolved = await resolveBunnyEmbed(embedUrl, fetch);
    expect(resolved.playlistUrl.toString()).toBe(playlistUrl);
    expect(fetch).toHaveBeenCalledWith(
      new URL(embedUrl),
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("returns protected HLS metadata and server-only Referer", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(`<source src="${playlistUrl}">`, {
          headers: { "content-type": "text/html" },
        }),
    );
    const source = await bunnyProvider.resolve({
      asset: { providerReference: embedUrl },
      providerConfig: {},
      context: { fetch },
    });
    expect(source).toMatchObject({
      url: playlistUrl,
      manifestType: "hls",
      allowedHosts: ["vz-f04b6416-650.b-cdn.net"],
      trustedResolvedHosts: true,
      headers: { Referer: "https://iframe.mediadelivery.net/" },
    });
  });

  it("rejects a playlist on an unrelated host", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          '<source src="https://evil.example/1f61fa07-4d51-4476-9475-e3844bf2e196/playlist.m3u8">',
          { headers: { "content-type": "text/html" } },
        ),
    );
    await expect(resolveBunnyEmbed(embedUrl, fetch)).rejects.toMatchObject({
      code: "BUNNY_PLAYLIST_NOT_FOUND",
    });
  });
});
