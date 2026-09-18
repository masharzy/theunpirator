import { securityError } from "./token.js";

export async function reserveDeliveryQuota(env, claims, bytes = 0) {
  // Production gateway routes only call delivery proxies with claims returned by
  // verifyPlaybackToken(), which always include a session id. Direct low-level
  // proxy tests may use partial claims and do not represent billable delivery.
  if (!claims?.psid) return;
  if (!env.INTERNAL_API_URL || !env.GATEWAY_INTERNAL_SECRET)
    throw securityError("QUOTA_UNAVAILABLE", 503, "Usage enforcement unavailable");
  const response = await fetch(`${env.INTERNAL_API_URL}/internal/quota/delivery/reserve`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.GATEWAY_INTERNAL_SECRET}`,
    },
    body: JSON.stringify({
      tenantId: claims.tid,
      sessionId: claims.psid,
      bytes: Math.max(0, Number(bytes || 0)),
    }),
  });
  if (response.ok) return;
  const body = await response.json().catch(() => ({}));
  const code =
    body?.error?.code || (response.status === 429 ? "PLAN_QUOTA_EXCEEDED" : "QUOTA_UNAVAILABLE");
  const error = securityError(
    code,
    response.status === 429 ? 429 : response.status >= 500 ? 503 : response.status,
    body?.error?.message ||
      (response.status === 429 ? "Plan usage limit reached" : "Usage enforcement unavailable"),
  );
  error.quota = true;
  throw error;
}
