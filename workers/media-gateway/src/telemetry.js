const nonSecurityQuotaCodes = new Set(["PLAN_QUOTA_EXCEEDED", "QUOTA_UNAVAILABLE"]);

export function filterTelemetryEvents(events = []) {
  return events.filter((event) => {
    if (event?.kind === "security" && nonSecurityQuotaCodes.has(event.type)) return false;
    if (event?.kind === "usage" && event.type === "gateway_requests") return false;
    return true;
  });
}

export function emitTelemetry(ctx, env, events) {
  const filtered = filterTelemetryEvents(events);
  if (!filtered.length || !env.INTERNAL_API_URL || !env.GATEWAY_INTERNAL_SECRET) return;
  ctx.waitUntil(
    fetch(`${env.INTERNAL_API_URL}/internal/gateway/telemetry`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.GATEWAY_INTERNAL_SECRET}`,
      },
      body: JSON.stringify({ events: filtered }),
    }).catch(() => undefined),
  );
}
