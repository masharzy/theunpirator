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
    async createYoutubePlaybackSession({ youtubeUrl, title, ...session }) {
      return createPlaybackSession({
        ...session,
        source: { provider: "youtube_custom", url: youtubeUrl, ...(title ? { title } : {}) },
      });
    },
  };
}

export function createUnpiratorYoutubeHandler({ apiUrl, apiKey, siteId, resolveViewer }) {
  if (!siteId || typeof resolveViewer !== "function")
    throw new Error("siteId and resolveViewer are required");
  const client = createUnpiratorServerClient({ apiUrl, apiKey });
  return async function POST(request) {
    try {
      const origin = request.headers.get("origin");
      if (origin && new URL(origin).hostname !== new URL(request.url).hostname)
        return Response.json(
          { error: { message: "Cross-site request rejected" } },
          { status: 403 },
        );
      const viewer = await resolveViewer(request);
      if (!viewer?.id)
        return Response.json({ error: { message: "Sign in required" } }, { status: 401 });
      const body = await request.json();
      const session = await client.createYoutubePlaybackSession({
        siteId,
        youtubeUrl: body.youtubeUrl,
        title: body.title,
        externalUserId: String(viewer.id),
        displayLabel: viewer.label ? String(viewer.label) : undefined,
        deviceId: String(body.deviceId || ""),
        client: body.client || {},
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
