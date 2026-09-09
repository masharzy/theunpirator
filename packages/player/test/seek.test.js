import { describe, it, expect, vi } from "vitest";
vi.mock("hls.js", () => ({ default: { isSupported: () => false } }));
import { ProtectedSegmentRuntime } from "../src/index.js";
import { sequenceAtTime } from "../src/segment-timeline.js";

const segments = (count, durationMs) =>
  Array.from({ length: count }, (_, i) => ({ sequence: i + 1, durationMs }));
function runtime() {
  const player = new ProtectedSegmentRuntime({ video: { currentTime: 100 }, onError: vi.fn() });
  player.videoVariant = player.audioVariant = 0;
  player.manifest = {
    video: [{ segments: segments(50, 5000) }],
    audio: [{ segments: segments(125, 2000) }],
  };
  player.videoBuffer = player.audioBuffer = { buffered: { length: 0 } };
  player.mediaSource = { readyState: "open", endOfStream: vi.fn() };
  player.sendIntegrity = vi.fn(async () => {});
  player.append = vi.fn(async () => {});
  return player;
}
describe("protected seeking", () => {
  it("selects each track by time and loads the target instead of the old next segment", async () => {
    const player = runtime();
    player.loading = true;
    player.onSeeking();
    expect(player.cursors).toEqual({ video: 21, audio: 51 });
    player.loading = false;
    await player.fillBuffer();
    expect(player.append.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ["video", 0, 21],
      ["audio", 0, 51],
    ]);
    player.video.currentTime = 10;
    player.loading = true;
    player.onSeeking();
    expect(player.cursors).toEqual({ video: 3, audio: 6 });
  });
  it("discards an in-flight pre-seek segment before appending", async () => {
    const player = runtime();
    let finish;
    player.request = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const sourceBuffer = { appendBuffer: vi.fn() };
    const pending = ProtectedSegmentRuntime.prototype.append.call(
      player,
      "video",
      0,
      1,
      sourceBuffer,
    );
    player.generation++;
    finish(new ArrayBuffer(1));
    await pending;
    expect(sourceBuffer.appendBuffer).not.toHaveBeenCalled();
  });
  it("handles exact boundaries and the end of the timeline", () => {
    expect(sequenceAtTime(segments(3, 5000), 5)).toBe(2);
    expect(sequenceAtTime(segments(3, 5000), 15)).toBe(3);
  });
});
