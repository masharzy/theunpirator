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

export function createUnpiratorPlaybackHandler({ apiUrl, apiKey, siteId, resolveViewer }) {
  if (!siteId) throw new Error("siteId is required");
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
      const deviceId = String(body.deviceId || "");
      if (deviceId.length < 8) throw new Error("A valid device ID is required");
      const viewer = resolveViewer ? await resolveViewer(request) : null;
      const identity = viewer?.id
        ? { id: String(viewer.id), label: viewer.label ? String(viewer.label) : undefined }
        : { id: `guest:${deviceId.slice(0, 174)}`, label: "Guest viewer" };
      const input = {
        siteId,
        externalUserId: identity.id,
        displayLabel: identity.label,
        deviceId,
        client: body.client || {},
      };
      const session = body.assetId
        ? await client.createPlaybackSession({ ...input, assetId: String(body.assetId) })
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
