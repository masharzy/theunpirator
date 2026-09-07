import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../packages/db/src/index.js";
import { eq } from "../apps/api/node_modules/drizzle-orm/index.js";
import { siteDomains } from "../packages/db/src/schema.js";
loadEnvFile();
const database = createDatabase();
const api = "http://localhost:4100";
const run = randomUUID().slice(0, 8);
let cookie = "",
  csrf = "",
  tenant = "";
async function call(path, body, method = "POST", extra = {}) {
  const response = await fetch(api + path, {
    method,
    headers: {
      "content-type": "application/json",
      cookie,
      "x-csrf-token": csrf,
      "x-tenant-id": tenant,
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.headers.getSetCookie().length)
    cookie = response.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${response.status} ${data.error?.message || ""}`);
  return data;
}
try {
  const user = {
    tenantName: "Gateway verification",
    email: `gateway-${run}@example.com`,
    password: randomUUID() + "Aa1!",
  };
  tenant = (await call("/v1/auth/register", user)).tenant.id;
  await call("/v1/auth/login", { email: user.email, password: user.password });
  csrf = (await call("/v1/auth/csrf", null, "GET")).csrfToken;
  const site = (
    await call("/v1/sites", {
      name: "Local gateway verification",
      domain: `gateway-${run}.example.com`,
    })
  ).site;
  // This fixture is local-only. Production domain verification remains DNS-based.
  if (process.env.NODE_ENV !== "development")
    throw new Error("Local smoke test requires development");
  await database.db
    .update(siteDomains)
    .set({ domain: "localhost", verifiedAt: new Date() })
    .where(eq(siteDomains.siteId, site.id));
  const asset = (
    await call("/v1/assets", {
      siteId: site.id,
      title: "MDN CC0 flower sample",
      provider: "direct",
      providerReference: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      allowedHosts: ["interactive-examples.mdn.mozilla.net"],
    })
  ).asset;
  const key = await call("/v1/api-keys", { name: "Local smoke", scopes: ["playback:create"] });
  const grant = await call(
    "/v1/playback/sessions",
    {
      siteId: site.id,
      assetId: asset.id,
      externalUserId: "local-viewer",
      deviceId: "local-smoke-device",
      displayLabel: "Local test",
    },
    "POST",
    { authorization: `Bearer ${key.secret}`, "idempotency-key": run },
  );
  const media = await fetch(grant.playbackUrl, {
    headers: { origin: "http://localhost:3100", range: "bytes=0-1023" },
    signal: AbortSignal.timeout(30000),
  });
  const bytes = (await media.arrayBuffer()).byteLength;
  if (media.status !== 206 || bytes !== 1024)
    throw new Error(`Range playback failed: ${media.status}, ${bytes} bytes`);
  console.log(
    "PASS: Control API -> Durable Object -> gateway -> origin Range response (206, 1024 bytes).",
  );
  const refreshed = await fetch(grant.refreshUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${grant.token}`, origin: "http://localhost:3100" },
  });
  if (refreshed.status !== 200) throw new Error("Refresh failed");
  console.log("PASS: Gateway token refresh.");
  await call(`/v1/playback/sessions/${grant.sessionId}/revoke`, {});
  const revoked = await fetch(grant.playbackUrl, {
    headers: { origin: "http://localhost:3100", range: "bytes=0-31" },
  });
  if (revoked.status !== 403) throw new Error(`Revocation failed: ${revoked.status}`);
  console.log("PASS: Revoked session rejected by live gateway (403).");
  await call(`/v1/api-keys/${key.key.id}/revoke`, {});
} finally {
  await database.client.end();
}
