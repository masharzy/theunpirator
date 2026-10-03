# The Unpirator — Player Fix Plan (handoff document)

Audience: an engineer or AI (e.g. Claude) taking over player/playback work on
this repo. Everything below is self-contained. Repo: `F:\projects\the-unpirator`
(pnpm monorepo, Node 24, Windows dev machine).

## 1. System map (what talks to what)

```
viewer browser
  └─ demo page https://theunpirator-demo.pages.dev (Cloudflare Pages, demo/_worker.js)
       ├─ POST /api/unpirator/playback → Pages worker → Vercel API (apps/api)
       │    └─ creates playback session, returns { token (ed25519 JWT, TTL 600s), playbackUrl }
       │       playbackUrl is rewritten by the Pages worker to /gw/... (same origin)
       └─ player (demo/unpirator-player.js — LOCAL esbuild bundle, NOT esm.sh)
            ├─ worker (blob URL, in packages/player/src/index.js segmentWorkerRuntime)
            │    POST /gw/v/{asset}/bootstrap | /attestation/* | /ticket | GET /gw/.../chunk/*
            └─ /gw/* is proxied by demo/_worker.js → permanent ngrok tunnel
                 → local gateway on the dev PC (workers/media-gateway/src/node-server.js, port 8787)
                      ├─ verifies JWT (workers/media-gateway/src/token.js)
                      ├─ session state in "Durable Object" shim (session-state.js, Redis-backed)
                      ├─ resolves YouTube via innertube + browser BotGuard (youtube-attestation.js)
                      └─ fetches googlevideo bytes from the PC's IP and re-serves encrypted chunks
```

Modes per asset: `native` (direct stream, MP4 section), `protected_hls`
(hls.js over sealed playlists), `protected_segments` (MSE + encrypted chunks —
used by the YouTube section and the "HLS" demo section).

## 2. Current verified state (2026-10-03)

Working: MP4 native playback, HLS protected playback, YouTube protected
playback on desktop Chrome. Token TTL 600s (apps/api/src/services/playback.js
`tokenTtl = 600`) and gateway ceiling 900s (workers/media-gateway/src/token.js
`exp - iat > 900`) — these two MUST stay in sync or all playback dies with
INVALID_TOKEN (this exact outage happened once already).

Known remaining problems, in priority order:

1. **Seek takes too long to resume** (3–15s). Two compounding causes:
   a. Bandwidth: every chunk crosses phone→CF→ngrok US edge→PC→googlevideo.
      A 4s 720p segment is 1.5–2MB; initial post-seek fetch must complete
      before a frame renders. Default variant is now 360/480p
      (`chooseVideoVariant` in packages/player/src/index.js) which helps ~4x.
   b. Protocol overhead: seek → integrity POST (moves the session playback
      window) → then ticket+chunk. The integrity round trip is serial before
      the first byte. Could be merged: allow the ticket endpoint to accept a
      trusted position claim, or pre-warm the window before the user releases
      the scrubber (seek-preview intents).
2. **Intermittent mid-play buffering** during long sessions — single pending
   request timeout is 60s (`callWorker`) and retries are limited; a slow chunk
   blocks the whole per-track pipeline (appends are serial per SourceBuffer by
   design, but fetches are parallel now — a slow fetch stalls that track's
   batch, and `loading` stays true until the batch settles).
3. **No adaptive bitrate**: quality only changes manually
   (`player.protected.setQuality`). Switching quality tears down the buffer
   (`setQuality` removes the whole buffer). Needs smooth ABR (estimate
   throughput from chunk timings, switch at segment boundaries with
   `changeType` codec check that already exists).
4. **BotGuard attestation fragility**: `createYoutubeIntegrityToken` (youtube-
   attestation.js) fails when YouTube returns 200-without-token
   (ATTESTATION_RESPONSE_INVALID). Viewer UA was removed from jnn calls (pinned
   desktop UA now) — mobile failures suspected from this, needs on-device
   verification. On failure the player shows the error once with no automatic
   retry; add a bounded retry (2 attempts, 1s apart) before surfacing.
5. **Integrity heartbeat queue can jam**: `sendIntegrity` chains promises
   (`integrityQueue`); each dispatch goes through `callWorker` with a 60s
   timeout. If one dispatch hangs, later ones queue behind it and the session
   window stops moving → tickets start failing. Make dispatchIntegrity
   race a 10s timeout and drop (not queue) on timeout.

## 3. Hard constraints (do not break)

- `verifyPlaybackToken` ceiling (900s) >= API `tokenTtl` (600s). If either
  changes, verify the pair end-to-end before deploying.
- The player's Web Worker fetches need `credentials: "include"` and the
  gateway checks `Origin` against verified site domains; the demo proxies /gw
  same-origin so the worker never touches ngrok directly.
- Gateway `assertAllowedProtectedBrowser` rejects non-Chromium UAs and
  download managers on attestation routes — keep.
- MSE appends for one SourceBuffer must stay serial; only network fetches may
  be parallel.
- Session playback windows (`session-state.js`): tickets are denied outside
  the window; the window moves via integrity reports carrying positionSeconds.
  Any seek path must move the window BEFORE ticketing (onSeeking already
  awaits sendIntegrity — keep that ordering).

## 4. Work plan (ordered, each step has acceptance criteria)

