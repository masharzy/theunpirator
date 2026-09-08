const WATCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0";
const PROFILES = [
  {
    name: "IOS",
    version: "21.03.2",
    userAgent:
      "com.google.ios.youtube/21.03.2 (iPhone16,2; U; CPU iOS 18_7_2 like Mac OS X; en_US)",
    extra: {
      deviceMake: "Apple",
      deviceModel: "iPhone16,2",
      osName: "iOS",
      osVersion: "18.7.2.22H124",
    },
  },
  {
    name: "ANDROID",
    version: "21.03.36",
    userAgent: "com.google.android.youtube/21.03.36 (Linux; U; Android 16; en_US) gzip",
    extra: { androidSdkVersion: 36, osName: "Android", osVersion: "16" },
  },
];

function providerError(message, code = "YOUTUBE_RESOLVE_FAILED", status = 502) {
  return Object.assign(new Error(message), { code, status });
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

async function fetchVisitorData(videoId) {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: { "user-agent": WATCH_USER_AGENT, "accept-language": "en-US,en;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  return visitorDataFrom(await readTextLimited(response, 2_000_000));
}

async function requestPlayer(videoId, visitorData, region, profile) {
  const client = {
    clientName: profile.name,
    clientVersion: profile.version,
    hl: "en",
    gl: region,
    utcOffsetMinutes: 0,
    ...profile.extra,
    ...(visitorData ? { visitorData } : {}),
  };
  const response = await fetch(
    `https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false&t=${crypto.randomUUID()}&id=${videoId}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": profile.userAgent,
        "accept-language": "en-US,en;q=0.9",
        "x-goog-api-format-version": "2",
        ...(visitorData ? { "x-goog-visitor-id": visitorData } : {}),
      },
      body: JSON.stringify({
        context: { client },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
        playbackContext: { contentPlaybackContext: { html5Preference: "HTML5_PREF_WANTS" } },
      }),
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!response.ok) throw providerError(`YouTube player returned HTTP ${response.status}`);
  return JSON.parse(await readTextLimited(response, 4_000_000));
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

function protectedAdaptiveStreams(player, profile) {
  const formats = (player.streamingData?.adaptiveFormats || []).filter(
    (item) =>
      isAllowedMediaUrl(item.url) &&
      /^\s*(video|audio)\/mp4/i.test(item.mimeType || "") &&
      item.initRange?.start != null &&
      item.initRange?.end != null &&
      item.indexRange?.start != null &&
      item.indexRange?.end != null,
  );
  const normalize = (item) => ({
    url: item.url,
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
  const video = formats
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
  const audio = formats
    .filter(
      (item) => /^\s*audio\/mp4/i.test(item.mimeType || "") && /mp4a/i.test(item.mimeType || ""),
    )
    .sort((a, b) => Number(b.bitrate) - Number(a.bitrate))
    .slice(0, 2)
    .map((item) => ({ ...normalize(item), audioQuality: item.audioQuality || null }));
  return video.length && audio.length ? { video, audio } : null;
}

function expiryFrom(url) {
  const seconds = Number(new URL(url).searchParams.get("expire"));
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

async function resolveYoutube(sourceUrl) {
  const videoId = extractYoutubeVideoId(sourceUrl);
  if (!videoId) throw providerError("Invalid YouTube video URL", "INVALID_YOUTUBE_URL", 400);
  const visitorData = await fetchVisitorData(videoId).catch(() => null);
  const attempts = [
    [visitorData, "US"],
    [null, "US"],
    [visitorData, "BD"],
    [null, "BD"],
  ].filter(
    ([visitor], index, all) =>
      all.findIndex(([v, r]) => v === visitor && r === all[index][1]) === index,
  );
  let lastReason = "No compatible protected MP4 streams were returned";
  for (const [visitor, region] of attempts) {
    for (const profile of PROFILES) {
      try {
        const player = await requestPlayer(videoId, visitor, region, profile);
        const status = player.playabilityStatus?.status;
        if (status !== "OK") {
          lastReason = player.playabilityStatus?.reason || lastReason;
          continue;
        }
        const protectedStreams = protectedAdaptiveStreams(player, profile);
        if (!protectedStreams) continue;
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
          cacheTtlSeconds: 60,
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
      }
    }
  }
  throw providerError(`YouTube could not expose a playable stream. ${lastReason}`);
}

export const youtubeCustomProvider = {
  name: "youtube_custom",
  async resolve({ asset }) {
    return resolveYoutube(asset.providerReference);
  },
};
