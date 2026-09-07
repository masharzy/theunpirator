export function createRateLimiter(cache, { prefix, limit, windowSeconds }) {
  return async function rateLimit(req, res, next) {
    try {
      const identity = req.auth?.accountId || req.apiAuth?.keyId || req.ip || "unknown";
      const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
      const key = `rl:${prefix}:${identity}:${bucket}`;
      const count = await cache.incr(key);
      if (count === 1) await cache.expire(key, windowSeconds + 2);
      res.setHeader("X-RateLimit-Limit", String(limit));
      if (Number(count) > limit)
        return res
          .status(429)
          .json({ error: { code: "RATE_LIMIT", message: "Too many requests", requestId: req.id } });
      next();
    } catch (error) {
      req.log?.warn({ err: error }, "rate limiter degraded open");
      next();
    }
  };
}
