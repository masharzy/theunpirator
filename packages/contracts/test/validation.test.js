import { describe, expect, it } from "vitest";
import {
  assetSyncSchema,
  playbackSessionSchema,
  registerSchema,
  siteCreateSchema,
} from "../src/index.js";

const viewer = {
  email: "viewer@example.com",
  deviceId: "device123",
};

describe("public input validation", () => {
  it("rejects URL-shaped site domains", () => {
    expect(
      siteCreateSchema.safeParse({ name: "Course", domain: "https://example.com/path" }).success,
    ).toBe(false);
  });

  it("rejects injected playback identity and tenant fields", () => {
    expect(
      playbackSessionSchema.safeParse({
        siteId: "site",
        assetId: "asset",
        ...viewer,
        externalUserId: "forged-user",
        tenantId: "forged",
      }).success,
    ).toBe(false);
  });

  it("accepts one on-demand YouTube source without an asset id", () => {
    expect(
      playbackSessionSchema.safeParse({
        siteId: "site",
        source: { provider: "youtube_custom", url: "https://youtu.be/abc123DEF45" },
        ...viewer,
      }).success,
    ).toBe(true);

    expect(
      playbackSessionSchema.safeParse({
        siteId: "site",
        assetId: "asset",
        source: { provider: "youtube_custom", url: "https://youtu.be/abc123DEF45" },
        ...viewer,
      }).success,
    ).toBe(false);
  });

  it("requires authenticated viewer email and a stable device id", () => {
    expect(
      playbackSessionSchema.safeParse({
        siteId: "site",
        assetId: "asset",
        deviceId: "device123",
      }).success,
    ).toBe(false);

    expect(
      playbackSessionSchema.safeParse({
        siteId: "site",
        assetId: "asset",
        email: "viewer@example.com",
      }).success,
    ).toBe(false);
  });

  it("normalizes viewer email and verbose client metadata", () => {
    const browser =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";
    const result = playbackSessionSchema.parse({
      siteId: "site",
      assetId: "asset",
      email: "Viewer@Example.COM",
      deviceId: "device123",
      client: { browser },
    });

    expect(result.email).toBe("viewer@example.com");
    expect(result.client.browser).toBe(browser.slice(0, 100));
  });

  it("accepts a simple client identifier", () => {
    const result = playbackSessionSchema.parse({
      siteId: "site",
      assetId: "asset",
      ...viewer,
      client: "easy-education-web",
    });

    expect(result.client).toEqual({ browser: "easy-education-web" });
  });

  it("accepts server-side asset synchronization and rejects injected fields", () => {
    const input = {
      siteId: "site",
      externalContentId: "lesson-42",
      title: "Lesson 42",
      provider: "hls",
      sourceUrl: "https://media.example.com/master.m3u8",
      allowedHosts: ["media.example.com"],
      providerConfig: { headers: { authorization: "Bearer private" } },
    };
    expect(assetSyncSchema.safeParse(input).success).toBe(true);
    expect(assetSyncSchema.safeParse({ ...input, tenantId: "forged" }).success).toBe(false);
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
