const BUNNY_EMBED_HOST = "iframe.mediadelivery.net";
const MAX_EMBED_HTML_BYTES = 256 * 1024;

function providerError(code, message, status = 502) {
  return Object.assign(new Error(message), { code, status });
}

function embedIdentity(url) {
  if (url.hostname !== BUNNY_EMBED_HOST) return null;
  const match = /^\/embed\/(\d+)\/([0-9a-f-]{36})\/?$/i.exec(url.pathname);
  return match ? { libraryId: match[1], videoId: match[2].toLowerCase() } : null;
}

export async function resolveBunnyEmbed(reference, fetchImpl = globalThis.fetch) {
  const embedUrl = new URL(reference);
  const identity = embedIdentity(embedUrl);
  if (!identity) throw providerError("BUNNY_EMBED_INVALID", "Invalid Bunny Stream embed URL", 400);

  const response = await fetchImpl(embedUrl, {
    redirect: "error",
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok)
    throw providerError("BUNNY_EMBED_UNAVAILABLE", "Bunny Stream embed is unavailable");
  const contentType = response.headers.get("content-type") || "";
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (!contentType.toLowerCase().includes("text/html"))
    throw providerError("BUNNY_EMBED_INVALID", "Bunny Stream embed did not return HTML");
  if (contentLength > MAX_EMBED_HTML_BYTES)
    throw providerError("BUNNY_EMBED_TOO_LARGE", "Bunny Stream embed response is too large");

  const html = await response.text();
  if (new TextEncoder().encode(html).byteLength > MAX_EMBED_HTML_BYTES)
    throw providerError("BUNNY_EMBED_TOO_LARGE", "Bunny Stream embed response is too large");
  const escapedVideoId = identity.videoId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const playlistMatch = html.match(
    new RegExp(
      `https://[a-z0-9.-]+\\.b-cdn\\.net/${escapedVideoId}/playlist\\.m3u8(?:[?][^"'\\s<]*)?`,
      "i",
    ),
  );
  if (!playlistMatch)
    throw providerError("BUNNY_PLAYLIST_NOT_FOUND", "Bunny Stream playlist was not found");
  const playlistUrl = new URL(playlistMatch[0].replaceAll("&amp;", "&"));
  if (!playlistUrl.hostname.endsWith(".b-cdn.net"))
    throw providerError("BUNNY_PLAYLIST_INVALID", "Bunny Stream playlist host is invalid");
  return { embedUrl, playlistUrl };
}

export const bunnyProvider = {
  name: "bunny",
  async resolve({ asset, providerConfig, context }) {
    // providerReference is a customer-authorized Bunny pull-zone/origin URL.
    // Private credentials remain encrypted in the control plane and can be forwarded as origin headers.
    const referenceUrl = new URL(asset.providerReference);
    const embed = embedIdentity(referenceUrl)
      ? await resolveBunnyEmbed(referenceUrl, context?.fetch || globalThis.fetch)
      : null;
    const url = embed?.playlistUrl || referenceUrl;
    const headers = {
      ...(embed ? { Referer: `${embed.embedUrl.origin}/` } : {}),
      ...(providerConfig.accessKey ? { AccessKey: providerConfig.accessKey } : {}),
      ...(providerConfig.headers || {}),
    };
    return {
      url: url.toString(),
      headers,
      ...(embed ? { allowedHosts: [url.hostname.toLowerCase()], trustedResolvedHosts: true } : {}),
      supportsRange: true,
      manifestType:
        providerConfig.manifestType ||
        (url.pathname.toLowerCase().endsWith(".m3u8") ? "hls" : null),
      cacheTtlSeconds: Number(providerConfig.cacheTtlSeconds || 120),
    };
  },
};
