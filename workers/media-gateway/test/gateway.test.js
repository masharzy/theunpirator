import { describe, it, expect, vi, afterEach } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import gateway, { readToken } from "../src/index.js";
import { proxyPrimary } from "../src/proxy.js";
import { rewriteHlsManifest } from "../src/hls.js";
import { assertSourceUrl } from "../src/origin-policy.js";
import { parseSidx } from "../src/protected-media.js";
import { SessionState } from "../src/session-state.js";
import { verifyPlaybackToken } from "../src/token.js";
const aid = "12345678-1234-1234-1234-123456789012";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const env = {
  PLAYBACK_PUBLIC_KEYS_B64: Buffer.from(
    JSON.stringify([{ kid: "test", publicJwk: publicKey.export({ format: "jwk" }) }]),
  ).toString("base64"),
  REQUIRE_SESSION_STATE: "true",
  REQUIRE_ORIGIN: "true",
  SESSION_STATE: {
    idFromName: (v) => v,
    get: () => ({ fetch: async () => Response.json({ status: "revoked" }) }),
  },
};
function token(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({
      iss: "the-unpirator",
      iat: now,
      exp: now + 90,
      tid: "tenant",
      sid: "site",
      aid,
      psid: "session",
      ...overrides,
    }),
  ).toString("base64url");
  return `test.${body}.${sign(null, Buffer.from(`test.${body}`), privateKey).toString("base64url")}`;
}
const ctx = { waitUntil: () => {} };
const source = {
  url: "https://media.example.com/video.mp4",
  allowedHosts: ["media.example.com"],
  allowedOrigins: ["learn.example.com"],
  cacheTtlSeconds: 60,
};
const sourceEnv = { REQUIRE_ORIGIN: "true", SOURCE_CACHE: { get: async () => source } };
afterEach(() => vi.unstubAllGlobals());
describe("gateway authorization", () => {
  it("prefers the rotated HttpOnly cookie over a stale media query token", () => {
    const request = new Request("https://gateway.example/media?token=old", {
      headers: { cookie: "ap_playback=new" },
    });
    expect(readToken(request, new URL(request.url))).toBe("new");
  });
  it("fails closed when session storage is unavailable", async () => {
    const fetchState = vi.fn(async () => Response.json({}, { status: 503 }));
    const response = await gateway.fetch(
      new Request(`https://gateway.example/v/${aid}/media?token=${token()}`),
      {
        ...env,
        SESSION_STATE: { idFromName: (value) => value, get: () => ({ fetch: fetchState }) },
      },
      ctx,
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("SESSION_UNAVAILABLE");
    expect(fetchState).toHaveBeenCalledTimes(1);
  });
  it.each([429, 500, 503, 403])("preserves integrity denial semantics for %s", async (status) => {
    const configured = {
      ...env,
      SOURCE_CACHE: { get: async () => ["learn.example.com"] },
      SESSION_STATE: {
        idFromName: (value) => value,
        get: () => ({
          fetch: async (url) =>
            url.endsWith("/state")
              ? Response.json({ status: "active" })
              : Response.json({}, { status }),
        }),
      },
    };
    const response = await gateway.fetch(
      new Request(`https://gateway.example/v/${aid}/integrity`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token()}`,
          origin: "https://learn.example.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({ sequence: 1 }),
      }),
      configured,
      ctx,
    );
    expect(response.status).toBe(status === 403 ? 403 : 503);
    expect((await response.json()).error.code).toBe(
      status === 403 ? "PLAYER_INTEGRITY_LOST" : "INTEGRITY_UNAVAILABLE",
    );
  });
  it("rejects forged tokens", async () => {
    const r = await gateway.fetch(
      new Request(`https://gateway.example/v/${aid}/media?token=forged`),
      env,
      ctx,
    );
    expect(r.status).toBe(401);
  });
  it("rejects expired tokens", async () => {
    const r = await gateway.fetch(
      new Request(`https://gateway.example/v/${aid}/media?token=${token({ exp: 1 })}`),
      env,
      ctx,
    );
    expect(r.status).toBe(401);
  });
  it("permits a recently expired signed token only when refresh grace is explicit", async () => {
    const now = Math.floor(Date.now() / 1000);
    const value = token({ iat: now - 100, exp: now - 10 });
    await expect(verifyPlaybackToken(value, env, now)).rejects.toMatchObject({
      code: "TOKEN_EXPIRED",
    });
    await expect(verifyPlaybackToken(value, env, now, 15 * 60)).resolves.toMatchObject({ aid });
  });
  it("rejects a token for another asset", async () => {
    const r = await gateway.fetch(
      new Request(`https://gateway.example/v/${aid}/media?token=${token({ aid: "other" })}`),
      env,
      ctx,
    );
    expect(r.status).toBe(403);
  });
  it("rejects revoked sessions", async () => {
    const r = await gateway.fetch(
      new Request(`https://gateway.example/v/${aid}/media?token=${token()}`),
      env,
      ctx,
    );
    expect(r.status).toBe(403);
  });
  it("has no arbitrary URL proxy", async () => {
    expect(
      (
        await gateway.fetch(
          new Request("https://gateway.example/proxy?url=https://example.com"),
          env,
          ctx,
        )
      ).status,
    ).toBe(404);
  });
});
describe("protected segment state", () => {
  it("issues one-time bounded tickets and blocks them after tamper", async () => {
    const values = new Map();
    const object = new SessionState({
      storage: {
        get: async (key) => values.get(key),
        put: async (key, value) => values.set(key, value),
        delete: async (key) => values.delete(key),
        deleteAll: async () => values.clear(),
        setAlarm: async () => {},
      },
    });
    const post = (path, body) =>
      object.fetch(
        new Request(`https://session${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    expect((await post("/state", { status: "active", ttlSeconds: 300 })).status).toBe(200);
    expect((await post("/crypto", { keyBase64: "key" })).status).toBe(200);
    const issued = await post("/ticket", { track: "video", variant: 0, sequence: 1 });
    expect(issued.status).toBe(200);
    const { ticket } = await issued.json();
    const request = { ticket, track: "video", variant: 0, sequence: 1 };
    expect((await post("/consume", request)).status).toBe(200);
    expect((await post("/consume", request)).status).toBe(403);
    expect((await post("/integrity", { tampered: true })).status).toBe(403);
    expect((await post("/ticket", { track: "video", variant: 0, sequence: 2 })).status).toBe(403);
  });
  it("issues single-use tickets for encrypted HLS resources", async () => {
    const values = new Map();
    const object = new SessionState({
      storage: {
        get: async (key) => values.get(key),
        put: async (key, value) => values.set(key, value),
        delete: async (key) => values.delete(key),
        deleteAll: async () => values.clear(),
        setAlarm: async () => {},
      },
    });
    const post = (path, body) =>
      object.fetch(
        new Request(`https://session${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    await post("/state", { status: "active", ttlSeconds: 300 });
    await post("/crypto", { keyBase64: "key" });
    const issued = await post("/resource-ticket", { resourceId: "root" });
    expect(issued.status).toBe(200);
    const { ticket } = await issued.json();
    const request = { ticket, resourceId: "root" };
    expect((await post("/consume-resource", request)).status).toBe(200);
    expect((await post("/consume-resource", request)).status).toBe(403);
  });
});
describe("media delivery", () => {
  it("maps SIDX references to bounded protected byte ranges", () => {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    view.setUint32(0, 44);
    for (const [index, value] of [..."sidx"].entries())
      view.setUint8(4 + index, value.charCodeAt(0));
    view.setUint32(12, 1);
    view.setUint32(16, 1000);
    view.setUint32(20, 0);
    view.setUint32(24, 5);
    view.setUint16(28, 0);
    view.setUint16(30, 1);
    view.setUint32(32, 100);
    view.setUint32(36, 2000);
    view.setUint32(40, 0);

    expect(parseSidx(buffer, 99)).toEqual([
      { sequence: 1, start: 105, end: 204, durationMs: 2000 },
    ]);
  });
  it("refuses the direct media route for protected segment sources", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      proxyPrimary(
        new Request("https://gateway.example/media", {
          headers: { origin: "https://learn.example.com" },
        }),
        {
          REQUIRE_ORIGIN: "true",
          SOURCE_CACHE: {
            get: async () => ({ ...source, delivery: { mode: "protected_segments" } }),
          },
        },
        { tid: "t" },
        aid,
      ),
    ).rejects.toMatchObject({ code: "NATIVE_DELIVERY_DISABLED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refuses the plaintext media route for protected HLS sources", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      proxyPrimary(
        new Request("https://gateway.example/media", {
          headers: { origin: "https://learn.example.com" },
        }),
        {
          REQUIRE_ORIGIN: "true",
          SOURCE_CACHE: { get: async () => ({ ...source, manifestType: "hls" }) },
        },
        { tid: "t" },
        aid,
      ),
    ).rejects.toMatchObject({ code: "NATIVE_DELIVERY_DISABLED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("streams Range responses with correct headers", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response("abcd", {
          status: 206,
          headers: {
            "content-range": "bytes 0-3/20",
            "content-length": "4",
            "accept-ranges": "bytes",
          },
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const r = await proxyPrimary(
      new Request("https://gateway.example/media", {
        headers: { origin: "https://learn.example.com", range: "bytes=0-3" },
      }),
      sourceEnv,
      { tid: "t" },
      aid,
    );
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 0-3/20");
    expect(await r.text()).toBe("abcd");
    expect(fetcher.mock.calls[0][1].headers.get("range")).toBe("bytes=0-3");
  });
  it("rejects multi-range abuse before fetch", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(
      proxyPrimary(
        new Request("https://gateway.example/media", {
          headers: { origin: "https://learn.example.com", range: "bytes=0-1,3-4" },
        }),
        sourceEnv,
        { tid: "t" },
        aid,
      ),
    ).rejects.toMatchObject({ code: "INVALID_RANGE" });
    expect(f).not.toHaveBeenCalled();
  });
  it("does not follow origin redirects or expose their body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("secret", { status: 302, headers: { location: "http://localhost/" } }),
      ),
    );
    await expect(
      proxyPrimary(
        new Request("https://gateway.example/media", {
          headers: { origin: "https://learn.example.com" },
        }),
        sourceEnv,
        { tid: "t" },
        aid,
      ),
    ).rejects.toMatchObject({ code: "ORIGIN_REDIRECT_BLOCKED" });
  });
  it("sanitizes upstream failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("secret credential", { status: 500 })),
    );
    await expect(
      proxyPrimary(
        new Request("https://gateway.example/media", {
          headers: { origin: "https://learn.example.com" },
        }),
        sourceEnv,
        { tid: "t" },
        aid,
      ),
    ).rejects.toMatchObject({ message: "Media source unavailable" });
  });
  it("rejects mismatched viewer origin", async () => {
    await expect(
      proxyPrimary(
        new Request("https://gateway.example/media", {
          headers: { origin: "https://evil.example" },
        }),
        sourceEnv,
        { tid: "t" },
        aid,
      ),
    ).rejects.toMatchObject({ code: "DOMAIN_MISMATCH" });
  });
  it("rewrites nested playlists and refuses unregistered hosts", async () => {
    const put = vi.fn();
    const e = { SOURCE_CACHE: { put } };
    const text = await rewriteHlsManifest("#EXTM3U\nvariant.m3u8", source.url, aid, source, e);
    expect(text).not.toContain("media.example.com");
    expect(text).toContain(`/v/${aid}/hls/`);
    expect(put).toHaveBeenCalled();
    await expect(
      rewriteHlsManifest("#EXTM3U\nhttps://evil.example/segment.ts", source.url, aid, source, e),
    ).rejects.toMatchObject({ code: "SOURCE_HOST_BLOCKED" });
  });
  it.each([
    "http://127.0.0.1/a",
    "http://[::1]/a",
    "http://localhost/a",
    "https://user:password@media.example.com/a",
  ])("blocks unsafe sources: %s", (url) => {
    expect(() =>
      assertSourceUrl(url, ["127.0.0.1", "[::1]", "localhost", "media.example.com"]),
    ).toThrow();
  });
});
