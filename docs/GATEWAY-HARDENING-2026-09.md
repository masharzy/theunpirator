# Gateway hardening and startup checks

This update preserves the current player controls and requires a gateway image deployment; it does not require an npm player release.

- Resolve-time index and late-media probes run concurrently for each stream. Both must succeed. This removes a sequential network wait, without removing the late-range check that catches sources which fail after playback starts. It does not establish a measured improvement to total production startup time.
- Index and segment reads enforce exact Content-Range offsets and byte counts. The reader cancels oversized bodies while streaming, including responses without Content-Length, instead of allocating an unbounded response before checking its size. Indexes are limited to 1 MiB and segments to 16 MiB.
- Session-state HTTP failures deny playback with a temporary service error. They cannot silently pass the session check.
- Integrity service overload (429) and server failures return a recoverable 503. Actual integrity denial remains 403. No failed integrity request is treated as successful.

Validation includes source fallback with concurrent probes, oversized and truncated streams, incorrect byte offsets, session-service failure, and integrity failure status handling. Live startup latency and downloader resistance still require deployment and real-browser testing; these tests do not establish a security percentage or download prevention guarantee.

For startup measurement, correlate the existing `playback-timing` source-resolve and manifest-indexes logs with browser session/bootstrap timing and time to first decoded frame. Do not log playback tokens, provider proofs, signed media URLs, or encryption keys.
