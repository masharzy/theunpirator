export { SessionState } from "./session-state.js";
import { verifyPlaybackToken, securityError } from "./token.js";
import { proxyHlsObject, proxyPrimary } from "./proxy.js";
import { emitTelemetry } from "./telemetry.js";

function jsonError(error, requestId) {
  const status = Number(error.status || 500);
  return Response.json(
    {
      error: {
        code: error.code || "GATEWAY_ERROR",
        message: status >= 500 ? "Media gateway error" : error.message,
        requestId,
      },
    },
    { status, headers: { "cache-control": "no-store" } },
  );
}
function requestId(request) {
  return request.headers.get("x-request-id") || crypto.randomUUID();
}
function readToken(request, url) {
  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  const query = url.searchParams.get("token");
  if (query) return query;
  const cookie = request.headers.get("cookie") || "";
  const match = /(?:^|;\s*)ap_playback=([^;]+)/.exec(cookie);
  return match ? decodeURIComponent(match[1]) : url.searchParams.get("token") || "";
}
function playbackCookie(token, assetId, maxAge) {
  return `ap_playback=${encodeURIComponent(token)}; Path=/v/${assetId}; Max-Age=${Math.max(30, Number(maxAge || 90))}; HttpOnly; Secure; SameSite=None`;
}
async function sessionStub(env, sessionId) {
  return env.SESSION_STATE.get(env.SESSION_STATE.idFromName(sessionId));
}
async function assertSession(env, claims) {
  const stub = await sessionStub(env, claims.psid);
  const response = await stub.fetch("https://session/state");
  const data = await response.json();
  if (data.status === "revoked" || data.status === "blocked")
    throw securityError("SESSION_REVOKED", 403, "Playback session ended");
  if (data.status === "unknown" && env.REQUIRE_SESSION_STATE === "true")
    throw securityError("SESSION_UNKNOWN", 403, "Playback session unavailable");
}
function corsHeaders(request) {
  const origin = request.headers.get("origin");
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
        "Access-Control-Allow-Credentials": "true",
      }
    : {};
}
function corsPreflight(request) {
  const origin = request.headers.get("origin") || "*";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS,POST",
      "Access-Control-Allow-Headers": "authorization,range,content-type,x-request-id",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const rid = requestId(request);
    const url = new URL(request.url);
    let currentClaims = null;
    if (request.method === "OPTIONS") return corsPreflight(request);
    try {
      if (url.pathname === "/health")
        return Response.json(
          { status: "ok", service: "media-gateway" },
          { headers: { "x-request-id": rid } },
        );
      if (url.pathname === "/__internal/session-state") {
        if (
          request.method !== "POST" ||
          request.headers.get("authorization") !== `Bearer ${env.GATEWAY_CONTROL_SECRET}`
        )
          throw securityError("UNAUTHORIZED", 401);
        const body = await request.json();
        if (!body.sessionId || !["active", "revoked", "blocked"].includes(body.status))
          throw securityError("INVALID_REQUEST", 400);
        const stub = await sessionStub(env, body.sessionId);
        await stub.fetch("https://session/state", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: body.status, ttlSeconds: body.ttlSeconds }),
        });
        return new Response(null, { status: 204 });
      }
      const match = /^\/v\/([0-9a-fA-F-]{36})\/(media|refresh|hls\/([a-f0-9]{40}))$/.exec(
        url.pathname,
      );
      if (!match || !["GET", "HEAD", "POST"].includes(request.method))
        throw securityError("NOT_FOUND", 404, "Media route not found");
      const [, assetId, mode, objectId] = match;
      const token = readToken(request, url);
      const claims = await verifyPlaybackToken(token, env);
      currentClaims = claims;
      if (claims.aid !== assetId) throw securityError("ASSET_TOKEN_MISMATCH", 403);
      await assertSession(env, claims);
      if (request.method === "POST" && mode === "refresh") {
        const response = await fetch(`${env.INTERNAL_API_URL}/internal/playback/refresh`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${env.GATEWAY_INTERNAL_SECRET}`,
          },
          body: JSON.stringify({
            tenantId: claims.tid,
            sessionId: claims.psid,
            assetId: claims.aid,
            siteId: claims.sid,
            userId: claims.uid,
            deviceId: claims.did,
            policy: claims.policy,
          }),
        });
        if (!response.ok)
          throw securityError(
            "TOKEN_REFRESH_FAILED",
            response.status >= 500 ? 502 : 403,
            "Playback session cannot be refreshed",
          );
        const data = await response.json();
        return Response.json(data, {
          status: response.status,
          headers: {
            "cache-control": "no-store",
            "x-request-id": rid,
            "set-cookie": playbackCookie(data.token, assetId, data.tokenExpiresIn),
            ...corsHeaders(request),
          },
        });
      }
      if (mode === "refresh") throw securityError("METHOD_NOT_ALLOWED", 405);
      if (request.method === "POST" && mode === "media") {
        emitTelemetry(ctx, env, [
          {
            kind: "usage",
            tenantId: claims.tid,
            siteId: claims.sid,
            assetId,
            sessionId: claims.psid,
            type: "playback_heartbeat",
            quantity: 1,
          },
        ]);
        return Response.json(
          { status: "active", exp: claims.exp },
          {
            headers: { "cache-control": "no-store", "x-request-id": rid, ...corsHeaders(request) },
          },
        );
      }
      const response = objectId
        ? await proxyHlsObject(request, env, claims, assetId, objectId)
        : await proxyPrimary(request, env, claims, assetId);
      response.headers.set("x-request-id", rid);
      response.headers.set(
        "set-cookie",
        playbackCookie(token, assetId, Math.max(60, claims.exp - Math.floor(Date.now() / 1000))),
      );
      const length = Number(response.headers.get("content-length") || 0);
      emitTelemetry(ctx, env, [
        {
          kind: "usage",
          tenantId: claims.tid,
          siteId: claims.sid,
          assetId,
          sessionId: claims.psid,
          type: "gateway_requests",
          quantity: 1,
          metadata: { status: response.status, bytes: Number.isFinite(length) ? length : 0 },
        },
      ]);
      return response;
    } catch (error) {
      emitTelemetry(
        ctx,
        env,
        error?.code
          ? [
              {
                kind: "security",
                tenantId: currentClaims?.tid || null,
                siteId: currentClaims?.sid || null,
                assetId: currentClaims?.aid || null,
                sessionId: currentClaims?.psid || null,
                type: error.code,
                severity: Number(error.status || 500) >= 500 ? "error" : "warning",
                riskScore: error.code === "INVALID_TOKEN" ? 25 : 10,
                metadata: { path: url.pathname },
              },
            ]
          : [],
      );
      return jsonError(error, rid);
    }
  },
};
