import { describe, expect, it } from "vitest";
import { normalizeQuotaLimit, quotaPeriodKey } from "../src/services/quotas.js";

describe("quota semantics", () => {
  it("distinguishes an absent cap from an explicit zero cap", () => {
    expect(normalizeQuotaLimit(null)).toBeNull();
    expect(normalizeQuotaLimit(undefined)).toBeNull();
    expect(normalizeQuotaLimit("")).toBeNull();
    expect(normalizeQuotaLimit(0)).toBe(0);
    expect(normalizeQuotaLimit("0")).toBe(0);
  });

  it("rejects invalid caps instead of silently inventing limits", () => {
    expect(normalizeQuotaLimit(-1)).toBeNull();
    expect(normalizeQuotaLimit("nope")).toBeNull();
  });

  it("builds a period-specific rollup key", () => {
    const start = new Date("2026-09-07T00:00:00.000Z");
    const end = new Date("2026-10-07T00:00:00.000Z");
    expect(quotaPeriodKey(start, end)).toBe(
      "2026-09-07T00:00:00.000Z/2026-10-07T00:00:00.000Z",
    );
  });
});
