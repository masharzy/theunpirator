import { describe, it, expect, vi, afterEach } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import gateway from "../src/index.js";
import { proxyPrimary } from "../src/proxy.js";
import { rewriteHlsManifest } from "../src/hls.js";
import { assertSourceUrl } from "../src/origin-policy.js";
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
describe("media delivery", () => {
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
