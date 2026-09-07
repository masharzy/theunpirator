export function createGatewayControl(config, logger) {
  async function syncSession(sessionId, status, ttlSeconds = 300) {
    if (!config.GATEWAY_CONTROL_URL || !config.GATEWAY_CONTROL_SECRET) return;
    try {
      const response = await fetch(`${config.GATEWAY_CONTROL_URL}/__internal/session-state`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.GATEWAY_CONTROL_SECRET}`,
        },
        body: JSON.stringify({ sessionId, status, ttlSeconds }),
        signal: AbortSignal.timeout(config.NODE_ENV === "production" ? 5000 : 20000),
      });
      if (!response.ok) throw new Error(`Gateway control returned ${response.status}`);
    } catch (error) {
      logger.warn({ err: error, sessionId }, "gateway session-state sync failed");
      throw Object.assign(new Error("Gateway session state unavailable"), {
        code: "GATEWAY_STATE_UNAVAILABLE",
        status: 503,
      });
    }
  }
  return { syncSession };
}
