import { describe, expect, it } from "vitest";
import { sessionStatusCondition } from "../src/routes/session-console.js";

function boundValues(query) {
  const values = [];
  const visited = new WeakSet();
  const visit = (value) => {
    if (value instanceof Date || typeof value !== "object" || value === null) {
      values.push(value);
      return;
    }
    if (visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (Object.hasOwn(value, "value")) values.push(value.value);
    Object.values(value).forEach(visit);
  };
  visit(query);
  return values.flat(Infinity);
}

describe("sessionStatusCondition", () => {
  it.each(["active", "idle"])("binds the %s heartbeat cutoff as an ISO string", (status) => {
    const now = new Date("2026-09-20T04:27:52.517Z");
    const cutoff = new Date("2026-09-20T04:26:22.517Z");
    const values = boundValues(sessionStatusCondition(status, now, cutoff));

    expect(values).toContain(cutoff.toISOString());
    expect(values).not.toContain(cutoff);
  });
});
