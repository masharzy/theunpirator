import { describe, it, expect, vi } from "vitest";
import { getPlaybackPolicy } from "../src/services/entitlements.js";

function database(entitlements, flags = []) {
  const query = {
    from: () => query,
    innerJoin: () => query,
    where: () => query,
    orderBy: () => query,
    limit: async () => (entitlements ? [{ entitlements }] : []),
    then: (resolve, reject) => Promise.resolve(flags).then(resolve, reject),
  };
  return { select: vi.fn(() => query) };
}
const flag = (key, enabled, scopeType = "global", scopeId = "global") => ({
  key,
  enabled,
  scopeType,
  scopeId,
});

describe("request-local playback policy", () => {
  it("reads policy twice in total while preserving all opt-ins", async () => {
    const db = database({ secure_gateway: true, dynamic_watermark: true }, [
      flag("youtube_custom", true),
      flag("youtube_custom", true, "tenant", "t1"),
    ]);
    expect(await getPlaybackPolicy(db, "t1")).toMatchObject({
      secure: true,
      watermark: true,
      youtube: true,
    });
    expect(db.select).toHaveBeenCalledTimes(2);
  });
  it("honors global kill switches over tenant opt-ins", async () => {
    const db = database({ secure_gateway: true }, [
      flag("secure_gateway", false),
      flag("secure_gateway", true, "tenant", "t1"),
    ]);
    expect((await getPlaybackPolicy(db, "t1")).secure).toBe(false);
  });
  it("denies secure playback without an eligible subscription", async () => {
    const db = database(null, [flag("secure_gateway", true)]);
    expect(await getPlaybackPolicy(db, "t1")).toMatchObject({ secure: false, watermark: false });
  });
  it("does not accept another tenant's restricted-provider opt-in", async () => {
    const db = database({}, [
      flag("youtube_custom", true),
      flag("youtube_custom", true, "tenant", "other"),
    ]);
    expect((await getPlaybackPolicy(db, "t1")).youtube).toBe(false);
  });
  it("reads authorization again for the next request", async () => {
    const flags = [flag("secure_gateway", true)];
    const db = database({ secure_gateway: true }, flags);
    expect((await getPlaybackPolicy(db, "t1")).secure).toBe(true);
    flags[0].enabled = false;
    expect((await getPlaybackPolicy(db, "t1")).secure).toBe(false);
    expect(db.select).toHaveBeenCalledTimes(4);
  });
});
