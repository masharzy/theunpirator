import { describe, expect, it } from "vitest";
import { effectiveSecurityPolicy } from "../src/services/playback.js";

describe("security plan ceiling", () => {
  it("lets every plan play protected sources at its included ceiling", () => {
    expect(effectiveSecurityPolicy("maximum", "standard", true)).toBe("standard");
    expect(effectiveSecurityPolicy("maximum", "strict", true)).toBe("strict");
    expect(effectiveSecurityPolicy("maximum", "maximum", true)).toBe("maximum");
  });

  it("uses Standard for progressive media that lacks protected segment delivery", () => {
    expect(effectiveSecurityPolicy("maximum", "maximum", false)).toBe("standard");
  });
});
