import { describe, expect, it } from "vitest";
import { applyViewerLimitOverride } from "../src/services/playback.js";

describe("applyViewerLimitOverride", () => {
  it("uses the plan value when the tenant has no override", () => {
    expect(applyViewerLimitOverride(2, null)).toBe(2);
    expect(applyViewerLimitOverride(2, undefined)).toBe(2);
  });

  it("lets the tenant pick a number below the plan ceiling", () => {
    // Pro features with a Starter-style single device
    expect(applyViewerLimitOverride(5, 1)).toBe(1);
  });

  it("clamps tenant values above the plan ceiling", () => {
    expect(applyViewerLimitOverride(2, 10)).toBe(2);
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
