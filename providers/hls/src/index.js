const VIDINFRA_PLAYER_HOST = "player.vidinfra.com";
const MAX_PLAYER_HTML_BYTES = 256 * 1024;

function providerError(code, message, status = 502) {
  return Object.assign(new Error(message), { code, status });
}

function vidinfraIdentity(url) {
  if (url.hostname !== VIDINFRA_PLAYER_HOST) return null;
  const match = /^\/([0-9a-f-]{36})\/[^/]+\/([0-9a-f-]{36})\/?$/i.exec(url.pathname);
  return match ? { libraryId: match[1].toLowerCase(), videoId: match[2].toLowerCase() } : null;
}

export async function resolveVidinfraPlayer(reference, fetchImpl = globalThis.fetch) {
  const playerUrl = new URL(reference);
  const identity = vidinfraIdentity(playerUrl);
  if (!identity) throw providerError("VIDINFRA_PLAYER_INVALID", "Invalid Vidinfra player URL", 400);
  const response = await fetchImpl(playerUrl, {
    redirect: "error",
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok)
    throw providerError("VIDINFRA_PLAYER_UNAVAILABLE", "Vidinfra player is unavailable");
  const contentType = response.headers.get("content-type") || "";
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (!contentType.toLowerCase().includes("text/html"))
    throw providerError("VIDINFRA_PLAYER_INVALID", "Vidinfra player did not return HTML");
  if (contentLength > MAX_PLAYER_HTML_BYTES)
    throw providerError("VIDINFRA_PLAYER_TOO_LARGE", "Vidinfra player response is too large");
  const html = await response.text();
  if (new TextEncoder().encode(html).byteLength > MAX_PLAYER_HTML_BYTES)
    throw providerError("VIDINFRA_PLAYER_TOO_LARGE", "Vidinfra player response is too large");
  const escapedVideoId = identity.videoId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const playlistMatch = html.match(
    new RegExp(`https://[a-z0-9.-]+/${escapedVideoId}/playlist\\.m3u8(?:[?][^"'\\s<]*)?`, "i"),
  );
  if (!playlistMatch)
    throw providerError("VIDINFRA_PLAYLIST_NOT_FOUND", "Vidinfra HLS playlist was not found");
  const playlistUrl = new URL(playlistMatch[0].replaceAll("&amp;", "&"));
  if (!playlistUrl.hostname.endsWith(".tenbytecdn.com"))
    throw providerError("VIDINFRA_PLAYLIST_INVALID", "Vidinfra playlist host is invalid");
  return { playerUrl, playlistUrl };
}

export const hlsProvider = {
  name: "hls",
  async resolve({ asset, providerConfig, context }) {
    const referenceUrl = new URL(asset.providerReference);
    const vidinfra = vidinfraIdentity(referenceUrl)
      ? await resolveVidinfraPlayer(referenceUrl, context?.fetch || globalThis.fetch)
      : null;
    const url = vidinfra?.playlistUrl || referenceUrl;
    return {
      url: url.toString(),
      headers: {
        ...(vidinfra ? { Referer: `${vidinfra.playerUrl.origin}/` } : {}),
        ...(providerConfig.headers || {}),
      },
      ...(vidinfra
        ? { allowedHosts: [url.hostname.toLowerCase()], trustedResolvedHosts: true }
        : {}),
      supportsRange: true,
      manifestType: "hls",
      contentType: "application/vnd.apple.mpegurl",
      cacheTtlSeconds: Number(providerConfig.cacheTtlSeconds || 60),
    };
  },
};
