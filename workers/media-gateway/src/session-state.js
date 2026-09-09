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
        lastIntegrityAt: Date.now(),
        startedAt: Date.now(),
        allowedSequence: 8,
      });
      await this.state.storage.setAlarm(Date.now() + ttlSeconds * 1000 + 1000);
      return Response.json({ ok: true });
    }
    if (request.method === "POST" && url.pathname === "/crypto") {
      const body = await request.json();
      const session = await this.state.storage.get("session");
      if (!session || session.status !== "active" || session.expiresAt <= Date.now())
        return Response.json({ error: "inactive" }, { status: 403 });
      await this.state.storage.put("mediaKey", body.keyBase64);
      session.lastIntegrityAt = Date.now();
      await this.state.storage.put("session", session);
      return Response.json({ ok: true });
    }
    if (request.method === "POST" && url.pathname === "/integrity") {
      const body = await request.json();
      const session = await this.state.storage.get("session");
      if (!session || session.status !== "active" || session.expiresAt <= Date.now())
        return Response.json({ error: "inactive" }, { status: 403 });
      if (body.tampered === true) {
        session.status = "blocked";
        await this.state.storage.put("session", session);
        await this.state.storage.delete("mediaKey");
        return Response.json({ error: "blocked" }, { status: 403 });
      }
      const elapsedSeconds = Math.max(0, (Date.now() - (session.startedAt || Date.now())) / 1000);
      const sequence = Math.max(0, Math.min(Number(body.sequence || 0), 1_000_000));
      session.lastIntegrityAt = Date.now();
      session.startedAt ||= Date.now();
      session.allowedSequence = Math.max(
        Number(session.allowedSequence || 8),
        Math.min(sequence + 8, Math.floor(elapsedSeconds / 2) + 16),
      );
      await this.state.storage.put("session", session);
      return Response.json({ ok: true, allowedSequence: session.allowedSequence });
    }
    if (request.method === "POST" && url.pathname === "/ticket") {
      const body = await request.json();
      const session = await this.state.storage.get("session");
      const sequence = Number(body.sequence);
      if (
        !session ||
        session.status !== "active" ||
        session.expiresAt <= Date.now() ||
        Date.now() - Number(session.lastIntegrityAt || 0) > 15_000 ||
        !["video", "audio"].includes(body.track) ||
        !Number.isInteger(body.variant) ||
        body.variant < 0 ||
        !Number.isInteger(sequence) ||
        sequence < 0 ||
        sequence > Number(session.allowedSequence || 8)
      )
        return Response.json({ error: "denied" }, { status: 403 });
      const usageKey = `usage:${body.track}:${body.variant}:${sequence}`;
      const attempts = Number((await this.state.storage.get(usageKey)) || 0);
      // Tickets remain single-use. A small mint allowance lets the player recover when
      // the upstream range fetch fails after a ticket has already been consumed.
      if (attempts >= 8) return Response.json({ error: "replay" }, { status: 403 });
      await this.state.storage.put(usageKey, attempts + 1);
      const ticket = crypto.randomUUID() + crypto.randomUUID();
      await this.state.storage.put(`ticket:${ticket}`, {
        track: body.track,
        variant: body.variant,
        sequence,
        expiresAt: Date.now() + 20_000,
      });
      return Response.json({ ticket, expiresIn: 20 });
    }
    if (request.method === "POST" && url.pathname === "/consume") {
      const body = await request.json();
      const key = `ticket:${body.ticket || ""}`;
      const [session, ticket, mediaKey] = await Promise.all([
        this.state.storage.get("session"),
        this.state.storage.get(key),
        this.state.storage.get("mediaKey"),
      ]);
      if (
        !session ||
        session.status !== "active" ||
        Date.now() - Number(session.lastIntegrityAt || 0) > 15_000 ||
        !ticket ||
        ticket.expiresAt <= Date.now() ||
        ticket.track !== body.track ||
        ticket.variant !== body.variant ||
        ticket.sequence !== body.sequence ||
        !mediaKey
      )
        return Response.json({ error: "denied" }, { status: 403 });
      await this.state.storage.delete(key);
      return Response.json({ ok: true, keyBase64: mediaKey });
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
