export { SessionState } from "./session-state.js";
import { verifyPlaybackToken, securityError } from "./token.js";
import { proxyHlsObject, proxyPrimary } from "./proxy.js";
import { assertOrigin } from "./proxy.js";
import { getAllowedOrigins } from "./source.js";
import {
  encryptProtectedChunk,
  protectedManifest,
  protectedPlainChunk,
  playbackWindows,
} from "./protected-media.js";
import { emitTelemetry } from "./telemetry.js";
import { createYoutubeAttestation, createYoutubeIntegrityToken } from "./youtube-attestation.js";

const PROTECTED_PLAYER_BUILD = "protected-v1";

function jsonError(error, requestId, request) {
  const status = Number(error.status || 500);
  return Response.json(
    {
      error: {
        code: error.code || "GATEWAY_ERROR",
        message: status >= 500 ? "Media gateway error" : error.message,
        requestId,
        ...(Number.isInteger(error.upstreamStatus) ? { upstreamStatus: error.upstreamStatus } : {}),
      },
    },
    {
      status,
      headers: { "cache-control": "no-store", "x-request-id": requestId, ...corsHeaders(request) },
    },
  );
}
function requestId(request) {
  return request.headers.get("x-request-id") || crypto.randomUUID();
}
export function readToken(request, url) {
  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  const cookie = request.headers.get("cookie") || "";
  const match = /(?:^|;\s*)ap_playback=([^;]+)/.exec(cookie);
  if (match) return decodeURIComponent(match[1]);
  return url.searchParams.get("token") || "";
}
function playbackCookie(token, assetId, maxAge) {
  return `ap_playback=${encodeURIComponent(token)}; Path=/v/${assetId}; Max-Age=${Math.max(30, Number(maxAge || 90))}; HttpOnly; Secure; SameSite=None`;
}
async function sessionStub(env, sessionId) {
  return env.SESSION_STATE.get(env.SESSION_STATE.idFromName(sessionId));
}
function toBase64(bytes) {
  let value = "";
  for (const byte of new Uint8Array(bytes)) value += String.fromCharCode(byte);
  return btoa(value);
}
async function assertProtectedOrigin(request, env, claims, assetId) {
  assertOrigin(request, await getAllowedOrigins(env, claims, assetId), env);
}
async function assertSession(env, claims) {
  const stub = await sessionStub(env, claims.psid);
  const response = await stub.fetch("https://session/state");
  if (!response.ok) throw securityError("SESSION_UNAVAILABLE", 503);
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
        "Access-Control-Expose-Headers": "x-unpirator-iv,x-unpirator-context,x-request-id",
      }
    : {};
}
function assertAllowedProtectedBrowser(request) {
  const ua = request.headers.get("user-agent") || "";
  if (
    !/(Chrome|Chromium|Edg)\/[0-9]+/i.test(ua) ||
    /(1DM|\bIDM\b|Download Manager|;\s*wv\)|\bWebView\b)/i.test(ua)
  )
    throw securityError("BROWSER_NOT_ALLOWED", 403, "Use a supported secure browser");
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

