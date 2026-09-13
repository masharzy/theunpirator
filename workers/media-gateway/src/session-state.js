export class SessionState {
  constructor(state) {
    this.state = state;
  }
  async fetch(request) {
    let response;
    if (this.state.storage.transaction) {
      response = await this.state.storage.transaction((storage) =>
        new SessionState({ storage }).handle(request.clone()),
      );
    } else {
      response = await this.handle(request);
    }
    if (
      request.method === "POST" &&
      new URL(request.url).pathname === "/state" &&
      response.ok &&
      this.state.storage.alarms !== false
    ) {
      const session = await this.state.storage.get("session");
      if (session) await this.state.storage.setAlarm?.(session.expiresAt + 1000);
    }
    return response;
  }
  async handle(request) {
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
      // Windows are computed from the trusted manifest by the gateway, never
      // forwarded from the browser. Seeking moves a bounded window, not a global
      // grant for every preceding segment.
      if (body.windows) session.windows = body.windows;
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
        (session.windows
          ? !this.inWindow(session, body)
          : sequence > Number(session.allowedSequence || 8))
      )
        return Response.json({ error: "denied" }, { status: 403 });
      const bucket = Math.floor(Date.now() / 60_000);
      const rateKey = `ticket-rate:${bucket}`;
      const count = Number((await this.state.storage.get(rateKey)) || 0);
      if (count >= 180) return Response.json({ error: "rate_limited" }, { status: 429 });
      const usageKey = `usage:${bucket}:${body.track}:${body.variant}:${sequence}`;
      const attempts = Number((await this.state.storage.get(usageKey)) || 0);
      // Tickets remain single-use. A small mint allowance lets the player recover when
      // the upstream range fetch fails after a ticket has already been consumed.
      if (attempts >= 8) return Response.json({ error: "replay" }, { status: 403 });
      await this.state.storage.put(usageKey, attempts + 1);
      await this.state.storage.put(rateKey, count + 1);
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
        session.expiresAt <= Date.now() ||
        Date.now() - Number(session.lastIntegrityAt || 0) > 15_000 ||
        !ticket ||
        ticket.expiresAt <= Date.now() ||
        ticket.track !== body.track ||
        ticket.variant !== body.variant ||
        ticket.sequence !== body.sequence ||
        (session.windows && !this.inWindow(session, ticket)) ||
        !mediaKey
      )
        return Response.json({ error: "denied" }, { status: 403 });
      await this.state.storage.delete(key);
      return Response.json({ ok: true, keyBase64: mediaKey });
    }
    if (request.method === "POST" && url.pathname === "/resource-ticket") {
      const body = await request.json();
      const session = await this.state.storage.get("session");
      const resourceId = String(body.resourceId || "");
      if (
        !session ||
        session.status !== "active" ||
        session.expiresAt <= Date.now() ||
        Date.now() - Number(session.lastIntegrityAt || 0) > 15_000 ||
        !/^(root|[a-f0-9]{40})$/.test(resourceId)
      )
        return Response.json({ error: "denied" }, { status: 403 });
      const bucket = Math.floor(Date.now() / 60_000);
      const rateKey = `resource-rate:${bucket}`;
      const count = Number((await this.state.storage.get(rateKey)) || 0);
      if (count >= 240) return Response.json({ error: "rate_limited" }, { status: 429 });
      const ticket = crypto.randomUUID() + crypto.randomUUID();
      await Promise.all([
        this.state.storage.put(rateKey, count + 1),
        this.state.storage.put(`resource-ticket:${ticket}`, {
          resourceId,
          expiresAt: Date.now() + 20_000,
        }),
      ]);
      return Response.json({ ticket, expiresIn: 20 });
    }
    if (request.method === "POST" && url.pathname === "/consume-resource") {
      const body = await request.json();
      const key = `resource-ticket:${body.ticket || ""}`;
      const [session, ticket, mediaKey] = await Promise.all([
        this.state.storage.get("session"),
        this.state.storage.get(key),
        this.state.storage.get("mediaKey"),
      ]);
      if (
        !session ||
        session.status !== "active" ||
        session.expiresAt <= Date.now() ||
        Date.now() - Number(session.lastIntegrityAt || 0) > 15_000 ||
        !ticket ||
        ticket.expiresAt <= Date.now() ||
        ticket.resourceId !== body.resourceId ||
        !mediaKey
      )
        return Response.json({ error: "denied" }, { status: 403 });
      await this.state.storage.delete(key);
      return Response.json({ ok: true, keyBase64: mediaKey });
    }
    if (request.method === "POST" && url.pathname === "/lease") {
      const body = await request.json();
      const session = await this.state.storage.get("session");
      if (
        !session ||
        session.status !== "active" ||
        session.expiresAt <= Date.now() ||
        Date.now() - session.lastIntegrityAt > 15000
      )
        return Response.json({ error: "inactive" }, { status: 403 });
      const bytes = body.bytes;
      if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 16 * 1024 * 1024)
        return Response.json({ error: "size" }, { status: 403 });
      const now = Date.now();
      const limits = (await this.state.storage.get("delivery-limits")) || {
        leases: {},
        bucket: 0,
        bytes: 0,
      };
      for (const [id, expiry] of Object.entries(limits.leases))
        if (expiry <= now) delete limits.leases[id];
      if (limits.bucket !== Math.floor(now / 60000)) {
        limits.bucket = Math.floor(now / 60000);
        limits.bytes = 0;
      }
      if (Object.keys(limits.leases).length >= 4 || limits.bytes + bytes > 128 * 1024 * 1024)
        return Response.json({ error: "rate_limited" }, { status: 429 });
      const lease = crypto.randomUUID();
      limits.leases[lease] = now + 60000;
      limits.bytes += bytes;
      await this.state.storage.put("delivery-limits", limits);
      return Response.json({ lease });
    }
    if (request.method === "POST" && url.pathname === "/release") {
      const body = await request.json();
      const limits = await this.state.storage.get("delivery-limits");
      if (limits) {
        delete limits.leases[body.lease];
        await this.state.storage.put("delivery-limits", limits);
      }
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
    const session = await this.state.storage.get("session");
    if (session?.expiresAt > Date.now()) {
      await this.state.storage.setAlarm(session.expiresAt + 1000);
      return;
    }
    await this.state.storage.deleteAll();
  }
  inWindow(session, item) {
    const window = session.windows[item.track];
    return (
      window &&
      window.variant === item.variant &&
      (item.sequence === 0 || (item.sequence >= window.min && item.sequence <= window.max))
    );
  }
}
