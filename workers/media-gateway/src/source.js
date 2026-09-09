import { securityError } from "./token.js";
import { youtubeCustomProvider } from "../../../providers/restricted/youtube-custom/src/index.js";

const SOURCE_CACHE_VERSION = "v3";

function sourceKey(claims, assetId) {
  return `source:${SOURCE_CACHE_VERSION}:${claims.tid}:${assetId}:${claims.psid}`;
}

function proofKey(claims, assetId) {
  return `provider-proof:${SOURCE_CACHE_VERSION}:${claims.psid}:${assetId}`;
}

async function fetchSourceDescriptor(env, claims, assetId) {
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
  return response.json();
}

export async function getAllowedOrigins(env, claims, assetId) {
  const key = `source-origins:${SOURCE_CACHE_VERSION}:${claims.tid}:${assetId}`;
  const cached = await env.SOURCE_CACHE.get(key, "json");
  if (cached) return cached;
  const data = await fetchSourceDescriptor(env, claims, assetId);
  const origins = data.allowedOrigins || [];
  await env.SOURCE_CACHE.put(key, JSON.stringify(origins), { expirationTtl: 300 });
  return origins;
}

export async function getSource(env, claims, assetId, forceRefresh = false, providerProof = null) {
  const key = sourceKey(claims, assetId);
  if (providerProof)
    await env.SOURCE_CACHE.put(proofKey(claims, assetId), JSON.stringify(providerProof), {
      expirationTtl: 8 * 3600,
    });
  if (!forceRefresh) {
    const cached = await env.SOURCE_CACHE.get(key, "json");
    if (cached && (!cached.expiresAt || Date.parse(cached.expiresAt) > Date.now() + 5000))
      return cached;
  }
  const data = await fetchSourceDescriptor(env, claims, assetId);
  let source = data.source;
  if (source?.resolver === "youtube_custom") {
    try {
      const proof =
        providerProof || (await env.SOURCE_CACHE.get(proofKey(claims, assetId), "json"));
      source = await youtubeCustomProvider.resolve({
        asset: { providerReference: source.providerReference },
        context: { providerProof: proof },
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          component: "youtube-resolver",
          assetId,
          sessionId: claims.psid,
          code: error?.code || "YOUTUBE_RESOLVE_FAILED",
          status: Number(error?.status || 502),
          message: error?.message || "YouTube resolution failed",
        }),
      );
      throw securityError("SOURCE_RESOLUTION_FAILED", 502, "Media source unavailable");
    }
  }
  const configuredTtl = Math.max(
    10,
    Math.min(Number(source?.cacheTtlSeconds || 60), 6 * 3600),
  );
  const signedUrlTtl = source?.expiresAt
    ? Math.floor((Date.parse(source.expiresAt) - Date.now()) / 1000) - 30
    : 0;
  const ttl = Math.max(
    60,
    Math.min(signedUrlTtl > 0 ? signedUrlTtl : configuredTtl, 6 * 3600),
  );
  const result = { ...source, allowedOrigins: data.allowedOrigins || [] };
  // A manifest contains byte ranges for one exact resolved source. Never leave an
  // older manifest alive after replacing that source.
  await env.SOURCE_CACHE.delete(`protected:manifest:${claims.psid}:${assetId}`);
  await env.SOURCE_CACHE.put(key, JSON.stringify(result), { expirationTtl: ttl });
  return result;
}

export async function invalidateSource(env, claims, assetId) {
  await Promise.all([
    env.SOURCE_CACHE.delete(sourceKey(claims, assetId)),
    env.SOURCE_CACHE.delete(`source:${claims.tid}:${assetId}`),
  ]);
}

export async function getHlsObject(env, assetId, objectId) {
  return env.SOURCE_CACHE.get(`hls:${assetId}:${objectId}`, "json");
}

export async function putHlsObject(env, assetId, objectId, value, ttl = 300) {
  await env.SOURCE_CACHE.put(`hls:${assetId}:${objectId}`, JSON.stringify(value), {
    expirationTtl: Math.max(60, Math.min(ttl, 3600)),
  });
}
