import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDatabase } from "@unpirator/db";
import { eq } from "drizzle-orm";
import { siteDomains, subscriptions } from "@unpirator/db/schema";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("PostgreSQL API integration", () => {
  let app, database, agent, other, tenant, otherTenant, csrf, site, asset, apiKey;
  const run = randomUUID().slice(0, 8);
  beforeAll(async () => {
    if (!new URL(url).pathname.endsWith("_test"))
      throw new Error("Integration tests require a dedicated _test database");
    database = createDatabase(url);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: url,
      APP_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString("base64"),
      SIGNING_KEYS_B64: Buffer.from(
        JSON.stringify([
          {
            kid: "test",
            privateJwk: privateKey.export({ format: "jwk" }),
            publicJwk: publicKey.export({ format: "jwk" }),
          },
        ]),
      ).toString("base64"),
      ACTIVE_SIGNING_KID: "test",
      GATEWAY_CONTROL_SECRET: "test-control-secret",
      GATEWAY_INTERNAL_SECRET: "test-internal-secret",
    });
    const values = new Map();
    const cache = {
      get: async (k) => values.get(k),
      set: async (k, v) => values.set(k, v),
      incr: async () => 1,
      expire: async () => 1,
      ping: async () => "PONG",
    };
    ({ app } = createApp({
      config,
      database,
      cache,
      gatewayControl: { syncSession: async () => {} },
      logger: {
        child() {
          return this;
        },
        info() {},
        error() {},
        warn() {},
      },
    }));
    agent = request.agent(app);
    other = request.agent(app);
    for (const [client, name] of [
      [agent, "a"],
      [other, "b"],
    ]) {
      const email = `${name}-${run}@integration.example`;
      const registered = await client
        .post("/v1/auth/register")
        .send({ tenantName: `Integration ${name}`, email, password: "local-integration-password" });
      expect(registered.status).toBe(201);
      if (name === "a") tenant = registered.body.tenant.id;
      else otherTenant = registered.body.tenant.id;
      expect(
        (
          await client
            .post("/v1/auth/login")
            .send({ email, password: "local-integration-password" })
        ).status,
      ).toBe(200);
    }
    csrf = (await agent.get("/v1/auth/csrf")).body.csrfToken;
  }, 30000);
  afterAll(async () => {
    await database?.client.end();
  });
  it("reports real database and cache readiness", async () => {
    expect((await agent.get("/health/ready")).status).toBe(200);
  });
  it("denies forged cross-tenant ownership", async () => {
    expect((await agent.get("/v1/sites").set("x-tenant-id", otherTenant)).status).toBe(403);
  });
  it("denies customer access to Super Admin", async () => {
    expect((await agent.get("/v1/admin/tenants")).status).toBe(403);
  });
  it("requires CSRF for dashboard writes", async () => {
    expect(
      (
        await agent
          .post("/v1/sites")
          .set("x-tenant-id", tenant)
          .send({ name: "Test", domain: "learn.example.com" })
      ).status,
    ).toBe(403);
  });
  it("creates a site and exposes its DNS challenge", async () => {
    const r = await agent
      .post("/v1/sites")
      .set("x-tenant-id", tenant)
      .set("x-csrf-token", csrf)
      .send({ name: "Test course", domain: `learn-${run}.example.com` });
    expect(r.status).toBe(201);
    site = r.body.site.id;
    const domains = await agent.get(`/v1/sites/${site}/domains`).set("x-tenant-id", tenant);
    expect(domains.body.items[0].dns.value).toMatch(/^unpirator-verification=/);
  });
  it("rejects foreign-site assets", async () => {
    const bcsrf = (await other.get("/v1/auth/csrf")).body.csrfToken;
    const r = await other
      .post("/v1/assets")
      .set("x-tenant-id", otherTenant)
      .set("x-csrf-token", bcsrf)
      .send({
        siteId: site,
        title: "Foreign",
        provider: "direct",
        providerReference: "https://media.example.com/v.mp4",
        allowedHosts: ["media.example.com"],
      });
    expect(r.status).toBe(404);
  });
  it("creates a scoped key and authorized asset", async () => {
    const r = await agent
      .post("/v1/assets")
      .set("x-tenant-id", tenant)
      .set("x-csrf-token", csrf)
      .send({
        siteId: site,
        title: "Course video",
        provider: "direct",
        providerReference: "https://media.example.com/v.mp4",
        allowedHosts: ["media.example.com"],
      });
    expect(r.status).toBe(201);
    asset = r.body.asset.id;
    const k = await agent
      .post("/v1/api-keys")
      .set("x-tenant-id", tenant)
      .set("x-csrf-token", csrf)
      .send({ name: "Test", scopes: ["playback:create"] });
    expect(k.status).toBe(201);
    apiKey = k.body;
  });
  const input = () => ({
    siteId: site,
    assetId: asset,
    externalUserId: `viewer-${run}`,
    deviceId: "device-integration",
  });
  const play = (key) =>
    request(app)
      .post("/v1/playback/sessions")
      .set("authorization", `Bearer ${apiKey.secret}`)
      .set("idempotency-key", key)
      .send(input());
  it("requires verified domains before playback", async () => {
    expect((await play("unverified")).status).toBe(409);
  });
  it("serializes simultaneous idempotent session requests", async () => {
    await database.db
      .update(siteDomains)
      .set({ verifiedAt: new Date() })
      .where(eq(siteDomains.siteId, site));
    const [a, b] = await Promise.all([play("duplicate"), play("duplicate")]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.sessionId).toBe(b.body.sessionId);
    expect(a.body.playbackUrl).not.toContain("media.example.com");
  });
  it("enforces concurrency for new requests", async () => {
    expect((await play("new-request")).status).toBe(409);
  });
  it("refuses playback when subscription is canceled", async () => {
    await database.db
      .update(subscriptions)
      .set({ status: "canceled" })
      .where(eq(subscriptions.tenantId, tenant));
    expect((await play("canceled")).status).toBe(403);
  });
  it("rejects revoked API keys", async () => {
    expect(
      (
        await agent
          .post(`/v1/api-keys/${apiKey.key.id}/revoke`)
          .set("x-tenant-id", tenant)
          .set("x-csrf-token", csrf)
      ).status,
    ).toBe(204);
    expect((await play("revoked")).status).toBe(401);
  });
});
