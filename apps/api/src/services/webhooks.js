import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { decryptJson, randomToken, sha256 } from "@unpirator/crypto";
import { webhookDeliveries, webhookEndpoints } from "@unpirator/db/schema";

export async function queueWebhook(db, tenantId, type, payload) {
  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.status, "active")));
  const eventId = `evt_${randomToken(12)}`;
  const values = endpoints
    .filter((e) => Array.isArray(e.events) && (e.events.includes(type) || e.events.includes("*")))
    .map((endpoint) => ({
      endpointId: endpoint.id,
      eventId,
      eventType: type,
      payload,
      status: "pending",
    }));
  if (values.length) await db.insert(webhookDeliveries).values(values);
  return eventId;
}

export function signWebhook(secret, timestamp, body) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export async function deliverWebhook(db, delivery, config) {
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, delivery.endpointId))
    .limit(1);
  if (!endpoint || endpoint.status !== "active")
    return { ok: false, permanent: true, error: "Endpoint unavailable" };
  const { secret } = decryptJson(endpoint.encryptedSecret, config.APP_ENCRYPTION_KEY_BASE64);
  const body = JSON.stringify({
    id: delivery.eventId,
    type: delivery.eventType,
    createdAt: delivery.createdAt,
    data: delivery.payload,
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "TheUnpirator-Webhooks/1.0",
        "x-unpirator-event": delivery.eventId,
        "x-unpirator-timestamp": timestamp,
        "x-unpirator-signature": `v1=${signWebhook(secret, timestamp, body)}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return { ok: true };
    return {
      ok: false,
      permanent: response.status >= 400 && response.status < 500 && response.status !== 429,
      error: `HTTP ${response.status}`,
    };
  } catch (error) {
    return { ok: false, permanent: false, error: error.message.slice(0, 500) };
  }
}

export function hashWebhookSecret(secret) {
  return sha256(secret);
}
