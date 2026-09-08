import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { createApp } from "../src/create-app.js";
import { loadConfig } from "../src/config.js";
import { createDatabase } from "@unpirator/db";
import { eq } from "drizzle-orm";
import {
  accounts,
  accountSessions,
  assets,
  auditLogs,
  featureFlags,
  siteDomains,
  subscriptions,
} from "@unpirator/db/schema";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("PostgreSQL API integration", () => {
  let app,
    database,
    agent,
    other,
    admin,
    tenant,
    otherTenant,
    adminAccountId,
    csrf,
    site,
    asset,
    apiKey;
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
      YOUTUBE_CUSTOM_GLOBAL: "true",
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
        error(...args) {
          if (process.env.DEBUG_INTEGRATION) console.error(...args);
        },
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
      const registered = await client.post("/v1/auth/register").send({
        tenantName: `Integration ${name}`,
        email,
        password: "Local-integration-password1",
      });
      expect(registered.status).toBe(201);
      await database.db
        .update(accounts)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(accounts.email, email));
      if (name === "a") tenant = registered.body.tenant.id;
      else otherTenant = registered.body.tenant.id;
      expect(
        (
          await client
            .post("/v1/auth/login")
            .send({ email, password: "Local-integration-password1" })
        ).status,
      ).toBe(200);
    }
    admin = request.agent(app);
    const adminEmail = `admin-${run}@integration.example`;
    const adminRegistration = await admin.post("/v1/auth/register").send({
      tenantName: "Integration admin",
      email: adminEmail,
      password: "Local-integration-password1",
    });
    expect(adminRegistration.status).toBe(201);
    adminAccountId = adminRegistration.body.account.id;
    const mfaNow = new Date();
    await database.db
      .update(accounts)
      .set({ emailVerifiedAt: mfaNow, platformRole: "super_admin", mfaConfirmedAt: mfaNow })
      .where(eq(accounts.id, adminAccountId));
    await database.db
      .update(accountSessions)
      .set({ mfaVerifiedAt: mfaNow })
      .where(eq(accountSessions.accountId, adminAccountId));
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
  it("serves the complete administrator command center", async () => {
    const startedAt = Date.now();
    const response = await admin.get("/v1/admin/command-center?range=today");
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(Date.now() - startedAt).toBeLessThan(3000);
    expect(response.body.serviceHealth).toHaveLength(10);
    expect(Object.keys(response.body.workspaceRankings)).toEqual(
      expect.arrayContaining([
        "egress_bytes",
        "gateway_requests",
        "playback_minutes",
        "sessions",
        "viewers",
        "active_devices",
      ]),
    );
    expect(Object.keys(response.body.assetRankings)).toEqual(
      expect.arrayContaining(["egress_bytes", "plays", "viewers", "errors"]),
    );
  });
  it("serves cursor-paginated workspace operations data", async () => {
    const response = await admin.get("/v1/admin/tenants?sort=usage");
    expect(response.status).toBe(200);
    expect(response.body.items[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        usage_percent: expect.toSatisfy((value) => value === null || value !== undefined),
        monthly_bandwidth: expect.anything(),
        security_alerts: expect.any(Number),
      }),
    );
  });
  it("audits the complete impersonation lifecycle as the administrator", async () => {
    const adminCsrf = (await admin.get("/v1/auth/csrf")).body.csrfToken;
    const started = await admin
      .post(`/v1/admin/tenants/${tenant}/impersonate`)
      .set("x-csrf-token", adminCsrf)
      .send({ reason: "Investigating a customer support request" });
    expect(started.status).toBe(200);
    const mutation = await admin
      .patch("/v1/workspace/settings")
      .set("x-tenant-id", tenant)
      .set("x-csrf-token", adminCsrf)
      .send({ timezone: "Asia/Dhaka" });
    expect(mutation.status).toBe(200);
    const ended = await admin.delete("/v1/admin/impersonation").set("x-csrf-token", adminCsrf);
    expect(ended.status).toBe(200);
    await expect
      .poll(async () => {
        const rows = await database.db
          .select({ action: auditLogs.action, actorAccountId: auditLogs.actorAccountId })
          .from(auditLogs)
          .where(eq(auditLogs.tenantId, tenant));
        const lifecycle = new Set(
          rows.filter((row) => row.actorAccountId === adminAccountId).map((row) => row.action),
        );
        return ["IMPERSONATION_STARTED", "IMPERSONATION_ACTION", "IMPERSONATION_ENDED"].every(
          (action) => lifecycle.has(action),
        );
      })
      .toBe(true);
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
  it("creates and reuses an internal YouTube asset on demand", async () => {
    for (const [scopeType, scopeId] of [
      ["global", "global"],
      ["tenant", tenant],
    ]) {
      await database.db
        .insert(featureFlags)
        .values({ key: "youtube_custom", scopeType, scopeId, enabled: true })
        .onConflictDoUpdate({
          target: [featureFlags.key, featureFlags.scopeType, featureFlags.scopeId],
          set: { enabled: true },
        });
    }
    const youtubeInput = {
      siteId: site,
      source: { provider: "youtube_custom", url: "https://youtu.be/abc123DEF45" },
      externalUserId: `youtube-viewer-${run}`,
      deviceId: "youtube-device-integration",
    };
    const first = await request(app)
      .post("/v1/playback/sessions")
      .set("authorization", `Bearer ${apiKey.secret}`)
      .send(youtubeInput);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const second = await request(app)
      .post("/v1/playback/sessions")
      .set("authorization", `Bearer ${apiKey.secret}`)
      .send({ ...youtubeInput, externalUserId: `youtube-viewer-2-${run}` });
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    const managed = await database.db
      .select()
      .from(assets)
      .where(eq(assets.providerReference, "https://www.youtube.com/watch?v=abc123DEF45"));
    expect(managed).toHaveLength(1);
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
