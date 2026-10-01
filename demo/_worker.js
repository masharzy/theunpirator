// The Unpirator demo — advanced-mode Pages Worker.
// POST /api/unpirator/playback proxies to the control API with the demo API
// key (server-side only); everything else serves the static demo assets.
const JSON_HEADERS = { "content-type": "application/json" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/unpirator/playback" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: { message: "Invalid JSON body" } }), { status: 400, headers: JSON_HEADERS });
      }
      if (!body?.assetId)
        return new Response(JSON.stringify({ error: { message: "assetId is required" } }), { status: 400, headers: JSON_HEADERS });

      const payload = {
        siteId: env.DEMO_SITE_ID,
        assetId: String(body.assetId),
        email: env.DEMO_VIEWER_EMAIL || "new@gmail.com",
        deviceId: String(body.deviceId || "demo-viewer-0001").slice(0, 64),
        client: body.client && typeof body.client === "object" ? body.client : {},
        viewerIp: request.headers.get("cf-connecting-ip") || undefined,
        viewerUserAgent: request.headers.get("user-agent") || "cloudflare-pages-demo",
      };

      const upstream = await fetch(`${env.UNPIRATOR_API_BASE}/v1/playback/sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.UNPIRATOR_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await upstream.json().catch(() => ({}));
      return new Response(JSON.stringify(data), { status: upstream.status, headers: JSON_HEADERS });
    }
    return env.ASSETS.fetch(request);
  },
};
