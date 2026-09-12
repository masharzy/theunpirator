import { assertSourceUrl } from "./origin-policy.js";
import { getSource } from "./source.js";
import { securityError } from "./token.js";
import { singleFlight } from "./single-flight.js";
import { readRange } from "./read-range.js";

const MANIFEST_TTL_SECONDS = 300;

export function playbackWindows(manifest, body) {
  const seconds = body.positionSeconds;
  if (
    typeof seconds !== "number" ||
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    seconds > manifest.durationMs / 1000
  )
    throw securityError("INVALID_REQUEST", 400, "Invalid playback position");
  return Object.fromEntries(
    ["video", "audio"].map((track) => {
      const variant = body[`${track}Variant`];
      const descriptor = Number.isInteger(variant) && manifest[track]?.[variant];
      if (!descriptor) throw securityError("INVALID_REQUEST", 400, "Invalid playback variant");
      let end = 0;
      const segment =
        descriptor.segments.find((item) => {
          end += item.durationMs / 1000;
          return seconds < end;
        }) || descriptor.segments.at(-1);
      end = 0;
      const last =
        descriptor.segments.find((item) => {
          end += item.durationMs / 1000;
          return seconds + 30 < end;
        }) || descriptor.segments.at(-1);
      return [
        track,
        {
          variant,
          min: Math.max(1, segment.sequence - 2),
          max: last.sequence,
        },
      ];
    }),
  );
}

function readUint64(view, offset) {
  const value = Number(view.getBigUint64(offset));
  if (!Number.isSafeInteger(value)) throw securityError("MEDIA_INDEX_INVALID", 502);
  return value;
}

export function parseSidx(buffer, indexEnd) {
  const view = new DataView(buffer);
  let boxStart = -1;
  let boxSize = 0;
  for (let offset = 0; offset + 8 <= view.byteLength;) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(...new Uint8Array(buffer, offset + 4, 4));
    if (type === "sidx") {
      boxStart = offset;
      boxSize = size || view.byteLength - offset;
      break;
    }
    if (size < 8 || offset + size > view.byteLength) break;
    offset += size;
  }
  if (boxStart < 0 || boxStart + boxSize > view.byteLength)
    throw securityError("MEDIA_INDEX_INVALID", 502, "Protected media index unavailable");
  let offset = boxStart + 8;
  const version = view.getUint8(offset);
  offset += 4;
  offset += 4;
  const timescale = view.getUint32(offset);
  offset += 4;
  if (!timescale) throw securityError("MEDIA_INDEX_INVALID", 502);
  let firstOffset;
  if (version === 0) {
    offset += 4;
    firstOffset = view.getUint32(offset);
    offset += 4;
  } else if (version === 1) {
    offset += 8;
    firstOffset = readUint64(view, offset);
    offset += 8;
  } else {
    throw securityError("MEDIA_INDEX_INVALID", 502);
  }
  offset += 2;
  const count = view.getUint16(offset);
  offset += 2;
  let cursor = Number(indexEnd) + 1 + firstOffset;
  const segments = [];
  for (let sequence = 0; sequence < count; sequence += 1) {
    if (offset + 12 > boxStart + boxSize) throw securityError("MEDIA_INDEX_INVALID", 502);
    const reference = view.getUint32(offset);
    const referenceType = reference >>> 31;
    const size = reference & 0x7fffffff;
    const duration = view.getUint32(offset + 4);
    offset += 12;
    if (referenceType || !size) continue;
    segments.push({
      sequence: segments.length + 1,
      start: cursor,
      end: cursor + size - 1,
      durationMs: Math.max(1, Math.round((duration / timescale) * 1000)),
    });
    cursor += size;
  }
  if (!segments.length) throw securityError("MEDIA_INDEX_INVALID", 502);
  return segments;
}

function sourceHeaders(source, range) {
  const headers = new Headers({
    range: `bytes=${range.start}-${range.end}`,
    // Prevent an intermediary from transforming a byte-range response. YouTube's
    // Content-Range offsets are defined against the identity representation.
    "accept-encoding": "identity",
  });
  for (const [name, value] of Object.entries(source.headers || {})) {
    if (!["host", "connection", "content-length"].includes(name.toLowerCase()))
      headers.set(name, String(value));
  }
  return headers;
}

async function fetchRange(stream, source, range, signal) {
  assertSourceUrl(stream.url, source.allowedHosts);
  const response = await fetch(stream.url, {
    headers: sourceHeaders(source, range),
    redirect: "manual",
    signal,
  });
  if (response.status !== 206) {
    await response.body?.cancel();
    console.error(
      JSON.stringify({
        level: "error",
        component: "protected-origin",
        code: "ORIGIN_RANGE_REJECTED",
        upstreamStatus: response.status,
        hostname: new URL(stream.url).hostname,
        range: `${range.start}-${range.end}`,
        profile: stream.profile || null,
      }),
    );
    const error = securityError("ORIGIN_FAILURE", 502, "Protected media unavailable");
    error.upstreamStatus = response.status;
    throw error;
  }
  return response;
}

