import { rewriteHlsManifest } from "./hls.js";
import { getHlsObject, getSource, invalidateSource } from "./source.js";
import { securityError } from "./token.js";
import { fetchOriginWithRedirects } from "./origin-fetch.js";
import { reserveDeliveryQuota } from "./quota.js";

const COPY_REQUEST_HEADERS = ["range", "if-none-match", "if-modified-since", "accept"];
const COPY_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "cache-control",
  "content-encoding",
];

export function assertOrigin(request, allowedOrigins, env) {
  const origin = request.headers.get("origin");
  if (!origin && env.REQUIRE_ORIGIN !== "true") return;
  if (!origin) throw securityError("DOMAIN_MISMATCH", 403);
  let hostname;
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    throw securityError("DOMAIN_MISMATCH", 403);
  }
  const allowed = (allowedOrigins || []).map((v) => String(v).toLowerCase());
  if (!allowed.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)))
    throw securityError("DOMAIN_MISMATCH", 403);
}

function buildHeaders(request, sourceHeaders = {}) {
  const headers = new Headers();
  for (const name of COPY_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  for (const [name, value] of Object.entries(sourceHeaders || {})) {
    const lower = name.toLowerCase();
    if (["host", "connection", "content-length"].includes(lower)) continue;
    headers.set(name, String(value));
  }
  return headers;
}

async function originFetch(request, url, source) {
  const range = request.headers.get("range");
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))
    throw securityError("INVALID_RANGE", 416, "Unsupported byte range");
  const result = await fetchOriginWithRedirects(
    url,
    {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: buildHeaders(request, source.headers),
      cf: {
        cacheEverything: !request.headers.has("range"),
        cacheTtl: Math.max(0, Math.min(Number(source.cacheTtlSeconds || 0), 300)),
      },
    },
    source.allowedHosts,
  );
  const { response } = result;
  if (!response.ok && ![304, 401, 403, 404, 416].includes(response.status)) {
    await response.body?.cancel();
    const error = securityError("ORIGIN_FAILURE", 502, "Media source unavailable");
    error.upstreamStatus = response.status;
    throw error;
  }
  return result;
}

function copyResponseHeaders(origin, requestOrigin) {
  const headers = new Headers();
  for (const name of COPY_RESPONSE_HEADERS) {
    const value = origin.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  if (requestOrigin) {
    headers.set("Access-Control-Allow-Origin", requestOrigin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  return headers;
}

export function looksLikeHls(url, response, source) {
  const type = response.headers.get("content-type") || "";
  return (
    source.manifestType === "hls" || url.toLowerCase().includes(".m3u8") || type.includes("mpegurl")
  );
}

export async function proxyPrimary(request, env, claims, assetId) {
  let source = await getSource(env, claims, assetId);
  assertOrigin(request, source.allowedOrigins, env);
  if (
    claims.features?.protectedDelivery !== false &&
    source.delivery?.mode === "protected_segments"
  )
    throw securityError("NATIVE_DELIVERY_DISABLED", 403, "Use the protected playback runtime");
  if (claims.features?.protectedDelivery !== false && source.manifestType === "hls")
    throw securityError("NATIVE_DELIVERY_DISABLED", 403, "Use the protected HLS runtime");
  let origin = await originFetch(request, source.url, source);
  if ([401, 403, 404].includes(origin.response.status)) {
    await invalidateSource(env, claims, assetId);
    source = await getSource(env, claims, assetId, true);
    assertOrigin(request, source.allowedOrigins, env);
    origin = await originFetch(request, source.url, source);
  }
  return finalize(request, origin.response, origin.resolvedUrl, source, assetId, env, claims);
}

export async function proxyHlsObject(request, env, claims, assetId, objectId) {
  const mapped = await getHlsObject(env, assetId, objectId);
  if (!mapped?.url)
    throw securityError("HLS_OBJECT_EXPIRED", 410, "Media object expired; refresh playback");
  if (mapped.protectedTransport)
    throw securityError("NATIVE_DELIVERY_DISABLED", 403, "Use the protected HLS runtime");
  assertOrigin(request, mapped.allowedOrigins, env);
  const origin = await originFetch(request, mapped.url, mapped);
  return finalize(request, origin.response, origin.resolvedUrl, mapped, assetId, env, claims);
}

export async function protectedHlsResource(request, env, claims, assetId, resourceId) {
  const source = await getSource(env, claims, assetId);
  if (source.manifestType !== "hls")
    throw securityError("PROTECTED_HLS_UNAVAILABLE", 409, "Protected HLS unavailable");
  const mapped = resourceId === "root" ? source : await getHlsObject(env, assetId, resourceId);
  if (!mapped?.url)
    throw securityError("HLS_OBJECT_EXPIRED", 410, "Media object expired; reload playback");
  assertOrigin(request, mapped.allowedOrigins || source.allowedOrigins, env);
  const origin = await originFetch(request, mapped.url, mapped);
  const response = origin.response;
  if (!response.ok) {
    await response.body?.cancel();
    const error = securityError("ORIGIN_FAILURE", 502, "Media source unavailable");
    error.upstreamStatus = response.status;
    throw error;
  }
  const type = response.headers.get("content-type") || "";
  if (looksLikeHls(origin.resolvedUrl, response, resourceId === "root" ? source : mapped)) {
    const text = await response.text();
    const body = new TextEncoder().encode(
      await rewriteHlsManifest(text, origin.resolvedUrl, assetId, { ...source, ...mapped }, env),
    );
    await reserveDeliveryQuota(env, claims, body.byteLength);
    return {
      body,
      contentType: "application/vnd.apple.mpegurl",
    };
  }
  const body = await response.arrayBuffer();
  if (body.byteLength > 16 * 1024 * 1024)
    throw securityError("HLS_RESOURCE_TOO_LARGE", 413, "HLS segment exceeds 16 MB");
  await reserveDeliveryQuota(env, claims, body.byteLength);
  return { body, contentType: type || "application/octet-stream" };
}

async function finalize(request, response, sourceUrl, source, assetId, env, claims) {
  if ([401, 403, 404].includes(response.status)) {
    await response.body?.cancel();
    throw securityError("ORIGIN_FAILURE", 502, "Media source unavailable");
  }
  const requestOrigin = request.headers.get("origin");
  if (request.method !== "HEAD" && looksLikeHls(sourceUrl, response, source) && response.ok) {
    const text = await response.text();
    const rewritten = await rewriteHlsManifest(text, sourceUrl, assetId, source, env);
    const bytes = new TextEncoder().encode(rewritten).byteLength;
    await reserveDeliveryQuota(env, claims, bytes);
    const headers = copyResponseHeaders(response, requestOrigin);
    headers.set("content-type", "application/vnd.apple.mpegurl");
    headers.delete("content-length");
    headers.set("cache-control", "private, no-store");
    return new Response(rewritten, { status: response.status, headers });
  }
  const length = request.method === "HEAD" ? 0 : Number(response.headers.get("content-length") || 0);
  await reserveDeliveryQuota(env, claims, Number.isFinite(length) ? length : 0);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: copyResponseHeaders(response, requestOrigin),
  });
}
