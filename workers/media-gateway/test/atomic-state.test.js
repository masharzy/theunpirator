import { describe, it, expect } from "vitest";
import { createCache } from "../../../packages/cache/src/index.js";
import { RedisDurableStorage } from "../src/node-bindings.js";
import { SessionState } from "../src/session-state.js";

const redis = process.env.TEST_REDIS_URL || process.env.REDIS_URL;
const upstash = process.env.TEST_UPSTASH_REDIS_REST_URL;
describe.skipIf(!redis && !upstash)("atomic Redis session state", () => {
  it("consumes a ticket once across concurrent requests and enforces shared delivery limits", async () => {
    const cache = createCache(
      upstash
        ? {
            UPSTASH_REDIS_REST_URL: upstash,
            UPSTASH_REDIS_REST_TOKEN: process.env.TEST_UPSTASH_REDIS_REST_TOKEN,
          }
        : { REDIS_URL: redis },
    );
    const touched = new Set();
    const wrapped = {
      get: (key) => cache.get(key),
      eval: (script, keys, args) => {
        keys.forEach((key) => touched.add(key));
        return cache.eval(script, keys, args);
      },
    };
    const storage = new RedisDurableStorage(wrapped, `test-${crypto.randomUUID()}`);
    const post = (path, body) =>
      new SessionState({ storage }).fetch(
        new Request(`https://session${path}`, { method: "POST", body: JSON.stringify(body) }),
      );
    try {
      expect((await post("/state", { status: "active", ttlSeconds: 300 })).status).toBe(200);
      await post("/crypto", { keyBase64: "test-key" });
      const item = { track: "video", variant: 0, sequence: 1 };
      const { ticket } = await (await post("/ticket", item)).json();
      const consumed = await Promise.all(
        Array.from({ length: 10 }, () => post("/consume", { ...item, ticket })),
      );
      expect(consumed.filter((r) => r.status === 200)).toHaveLength(1);
      const leases = await Promise.all(
        Array.from({ length: 6 }, () => post("/lease", { bytes: 1024 })),
      );
      expect(leases.filter((r) => r.status === 200)).toHaveLength(4);
      for (const response of leases.filter((r) => r.status === 200))
        await post("/release", await response.json());
      await Promise.all([
        post("/integrity", { sequence: 2 }),
        post("/state", { status: "blocked", ttlSeconds: 300 }),
      ]);
      expect((await post("/ticket", item)).status).toBe(403);
      expect((await post("/lease", { bytes: 1024 })).status).toBe(403);
    } finally {
      await Promise.all([...touched].map((key) => cache.del(key)));
      cache.client?.disconnect?.();
    }
  }, 120000);
});
