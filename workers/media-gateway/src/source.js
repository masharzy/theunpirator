import { securityError } from "./token.js";
import { youtubeCustomProvider } from "../../../providers/restricted/youtube-custom/src/index.js";

export async function getSource(env, claims, assetId, forceRefresh = false) {
  const key = `source:${claims.tid}:${assetId}`;
  if (!forceRefresh) {
    const cached = await env.SOURCE_CACHE.get(key, "json");
    if (cached && (!cached.expiresAt || Date.parse(cached.expiresAt) > Date.now() + 5000))
      return cached;
  }
  const response = await fetch(
    `${env.INTERNAL_API_URL}/internal/media/resolve/${encodeURIComponent(assetId)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.GATEWAY_INTERNAL_SECRET}`,
      },
      body: JSON.stringify({ tenantId: claims.tid, sessionId: claims.psid }),
    },
  );
  if (!response.ok)
    throw securityError(
      "SOURCE_RESOLUTION_FAILED",
      response.status >= 500 ? 502 : 403,
      "Media source unavailable",
    );
  const data = await response.json();
  let source = data.source;
  if (source?.resolver === "youtube_custom") {
    try {
      source = await youtubeCustomProvider.resolve({
        asset: { providerReference: source.providerReference },
      });
    } catch {
      throw securityError("SOURCE_RESOLUTION_FAILED", 502, "Media source unavailable");
    }
  }
  const ttl = Math.max(10, Math.min(Number(source?.cacheTtlSeconds || 60), 300));
  const result = { ...source, allowedOrigins: data.allowedOrigins || [] };
  await env.SOURCE_CACHE.put(key, JSON.stringify(result), { expirationTtl: Math.max(60, ttl) });
  return result;
}

export async function invalidateSource(env, claims, assetId) {
  await env.SOURCE_CACHE.delete(`source:${claims.tid}:${assetId}`);
}

export async function getHlsObject(env, assetId, objectId) {
  return env.SOURCE_CACHE.get(`hls:${assetId}:${objectId}`, "json");
}

export async function putHlsObject(env, assetId, objectId, value, ttl = 300) {
  await env.SOURCE_CACHE.put(`hls:${assetId}:${objectId}`, JSON.stringify(value), {
    expirationTtl: Math.max(60, Math.min(ttl, 3600)),
  });
}
