import { describe, expect, it } from "vitest";
import { SessionState } from "../src/session-state.js";

function createState() {
  const values = new Map();
  const storage = {
    alarms: false,
    get: async (key) => values.get(key),
    put: async (key, value) => values.set(key, value),
    delete: async (key) => values.delete(key),
  };
  const state = new SessionState({ storage });
  const post = (path, body) =>
    state.fetch(
      new Request(`https://session${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  return { values, post };
}

describe("protected session denial reasons", () => {
  it("returns a stable reason when a segment is outside the authorized window", async () => {
    const { post } = createState();
    await post("/state", { status: "active", ttlSeconds: 300 });
    const response = await post("/ticket", { track: "video", variant: 0, sequence: 99 });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "denied",
      reason: "sequence_out_of_window",
    });
  });

  it("distinguishes revoked sessions from generic ticket denial", async () => {
    const { post } = createState();
    await post("/state", { status: "revoked", ttlSeconds: 300 });
    const response = await post("/ticket", { track: "video", variant: 0, sequence: 1 });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "denied",
      reason: "session_revoked",
    });
  });

  it("reports one-time ticket reuse without making the ticket reusable", async () => {
    const { post } = createState();
    await post("/state", { status: "active", ttlSeconds: 300 });
    await post("/crypto", { keyBase64: "test-key" });
    const item = { track: "video", variant: 0, sequence: 1 };
    const issued = await (await post("/ticket", item)).json();

    expect((await post("/consume", { ...item, ticket: issued.ticket })).status).toBe(200);
    const reused = await post("/consume", { ...item, ticket: issued.ticket });
    expect(reused.status).toBe(403);
    await expect(reused.json()).resolves.toEqual({
      error: "denied",
      reason: "ticket_missing_or_used",
    });
  });
});
