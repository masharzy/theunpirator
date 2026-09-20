import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "../src/services/rate-limit.js";

describe("createRateLimiter", () => {
  it("temporarily stops calling an unavailable cache after the first failure", async () => {
    const cache = { incr: vi.fn().mockRejectedValue(new Error("quota exceeded")) };
    const warn = vi.fn();
    const limiter = createRateLimiter(cache, { prefix: "test", limit: 10, windowSeconds: 60 });
    const req = { ip: "127.0.0.1", log: { warn } };
    const res = { setHeader: vi.fn(), status: vi.fn() };
    const next = vi.fn();

    await limiter(req, res, next);
    await limiter(req, res, next);

    expect(cache.incr).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
