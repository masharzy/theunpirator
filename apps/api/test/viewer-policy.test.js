import { describe, expect, it } from "vitest";
import { applyViewerLimitOverride } from "../src/services/playback.js";

describe("applyViewerLimitOverride", () => {
  it("uses the plan value when the tenant has no override", () => {
    expect(applyViewerLimitOverride(2, null)).toBe(2);
    expect(applyViewerLimitOverride(2, undefined)).toBe(2);
  });

  it("lets the tenant pick any positive number regardless of the plan value", () => {
    // Pro features with a Starter-style single device…
    expect(applyViewerLimitOverride(5, 1)).toBe(1);
    // …or a looser policy than the plan default
    expect(applyViewerLimitOverride(2, 10)).toBe(10);
  });

  it("allows any positive override when the plan is unlimited", () => {
    expect(applyViewerLimitOverride(null, 3)).toBe(3);
  });

  it("floors fractional and guards non-positive overrides", () => {
    expect(applyViewerLimitOverride(5, 2.7)).toBe(2);
    expect(applyViewerLimitOverride(5, 0)).toBe(1);
    expect(applyViewerLimitOverride(null, 0)).toBe(1);
  });
});