async function fetchTrackRange(track, variant, range, source) {
  let lastError;
  const signal = AbortSignal.timeout(45000);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const streams =
      track === "video" ? source.delivery?.streams?.video : source.delivery?.streams?.audio;
    const stream = streams?.[variant];
    if (!stream) throw securityError("MEDIA_SEGMENT_INVALID", 404);
    try {
      return { response: await fetchRange(stream, source, range, signal), stream, source };
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
      // A protected YouTube source can only be resolved with a fresh browser PO proof.
      // Retry its already-verified signed URL here; a new playback bootstrap performs
      // source renewal when that URL has actually expired.
      await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function trackManifest(env, claims, assetId, track, variant, source) {
  const initialStream = source.delivery.streams[track][variant];
  const { response, stream } = await fetchTrackRange(
    track,
    variant,
    initialStream.indexRange,
    source,
  );
  const index = await readRange(response, stream.indexRange, 1024 * 1024, "MEDIA_INDEX_INVALID");
  return {
    codec: stream.codec,
    mimeType: stream.mimeType,
    bitrate: stream.bitrate,
    durationMs: stream.durationMs,
    contentLength: stream.contentLength,
    qualityLabel: stream.qualityLabel || null,
    height: stream.height || null,
    width: stream.width || null,
    init: { sequence: 0, ...stream.initRange },
    segments: parseSidx(index, stream.indexRange.end),
  };
}

export async function protectedManifest(
  env,
  claims,
  assetId,
  forceRefresh = false,
  providerProof = null,
) {
  return singleFlight(env, `manifest:${claims.psid}:${assetId}`, () =>
    buildManifest(env, claims, assetId, forceRefresh, providerProof),
  );
}
async function buildManifest(env, claims, assetId, forceRefresh, providerProof) {
  const key = `protected:manifest:${claims.psid}:${assetId}`;
  // Resolve/check the source before accepting its cached manifest. getSource
  // invalidates this key whenever it has to replace the signed source.
  const source = await getSource(env, claims, assetId, forceRefresh, providerProof);
  if (!forceRefresh) {
    const cached = await env.SOURCE_CACHE.get(key, "json");
    if (cached) return cached;
  }
  if (source.delivery?.mode !== "protected_segments")
    throw securityError("PROTECTED_DELIVERY_UNAVAILABLE", 409, "Protected playback unavailable");
  const started = Date.now();
  const [videos, audios] = await Promise.all(
    ["video", "audio"].map((track) =>
      Promise.all(
        source.delivery.streams[track].map((_, variant) =>
          trackManifest(env, claims, assetId, track, variant, source),
        ),
      ),
    ),
  );
  const manifest = {
    version: 1,
    assetId,
    durationMs: Math.max(videos[0]?.durationMs || 0, audios[0]?.durationMs || 0),
    video: videos,
    audio: audios,
  };
  await env.SOURCE_CACHE.put(key, JSON.stringify(manifest), {
    expirationTtl: MANIFEST_TTL_SECONDS,
  });
  console.info(
    JSON.stringify({
      component: "playback-timing",
      phase: "manifest-indexes",
      sessionId: claims.psid,
      durationMs: Date.now() - started,
    }),
  );
  return manifest;
}

export async function protectedPlainChunk(env, claims, assetId, track, variant, sequence) {
  const source = await getSource(env, claims, assetId);
  if (source.delivery?.mode !== "protected_segments")
    throw securityError("PROTECTED_DELIVERY_UNAVAILABLE", 409);
  const list = track === "video" ? source.delivery.streams.video : source.delivery.streams.audio;
  const stream = list?.[variant];
  if (!stream) throw securityError("MEDIA_SEGMENT_INVALID", 404);
  const manifest = await protectedManifest(env, claims, assetId);
  const descriptor = manifest[track]?.[variant];
  const range = sequence === 0 ? descriptor?.init : descriptor?.segments?.[sequence - 1];
  if (!range || range.sequence !== sequence) throw securityError("MEDIA_SEGMENT_INVALID", 404);
  const stub = env.SESSION_STATE.get(env.SESSION_STATE.idFromName(claims.psid));
  const reserved = await stub.fetch("https://session/lease", {
    method: "POST",
    body: JSON.stringify({ bytes: range.end - range.start + 1 }),
  });
  if (!reserved.ok) throw securityError("DELIVERY_LIMIT", reserved.status);
  const { lease } = await reserved.json();
  try {
    const { response } = await fetchTrackRange(track, variant, range, source);
    const body = await readRange(response, range, 16 * 1024 * 1024, "MEDIA_SEGMENT_INVALID");
    return { body, contentType: stream.mimeType || "application/octet-stream" };
  } finally {
    await stub
      .fetch("https://session/release", { method: "POST", body: JSON.stringify({ lease }) })
      .catch(() => {});
  }
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export async function encryptProtectedChunk(body, keyBase64, context) {
  const key = await crypto.subtle.importKey(
    "raw",
    fromBase64(keyBase64),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = new TextEncoder().encode(context);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, key, body);
  return { encrypted, iv: btoa(String.fromCharCode(...iv)) };
}
