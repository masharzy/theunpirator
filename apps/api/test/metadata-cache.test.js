import { describe, expect, it } from "vitest";
import {
  cachedGlobalJson,
  cachedTenantJson,
  invalidateGlobalCache,
  invalidateTenantCache,
  stableQueryKey,
} from "../src/services/metadata-cache.js";

class MemoryCache {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async set(key, value) {
    this.values.set(key, value);
    return "OK";
  }

  async incr(key) {
    const next = Number(this.values.get(key) || 0) + 1;
    this.values.set(key, String(next));
    return next;
  }

  async expire() {
    return 1;
  }
}

describe("metadata cache", () => {
  it("reuses tenant metadata until the namespace is invalidated", async () => {
    const cache = new MemoryCache();
    let loads = 0;
    const load = async () => ({ value: ++loads });

    const first = await cachedTenantJson({
      cache,
      tenantId: "tenant-a",
      namespace: "sites",
      key: "list",
      ttlSeconds: 60,
      load,
    });
    const second = await cachedTenantJson({
      cache,
      tenantId: "tenant-a",
      namespace: "sites",
      key: "list",
      ttlSeconds: 60,
      load,
    });

    expect(first).toEqual({ value: 1 });
    expect(second).toEqual({ value: 1 });
    expect(loads).toBe(1);

    await invalidateTenantCache(cache, "tenant-a", "sites");
    const third = await cachedTenantJson({
      cache,
      tenantId: "tenant-a",
      namespace: "sites",
      key: "list",
      ttlSeconds: 60,
      load,
    });

    expect(third).toEqual({ value: 2 });
    expect(loads).toBe(2);
  });

  it("keeps tenant cache namespaces isolated", async () => {
    const cache = new MemoryCache();
    let loads = 0;

    const read = (tenantId) =>
      cachedTenantJson({
        cache,
        tenantId,
        namespace: "assets",
        key: "list",
        load: async () => ({ load: ++loads, tenantId }),
      });

    expect(await read("tenant-a")).toEqual({ load: 1, tenantId: "tenant-a" });
    expect(await read("tenant-b")).toEqual({ load: 2, tenantId: "tenant-b" });
    expect(await read("tenant-a")).toEqual({ load: 1, tenantId: "tenant-a" });
  });

  it("supports global cache invalidation", async () => {
    const cache = new MemoryCache();
    let loads = 0;
    const read = () =>
      cachedGlobalJson({
        cache,
        namespace: "billing-plans",
        key: "public",
        load: async () => ({ load: ++loads }),
      });

    expect(await read()).toEqual({ load: 1 });
    expect(await read()).toEqual({ load: 1 });
    await invalidateGlobalCache(cache, "billing-plans");
    expect(await read()).toEqual({ load: 2 });
  });

  it("fails open when the cache backend is unavailable", async () => {
    const cache = {
      async get() {
        throw new Error("redis unavailable");
      },
      async set() {
        throw new Error("redis unavailable");
      },
      async incr() {
        throw new Error("redis unavailable");
      },
      async expire() {
        throw new Error("redis unavailable");
      },
    };
    let loads = 0;

    expect(
      await cachedTenantJson({
        cache,
        tenantId: "tenant-a",
        namespace: "sites",
        load: async () => ({ load: ++loads }),
      }),
    ).toEqual({ load: 1 });

    await expect(invalidateTenantCache(cache, "tenant-a", "sites")).resolves.toBeUndefined();
  });

  it("normalizes list query keys independent of object order", () => {
    expect(stableQueryKey({ page: "2", search: "Video", status: ["active", "disabled"] })).toBe(
      stableQueryKey({ status: ["disabled", "active"], search: "Video", page: "2" }),
    );
  });
});
