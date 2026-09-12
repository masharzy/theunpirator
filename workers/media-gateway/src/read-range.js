import { securityError } from "./token.js";

// Bound memory while reading, including responses without Content-Length.
export async function readRange(response, range, limit, code) {
  const size = range.end - range.start + 1;
  const reject = () => securityError(code, 502);
  const declared = response.headers.get("content-length");
  const contentRange = response.headers.get("content-range");
  const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(contentRange || "");
  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > limit ||
    (declared !== null && Number(declared) !== size) ||
    !match ||
    Number(match[1]) !== range.start ||
    Number(match[2]) !== range.end ||
    (match[3] !== "*" && Number(match[3]) <= range.end)
  ) {
    await response.body?.cancel();
    throw reject();
  }
  if (!response.body) throw reject();
  const reader = response.body.getReader();
  const bytes = new Uint8Array(size);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > size - offset) throw reject();
      bytes.set(value, offset);
      offset += value.byteLength;
    }
    if (offset !== size) throw reject();
    return bytes.buffer;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