### Step 1 — Verification harness first (do this before any code change)

`scripts/browser-demo-test.mjs` exists (Playwright + channel:"chrome",
headless). Extend it into the acceptance gate:

- Launch against the deployed demo; for each of the 3 live sections measure:
  - time from play() to first frame (currentTime > 0 && readyState >= 2)
  - 10-minute playback: count stalls > 2s, any "Playback interrupted"
  - seek +60s and +300s: seconds until currentTime advances again
  - expose `globalThis.__unpiratorPlayers` (already added) for closed-shadow
    access; keep this hook
- Gate: fail the run if TTF > 6s, seek-resume > 5s, any interrupt, or any
  stall > 2s more than 3 times.
- Every later step is only "done" when this passes. No curl-only claims.

### Step 2 — Seek latency (protocol)

- Goal: seek resume <= 2.5s through the current tunnel.
- Change: in `onSeeking` (packages/player/src/index.js) the integrity round
  trip is already awaited before fetching. Reduce its cost: batch the
  integrity POST and the first ticket POST so the gateway can process the
  window move and the ticket in one round trip. Server side: extend the
  gateway `POST /v/:id/ticket` to accept an optional `positionSeconds` claim;
  when present, compute the window inline (reuse `playbackWindows`) and allow
  that ticket without waiting for a prior integrity call. The claim is still
  inside the signed-token session, so trust level is unchanged.
- Also start the fetch for the seek-target segment speculatively at
  seek-intent (scrubber drag) if the position settles for >300ms.

### Step 3 — Streaming resilience

- `callWorker` timeout 60s → 15s for tickets, 25s for chunks; on timeout,
  retry the same request once before failing (idempotent: tickets are
  single-use but re-mintable up to the replay limit).
- Make `dispatchIntegrity` race a 10s timeout; on timeout drop the queued
  entry and log, so the queue cannot jam.
- fillBuffer: when a batch item fails, keep already-fetched items (currently
  discarded if an earlier item fails after parallel fetch — see the
  `for (index...) break` loop) — append what you have, retry the rest.

### Step 4 — Adaptive bitrate (biggest UX win on slow paths)

- Track EWMA of chunk throughput (bytes/duration from the worker responses).
- Auto-downgrade one variant when EWMA < 1.2x the current variant's bitrate;
  upgrade one variant when EWMA > 2x for 10s. Reuse `setQuality` (already
  does changeType + integrity) but make it buffer-preserving: only remove
  buffered data outside the current playback window instead of the whole
  buffer.
- Cap auto-upgrade at 720p while streaming through the ngrok tunnel; remove
  the cap when the gateway moves to a datacenter.

### Step 5 — Infra: remove the US hop

- Preferred: Cloudflare Named Tunnel (`cloudflared` on the PC) + a domain on
  Cloudflare (free tier OK, e.g. a cheap .dev/.com or an existing one). This
  keeps the path phone→CF edge→PC without the ngrok US round trip, and
  replaces the ngrok interstitial/header dance entirely.
- Alternative (first customer): run the same node gateway on a small VPS
  (BD or SG region), swap `UNPIRATOR_GATEWAY_BASE` in the Pages project.
- Acceptance: seek resume <= 2s, 1080p playback sustainable.

### Step 6 — Mobile attestation validation

- From a real mobile Chrome, run YouTube section; watch gateway logs for
  GENERATE_IT_* diagnostics (added in youtube-attestation.js). If mobile still
  fails with the pinned UA, capture `preview` from the log and treat
  accordingly (likely a YouTube error JSON → handle/ignore that code).

## 5. How to run things on this PC

- Gateway (must be running for playback): from repo root,
  `node --env-file=apps/api/.env.gateway-local workers/media-gateway/src/node-server.js`
  (log goes to stdout; it runs detached in a normal shell).
- Tunnel: `%USERPROFILE%\bin\ngrok.exe http 8787 --domain=companion-saga-conjuror.ngrok-free.dev`
- Player bundle rebuild after ANY package/player or packages/web-component
  change: `node -e "require('F:/projects/the-unpirator/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/lib/main.js').build({entryPoints:['packages/web-component/src/index.js'],bundle:true,format:'esm',outfile:'demo/unpirator-player.js'})"`
  then `npx wrangler pages deploy demo --project-name theunpirator-demo --commit-dirty=true`
- API changes deploy via git push (Vercel, apps/api root dir). Gateway changes
  on the PC need a gateway restart; the CF worker copy deploys separately.

## 6. Past failure modes to avoid (audit of 2026-10-02/03)

1. Curl-only verification while the browser failed differently — always run
   the browser gate (Step 1) before claiming done.
2. Changing one side of a pair without checking the other (token TTL vs
   gateway ceiling — caused a full outage; viewer UA vs YouTube jnn API).
3. The demo once ran a STALE esm.sh bundle ("o is not a function", missing
   controls). The local esbuild bundle is now the source of truth — never go
   back to esm.sh without bumping the published package.
4. Player mounted 3x per page load (upgrade attribute callbacks), creating 3x
   sessions/devices and ghost integrity guards — fixed via connected-flag in
   the web component; keep that guard.
5. One network blip killing playback via `.catch(this.fail)` — heartbeats,
   keep-alive pings and single pump failures must warn-and-retry, not fail.
