// Seeds the production plan catalog for the Bangladesh market.
// Idempotent: re-running updates the existing plans in place.
//
//   node scripts/seed-plans.js                    # uses DATABASE_URL from .env
//   DATABASE_URL=... node scripts/seed-plans.js   # explicit target
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../packages/db/src/index.js";

try {
  loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const GB = 1024 ** 3;

const plans = [
  {
    id: "starter-monthly",
    name: "Starter",
    description: "Solo teachers and small tuitions — protected video streaming with watermark.",
    priceMinor: 40000, // ৳400
    sortOrder: 10,
    badge: null,
    entitlements: {
      secure_gateway: true,
      protected_delivery: true,
      dynamic_watermark: true,
      device_control: true,
      max_sites: 1,
      max_assets: 300,
      monthly_egress_bytes: 100 * GB,
      security_event_retention_days: 60,
      audit_log_retention_days: 60,
      session_policy: "block_new",
    },
  },
  {
    id: "pro-monthly",
    name: "Pro",
    description: "Full anti-leak setup — device control, webhooks and automatic piracy monitoring.",
    priceMinor: 100000, // ৳1,000
    sortOrder: 20,
    badge: "Most popular",
    entitlements: {
      secure_gateway: true,
      protected_delivery: true,
      player_integrity: true,
      dynamic_watermark: true,
      device_control: true,
      concurrent_stream_control: true,
      piracy_scan: true,
      max_sites: 5,
      max_assets: 2000,
      monthly_egress_bytes: 500 * GB,
      security_event_retention_days: 180,
      audit_log_retention_days: 180,
      session_policy: "block_new",
    },
  },
  {
    id: "business-monthly",
    name: "Business",
    description:
      "For established edtechs — multi-site, high volume, long retention, everything included.",
    priceMinor: 300000, // ৳3,000
    sortOrder: 30,
    badge: null,
    entitlements: {
      secure_gateway: true,
      protected_delivery: true,
      player_integrity: true,
      dynamic_watermark: true,
      device_control: true,
      concurrent_stream_control: true,
      piracy_scan: true,
      max_sites: 25,
      max_assets: 20000,
      monthly_egress_bytes: 2000 * GB,
      security_event_retention_days: 365,
      audit_log_retention_days: 365,
      session_policy: "block_new",
    },
  },
];

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const { client } = createDatabase(url);
try {
  for (const plan of plans) {
    await client`
      INSERT INTO plans (id, name, description, price_minor, currency, billing_interval,
                         duration_days, trial_days, status, is_public, sort_order, badge, entitlements)
      VALUES (${plan.id}, ${plan.name}, ${plan.description}, ${plan.priceMinor}, 'BDT', 'month',
              30, 14, 'active', true, ${plan.sortOrder}, ${plan.badge}, ${JSON.stringify(plan.entitlements)})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price_minor = EXCLUDED.price_minor,
        currency = 'BDT',
        billing_interval = 'month',
        duration_days = 30,
        trial_days = 14,
        status = 'active',
        is_public = true,
        sort_order = EXCLUDED.sort_order,
        badge = EXCLUDED.badge,
        entitlements = EXCLUDED.entitlements,
        updated_at = now()`;
    console.log(`Seeded ${plan.id} (${plan.name} — ৳${plan.priceMinor / 100}/month)`);
  }
  console.log("Plan catalog ready.");
} finally {
  await client.end();
}
