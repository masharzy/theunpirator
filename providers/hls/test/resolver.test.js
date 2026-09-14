import { describe, expect, it, vi } from "vitest";
import { hlsProvider, resolveVidinfraPlayer } from "../src/index.js";

const player =
  "https://player.vidinfra.com/67ffe06f-ca94-4c8d-a450-6e7eee26a702/default/9605ba23-2be2-465a-acec-b4816b40c1ec";
const playlist =
  "https://qg6zdbwhse.tenbytecdn.com/9605ba23-2be2-465a-acec-b4816b40c1ec/playlist.m3u8";

describe("Vidinfra player resolver", () => {
  it("extracts the matching trusted HLS playlist", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(`<meta property="og:video" content="${playlist}">`, {
          status: 200,
          headers: { "content-type": "text/html; charset=UTF-8" },
        }),
    );
    const result = await resolveVidinfraPlayer(player, fetch);
    expect(result.playlistUrl.toString()).toBe(playlist);
    const source = await hlsProvider.resolve({
      asset: { providerReference: player },
      providerConfig: {},
      context: { fetch },
    });
    expect(source).toMatchObject({
      url: playlist,
      manifestType: "hls",
      allowedHosts: ["qg6zdbwhse.tenbytecdn.com"],
      trustedResolvedHosts: true,
    });
  });

  it("rejects a playlist whose video id does not match", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          '<meta property="og:video" content="https://evil.tenbytecdn.com/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/playlist.m3u8">',
          { status: 200, headers: { "content-type": "text/html" } },
        ),
    );
    await expect(resolveVidinfraPlayer(player, fetch)).rejects.toMatchObject({
      code: "VIDINFRA_PLAYLIST_NOT_FOUND",
    });
  });
});
