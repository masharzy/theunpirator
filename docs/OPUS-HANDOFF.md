# Opus Handoff — The Unpirator Player/Streaming Fix

You are taking over playback engineering for **the-unpirator** — an
anti-piracy content-protection SaaS for Bangladeshi edtech. A previous AI
worked on this for 2 days and repeatedly failed the same way: declaring fixes
done without real-browser verification, and changing one side of a
cross-service pair without checking the other. The repo owner lost trust. This
document gives you everything: state, files, constraints, tasks, your own
limitations, and the verification discipline you MUST follow. The repo owner
speaks Bangla/Banglish; he tests every change personally on his laptop and
Android phone. He is the final judge of "done".

Repo: `F:\projects\the-unpirator` — pnpm monorepo, Node 24, Windows 10 dev PC.

## 1. Mission

Protected video playback must feel native-smooth: start fast, seek fast, never
randomly interrupt, on desktop AND mobile Chrome, through this exact chain:

```
viewer browser → Cloudflare Pages (demo + /gw proxy)
  → Vercel API (session create; ed25519 playback JWT, TTL 600s)
  → permanent ngrok tunnel → local gateway on the dev PC (port 8787)
      → YouTube/Bunny/S3 source → encrypted per-viewer chunks back
```

Current quality bar: MP4 and HLS sections play fine. YouTube section plays on
desktop Chrome but had ATTESTATION_RESPONSE_INVALID on mobile (fix deployed,
needs device verification). Seek resume and long-session buffering are the
main remaining UX problems. Root bandwidth cause: ngrok free routes through a
US edge; every video byte crosses phone→CF→US→BD PC→googlevideo and back.

## 2. Read these files FIRST, in this order

1. `docs/PLAYER-FIX-PLAN.md` — the master plan: system map, hard constraints,
   phased work with acceptance criteria, run commands, and the audit of past
   failures. This is your contract; do not deviate from its constraints.
2. `packages/player/src/index.js` — the player core (MSE pipeline, worker
   bootstrap, ticket/chunk loop, integrity guard, quality switching). Most
   player changes happen here (~1500 lines).
3. `packages/player/src/segment-timeline.js` — segment time math (13 lines).
4. `packages/player/src/player-experience.js` — custom controls UI (desktop
   hover-show, mobile tap-show, gestures).
5. `packages/web-component/src/index.js` — custom element mount logic; the
   `__unpiratorPlayers` debug hook lives here.
6. `workers/media-gateway/src/token.js` — JWT verification. **TTL ceiling is
   900s and must stay >= the API's `tokenTtl` (600s, in
   `apps/api/src/services/playback.js`). Breaking this pair killed ALL
   playback once.**
7. `workers/media-gateway/src/session-state.js` — "Durable Object" session
   state: playback windows, single-use tickets, rate limits (600/min).
8. `workers/media-gateway/src/index.js` — gateway routes, origin checks,
   secure-browser check, attestation/ticket/chunk handlers.
9. `workers/media-gateway/src/youtube-attestation.js` — BotGuard Create/
   GenerateIT calls (pinned desktop UA; failure diagnostics already added —
   GENERATE_IT_UNPARSEABLE / GENERATE_IT_NO_TOKEN log the raw response).
10. `workers/media-gateway/src/protected-media.js` — playback windows math,
    chunk encryption, sidx parsing.
11. `workers/media-gateway/src/source.js` — source resolution + shared
    per-workspace YouTube source cache.
12. `workers/media-gateway/src/node-server.js` + `node-bindings.js` — the PC
    runtime (node adapter; DO shims over Upstash Redis).
13. `apps/api/src/services/playback.js` — session creation, device limits,
    tokenTtl (600).
14. `demo/_worker.js` — Cloudflare Pages worker: `/api/unpirator/playback`
    proxy + `/gw/*` same-origin gateway proxy (rewrites playbackUrl; forwards
    user-agent; adds ngrok-skip-browser-warning).
15. `demo/index.html` + `demo/unpirator-player.js` — the demo page and the
    BUILT player bundle (esbuild output; committed).

## 3. What you will solve (priority order)

### P1 — Verification harness (do BEFORE any code change)

Extend `scripts/browser-demo-test.mjs` (exists: Playwright, channel:"chrome",
headless) into the acceptance gate: for each live section (YouTube
protected_segments, MP4 native, HLS protected_hls) measure time-to-first-frame,
10-minute stall count, seek-resume time (+60s, +300s), and any "Playback
interrupted". Read inside the closed shadow via `globalThis.__unpiratorPlayers`
(already wired). Acceptance: TTF < 6s, seek-resume < 5s, zero interrupts,
stalls > 2s max 3 per 10 min. EVERY later step is only "done" when this passes
on the deployed demo. Never report done from curl alone.

### P2 — Seek latency (target: resume <= 2.5s)

`onSeeking` (packages/player/src/index.js) already awaits an integrity POST to
move the session playback window before ticketing — that ordering is
load-bearing, keep it. Reduce the serial cost: add an optional
`positionSeconds` to the gateway `POST /v/:id/ticket` (index.js → session-
state.js) so the window moves inline with the ticket (reuse `playbackWindows`
from protected-media.js; the claim rides inside the signed session, trust
level unchanged). Also speculatively start fetching when the scrubber position
settles >300ms during drag (seek-intent), and keep parallel prefetch (3 per
track) that already exists in fillBuffer.

