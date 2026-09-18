import { describe, expect, it, vi } from "vitest";
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

describe("plan-driven playback features", () => {
  it("enables only features present in the plan", async () => {
    const policy = await getPlaybackPolicy(
      database({
        secure_gateway: true,
        protected_delivery: true,
        player_integrity: false,
        secure_browser_restriction: false,
        dynamic_watermark: true,
        device_control: false,
        concurrent_stream_control: true,
        webhooks: false,
      }),
      "tenant-1",
    );
    expect(policy).toMatchObject({
      secure: true,
      protectedDelivery: true,
      playerIntegrity: false,
      secureBrowserRestriction: false,
      watermark: true,
      deviceControl: false,
      concurrentStreamControl: true,
      webhooks: false,
    });
  });

  it("disables playback features when there is no active plan", async () => {
    const policy = await getPlaybackPolicy(database(null), "tenant-1");
    expect(policy).toMatchObject({
      secure: false,
      protectedDelivery: false,
      playerIntegrity: false,
      watermark: false,
      deviceControl: false,
    });
  });
});
