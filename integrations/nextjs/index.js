export function createUnpiratorServerClient({ apiUrl, apiKey }) {
  if (!apiUrl || !apiKey) throw new Error("apiUrl and apiKey are required");
  async function createPlaybackSession(input) {
    const response = await fetch(`${apiUrl}/v1/playback/sessions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data?.error?.message || "Playback authorization failed");
      error.status = response.status;
      error.code = data?.error?.code;
      throw error;
    }
    return data;
  }
  return {
    createPlaybackSession,
    async upsertPlaybackAsset(input) {
      const response = await fetch(`${apiUrl}/v1/playback/assets/upsert`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data?.error?.message || "Asset synchronization failed");
        error.status = response.status;
        error.code = data?.error?.code;
        throw error;
      }
      return data;
    },
    async createSourcePlaybackSession({ src, title, ...session }) {
      const url = new URL(src);
      const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
      if (host !== "youtu.be" && host !== "youtube.com" && !host.endsWith(".youtube.com"))
        throw new Error("URL sources currently support YouTube; use assetId for other providers");
      return createPlaybackSession({
        ...session,
        source: { provider: "youtube_custom", url: url.toString(), ...(title ? { title } : {}) },
      });
    },
    async createYoutubePlaybackSession({ youtubeUrl, title, ...session }) {
      return createPlaybackSession({
        ...session,
        source: { provider: "youtube_custom", url: youtubeUrl, ...(title ? { title } : {}) },
      });
    },
  };
}

export function createUnpiratorPlaybackHandler({
  apiUrl,
  apiKey,
  siteId,
  resolveViewer,
  authorizePlayback,
  allowGuests = false,
}) {
  if (!siteId) throw new Error("siteId is required");
  if (!allowGuests && typeof resolveViewer !== "function")
    throw new Error("resolveViewer is required unless allowGuests is true");
  if (!allowGuests && typeof authorizePlayback !== "function")
    throw new Error("authorizePlayback is required unless allowGuests is true");
  const client = createUnpiratorServerClient({ apiUrl, apiKey });
  return async function POST(request) {
    try {
      const origin = request.headers.get("origin");
      if (origin && new URL(origin).hostname !== new URL(request.url).hostname)
        return Response.json(
          { error: { message: "Cross-site request rejected" } },
          { status: 403 },
        );
      const body = await request.json();
      const deviceId = body.deviceId ? String(body.deviceId) : undefined;
      if (deviceId && deviceId.length < 8) throw new Error("Device ID must be at least 8 characters");
      const viewer = resolveViewer ? await resolveViewer(request) : null;
      if (!viewer?.id && !allowGuests) {
        const error = new Error("Sign in required");
        error.status = 401;
        throw error;
      }
      const identity = viewer?.id
        ? { id: String(viewer.id), label: viewer.label ? String(viewer.label) : undefined }
        : { id: `guest:${deviceId || globalThis.crypto.randomUUID()}`, label: "Guest viewer" };
      if (authorizePlayback) {
        const allowed = await authorizePlayback({ request, body, viewer: identity });
        if (!allowed) {
          const error = new Error("Viewer is not allowed to access this content");
          error.status = 403;
          error.code = "CONTENT_ACCESS_DENIED";
          throw error;
        }
      }
      const input = {
        siteId,
        externalUserId: identity.id,
        displayLabel: identity.label,
        ...(deviceId ? { deviceId } : {}),
        client: body.client || {},
      };
      const resolvedAssetId = body.playbackRef || body.assetId;
      const session = resolvedAssetId
        ? await client.createPlaybackSession({ ...input, assetId: String(resolvedAssetId) })
        : await client.createSourcePlaybackSession({
            ...input,
            src: body.src || body.youtubeUrl,
            title: body.title,
          });
      return Response.json(session, { status: 201, headers: { "cache-control": "no-store" } });
    } catch (error) {
      return Response.json(
        {
          error: {
            code: error.code || "PLAYBACK_FAILED",
            message: error.message || "Playback authorization failed",
          },
        },
        {
          status: Number(error.status) >= 400 && Number(error.status) <= 599 ? error.status : 400,
          headers: { "cache-control": "no-store" },
        },
      );
    }
  };
}

export const createUnpiratorYoutubeHandler = createUnpiratorPlaybackHandler;
