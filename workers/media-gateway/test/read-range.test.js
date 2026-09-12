import { describe, expect, it, vi } from "vitest";
import { readRange } from "../src/read-range.js";

const range = { start: 10, end: 13 };
const read = (response) => readRange(response, range, 16, "MEDIA_SEGMENT_INVALID");
const headers = { "content-range": "bytes 10-13/100" };

describe("bounded origin ranges", () => {
  it("accepts exact streamed bytes without content-length", async () => {
    const body = await read(new Response(new Uint8Array([1, 2, 3, 4]), { headers }));
    expect([...new Uint8Array(body)]).toEqual([1, 2, 3, 4]);
  });
  it("cancels an oversized stream before reading the rest", async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(5));
        },
        cancel,
      }),
      { headers },
    );
    await expect(read(response)).rejects.toMatchObject({ code: "MEDIA_SEGMENT_INVALID" });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects truncation and mismatched offsets", async () => {
    await expect(read(new Response(new Uint8Array(3), { headers }))).rejects.toThrow();
    await expect(
      read(
        new Response(new Uint8Array(4), {
          headers: { "content-range": "bytes 0-3/100" },
        }),
      ),
    ).rejects.toThrow();
  });
  it("rejects declared oversized responses without reading their bodies", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { ...headers, "content-length": "1000000000" },
    });
    await expect(read(response)).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
