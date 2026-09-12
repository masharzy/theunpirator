import { createProfilePreference } from "./profile-preference.js";

const profilePreference = createProfilePreference();
const WATCH_USER_AGENT =
  "Mozilla/5.0 (iPad; CPU OS 16_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1,gzip(gfe)";
const PROFILES = [
  {
    name: "MWEB",
    version: "2.20260205.04.01",
    userAgent: WATCH_USER_AGENT,
    webPo: true,
    extra: {
      osName: "iPad",
      osVersion: "16_7_10",
      browserName: "Safari",
      browserVersion: "16.6",
      platform: "MOBILE",
      clientFormFactor: "UNKNOWN_FORM_FACTOR",
    },
  },
  {
    name: "IOS",
    version: "20.11.6",
    userAgent: "com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)",
    extra: {
      deviceModel: "iPhone10,4",
      osName: "iOS",
      osVersion: "16.7.7.20H330",
    },
  },
  {
    name: "VISIONOS",
    version: "1.02",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
    extra: {
      deviceMake: "Apple",
      deviceModel: "RealityDevice17,1",
      osName: "visionOS",
      osVersion: "26.5.23O471",
    },
  },
];

function providerError(message, code = "YOUTUBE_RESOLVE_FAILED", status = 502) {
  return Object.assign(new Error(message), { code, status });
}

function createPlaybackNonce() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => alphabet[byte & 63]).join("");
}

export function extractYoutubeVideoId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
    let candidate;
    if (host === "youtu.be") candidate = url.pathname.split("/").filter(Boolean)[0];
    else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      candidate = url.searchParams.get("v");
      if (!candidate && ["shorts", "embed", "live"].includes(url.pathname.split("/")[1]))
        candidate = url.pathname.split("/")[2];
    }
    return /^[A-Za-z0-9_-]{6,20}$/.test(candidate || "") ? candidate : null;
  } catch {
    return null;
  }
}

function visitorDataFrom(html) {
  const patterns = [/"visitorData"\s*:\s*"([^"]+)"/, /VISITOR_DATA["']?\s*[:=]\s*["']([^"']+)/];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return match[1].replace(/\\u003d/g, "=");
  }
  return null;
}

async function readTextLimited(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw providerError("YouTube response exceeded the safe size limit");
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes)
      throw providerError("YouTube response exceeded the safe size limit");
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw providerError("YouTube response exceeded the safe size limit");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function watchConfigFrom(html) {
  const visitorData = visitorDataFrom(html);
  const apiKey = /"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/.exec(html)?.[1] || null;
  const signatureTimestamp = Number(/"STS"\s*:\s*(\d+)/.exec(html)?.[1] || 0);
  if (!apiKey || !signatureTimestamp)
    throw providerError("YouTube watch configuration was unavailable");
  return { visitorData, apiKey, signatureTimestamp };
}

async function fetchWatchConfig(videoId) {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: { "user-agent": WATCH_USER_AGENT, "accept-language": "en-US,en;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw providerError(`YouTube watch page returned HTTP ${response.status}`);
  return watchConfigFrom(await readTextLimited(response, 2_000_000));
}

async function requestPlayer(videoId, watchConfig, region, profile, proofToken) {
  const { visitorData, apiKey, signatureTimestamp } = watchConfig;
  const client = {
    clientName: profile.name,
    clientVersion: profile.version,
    hl: "en",
    gl: region,
    utcOffsetMinutes: 0,
    ...profile.extra,
    ...(visitorData ? { visitorData } : {}),
  };
  const cpn = createPlaybackNonce();
  const response = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}&prettyPrint=false&t=${crypto.randomUUID()}&id=${videoId}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": profile.userAgent,
        "accept-language": "en-US,en;q=0.9",
        "x-goog-api-format-version": "2",
        origin: "https://m.youtube.com",
        referer: "https://m.youtube.com/",
        ...(visitorData ? { "x-goog-visitor-id": visitorData } : {}),
      },
      body: JSON.stringify({
        context: {
          client,
          user: { lockedSafetyMode: false },
          request: { useSsl: true },
        },
        videoId,
        cpn,
        contentCheckOk: true,
        racyCheckOk: true,
        ...(profile.webPo ? { serviceIntegrityDimensions: { poToken: proofToken } } : {}),
        playbackContext: {
          contentPlaybackContext: {
            html5Preference: "HTML5_PREF_WANTS",
            signatureTimestamp,
          },
        },
      }),
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!response.ok) throw providerError(`YouTube player returned HTTP ${response.status}`);
  return { player: JSON.parse(await readTextLimited(response, 4_000_000)), cpn };
}

function isAllowedMediaUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "googlevideo.com" || url.hostname.endsWith(".googlevideo.com"))
    );
  } catch {
    return false;
  }
}

function codecFrom(mimeType = "") {
  return /codecs="([^"]+)"/i.exec(mimeType)?.[1] || "";
}

function urlWithProof(value, proofToken, cpn) {
  const url = new URL(value);
  url.searchParams.set("cpn", cpn);
  if (proofToken) url.searchParams.set("pot", proofToken);
  return url.toString();
}

async function probeStream(stream, profile) {
  try {
    // YouTube can serve the index and initial media bytes but deny later ranges.
    // An index-only probe therefore accepts sources that fail during playback.
    const length = stream.contentLength;
    if (!Number.isSafeInteger(length) || length <= stream.indexRange.end + 1) return false;
    const lateStart = Math.max(stream.indexRange.end + 1, Math.floor(length * 0.75));
    const results = await Promise.all(
      [stream.indexRange, { start: lateStart, end: Math.min(length - 1, lateStart + 1023) }].map(
        async (range) => {
          const response = await fetch(stream.url, {
            headers: {
              range: `bytes=${range.start}-${range.end}`,
              "accept-encoding": "identity",
              "user-agent": profile.userAgent,
              referer: "https://www.youtube.com/",
            },
            redirect: "manual",
            signal: AbortSignal.timeout(8_000),
          });
          const usable = response.status === 206;
          await response.body?.cancel();
          return usable;
        },
      ),
    );
    return results.every(Boolean);
  } catch {
    return false;
  }
}

async function keepReachableStreams(streams, profile) {
  const reachable = await Promise.all(
    streams.map(async (stream) => ((await probeStream(stream, profile)) ? stream : null)),
  );
  return reachable.filter(Boolean);
}

let cachedPlayer;
let cachedPlayerExpiresAt = 0;

async function getYoutubePlayer() {
  if (cachedPlayer && Date.now() < cachedPlayerExpiresAt) return cachedPlayer;
  cachedPlayer = await Player.create(undefined, fetch);
  cachedPlayerExpiresAt = Date.now() + 30 * 60 * 1000;
  return cachedPlayer;
}

async function protectedAdaptiveStreams(response, profile, proofToken, cpn) {
  const candidates = (response.streamingData?.adaptiveFormats || []).filter(
    (item) =>
      /^\s*(video|audio)\/mp4/i.test(item.mimeType || "") &&
      item.initRange?.start != null &&
      item.initRange?.end != null &&
      item.indexRange?.start != null &&
      item.indexRange?.end != null,
  );
  const requiresDecipher = candidates.some((item) => {
    if (!item.url) return true;
    try {
      return new URL(item.url).searchParams.has("n");
    } catch {
      return true;
    }
  });
  const decipherer = requiresDecipher ? await getYoutubePlayer() : null;
  const formats = (
    await Promise.all(
      candidates.map(async (item) => {
        try {
          const url = decipherer
            ? await decipherer.decipher(item.url, item.signatureCipher, item.cipher)
            : item.url;
          return isAllowedMediaUrl(url) ? { ...item, url } : null;
        } catch {
          return null;
        }
      }),
    )
  ).filter(Boolean);
  const normalize = (item) => ({
    url: urlWithProof(item.url, profile.webPo ? proofToken : null, cpn),
    hostname: new URL(item.url).hostname,
    mimeType: (item.mimeType || "application/octet-stream").split(";")[0],
    codec: codecFrom(item.mimeType),
    bitrate: Number(item.bitrate || item.averageBitrate || 0),
    contentLength: Number(item.contentLength || 0),
    durationMs: Number(item.approxDurationMs || 0),
    initRange: { start: Number(item.initRange.start), end: Number(item.initRange.end) },
    indexRange: { start: Number(item.indexRange.start), end: Number(item.indexRange.end) },
    profile: profile.name,
  });
  const videoCandidates = formats
    .filter(
      (item) => /^\s*video\/mp4/i.test(item.mimeType || "") && /avc1/i.test(item.mimeType || ""),
    )
    .sort((a, b) => Number(b.height) - Number(a.height) || Number(b.bitrate) - Number(a.bitrate))
    .slice(0, 4)
    .map((item) => ({
      ...normalize(item),
      height: Number(item.height || 0),
      width: Number(item.width || 0),
      fps: Number(item.fps || 0),
      qualityLabel: item.qualityLabel || `${Number(item.height || 0)}p`,
    }));
  const audioCandidates = formats
    .filter(
      (item) => /^\s*audio\/mp4/i.test(item.mimeType || "") && /mp4a/i.test(item.mimeType || ""),
    )
    .sort((a, b) => Number(b.bitrate) - Number(a.bitrate))
    .slice(0, 2)
    .map((item) => ({ ...normalize(item), audioQuality: item.audioQuality || null }));
  const [video, audio] = await Promise.all([
    keepReachableStreams(videoCandidates, profile),
    keepReachableStreams(audioCandidates, profile),
  ]);
  return video.length && audio.length ? { video, audio } : null;
}

