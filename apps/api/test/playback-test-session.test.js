import { describe, expect, it } from "vitest";
import { dashboardTestSessionInput } from "../src/routes/playback.js";

function request(body = {}) {
  return {
    body: { deviceId: "dashboard-test-device", ...body },
    auth: { accountId: "11111111-1111-4111-8111-111111111111", email: "developer@example.com" },
    get(name) {
      return name === "x-unpirator-site-id" ? "22222222-2222-4222-8222-222222222222" : undefined;
    },
  };
}

describe("dashboard playback test session", () => {
  it("derives viewer identity from the authenticated dashboard account", () => {
    const input = dashboardTestSessionInput(
      request({
        assetId: "33333333-3333-4333-8333-333333333333",
        externalUserId: "spoofed-user",
        displayLabel: "spoofed@example.com",
      }),
    );

    expect(input.externalUserId).toBe("dashboard:11111111-1111-4111-8111-111111111111");
    expect(input.displayLabel).toBe("developer@example.com");
    expect(input.assetId).toBe("33333333-3333-4333-8333-333333333333");
  });

  it("accepts an on-demand YouTube source without exposing an API key", () => {
    const input = dashboardTestSessionInput(
      request({ src: "https://youtu.be/abc123DEF45", title: "Lab source" }),
    );

    expect(input.siteId).toBe("22222222-2222-4222-8222-222222222222");
    expect(input.source).toEqual({
      provider: "youtube_custom",
      url: "https://youtu.be/abc123DEF45",
      title: "Lab source",
    });
  });
});
