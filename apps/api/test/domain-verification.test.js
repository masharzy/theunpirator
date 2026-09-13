import { describe, expect, it } from "vitest";
import { readVerificationResponse } from "../src/services/domain-verification.js";

describe("domain verification response errors", () => {
  it("reports the origin HTTP status", async () => {
    await expect(
      readVerificationResponse(new Response("missing", { status: 404 }), {
        domain: "example.com",
      }),
    ).rejects.toMatchObject({
      code: "DOMAIN_VERIFICATION_HTTP_ERROR",
      status: 422,
      details: { domain: "example.com", httpStatus: 404 },
    });
  });

  it("reports an oversized response instead of a missing challenge", async () => {
    await expect(
      readVerificationResponse(new Response("12345"), {
        domain: "example.com",
        maxBytes: 4,
      }),
    ).rejects.toMatchObject({
      code: "DOMAIN_VERIFICATION_RESPONSE_TOO_LARGE",
      status: 422,
      details: { domain: "example.com", maxBytes: 4, actualBytes: 5 },
    });
  });
});