const gateway = {
  async fetch(request, env, ctx) {
    const rid = requestId(request);
    const url = new URL(request.url);
    let currentClaims = null;
    if (request.method === "OPTIONS") return corsPreflight(request);
    try {
      if (url.pathname === "/health")
        return Response.json(
          {
            status: "ok",
            service: "media-gateway",
            build: env.GATEWAY_BUILD_SHA || "unknown",
          },
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
      const match =
        /^\/v\/([0-9a-fA-F-]{36})\/(media|refresh|bootstrap|manifest|integrity|ticket|attestation\/create|attestation\/integrity|chunk\/(video|audio)\/(\d+)\/(\d+)|hls\/([a-f0-9]{40}))$/.exec(
          url.pathname,
        );
      if (!match || !["GET", "HEAD", "POST"].includes(request.method))
        throw securityError("NOT_FOUND", 404, "Media route not found");
      const [, assetId, mode, chunkTrack, chunkVariantRaw, chunkSequenceRaw, objectId] = match;
      const token = readToken(request, url);
      const claims = await verifyPlaybackToken(
        token,
        env,
        Math.floor(Date.now() / 1000),
        mode === "refresh" ? 15 * 60 : 0,
      );
      currentClaims = claims;
      if (claims.aid !== assetId) throw securityError("ASSET_TOKEN_MISMATCH", 403);
      await assertSession(env, claims);
      if (request.method === "POST" && mode === "attestation/create") {
        assertAllowedProtectedBrowser(request);
        await assertProtectedOrigin(request, env, claims, assetId);
        return Response.json(
          { challenge: await createYoutubeAttestation(request.headers.get("user-agent") || "") },
          {
            headers: { "cache-control": "no-store", "x-request-id": rid, ...corsHeaders(request) },
          },
        );
      }
      if (request.method === "POST" && mode === "attestation/integrity") {
        assertAllowedProtectedBrowser(request);
        await assertProtectedOrigin(request, env, claims, assetId);
        const body = await request.json();
        return Response.json(
          await createYoutubeIntegrityToken(
            request.headers.get("user-agent") || "",
            body?.botguardResponse,
          ),
          {
            headers: { "cache-control": "no-store", "x-request-id": rid, ...corsHeaders(request) },
          },
        );
      }
      if (request.method === "POST" && mode === "bootstrap") {
        assertAllowedProtectedBrowser(request);
        await assertProtectedOrigin(request, env, claims, assetId);
        const body = await request.json();
        if (body?.playerBuild !== PROTECTED_PLAYER_BUILD)
          throw securityError("PLAYER_INTEGRITY_LOST", 403, "Unsupported player build");
        if (body?.publicKey?.kty !== "RSA") throw securityError("INVALID_REQUEST", 400);
        let publicKey;
        try {
          publicKey = await crypto.subtle.importKey(
            "jwk",
            body.publicKey,
            { name: "RSA-OAEP", hash: "SHA-256" },
            false,
            ["encrypt"],
          );
        } catch {
          throw securityError("INVALID_REQUEST", 400, "Invalid player key");
        }
        const mediaKey = crypto.getRandomValues(new Uint8Array(32));
        const wrappedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, mediaKey);
        const stub = await sessionStub(env, claims.psid);
        const manifest = await protectedManifest(env, claims, assetId, false, body.providerProof);
        const stored = await stub.fetch("https://session/crypto", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ keyBase64: toBase64(mediaKey) }),
        });
        if (!stored.ok) throw securityError("SESSION_UNKNOWN", 403);
        return Response.json(
          { manifest, wrappedKey: toBase64(wrappedKey), algorithm: "AES-GCM" },
          {
            headers: { "cache-control": "no-store", "x-request-id": rid, ...corsHeaders(request) },
          },
        );
      }
      if (request.method === "GET" && mode === "manifest") {
        await assertProtectedOrigin(request, env, claims, assetId);
        return Response.json(await protectedManifest(env, claims, assetId), {
          headers: { "cache-control": "no-store", "x-request-id": rid, ...corsHeaders(request) },
        });
      }
      if (request.method === "POST" && mode === "integrity") {
        await assertProtectedOrigin(request, env, claims, assetId);
        const body = await request.json();
        const windows =
          body.tampered !== true && body.positionSeconds !== undefined
            ? playbackWindows(await protectedManifest(env, claims, assetId), body)
            : undefined;
        const stub = await sessionStub(env, claims.psid);
        const response = await stub.fetch("https://session/integrity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sequence: body.sequence,
            tampered: body.tampered === true,
            windows,
          }),
        });
        if (!response.ok) {
          if (response.status === 429 || response.status >= 500)
            throw securityError("INTEGRITY_UNAVAILABLE", 503);
          throw securityError("PLAYER_INTEGRITY_LOST", 403);
        }
        return Response.json(await response.json(), {
          headers: { "cache-control": "no-store", "x-request-id": rid, ...corsHeaders(request) },
        });
      }
      if (request.method === "POST" && mode === "ticket") {
        await assertProtectedOrigin(request, env, claims, assetId);
        const body = await request.json();
        const stub = await sessionStub(env, claims.psid);
        const response = await stub.fetch("https://session/ticket", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw securityError("SEGMENT_TICKET_DENIED", response.status);
        return Response.json(await response.json(), {
          headers: { "cache-control": "no-store", "x-request-id": rid, ...corsHeaders(request) },
        });
      }
      if (request.method === "GET" && mode.startsWith("chunk/")) {
        await assertProtectedOrigin(request, env, claims, assetId);
        const variant = Number(chunkVariantRaw);
        const sequence = Number(chunkSequenceRaw);
        const ticket = url.searchParams.get("ticket") || "";
        const stub = await sessionStub(env, claims.psid);
        const consumed = await stub.fetch("https://session/consume", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ticket, track: chunkTrack, variant, sequence }),
        });
        if (!consumed.ok) throw securityError("SEGMENT_TICKET_INVALID", 403);
        const { keyBase64 } = await consumed.json();
        const chunk = await protectedPlainChunk(
          env,
          claims,
          assetId,
          chunkTrack,
          variant,
          sequence,
        );
        const context = `${claims.psid}:${assetId}:${chunkTrack}:${variant}:${sequence}`;
        const encrypted = await encryptProtectedChunk(chunk.body, keyBase64, context);
        return new Response(encrypted.encrypted, {
          headers: {
            "content-type": "application/octet-stream",
            "cache-control": "private, no-store",
            "x-unpirator-iv": encrypted.iv,
            "x-unpirator-context": context,
            "x-content-type-options": "nosniff",
            "x-request-id": rid,
            ...corsHeaders(request),
          },
        });
      }
      if (
        [
          "bootstrap",
          "manifest",
          "integrity",
          "ticket",
          "attestation/create",
          "attestation/integrity",
        ].includes(mode)
      )
        throw securityError("METHOD_NOT_ALLOWED", 405);
      if (request.method === "POST" && mode === "refresh") {
        await assertProtectedOrigin(request, env, claims, assetId);
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
        await assertProtectedOrigin(request, env, claims, assetId);
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
      currentClaims ||= error.verifiedClaims || null;
      console.error(
        JSON.stringify({
          level: "error",
          requestId: rid,
          sessionId: currentClaims?.psid || null,
          path: url.pathname,
          code: error?.code || "GATEWAY_ERROR",
          status: Number(error?.status || 500),
          message: error?.message || "Media gateway error",
        }),
      );
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
                metadata: {
                  path: url.pathname,
                  ...(Number.isInteger(error.upstreamStatus)
                    ? { upstreamStatus: error.upstreamStatus }
                    : {}),
                },
              },
            ]
          : [],
      );
      return jsonError(error, rid, request);
    }
  },
};

export default {
  async fetch(request, env, ctx) {
    const started = performance.now();
    const response = await gateway.fetch(request, env, ctx);
    const durationMs = Math.round(performance.now() - started);
    const headers = new Headers(response.headers);
    headers.set("server-timing", `gateway;dur=${durationMs}`);
    const path = new URL(request.url).pathname;
    if (
      /\/(bootstrap|attestation\/create|attestation\/integrity)$/.test(path) ||
      (/\/integrity$/.test(path) && (durationMs >= 1000 || response.status >= 400))
    ) {
      console.info(
        JSON.stringify({
          component: "playback-timing",
          phase: "gateway-request",
          path,
          requestId: headers.get("x-request-id"),
          status: response.status,
          durationMs,
        }),
      );
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
