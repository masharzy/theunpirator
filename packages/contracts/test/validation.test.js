import { describe, it, expect } from "vitest";
import { siteCreateSchema, playbackSessionSchema, registerSchema } from "../src/index.js";
describe("public input validation", () => {
  it("rejects URL-shaped site domains", () => {
    expect(
      siteCreateSchema.safeParse({ name: "Course", domain: "https://example.com/path" }).success,
    ).toBe(false);
  });
  it("rejects injected playback fields", () => {
    expect(
      playbackSessionSchema.safeParse({
        siteId: "site",
        assetId: "asset",
        deviceId: "device123",
        externalUserId: "user",
        tenantId: "forged",
      }).success,
    ).toBe(false);
  });
  it("accepts one on-demand YouTube source without an asset id", () => {
    expect(
      playbackSessionSchema.safeParse({
        siteId: "site",
        source: { provider: "youtube_custom", url: "https://youtu.be/abc123DEF45" },
        deviceId: "device123",
        externalUserId: "user",
      }).success,
    ).toBe(true);
    expect(
      playbackSessionSchema.safeParse({
        siteId: "site",
        assetId: "asset",
        source: { provider: "youtube_custom", url: "https://youtu.be/abc123DEF45" },
        deviceId: "device123",
        externalUserId: "user",
      }).success,
    ).toBe(false);
  });
  it("normalizes verbose client metadata instead of rejecting playback", () => {
    const browser =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";
    const result = playbackSessionSchema.parse({
      siteId: "site",
      assetId: "asset",
      deviceId: "device123",
      externalUserId: "user",
      client: { browser },
    });

    expect(result.client.browser).toBe(browser.slice(0, 100));
  });
  it("accepts a simple client identifier", () => {
    const result = playbackSessionSchema.parse({
      siteId: "site",
      assetId: "asset",
      deviceId: "device123",
      externalUserId: "user",
      client: "easy-education-web",
    });

    expect(result.client).toEqual({ browser: "easy-education-web" });
  });
  it("normalizes email addresses and rejects weak passwords", () => {
    expect(
      registerSchema.parse({
        tenantName: "Studio",
        email: "Alex@Example.com",
        password: "Twelve-characters1",
      }).email,
    ).toBe("alex@example.com");
    expect(
      registerSchema.safeParse({
        tenantName: "Studio",
        email: "alex@example.com",
        password: "short",
      }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        tenantName: "Studio",
        email: "alex@example.com",
        password: "twelve-characters",
      }).success,
    ).toBe(false);
  });
});
