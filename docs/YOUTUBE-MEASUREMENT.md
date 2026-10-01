# YouTube playback measurement (local, stable-IP test)

This is the Phase 0 measurement run. Everything happens on this machine —
resolve and byte fetches both come from **one stable residential IP**, which is
exactly the topology that empirically works (bunny container ✅, local ✅,
rotating cloud IPs ❌).

## What changed in the gateway (already deployed to the Worker too)

1. **Shared youtube sources** — one resolve per workspace+asset serves every
   viewer (KV `source:yt:v3:{tenant}:{asset}`). The 100th student costs the
   same as the 1st.
2. **Self-healing playback** — a googlevideo 403/410 mid-session now fails
   fast, force re-resolves once, and retries the chunk instead of killing
   playback (log line: `"code":"SOURCE_RE.RESOLVE"`).
3. Existing behaviour unchanged: browser BotGuard PO tokens (KV 8h), 6 client
   profiles × 2 regions, profile preference memory, expire-aware TTLs.

## Run the local stack

```powershell
docker compose up -d postgres redis
node scripts/setup-local.js        # seeds local env/keys if not already done
pnpm db:migrate                    # local DB (pass DATABASE_URL to local docker DB)
pnpm --filter @unpirator/api dev            # control API  :4100
pnpm --filter @unpirator/dashboard dev      # dashboard    :3100
pnpm --filter @unpirator/media-gateway start:node   # gateway node :8787
```

`GATEWAY_PUBLIC_URL` for this test must be `http://localhost:8787` so the
player hits the local gateway. `YOUTUBE_CUSTOM_GLOBAL=true` + the tenant's
`youtube_custom` flags must be on (setup-local defaults the env flag; enable
the tenant/global feature flags from the admin console if needed).

## Measure (2 viewers, same video)

1. Open the player as **viewer A** (first time this video plays today).
   Watch the gateway console for:
   - `phase: "source-profile"` lines (one per client/region attempt)
   - `phase: "source-resolve"` — total resolve time
   - `phase: "manifest-indexes"` — sidx/index build time
     Record: **cold start = resolve + manifest + first chunk.**
2. Open the same video as **viewer B** (different browser/incognito).
   Expect: **no new `source-resolve` line** — the shared source is reused;
   only `manifest-indexes` + first chunk run.
   Record: **warm start.**
3. Play A to completion (or 5+ minutes). If a chunk 403s, you should see
   `SOURCE_RE.RESOLVE` and playback should continue instead of dying.

## Pass criteria

| Metric                         | Target                                |
| ------------------------------ | ------------------------------------- |
| Warm start (shared source hit) | < 1 s to first bytes                  |
| Cold resolve (healthy IP)      | ≤ 4 s                                 |
| Mid-session URL death          | playback survives (SOURCE_RE.RESOLVE) |
| Second viewer resolve count    | 0                                     |

## Reading results honestly

- If cold resolve stays > 8 s even locally, the delay is the client-chain /
  attestation, not the IP — capture the `source-profile` lines and bring them
  back (the fix is then client order / PO-token minting, not hosting).
- This PC run mirrors the future always-on box (same code, same single-IP
  invariant). When 24/7 is needed: Oracle Always Free (10 TB egress) or a
  Bunny container — funded by the first customers' plan fees.
