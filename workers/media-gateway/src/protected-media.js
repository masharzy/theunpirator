import { assertSourceUrl } from "./origin-policy.js";
import { getSource } from "./source.js";
import { securityError } from "./token.js";

const MANIFEST_TTL_SECONDS = 300;

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
  const headers = new Headers({ range: `bytes=${range.start}-${range.end}` });
  for (const [name, value] of Object.entries(source.headers || {})) {
    if (!["host", "connection", "content-length"].includes(name.toLowerCase()))
      headers.set(name, String(value));
  }
  return headers;
}

async function fetchRange(stream, source, range) {
  assertSourceUrl(stream.url, source.allowedHosts);
  const response = await fetch(stream.url, {
    headers: sourceHeaders(source, range),
    redirect: "manual",
  });
  if (response.status !== 206) {
    await response.body?.cancel();
    throw securityError("ORIGIN_FAILURE", 502, "Protected media unavailable");
  }
  return response;
}

async function trackManifest(stream, source) {
  const response = await fetchRange(stream, source, stream.indexRange);
  const index = await response.arrayBuffer();
  if (index.byteLength > 1024 * 1024) throw securityError("MEDIA_INDEX_INVALID", 502);
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

export async function protectedManifest(env, claims, assetId, forceRefresh = false) {
  const key = `protected:manifest:${claims.psid}:${assetId}`;
  if (!forceRefresh) {
    const cached = await env.SOURCE_CACHE.get(key, "json");
    if (cached) return cached;
  }
  const source = await getSource(env, claims, assetId, forceRefresh);
  if (source.delivery?.mode !== "protected_segments")
    throw securityError("PROTECTED_DELIVERY_UNAVAILABLE", 409, "Protected playback unavailable");
  const videos = await Promise.all(
    source.delivery.streams.video.map((stream) => trackManifest(stream, source)),
  );
  const audios = await Promise.all(
    source.delivery.streams.audio.map((stream) => trackManifest(stream, source)),
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
  const response = await fetchRange(stream, source, range);
  const body = await response.arrayBuffer();
  if (body.byteLength > 16 * 1024 * 1024) throw securityError("MEDIA_SEGMENT_TOO_LARGE", 502);
  return { body, contentType: stream.mimeType || "application/octet-stream" };
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
