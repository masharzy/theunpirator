# Gateway hardening and startup checks

This update preserves the current player controls and requires a gateway image deployment; it does not require an npm player release.

- Resolve-time index and late-media probes run concurrently for each stream. Both must succeed. This removes a sequential network wait, without removing the late-range check that catches sources which fail after playback starts. It does not establish a measured improvement to total production startup time.
- Index and segment reads enforce exact Content-Range offsets and byte counts. The reader cancels oversized bodies while streaming, including responses without Content-Length, instead of allocating an unbounded response before checking its size. Indexes are limited to 1 MiB and segments to 16 MiB.
- Session-state HTTP failures deny playback with a temporary service error. They cannot silently pass the session check.
- Integrity service overload (429) and server failures return a recoverable 503. Actual integrity denial remains 403. No failed integrity request is treated as successful.

Validation includes source fallback with concurrent probes, oversized and truncated streams, incorrect byte offsets, session-service failure, and integrity failure status handling. Live startup latency and downloader resistance still require deployment and real-browser testing; these tests do not establish a security percentage or download prevention guarantee.

For startup measurement, correlate the existing `playback-timing` source-resolve and manifest-indexes logs with browser session/bootstrap timing and time to first decoded frame. Do not log playback tokens, provider proofs, signed media URLs, or encryption keys.

## Startup follow-up

The resolver remembers its last fully validated profile and region for ten minutes within each gateway process. Subsequent resolutions try that combination first, with every original fallback retained. This stores no media URL or user proof and still requires fresh source validation. A cold process has no preference; this change alone does not guarantee fast first playback.

Gateway responses now include `Server-Timing: gateway;dur=...`. Startup request logs include request ID, path, status and total gateway duration. Separate `youtube-create`, `youtube-integrity`, and `source-profile` log entries distinguish upstream verification and resolver attempts. Routine fast playback integrity calls are not logged individually. Compare these values with DevTools request duration before attributing delays to any particular service.

The control API reads playback entitlements and feature flags once per session creation (two queries instead of seven on the on-demand YouTube path). This request-local snapshot preserves global kill switches, tenant opt-ins and subscription checks; subsequent requests read the policy again. Session-create timing starts after API-key authentication and excludes the customer's backend, so the customer's endpoint duration must not be attributed entirely to this service. This change requires the control API deployment as well as the gateway image update.
