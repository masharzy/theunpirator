export class SessionState {
  constructor(state) {
    this.state = state;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/state") {
      const body = await request.json();
      const ttlSeconds = Math.max(30, Math.min(Number(body.ttlSeconds || 300), 86400));
      await this.state.storage.put("session", {
        status: body.status,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      await this.state.storage.setAlarm(Date.now() + ttlSeconds * 1000 + 1000);
      return Response.json({ ok: true });
    }
    if (request.method === "GET" && url.pathname === "/state") {
      const value = await this.state.storage.get("session");
      if (!value || value.expiresAt <= Date.now()) return Response.json({ status: "unknown" });
      return Response.json({ status: value.status, expiresAt: value.expiresAt });
    }
    return new Response("Not found", { status: 404 });
  }
  async alarm() {
    await this.state.storage.deleteAll();
  }
}
