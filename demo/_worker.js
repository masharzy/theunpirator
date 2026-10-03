// The Unpirator demo — advanced-mode Pages Worker.
// POST /api/unpirator/playback proxies to the control API with the demo API
// key (server-side only). The media gateway is exposed to the player only
// through /gw/* (same-origin proxy over the permanent ngrok tunnel): browser
// fetches never hit ngrok directly, so no interstitial and no cross-origin
// failures. Everything else serves the static demo assets.
const JSON_HEADERS = { "content-type": "application/json" };
const PASSTHROUGH_REQUEST_HEADERS = ["authorization", "content-type", "range", "origin", "user-agent"];
const PASSTHROUGH_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
  "server-timing",
  "x-unpirator-iv",
  "x-unpirator-context",
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const gatewayBase = env.UNPIRATOR_GATEWAY_BASE;

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
      // Point the player at the same-origin gateway proxy instead of the tunnel host.
      const serialized = gatewayBase
        ? JSON.stringify(data).split(gatewayBase).join(`${url.origin}/gw`)
        : JSON.stringify(data);
      return new Response(serialized, { status: upstream.status, headers: JSON_HEADERS });
    }

    if (gatewayBase && url.pathname.startsWith("/gw/") && request.method !== "OPTIONS") {
      const target = `${gatewayBase}${url.pathname.slice(3)}${url.search}`;
      const headers = new Headers();
      for (const name of PASSTHROUGH_REQUEST_HEADERS) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      headers.set("ngrok-skip-browser-warning", "1");
      const upstream = await fetch(target, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      });
      if ((upstream.headers.get("content-type") || "").includes("json")) {
        const text = await upstream.text();
        return new Response(text.split(gatewayBase).join(`${url.origin}/gw`), {
          status: upstream.status,
          headers: JSON_HEADERS,
        });
      }
      const responseHeaders = new Headers();
      for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
    }

    return env.ASSETS.fetch(request);
  },
};
