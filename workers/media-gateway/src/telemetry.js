export function emitTelemetry(ctx, env, events) {
  if (!events?.length || !env.INTERNAL_API_URL || !env.GATEWAY_INTERNAL_SECRET) return;
  ctx.waitUntil(
    fetch(`${env.INTERNAL_API_URL}/internal/gateway/telemetry`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.GATEWAY_INTERNAL_SECRET}`,
      },
      body: JSON.stringify({ events }),
    }).catch(() => undefined),
  );
}
