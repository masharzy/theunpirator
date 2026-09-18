function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function viewerIpFromRequest(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return (request.headers.get("x-real-ip") || "").trim().slice(0, 64) || undefined;
}

function viewerUserAgentFromRequest(request) {
  const value = (request.headers.get("user-agent") || "").trim();
  return value ? value.slice(0, 512) : undefined;
}

function assertViewer(viewer) {
  const email = normalizeEmail(viewer?.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("Authenticated viewer email is required");
    error.status = 401;
    error.code = "VIEWER_EMAIL_REQUIRED";
    throw error;
  }
  return { ...viewer, email };
}

export function createUnpiratorServerClient({ apiUrl, apiKey }) {
  if (!apiUrl || !apiKey) throw new Error("apiUrl and apiKey are required");

  async function createPlaybackSession(input) {
    const response = await fetch(`${apiUrl}/v1/playback/sessions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
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
      const data = await response.json().catch(() => ({}));
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
}) {
  if (!siteId) throw new Error("siteId is required");
  if (typeof resolveViewer !== "function")
    throw new Error("resolveViewer is required and must return the authenticated viewer email");
  if (typeof authorizePlayback !== "function")
    throw new Error("authorizePlayback is required");

  const client = createUnpiratorServerClient({ apiUrl, apiKey });

  return async function POST(request) {
    try {
      const origin = request.headers.get("origin");
      if (origin && new URL(origin).hostname !== new URL(request.url).hostname) {
        return Response.json(
          { error: { code: "CROSS_SITE_REQUEST", message: "Cross-site request rejected" } },
          { status: 403, headers: { "cache-control": "no-store" } },
        );
      }

      const body = await request.json();
      const deviceId = String(body?.deviceId || "").trim();
      if (deviceId.length < 8 || deviceId.length > 180) {
        const error = new Error("A stable device ID is required");
        error.status = 400;
        error.code = "DEVICE_ID_REQUIRED";
        throw error;
      }

      // Identity is resolved only from the customer's authenticated server context.
      // Never trust body.email, body.currentUser or any browser-supplied identity field.
      const viewer = assertViewer(await resolveViewer(request));
      const allowed = await authorizePlayback({ request, body, viewer });
      if (!allowed) {
        const error = new Error("Viewer is not allowed to access this content");
        error.status = 403;
        error.code = "CONTENT_ACCESS_DENIED";
        throw error;
      }

      const input = {
        siteId,
        email: viewer.email,
        deviceId,
        ...(viewerIpFromRequest(request) ? { viewerIp: viewerIpFromRequest(request) } : {}),
        ...(viewerUserAgentFromRequest(request)
          ? { viewerUserAgent: viewerUserAgentFromRequest(request) }
          : {}),
        client:
          body?.client && typeof body.client === "object" && !Array.isArray(body.client)
            ? body.client
            : {},
      };

      const resolvedAssetId = body.playbackRef || body.assetId;
      const session = resolvedAssetId
        ? await client.createPlaybackSession({ ...input, assetId: String(resolvedAssetId) })
        : await client.createSourcePlaybackSession({
            ...input,
            src: body.src || body.youtubeUrl,
            title: body.title,
          });

      return Response.json(session, {
        status: 201,
        headers: { "cache-control": "no-store" },
      });
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
