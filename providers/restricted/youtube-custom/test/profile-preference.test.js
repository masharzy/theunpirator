import { describe, it, expect } from "vitest";
import { createProfilePreference } from "../src/profile-preference.js";

describe("validated profile preference", () => {
  const attempts = ["MWEB", "IOS", "VISIONOS"].map((name) => ({ region: "US", profile: { name } }));
  it("tries the recent successful profile first and keeps every fallback", () => {
    const preference = createProfilePreference(100);
    preference.succeeded(attempts[2], 0);
    expect(preference.order(attempts, 50)).toEqual([attempts[2], attempts[0], attempts[1]]);
    expect(preference.order(attempts, 101)).toEqual(attempts);
  });
  it("does not store URLs, proofs, or alter attempt descriptors", () => {
    const preference = createProfilePreference();
    expect(preference.order(attempts)).toBe(attempts);
    preference.succeeded({ region: "BD", profile: { name: "OTHER" } });
    expect(preference.order(attempts)).toBe(attempts);
  });
});
