import { describe, expect, it } from "vitest";

describe("gateway security contract", () => {
  it("never exposes an arbitrary proxy route", () => {
    expect("/proxy?url=https://example.com").not.toMatch(/^\/v\/[0-9a-fA-F-]{36}\//);
  });
});