function expiryFrom(url) {
  const seconds = Number(new URL(url).searchParams.get("expire"));
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

async function resolveYoutube(sourceUrl, proof) {
  const videoId = extractYoutubeVideoId(sourceUrl);
  if (!videoId) throw providerError("Invalid YouTube video URL", "INVALID_YOUTUBE_URL", 400);
  if (
    proof?.type !== "youtube_web" ||
    proof.contentBinding !== videoId ||
    typeof proof.token !== "string" ||
    proof.token.length < 40 ||
    proof.token.length > 4096 ||
    !/^[A-Za-z0-9_.=-]+$/.test(proof.token)
  )
    throw providerError("YouTube browser attestation is required", "ATTESTATION_REQUIRED", 403);
  const watchConfig = await fetchWatchConfig(videoId);
  const attempts = profilePreference.order(
    ["US", "BD"].flatMap((region) => PROFILES.map((profile) => ({ region, profile }))),
  );
  let lastReason = "No compatible protected MP4 streams were returned";
  for (const { region, profile } of attempts) {
    const started = Date.now();
    let usable = false;
    try {
      const { player, cpn } = await requestPlayer(
        videoId,
        watchConfig,
        region,
        profile,
        proof.token,
      );
      const status = player.playabilityStatus?.status;
      if (status !== "OK") {
        lastReason = player.playabilityStatus?.reason || lastReason;
        continue;
      }
      const protectedStreams = await protectedAdaptiveStreams(player, profile, proof.token, cpn);
      if (!protectedStreams) continue;
      usable = true;
      profilePreference.succeeded({ region, profile });
      const primary = protectedStreams.video[0];
      const allowedHosts = [
        ...new Set(
          [...protectedStreams.video, ...protectedStreams.audio].map((stream) => stream.hostname),
        ),
      ];
      return {
        url: null,
        allowedHosts,
        headers: { "user-agent": profile.userAgent, referer: "https://www.youtube.com/" },
        expiresAt: expiryFrom(primary.url),
        contentType: "video/mp4",
        supportsRange: true,
        // Keep the exact signed source stable for the lifetime of its URL. The
        // gateway still checks expiresAt before every use.
        cacheTtlSeconds: 6 * 3600,
        delivery: { mode: "protected_segments", streams: protectedStreams },
        metadata: {
          videoId,
          title: player.videoDetails?.title || "YouTube video",
          height: Number(primary.height || 0),
          qualityLabel: primary.qualityLabel || `${Number(primary.height || 0)}p`,
        },
      };
    } catch (error) {
      lastReason = error.message || lastReason;
    } finally {
      console.info(
        JSON.stringify({
          component: "playback-timing",
          phase: "source-profile",
          profile: profile.name,
          region,
          usable,
          durationMs: Date.now() - started,
        }),
      );
    }
  }
  throw providerError(`YouTube could not expose a playable stream. ${lastReason}`);
}

export const youtubeCustomProvider = {
  name: "youtube_custom",
  async resolve({ asset, context }) {
    return resolveYoutube(asset.providerReference, context?.providerProof);
  },
};
import { getQuickJSWASMModule, shouldInterruptAfterDeadline } from "@cf-wasm/quickjs";
import { Platform, Player } from "youtubei.js/cf-worker";

let quickJsModule;
Platform.shim.eval = async (data) => {
  quickJsModule ||= getQuickJSWASMModule();
  const runtime = await quickJsModule;
  return runtime.evalCode(`(function(){${data.output}\n})()`, {
    memoryLimitBytes: 8 * 1024 * 1024,
    shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + 2_000),
  });
};