### P3 — Streaming resilience

- `callWorker` timeout 60s → 15s (tickets) / 25s (chunks), one same-request
  retry before failing.
- `dispatchIntegrity` (packages/player/src/index.js) must race a 10s timeout
  and DROP on timeout — today it chains promises (`integrityQueue`) and one
  hung dispatch jams the queue, which stops window updates and starts denying
  tickets.
- fillBuffer's parallel batch discards fetched bytes if an earlier item fails
  (the `break` loop after Promise.allSettled) — append what succeeded, retry
  the rest.

### P4 — Adaptive bitrate (biggest UX win on the slow tunnel)

EWMA throughput from worker chunk timings; downgrade one variant when EWMA <
1.2x current bitrate, upgrade after EWMA > 2x for 10s. Make `setQuality`
buffer-preserving (today it removes the whole buffer; remove only data outside
the live window). Cap auto-upgrade at 720p while on the ngrok path.

### P5 — Remove the US hop (infra, needs the owner)

Preferred: Cloudflare Named Tunnel (`cloudflared`) + a domain on Cloudflare —
free, kills the ngrok US round trip and the interstitial/header dance.
Alternative: the same node gateway on a small VPS; then swap
`UNPIRATOR_GATEWAY_BASE` in the Pages project. This is the only fix for
bandwidth physics; no code change can shorten the path.

### P6 — Mobile attestation validation (needs the owner's phone)

The pinned-UA fix for the jnn API is deployed but unverified on a real phone.
Have the owner run the YouTube section on mobile Chrome; watch the gateway log
for GENERATE_IT_* diagnostics. If it still fails, the logged `preview` field
tells you exactly what YouTube returned.

## 4. Your limitations (be honest with yourself)

1. **You cannot feel the UX.** No device testing. The owner tests on laptop +
   Android phone (mobile data) and is the final judge. Plan your work in
   short deploy cycles so he can test often; never batch big changes.
2. **You cannot observe the gateway live unless you run on this PC** (Claude
   Code with shell). The gateway log is at `/tmp/gw.log` (git-bash path
   `C:\...\tmp\gw.log`), the gateway is a detached node process on port 8787.
   If you run from web chat, you must ask the owner to paste logs — slow loop,
   so prefer Claude Code on this machine.
3. **YouTube's jnn API is adversarial and moving** — it is not documented, and
   its behavior differs by UA, IP reputation, and time. Never "fix" it from
   spec; use the diagnostics logs and the known-good constants already in
   youtube-attestation.js (REQUEST_KEY, API key, endpoints).
4. **Bandwidth physics is not a code problem** — P5 is the only cure. Do not
   promise smooth 1080p through the tunnel.
5. **You share the previous AI's failure mode**: optimism under pressure. The
   mitigation is mechanical: no "done" without the P1 gate passing plus a live
   cross-service probe (fresh session → gateway route with the new token).
6. **Two secrets files are local-only** (gitignored):
   `apps/api/.env.gateway-local` (gateway env) and repo-root `.env` (Neon DB +
   API secrets). Never print them, never commit them. `.env` points at
   PRODUCTION Neon — never run migrations against it without asking.

## 5. Rules of engagement

- One step at a time; after each deploy, run the P1 gate and a live
  cross-service probe, then hand the owner a one-paragraph summary + what to
  test on his phone.
- If you must change the token TTL pair (600/900), change both sides in one
  commit and re-verify with a fresh session before deploying.
- The player bundle `demo/unpirator-player.js` must be rebuilt after any
  packages/player or packages/web-component change (command in the plan file
  section 5) and the demo redeployed, or you are testing stale code — this
  exact mistake cost two days.
- Keep `globalThis.__unpiratorPlayers` and the console diagnostics
  (`[unpirator]` / `[unpirator-w]` prefixes) — the owner's support loop
  depends on them.
- Deploy targets: git push (Vercel for apps/api + apps/dashboard), `npx
  wrangler pages deploy demo --project-name theunpirator-demo
  --commit-dirty=true` for the demo, gateway restart on the PC for
  workers/media-gateway changes. All free tier.

## 6. Current known-good state (verify, don't assume)

- MP4 (native) and HLS (protected_hls) sections: playing smoothly on both
  devices.
- YouTube (protected_segments): playing on desktop Chrome (mount ~17-20s due
  to BotGuard); mobile unverified after the pinned-UA fix (commit 309124b).
- Token pair: API 600s / gateway 900s — verified accepting tokens (commit
  7eac9ba).
- Bunny demo asset is dead upstream (the video was deleted from Bunny Stream;
  embed page returns HTTP 200 with a 404 page inside → BUNNY_PLAYLIST_NOT_
  FOUND). Needs a new embed URL from the owner — nothing to fix in code.
- Gateway + tunnel run on the dev PC; if the PC sleeps or restarts, both must
  be started again (commands in PLAYER-FIX-PLAN.md section 5).
