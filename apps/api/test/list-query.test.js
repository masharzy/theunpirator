import { describe, expect, it } from "vitest";
import { hasListQuery, paginationMeta, parseListQuery } from "../src/services/list-query.js";

describe("shared list query contract", () => {
  it("normalizes canonical pagination, search, sort and date filters", () => {
    const result = parseListQuery({
      page: "2",
      limit: "50",
      search: "  viewer  ",
      sort: "oldest",
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-30T23:59:59.999Z",
    });

    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
    expect(result.search).toBe("viewer");
    expect(result.sort).toBe("oldest");
    expect(result.from?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(result.to?.toISOString()).toBe("2026-09-30T23:59:59.999Z");
  });

  it("accepts legacy q and pageSize aliases", () => {
    expect(parseListQuery({ q: " asset ", pageSize: "40" })).toMatchObject({
      page: 1,
      limit: 40,
      search: "asset",
      sort: "newest",
    });
  });

  it("rejects invalid limits, sort values and date ranges", () => {
    expect(() => parseListQuery({ limit: "500" })).toThrow("Invalid limit");
    expect(() => parseListQuery({ sort: "random" })).toThrow("Invalid sort");
    expect(() =>
      parseListQuery({ from: "2026-09-20T00:00:00Z", to: "2026-09-01T00:00:00Z" }),
    ).toThrow("from must be before to");
  });

  it("builds a consistent pagination envelope and detects list requests", () => {
    expect(paginationMeta({ page: 4, limit: 25, total: 62 })).toEqual({
      page: 3,
      limit: 25,
      total: 62,
      totalPages: 3,
      hasNext: false,
      hasPrevious: true,
    });
    expect(hasListQuery({})).toBe(false);
    expect(hasListQuery({ search: "viewer" })).toBe(true);
  });
});
