import { describe, expect, it } from "vitest";
import { createCache } from "../src/index.js";

function unavailablePrimary() {
  const error = () => Promise.reject(new Error("max requests limit exceeded"));
  return { get: error, set: error, del: error, incr: error, expire: error, eval: error, ping: error };
}

describe("cache resilience", () => {
  it("keeps expiring values available when Redis rejects requests", async () => {
    const cache = createCache({
      UPSTASH_REDIS_REST_URL: "https://redis.invalid",
      UPSTASH_REDIS_REST_TOKEN: "test-token",
    });
    cache.primary = unavailablePrimary();

    await expect(cache.set("session", "active", { ex: 60 })).resolves.toBe("OK");
    await expect(cache.get("session")).resolves.toBe("active");
    await expect(cache.incr("rate")).resolves.toBe(1);
    await expect(cache.incr("rate")).resolves.toBe(2);
  });

  it("supports the gateway compare-and-swap transaction in memory", async () => {
    const cache = createCache({
      UPSTASH_REDIS_REST_URL: "https://redis.invalid",
      UPSTASH_REDIS_REST_TOKEN: "test-token",
    });
    cache.primary = unavailablePrimary();
    const script = "gateway compare and swap";

    await expect(cache.eval(script, ["key"], ["0", "", "S", "value"])).resolves.toBe(1);
    await expect(cache.eval(script, ["key"], ["1", "wrong", "D", ""])).resolves.toBe(0);
    await expect(cache.get("key")).resolves.toBe("value");
  });
});
