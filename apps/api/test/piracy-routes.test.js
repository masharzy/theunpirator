import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import express from "express";
import supertest from "supertest";
import { createDatabase } from "@unpirator/db";
import {
  accounts,
  auditLogs,
  piracyFindings,
  piracyWatchlists,
  plans,
  subscriptions,
  tenants,
} from "@unpirator/db/schema";
import { piracyRouter } from "../src/routes/piracy.js";

const url = process.env.TEST_DATABASE_URL;

function memoryCache() {
  const store = new Map();
  return {
    async incr(key) {
      store.set(key, (store.get(key) || 0) + 1);
      return store.get(key);
    },
    async expire() {},
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value) {
      store.set(key, value);
    },
    async del(key) {
      store.delete(key);
    },
    async ping() {
      return "PONG";
    },
  };
}

describe.skipIf(!url)("piracy routes", () => {
  let db;
  let client;
  let tenant;
  let account;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function buildApp() {
    const app = express();
    app.use(express.json());
    const stubAuth = (req, _res, next) => {
      req.tenantId = tenant.id;
      req.auth = { accountId: account.id };
      next();
    };
    app.use(
      "/v1/piracy",
      piracyRouter({
        db,
        cache: memoryCache(),
        requireTenantViewer: stubAuth,
        requireTenantAdmin: stubAuth,
      }),
    );
    return app;
  }

  const post = (app, path, body) => supertest(app).post(path).send(body);
  const get = (app, path) => supertest(app).get(path);
  const patch = (app, path, body) => supertest(app).patch(path).send(body);

  beforeAll(async () => {
    const database = createDatabase(url);
    db = database.db;
    client = database.client;
    [tenant] = await db
      .insert(tenants)
      .values({ name: `Piracy tenant ${suffix}` })
      .returning();
    [account] = await db
      .insert(accounts)
      .values({ email: `piracy-${suffix}@example.com` })
      .returning();
    const [plan] = await db
      .insert(plans)
      .values({
        id: `piracy-plan-${suffix}`,
        name: "Piracy plan",
        status: "active",
        entitlements: { piracy_scan: true },
      })
      .returning();
    await db.insert(subscriptions).values({
      tenantId: tenant.id,
      planId: plan.id,
      status: "active",
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 86400_000),
    });
  });

  afterAll(async () => {
    // audit_logs has no cascade on tenant_id, so clear it before the tenant.
    await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenant.id));
    await db.delete(tenants).where(eq(tenants.id, tenant.id));
    await client.end();
  });

  it("creates, updates and lists a watchlist", async () => {
    const app = buildApp();
    const created = await post(app, "/v1/piracy/watchlists", {
      name: "HSC leak watch",
      keywords: ["hsc 24 full course", "10ms bundle free"],
      telegramChannels: ["@freecoursesbd", "another_one"],
    });
    expect(created.status).toBe(201);
    expect(created.body.watchlist.telegramChannels).toEqual(["freecoursesbd", "another_one"]);

    const listed = await get(app, "/v1/piracy/watchlists");
    expect(listed.body.items.map((item) => item.name)).toContain("HSC leak watch");

    const updated = await patch(app, `/v1/piracy/watchlists/${created.body.watchlist.id}`, {
      enabled: false,
    });
    expect(updated.body.watchlist.enabled).toBe(false);
  });

  it("manual findings dedupe by normalized URL and can be closed", async () => {
    const app = buildApp();
    const first = await post(app, "/v1/piracy/findings/manual", {
      url: "https://t.me/freecoursesbd/999?utm_source=x",
      title: "leak",
    });
    expect(first.status).toBe(201);
    expect(first.body.duplicate).toBe(false);

    const again = await post(app, "/v1/piracy/findings/manual", {
      url: "https://t.me/freecoursesbd/999",
    });
    expect(again.body.duplicate).toBe(true);
    expect(again.body.finding.id).toBe(first.body.finding.id);

    const closed = await patch(app, `/v1/piracy/findings/${first.body.finding.id}/status`, {
      status: "false_positive",
    });
    expect(closed.body.finding.status).toBe("false_positive");
  });

  it("opens a case on a finding and generates a DMCA notice", async () => {
    const app = buildApp();
    const finding = await post(app, "/v1/piracy/findings/manual", {
      url: `https://example.net/leak-${suffix}`,
    });
    expect(finding.status).toBe(201);
    const caseResponse = await post(app, `/v1/piracy/findings/${finding.body.finding.id}/cases`, {
      platform: "web_host",
    });
    expect(caseResponse.status).toBe(201);

    const notice = await get(app, `/v1/piracy/cases/${caseResponse.body.case.id}/notice`);
    expect(notice.body.notice.to).toBe("abuse@example.net");
    expect(notice.body.notice.body).toContain(`https://example.net/leak-${suffix}`);

    const updated = await patch(app, `/v1/piracy/cases/${caseResponse.body.case.id}`, {
      status: "notice_sent",
      noticeChannel: "email",
    });
    expect(updated.body.case.status).toBe("notice_sent");
    expect(updated.body.case.noticeSentAt).toBeTruthy();
  });

  it("runs an on-demand scan without configured sources and reports zero findings", async () => {
    const app = buildApp();
    await post(app, "/v1/piracy/watchlists", {
      name: "Empty watchlist",
      keywords: ["never matched anywhere"],
      telegramChannels: [],
    });
    const response = await post(app, "/v1/piracy/scan", {});
    expect(response.status).toBe(200);
    expect(response.body.summary.newFindings).toBe(0);
  });

  it("keeps findings tenant-scoped", async () => {
    const app = buildApp();
    const [otherTenant] = await db
      .insert(tenants)
      .values({ name: `Other tenant ${suffix}` })
      .returning();
    await db.insert(piracyFindings).values({
      tenantId: otherTenant.id,
      source: "manual",
      url: `https://example.net/other-${suffix}`,
      urlHash: `hash-other-${suffix}`,
    });
    const listed = await get(app, "/v1/piracy/findings");
    expect(listed.body.items.map((item) => item.url)).not.toContain(
      `https://example.net/other-${suffix}`,
    );
    await db.delete(tenants).where(eq(tenants.id, otherTenant.id));
  });

  it("deletes a watchlist", async () => {
    const app = buildApp();
    const created = await post(app, "/v1/piracy/watchlists", {
      name: "Doomed watchlist",
      keywords: ["some keyword"],
    });
    const deleted = await supertest(app).delete(
      `/v1/piracy/watchlists/${created.body.watchlist.id}`,
    );
    expect(deleted.status).toBe(204);
    const rows = await db
      .select()
      .from(piracyWatchlists)
      .where(eq(piracyWatchlists.id, created.body.watchlist.id));
    expect(rows).toHaveLength(0);
  });
});
