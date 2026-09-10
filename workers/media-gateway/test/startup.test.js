import { describe, it, expect, vi, afterEach } from "vitest";
import { getSource } from "../src/source.js";
import { singleFlight } from "../src/single-flight.js";
afterEach(() => vi.unstubAllGlobals());
describe("startup request sharing", () => {
  it("resolves concurrent requests once without sharing another session's authorization", async () => {
    const values = new Map();
    const env = {
      INTERNAL_API_URL: "https://api.test",
      SOURCE_CACHE: {
        get: async (key) => values.get(key),
        put: async (key, value) => values.set(key, JSON.parse(value)),
        delete: async (key) => values.delete(key),
      },
    };
    const fetcher = vi.fn(async () =>
      Response.json({
        source: { url: "https://media.test/a", cacheTtlSeconds: 60 },
        allowedOrigins: ["https://customer.test"],
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const claims = { tid: "tenant", psid: "session" };
    const result = await Promise.all(
      Array.from({ length: 10 }, () => getSource(env, claims, "asset")),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.every((item) => item === result[0])).toBe(true);
    await getSource(env, { ...claims, psid: "other" }, "asset");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("removes a failed in-flight operation so the next attempt can recover", async () => {
    const env = {};
    await expect(
      singleFlight(env, "key", async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    await expect(singleFlight(env, "key", async () => "ok")).resolves.toBe("ok");
  });
});
