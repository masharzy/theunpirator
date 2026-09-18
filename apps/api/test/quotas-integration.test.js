import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@unpirator/db";
import { plans, subscriptions, tenants } from "@unpirator/db/schema";
import {
  readQuotaRollups,
  reserveDeliveryQuotaTx,
  reserveMeteredQuotaTx,
  getActiveQuotaContext,
} from "../src/services/quotas.js";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("PostgreSQL quota enforcement", () => {
  let database;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const zeroPlanId = `quota-zero-${suffix}`;
  const openPlanId = `quota-open-${suffix}`;
  let zeroTenant;
  let openTenant;

  beforeAll(async () => {
    database = createDatabase(url);
    [zeroTenant] = await database.db
      .insert(tenants)
      .values({ name: `Quota zero ${suffix}` })
      .returning();
    [openTenant] = await database.db
      .insert(tenants)
      .values({ name: `Quota open ${suffix}` })
      .returning();
    await database.db.insert(plans).values([
      {
        id: zeroPlanId,
        name: "Zero quota",
        status: "active",
        entitlements: {
          monthly_playback_sessions: 0,
          monthly_gateway_requests: 0,
          monthly_egress_bytes: 0,
        },
      },
      { id: openPlanId, name: "Uncapped quota", status: "active", entitlements: {} },
    ]);
    const start = new Date();
    const end = new Date(Date.now() + 86400_000);
    await database.db.insert(subscriptions).values([
      {
        tenantId: zeroTenant.id,
        planId: zeroPlanId,
        status: "active",
        periodStart: start,
        periodEnd: end,
      },
      {
        tenantId: openTenant.id,
        planId: openPlanId,
        status: "active",
        periodStart: start,
        periodEnd: end,
      },
    ]);
  });

  afterAll(async () => {
    await database?.client.end();
  });

  it("treats explicit zero as a hard playback-session cap", async () => {
    const result = await database.db.transaction((tx) =>
      reserveMeteredQuotaTx(tx, {
        tenantId: zeroTenant.id,
        metric: "playback_sessions",
        quantity: 1,
      }),
    );
    expect(result).toMatchObject({
      allowed: false,
      code: "PLAN_QUOTA_EXCEEDED",
      used: 0,
      limit: 0,
    });
  });

  it("treats missing caps as uncapped and records usage per tenant", async () => {
    const result = await database.db.transaction((tx) =>
      reserveMeteredQuotaTx(tx, {
        tenantId: openTenant.id,
        metric: "playback_sessions",
        quantity: 1,
      }),
    );
    expect(result).toMatchObject({ allowed: true, used: 0, next: 1, limit: null });
    const context = await getActiveQuotaContext(database.db, openTenant.id);
    const rollups = await readQuotaRollups(database.db, openTenant.id, context);
    expect(rollups.playback_sessions).toBe(1);

    const zeroContext = await getActiveQuotaContext(database.db, zeroTenant.id);
    const zeroRollups = await readQuotaRollups(database.db, zeroTenant.id, zeroContext);
    expect(zeroRollups.playback_sessions).toBe(0);
  });

  it("atomically blocks delivery when either request or egress cap is exhausted", async () => {
    const result = await database.db.transaction((tx) =>
      reserveDeliveryQuotaTx(tx, { tenantId: zeroTenant.id, bytes: 1024 }),
    );
    expect(result).toMatchObject({
      allowed: false,
      code: "PLAN_QUOTA_EXCEEDED",
      metric: "gateway_requests",
      limit: 0,
    });
  });
});
