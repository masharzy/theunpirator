import { describe, it, expect } from "vitest";
import { playbackWindows } from "../src/protected-media.js";
import { SessionState } from "../src/session-state.js";
const segments = (count, durationMs) =>
  Array.from({ length: count }, (_, i) => ({ sequence: i + 1, durationMs }));
const manifest = {
  durationMs: 250000,
  video: [{ segments: segments(50, 5000) }],
  audio: [{ segments: segments(125, 2000) }],
};
describe("seek authorization", () => {
  it("maps positions to independent bounded audio/video windows", () => {
    expect(
      playbackWindows(manifest, { positionSeconds: 100, videoVariant: 0, audioVariant: 0 }),
    ).toEqual({ video: { variant: 0, min: 19, max: 27 }, audio: { variant: 0, min: 49, max: 66 } });
    for (const positionSeconds of [-1, NaN, Infinity, 251, "100"])
      expect(() =>
        playbackWindows(manifest, { positionSeconds, videoVariant: 0, audioVariant: 0 }),
      ).toThrow();
  });
  it("allows distant seeks while denying out-of-window, replayed and revoked tickets", async () => {
    const values = new Map();
    const state = new SessionState({
      storage: {
        get: async (k) => values.get(k),
        put: async (k, v) => values.set(k, v),
        delete: async (k) => values.delete(k),
        setAlarm: async () => {},
      },
    });
    const post = (path, body) =>
      state.fetch(
        new Request(`https://session${path}`, { method: "POST", body: JSON.stringify(body) }),
      );
    await post("/state", { status: "active", ttlSeconds: 300 });
    await post("/crypto", { keyBase64: "key" });
    const windows = playbackWindows(manifest, {
      positionSeconds: 100,
      videoVariant: 0,
      audioVariant: 0,
    });
    await post("/integrity", { windows });
    const item = { track: "audio", variant: 0, sequence: 51 };
    const issued = await post("/ticket", item);
    expect(issued.status).toBe(200);
    const { ticket } = await issued.json();
    expect((await post("/consume", { ...item, ticket })).status).toBe(200);
    expect((await post("/consume", { ...item, ticket })).status).toBe(403);
    expect((await post("/ticket", { ...item, sequence: 90 })).status).toBe(403);
    const stale = await (await post("/ticket", item)).json();
    await post("/integrity", {
      windows: playbackWindows(manifest, { positionSeconds: 10, videoVariant: 0, audioVariant: 0 }),
    });
    expect((await post("/consume", { ...item, ticket: stale.ticket })).status).toBe(403);
    expect((await post("/ticket", { ...item, sequence: 6 })).status).toBe(200);
    await post("/integrity", { tampered: true });
    expect((await post("/ticket", { ...item, sequence: 6 })).status).toBe(403);
  });
});
