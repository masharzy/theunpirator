# Web-Chat Handoff for Opus (no PC access, paste-based workflow)

Opus 5 will be used in **web chat only** — it cannot touch this PC, run
commands, see logs, or read the repo. It only sees what you paste and answers
with code you apply locally. This file defines the whole workflow.

## The division of labor

| Who | Does what |
|---|---|
| Opus (web chat) | reads pasted code, writes exact code changes |
| You (owner) | paste files/results to Opus, test on laptop + phone — final judge |
| Helper AI on this PC (optional, e.g. ZCode) | applies Opus's changes, rebuilds bundle, deploys, runs the browser gate, pastes results back for you to forward |

## Session pattern: one task per chat

Opus's memory lives only inside one chat. Per task: start a fresh chat →
paste the STATE DIGEST (section 4) → paste the files for that task (section 5)
→ work the task → apply + verify locally → start the next chat.

Never paste all files "up front" — paste only what the task needs.

## 1. SESSION 1 starter prompt (copy-paste this whole block)

```
You are taking over playback engineering for the-unpirator, an anti-piracy
video-protection SaaS (pnpm monorepo: Express API on Vercel, a media gateway
on a Windows PC behind a tunnel, a Cloudflare Pages demo + same-origin /gw
proxy, a custom MSE player with an encrypted-chunk Web Worker).

You have NO tool access. I can only paste text to you and paste your answers
back into my machine. Therefore:
- Never invent code you have not seen. If you need a file, ask me to paste it.
- Output every change as a complete replacement block: file path, then the
  enclosing function or section copied exactly as it currently is (so I can
  locate it), then the full replacement code. No vague diffs, no "...".
- We work ONE task per chat. I will paste a STATE DIGEST at the start of each
  chat; read it before answering.
- Deployment and testing happen on my side. After you give code, I will paste
  back: the browser-gate output (a Playwright script result), relevant gateway
  log lines, and my phone/laptop observations. You iterate on evidence, never
  on assumptions.
- Do not claim a fix works. Say what to run and what result proves it.

Hard constraints (breaking these killed playback before):
1. The playback JWT TTL is 600s (apps/api/src/services/playback.js tokenTtl)
   and the gateway verifier rejects exp-iat > 900s (workers/media-gateway/src/
   token.js). If you change either, change both in the same answer and remind
   me to re-verify with a fresh session.
2. The player bundle demo/unpirator-player.js is a LOCAL esbuild build —
   never suggest esm.sh.
3. MSE appends for one SourceBuffer are serial; only network fetches may run
   in parallel.
4. Seek must move the session playback window (integrity POST with
   positionSeconds) BEFORE ticketing, or every ticket is denied
   (sequence_out_of_window).
5. The gateway's secure-browser check rejects non-Chromium UAs and download
   managers on attestation routes. YouTube's jnn attestation calls use a
   pinned desktop UA — viewer UA must not be forwarded there.

Confirm you understand, then ask me for the files for the first task
(seek latency, see section 5 of docs/PLAYER-FIX-PLAN.md which I will paste
next).
```

Then paste: `docs/PLAYER-FIX-PLAN.md` (183 lines) and `docs/OPUS-HANDOFF.md`
(185 lines) in the same chat.

## 2. Task → files to paste (line counts in brackets)

| Task | Paste these files |
|---|---|
| P2 Seek latency | `packages/player/src/index.js` [1632], `workers/media-gateway/src/session-state.js` [284], `workers/media-gateway/src/protected-media.js` [330] |
| P3 Resilience (timeouts, queue jam, batch loss) | `packages/player/src/index.js` [1632] |
| P4 Adaptive bitrate | `packages/player/src/index.js` [1632], `packages/player/src/player-experience.js` [1444 — only the settings/quality parts, can paste later if Opus asks] |
| P5 Cloudflare Tunnel swap | `demo/_worker.js` [90] + plan section; mostly a config/infra task, little code |
| P6 Mobile attestation | `workers/media-gateway/src/youtube-attestation.js` [183] + pasted GENERATE_IT_* log lines |
| Fixes in session/token logic | `workers/media-gateway/src/token.js` [63], `apps/api/src/services/playback.js` [632 — or just the session-create function Opus asks for] |

The two big files (player 1632, experience 1444) are fine for Opus's context —
paste them whole, once per chat, and work many turns inside that chat.

## 3. The verification loop (what to run and paste back)

On the PC (ask the helper AI, or run yourself in git-bash from the repo root):

1. Rebuild + deploy the demo after player changes (exact commands:
   PLAYER-FIX-PLAN.md section 5).
2. Browser gate:
   `node scripts/browser-demo-test.mjs`
   → paste the JSON output (polls, errors).
3. Gateway log tail:
   `tail -40 /tmp/gw.log`
   → paste lines with `"code"` or `"status"` >= 400.
4. Phone test: what Opus changed, test exactly that on mobile Chrome.

Paste all of that back into the same Opus chat and let it iterate.

## 4. STATE DIGEST template (paste at the start of EVERY new Opus chat)

```
STATE DIGEST (2026-10-03):
- Working: MP4 native, HLS protected_hls, YouTube protected_segments on
  desktop Chrome. Mobile YouTube: unverified after pinned-UA fix.
- Broken/weak: seek resume 3-15s; long-session buffering; no adaptive
  bitrate; Bunny demo asset dead upstream (needs new embed URL, not code).
- Infra: gateway on the PC (node, port 8787) behind permanent ngrok
  (companion-saga-conjuror.ngrok-free.dev); API on Vercel; demo on
  Cloudflare Pages (theunpirator-demo.pages.dev). All free tier.
- Token pair: API 600s / gateway ceiling 900s — in sync, verified.
- Player bundle: local esbuild -> demo/unpirator-player.js (committed).
- Deploy flow: git push = Vercel; `npx wrangler pages deploy demo
  --project-name theunpirator-demo --commit-dirty=true` = demo; gateway
  restart on the PC for gateway changes.
- Diagnostics: `globalThis.__unpiratorPlayers` in the page; console prefixes
  `[unpirator]` and `[unpirator-w]`; gateway log /tmp/gw.log.
- Last completed task: <fill in>
- Current task: <fill in>
```

## 5. Rules for the owner

- One task per chat, small steps, test on your phone after each deploy.
- If Opus suggests anything that touches the token TTL pair or esm.sh, stop
  and re-read the constraints above.
- Keep this digest updated after every accepted change — it is the memory
  that travels between chats.
