import { describe, expect, it } from "vitest";
import { verifyTotp } from "../src/services/totp.js";

describe("TOTP verification", () => {
  it("accepts an RFC 6238 vector and rejects an incorrect code", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(verifyTotp(secret, "287082", 59000)).toBe(true);
    expect(verifyTotp(secret, "287083", 59000)).toBe(false);
  });
});
