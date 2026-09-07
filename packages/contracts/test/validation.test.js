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
  it("normalizes email addresses and rejects weak passwords", () => {
    expect(
      registerSchema.parse({
        tenantName: "Studio",
        email: "Alex@Example.com",
        password: "twelve-characters",
      }).email,
    ).toBe("alex@example.com");
    expect(
      registerSchema.safeParse({
        tenantName: "Studio",
        email: "alex@example.com",
        password: "short",
      }).success,
    ).toBe(false);
  });
});
