import { describe, expect, it } from "vitest";
import { buildUsageModel } from "../src/services/usage-model.js";

describe("usage model", () => {
  it("does not let site capacity drive the navbar billing usage headline", () => {
    const usage = buildUsageModel({
      metrics: { playback_sessions: 259, gateway_requests: 376 },
      entitlements: { max_sites: 10 },
      counts: { sites: 8, assets: 115, activeSessions: 2 },
    });

    expect(usage.headline).toMatchObject({ status: "uncapped", percent: null });
    expect(usage.resources.find((item) => item.key === "sites")).toMatchObject({
      used: 8,
      limit: 10,
      percent: 80,
    });
  });

  it("selects the most constrained configured metered quota for the headline", () => {
    const usage = buildUsageModel({
      metrics: { playback_sessions: 500, gateway_requests: 850 },
      entitlements: {
        monthly_playback_sessions: 1000,
        monthly_gateway_requests: 1000,
      },
    });

    expect(usage.headline).toMatchObject({
      key: "gateway_requests",
      percent: 85,
      status: "near_limit",
    });
  });

  it("does not invent unsupported zero-value customer metrics", () => {
    const usage = buildUsageModel({
      metrics: { playback_sessions: 4, playback_heartbeat: 99 },
      entitlements: {
        monthly_playback_minutes: 5000,
        monthly_egress_bytes: 10_000_000,
      },
    });

    expect(usage.metered.map((item) => item.key)).toEqual(["playback_sessions"]);
  });

  it("shows observed delivery without fabricating unmeasured usage", () => {
    const usage = buildUsageModel({
      metrics: { egress_bytes: 4096 },
      entitlements: { monthly_egress_bytes: 8192 },
    });

    expect(usage.metered).toEqual([
      expect.objectContaining({
        key: "egress_bytes",
        used: 4096,
        limit: 8192,
        percent: 50,
      }),
    ]);
  });

  it("marks real overages explicitly", () => {
    const usage = buildUsageModel({
      metrics: { playback_sessions: 12 },
      entitlements: { monthly_playback_sessions: 10 },
    });

    expect(usage.headline).toMatchObject({
      status: "exceeded",
      percent: 100,
      exceeded: true,
    });
  });
});
