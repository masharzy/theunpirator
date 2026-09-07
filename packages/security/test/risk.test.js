import { describe, expect, it } from "vitest";
import { decisionForRisk, riskFor } from "../src/index.js";
describe("risk engine", () => {
  it("escalates token replay", () =>
    expect(decisionForRisk(riskFor("TOKEN_REPLAY", 25))).toBe("block"));
  it("keeps low origin failures informational", () =>
    expect(decisionForRisk(riskFor("ORIGIN_FAILURE"))).toBe("allow"));
});
