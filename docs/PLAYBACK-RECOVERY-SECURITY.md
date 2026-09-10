# Playback recovery and gateway limits

Deploy the matching gateway image before installing `@unpirator/react@0.1.5`
or `@unpirator/web-component@0.1.4` (player/SDK 0.1.4).

## Customer integration

Existing component props remain unchanged. Protected playback displays a quality
selector and Reload video button. Switching quality keeps the timeline position;
fetching the new quality can require a short buffer refill. Native fullscreen
video controls may hide the surrounding quality menu; exit fullscreen to use it.

The server bootstrap endpoint must reauthenticate and check course/content access
on every call, including reloads. Keep API keys server-side. `getAccessToken` or
`getHeaders` callbacks should return fresh customer authentication credentials.
Do not cache an old bootstrap response indefinitely.

Expired chunk/integrity tokens are refreshed and retried once. Concurrent refresh
requests share one operation. If the refresh credential itself has expired, the
player calls the authenticated bootstrap endpoint again, restores the position,
and preserves pause. Reload video requests playback explicitly. A revoked/blocked
403 response is terminal and cannot trigger automatic reauthorization.

Recoverable failures display an in-player message and reload action. Fatal access
failures still reach `onError`. This prevents consumer error handlers from removing
the player during a recoverable network/token interruption.

## Gateway protections

- Redis session validation, counters, ticket creation/consumption and revocation
  use optimistic transactions with an atomic Lua commit. Concurrent changes are
  retried with fresh state. Contention fails closed with 429.
- Tickets remain single-use and expire after 20 seconds. A session may mint 180
  tickets/minute, with at most 8 attempts per track/variant/segment per minute.
  This replaces the lifetime retry cap, allowing repeated backward seeks later.
- Each session has at most 4 upstream chunk fetches in flight and a 128 MiB/minute
  byte budget, charged before fetching. Failed fetches still count toward the
  byte budget. Oversized or invalid ranges are rejected.
- Fetch leases expire after 60 seconds; an upstream fetch/retry sequence has a
  45-second timeout. These limits bound abuse; they do not make downloads impossible.
- Non-exportable AES keys are unwrapped inside a worker without a JavaScript raw
  AES key buffer. Old media buffers are removed as playback moves forward.

Check these budgets against actual source bitrates before supporting higher-bitrate
content. They are safeguards, not a guarantee against IDM, extensions or XSS.

## Startup and verification

Manifest indexes are fetched in parallel instead of sequentially. Concurrent
source/manifest requests within one gateway process share work per session; user
authorization and encryption keys are not shared across sessions. RSA preparation
overlaps browser attestation. Source range probes and origin restrictions remain.
`playback-timing` logs report source-resolve and manifest-index durations without
logging signed URLs, keys or authorization tokens. No production startup speedup
percentage is claimed without before/after measurements.

Run unit tests and `node scripts/verify-protected-seek.mjs` for real Chrome/MSE,
encrypted worker playback, seek, quality switching, expiry recovery and reload.
The browser test requires ffmpeg and Chrome and uses synthetic media.
The Redis concurrency test uses `TEST_REDIS_URL` (or CI's `REDIS_URL`) or dedicated
`TEST_UPSTASH_REDIS_REST_URL` and `TEST_UPSTASH_REDIS_REST_TOKEN`. It creates isolated
random test keys and deletes only those keys afterward.
