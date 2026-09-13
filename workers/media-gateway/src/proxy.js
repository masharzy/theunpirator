import { rewriteHlsManifest } from "./hls.js";
import { getHlsObject, getSource, invalidateSource } from "./source.js";
import { securityError } from "./token.js";
import { assertSourceUrl } from "./origin-policy.js";

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
  assertSourceUrl(url, source.allowedHosts);
  const range = request.headers.get("range");
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))
    throw securityError("INVALID_RANGE", 416, "Unsupported byte range");
  const response = await fetch(url, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers: buildHeaders(request, source.headers),
    redirect: "manual",
    cf: {
      cacheEverything: !request.headers.has("range"),
      cacheTtl: Math.max(0, Math.min(Number(source.cacheTtlSeconds || 0), 300)),
    },
  });
  if (response.status >= 300 && response.status < 400 && response.status !== 304) {
    await response.body?.cancel();
    throw securityError("ORIGIN_REDIRECT_BLOCKED", 502, "Media source unavailable");
  }
  if (!response.ok && ![304, 401, 403, 404, 416].includes(response.status)) {
    await response.body?.cancel();
    throw securityError("ORIGIN_FAILURE", 502, "Media source unavailable");
  }
  return response;
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

function looksLikeHls(url, response, source) {
  const type = response.headers.get("content-type") || "";
  return (
    source.manifestType === "hls" || url.toLowerCase().includes(".m3u8") || type.includes("mpegurl")
  );
}

export async function proxyPrimary(request, env, claims, assetId) {
  let source = await getSource(env, claims, assetId);
  assertOrigin(request, source.allowedOrigins, env);
  if (source.delivery?.mode === "protected_segments")
    throw securityError("NATIVE_DELIVERY_DISABLED", 403, "Use the protected playback runtime");
  if (source.manifestType === "hls")
    throw securityError("NATIVE_DELIVERY_DISABLED", 403, "Use the protected HLS runtime");
  let response = await originFetch(request, source.url, source);
  if ([401, 403, 404].includes(response.status)) {
    await invalidateSource(env, claims, assetId);
    source = await getSource(env, claims, assetId, true);
    assertOrigin(request, source.allowedOrigins, env);
    response = await originFetch(request, source.url, source);
  }
  return finalize(request, response, source.url, source, assetId, env);
}

export async function proxyHlsObject(request, env, claims, assetId, objectId) {
  const mapped = await getHlsObject(env, assetId, objectId);
  if (!mapped?.url)
    throw securityError("HLS_OBJECT_EXPIRED", 410, "Media object expired; refresh playback");
  if (mapped.protectedTransport)
    throw securityError("NATIVE_DELIVERY_DISABLED", 403, "Use the protected HLS runtime");
  assertOrigin(request, mapped.allowedOrigins, env);
  const response = await originFetch(request, mapped.url, mapped);
  return finalize(request, response, mapped.url, mapped, assetId, env);
}

export async function protectedHlsResource(request, env, claims, assetId, resourceId) {
  const source = await getSource(env, claims, assetId);
  if (source.manifestType !== "hls")
    throw securityError("PROTECTED_HLS_UNAVAILABLE", 409, "Protected HLS unavailable");
  const mapped = resourceId === "root" ? source : await getHlsObject(env, assetId, resourceId);
  if (!mapped?.url)
    throw securityError("HLS_OBJECT_EXPIRED", 410, "Media object expired; reload playback");
  assertOrigin(request, mapped.allowedOrigins || source.allowedOrigins, env);
  const response = await originFetch(request, mapped.url, mapped);
  if (!response.ok) {
    await response.body?.cancel();
    throw securityError("ORIGIN_FAILURE", 502, "Media source unavailable");
  }
  const type = response.headers.get("content-type") || "";
  if (looksLikeHls(mapped.url, response, { ...source, ...mapped })) {
    const text = await response.text();
    return {
      body: new TextEncoder().encode(
        await rewriteHlsManifest(text, mapped.url, assetId, { ...source, ...mapped }, env),
      ),
      contentType: "application/vnd.apple.mpegurl",
    };
  }
  const body = await response.arrayBuffer();
  if (body.byteLength > 16 * 1024 * 1024)
    throw securityError("HLS_RESOURCE_TOO_LARGE", 413, "HLS segment exceeds 16 MB");
  return { body, contentType: type || "application/octet-stream" };
}

async function finalize(request, response, sourceUrl, source, assetId, env) {
  if ([401, 403, 404].includes(response.status)) {
    await response.body?.cancel();
    throw securityError("ORIGIN_FAILURE", 502, "Media source unavailable");
  }
  const requestOrigin = request.headers.get("origin");
  if (request.method !== "HEAD" && looksLikeHls(sourceUrl, response, source) && response.ok) {
    const text = await response.text();
    const rewritten = await rewriteHlsManifest(text, sourceUrl, assetId, source, env);
    const headers = copyResponseHeaders(response, requestOrigin);
    headers.set("content-type", "application/vnd.apple.mpegurl");
    headers.delete("content-length");
    headers.set("cache-control", "private, no-store");
    return new Response(rewritten, { status: response.status, headers });
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: copyResponseHeaders(response, requestOrigin),
  });
}
